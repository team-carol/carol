# maimai DX net Discord Bot

## 준비물

| 항목 | 설명 | 얻는 곳 |
|------|------|---------|
| maimai DX net 계정 | 이미 로그인된 브라우저 필요 | https://maimaidx-eng.com/maimai-mobile/ |
| Discord 봇 토큰 + App ID | 봇 인증용 | https://discord.com/developers/applications |
| Node.js | v18 이상 | https://nodejs.org |

## 아키텍처

```
사용자 → /프로필 → 북마클릿 코드 받음
→ maimai DX net에서 북마클릿 실행 (브라우저의 쿠키 사용)
→ HTML 데이터 수집 → 로컬 서버로 전송
→ Discord에 프로필 임베드 표시
```

## 설치 & 실행

```powershell
npm install
copy config.json.example config.json
# config.json 수정 (token, clientId, guildId 입력)
npm run build
npm start          # or: npm run dev (ts-node)
```

## config.json

```json
{
  "token": "MTIzNDU2Nzg5...",
  "clientId": "123456789012345678",
  "guildId": "123456789012345678",
  "webPort": 3456,
  "encryptionKey": "",
  "baseUrl": ""
}
```

- `encryptionKey`: 빈 값이면 자동 생성. 유출 금지
- `baseUrl`: 로컬 개발 시 빈 값 유지. 프로덕션에서는 `https://도메인`

## 봇 초대

Discord Developer Portal → OAuth2 → URL Generator
- Scopes: `bot`, `applications.commands`
- Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/프로필` | 내 프로필 보기 (첫 실행 시 북마클릿 등록 안내) |
| `/친구검색 <13자리코드>` | 타인 프로필 검색 (캐시된 경우만) |

## 사용 방법

1. `/프로필` 입력 → 북마클릿 코드가 표시됨
2. https://maimaidx-eng.com/maimai-mobile/ 에 접속 (이미 로그인된 상태)
3. 브라우저 콘솔(F12)에 북마클릿 코드 붙여넣기 → 엔터
4. "완료!" 알림 확인
5. `/프로필` 재실행 → 프로필 임베드 표시
6. 하단 드롭다운: 최근 플레이 / TOP 5 전환

## 멀티유저

각 Discord 유저에게 고유 sync token이 발급되며, 동일한 /프로필 명령어가 유저별로 독립된 북마클릿을 생성합니다.

- 유저 A가 자기 maimai 계정으로 북마클릿 실행 → A의 프로필 저장
- 유저 B가 자기 maimai 계정으로 북마클릿 실행 → B의 프로필 저장
- `/친구검색`은 캐시 공유

## 파일

| 파일 | 용도 |
|------|------|
| `maimai.db` | SQLite — 프로필 캐시 + 암호화된 세션 + 아바타 |
| `config.json` | Discord 토큰 + 암호화 키 (gitignore 등록) |
| `debug_*.html` | 디버깅용 마지막 동기화 HTML 덤프 |

## 보안

| 항목 | 상태 |
|------|------|
| maimai 통신 | HTTPS |
| DB 세션 토큰 | AES-256-GCM 암호화 |
| Discord 토큰 | config.json, gitignore 등록 |
| DB 파일 | maimai.db, gitignore 등록 |

## GCP 배포

[DEPLOY.md](./DEPLOY.md) 참조
