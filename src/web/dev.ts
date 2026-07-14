import { startWebServer, setBaseUrl } from "./index";
import { CONFIG, PORT } from "../config";
import { initEncryption } from "../crypto";
import { initializeStorage } from "../storage";

initEncryption(CONFIG.encryptionKey);
if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
void initializeStorage().then(() => startWebServer(PORT));
console.log("[dev] web-only mode (no Discord bot)");
