// 디스코드 애플리케이션 이모지(난이도·랭크·FC/AP·FS/FDX·DX ✦·ST/DX 배지) PNG 를 만든다. 결과는 assets/emoji/<이름>.png.
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
/** [이모지 이름, 글자, 위첨자("+")·별("star")·윗줄 작은 글자("top:Re:")·빈칸("blank"), 색("white:<글자색>" 이면 흰 바탕)] */
// 그림을 바꾸면 이름 끝 번호를 올린다(봇은 같은 이름이 있으면 다시 올리지 않고, assets 에 없는 carol_ 이모지는 지운다).
const EMOJIS = [
  // 난이도(캐롤봇 카드의 난이도 색)
  ["carol_basic", "BAS", "", "#16a34a"],
  ["carol_advanced", "ADV", "", "#ea580c"],
  ["carol_expert", "EXP", "", "#dc2626"],
  ["carol_master", "MAS", "", "#9333ea"],
  // Re:MASTER 는 게임처럼 흰 바탕에 보라 글자, "Re:" 윗줄 + "MAS" 아랫줄
  ["carol_remaster2", "MAS", "top:Re:", "white:#9333ea"],
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
  // 빈칸(투명). /검색 점수표에서 FC/AP·FS/FDX 가 없는 자리를 채워 뒤의 마크가 줄마다 같은 자리에 오게 한다.
  ["carol_blank", "", "blank", ""],
];

// 넓은 그림(ST/DX 배지·난이도 이름)을 정사각형 몇 칸으로 잘라 이어 붙여 쓰는 이모지. 이름 끝에 _a, _b, _c 가 붙는다.
// 봇에서는 emoji.ts 의 tiledEmoji 로 칸 사이에 word joiner(U+2060)를 넣어 잇는다(줄바꿈 때 갈라지지 않게).
// 그림은 DX NET 것(ST/DX 는 /성과 카드와 같은 113:32 배지, 난이도는 높이 32 에 너비가 제각각). DX NET 점검 중이면
// 인터넷 아카이브의 같은 주소 사본을 받는다(난이도 그림은 사본이 없다).
// 디스코드는 이모지를 글줄 맨 아래에 맞추는데, 임베드 제목은 글줄이 높아 배지가 글자보다 낮게 앉는다.
// 그래서 임베드용(e)은 배지를 조금 줄여 칸 맨 위에 붙인다(가운데보다 128 기준 16 위).
// 난이도는 ST/DX 배지와 같은 높이로 두고 그림마다 필요한 만큼만 칸을 쓴다(왼쪽 정렬, 남는 칸 오른쪽은 투명).
/**
 * [이모지 이름, DX NET 그림 파일명, 칸 수, 옵션]
 * 옵션: height 배지 높이(생략하면 칸 너비에 맞춤), top 위 여백(생략하면 세로 가운데), align "left"(생략하면 가로 가운데)
 */
const WIDE = [
  ["carol_dx", "music_dx.png", 3],
  ["carol_st", "music_standard.png", 3],
  ["carol_dxe", "music_dx.png", 3, { height: 96, top: 0 }],
  ["carol_ste", "music_standard.png", 3, { height: 96, top: 0 }],
  ["carol_bas", "diff_basic.png", 3, { height: 108, align: "left" }],
  ["carol_adv", "diff_advanced.png", 4, { height: 108, align: "left" }],
  ["carol_exp", "diff_expert.png", 3, { height: 108, align: "left" }],
  ["carol_mas", "diff_master.png", 4, { height: 108, align: "left" }],
  ["carol_rem", "diff_remaster.png", 4, { height: 108, align: "left" }],
  // 기록 마크(DX NET 기록 페이지 아이콘). 랭크(68:31)는 두 칸, FC/AP·FS/FDX·SYNC(42:47)·DX ✦(정사각형)는 한 칸.
  ...["sssp", "sss", "ssp", "ss", "sp", "s", "aaa", "aa", "a", "bbb", "bb", "b", "c", "d"]
    .map((r) => [`carol_m_${r}`, `music_icon_${r}.png`, 2]),
  ...["app", "ap", "fcp", "fc", "fdxp", "fdx", "fsp", "fs", "sync"]
    .map((m) => [`carol_m_${m}`, `music_icon_${m}.png`, 1, { height: 124 }]),
  ...[1, 2, 3, 4, 5].map((n) => [`carol_m_star${n}`, `music_icon_dxstar_${n}.png`, 1, { height: 124 }]),
];
const WIDE_DIR = path.join(ROOT, "data", "dxnet");

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
  if (sup === "blank") return el("div", { display: "flex", width: SIZE, height: SIZE }, []);
  const white = color.startsWith("white:") ? color.slice(6) : "";
  const background = white
    ? "linear-gradient(180deg, #ffffff 0%, #ede4ff 100%)"
    : color === "rainbow"
    ? `linear-gradient(135deg, ${RAINBOW.join(", ")})`
    : `linear-gradient(180deg, ${color} 0%, ${hexA(color, 0.82)} 100%)`;
  // 밝은 무지개 위의 흰 글자가 묻히지 않게 그림자를 더 진하게.
  const shadow = color === "rainbow" ? "0 2px 5px rgba(0, 0, 0, 0.55)" : "0 2px 6px rgba(0, 0, 0, 0.3)";
  const fontSize = textSize(text, sup);
  const top = sup.startsWith("top:") ? sup.slice(4) : "";
  const label = top
    ? [
        el("span", { fontSize: 34, color: white || "#ffffff", lineHeight: 1, marginBottom: 2 }, top),
        el("span", { fontSize: 48, color: white || "#ffffff", lineHeight: 1, letterSpacing: -2 }, text),
      ]
    : sup === "star"
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
      border: `3px solid ${white ? "rgba(192, 132, 252, 0.9)" : color === "rainbow" ? "rgba(255, 255, 255, 0.45)" : "rgba(255, 255, 255, 0.22)"}`,
    }, [
      // 위쪽 은은한 광택(캐롤봇 카드의 밝은 테두리 느낌)
      el("div", { display: "flex", position: "absolute", left: 0, top: 0, width: 120, height: 56, background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))" }, []),
      el("div", { display: "flex", flexDirection: top ? "column" : "row", alignItems: "center", justifyContent: "center", fontFamily: "Pretendard", fontWeight: 800 }, label),
    ]),
  ]);
}

