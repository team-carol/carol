/**
 * 슬래시 명령어 이름·설명·옵션 이름·옵션 순서·옵션 설명 덮어쓰기(/관리 → 명령어 탭, src/web/commandsAdminPage.ts).
 * 코드의 SlashCommandBuilder 가 기본값이고, 운영자가 바꾼 값만 constants_cache(`command_overrides`)에 둔다.
 * 봇이 명령을 디스코드에 등록할 때(시작할 때, 또는 관리 페이지의 "디스코드에 반영") 덮어쓴 값을 입혀 올린다.
 * - 명령 키는 코드의 기본 이름이다. 이름을 바꾸면 들어온 상호작용의 이름을 키로 되돌려 라우팅한다(keyForName).
 * - 옵션 이름(맨 위 옵션, 하위 명령이면 그 이름)도 바꿀 수 있다. 코드는 늘 원래 이름으로 값을 읽으므로, 들어온 상호작용의 옵션 이름을
 *   마지막으로 디스코드에 올린 덮어쓰기 기준으로 원래 이름으로 되돌린다(bot/index.ts restoreOptionNames ← canonicalOptionNames).
 *   하위 명령 안의 옵션 이름은 바꾸지 않는다.
 * - 디스코드 명령 목록은 이름 순으로 보이므로 명령 순서는 정할 수 없다.
 * - 디스코드 규칙: 필수 옵션이 선택 옵션보다 앞에 와야 해서, 순서를 바꿔도 필수 옵션은 앞으로 모은다.
 */
import { getKvCache, saveKvCache } from "./storage";

export interface CommandOverride {
  name?: string;
  description?: string;
  /** 옵션(또는 하위 명령) 이름 순서 */
  order?: string[];
  /** 옵션 이름 → 설명 */
  optionDescriptions?: Record<string, string>;
  /** 원래 옵션 이름 → 디스코드에 보일 이름. 순서·설명 덮어쓰기는 늘 원래 이름을 키로 쓴다. */
  optionNames?: Record<string, string>;
}
export interface OptionJson { name: string; description: string; type: number; required?: boolean; [k: string]: unknown }
export interface CommandJson { name: string; description: string; options?: OptionJson[]; [k: string]: unknown }

const KV_KEY = "command_overrides";
let overrides: Record<string, CommandOverride> = {};
/** 지금 디스코드에 올라가 있는 이름 → 명령 키 */
let liveNames = new Map<string, string>();
/** 명령 키 → (지금 디스코드에 올라가 있는 옵션 이름 → 원래 옵션 이름). 바꾼 옵션만. */
let liveOptionNames = new Map<string, Map<string, string>>();
/** 봇이 알려 준 명령 정의(기본값). 웹만 따로 띄우면 비어 있다. */
let definitions: { key: string; json: CommandJson }[] = [];
let syncHook: (() => Promise<void>) | null = null;

export async function loadCommandOverrides(): Promise<void> {
  try {
    const row = await getKvCache(KV_KEY);
    overrides = row ? (JSON.parse(row.data) as Record<string, CommandOverride>) : {};
  } catch (e) {
    console.error("[commands] 덮어쓰기 복원 실패:", e);
    overrides = {};
  }
}

export function getCommandOverride(key: string): CommandOverride | undefined {
  return overrides[key];
}

export function setCommandDefinitions(list: { key: string; json: CommandJson }[], sync: () => Promise<void>): void {
  definitions = list;
  syncHook = sync;
}

export function getCommandDefinitions(): { key: string; json: CommandJson }[] {
  return definitions;
}

/** 디스코드에 다시 등록한다. 봇이 없으면(웹만 실행) false. */
export async function syncCommandsNow(): Promise<boolean> {
  if (!syncHook) return false;
  await syncHook();
  return true;
}

/** 디스코드에 올린 직후 부른다. 그때의 옵션 이름 덮어쓰기도 같이 기억한다(저장만 하고 아직 안 올린 이름으로 되돌리지 않게). */
export function setLiveCommandNames(map: Map<string, string>): void {
  liveNames = map;
  liveOptionNames = new Map(
    Object.entries(overrides)
      .filter(([, o]) => o.optionNames && Object.keys(o.optionNames).length)
      .map(([key, o]) => [key, new Map(Object.entries(o.optionNames!).map(([orig, shown]) => [shown, orig]))]),
  );
}

/** 명령 키 → (디스코드에 올라간 옵션 이름 → 원래 이름). 바꾼 옵션이 없으면 undefined. */
export function canonicalOptionNames(key: string): Map<string, string> | undefined {
  return liveOptionNames.get(key);
}

/** 들어온 상호작용의 명령 이름 → 명령 키(코드의 기본 이름). 모르면 그 이름 그대로. */
export function keyForName(name: string): string {
  return liveNames.get(name) ?? name;
}

/**
 * 덮어쓴 순서·옵션 설명을 입힌 옵션 목록. 이름은 원래 이름 그대로다(순서·설명 덮어쓰기와 관리 페이지는 원래 이름을 키로 쓴다).
 * 디스코드에 보일 이름까지 입히려면 applyOverride.
 */
