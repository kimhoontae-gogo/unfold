import { childrenOf, edgesAt } from '../core/graph.ts';
import type { ScopeDoc, ScopeNode } from './schema.ts';

const ORIGIN_TAG: Record<string, string> = { requested: '', assumption: ' `가정`', added: ' `AI 추가`' };

export function toMarkdown(doc: ScopeDoc): string {
  const out: string[] = [];
  out.push(`# ${doc.feature}`, '');
  out.push(`> 요청: ${doc.request}`, '');
  out.push(doc.status === 'confirmed' ? `상태: 확정 (${doc.confirmedAt ?? '시각 없음'})` : '상태: 작성 중', '');

  out.push('## 동작', '');
  const walk = (parent: string, depth: number) => {
    const pad = '  '.repeat(depth);
    for (const n of childrenOf(doc.nodes, parent)) {
      const touches = n.touches?.length ? ` (외부: ${n.touches.join(', ')})` : '';
      const end = n.terminal ? ' — 흐름 종료' : '';
      out.push(`${pad}- **${n.id} ${n.title}**${ORIGIN_TAG[n.origin]}${touches}${end}${n.summary ? `: ${n.summary}` : ''}`);
      walk(n.id, depth + 1);
    }
    const edges = edgesAt(doc.edges, parent);
    if (edges.length) {
      const text = edges
        .map((e) => {
          const notes = [e.when, e.kind === 'loop' ? '반복' : e.kind === 'parallel' ? '동시에' : ''].filter(Boolean);
          return `${e.from} → ${e.to}${notes.length ? ` (${notes.join(', ')})` : ''}`;
        })
        .join(', ');
      out.push(`${pad}- 흐름: ${text}`);
    }
  };
  walk('', 0);
  out.push('');

  const list = (title: string, nodes: ScopeNode[]) => {
    if (!nodes.length) return;
    out.push(`## ${title}`, '');
    for (const n of nodes) out.push(`- ${n.id} ${n.title}${n.summary ? `: ${n.summary}` : ''}`);
    out.push('');
  };
  list('AI의 가정', doc.nodes.filter((n) => n.origin === 'assumption'));
  list('AI가 추가한 것', doc.nodes.filter((n) => n.origin === 'added'));

  if (doc.excluded?.length) {
    out.push('## 제외한 것', '');
    for (const x of doc.excluded) out.push(`- ${x.title}: ${x.reason}`);
    out.push('');
  }
  if (doc.doneWhen?.length) {
    out.push('## 완료 기준', '');
    for (const d of doc.doneWhen) out.push(`- ${d}`);
    out.push('');
  }
  return out.join('\n');
}
