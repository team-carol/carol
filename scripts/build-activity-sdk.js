// 디스코드 Activity 페이지(src/web/activityPage.ts)가 쓰는 Embedded App SDK 를 브라우저용 파일 하나로 묶는다.
// SDK 는 npm 패키지(ESM + 의존성)라 그대로는 <script> 로 못 쓴다. 웹 UI 에는 번들러가 없어서 빌드 때 여기서만 묶는다.
// 결과: dist/web/activity-sdk.js — 전역 DiscordActivity.DiscordSDK. 웹 서버가 /activity/sdk.js 로 내려준다.
// Activity 안에서는 외부 CDN 이 CSP 로 막혀서 우리 서버(디스코드 프록시 경유)에서 받아야 한다.
const path = require("path");
const esbuild = require("esbuild");

const out = path.join(__dirname, "..", "dist", "web", "activity-sdk.js");
esbuild.buildSync({
  stdin: { contents: 'export { DiscordSDK } from "@discord/embedded-app-sdk";', resolveDir: path.join(__dirname, "..") },
  bundle: true,
  format: "iife",
  globalName: "DiscordActivity",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "eof",
  outfile: out,
  logLevel: "warning",
});
console.log(`[activity] SDK 번들: ${path.relative(process.cwd(), out)}`);
