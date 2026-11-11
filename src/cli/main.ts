import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMarkdown } from '../scope/markdown.ts';
import { validate } from '../scope/schema.ts';
import type { Issue, ScopeDoc } from '../scope/schema.ts';
import { commit, current, currentNumber, reset, revision, same } from './revisions.ts';
import { loadDoc, serve } from './server.ts';
import type { ServerInfo } from './server.ts';
import { clearState, readState } from './state.ts';

const USAGE = `unfold <명령> <scope.json>

  check <파일>              형식과 규칙을 검사한다
  done <파일>               작성이나 수정을 마쳤다고 알린다. 새 리비전이 되어 화면에 반영된다
  view <파일> [--no-open]   뷰어를 띄우고 브라우저에서 연다. 마지막 리비전을 보여준다
  revert <파일> <번호>      지정한 리비전의 내용으로 되돌린다 (새 리비전으로 기록된다)
  confirm <파일> [--force]  확정한다. 이전 리비전은 모두 지워진다
  reopen <파일>             확정을 풀고 수정 중으로 돌린다
  md <파일>                 읽기용 Markdown 을 출력한다
  stop <파일>               뷰어를 끈다
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function printIssues(issues: Issue[]): void {
  for (const i of issues) console.log(`${i.level === 'error' ? '오류' : '경고'}  ${i.where}: ${i.message}`);
}

/** 형식 오류가 없는 문서만 돌려준다. 오류가 있으면 출력하고 끝낸다. */
function readValid(file: string): { doc: ScopeDoc; issues: Issue[] } {
  const { doc, parseError } = loadDoc(file);
  if (parseError) fail(parseError);
  const issues = validate(doc);
  if (issues.some((i) => i.level === 'error')) {
    printIssues(issues);
    process.exit(1);
  }
  return { doc: doc as ScopeDoc, issues };
}

function save(file: string, doc: ScopeDoc): void {
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

async function ping(info: ServerInfo | undefined, file: string): Promise<boolean> {
  if (!info) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/ping`, { signal: AbortSignal.timeout(500) });
    return ((await res.json()) as { file: string }).file === file;
  } catch {
    return false;
  }
}

/** 떠 있는 뷰어가 있으면 화면을 다시 그리게 한다. */
async function refresh(file: string): Promise<void> {
  const info = readState<ServerInfo>(file, 'server.json');
  if (await ping(info, file)) await fetch(`http://127.0.0.1:${info!.port}/refresh`, { method: 'POST' }).catch(() => {});
}

async function view(file: string, open: boolean): Promise<void> {
  let info = readState<ServerInfo>(file, 'server.json');
  if (!(await ping(info, file))) {
    clearState(file, 'server.json');
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', file], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      info = readState<ServerInfo>(file, 'server.json');
      if (await ping(info, file)) break;
    }
    if (!(await ping(info, file))) fail('뷰어를 띄우지 못했다');
  }
  const url = `http://127.0.0.1:${info!.port}/`;
  if (open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  }
  console.log(url);
}

async function done(file: string): Promise<void> {
  const { doc, issues } = readValid(file);
  printIssues(issues);
  if (doc.status === 'confirmed') fail('확정된 문서다. 고치려면 먼저 reopen 한다');
  const rev = current(file);
  if (rev && same(rev.doc, doc)) {
    console.log(`바뀐 것이 없다. 화면은 r${rev.n} 그대로다`);
    return;
  }
  const n = commit(file, doc);
  await refresh(file);
  console.log(`r${n} 으로 화면에 반영했다`);
}

async function revert(file: string, arg: string | undefined): Promise<void> {
  const n = Number((arg ?? '').replace(/^r/, ''));
  const target = revision(file, n);
  if (!target) fail(`리비전 r${arg ?? ''} 이 없다. 지금은 r1 ~ r${currentNumber(file)} 까지 있다`);
  if (readValid(file).doc.status === 'confirmed') fail('확정된 문서다. 고치려면 먼저 reopen 한다');
  save(file, target);
  const now = commit(file, target);
  await refresh(file);
  console.log(`r${n} 의 내용으로 되돌렸다 (r${now})`);
}

async function confirm(file: string, force: boolean): Promise<void> {
  const { doc, issues } = readValid(file);
  printIssues(issues);
  if (doc.status === 'confirmed') fail('이미 확정된 문서다');
  const rev = current(file);
  if (!rev || !same(rev.doc, doc)) fail('화면에 반영되지 않은 수정이 있다. 먼저 done 을 실행해 사용자가 최신 내용을 보게 한다');
  if (!doc.doneWhen?.length) fail('오류  doneWhen: 확정하려면 완료 기준이 한 줄 이상 필요하다');
  const seen = new Set(readState<string[]>(file, 'seen.json') ?? []);
  const unseen = doc.nodes.filter((n) => n.origin === 'added' && !seen.has(n.id));
  if (unseen.length && !force) {
    console.log('사용자가 화면에서 아직 보지 않은 AI 추가 항목이 있다. 아래 목록을 사용자에게 보여주고 넣을지 뺄지 확인한 뒤,');
    console.log('--force 를 붙여 다시 실행한다.');
    for (const n of unseen) console.log(`  ${n.id} ${n.title}${n.summary ? ` — ${n.summary}` : ''}`);
    process.exit(2);
  }
  doc.status = 'confirmed';
  doc.confirmedAt = new Date().toISOString();
  save(file, doc);
  reset(file, doc);
  await refresh(file);
  console.log(`확정했다: ${doc.feature} (노드 ${doc.nodes.length}개). 이전 리비전은 지웠다`);
}

async function main(): Promise<void> {
  const [command, fileArg, ...rest] = process.argv.slice(2);
  if (!command || !fileArg) fail(USAGE);
  const file = resolve(fileArg);

  switch (command) {
    case 'serve':
      return serve(file);
    case 'view':
      return view(file, !rest.includes('--no-open'));
    case 'check': {
      const { doc, parseError } = loadDoc(file);
      if (parseError) fail(parseError);
      const issues = validate(doc);
      printIssues(issues);
      const errors = issues.filter((i) => i.level === 'error').length;
      console.log(errors ? `오류 ${errors}개` : `통과 (경고 ${issues.length}개)`);
      process.exit(errors ? 1 : 0);
    }
    case 'done':
      return done(file);
    case 'revert':
      return revert(file, rest[0]);
    case 'confirm':
      return confirm(file, rest.includes('--force'));
    case 'reopen': {
      const { doc } = readValid(file);
      if (doc.status !== 'confirmed') fail('이미 수정 중이다');
      doc.status = 'draft';
      delete doc.confirmedAt;
      save(file, doc);
      commit(file, doc);
      await refresh(file);
      console.log('수정 중으로 돌렸다');
      return;
    }
    case 'md':
      console.log(toMarkdown(readValid(file).doc));
      return;
    case 'stop': {
      const info = readState<ServerInfo>(file, 'server.json');
      if (await ping(info, file)) await fetch(`http://127.0.0.1:${info!.port}/stop`, { method: 'POST' }).catch(() => {});
      clearState(file, 'server.json');
      console.log('뷰어를 껐다');
      return;
    }
    default:
      fail(USAGE);
  }
}

main();
