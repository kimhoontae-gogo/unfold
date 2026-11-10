import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { toMarkdown } from '../src/scope/markdown.ts';
import { diff, validate, weight } from '../src/scope/schema.ts';
import type { ScopeDoc } from '../src/scope/schema.ts';

const load = (name: string): ScopeDoc =>
  JSON.parse(readFileSync(new URL(`../examples/${name}/scope.json`, import.meta.url), 'utf8'));
const errors = (doc: unknown) => validate(doc).filter((i) => i.level === 'error');
const clone = <T>(v: T): T => structuredClone(v);

test('예시 문서는 오류와 경고 없이 통과한다', () => {
  assert.deepEqual(validate(load('resource-upload')), []);
  assert.deepEqual(validate(load('payment')), []);
});

test('다른 단계의 노드를 잇는 선은 오류다', () => {
  const doc = load('resource-upload');
  doc.edges.push({ from: '2.1', to: '3' });
  assert.match(errors(doc)[0].message, /같은 단계/);
});

test('없는 노드를 가리키는 선, 중복 ID, 부모 없는 노드, 자기 자신으로 가는 선은 오류다', () => {
  const a = load('resource-upload');
  a.edges.push({ from: '1', to: '9' });
  assert.equal(errors(a).length, 1);

  const b = load('resource-upload');
  b.nodes.push(clone(b.nodes[0]));
  assert.match(errors(b)[0].message, /중복/);

  const c = load('resource-upload');
  c.nodes.push({ id: '7.1', title: '고아', origin: 'requested' });
  assert.match(errors(c)[0].message, /부모/);

  const d = load('resource-upload');
  d.edges.push({ from: '1', to: '1' });
  assert.match(errors(d)[0].message, /자기 자신/);
});

test('leaf 노드에 하위가 있으면 오류다', () => {
  const doc = load('resource-upload');
  doc.nodes.push({ id: '1.1', title: '하위', origin: 'requested' });
  assert.match(errors(doc)[0].message, /leaf/);
});

test('코드 식별자가 섞이면 경고하고, 외부 시스템 이름은 경고하지 않는다', () => {
  const doc = load('resource-upload');
  doc.nodes[0].summary = 'HeaderValidator 가 검증한다';
  const warnings = validate(doc).filter((i) => i.level === 'warning');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /PascalCase/);

  const ok = load('resource-upload');
  ok.nodes[0].summary = 'DynamoDB 에 기록한다';
  ok.nodes[0].touches = ['DynamoDB'];
  assert.deepEqual(validate(ok), []);
});

test('무게는 모든 깊이의 하위를 합산한다', () => {
  const doc = load('resource-upload');
  assert.deepEqual(weight(doc.nodes, '2'), { children: 7, added: 2, assumptions: 2, touches: ['스캐너 API', 'DB'] });
  assert.deepEqual(weight(doc.nodes, '3'), { children: 2, added: 1, assumptions: 1, touches: ['S3'] });
});

test('diff 는 추가, 변경, 삭제된 노드를 가른다', () => {
  const prev = load('resource-upload');
  const cur = clone(prev);
  cur.nodes = cur.nodes.filter((n) => n.id !== '2.3');
  cur.edges = cur.edges.filter((e) => e.from !== '2.3' && e.to !== '2.3');
  cur.edges.push({ from: '2.2', to: '2.4' });
  cur.nodes.find((n) => n.id === '2.1.1')!.summary = '앞 128바이트를 읽는다';
  cur.nodes.push({ id: '5', title: '새 노드', origin: 'requested', leaf: true });
  const d = diff(prev, cur);
  assert.deepEqual(d.added, ['5']);
  assert.deepEqual(d.removed, [{ id: '2.3', title: '악성코드 스캔' }]);
  assert.deepEqual(d.changed.sort(), ['2.1.1', '2.2', '2.4']);
});

test('Markdown 에 출처, 조건, 제외 목록이 들어간다', () => {
  const md = toMarkdown(load('payment'));
  assert.match(md, /\*\*8 영수증 발송\*\* `AI 추가` \(외부: 메일\)/);
  assert.match(md, /3 → 2 \(거절 시, 반복\)/);
  assert.match(md, /- 부분 환불: 요청 범위 밖/);
});
