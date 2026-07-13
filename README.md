# carol

**maimai DX NET** 프로필을 Discord에서 확인하는 봇입니다.

북마클릿 방식으로 브라우저의 로그인 세션을 활용하여, SEGA 인증 우회 없이 프로필·기록·레이팅 데이터를 Discord 임베드로 표시합니다.

## 주요 기능

- **프로필 조회** — 닉네임, 레이팅, 칭호, 플레이 횟수, 등급, 아바타
- **최근 플레이** — 5곡 + 페이징 (달성률, 난이도, 레벨, 재킷 이미지)
- **TOP 5** — 곡별 최고 달성률 기준 상위 5곡
- **레이팅 포함곡** — 레이팅 계산에 포함된 곡 목록
- **곡 검색** — 내 클리어 기록에서 곡명 일부 일치 검색
- **레이팅표 이미지** — 레이팅 대상곡을 PNG 카드로 렌더링
- **서버 자동 역할** — 레이팅 티어별 Discord 역할 자동 부여 설정
- **멀티유저** — 각 Discord 유저별 독립 프로필 연동

## 아키텍처

```
Discord → /프로필 → 북마클릿 코드 받음
→ maimai DX net에서 북마클릿 실행 (브라우저 쿠키 사용)
→ HTML 수집 → 봇 서버로 전송 → SQLite 저장
→ Discord 임베드로 표시
```

## 기술 스택

| 기술 | 용도 |
|------|------|
| TypeScript | 전체 코드베이스 |
| discord.js v14 | Discord 봇 |
| cheerio | maimai DX net HTML 파싱 |
| better-sqlite3 | 프로필/세션 캐시 |
| AES-256-GCM | 세션 토큰 암호화 |
| Docker + Compose | 컨테이너 배포 |
| Cloudflare Tunnel | 무료 HTTPS (열린 포트 없음) |
| GitHub Actions | CI/CD 자동 배포 (GHCR) |

## 빠른 시작

```bash
git clone https://github.com/team-carol/carol.git
cd carol
npm install
cp config.json.example config.json
# config.json 편집 (token, clientId 입력)
npm run build
npm start
```

## 설정

```jsonc
{
  "token": "DISCORD_BOT_TOKEN",
  "clientId": "APPLICATION_ID",
  "guildId": "TEST_GUILD_ID",        // 선택: 특정 서버에만 명령어 등록
  "webPort": 3456,               // 웹 서버 포트
  "encryptionKey": "",           // 빈 값이면 자동 생성
  "baseUrl": "",                 // 프로덕션에서만 입력
  "discordInviteUrl": "",        // 선택: /invite 리다이렉트 대상
  "aliasAdminGuildId": "",       // 선택: /별명 곡 별명 관리 허용 guildId
  "carolIssueBaseUrl": "",       // 선택: carol-issue 제보 연동 주소
  "carolSharedSecret": "",       // 선택: carol-issue와 동일한 공유 secret
  "carolIssueGuildId": ""        // 선택: DM 제보용 대표 guildId
}
```

