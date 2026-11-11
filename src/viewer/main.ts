import { childrenOf, parentId } from '../core/graph.ts';
import { renderLevel } from '../core/render.ts';
import { weight } from '../scope/schema.ts';
import type { Diff, Issue, ScopeDoc } from '../scope/schema.ts';
import { ORIGIN_LABEL, levelView } from '../scope/view.ts';

interface Payload {
  file: string;
  doc?: ScopeDoc;
  parseError?: string;
  issues?: Issue[];
  diff?: Diff;
  revision?: number;
  editing?: boolean;
}

type Child = Node | string | false | undefined | null;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

const app = document.getElementById('app')!;
/** 첫 단계에서 고른 노드부터 가장 깊이 고른 노드까지의 ID */
let path: string[] = [];
let data: Payload | undefined;
let scrollToLast = false;

function select(id: string): void {
  const depth = id.split('.').length - 1;
  path = path[depth] === id ? path.slice(0, depth) : [...path.slice(0, depth), id];
  scrollToLast = true;
  render();
}

function list(title: string, items: string[]): HTMLElement | false {
  return items.length > 0 && h('div', {}, h('h2', {}, title), h('ul', {}, ...items.map((t) => h('li', {}, t))));
}

function issuesBox(issues: Issue[]): HTMLElement | false {
  if (!issues.length) return false;
  const errors = issues.filter((i) => i.level === 'error');
  const shown = errors.length ? errors : issues;
  return h(
    'div',
    { class: `issues${errors.length ? ' error' : ''}` },
    errors.length ? `형식 오류 ${errors.length}개. 고쳐지면 그래프가 다시 그려진다.` : `경고 ${issues.length}개`,
    h('ul', {}, ...shown.map((i) => h('li', {}, `${i.where}: ${i.message}`))),
  );
}

function render(): void {
  if (!data) return;
  if (data.parseError || !data.doc) {
    app.replaceChildren(h('p', { class: 'empty' }, data.parseError ?? '문서가 없다', h('br'), data.file));
    return;
  }
  const { doc, issues = [], diff } = data;
  const broken = issues.some((i) => i.level === 'error');
  const header = h(
    'header',
    {},
    h(
      'h1',
      {},
      String(doc.feature ?? '이름 없는 기능'),
      h('span', { class: `pill${doc.status === 'confirmed' ? ' confirmed' : ''}` }, doc.status === 'confirmed' ? '확정됨' : '작성 중'),
      data.revision ? h('span', { class: 'pill' }, `r${data.revision}`) : false,
    ),
    data.editing && h('div', { class: 'issues editing' }, '에이전트가 문서를 고치는 중이다. 지금 화면은 이전 리비전이고, 수정이 끝나면 자동으로 바뀐다.'),
    h('p', { class: 'request' }, `요청: ${doc.request ?? ''}`),
    h(
      'div',
      { class: 'legend' },
      ...(['requested', 'assumption', 'added'] as const).map((o) => h('span', {}, h('span', { class: `sw ${o}` }), ORIGIN_LABEL[o])),
      h('span', {}, '노드를 누르면 안쪽이 펼쳐진다. 고칠 것은 채팅에서 노드 번호로 말한다.'),
    ),
    issuesBox(issues),
  );
  if (broken) {
    app.replaceChildren(header);
    return;
  }

  path = path.filter((id, i) => doc.nodes.some((n) => n.id === id) && (i === 0 ? !parentId(id) : parentId(id) === path[i - 1]));
  const sections: HTMLElement[] = [];
  const visible: string[] = [];
  ['', ...path].forEach((parent, depth) => {
    const kids = childrenOf(doc.nodes, parent);
    if (!kids.length) return;
    visible.push(...kids.map((k) => k.id));
    const view = levelView(doc, parent, diff);
    const parentNode = doc.nodes.find((n) => n.id === parent);
    const section = h(
      'section',
      {},
      h('h2', {}, parentNode ? `${parentNode.id} ${parentNode.title} 안쪽` : '전체 흐름'),
      h('div', { class: 'scroll' }, renderLevel(view.nodes, view.edges, path[depth], select) as unknown as Node),
    );
    const picked = doc.nodes.find((n) => n.id === path[depth]);
    if (picked) {
      const w = weight(doc.nodes, picked.id);
      const hasKids = childrenOf(doc.nodes, picked.id).length > 0;
      const meta = [
        ORIGIN_LABEL[picked.origin],
        w.touches.length ? `외부: ${w.touches.join(', ')}` : '',
        hasKids ? '' : picked.leaf || picked.terminal ? '끝 노드' : `하위 미작성. 채팅에서 "${picked.id} 더 자세히"라고 요청한다`,
      ].filter(Boolean);
      section.append(
        h('div', { class: 'detail' }, h('b', {}, `${picked.id} ${picked.title}`), h('div', {}, picked.summary ?? ''), h('div', { class: 'meta' }, meta.join(' · '))),
      );
    }
    sections.push(section);
  });

  const lists = h(
    'div',
    { class: 'lists' },
    list('완료 기준', doc.doneWhen ?? []),
    list('제외한 것', (doc.excluded ?? []).map((x) => `${x.title}: ${x.reason}`)),
    list('직전 리비전에서 삭제된 노드', (diff?.removed ?? []).map((r) => `${r.id} ${r.title}`)),
  );
  app.replaceChildren(header, ...sections, lists);
  if (scrollToLast) sections[sections.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  scrollToLast = false;
  document.title = `${doc.feature} · unfold`;
  // 확정 전에 사용자가 보지 않은 AI 추가 항목을 알려주기 위해, 화면에 나온 노드를 기록해 둔다.
  fetch('/seen', { method: 'POST', body: JSON.stringify(visible) }).catch(() => {});
}

async function load(): Promise<void> {
  data = (await (await fetch('/doc')).json()) as Payload;
  render();
}

new EventSource('/events').onmessage = () => void load();
void load();
