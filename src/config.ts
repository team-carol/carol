export const CONFIG = require("../config.json") as {
  token: string;
  clientId: string;
  guildId?: string;
  encryptionKey?: string;
  webPort?: number;
  baseUrl?: string;
  discordInviteUrl?: string;
  databaseUrl?: string;
  carolIssueBaseUrl?: string;
  carolSharedSecret?: string;
  carolIssueGuildId?: string;
};

export const PORT = CONFIG.webPort ?? 3456;
