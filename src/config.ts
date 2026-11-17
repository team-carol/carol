export const CONFIG = require("../config.json") as {
  token: string;
  clientId: string;
  guildId?: string;
  encryptionKey?: string;
  webPort?: number;
  baseUrl?: string;
  discordInviteUrl?: string;
  aliasAdminGuildId?: string;
  carolIssueBaseUrl?: string;
  carolSharedSecret?: string;
  carolIssueGuildId?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  // mai-notes 채보 본문을 받아올지. 생략하면 켜짐(2026-10-25 운영자 허락). false 면 새 본문을 받지 않는다.
  mainotesFetchCharts?: boolean;
  /** maishift 공식 API 키(X-API-Key). 설정 › 개발자에서 발급. */
  maishiftApiKey?: string;
  /** 공지 번역 백필 사용 여부. 미설정(undefined)이면 릴리스 빌드에서만 켜진다
   *  (RELEASE_VERSION 유무로 판단). dev 는 공유 할당량을 아끼려고 기본 꺼짐.
   *  true/false 로 명시하면 그 값이 우선. → src/bot/newsPoller.ts backfillEnabled() */
  newsBackfill?: boolean;
  /** carol-ops의 GET /admin/status 인증용 공유 secret. 비어있으면 라우트가 401. */
  opsSharedSecret?: string;
  /** GET /api/icon/{id} 를 브라우저 JS 로 읽을 수 있는 Origin 목록(CORS). 정확한 Origin("https://keyring.team-carol.com")
   *  또는 하위 도메인 묶음("https://*.team-carol.com", 루트 도메인 자체는 포함 안 함). 빈 배열이면 아무 곳도 허용 안 함.
   *  생략하면 src/web/iconProxy.ts DEFAULT_ICON_CORS_ORIGINS. → iconProxy.ts */
  iconCorsOrigins?: string[];
};

export const PORT = CONFIG.webPort ?? 3456;

export const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
