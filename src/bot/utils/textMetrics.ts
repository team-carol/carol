import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { getFonts } from "../../fonts";

// 카드 텍스트의 첫 글자 왼쪽 여백(left side bearing) 측정. 전각 영문(Ｒ 0.228em 등)은 글자 폭 안에
// 여백이 커서, 같은 x 에서 시작해도 위아래 줄보다 오른쪽으로 밀려 보인다. satori 에 넘기는 것과 같은
// 글꼴 데이터를 canvas 에 등록해 첫 글자의 실제 잉크 시작 위치를 재고, marginLeft 로 되돌린다.

const MEASURE_SCALE = 10; // canvas 측정값이 px 단위로 반올림되므로 크게 재서 나눈다.
const ALIAS_PREFIX = "Metric";
let registered = false;
let stack = "";
const ctx = createCanvas(8, 8).getContext("2d");
const memo = new Map<string, number>();

function ensureFonts(): boolean {
  if (registered) return true;
  const fonts = getFonts();
  if (!fonts) return false;
  const families: string[] = [];
  for (const f of fonts) {
    // Pretendard 는 플레이트 숫자에만 fontFamily 로 직접 쓰고 기본 폴백 순서에는 없다(fonts.ts).
    if (f.name === "Pretendard") continue;
    const alias = ALIAS_PREFIX + f.name;
    GlobalFonts.register(f.data, alias);
    if (!families.includes(alias)) families.push(alias);
  }
  stack = families.join(", ");
  registered = true;
  return true;
}

/** text 첫 글자의 잉크가 시작하는 x(px). 글꼴을 아직 못 읽었거나 측정에 실패하면 0. */
export function leadingInk(text: string, fontSize: number, weight: 400 | 700 = 700): number {
  const first = Array.from(text)[0];
  if (!first || !ensureFonts()) return 0;
  const key = `${first}|${weight}`;
  let em = memo.get(key);
  if (em === undefined) {
    ctx.font = `${weight} ${100 * MEASURE_SCALE}px ${stack}`;
    em = Math.max(0, -ctx.measureText(first).actualBoundingBoxLeft) / (100 * MEASURE_SCALE);
    memo.set(key, em);
  }
  return em * fontSize;
}

/** 위 줄(ref)의 첫 글자 잉크와 target 의 첫 글자 잉크를 맞추는 marginLeft. */
export function alignLeftMargin(target: { text: string; size: number; weight?: 400 | 700 }, ref: { text: string; size: number; weight?: 400 | 700 }): number {
  const diff = leadingInk(ref.text, ref.size, ref.weight) - leadingInk(target.text, target.size, target.weight);
  return Math.round(diff * 2) / 2;
}
