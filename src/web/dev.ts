import { startWebServer, setBaseUrl } from "./index";
import { CONFIG, PORT } from "../config";
import { initEncryption } from "../crypto";

initEncryption(CONFIG.encryptionKey);
if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
startWebServer(PORT);
console.log("[dev] web-only mode (no Discord bot)");
