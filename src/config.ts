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

/** Storage is selected only from the environment, never from config.json. */
export const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite").trim().toLowerCase();
export const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (DB_DRIVER !== "sqlite" && DB_DRIVER !== "postgres") {
  throw new Error(`Unsupported DB_DRIVER: ${DB_DRIVER}`);
}
if (DB_DRIVER === "postgres" && !DATABASE_URL) {
  throw new Error("DATABASE_URL is required when DB_DRIVER=postgres");
}
