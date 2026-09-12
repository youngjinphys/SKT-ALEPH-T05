# SKT ALEPH T05 — Conversation-Independent Handoff

T03 이미지 문구 편집기의 작은 개선을 AI A → 인수인계 → AI B 순서로 완성하고, 대화 전문 없이 저장소와 인수인계 문서만으로 작업을 재개할 수 있는지 검증하는 T05 실험 저장소입니다.

## 기준 프로젝트

- Upstream: `youngjinphys/SKT-ALEPH-T03`
- Pinned upstream commit: `05e467b22f24b48a4a77a8321b3594f7e9f0642a`
- 개선 기능: 텍스트 레이어 겹침 순서(z-order) 제어

T03의 production source를 기준으로 파생했으며 T05 실험 명세와 검사를 별도로 추가합니다. 기존 browser E2E 파일은 T05로 옮기는 과정에서 공백 정규화가 있어 원본 blob SHA와 동일하다고 주장하지 않습니다.

## T05 고정 계약

작업 시작 전에 `t05/fixed-tests.json`의 검사 10개, `t05/fixed-tests.sha256`, 공통 시간/요청 상한, 동일 최초 요청을 고정합니다. AI A와 AI B는 이를 삭제·완화·변경할 수 없습니다.

```bash
npm run test:t05
npm run check
```

AI A의 종료 상태와 7항목 인수인계는 `t05/HANDOFF.md`에 남기며 AI B는 저장소와 그 문서만으로 이어받습니다.
