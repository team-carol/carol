import * as fs from "fs";
import * as path from "path";

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

const DATA_DIR = process.env.DATA_DIR || ".";
const FONT_DIR = path.join(DATA_DIR, "fonts");

// Load Korean-capable TTFs before JP fallback so generated PNGs do not render Hangul as tofu.
const FONT_SOURCES: { file: string; url: string; weight: 400 | 700; localPath?: string }[] = [
  {
    file: "NotoSansKR-Regular.ttf",
    url: "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf",
    weight: 400,
  },
  {
    file: "NotoSansKR-Bold.ttf",
    url: "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf",
    weight: 700,
  },
  {
    file: "NotoSansJP-Regular.otf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-jp@0.2.3/NotoSansJP_400Regular.ttf",
    weight: 400,
  },
  {
    file: "NotoSansJP-Bold.otf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-jp@0.2.3/NotoSansJP_700Bold.ttf",
    weight: 700,
  },
];

let cached: SatoriFont[] | null = null;

async function ensureFont(file: string, url: string, localPath?: string): Promise<Buffer> {
  const dest = path.join(FONT_DIR, file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return fs.readFileSync(dest);
  }
  if (localPath && fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
    const buf = fs.readFileSync(localPath);
    fs.mkdirSync(FONT_DIR, { recursive: true });
    fs.writeFileSync(dest, buf);
    return buf;
  }
  console.log(`[fonts] 다운로드: ${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: ${file} HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(FONT_DIR, { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf;
}

export async function loadFonts(): Promise<SatoriFont[]> {
  if (cached) return cached;
  const fonts: SatoriFont[] = [];
  for (const src of FONT_SOURCES) {
    const data = await ensureFont(src.file, src.url, src.localPath);
    fonts.push({ name: "Noto Sans JP", data, weight: src.weight, style: "normal" });
  }
  cached = fonts;
  console.log(`[fonts] ${fonts.length}개 로드 완료`);
  return fonts;
}

export function getFonts(): SatoriFont[] | null {
  return cached;
}
