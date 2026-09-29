# carol

**maimai DX NET** 프로필을 Discord에서 확인하는 봇입니다.

북마클릿 방식으로 브라우저의 로그인 세션을 활용하여, SEGA 인증 우회 없이 프로필·기록·레이팅 데이터를 Discord 임베드/이미지로 표시합니다. 서버는 SEGA 계정 정보(아이디/비밀번호)를 절대 입력받지 않고, 사용자가 이미 로그인해 둔 브라우저에서 실행한 북마클릿이 보내주는 HTML만 받아 파싱합니다.

## 목차

- [주요 기능](#주요-기능)
- [아키텍처](#아키텍처)
- [기술 스택](#기술-스택)
- [요구사항](#요구사항)
- [빠른 시작](#빠른-시작)
- [설정 (config.json)](#설정-configjson)
- [환경 변수](#환경-변수)
- [웹 경로](#웹-경로)
- [명령어](#명령어)
- [사용 방법](#사용-방법)
- [개인정보와 보안](#개인정보와-보안)
- [봇 초대](#봇-초대)
- [개발 문서](#개발-문서)
- [라이선스](#라이선스)

## 주요 기능

- **프로필 조회** — 닉네임, 레이팅, 칭호, 플레이 횟수, 등급, 아바타, 스타 수
- **최근 플레이** — 게임 단위로 페이징(최근 5판), 판마다 달성률/난이도/레벨/재킷 이미지, 곡별 개별 공유 버튼
- **TOP 5 · 레이팅 포함곡** — 곡별 최고 달성률 기준 상위 5곡, 레이팅 계산에 실제로 포함된 곡 목록
- **레이팅표 이미지** — 레이팅 대상곡 전체를 PNG 카드로 렌더링 (satori + resvg, 동기화 시점 기준 캐시)
- **타 게임 레이팅 치환** — 같은 기록을 CHUNITHM / SOUND VOLTEX / Arcaea 의 레이팅 체계로 환산해 표시. 게임별 곡 선정 규칙·레이팅 공식·점수/난이도/마크/레벨 표기를 각 게임 기준으로 변환
- **레이팅 기준표** — 레이팅 티어별 기준 점수/역할 안내
- **일일 성과 (`/성과`)** — 한국시간 오전 4시를 하루 기준으로, 그날 실제로 오른 채보만 모아 카드 이미지로 표시. 달성률·FC·SYNC 등급이 실제로 개선된 경우만 집계하며(참여만 해도 붙는 기본 SYNC 등급은 제외), 5개 단위로 이미지를 나눠 첨부해 SNS 공유가 쉽습니다. 사용자마다 "최소 인정 달성률" 임계값을 웹 설정에서 조정 가능
- **곡 검색** — 클리어 기록에서 곡명(별명 포함) 부분 일치 검색, ST/DX 타입 필터
- **곡 별명 관리** — 검색/표시용 별명, 그중 하나를 곡의 한국어 번역으로 지정 가능 (설정에서 "곡 제목 한국어 번역" 토글)
- **봇 문구 관리** — 봇이 출력하는 문구를 관리 페이지에서 수정. 기본값은 `src/messages.ts`, 수정분은 `bot_messages` 테이블에 저장되며 저장 즉시 반영. 자리표시자·길이를 검증하고 기본값 복원 가능
- **랜덤 추천 (`/랜덤`) · 곡 추천 (`/곡추천`)** — 상수 범위/난이도/장르/버전/플레이 여부 등 조건에 맞는 채보를 무작위 추천하거나, 레이팅 대상곡 기반으로 점수를 올리기 좋은 채보를 추천
- **오늘의 운세 (`/운세`)** — 하루에 한 곡씩 추천
- **지방(맵) 진행도 (`/지방`)** — maimai DX 지방 이벤트 진행 상황을 페이지/공유 가능한 카드로 표시
- **서버 자동 역할** — 길드별로 레이팅 티어에 맞춰 Discord 역할을 자동 부여/설정 (관리자 전용 `/서버설정`)
- **버그·문의 제보** — `/문의` 명령 또는 메시지 우클릭 "이슈로 등록"으로 GitHub 이슈 자동 등록 (carol-issue 연동 시에만 활성화)
- **멀티유저 · 멀티서버(INTL/JP)** — Discord 유저별 독립 프로필, 국제판/일본판 프로필을 각각 연동해 전환 가능

## 아키텍처

```
Discord "/북마클릿" → 설치 가이드 링크(고유 동기화 토큰) 발급
       ↓
사용자가 maimai DX NET에 로그인된 브라우저에서 북마클릿 실행
(브라우저 쿠키를 그대로 사용 — SEGA 계정 정보는 서버로 전송되지 않음)
       ↓
프로필/최근 기록/클리어 기록/레이팅 대상곡 HTML을 POST /sync 로 전송
       ↓
src/scraper.ts (Cheerio) 로 파싱
       ↓
src/storage/postgres.ts (PostgreSQL) 에 프로필·세션·성과 이벤트 저장
       ↓
Discord 슬래시 커맨드 / 버튼 → 임베드 또는 satori+resvg PNG 카드로 표시
```

## 기술 스택

| 기술 | 용도 |
|------|------|
| TypeScript (strict, CommonJS/ES2022) | 전체 코드베이스 |
| discord.js v14 | Discord 봇 클라이언트, 슬래시 커맨드 |
| Node.js `http` (raw) | 웹 서버 — Express/라우터 없이 수동 라우팅 |
| cheerio | maimai DX NET HTML 파싱 |
| satori + @resvg/resvg-js | 레이팅표/성과 카드 PNG 렌더링 (JSX 없이 `el()` 헬퍼로 구성) |
| PostgreSQL (`DATABASE_URL`) | 프로필/세션/성과 이벤트 로그 등 모든 영속 데이터 |
| AES-256-GCM | 세션 쿠키 암호화 |
| Docker + Compose | 컨테이너 배포 (PostgreSQL + bot + cloudflared) |
| Cloudflare Tunnel | 열린 포트 없이 무료 HTTPS 제공 |
| GitHub Actions | `master` 푸시 시 GHCR 이미지 빌드 및 배포 |

## 요구사항

- Node.js 22.x (Docker 이미지 기준. `package.json`의 `@types/node` 등은 그보다 넓은 범위를 허용하지만, 배포 환경과 동일하게 22로 맞추는 걸 권장합니다)
- PostgreSQL 14+ (로컬 개발도 Postgres가 필요합니다 — SQLite/인메모리 폴백 없음)
- Discord 애플리케이션(봇 토큰 + Application ID) — [Discord Developer Portal](https://discord.com/developers/applications)에서 생성

## 빠른 시작

### 로컬(직접 실행)

Postgres가 이미 있고 `DATABASE_URL`을 바로 쓸 수 있는 경우:

```bash
git clone https://github.com/team-carol/carol.git
cd carol
npm install
cp config.json.example config.json
# config.json 편집 (token, clientId 입력)

export DATABASE_URL="postgresql://user:pass@localhost:5432/carol"  # PowerShell: $env:DATABASE_URL
npm run build
npm start
```

- `npm run dev` — `ts-node`로 봇 + 웹 서버를 함께 실행 (빌드 없이 바로 확인)
- `npm run dev:web` — 웹 서버만 실행 (Discord 토큰/로그인 없이 `/sync`, `/settings` 등 로컬 확인용)
- `npm run test:integration` — `npm run build` 후 PostgreSQL 통합 테스트 실행 (`DATABASE_URL` 필요)

### Docker Compose (권장 — Postgres까지 한 번에)

```bash
cp .env.example .env
# .env 편집: POSTGRES_PASSWORD, DATABASE_URL (같은 비밀번호로 맞추기)
cp config.json.example config.json
# config.json 편집 (token, clientId 입력)

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

PostgreSQL 컨테이너, 봇 컨테이너(Node 22 빌드)를 함께 띄우고 시작 시 번호가 매겨진 마이그레이션이 자동 적용됩니다. `docker-compose.dev.yml`은 base compose의 Cloudflare 터널을 제외하고 봇 포트(3456)를 호스트에 바로 노출합니다.

원격/프로덕션 배포(GHCR 이미지 + Cloudflare Tunnel)는 [`docs/DEPLOY.md`](docs/DEPLOY.md)를 참고하세요.

## 설정 (config.json)

런타임 설정은 `.env`가 아니라 저장소 루트의 `config.json`(`config.json.example`을 복사)입니다.

```jsonc
{
  "token": "DISCORD_BOT_TOKEN",
  "clientId": "APPLICATION_ID",
  "guildId": "TEST_GUILD_ID",     // 선택: 특정 서버에만 명령어 즉시 등록 (개발용)
  "webPort": 3456,                // 웹 서버 포트
  "encryptionKey": "",            // 빈 값이면 최초 실행 시 자동 생성 후 이 파일에 다시 기록됨
  "baseUrl": "",                  // 프로덕션에서만 입력 (비우면 로컬 개발 모드로 동작)
  "discordInviteUrl": "",         // 선택: /invite 리다이렉트 대상 URL
  "aliasAdminGuildId": "",        // 선택: /관리 (별명·문구 관리)를 허용할 guildId
  "carolIssueBaseUrl": "",        // 선택: carol-issue 제보 연동 주소
  "carolSharedSecret": "",        // 선택: carol-issue와 동일한 공유 secret (hex)
  "carolIssueGuildId": ""         // 선택: DM 제보 시 대표 guildId (없으면 DM 채널 ID로 폴백)
}
```

- **`encryptionKey`**: 최초 실행 시 비어 있으면 32자 랜덤 키를 생성해 이 파일에 **직접 다시 기록**합니다. 첫 실행 이후에는 `config.json`을 덮어쓰지 말고, 값이 생성된 뒤에는 그대로 보관하세요(바뀌면 저장된 세션 쿠키를 복호화할 수 없게 됩니다).
- **`baseUrl`**: 비워두면 `http://localhost:{webPort}`를 로컬 개발 URL로 사용하고 `/sync`, `/settings`를 토큰 없이도 미리보기할 수 있습니다. Cloudflare Tunnel 등으로 배포한 뒤에는 반드시 공개 HTTPS URL을 입력해야 북마클릿이 올바른 주소로 동작합니다.
- **`discordInviteUrl`**: 비워두면 `/invite`가 `clientId` 기준으로 기본 초대 링크(`permissions=2415938560`, `integration_type=0`, `scope=applications.commands bot`)를 생성합니다. 권한을 직접 조정한 OAuth2 URL이 있다면 여기에 넣으세요.
- **`aliasAdminGuildId`**: `/관리` 명령으로 관리 웹페이지(곡 별명·봇 문구)를 열 수 있는 서버(guild) ID. 비워두면 어디서도 `/관리`가 비활성화됩니다. 별명 데이터는 PostgreSQL `song_aliases` 테이블에 저장되며 최초 실행 시 번들 시드(`src/data/aliasSeed.ts`)로 자동 채워집니다.
- **`carolIssueBaseUrl` / `carolSharedSecret`**: [carol-issue](https://github.com/team-carol) 제보 연동. 둘 다 채워야 `/문의`·"이슈로 등록"이 활성화됩니다. secret은 carol-issue의 `CAROL_SHARED_SECRET`과 동일해야 합니다.
- **`carolIssueGuildId`**: DM에서 제보할 때 payload에 넣을 `guildId` 폴백값.

## 환경 변수

`config.json`과 별개로, 아래 값은 **환경 변수로만** 읽습니다 (Docker Compose는 `.env.example`을 참고해 `.env`로 주입).

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열. 없으면 부팅 시 즉시 에러로 종료됩니다. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Docker Compose만 | `docker-compose.yml`의 `postgres` 서비스 초기화용 |
| `CF_TUNNEL_TOKEN` | 원격 배포만 | Cloudflare Zero Trust에서 발급한 터널 토큰 (`cloudflared` 서비스) |
| `RELEASE_VERSION` / `BUILD_VERSION` | 선택 | `/api/stats`, `/상태`가 표시할 배포 버전 문자열 (CI가 주입) |

## 웹 경로

| 경로 | 설명 |
|------|------|
| `GET /invite` | Discord 봇 초대 링크로 302 리다이렉트 |
| `GET /api/stats` | 공개 통계 JSON (`userCount`, `serverCount`, `version`) — 랜딩 페이지용, CORS 허용 |
| `GET /sync?code=...` | 북마클릿 설치 가이드 (PC/모바일) |
| `POST /sync?code=...` | 북마클릿이 수집한 HTML을 받아 파싱·저장하는 실제 동기화 엔드포인트 |
| `GET /bookmarklet.js?code=...` | 활성화된 프리셋/추가 북마클릿을 포함한 동기화 JS 생성 |
| `GET /settings?code=...` | 개인정보 공개 여부, 기본 서버(INTL/JP), 곡 제목 한국어 번역, 성과 최소 달성률, 프리셋/추가 북마클릿 관리 |
| `GET /api/settings` · `POST /api/settings/*` | 위 설정 페이지가 사용하는 JSON API |
| `GET /avatar` · `GET /jacket` | 캐시된 아바타/곡 자켓 PNG |
| `GET /admin?code=...` | 관리 페이지 진입점 (`/관리`로 발급한 토큰 필요) |
| `GET /admin/aliases?code=...` | 곡 별명 관리 탭 |
| `GET /admin/messages?code=...` | 봇 문구 관리 탭 |
| `POST /api/admin/aliases`, `/delete`, `/translation` | 별명 관리 API |
| `POST /api/admin/messages`, `/reset` | 문구 저장·기본값 복원 API |
| `GET /privacy` · `GET /terms` | 개인정보처리방침 · 이용약관 정적 페이지 |

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/프로필 [user] [형식]` | 연동된 maimai DX NET 프로필 표시. 기본은 이미지 카드(레이팅 구성·레이팅 추이 그래프·클리어 현황·최근 플레이 5곡), `형식:임베드` 로 기존 임베드 |
| `/북마클릿` | 설치 가이드 링크 버튼 표시 (추가 북마클릿 등록/삭제는 `/settings` 웹 페이지에서) |
| `/최근` (버튼) | `/프로필` 응답의 버튼으로 최근 플레이 페이지 이동 — 별도 슬래시 커맨드 없음 |
| `/레이팅기준표` | 레이팅 티어 기준표 표시 |
| `/레이팅표 [user] [게임]` | 레이팅 대상곡을 PNG 카드로 표시. `게임` 으로 maimai DX / CHUNITHM / SOUND VOLTEX / Arcaea 레이팅 체계 환산 (생략 시 maimai DX) |
| `/성과 [user] [date]` | 한국시간 04:00 기준 하루 동안 실제로 오른 성과를 카드 이미지로 표시 (5개씩 여러 장) |
| `/검색 title [type] [user]` | 클리어 기록에서 곡명(별명 포함) 검색, ST/DX 타입 필터 |
| `/랜덤 [범위최소] [범위최대] [타입] [난이도] [장르] [버전] [plus] [플레이여부] [개수] [user]` | 조건에 맞는 채보를 무작위로 추천 |
| `/곡추천 [type] [플레이여부] [난이도] [곡분류] [user]` | 레이팅 대상곡 기준으로 점수 올리기 좋은 채보 추천 |
| `/운세` | 오늘의 추천곡 한 곡 |
| `/지방` | maimai DX 지방 진행도 카드 표시 |
| `/설정` | 웹 설정 페이지 링크 안내 |
| `/게임설정` | 게임 옵션 확인·옵션 프리셋 편집 페이지 링크 안내 |
| `/서버설정` | 서버 자동 역할 설정 관리 (관리자 전용) |
| `/관리` | 관리 웹페이지 열기 — 곡 별명·봇 문구 탭 (`aliasAdminGuildId` 서버 전용) |
| `/상태` | 봇/서버 상태, 배포 버전 확인 |
| `/문의` | 모달에 작성한 내용을 GitHub 이슈로 등록 (미리보기 후 생성) |

> 메시지 우클릭 → 앱 → **"이슈로 등록"** 컨텍스트 메뉴로도 제보할 수 있습니다. `/문의`·"이슈로 등록"은 `carolIssueBaseUrl`/`carolSharedSecret`이 설정된 경우에만 동작합니다.

## 사용 방법

1. `/북마클릿` 실행 후 **설치 가이드 열기** 버튼을 누릅니다.
2. PC는 버튼을 북마크바로 드래그하고, 모바일은 복사 버튼으로 북마클릿 코드를 복사해 북마크 URL에 붙여넣습니다.
3. [maimai DX NET](https://maimaidx-eng.com/maimai-mobile/)에 로그인된 상태에서 저장한 북마클릿을 실행합니다.
4. `완료!` 알림 확인 후 `/프로필`, `/성과`, `/레이팅표`, `/검색` 등을 사용합니다.
5. 필요하면 `/설정`으로 웹 설정 페이지에 들어가 프로필 공개 여부, 친구 코드 공개 여부(기본 비공개, 켜면 `/프로필`에 표시), 기본 서버(INTL/JP), 곡 제목 한국어 번역, 성과 최소 인정 달성률 등을 조정합니다.

## 개인정보와 보안

- SEGA 계정 아이디/비밀번호는 **어떤 경로로도 서버에 전송되거나 저장되지 않습니다.** 북마클릿은 사용자의 브라우저에서 실행되며, 이미 로그인된 세션의 쿠키/HTML만 서버로 전달합니다.
- 세션 쿠키는 AES-256-GCM으로 암호화되어 저장됩니다.
- 프로필은 기본 공개이며, `/설정` 웹 페이지에서 언제든 비공개로 전환할 수 있습니다. 비공개로 전환하면 다른 사람이 `/프로필`, `/성과` 등으로 조회할 수 없습니다.
- 자세한 내용은 배포된 인스턴스의 `/privacy`, `/terms` 페이지를 참고하세요.

## 봇 초대

배포된 `baseUrl` 기준으로 `https://your-domain.example/invite`에 접속하면 Discord 초대 링크로 이동합니다. 기본 초대 링크는 `clientId`에서 생성되며, 자동 역할 기능에 필요한 권한값 `2415938560`을 포함합니다. 권한을 직접 조정하려면 Discord Developer Portal에서 만든 OAuth2 URL을 `discordInviteUrl`에 넣으세요.

## 개발 문서

- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — 버전 정책, 릴리스 체크리스트, 커밋 컨벤션, 검증 기준
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — 원격/로컬 Docker Compose 배포 방법
- [`docs/DESIGN.md`](docs/DESIGN.md) — 웹/이미지 UI 색상, 타이포그래피, 컴포넌트 토큰
- [`AGENTS.md`](AGENTS.md) — 코드베이스 전체 지도 (AI 코딩 어시스턴트용, 사람이 읽어도 유용)

## 라이선스

MIT © 2026 BitByte08
