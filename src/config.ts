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
  /** 공지 번역 백필 사용 여부. 미설정(undefined)이면 릴리스 빌드에서만 켜진다
   *  (RELEASE_VERSION 유무로 판단). dev 는 공유 할당량을 아끼려고 기본 꺼짐.
   *  true/false 로 명시하면 그 값이 우선. → src/bot/newsPoller.ts backfillEnabled() */
  newsBackfill?: boolean;
  /** carol-ops의 GET /admin/status 인증용 공유 secret. 비어있으면 라우트가 401. */
  opsSharedSecret?: string;
};

export const PORT = CONFIG.webPort ?? 3456;

export const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
