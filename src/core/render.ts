import dagre from '@dagrejs/dagre';

export interface NodeView {
  id: string;
  title: string;
  subtitle: string;
  className: string;
  badge?: string;
}

export interface EdgeView {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';
const NODE_H = 54;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

let ctx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string): number {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 9;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 꺾이는 점을 둥글게 지나는 경로 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const last = i === points.length - 2;
    d += ` Q${a.x} ${a.y} ${last ? b.x : (a.x + b.x) / 2} ${last ? b.y : (a.y + b.y) / 2}`;
  }
  return d;
}

/**
 * 한 단계(같은 부모를 가진 노드들)를 왼쪽에서 오른쪽으로 흐르는 그래프로 그린다.
 * 선은 같은 단계 안에서만 이어지므로 단계마다 따로 배치하면 된다.
 */
export function renderLevel(
  nodes: NodeView[],
  edges: EdgeView[],
  selected: string | undefined,
  onSelect: (id: string) => void,
): SVGSVGElement {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 44, marginx: 10, marginy: 14 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const w = Math.max(textWidth(`${n.id} ${n.title}`, `500 14px ${FONT}`), textWidth(n.subtitle, `12px ${FONT}`));
    g.setNode(n.id, { width: Math.max(104, Math.ceil(w) + 28), height: NODE_H });
  }
  edges.forEach((e, i) => {
    const w = e.label ? Math.ceil(textWidth(e.label, `12px ${FONT}`)) + 12 : 0;
    g.setEdge(e.from, e.to, { label: e.label ?? '', width: w, height: e.label ? 18 : 0, labelpos: 'c' }, `e${i}`);
  });
  dagre.layout(g);

  const { width = 0, height = 0 } = g.graph();
  const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const defs = el('defs', {});
  const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
  marker.append(el('path', { d: 'M1 1L9 5L1 9', class: 'arrowhead' }));
  defs.append(marker);
  svg.append(defs);

  const labels: SVGTextElement[] = [];
  edges.forEach((e, i) => {
    const laid = g.edge({ v: e.from, w: e.to, name: `e${i}` });
    if (!laid) return;
    svg.append(el('path', { d: smoothPath(laid.points), class: `edge${e.dashed ? ' dashed' : ''}`, 'marker-end': 'url(#arrow)' }));
    if (e.label) labels.push(el('text', { x: laid.x, y: laid.y, class: 'edge-label' }, e.label));
  });
  // 라벨은 모든 선보다 위에 그려야 다른 선에 가려지지 않는다.
  svg.append(...labels);

  for (const n of nodes) {
    const { x, y, width: w } = g.node(n.id);
    const group = el('g', { class: `node ${n.className}${n.id === selected ? ' selected' : ''}`, tabindex: 0, role: 'button' });
    group.append(el('rect', { x: x - w / 2, y: y - NODE_H / 2, width: w, height: NODE_H, rx: 8 }));
    const title = el('text', { x, y: y - 9, class: 'title' });
    title.append(el('tspan', { class: 'id' }, n.id), el('tspan', { dx: 6 }, n.title));
    group.append(title, el('text', { x, y: y + 12, class: 'subtitle' }, n.subtitle));
    if (n.badge) {
      const bw = Math.ceil(textWidth(n.badge, `11px ${FONT}`)) + 10;
      group.append(
        el('rect', { x: x + w / 2 - bw - 4, y: y - NODE_H / 2 - 8, width: bw, height: 16, rx: 8, class: 'badge' }),
        el('text', { x: x + w / 2 - bw / 2 - 4, y: y - NODE_H / 2, class: 'badge-text' }, n.badge),
      );
    }
    group.addEventListener('click', () => onSelect(n.id));
    group.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onSelect(n.id);
      }
    });
    svg.append(group);
  }
  return svg;
}