async function ensureWideSource(file) {
  const local = path.join(WIDE_DIR, file);
  if (!fs.existsSync(local)) {
    const url = `https://maimaidx-eng.com/maimai-mobile/img/${file}`;
    let res = await fetch(url).catch(() => null);
    if (!res || !res.ok) res = await fetch(`https://web.archive.org/web/2025id_/${url}`);
    if (!res.ok) throw new Error(`${file} HTTP ${res.status}`);
    fs.mkdirSync(WIDE_DIR, { recursive: true });
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(local);
  // PNG IHDR 의 너비·높이(16~23 바이트)
  return { src: `data:image/png;base64,${buf.toString("base64")}`, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// 넓은 그림의 i 번째 칸. 그림을 칸 수만큼의 너비에 맞추고(높이를 정했으면 그 높이에 맞춰 가로 가운데 또는 왼쪽)
// 세로 가운데(또는 정한 위 여백)에 둔 뒤 viewBox 로 그 칸만 잘라 그린다.
function wideTile({ src, w, h }, tiles, i, opt = {}) {
  const total = SIZE * tiles;
  const height = opt.height ?? Math.round(total * h / w);
  const width = opt.height ? Math.round(height * w / h) : total;
  if (width > total) throw new Error(`칸이 모자람: 너비 ${width} > ${total}`);
  const x = opt.align === "left" ? 0 : Math.round((total - width) / 2);
  const y = opt.top ?? Math.round((SIZE - height) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="${SIZE * i} 0 ${SIZE} ${SIZE}">`
    + `<image xlink:href="${src}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`;
  return new Resvg(svg).render().asPng();
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
  const wideNames = [];
  for (const [name, file, tiles, opt] of WIDE) {
    const src = await ensureWideSource(file);
    const names = [];
    for (let i = 0; i < tiles; i++) {
      const tileName = `${name}_${String.fromCharCode(97 + i)}`;
      fs.writeFileSync(path.join(OUT, `${tileName}.png`), wideTile(src, tiles, i, opt));
      names.push(tileName);
    }
    wideNames.push(names);
  }
  // 미리보기: 원래 크기 + 디스코드에서 보이는 크기(22px)를 어두운·밝은 배경에. 넓은 이모지는 칸을 붙여서.
  const png = (name) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, `${name}.png`)).toString("base64")}`;
  const imgs = EMOJIS.map((e) => png(e[0]));
  const row = (bg, size, gap) => el("div", { display: "flex", flexWrap: "wrap", gap, background: bg, padding: 16, borderRadius: 12, marginTop: 12 }, [
    ...imgs.map((src) => ({ type: "img", props: { src, width: size, height: size } })),
    ...wideNames.map((names) => el("div", { display: "flex" }, names.map((n) => ({ type: "img", props: { src: png(n), width: size, height: size } })))),
  ]);
  const sheet = el("div", { display: "flex", flexDirection: "column", width: 1040, background: "#1a1a1c", padding: 20 }, [
    row("#1a1a1c", 96, 10),
    row("#313338", 22, 4),
    row("#ffffff", 22, 4),
  ]);
  fs.writeFileSync(path.join(OUT, "..", "emoji-preview.png"), await render(sheet, 1040, 1000, fonts));
  console.log(`emoji ${EMOJIS.length + wideNames.flat().length}개 → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
