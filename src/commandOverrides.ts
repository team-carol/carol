/**
 * 슬래시 명령어 이름·설명·옵션 순서·옵션 설명 덮어쓰기(/관리 → 명령어 탭, src/web/commandsAdminPage.ts).
 * 코드의 SlashCommandBuilder 가 기본값이고, 운영자가 바꾼 값만 constants_cache(`command_overrides`)에 둔다.
 * 봇이 명령을 디스코드에 등록할 때(시작할 때, 또는 관리 페이지의 "디스코드에 반영") 덮어쓴 값을 입혀 올린다.
 * - 명령 키는 코드의 기본 이름이다. 이름을 바꾸면 들어온 상호작용의 이름을 키로 되돌려 라우팅한다(keyForName).
 * - 옵션 이름은 코드가 그 이름으로 값을 읽으므로 바꿀 수 없다. 디스코드 명령 목록은 이름 순으로 보이므로 명령 순서도 정할 수 없다.
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
}
export interface OptionJson { name: string; description: string; type: number; required?: boolean; [k: string]: unknown }
export interface CommandJson { name: string; description: string; options?: OptionJson[]; [k: string]: unknown }

const KV_KEY = "command_overrides";
let overrides: Record<string, CommandOverride> = {};
/** 지금 디스코드에 올라가 있는 이름 → 명령 키 */
let liveNames = new Map<string, string>();
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

export function setLiveCommandNames(map: Map<string, string>): void {
  liveNames = map;
}

/** 들어온 상호작용의 명령 이름 → 명령 키(코드의 기본 이름). 모르면 그 이름 그대로. */
export function keyForName(name: string): string {
  return liveNames.get(name) ?? name;
}

/** 기본 정의에 덮어쓴 값을 입힌다. */
export function applyOverride(json: CommandJson, o: CommandOverride | undefined): CommandJson {
  if (!o) return json;
  const out: CommandJson = { ...json };
  if (o.name) out.name = o.name;
  if (o.description) out.description = o.description;
  if (json.options?.length) {
    let opts = json.options.map((op) => (o.optionDescriptions?.[op.name] ? { ...op, description: o.optionDescriptions[op.name] } : op));
    if (o.order?.length) {
      const rank = (n: string) => {
        const k = o.order!.indexOf(n);
        return k >= 0 ? k : 1000 + json.options!.findIndex((x) => x.name === n);
      };
      opts = opts.slice().sort((a, b) => rank(a.name) - rank(b.name));
    }
    out.options = [...opts.filter((x) => x.required), ...opts.filter((x) => !x.required)];
  }
  return out;
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
    if (Object.keys(clean).length) overrides[key] = clean;
    else delete overrides[key];
  }
  await saveKvCache(KV_KEY, JSON.stringify(overrides));
}
