// assets/emoji/*.png 를 봇 애플리케이션 이모지로 올린다(config.json 의 token·clientId 봇).
// 이미 같은 이름이 있으면 건너뛴다. --replace 를 주면 지우고 다시 올린다(그림을 고쳤을 때).
//
//   node scripts/upload-emoji.js [--replace]

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "assets", "emoji");
const { token, clientId } = require(path.join(ROOT, "config.json"));
const API = `https://discord.com/api/v10/applications/${clientId}/emojis`;
const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
const replace = process.argv.includes("--replace");

async function call(method, url, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 429) {
    const wait = Number((await res.json()).retry_after ?? 1);
    await new Promise((r) => setTimeout(r, wait * 1000 + 100));
    return call(method, url, body);
  }
  if (!res.ok) throw new Error(`${method} ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const { items } = await call("GET", API);
  const have = new Map(items.map((e) => [e.name, e.id]));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png")).sort();
  let added = 0, skipped = 0;
  for (const file of files) {
    const name = file.replace(/\.png$/, "");
    if (have.has(name)) {
      if (!replace) { skipped++; continue; }
      await call("DELETE", `${API}/${have.get(name)}`);
    }
    const image = `data:image/png;base64,${fs.readFileSync(path.join(DIR, file)).toString("base64")}`;
    await call("POST", API, { name, image });
    added++;
  }
  console.log(`올림 ${added}개, 건너뜀 ${skipped}개 (봇 ${clientId})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
