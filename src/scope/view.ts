import { childrenOf, edgesAt } from '../core/graph.ts';
import type { EdgeView, NodeView } from '../core/render.ts';
import { weight } from './schema.ts';
import type { Diff, ScopeDoc, ScopeNode } from './schema.ts';

export const ORIGIN_LABEL: Record<string, string> = {
  requested: '요청한 것',
  assumption: 'AI의 가정',
  added: 'AI가 추가한 것',
};

function subtitle(doc: ScopeDoc, n: ScopeNode): string {
  const w = weight(doc.nodes, n.id);
  const parts: string[] = [];
  if (w.children) {
    parts.push(`하위 ${w.children}`);
    if (w.added) parts.push(`추가 ${w.added}`);
    if (w.assumptions) parts.push(`가정 ${w.assumptions}`);
  } else if (n.terminal) parts.push('흐름 종료');
  else if (!n.leaf) parts.push('하위 미작성');
  else if (n.origin === 'added') parts.push('요청 밖');
  else if (n.origin === 'assumption') parts.push('확인 필요');
  if (w.touches.length) parts.push(`외부 ${w.touches.length}`);
  return parts.join(' · ') || '끝 노드';
}

/** 펼치지 않은 노드 안쪽이 바뀐 경우에도 어디를 눌러 봐야 하는지 알 수 있게 부모에 표시한다. */
function badge(id: string, changes?: Diff): string | undefined {
  if (!changes) return undefined;
  if (changes.added.includes(id)) return '신규';
  if (changes.changed.includes(id)) return '변경';
  const inside = (x: string) => x.startsWith(id + '.');
  if ([...changes.added, ...changes.changed, ...changes.removed.map((r) => r.id)].some(inside)) return '안쪽 변경';
  return undefined;
}

export function levelView(doc: ScopeDoc, parent: string, changes?: Diff): { nodes: NodeView[]; edges: EdgeView[] } {
  const nodes = childrenOf(doc.nodes, parent).map((n) => ({
    id: n.id,
    title: n.title,
    subtitle: subtitle(doc, n),
    className: `o-${n.origin}`,
    badge: badge(n.id, changes),
  }));
  const edges = edgesAt(doc.edges, parent).map((e) => {
    const notes = [e.when, e.kind === 'loop' ? '반복' : e.kind === 'parallel' ? '동시에' : ''].filter(Boolean);
    return { from: e.from, to: e.to, label: notes.join(' · ') || undefined, dashed: e.kind === 'loop' };
  });
  return { nodes, edges };
}
