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

export function levelView(doc: ScopeDoc, parent: string, changes?: Diff): { nodes: NodeView[]; edges: EdgeView[] } {
  const nodes = childrenOf(doc.nodes, parent).map((n) => ({
    id: n.id,
    title: n.title,
    subtitle: subtitle(doc, n),
    className: `o-${n.origin}`,
    badge: changes?.added.includes(n.id) ? '신규' : changes?.changed.includes(n.id) ? '변경' : undefined,
  }));
  const edges = edgesAt(doc.edges, parent).map((e) => {
    const notes = [e.when, e.kind === 'loop' ? '반복' : e.kind === 'parallel' ? '동시에' : ''].filter(Boolean);
    return { from: e.from, to: e.to, label: notes.join(' · ') || undefined, dashed: e.kind === 'loop' };
  });
  return { nodes, edges };
}
