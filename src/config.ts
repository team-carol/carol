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
  /** carol-ops의 GET /admin/status 인증용 공유 secret. 비어있으면 라우트가 401. */
  opsSharedSecret?: string;
};

export const PORT = CONFIG.webPort ?? 3456;

export const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
