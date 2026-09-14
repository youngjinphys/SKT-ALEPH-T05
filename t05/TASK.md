# T05 Fixed Task — Text Layer Z-Order

## Declared improvement

T03 이미지 문구 편집기의 여러 문구 레이어에 **한 단계 앞으로 / 한 단계 뒤로** 이동하는 겹침 순서(z-order) 제어를 추가한다.

## Immutable fixed tests

- 정확히 10개: `t05/fixed-tests.json`
- executable tests: `tests/t05/layer-order.test.mjs`
- SHA-256 manifest: `t05/fixed-tests.sha256`
- AI A 시작 이후 검사 삭제, 완화, 기대값 변경, 실행 테스트 변경을 금지한다.

## Common resource caps

AI A와 AI B 모두 동일하게 적용한다.

- Hard time cap: **60 minutes**
- Hard request cap: **6 user requests**
- Request 정의: 학생이 해당 AI 작업 세션에 보내는 작업 요청 메시지 1개를 1 request로 센다. AI 내부 tool call은 세지 않는다.
- 시간 정의: 공식 start source가 고정된 뒤 최초 작업을 시작한 시점부터 해당 AI의 end source commit 생성 시각까지 wall-clock으로 기록한다.

## Identical initial request for A and B

> 이 저장소의 `t05/TASK.md`와 시작 전에 고정된 검사 10개를 기준으로 T03 이미지 편집기의 텍스트 레이어 겹침 순서 제어 기능을 완성한다. 고정 검사 삭제·완화·기대값 변경은 금지한다. 기존 T03의 개인정보/보안 경계와 기존 기능을 회귀시키지 않는다. 작업 중 검사 결과와 변경 근거를 확인하고 지정된 사용 상한을 넘지 않는다.

## AI A planned stop rule

A는 hard cap과 무관하게 **첫 번째 집중 구현 패스와 그 직후 고정 검사 10개 전체 실행 결과를 확보한 시점**에 멈춘다. 실패가 남아 있으면 이를 수정하기 위한 두 번째 구현 패스는 수행하지 않고 인수인계한다. 이는 B가 실제 미완료 상태를 저장소·인수인계만으로 이어받는지 시험하기 위한 사전 고정 규칙이다.

## Non-goals / protected boundaries

- 업로드 이미지 또는 문구를 서버로 전송하지 않는다.
- `localStorage`, `sessionStorage`, analytics SDK, third-party script를 추가하지 않는다.
- `.png`/`.jpeg` 파일 정책, 출력 크기, EXIF 제거, CSP `connect-src 'none'`을 약화하지 않는다.
- fixed tests를 구현 편의에 맞춰 바꾸지 않는다.
