# GCP 배포 가이드 (Cloudflare Tunnel)

## 아키텍처

```
사용자 ──HTTPS──▶ Cloudflare ──Tunnel──▶ GCP VM ──▶ bot:3456
   ↑                                      ↑
   └─ 인증서 자동 (Cloudflare)         └─ 포트 22(SSH)만 개방
```

**nginx 없음. 인증서 발급/갱신 없음. 80/443 포트 개방 없음.**

## 1. Cloudflare 설정 (먼저)

### 1.1 Tunnel 생성
1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) 접속
2. Networks → Tunnels → **Create a tunnel**
3. Tunnel 이름: `maimai` → Save
4. Connector 선택: **Docker**
5. 표시된 명령어에서 **토큰만 복사** (eyJhIjoi... 긴 문자열)

### 1.2 Public Hostname 설정
1. Tunnel 선택 → Public Hostname → **Add a public hostname**
2. Subdomain: `maimai`
3. Domain: 보유한 도메인 선택
4. Type: `HTTP`
5. URL: `bot:3456`
6. Save

## 2. GCP VM

### 2.1 Compute Engine 생성
- **리전**: asia-northeast3 (서울)
- **머신**: e2-micro (무료 티어)  
- **OS**: Ubuntu 24.04 LTS
- **방화벽**: HTTP/HTTPS **체크 해제** (Tunnel이 처리)
- **디스크**: 20GB

### 2.2 초기 설정
```bash
# Docker 설치
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
# 로그아웃 후 재접속

# 클론 + 디렉토리
mkdir -p ~/maimai/data
cd ~/maimai
git clone https://github.com/BitByte08/maimaiDISCORD.git .
```

## 3. config.json + Tunnel 토큰

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
  "encryptionKey": "",
  "baseUrl": "https://maimai.yourdomain.com"
}
```

```bash
cp .env.example .env
nano .env
# CF_TUNNEL_TOKEN=복사한_토큰_붙여넣기
```

- `baseUrl`: Tunnel Public Hostname 전체 URL
- `encryptionKey`: 비워두면 자동 생성

## 4. 실행

```bash
docker compose up -d
docker compose logs -f   # 확인
```

## 5. CI/CD (GitHub Actions)

### 5.1 Secrets 설정
Settings → Secrets and variables → Actions → Repository secrets

| Secret | 값 |
|--------|----|
| `GCP_HOST` | VM 외부 IP |
| `GCP_USER` | SSH 사용자명 |
| `GCP_SSH_KEY` | SSH 개인키 |

### 5.2 SSH 키 등록
```bash
# 로컬
ssh-keygen -t ed25519 -f ~/.ssh/maimai-deploy -N ""
type ~\.ssh\maimai-deploy.pub

# VM에서
echo "ssh-ed25519 AAAA..." >> ~/.ssh/authorized_keys
```

### 5.3 자동 배포
```bash
git push origin master
# → GitHub Actions: SSH → git pull → docker compose up -d --build bot
```

`--no-deps`로 cloudflared는 유지, bot만 재시작 → **무중단**.

## 6. 확인

```bash
docker compose ps                    # 컨테이너 상태
docker compose logs -f cloudflared   # Tunnel HEALTHY 확인
```

- Discord `/프로필` 실행
- 북마클릿 실행 후 프로필 정상 표시 확인
- `baseUrl` 직접 접속 시 북마클릿 가이드 페이지 확인

## 7. 요약: 누가 뭘 하나

| | Cloudflare | GCP |
|---|---|---|
| **설정** | Tunnel 생성 → 토큰 복사 → Public Hostname 설정 | VM 생성, Docker 설치, `.env`에 토큰 입력, `docker compose up -d` |
| **관리** | 인증서 자동, DNS 자동, DDoS 방어 | `docker compose up -d` 한 줄 |
| **포트** | 없음 (Tunnel이 outbound 연결) | 22(SSH)만 개방 |
| **비용** | 무료 | e2-micro 무료 |

## 8. 문제 해결

| 문제 | 확인 |
|------|------|
| Tunnel 연결 안 됨 | `docker compose logs cloudflared`, 토큰 복사 오타 확인 |
| `baseUrl` 502 | `docker compose ps bot` 실행 중인지 |
| 북마클릿 연결 안 됨 | `baseUrl`이 Tunnel Public Hostname과 일치하는지 |
| Tunnel HEALTHY 아님 | VM 방화벽 outbound 7844/UDP 확인 (GCP 기본 allow) |
| DB 사라짐 | `ls ~/maimai/data/` 확인 |
