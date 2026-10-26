// gg sans(디스코드 본문 글꼴) 글자 폭 표와, 숫자 칸을 픽셀 기준으로 맞추는 공백 만들기(/검색 점수표).
// 디스코드 웹(macOS Chromium)에서 잰 값이다. 단위는 em(글꼴 크기를 바꿔도 비율은 같다), 커닝 적용 기준. **굵게** 는 700.
// gg sans 숫자는 폭이 제각각이라("1" 0.356em, "0" 0.584em) 자릿수만 맞추면 줄마다 몇 px 어긋난다.
// ✦(U+2726)·한글·이모지는 gg sans 에 없어 기기마다 다른 글꼴로 그려지므로 재지 않는다. ✦ 은 줄마다 하나씩이라
// 그 앞 칸과 뒤 칸을 따로 맞추면 된다. 공백(U+2002~U+200A)은 gg sans 글리프이고 굵기와 상관없이 폭이 같다.

export type Weight = 400 | 700;

const SPACES: Record<string, number> = {
  " ": 0.5, " ": 0.3333, " ": 0.25, " ": 0.1667, " ": 0.2, " ": 0.0625,
};

const GLYPHS: Record<Weight, Record<string, number>> = {
  400: {
    "0": 0.584, "1": 0.356, "2": 0.519, "3": 0.546, "4": 0.556, "5": 0.536, "6": 0.535, "7": 0.458, "8": 0.528, "9": 0.535,
    ".": 0.242, "%": 0.704,
  },
  700: {
    "0": 0.6, "1": 0.416, "2": 0.562, "3": 0.571, "4": 0.586, "5": 0.571, "6": 0.566, "7": 0.506, "8": 0.568, "9": 0.566,
    ".": 0.258, "%": 0.756,
  },
};

// 커닝 쌍(앞 글자 + 뒷 글자). 없는 쌍은 0. 공백과 숫자 사이에는 커닝이 없다.
const KERNING: Record<Weight, Record<string, number>> = {
  400: {
    "17": -0.004, "59": -0.004, "61": -0.03, "62": -0.008, "67": -0.04, "69": -0.042, "74": -0.06, "75": -0.012,
    "76": -0.046, "77": 0.02, "83": -0.01, "87": -0.038, "89": -0.012, "92": -0.02, "93": -0.04, "94": -0.042,
    "95": -0.012, "96": -0.032, "07": -0.028, "0.": -0.03, "3.": -0.02, "7.": -0.07, "9.": -0.07, "6%": -0.03,
    ".0": -0.03, ".1": -0.08, ".4": -0.02, ".7": -0.05, ".9": -0.06,
  },
  700: {
    "21": 0.014, "67": -0.036, "69": -0.038, "74": -0.05, "76": -0.056, "77": 0.032, "87": -0.01, "91": 0.02,
    "0.": -0.02, "3.": -0.02, "6%": -0.04, "7.": -0.07, "9.": -0.07,
    ".0": -0.02, ".1": -0.06, ".4": -0.01, ".7": -0.05, ".9": -0.05,
  },
};

/** 문자열 폭(em). 표에 없는 글자("+", "?" 등)가 있으면 null. */
export function measureEm(text: string, weight: Weight = 400): number | null {
  const chars = [...text];
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    const adv = SPACES[chars[i]] ?? GLYPHS[weight][chars[i]];
    if (adv === undefined) return null;
    w += adv + (i > 0 ? KERNING[weight][chars[i - 1] + chars[i]] ?? 0 : 0);
  }
  return w;
}

// 공백 최대 4개 조합의 폭(긴 것부터). makeSpace 가 가장 가까운 조합을 고른다.
const PAD_SPACES = [" ", " ", " ", " ", " ", " "];
const COMBOS = (() => {
  const cands = ["", ...PAD_SPACES];
  const list: { s: string; w: number }[] = [];
  for (const a of cands) for (const b of cands) for (const c of cands) for (const d of cands) {
    const s = a + b + c + d;
    list.push({ s, w: [...s].reduce((sum, ch) => sum + SPACES[ch], 0) });
  }
  return list;
})();

/** gapEm 폭의 공백. 오차는 최대 hair space 반 칸(0.03em, 14px 에서 약 0.4px). */
export function makeSpace(gapEm: number): string {
  if (gapEm <= 0) return "";
  let out = "";
  let rest = gapEm;
  while (rest >= 0.5 + 0.0625) { out += " "; rest -= 0.5; }
  let best = { s: "", err: Math.abs(rest) };
  for (const { s, w } of COMBOS) {
    const err = Math.abs(rest - w);
    if (err < best.err - 1e-6 || (Math.abs(err - best.err) < 1e-6 && s.length < best.s.length)) best = { s, err };
  }
  return out + best.s;
}

/** 셀들을 가장 넓은 셀에 맞춰 앞을 공백으로 채운다(오른쪽 정렬). 잴 수 없는 글자가 있으면 null. */
export function padColumn(cells: string[], weight: Weight = 400): string[] | null {
  const widths = cells.map((c) => measureEm(c, weight));
  if (widths.some((w) => w === null)) return null;
  const target = Math.max(...(widths as number[]));
  return cells.map((c, i) => makeSpace(target - widths[i]!) + c);
}
