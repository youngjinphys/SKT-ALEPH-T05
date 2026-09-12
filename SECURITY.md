# Security Policy

## Supported version

현재 `main` 브랜치의 최신 버전을 보안 수정 대상으로 합니다.

## Reporting a vulnerability

취약점에 악용 가능한 상세 정보가 포함된 경우 공개 Issue에 재현 절차나 payload를 게시하지 마십시오. 저장소의 **Security → Report a vulnerability** 기능이 제공되면 Private vulnerability report를 우선 사용해 주세요. 해당 기능을 사용할 수 없다면 공개 Issue에는 세부 내용을 제외하고 저장소 소유자에게 비공개 연락 방법이 필요하다는 사실만 알려 주세요.

## Security and privacy boundaries

- 업로드한 이미지와 문구는 백엔드로 전송하지 않습니다.
- 기본 동작에서는 편집 문서를 `localStorage`, `sessionStorage`, IndexedDB 등에 저장하지 않습니다.
- 입력 이미지는 `.png`와 `.jpeg`만 허용하며 `.jpg`는 의도적으로 거부합니다.
- 확장자·MIME·시그니처·해상도·실제 디코딩을 독립적으로 검증합니다.
- 이미지 크기는 30 MiB, 총 32,000,000 픽셀로 제한합니다.
- 결과 이미지는 Canvas에서 새로 인코딩하며 원본 EXIF 메타데이터를 복사하지 않습니다.
- CSP는 외부 네트워크 연결과 객체 임베딩을 차단합니다.

이 저장소에 외부 통신, 영구 저장, 분석 SDK, 서드파티 스크립트를 추가하는 변경은 위 개인정보 경계를 변경하는 것으로 간주하고 별도의 보안 검토가 필요합니다.
