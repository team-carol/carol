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

// satori는 같은 family 이름으로 등록된 폰트 중 첫 번째만 쓰고, 글리프가 없어도
// 나머지로 폴백하지 않는다. 예전에는 전부 "Noto Sans JP" 한 이름으로 묶여 있어서
// Noto Sans KR에 없는 글자(脳·撃·臓 등 JP 전용 5,753자)와 이모지가 전부 네모로 나왔다.
// 폰트마다 다른 family 이름을 주고 FONT_STACK 순서로 폴백시킨다.
const FONT_SOURCES: { file: string; url: string; weight: 400 | 700; family: string; localPath?: string }[] = [
  {
    family: "NotoKR",
    file: "NotoSansKR-Regular.ttf",
    url: "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf",
    weight: 400,
  },
  {
    family: "NotoKR",
    file: "NotoSansKR-Bold.ttf",
    url: "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf",
    weight: 700,
  },
  {
    family: "NotoJP",
    file: "NotoSansJP-Regular.otf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-jp@0.2.3/NotoSansJP_400Regular.ttf",
    weight: 400,
  },
  {
    family: "NotoJP",
    file: "NotoSansJP-Bold.otf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-jp@0.2.3/NotoSansJP_700Bold.ttf",
    weight: 700,
  },
  // 간체 전용 한자(예: 虾). KR/JP 어느 쪽에도 없는 CJK를 넓게 메운다.
  {
    family: "NotoSC",
    file: "NotoSansSC-Regular.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.2.3/NotoSansSC_400Regular.ttf",
    weight: 400,
  },
  // 라틴 확장·수학 기호(예: ℝ, ǂ)
  {
    family: "NotoBase",
    file: "NotoSans-Regular.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans@0.2.3/NotoSans_400Regular.ttf",
    weight: 400,
  },
  // 기타 기호(예: ✪)
  {
    family: "NotoSymbols",
    file: "NotoSansSymbols2-Regular.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-symbols-2@0.2.3/NotoSansSymbols2_400Regular.ttf",
    weight: 400,
  },
  // 레이팅표 우상단 레이팅 플레이트 숫자 전용(mai-log Figma RatingSection 과 같은 Pretendard SemiBold).
  // FONT_STACK 에는 넣지 않고 플레이트에서만 fontFamily 로 직접 지정한다.
  {
    family: "Pretendard",
    file: "Pretendard-SemiBold.otf",
    url: "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-SemiBold.otf",
    weight: 700,
  },
  // 이모지(흑백). resvg가 컬러 이모지 폰트(CBDT)를 지원하지 않아 단색 폰트를 쓴다.
  {
    family: "NotoEmoji",
    file: "NotoEmoji-Regular.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-emoji@0.2.3/NotoEmoji_400Regular.ttf",
    weight: 400,
  },
];

// 카드 렌더 시 root에 지정하는 폰트 스택. 앞에서부터 글리프를 찾는다.
// 한글·라틴은 KR, 일본어 전용 한자는 JP, 그 외를 뒤쪽 폰트들이 받는다.
export const FONT_STACK = "NotoKR, NotoJP, NotoSC, NotoBase, NotoSymbols, NotoEmoji";

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
    fonts.push({ name: src.family, data, weight: src.weight, style: "normal" });
  }
  cached = fonts;
  console.log(`[fonts] ${fonts.length}개 로드 완료`);
  return fonts;
}

export function getFonts(): SatoriFont[] | null {
  return cached;
}
