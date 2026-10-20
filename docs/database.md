# 데이터베이스와 인증 기반

2단계의 PostgreSQL 구조·권한·초기 설정 위에 3단계 초대 가입과 운영용 초대 API를 추가했습니다. 캐릭터·글·투표 쓰기는 후속 단계입니다.

## 로컬 실행

Node 24와 pnpm 11.25.0을 준비한 뒤 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm db:start --runtime native
pnpm db:migrate
pnpm db:test
pnpm db:types:check
pnpm db:stop
```

- Supabase CLI 2.121.0을 프로젝트 의존성으로 고정했습니다. 클라우드 가입이나 유료 프로젝트 없이 Auth·Postgres·Storage를 실행합니다.
- native 방식은 Supabase 공식 실험 기능입니다. macOS 14+ Apple Silicon / Linux glibc 2.35+에서 사용하며 CLI 버전 변경 시 재검증합니다. 이 컴퓨터와 CI는 native 방식으로 검증합니다.
- Docker가 있는 다른 환경에서는 새 로컬 스택을 `pnpm db:start --runtime docker`로 시작할 수 있습니다. 같은 스택의 실행 방식을 중간에 바꾸지 않습니다.
- `scripts/supabase.mjs`가 CLI 상태와 로컬 DB를 Git 제외 경로 `.supabase-local/`에 저장합니다. 실행 파일은 공식 서비스 아카이브를 내려받아 검증합니다. 종료는 데이터를 보존합니다.
- `db:migrate`는 기존 데이터를 보존하며 미적용 마이그레이션만 추가합니다.
- `db:reset`은 **현재 로컬 DB의 데이터를 삭제하고** 마이그레이션을 다시 적용합니다. 개발 데이터가 있으면 먼저 백업하세요. 명령에 `--local`이 고정되어 있으며 원격 초기화를 수행하지 않습니다.
- `db:test`는 회원 테이블이 비어 있는 일회용 로컬 DB에서 실행합니다. 랜덤 테스트 계정과 데이터를 만들고 정리합니다. 테스트 실행기가 로컬 상태에서 연결 정보를 읽고 루프백 이외의 호스트를 거부합니다. 실제 운영 DB에는 테스트를 실행하지 않습니다.
- 서비스 주소와 키는 `node scripts/supabase.mjs status`로 확인합니다. 서버 비밀 키를 `.env`의 `VITE_` 변수에 복사하지 않습니다. 로컬 상태와 로그에도 키가 포함될 수 있어 커밋하지 않습니다.
- `pnpm dev:local`로 인증 화면과 로컬 DB를 연결합니다. 실제 메일 흐름은 `pnpm test:auth`로 검증합니다.

## 마이그레이션과 데이터 경계

| 파일 | 책임 |
| --- | --- |
| `20261019000100_schema.sql` | 테이블·FK·고유 제약·기본 카테고리·작성자 불변·답글 구조 |
| `20261019000200_access.sql` | RLS, 컬럼별 조회 권한, 화면용 뷰, 비공개 버킷 정책 |
| `20261019000300_administration.sql` | 역할·상태 변경과 감사 기록, 마지막 운영자 보호, 서버 전용 초기 설정 |
| `20261019000400_limits.sql` | 공통 설정의 DB 버전 기록과 일치 검증 기준 |
| `20261020000100_invitation_auth.sql` | 원자적 초대 가입, 계정별 요청 제한, 운영자 초대 발급·관리 |

`public`에는 계정 ID와 이메일이 없는 캐릭터·글·댓글·카테고리·투표 설정을 둡니다. `assets`는 public 스키마에 있어도 일반 역할에 조회 권한을 주지 않습니다. 저장 경로를 직접 조회하는 API는 추후 권한 검사와 함께 추가합니다.

`private`에는 회원 정보, 캐릭터·콘텐츠·자산의 소유 계정, 초대 해시와 사용 기록, 투표 참여 원시 정보, 운영 기록, 설정을 둡니다. `private`는 Data API 노출 대상에서 제외합니다. 정책 실행에 필요한 스키마 USAGE와 일부 boolean 권한 함수의 EXECUTE만 authenticated 역할에 주며 테이블 SELECT는 주지 않습니다.

일반 조회는 활성 회원과 정상 콘텐츠에 한정합니다. 운영자도 일반 피드 경로로 숨김·삭제 본문을 조회할 수 없습니다. 댓글 삭제 자리를 표시하는 전용 응답은 5단계에서 추가하며 현재 삭제 댓글의 본문·작성자는 반환하지 않습니다. 정상 답글은 유지합니다.

`feed_posts`, `visible_comments`는 `security_invoker` 뷰입니다. 기반 테이블의 RLS를 적용하고 허용 컬럼을 명시합니다. 테이블 권한도 컬럼별로 부여해 이후 추가되는 민감 컬럼이 자동 공개되지 않게 합니다. public 새 객체의 자동 노출을 끄고 신규 함수의 기본 실행 권한도 회수합니다.

현재 API로 직접 INSERT/UPDATE/DELETE를 할 수 없습니다. 관리자도 글 본문을 직접 수정할 수 없습니다. 캐릭터 6개, 본문 구조 검증·평문 생성, 투표 최소 선택지 수·참여 후 설정 고정 등의 기능별 검증은 해당 쓰기 RPC를 여는 단계에서 구현합니다. 이미 존재하는 DB 제약만으로 전체 기능 완료를 주장하지 않습니다.

`shared/limits.json`을 정책 기준으로 사용하고 DB의 버전 기록과 테스트로 비교합니다. 이름·제목·댓글 등 길이 제약, 이미지 위치 1~4, 투표 선택지 위치 1~10, 참여 계정 고유 제약을 적용했습니다. 제한값 변경 시 **새 마이그레이션으로 실제 제약과 DB 설정 기록을 함께 변경**하고 경계값 테스트를 갱신합니다. 적용된 과거 마이그레이션을 수정하지 않습니다.

## 제공하는 RPC

| 함수 | 호출자 | 반환/동작 |
| --- | --- | --- |
| `redeem_invite(invite_code)` | 이메일 인증된 계정 | 가입·코드 소진 원자 처리, 멱등성, 15분/5회 제한 |
| `issue_invite(valid_days, use_limit)` | 활성 운영자 | 해시 저장, 발급 시에만 원문 반환 |
| `list_invites()` | 활성 운영자 | 최근 100개 초대 상태, 원문·해시 제외 |
| `update_invite(target_id, expiry, use_limit, revoke_code)` | 활성 운영자 | 만료·한도 조정·폐기와 감사 기록 |
| `current_membership()` | 로그인 계정 | 본인의 role/status만. 미가입은 빈 결과, 정지 계정은 본인 상태만 확인 |
| `change_member_role(target_user_id, new_role, reason)` | 활성 운영자 | member/admin 변경, 감사 기록 |
| `change_member_status(target_user_id, new_status, reason)` | 활성 운영자 | active/suspended 변경, 감사 기록 |
| `get_moderation_logs(before_id, page_size)` | 활성 운영자 | 최근 기록부터 페이지 조회, 최대 100개 |

호출자 ID는 요청 파라미터로 받지 않고 `auth.uid()`로 판단합니다. 대상 계정 ID와 호출자 계정 ID를 구분합니다. 회원 목록/운영 화면은 6단계에서 안전한 관리자 전용 조회 경로와 함께 구현합니다.

역할·상태 변경은 하나의 guard 행을 갱신해 직렬화하고, 잠금 획득 후 운영자 자격을 다시 확인합니다. 마지막 활성 운영자의 강등·정지·삭제는 DB 트리거에서도 거부합니다. 오래된 트랜잭션 스냅샷에서는 직렬화 오류로 안전하게 실패할 수 있으므로 이후 클라이언트에서 재시도/충돌 안내를 처리해야 합니다.

모든 SECURITY DEFINER 함수는 빈 `search_path`와 완전 수식 객체명을 사용합니다. 실패한 권한 변경과 감사 기록은 같은 트랜잭션에서 롤백됩니다.

## 비공개 이미지

`community` 버킷은 private, 입력 한도 10 MiB, JPEG/PNG/WebP 허용입니다. 활성 회원만 정상 콘텐츠 또는 활성 캐릭터가 참조하는 검증 완료 자산을 읽습니다. 숨긴 글만 참조하는 이미지, 임시·미참조 자산은 읽을 수 없습니다. 과거 글에 남은 작성자 프로필 참조는 캐릭터 상태와 독립적으로 보존합니다.

Storage INSERT/UPDATE/DELETE 정책은 아직 열지 않습니다. MIME·용량 메타데이터 검사만으로 파일 검증이 완료된 것은 아닙니다. 5단계에 파일 내용 검증, 애니메이션 차단, EXIF 제거, 압축과 썸네일, 안전한 첨부 확정 및 정리를 추가합니다. 서명 URL의 짧은 만료와 정지 시 캐시 정리도 해당 연결 단계에서 검증합니다.

## 검증 방법

Node 내장 테스트 러너 + `pg`를 사용합니다. 준비·정리는 SQL owner 및 Auth 관리 키를 쓰지만, 권한 검증은 별도 세션의 `SET LOCAL ROLE authenticated/anon`과 각 사용자 JWT 컨텍스트에서 수행합니다. 추가로 실제 Auth 로그인으로 얻은 서로 다른 JWT로 PostgREST와 Storage에 요청합니다.

`src/types/database.ts`는 실제 DB의 public 스키마에서 생성하며 Supabase 클라이언트에 적용합니다. 내부 private 테이블 타입은 브라우저에 제공하지 않습니다. `pnpm db:types`로 재생성하고 CI에서 결과가 스키마와 일치하는지 검사합니다. DB 타입은 객체 존재 정보를 나타낼 뿐 호출 권한을 보장하지 않습니다.

참고: [로컬 CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [native 실행](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage 권한](https://supabase.com/docs/guides/storage/security/access-control).

## 초대 가입 트랜잭션

`redeem_invite`는 `auth.uid()`와 `auth.users.email_confirmed_at`을 확인합니다. 회원 변경과 동일한 guard 잠금을 먼저 획득하고 현재 상태를 다시 검사해 정지와 가입이 경합해도 안전하게 처리합니다. 초대 행의 사용 가능 여부를 잠금 안에서 확인하고 회원 등록·사용 기록·소진을 함께 커밋합니다. 이미 활성 회원이면 다른 코드를 보내도 추가 소진하지 않습니다.

실패 횟수를 보존하기 위해 도메인 오류는 SQL 예외 대신 `INVALID_INVITE`, `RATE_LIMITED`, `EMAIL_REQUIRED`, `AUTH_REQUIRED`, `SUSPENDED` 값을 반환합니다. 성공은 `JOINED` 또는 `ALREADY_MEMBER`입니다. `private.invite_attempts`는 Auth 계정당 최대 한 행이며 15분 창이 지나면 재사용합니다. 회원이 되면 삭제하고 Auth 계정 삭제 시 연쇄 정리합니다. 요청 제한 기록에도 초대 원문을 보관하지 않습니다.

운영자용 API는 잠금 후 권한을 재확인하며 소유자 UUID를 브라우저 입력으로 신뢰하지 않습니다. 초대 발급·변경의 감사 기록에는 초대 ID만 남깁니다. HTTP 요청 본문/SQL 바인딩 전체를 수집하는 로깅을 추가할 때 초대 코드·비밀번호·토큰을 반드시 제외합니다.
