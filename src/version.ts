import fs from "fs";
import path from "path";

// 캐롤봇 버전의 단일 출처. /api/stats, /상태, 패치노트 버전 기본값이 모두 이걸 쓴다.
// 릴리스 이미지는 태그에서 온 RELEASE_VERSION 을 받는다(release.yml). 그 밖의 빌드는
// Dockerfile 기본값 0.0.0 이므로 무시하고, 같은 이미지에 들어 있는 package.json 을 읽는다.

function envText(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

let pkgVersion: string | null | undefined;
function packageVersion(): string | null {
  if (pkgVersion !== undefined) return pkgVersion;
  try {
    // src/version.ts(ts-node) 와 dist/version.js 모두 한 단계 위가 package.json 이 있는 루트다.
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { version?: string };
    pkgVersion = pkg.version?.trim() || null;
  } catch {
    pkgVersion = null;
  }
  return pkgVersion;
}

/** 지금 실행 중인 버전(예: "1.10.0"). 알 수 없으면 "local". */
export function appVersion(): string {
  const release = envText("RELEASE_VERSION");
  if (release && release !== "0.0.0") return release.replace(/^v/, "");
  return packageVersion() ?? "local";
}

/** 이미지 빌드 식별자(release.yml 이 넣는 BUILD_VERSION). 없거나 "local" 이면 null. */
export function buildVersion(): string | null {
  const build = envText("BUILD_VERSION");
  return build && build !== "local" ? build : null;
}
