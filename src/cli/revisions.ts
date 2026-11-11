import type { ScopeDoc } from '../scope/schema.ts';
import { clearState, readState, writeState } from './state.ts';

/**
 * 리비전은 "사용자에게 보여줄 준비가 된" 문서의 사본이다.
 * 프로젝트의 scope.json 은 에이전트가 고치는 작업본이고, 뷰어는 항상 마지막 리비전만 그린다.
 * 그래서 고치는 도중의 어중간한 상태가 화면에 나오지 않는다.
 * 사본은 임시 폴더에 두어 git 에 섞이지 않게 하고, 확정하면 모두 지운다.
 */
interface Meta {
  current: number;
}

const name = (n: number) => `r${n}.json`;

export function currentNumber(file: string): number {
  return readState<Meta>(file, 'meta.json')?.current ?? 0;
}

export function revision(file: string, n: number): ScopeDoc | undefined {
  return n > 0 ? readState<ScopeDoc>(file, name(n)) : undefined;
}

export function current(file: string): { n: number; doc: ScopeDoc } | undefined {
  const n = currentNumber(file);
  const doc = revision(file, n);
  return doc ? { n, doc } : undefined;
}

export function commit(file: string, doc: ScopeDoc): number {
  const n = currentNumber(file) + 1;
  writeState(file, name(n), doc);
  writeState(file, 'meta.json', { current: n } satisfies Meta);
  return n;
}

/** 이전 리비전을 모두 지우고 주어진 문서를 r1 로 삼는다. */
export function reset(file: string, doc: ScopeDoc): void {
  for (let n = currentNumber(file); n > 0; n--) clearState(file, name(n));
  writeState(file, name(1), doc);
  writeState(file, 'meta.json', { current: 1 } satisfies Meta);
}

export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
