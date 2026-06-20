# GCP 배포 가이드

## 아키텍처

```
Cloudflare (HTTPS, CDN)
  → GCP VM
    → nginx:443 (Cloudflare Origin Certificate)
      → bot:3456 (Node.js, internal only)
        → SQLite (persistent volume)
```

## 1. GCP VM 준비

### Compute Engine 생성
- **리전**: asia-northeast3 (서울) 또는 asia-east1 (대만)
- **머신**: e2-micro (무료 티어) 또는 e2-small
- **OS**: Ubuntu 24.04 LTS
- **디스크**: 20GB (기본)
- **방화벽**: HTTP(80), HTTPS(443) 허용

### VM 접속 후 초기 설정
```bash
# Docker 설치
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
# 재로그인

# 방화벽
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 작업 디렉토리
mkdir -p ~/maimai/nginx/certs
```

## 2. Cloudflare 설정

### DNS
- A 레코드: `maimai` → VM 외부 IP (프록시 ON, 오렌지 구름)

### SSL/TLS
- **모드**: Full (strict)
- **Origin Certificate**: SSL/TLS → Origin Server → Create Certificate
  - `origin.pem` → `~/maimai/nginx/certs/origin.pem`
  - `origin-key.pem` → `~/maimai/nginx/certs/origin-key.pem`

## 3. 봇 설정

### config.json
```bash
cp config.json.example config.json
nano config.json
```
```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_DISCORD_APPLICATION_ID",
  "guildId": "YOUR_GUILD_ID",
  "webPort": 3456,
  "encryptionKey": "자동생성-또는-직접입력-32글자이상",
  "baseUrl": "https://maimai.yourdomain.com"
}
```

- `guildId`: 없으면 글로벌 커맨드 등록 (반영에 1시간 소요)
- `encryptionKey`: 비우면 자동 생성. 유출 금지
- `baseUrl`: Cloudflare DNS로 설정한 도메인. 북마클릿에 사용

## 4. 배포

### 수동 배포 (최초)
```bash
cd ~/maimai
docker compose up -d --build
```

### CI/CD 배포 (GitHub Actions)

#### GitHub Secrets 설정
Settings → Secrets and variables → Actions → Repository secrets

| Secret | 값 |
|--------|----|
| `GCP_HOST` | VM 외부 IP |
| `GCP_USER` | SSH 사용자 이름 (보통 `$USER`) |
| `GCP_SSH_KEY` | SSH 개인키 (`cat ~/.ssh/id_ed25519`) |

#### VM에 SSH 키 등록
```bash
# 로컬에서
ssh-keygen -t ed25519 -f ~/.ssh/maimai-deploy
cat ~/.ssh/maimai-deploy.pub | ssh user@vm-ip "cat >> ~/.ssh/authorized_keys"
```

#### Git Push → 자동 배포
```bash
git push origin main
# → GitHub Actions: SSH 접속 → git pull → docker build → docker up
```

### 제로 다운타임
- `docker compose up -d --no-deps bot` — 기존 nginx는 유지, bot만 재생성
- `better-sqlite3` WAL 모드로 동시성 안전
- nginx는 `depends_on: bot` 이지만 재시작 시 일시적 502 → Cloudflare가 캐시

## 5. 확인

```bash
# 컨테이너 상태
docker compose ps

# 로그
docker compose logs -f bot

# 헬스체크
curl -s http://localhost:3456/
```

- Discord에서 `/프로필` 명령어 실행
- 북마클릿 코드 확인 및 maimai DX net에서 실행
- 프로필 + 아바타 정상 표시 확인

## 6. 문제 해결

| 문제 | 확인 |
|------|------|
| Discord 봇 응답 없음 | `docker compose logs bot` |
| 북마클릿 연결 안 됨 | `baseUrl` 정확한지, Cloudflare 프록시 ON인지 |
| 아바타 안 보임 | `baseUrl`이 HTTPS인지, Origin Cert 유효한지 |
| DB 사라짐 | `ls -la ~/maimai/data/` 볼륨 존재 확인 |
| 재시작 시 DB 초기화 | `DATA_DIR=/app/data` 환경변수 확인 |
| 502 Bad Gateway | `docker compose logs nginx`, bot 컨테이너 실행 중인지 |

## 7. 업데이트

코드 수정 후:
```bash
git add . && git commit -m "fix: ..." && git push origin main
# → GitHub Actions가 자동 배포
```

수동 배포:
```bash
cd ~/maimai && git pull && docker compose up -d --build
```
