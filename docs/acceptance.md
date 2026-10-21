# 최종 인수 검증표

명세서 A01~A24를 실제 테스트 소스에 연결한 표입니다. 로컬 DB의 일반 회원·복수 운영자·미가입·정지 컨텍스트를 분리하고, 성공 응답은 실제 Auth/DB/Storage로 검증합니다. 관리 키는 픽스처 준비·정리에만 쓰며 사용자 요청은 각 계정 JWT를 사용합니다. 개별 실행 결과와 환경은 [8단계 검증 기록](verification.md#8단계-검증-기록)을 기준으로 합니다.

| 기준 | 자동 검증 소스/핵심 확인 | 외부에서 남은 확인 |
| --- | --- | --- |
| A01 | `supabase/tests/auth.test.mjs`, `tests/auth/auth.spec.ts`: 실제 초대·메일 링크·가입 | 운영 SMTP |
| A02 | auth DB: 만료/폐기/소진, 마지막 1회·동일 계정 동시 가입 | — |
| A03 | database/content/exports DB, auth E2E: 비로그인·미가입·정지 DB/Storage/내보내기 거부 | 클라우드 동일 정책 |
| A04 | auth/characters/posts E2E: 두 브라우저 세션·메일 콜백·갱신 | 실제 Pages 인증/복구 복귀 |
| A05 | database/community DB: 권한 위조 거부, 복수 운영자, 마지막 운영자·동시 회수 보호 | — |
| A06 | characters DB/E2E: 6개, 동시 생성/재개, 삭제 후 생성 | — |
| A07 | content/characters DB, posts E2E: 캐릭터 전환 후 계정 수정과 스냅샷 | — |
| A08 | characters DB/E2E, exports DB/E2E: 과거 이름/이미지·소유 불변 | — |
| A09 | database/characters/content DB: 타 계정 쓰기·소유 계정/이메일 조회 금지 | — |
| A10 | characters/content DB, posts E2E: 네 이미지·순서·위장 파일·타인 자산 | Free Edge 최대 입력 |
| A11 | content DB, posts E2E: 서버 길이·구조 문법·HTML 텍스트·위험 URL 거부 | — |
| A12 | content DB, posts E2E: 카테고리 이동·최종 카테고리 보호 | — |
| A13 | content/community DB, posts E2E: 수정 충돌·삭제 부모·숨김 직접 조회 | — |
| A14 | community DB/E2E: 동시 투표 계정당 1개·복수 선택·재투표 | — |
| A15 | community DB/E2E: 첫 투표/설정 수정·마감 경합 | — |
| A16 | community/exports DB: 익명 신원·공개 전 집계 보호·기명 스냅샷 | — |
| A17 | community DB/E2E: 공지·고정·정렬·권한·운영 기록 | — |
| A18 | community DB/E2E: 한국어 검색·카테고리/형식/캐릭터·내 활동 | — |
| A19 | exports DB/E2E: 일반 회원 조건·이미지/한글·비공개 정보 제외 | 실제 Safari PDF 저장 UI |
| A20 | exports DB/E2E: 1,005개 6분할·댓글 API 한도·실제 ZIP 이미지 | — |
| A21 | characters/content DB, posts E2E: 응답 유실 멱등·동시 편집·입력 보존 | — |
| A22 | auth/characters/posts/exports E2E: 로그아웃·계정 교체·초안·Blob 정리 | — |
| A23 | 전체 auth E2E: Chromium 데스크톱/Pixel 7, WebKit iPhone 13 | 실제 모바일 기기 |
| A24 | check/deployment tests, foundation E2E: 타입·린트·빌드·하위 경로 | 실제 Pages 직접 링크/새로고침 |

`supabase/tests/`의 동시성 검사는 캐릭터 수, 초대 소진, 권한 회수·마지막 운영자, 글 버전·멱등성, 투표 참여·설정·마감의 경합을 실제 DB 트랜잭션으로 실행합니다. 브라우저 에뮬레이션이나 관리 키 요청만으로 이를 대체하지 않습니다.

배포/운영 인수는 별도입니다. 클라우드 접근 정보가 없어 원격 DB·Edge 적용, Free 자원 한도, SMTP, Pages, 실제 기기, 외부 백업·복원·정리 스케줄을 완료로 표시하지 않습니다. 연결 항목과 순서는 [배포 절차](deployment.md), 담당자 점검은 [운영 문서](operations.md)를 따릅니다.
