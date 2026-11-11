import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// 빌드된 스크립트를 실제로 실행한다. 먼저 npm run build 가 필요하다.
const script = fileURLToPath(new URL('../skill/scripts/unfold.mjs', import.meta.url));
const example = fileURLToPath(new URL('../examples/payment/scope.json', import.meta.url));

function workingCopy(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'unfold-test-')), 'scope.json');
  copyFileSync(example, file);
  return file;
}
const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const edit = (file: string, change: (doc: any) => void) => {
  const doc = read(file);
  change(doc);
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
};

test('done 은 수정할 때마다 리비전을 올리고, 바뀐 것이 없으면 올리지 않는다', () => {
  const file = workingCopy();
  assert.match(run('done', file).out, /r1/);
  assert.match(run('done', file).out, /바뀐 것이 없다/);
  edit(file, (d) => (d.nodes[0].summary = '바꾼 설명'));
  assert.match(run('done', file).out, /r2/);
});

test('형식 오류가 있으면 done 이 리비전을 만들지 않는다', () => {
  const file = workingCopy();
  run('done', file);
  edit(file, (d) => d.edges.push({ from: '1', to: '99' }));
  const r = run('done', file);
  assert.equal(r.code, 1);
  edit(file, (d) => d.edges.pop());
  assert.match(run('done', file).out, /바뀐 것이 없다/);
});

test('revert 는 지정한 리비전의 내용을 작업본에 되살린다', () => {
  const file = workingCopy();
  run('done', file);
  edit(file, (d) => (d.nodes[0].title = '바뀐 제목'));
  run('done', file);
  assert.match(run('revert', file, '1').out, /r3/);
  assert.equal(read(file).nodes[0].title, '주문 확인');
  assert.equal(run('revert', file, '9').code, 1);
});

test('confirm 은 반영되지 않은 수정이 있으면 거부하고, 확정하면 리비전을 r1 하나로 정리한다', () => {
  const file = workingCopy();
  run('done', file);
  edit(file, (d) => (d.nodes[0].summary = '아직 done 하지 않은 수정'));
  assert.match(run('confirm', file, '--force').out, /먼저 done/);
  run('done', file);
  assert.equal(run('confirm', file).code, 2, '보지 않은 AI 추가 항목이 있으면 종료 코드 2');
  assert.equal(run('confirm', file, '--force').code, 0);
  assert.equal(read(file).status, 'confirmed');
  assert.equal(run('revert', file, '2').code, 1, '확정 뒤에는 이전 리비전이 없다');
  assert.equal(run('done', file).code, 1, '확정된 문서는 reopen 전에는 고칠 수 없다');
  assert.equal(run('reopen', file).code, 0);
  assert.equal(read(file).status, 'draft');
});
