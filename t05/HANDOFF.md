# AI A → AI B Handoff

AI B must use this repository and this document only; do not request or use AI A's conversation transcript.

The executable code state handed off by AI A is `3bebda01bd60f7fe397d820711239fa255b04470`. The repository commit containing this `HANDOFF.md` is the official **AI A END / HANDOFF** source; resolve it without a self-referential hash using `git log -1 --format=%H -- t05/HANDOFF.md`. No production code changes occur between the executable code state and that evidence-only handoff commit.

## 1. 목표

T03 이미지 문구 편집기에 텍스트 레이어의 겹침 순서를 **한 단계 앞으로 / 한 단계 뒤로** 조절하는 기능을 완성한다. 시작 전에 고정된 `t05/fixed-tests.json`의 정확히 10개 사용자 관찰 조건과 `tests/t05/layer-order.test.mjs`를 변경하지 않고 모두 만족해야 한다. 최종 UI에서도 가운데 레이어는 양방향 이동 가능, 최상위/최하위에서는 해당 방향 버튼이 disabled여야 하며, Undo/Redo와 preview/export의 순서가 일관되어야 한다.

## 2. 현재 상태

- AI A START source: `0354fed0212facde5492500557e458b4022a8647`
- AI A executable code state: `3bebda01bd60f7fe397d820711239fa255b04470`
- AI A END / HANDOFF source: 이 파일을 포함하는 commit (`git log -1 --format=%H -- t05/HANDOFF.md`로 확인)
- 공통 상한: 60분 / 사용자 요청 6회
- AI A 실제 사용자 요청 수: **1회**
- AI A 시간 측정: START commit timestamp `2026-09-12T10:23:09Z`부터 이 HANDOFF commit의 commit timestamp까지 wall-clock으로 계산한다. 이 방식은 HANDOFF 파일 안에 자기 자신의 아직 생성되지 않은 commit SHA/시각을 하드코딩하는 모순을 피한다.
- A 구현 내용: `src/core/layer-order.js` 생성, `getLayerMoveState`와 `moveLayerForward` 구현.
- 현재 fixed suite: **8/10 PASS**.
- PASS: F01, F02, F03, F04, F07, F08, F09, F10.
- FAIL: F05, F06.
- 현재 앱 UI에는 z-order 버튼이 아직 연결되지 않았다. 따라서 core fixed test 8/10이라는 숫자만으로 사용자 기능이 완성되었다고 판단하면 안 된다.

## 3. 실행 명령

새 작업 폴더에서 repository의 AI A END / HANDOFF commit을 checkout한 뒤 아래 순서대로 실행한다.

```bash
sha256sum -c t05/fixed-tests.sha256
npm run test:t05
npm test
npm run lint
```

현재 인수 시점의 기대 결과는 SHA-256 검증 성공, `npm run test:t05`에서 **8 PASS / 2 FAIL(F05, F06)** 이다. 구현 완료 후에는 `npm run test:t05`가 10/10이어야 하며 마지막으로 `npm run check` 전체를 실행한다. Node.js는 repository 계약대로 24.x를 사용한다. 외부 npm dependency 설치는 필요하지 않는다.

## 4. 통과 검사

AI A의 첫 구현 패스 뒤 동일 고정 검사 결과:

- T05-F01 PASS — 3-layer bottom-to-top order
- T05-F02 PASS — middle layer reports both directions available
- T05-F03 PASS — forward moves exactly one position
- T05-F04 PASS — forward top boundary is a no-op
- T05-F05 FAIL — `moveLayerBackward` is not a function
- T05-F06 FAIL — `moveLayerBackward` is not a function
- T05-F07 PASS — selected layer identity/content survives reorder
- T05-F08 PASS — one Undo restores pre-reorder order
- T05-F09 PASS — one Redo restores reordered state
- T05-F10 PASS — renderer consumes reordered array consistently

상세 실행 증거는 `t05/AI-A-TEST-RESULTS.md`에 있다.

## 5. 남은 문제

1. `src/core/layer-order.js`에 `moveLayerBackward(doc, layerId)`가 없다. F05/F06의 직접 원인이다.
2. 사용자에게 보이는 레이어 순서 컨트롤이 아직 없다. `index.html`의 선택한 문구 영역에 `뒤로`/`앞으로` 버튼을 추가해야 한다.
3. `src/app.js`에서 두 버튼을 현재 선택 레이어와 연결해야 한다. 이동은 반드시 `History`의 한 commit으로 기록되어 Undo 1회가 순서 변경 1회를 정확히 되돌려야 한다.
4. 선택 레이어 ID를 reorder 전후에 유지해야 한다. `editor.selectedId`와 controller `selectedId`를 새 레이어로 바꾸면 안 된다.
5. `getLayerMoveState`를 사용해 bottom에서 뒤로, top에서 앞으로 버튼을 disabled 처리해야 한다.
6. renderer는 이미 `doc.textLayers` 순서대로 그리고 editor hit-test는 역순으로 검사하므로 별도 z-index 필드를 만들 필요가 없다. 배열 순서를 단일 정본으로 유지하는 편이 현재 구조와 일관된다.
7. core 10/10 이후에도 실제 browser UI에서 버튼 상태, Undo/Redo, 겹친 레이어의 preview/export 일치를 확인해야 한다. fixed tests를 바꾸지 말고 필요하면 **추가 supplementary regression test**만 별도로 만든다.

## 6. 다음 행동

1. 먼저 위 실행 명령으로 **8/10 상태를 그대로 재현**한다. 다르면 작업하지 말고 문서/환경 누락으로 기록한다.
2. `moveLayerBackward`를 `moveLayerForward`와 대칭적으로 구현한다. 존재하지 않는 ID와 bottom boundary에서는 immutable no-op copy를 반환한다.
3. `index.html`에 접근 가능한 `뒤로`/`앞으로` 버튼을 추가하고 `src/app.js`에서 선택 상태·disabled 상태·History commit을 연결한다. 기존 `commitDocument()` 경로를 재사용하는 것이 안전하다.
4. 필요한 최소 CSS만 추가한다. 기존 responsive UI와 320px overflow 보장을 깨지 않는다.
5. `sha256sum -c t05/fixed-tests.sha256`을 다시 실행해 고정검사 불변을 확인한다.
6. `npm run test:t05` 10/10 → `npm run check` 전체 PASS 순서로 검증한다.
7. AI B 결과에는 시간, 사용자 요청 수, fixed-suite 전체 실행 회차와 FAIL이 있었던 회차 수, B 시작/종료 full SHA를 남긴다.

## 7. 건드리지 말 것

- `t05/fixed-tests.json`
- `tests/t05/layer-order.test.mjs`
- `t05/fixed-tests.sha256`
- 고정 10검사의 ID, 입력, 기대값, 개수
- 공통 상한 60분 / 사용자 요청 6회와 request 정의
- T03 개인정보 경계: 이미지/문구 외부 전송 금지, `localStorage`/`sessionStorage`/analytics/third-party script 금지
- `.png`/`.jpeg` allowlist와 `.jpg` 거부 정책
- 30 MiB / 32,000,000 pixel 입력 한계
- 정확한 출력 크기 1080×1080 / 1080×1350 / 1080×1920
- Canvas 재인코딩 기반 EXIF 제거
- CSP `connect-src 'none'` 및 기존 보안 헤더
- renderer의 기존 bottom→top 배열 순서 의미를 임의의 별도 z-index 체계로 이중화하지 말 것
