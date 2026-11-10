import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMarkdown } from '../scope/markdown.ts';
import { validate } from '../scope/schema.ts';
import type { Issue, ScopeDoc } from '../scope/schema.ts';
import { loadDoc, serve } from './server.ts';
import type { ServerInfo } from './server.ts';
import { clearState, readState, writeState } from './state.ts';

const USAGE = `unfold <명령> <scope.json>

  view <파일> [--no-open]   뷰어를 띄우고 브라우저에서 연다. 파일이 바뀌면 화면이 따라 바뀐다
  check <파일>              형식과 규칙을 검사한다
  snapshot <파일>           지금 상태를 비교 기준으로 잡는다. 이후 바뀐 노드가 화면에 표시된다
  confirm <파일> [--force]  확정한다. 사용자가 아직 보지 않은 AI 추가 항목이 있으면 먼저 알린다
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

function confirm(file: string, force: boolean): void {
  const { doc, issues } = readValid(file);
  printIssues(issues);
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
  clearState(file, 'snapshot.json');
  console.log(`확정했다: ${doc.feature} (노드 ${doc.nodes.length}개)`);
}

async function main(): Promise<void> {
  const [command, fileArg, ...flags] = process.argv.slice(2);
  if (!command || !fileArg) fail(USAGE);
  const file = resolve(fileArg);

  switch (command) {
    case 'serve':
      return serve(file);
    case 'view':
      return view(file, !flags.includes('--no-open'));
    case 'check': {
      const { doc, parseError } = loadDoc(file);
      if (parseError) fail(parseError);
      const issues = validate(doc);
      printIssues(issues);
      const errors = issues.filter((i) => i.level === 'error').length;
      console.log(errors ? `오류 ${errors}개` : `통과 (경고 ${issues.length}개)`);
      process.exit(errors ? 1 : 0);
    }
    case 'snapshot': {
      const { doc } = readValid(file);
      writeState(file, 'snapshot.json', doc);
      // 파일을 건드리지 않고도 열려 있는 화면이 변경 표시를 다시 계산하도록 저장만 다시 한다.
      save(file, doc);
      console.log('비교 기준을 잡았다');
      return;
    }
    case 'confirm':
      return confirm(file, flags.includes('--force'));
    case 'reopen': {
      const { doc } = readValid(file);
      if (doc.status !== 'confirmed') fail('이미 수정 중이다');
      writeState(file, 'snapshot.json', doc);
      doc.status = 'draft';
      delete doc.confirmedAt;
      save(file, doc);
      console.log('수정 중으로 돌렸다. 이후 바뀐 노드가 화면에 표시된다');
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
