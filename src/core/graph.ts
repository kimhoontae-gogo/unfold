export interface BaseNode {
  id: string;
  title: string;
  summary?: string;
  /** 더 내려가도 새로 정할 것이 없는 끝 노드 */
  leaf?: boolean;
  /** 이 노드에 닿으면 기능의 흐름이 끝난다 (예: 에러 응답) */
  terminal?: boolean;
}

export type EdgeKind = 'next' | 'loop' | 'parallel';

export interface Edge {
  from: string;
  to: string;
  /** 이 선을 타는 조건 */
  when?: string;
  kind?: EdgeKind;
}

export const EDGE_KINDS: EdgeKind[] = ['next', 'loop', 'parallel'];

/** "2", "2.1", "2.1.3" 형식. 점 앞부분이 부모의 ID다. */
export const ID_RE = /^[1-9]\d*(\.[1-9]\d*)*$/;

export function parentId(id: string): string {
  const i = id.lastIndexOf('.');
  return i < 0 ? '' : id.slice(0, i);
}

export function compareIds(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function childrenOf<T extends BaseNode>(nodes: T[], parent: string): T[] {
  return nodes.filter((n) => parentId(n.id) === parent).sort((a, b) => compareIds(a.id, b.id));
}

export function descendantsOf<T extends BaseNode>(nodes: T[], id: string): T[] {
  return nodes.filter((n) => n.id.startsWith(id + '.'));
}

export function edgesAt(edges: Edge[], parent: string): Edge[] {
  return edges.filter((e) => parentId(e.from) === parent && parentId(e.to) === parent);
}
