# unfold

기능을 구현하기 전에 "무엇을 어디까지 만들지"를 펼쳐 보는 그래프로 합의하는 에이전트 스킬.

에이전트가 기능의 동작 흐름을 JSON 문서로 쓰면, 로컬 뷰어가 그것을 그래프로 그린다. 사용자는 첫 화면의 대략적인 흐름에서 시작해 궁금한 노드만 눌러 안쪽을 본다. 요청한 것, AI가 가정한 것, AI가 추가한 것이 색으로 구분된다. 고칠 것은 채팅에서 노드 번호로 말한다. 수정이 끝날 때마다 새 리비전이 되어 화면이 바뀌고, 확정하면 이전 리비전은 지워지며 확정된 문서가 구현의 기준이 된다.

현재는 기능 정의(scope) 단계만 있다. 구현 설계(design) 단계는 같은 구조 위에 추가될 예정이다.

## 설치

`skill/` 폴더를 에이전트의 스킬 폴더에 `unfold`라는 이름으로 복사한다. Node 20 이상이 필요하고, 그 밖의 의존성은 없다.

## 직접 실행해 보기

```bash
node skill/scripts/unfold.mjs view examples/payment/scope.json
```

## 구조

```
skill/            배포되는 스킬 (지침, 빌드된 스크립트와 뷰어)
src/core/         두 단계가 함께 쓰는 것: 그래프 기본 형식, 단계별 배치와 그리기
src/scope/        기능 정의 전용: 문서 형식, 검증, 무게, 변경 비교, Markdown 변환
src/cli/          명령과 로컬 뷰어 서버
src/viewer/       뷰어 화면
examples/         예시 문서
tests/
```

## 개발

```bash
npm install
```

```bash
npm run build
```

```bash
npm test
```

`npm run build`는 `src/`를 묶어 `skill/scripts/unfold.mjs`와 `skill/viewer/index.html`을 만든다. 스킬 폴더만 복사해도 동작하도록 빌드 결과도 저장소에 넣는다.
