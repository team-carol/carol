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
  // mai-notes 채보 본문을 실제로 받아올지. 기본 꺼짐.
  // 이용 허락을 문의해 둔 상태라, 허락 전에는 테스트용으로만 로컬에서 켠다.
  mainotesFetchCharts?: boolean;
};

export const PORT = CONFIG.webPort ?? 3456;

export const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