- `baseUrl`: 비워두면 `http://localhost:{webPort}`를 사용합니다. Cloudflare Tunnel 등으로 배포하면 공개 HTTPS URL을 입력하세요.
- `discordInviteUrl`: 비워두면 `/invite`가 `clientId`로 기본 초대 링크를 생성합니다. 기본 권한은 `permissions=2415938560`, `integration_type=0`, `scope=applications.commands+bot`입니다. 권한 값을 직접 조정한 긴 OAuth2 URL이 있다면 여기에 넣으면 됩니다.
- `aliasAdminGuildId`: `/별명` 명령으로 곡 별명 관리 웹페이지를 열 수 있는 서버(guild) ID입니다. 비워두면 어디서도 `/별명`이 비활성화됩니다. 곡 별명 데이터는 SQLite(`song_aliases` 테이블)에 저장되며, 최초 실행 시 번들된 시드(`src/data/aliasSeed.ts`)로 자동 채워집니다.
- `carolIssueBaseUrl` / `carolSharedSecret`: [carol-issue](https://github.com/team-carol) 제보 연동. 둘 다 채워야 `/문의`·"이슈로 등록"이 활성화됩니다. secret은 carol-issue의 `CAROL_SHARED_SECRET`과 동일해야 합니다.
- `carolIssueGuildId`: DM에서 제보 시 payload `guildId` 폴백값. 비워두면 DM 채널 ID로 폴백합니다.

## 웹 경로

| 경로 | 설명 |
|------|------|
| `/invite` | Discord 봇 초대 링크로 리다이렉트 |
| `/sync?code=...` | 북마클릿 설치 가이드 및 동기화 진입점 |
| `/settings?code=...` | 개인정보/프리셋/추가 북마클릿 설정 |
| `/admin/aliases?code=...` | 곡 별명 관리 (관리자, `/별명`으로 발급한 토큰 필요) |
| `/privacy` | 개인정보처리방침 |
| `/terms` | 이용약관 |

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/프로필 [user]` | 연동된 maimai DX NET 프로필 표시 |
| `/북마클릿 [action] [이름] [코드]` | 설치 가이드 열기, 추가 북마클릿 등록/목록/삭제 |
| `/레이팅기준표` | 레이팅 티어 기준표 표시 |
| `/레이팅표 [user]` | 레이팅 대상곡을 이미지로 표시 |
| `/설정` | 웹 설정 페이지 안내 |
| `/서버설정` | 서버 자동 역할 설정 관리 (관리자 전용) |
| `/검색 title [user]` | 클리어 기록에서 곡명 검색 |
| `/별명` | 곡 별명 관리 웹페이지 열기 (`aliasAdminGuildId` 서버 전용) |
| `/상태` | 봇 및 서버 상태 확인 |
| `/문의` | 모달 팝업에 본문을 작성해 GitHub 이슈로 등록 (미리보기 후 생성) |

> 메시지 우클릭 → 앱 → **"이슈로 등록"** 컨텍스트 메뉴로도 제보할 수 있습니다. `/문의`·"이슈로 등록"은 `carolIssueBaseUrl`/`carolSharedSecret`이 설정된 경우에만 동작합니다.

## 사용 방법

1. `/북마클릿` 실행 후 **설치 가이드 열기** 버튼을 누릅니다.
2. PC는 버튼을 북마크바로 드래그하고, 모바일은 복사 버튼으로 북마클릿 코드를 복사해 북마크 URL에 붙여넣습니다.
3. [maimai DX NET](https://maimaidx-eng.com/maimai-mobile/)에 로그인된 상태에서 저장한 북마클릿을 실행합니다.
4. `완료!` 알림 확인 후 `/프로필`, `/최근 플레이` 버튼, `/레이팅표`, `/검색` 등을 사용합니다.

## 봇 초대

배포된 `baseUrl` 기준으로 `https://your-domain.example/invite`에 접속하면 Discord 초대 링크로 이동합니다. 기본 초대 링크는 `clientId`에서 생성되며, 자동 역할 기능에 필요한 권한값 `2415938560`을 포함합니다. 권한을 직접 조정하려면 Discord Developer Portal에서 만든 OAuth2 URL을 `discordInviteUrl`에 넣으세요.

## 관리자 기능 방향

관리자 화면이 필요해지면 봇 서버에는 API만 두고, 관리자 웹은 별도 프론트엔드로 분리하는 방향이 좋습니다. API-first로 가면 `/api/admin/*` 같은 엔드포인트와 인증 방식을 먼저 고정하고, 별도 API 문서(OpenAPI/Scalar 등)를 함께 관리해야 합니다.

## 개발 문서

- [개발 컨벤션](docs/DEVELOPMENT.md): 버전 정책, 릴리스 체크리스트, 커밋 가이드, 검증 기준
- [디자인 가이드](docs/DESIGN.md): 웹/이미지 UI 색상, 타이포그래피, 컴포넌트 토큰

## 라이선스

MIT © 2026 BitByte08
