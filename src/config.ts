export const CONFIG = require("../config.json") as {
  token: string;
  clientId: string;
  guildId?: string;
  encryptionKey?: string;
  webPort?: number;
  baseUrl?: string;
  discordInviteUrl?: string;
  databaseUrl?: string;
  // 패치노트 RSS 피드 URL. 미설정 시 compose 내부 XRSS 서비스를 사용한다.
  patchNotesRssUrl?: string;
};

export const PORT = CONFIG.webPort ?? 3456;
