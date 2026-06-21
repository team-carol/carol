# 🎵 mymai

**maimai DX NET** 프로필을 Discord에서 확인하는 봇입니다.

북마클릿 방식으로 브라우저의 로그인 세션을 활용하여, SEGA 인증 우회 없이 프로필·기록·레이팅 데이터를 Discord 임베드로 표시합니다.

## 주요 기능

- **프로필 조회** — 닉네임, 레이팅, 칭호, 플레이 횟수, 등급, 아바타
- **최근 플레이** — 5곡 + 페이징 (달성률, 난이도, 레벨, 재킷 이미지)
- **TOP 5** — 곡별 최고 달성률 기준 상위 5곡
- **레이팅 포함곡** — 레이팅 계산에 포함된 곡 목록
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
git clone https://github.com/BitByte08/mymai.git
cd mymai
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
  "webPort": 3456,               // 웹 서버 포트
  "encryptionKey": "",           // 빈 값이면 자동 생성
  "baseUrl": ""                  // 프로덕션에서만 입력
}
```

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/프로필` | 연동된 maimai DX NET 프로필 표시 |
| `/북마클릿` | 동기화용 북마클릿 코드 발급 |

## 사용 방법

1. `/북마클릿` — 북마클릿 코드 받기
2. [maimai DX NET](https://maimaidx-eng.com/maimai-mobile/) 접속 (로그인된 상태)
3. 브라우저 콘솔(F12)에 북마클릿 코드 붙여넣고 실행
4. `완료!` 알림 확인
5. `/프로필` 실행 — 프로필 + 기록 확인

## GCP 배포

```bash
# VM에서
git clone https://github.com/BitByte08/mymai.git
cd mymai
# config.json, .env (CF_TUNNEL_TOKEN) 생성
docker compose pull
docker compose up -d
```

CI/CD: `master` 브랜치 push 시 GitHub Actions가 Docker 이미지 빌드 → GHCR 푸시 → VM 자동 배포.

자세한 내용은 [DEPLOY.md](DEPLOY.md) 참조.

## 라이선스

MIT © 2026 BitByte08
