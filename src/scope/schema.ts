import type { BaseNode, Edge } from '../core/graph.ts';
import { EDGE_KINDS, ID_RE, childrenOf, descendantsOf, parentId } from '../core/graph.ts';

export type Origin = 'requested' | 'assumption' | 'added';
export const ORIGINS: Origin[] = ['requested', 'assumption', 'added'];

export interface ScopeNode extends BaseNode {
  /** requested: 사용자가 요청함 / assumption: 요청 안에서 AI가 정한 값 / added: 요청에 없는데 AI가 넣음 */
  origin: Origin;
  /** 이 동작이 닿는 외부 시스템 */
  touches?: string[];
}

export interface Excluded {
  title: string;
  reason: string;
}

export interface ScopeDoc {
  unfold: 1;
  stage: 'scope';
  feature: string;
  /** 사용자가 쓴 요청 문장 그대로 */
  request: string;
  status: 'draft' | 'confirmed';
  confirmedAt?: string;
  doneWhen?: string[];
  excluded?: Excluded[];
  nodes: ScopeNode[];
  edges: Edge[];
}

export interface Issue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

const CODE_PATTERNS: [RegExp, string][] = [
  [/`/, '백틱으로 감싼 코드'],
  [/[\w\-/]+\.(ts|tsx|js|jsx|mjs|py|go|rs|java|kt|rb|cs|cpp|c|h|sql)\b/, '파일 경로'],
  [/\b[a-z]+[a-z0-9]*[A-Z][A-Za-z0-9]*\b/, 'camelCase 식별자'],
  [/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/, 'PascalCase 식별자'],
  [/\b[a-z]+_[a-z0-9_]+\b/, 'snake_case 식별자'],
  [/\w\(\)/, '함수 호출'],
];

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validate(input: unknown): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message });

  if (!isObj(input)) {
    err('문서', 'JSON 객체가 아니다');
    return issues;
  }
  if (input.unfold !== 1) err('unfold', '1 이어야 한다');
  if (input.stage !== 'scope') err('stage', '"scope" 여야 한다');
  if (!isStr(input.feature)) err('feature', '기능 이름이 필요하다');
  if (!isStr(input.request)) err('request', '사용자의 요청 문장이 필요하다');
  if (input.status !== 'draft' && input.status !== 'confirmed') err('status', '"draft" 또는 "confirmed" 여야 한다');
  if (input.doneWhen !== undefined && !(Array.isArray(input.doneWhen) && input.doneWhen.every(isStr)))
    err('doneWhen', '문장 배열이어야 한다');
  if (input.excluded !== undefined) {
    if (!Array.isArray(input.excluded)) err('excluded', '배열이어야 한다');
    else
      input.excluded.forEach((x, i) => {
        if (!isObj(x) || !isStr(x.title) || !isStr(x.reason)) err(`excluded[${i}]`, 'title 과 reason 이 필요하다');
      });
  }
  if (!Array.isArray(input.nodes)) {
    err('nodes', '배열이어야 한다');
    return issues;
  }
  if (!Array.isArray(input.edges)) {
    err('edges', '배열이어야 한다');
    return issues;
  }

  const ids = new Set<string>();
  const nodes: ScopeNode[] = [];
  input.nodes.forEach((n, i) => {
    if (!isObj(n) || !isStr(n.id)) return err(`nodes[${i}]`, 'id 가 필요하다');
    const at = `노드 ${n.id}`;
    if (!ID_RE.test(n.id)) return err(at, 'id 는 "2", "2.1", "2.1.3" 형식이어야 한다');
    if (ids.has(n.id)) return err(at, 'id 가 중복된다');
    ids.add(n.id);
    if (!isStr(n.title)) err(at, 'title 이 필요하다');
    if (n.summary !== undefined && typeof n.summary !== 'string') err(at, 'summary 는 문자열이어야 한다');
    if (!ORIGINS.includes(n.origin as Origin)) err(at, `origin 은 ${ORIGINS.join(' / ')} 중 하나여야 한다`);
    if (n.touches !== undefined && !(Array.isArray(n.touches) && n.touches.every(isStr)))
      err(at, 'touches 는 문자열 배열이어야 한다');
    nodes.push(n as unknown as ScopeNode);
  });

  const systems = new Set(nodes.flatMap((n) => (Array.isArray(n.touches) ? n.touches : [])));
  for (const n of nodes) {
    const at = `노드 ${n.id}`;
    const parent = parentId(n.id);
    if (parent && !ids.has(parent)) err(at, `부모 노드 ${parent} 가 없다`);
    if (n.leaf && nodes.some((c) => parentId(c.id) === n.id)) err(at, 'leaf 인데 하위 노드가 있다');
    let text = `${n.title ?? ''} ${n.summary ?? ''}`;
    for (const s of systems) text = text.split(s).join(' ');
    const hit = CODE_PATTERNS.find(([re]) => re.test(text));
    if (hit)
      warn(at, `${hit[1]}처럼 보이는 표현이 있다. 기능 정의에는 동작만 쓰고, 코드 구조는 설계 단계로 미룬다`);
  }

  const seenEdges = new Set<string>();
  input.edges.forEach((e, i) => {
    if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) return err(`edges[${i}]`, 'from 과 to 가 필요하다');
    const at = `선 ${e.from} → ${e.to}`;
    if (!ids.has(e.from)) return err(at, `노드 ${e.from} 가 없다`);
    if (!ids.has(e.to)) return err(at, `노드 ${e.to} 가 없다`);
    if (e.from === e.to) return err(at, '자기 자신으로 가는 선은 쓸 수 없다. 반복은 앞 노드로 돌아가는 선으로 그린다');
    if (parentId(e.from) !== parentId(e.to))
      err(at, '같은 단계의 노드끼리만 이을 수 있다. 다른 단계로 가는 흐름은 부모 노드의 선으로 표현한다');
    if (e.when !== undefined && typeof e.when !== 'string') err(at, 'when 은 문자열이어야 한다');
    if (e.kind !== undefined && !EDGE_KINDS.includes(e.kind as never)) err(at, `kind 는 ${EDGE_KINDS.join(' / ')} 중 하나여야 한다`);
    const key = `${e.from}>${e.to}`;
    if (seenEdges.has(key)) warn(at, '같은 선이 두 번 있다');
    seenEdges.add(key);
  });

  if (!issues.some((x) => x.level === 'error')) {
    const edges = input.edges as Edge[];
    for (const parent of ['', ...ids]) {
      const kids = childrenOf(nodes, parent);
      const where = parent ? `노드 ${parent} 안쪽` : '첫 단계';
      if (kids.length > 1 && !edges.some((e) => parentId(e.from) === parent))
        warn(where, '노드가 여러 개인데 선이 없어 순서를 알 수 없다');
      if (kids.length > 9) warn(where, `노드가 ${kids.length}개다. 한 단계는 7개 안팎으로 묶는다`);
    }
  }
  return issues;
}

export interface Weight {
  /** 모든 깊이의 하위 동작 수 */
  children: number;
  added: number;
  assumptions: number;
  touches: string[];
}

export function weight(nodes: ScopeNode[], id: string): Weight {
  const below = descendantsOf(nodes, id);
  const self = nodes.find((n) => n.id === id);
  const touches = new Set<string>();
  for (const n of self ? [self, ...below] : below) for (const t of n.touches ?? []) touches.add(t);
  return {
    children: below.length,
    added: below.filter((n) => n.origin === 'added').length,
    assumptions: below.filter((n) => n.origin === 'assumption').length,
    touches: [...touches],
  };
}

export interface Diff {
  added: string[];
  changed: string[];
  removed: { id: string; title: string }[];
}

/** 기준 시점(prev) 대비 바뀐 노드. 선이 바뀐 경우 양 끝 노드를 changed 로 본다. */
export function diff(prev: ScopeDoc, cur: ScopeDoc): Diff {
  const before = new Map(prev.nodes.map((n) => [n.id, n]));
  const after = new Map(cur.nodes.map((n) => [n.id, n]));
  const sig = (n: ScopeNode) =>
    JSON.stringify([n.title, n.summary ?? '', n.origin, n.touches ?? [], !!n.leaf, !!n.terminal]);
  const added: string[] = [];
  const changed = new Set<string>();
  for (const n of cur.nodes) {
    const old = before.get(n.id);
    if (!old) added.push(n.id);
    else if (sig(old) !== sig(n)) changed.add(n.id);
  }
  const edgeSig = (e: Edge) => `${e.from}>${e.to}|${e.when ?? ''}|${e.kind ?? 'next'}`;
  const oldEdges = new Set(prev.edges.map(edgeSig));
  const newEdges = new Set(cur.edges.map(edgeSig));
  for (const e of [...prev.edges, ...cur.edges]) {
    if (oldEdges.has(edgeSig(e)) && newEdges.has(edgeSig(e))) continue;
    for (const id of [e.from, e.to]) if (before.has(id) && after.has(id)) changed.add(id);
  }
  const removed = prev.nodes.filter((n) => !after.has(n.id)).map((n) => ({ id: n.id, title: n.title }));
  return { added, changed: [...changed], removed };
}