export function orderedOptions(json: CommandJson, o: CommandOverride | undefined): OptionJson[] {
  if (!json.options?.length) return [];
  let opts = json.options.map((op) => (o?.optionDescriptions?.[op.name] ? { ...op, description: o.optionDescriptions[op.name] } : op));
  if (o?.order?.length) {
    const rank = (n: string) => {
      const k = o.order!.indexOf(n);
      return k >= 0 ? k : 1000 + json.options!.findIndex((x) => x.name === n);
    };
    opts = opts.slice().sort((a, b) => rank(a.name) - rank(b.name));
  }
  return [...opts.filter((x) => x.required), ...opts.filter((x) => !x.required)];
}

/** 기본 정의에 덮어쓴 값을 입힌다(디스코드에 올릴 모양). */
export function applyOverride(json: CommandJson, o: CommandOverride | undefined): CommandJson {
  if (!o) return json;
  const out: CommandJson = { ...json };
  if (o.name) out.name = o.name;
  if (o.description) out.description = o.description;
  if (json.options?.length) {
    // 이름은 순서를 정한 뒤에 바꾼다(순서는 원래 이름 기준).
    out.options = orderedOptions(json, o).map((op) => (o.optionNames?.[op.name] ? { ...op, name: o.optionNames[op.name] } : op));
  }
  return out;
}

/**
 * 관리 페이지가 보낸 옵션 순서를 원래 이름으로 맞춘다. 2.4.4 페이지는 옵션 이름을 바꾸고 저장하면 순서를 바뀐 이름으로 받아
 * 그다음 저장에 그대로 보냈다(열어 둔 예전 탭도 저장되게). 원래 옵션 이름과 같은 값은 그대로 둔다(두 옵션 이름을 맞바꾼 경우).
 */
export function canonicalOrder(key: string, order: string[], o: CommandOverride | undefined = overrides[key]): string[] {
  const def = definitions.find((d) => d.key === key);
  const names = (def?.json.options ?? []).map((x) => x.name);
  const back = new Map(Object.entries(o?.optionNames ?? {}).map(([orig, shown]) => [shown, orig]));
  return order.map((n) => (names.includes(n) ? n : back.get(n) ?? n));
}

// 디스코드 명령 이름 규칙(소문자가 있는 글자는 소문자만).
const NAME_RE = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

/** 저장 전 검사. 문제가 있으면 안내 문구. */
export function validateOverride(key: string, o: CommandOverride): string | null {
  const def = definitions.find((d) => d.key === key);
  if (!def) return "알 수 없는 명령어입니다";
  if (o.name !== undefined) {
    if (!NAME_RE.test(o.name) || o.name !== o.name.toLowerCase()) return "이름은 1~32자, 공백 없이 글자·숫자·-·_ 만 쓸 수 있고 영문은 소문자여야 합니다";
    const taken = definitions.find((d) => d.key !== key && (overrides[d.key]?.name ?? d.key) === o.name);
    if (taken) return `다른 명령어(/${taken.key})가 이미 쓰는 이름입니다`;
  }
  if (o.description !== undefined && (o.description.length < 1 || o.description.length > 100)) return "설명은 1~100자여야 합니다";
  const names = (def.json.options ?? []).map((x) => x.name);
  if (o.order && (o.order.length !== names.length || o.order.some((n) => !names.includes(n)))) return "옵션 순서가 명령어의 옵션과 맞지 않습니다";
  for (const [n, d] of Object.entries(o.optionDescriptions ?? {})) {
    if (!names.includes(n)) return `없는 옵션입니다: ${n}`;
    if (d.length < 1 || d.length > 100) return `옵션 설명은 1~100자여야 합니다: ${n}`;
  }
  for (const [n, shown] of Object.entries(o.optionNames ?? {})) {
    if (!names.includes(n)) return `없는 옵션입니다: ${n}`;
    if (!NAME_RE.test(shown) || shown !== shown.toLowerCase()) return `옵션 이름은 1~32자, 공백 없이 글자·숫자·-·_ 만 쓸 수 있고 영문은 소문자여야 합니다: ${shown}`;
  }
  const finalNames = names.map((n) => o.optionNames?.[n] || n);
  const dup = finalNames.find((n, k) => finalNames.indexOf(n) !== k);
  if (dup) return `옵션 이름이 겹칩니다: ${dup}`;
  return null;
}

/** 덮어쓰기 저장(null 이면 기본값으로). 기본값과 같은 값은 저장하지 않는다. */
export async function saveCommandOverride(key: string, o: CommandOverride | null): Promise<void> {
  const def = definitions.find((d) => d.key === key);
  if (!o || !def) {
    delete overrides[key];
  } else {
    const clean: CommandOverride = {};
    if (o.name && o.name !== def.json.name) clean.name = o.name;
    if (o.description && o.description !== def.json.description) clean.description = o.description;
    const names = (def.json.options ?? []).map((x) => x.name);
    if (o.order && o.order.join("\u0000") !== names.join("\u0000")) clean.order = o.order;
    const descs = Object.entries(o.optionDescriptions ?? {}).filter(([n, d]) => d && d !== def.json.options?.find((x) => x.name === n)?.description);
    if (descs.length) clean.optionDescriptions = Object.fromEntries(descs);
    const renamed = Object.entries(o.optionNames ?? {}).filter(([n, shown]) => shown && shown !== n && names.includes(n));
    if (renamed.length) clean.optionNames = Object.fromEntries(renamed);
    if (Object.keys(clean).length) overrides[key] = clean;
    else delete overrides[key];
  }
  await saveKvCache(KV_KEY, JSON.stringify(overrides));
}
