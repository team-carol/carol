// src/version.ts — /api/stats·/상태·패치노트가 함께 쓰는 버전 출처.
const test = require("node:test");
const assert = require("node:assert/strict");
const { appVersion, buildVersion } = require("../../dist/version.js");
const pkg = require("../../package.json");

function withEnv(env, fn) {
  const saved = { RELEASE_VERSION: process.env.RELEASE_VERSION, BUILD_VERSION: process.env.BUILD_VERSION };
  Object.assign(process.env, env);
  for (const k of Object.keys(env)) if (env[k] === undefined) delete process.env[k];
  try { fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test("appVersion: 릴리스 태그가 있으면 그 값(v 접두사 제거)", () => {
  withEnv({ RELEASE_VERSION: "v1.10.0" }, () => assert.equal(appVersion(), "1.10.0"));
});

test("appVersion: 비릴리스 빌드(0.0.0·미설정)는 package.json 버전", () => {
  withEnv({ RELEASE_VERSION: "0.0.0" }, () => assert.equal(appVersion(), pkg.version));
  withEnv({ RELEASE_VERSION: undefined }, () => assert.equal(appVersion(), pkg.version));
});

test("buildVersion: local 이나 미설정은 null", () => {
  withEnv({ BUILD_VERSION: "local" }, () => assert.equal(buildVersion(), null));
  withEnv({ BUILD_VERSION: "abc123" }, () => assert.equal(buildVersion(), "abc123"));
});
