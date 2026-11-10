import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 문서마다 딸린 임시 상태(뷰어 서버 정보, 비교 기준 스냅샷, 사용자가 본 노드)를 두는 곳.
 * git 에 들어갈 문서 옆을 어지럽히지 않도록 OS 임시 폴더를 쓴다.
 */
export function stateDir(file: string): string {
  const key = createHash('sha1').update(resolve(file)).digest('hex').slice(0, 12);
  const dir = join(tmpdir(), 'unfold', key);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readState<T>(file: string, name: string): T | undefined {
  try {
    return JSON.parse(readFileSync(join(stateDir(file), name), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function writeState(file: string, name: string, value: unknown): void {
  writeFileSync(join(stateDir(file), name), JSON.stringify(value));
}

export function clearState(file: string, name: string): void {
  rmSync(join(stateDir(file), name), { force: true });
}
