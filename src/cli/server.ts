import { readFileSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diff, validate } from '../scope/schema.ts';
import type { ScopeDoc } from '../scope/schema.ts';
import { commit, current, revision, same } from './revisions.ts';
import { clearState, readState, writeState } from './state.ts';

const IDLE_EXIT_MS = 30 * 60 * 1000;

export interface ServerInfo {
  port: number;
  pid: number;
}

export function loadDoc(file: string): { doc?: unknown; parseError?: string } {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { parseError: '아직 파일이 없다' };
  }
  try {
    return { doc: JSON.parse(text) };
  } catch (e) {
    return { parseError: `JSON 을 읽을 수 없다: ${(e as Error).message}` };
  }
}

function payload(file: string) {
  const live = loadDoc(file);
  let rev = current(file);
  if (!rev) {
    // 리비전이 없는 문서(git 에서 막 받았거나 임시 폴더가 비워진 경우)는 작업본이 멀쩡하면 그것을 r1 로 삼는다.
    if (live.parseError) return { file, parseError: live.parseError };
    const issues = validate(live.doc);
    if (issues.some((i) => i.level === 'error')) return { file, doc: live.doc, issues };
    rev = { n: commit(file, live.doc as ScopeDoc), doc: live.doc as ScopeDoc };
  }
  const prev = revision(file, rev.n - 1);
  return {
    file,
    doc: rev.doc,
    issues: validate(rev.doc),
    diff: prev ? diff(prev, rev.doc) : undefined,
    revision: rev.n,
    // 작업본이 화면의 리비전과 다르면 에이전트가 고치는 중이다.
    editing: live.parseError ? true : !same(live.doc, rev.doc),
  };
}

export function serve(fileArg: string): void {
  const file = resolve(fileArg);
  const viewerPath = fileURLToPath(new URL('../viewer/index.html', import.meta.url));
  const clients = new Set<ServerResponse>();
  let idleTimer: NodeJS.Timeout | undefined;

  const armIdle = () => {
    clearTimeout(idleTimer);
    if (clients.size === 0) idleTimer = setTimeout(() => shutdown(), IDLE_EXIT_MS);
  };
  const shutdown = () => {
    clearState(file, 'server.json');
    process.exit(0);
  };

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(viewerPath));
    } else if (url === '/doc') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(payload(file)));
    } else if (url === '/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ file }));
    } else if (url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      armIdle();
      req.on('close', () => {
        clients.delete(res);
        armIdle();
      });
    } else if (url === '/seen' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const ids = JSON.parse(body) as string[];
          const seen = new Set(readState<string[]>(file, 'seen.json') ?? []);
          for (const id of ids) if (typeof id === 'string') seen.add(id);
          writeState(file, 'seen.json', [...seen]);
        } catch {
          /* 잘못된 본문은 무시한다 */
        }
        res.writeHead(204).end();
      });
    } else if (url === '/refresh' && req.method === 'POST') {
      res.writeHead(204).end();
      notify();
    } else if (url === '/stop' && req.method === 'POST') {
      res.writeHead(204).end();
      shutdown();
    } else {
      res.writeHead(404).end();
    }
  });

  let debounce: NodeJS.Timeout | undefined;
  const notify = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      for (const c of clients) c.write('data: change\n\n');
    }, 80);
  };
  // 작업본이 바뀌면 화면에 "수정 중" 표시를 띄우기 위해 지켜본다. 그래프 자체는 리비전이 올라갈 때만 바뀐다.
  // 에디터와 에이전트는 파일을 통째로 바꿔 쓰는 경우가 많아 파일이 아니라 폴더를 지켜본다.
  try {
    watch(dirname(file), (_event, name) => {
      if (!name || name === basename(file)) notify();
    });
  } catch {
    /* 폴더가 아직 없으면 감시 없이 뜬다 */
  }
  // 프록시나 브라우저가 조용한 연결을 끊지 않도록 주기적으로 빈 줄을 보낸다.
  setInterval(() => {
    for (const c of clients) c.write(': keepalive\n\n');
  }, 25000).unref();

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    writeState(file, 'server.json', { port, pid: process.pid } satisfies ServerInfo);
    armIdle();
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
