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
};

export const PORT = CONFIG.webPort ?? 3456;

export const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
