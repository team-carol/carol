import { startWebServer, setBaseUrl } from "./index";
import { CONFIG, PORT } from "../config";
import { initEncryption } from "../crypto";
import { initializeStorage } from "../storage";

initEncryption(CONFIG.encryptionKey);
if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
void initializeStorage()
  .then(() => startWebServer(PORT))
  .catch((error: unknown) => {
    console.error("[dev] web startup failed:", error);
    process.exitCode = 1;
  });
console.log("[dev] web-only mode (no Discord bot)");
