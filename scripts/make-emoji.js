// 디스코드 애플리케이션 이모지(랭크·FC/AP·FS/FDX·DX ✦) PNG 를 만든다. 결과는 assets/emoji/<이름>.png.
// 색은 maishift 의 "레거시" 색상 구성(배지 색)을 따르고, 모양·글꼴은 캐롤봇 카드(둥근 사각형, Pretendard)에 맞춘다.
//
//   node scripts/make-emoji.js            # assets/emoji/*.png + preview.png
//
// 글꼴: data/fonts/Pretendard-ExtraBold.otf (없으면 jsDelivr 에서 받는다).

const fs = require("fs");
const path = require("path");
const satori = require("satori").default;
const { Resvg } = require("@resvg/resvg-js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "emoji");
const FONT_PATH = path.join(ROOT, "data", "fonts", "Pretendard-ExtraBold.otf");
const FONT_URL = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-ExtraBold.otf";
const SIZE = 128;

// maishift 레거시 색상(배지 위쪽 색). 아래쪽은 같은 색 82%.
const RAINBOW = ["#60ffff", "#54c7ff", "#fa7eff", "#f0554c", "#fffc4c", "#62e34c"];
const DARK = "#2d2d2d";
/** [이모지 이름, 글자, 위첨자, 색] */
const EMOJIS = [
  ["carol_sssp", "SSS", "+", "rainbow"],
  ["carol_sss", "SSS", "", "#e61919"],
  ["carol_ssp", "SS", "+", "#f5a900"],
  ["carol_ss", "SS", "", "#d09000"],
  ["carol_sp", "S", "+", "#4ba0e0"],
  ["carol_s", "S", "", "#2583d3"],
  ["carol_aaa", "AAA", "", "#4d4d4d"],
  ["carol_aa", "AA", "", DARK],
  ["carol_a", "A", "", DARK],
  ["carol_bbb", "BBB", "", DARK],
  ["carol_bb", "BB", "", DARK],
  ["carol_b", "B", "", DARK],
  ["carol_c", "C", "", DARK],
  ["carol_d", "D", "", DARK],
  ["carol_app", "AP", "+", "#dd2c76"],
  ["carol_ap", "AP", "", "#8041c8"],
  ["carol_fcp", "FC", "+", "#3fb842"],
  ["carol_fc", "FC", "", "#5aa88d"],
  ["carol_fdxp", "FDX", "+", "#dd2c76"],
  ["carol_fdx", "FDX", "", "#8041c8"],
  ["carol_fsp", "FS", "+", "#3f82b8"],
  ["carol_fs", "FS", "", "#605aa8"],
  ["carol_sync", "SYNC", "", "#4d4d4d"],
  ["carol_star5", "5", "star", "#e61919"],
  ["carol_star4", "4", "star", "#f5a900"],
  ["carol_star3", "3", "star", "#d09000"],
  ["carol_star2", "2", "star", "#3fb842"],
  ["carol_star1", "1", "star", "#5aa88d"],
];

function el(type, style, children) {
  return { type, props: { style, children } };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// 글자 수에 맞춘 크기(정사각형 안에 꽉 차게). 위첨자 "+" 가 붙으면 조금 줄인다.
function textSize(text, sup) {
  const n = text.length;
  const base = n === 1 ? 84 : n === 2 ? 64 : n === 3 ? 48 : 38;
  return sup === "+" ? Math.round(base * (n === 1 ? 0.92 : 0.86)) : base;
}

function starSvg(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M10 0 C11 7 13 9 20 10 C13 11 11 13 10 20 C9 13 7 11 0 10 C7 9 9 7 10 0 Z" fill="${color}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function tile([, text, sup, color]) {
  const background = color === "rainbow"
    ? `linear-gradient(135deg, ${RAINBOW.join(", ")})`
    : `linear-gradient(180deg, ${color} 0%, ${hexA(color, 0.82)} 100%)`;
  // 밝은 무지개 위의 흰 글자가 묻히지 않게 그림자를 더 진하게.
  const shadow = color === "rainbow" ? "0 2px 5px rgba(0, 0, 0, 0.55)" : "0 2px 6px rgba(0, 0, 0, 0.3)";
  const fontSize = textSize(text, sup);
  const label = sup === "star"
    ? [
        { type: "img", props: { src: starSvg("#ffffff"), width: 46, height: 46, style: { marginRight: 2 } } },
        el("span", { fontSize: 76, color: "#ffffff", lineHeight: 1, textShadow: shadow }, text),
      ]
    : [
        el("span", { fontSize, color: "#ffffff", lineHeight: 1, letterSpacing: text.length > 2 ? -2 : -1, textShadow: shadow }, text),
        ...(sup ? [el("span", { fontSize: Math.round(fontSize * 0.62), color: "#ffffff", lineHeight: 1, marginTop: -Math.round(fontSize * 0.42), marginLeft: 1, textShadow: shadow }, sup)] : []),
      ];
  return el("div", {
    display: "flex", width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center",
  }, [
    el("div", {
      position: "relative", display: "flex", width: 120, height: 120, borderRadius: 30, overflow: "hidden",
      alignItems: "center", justifyContent: "center", background,
      border: `3px solid ${color === "rainbow" ? "rgba(255, 255, 255, 0.45)" : "rgba(255, 255, 255, 0.22)"}`,
    }, [
      // 위쪽 은은한 광택(캐롤봇 카드의 밝은 테두리 느낌)
      el("div", { display: "flex", position: "absolute", left: 0, top: 0, width: 120, height: 56, background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))" }, []),
      el("div", { display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Pretendard", fontWeight: 800 }, label),
    ]),
  ]);
}

async function ensureFont() {
  if (!fs.existsSync(FONT_PATH)) {
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`font HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(FONT_PATH), { recursive: true });
    fs.writeFileSync(FONT_PATH, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(FONT_PATH);
}

async function render(node, width, height, fonts) {
  const svg = await satori(node, { width, height, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

async function main() {
  const font = await ensureFont();
  const fonts = [{ name: "Pretendard", data: font, weight: 800, style: "normal" }];
  fs.mkdirSync(OUT, { recursive: true });
  for (const e of EMOJIS) {
    fs.writeFileSync(path.join(OUT, `${e[0]}.png`), await render(tile(e), SIZE, SIZE, fonts));
  }
  // 미리보기: 원래 크기 + 디스코드에서 보이는 크기(22px)를 어두운·밝은 배경에.
  const imgs = EMOJIS.map((e) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, `${e[0]}.png`)).toString("base64")}`);
  const row = (bg, size, gap) => el("div", { display: "flex", flexWrap: "wrap", gap, background: bg, padding: 16, borderRadius: 12, marginTop: 12 },
    imgs.map((src) => ({ type: "img", props: { src, width: size, height: size } })));
  const sheet = el("div", { display: "flex", flexDirection: "column", width: 1040, background: "#1a1a1c", padding: 20 }, [
    row("#1a1a1c", 96, 10),
    row("#313338", 22, 4),
    row("#ffffff", 22, 4),
  ]);
  fs.writeFileSync(path.join(OUT, "..", "emoji-preview.png"), await render(sheet, 1040, 640, fonts));
  console.log(`emoji ${EMOJIS.length}개 → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
