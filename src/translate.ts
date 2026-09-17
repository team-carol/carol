// 일본어 → 한국어 번역. 현재 구현은 Gemini 이지만 호출부는 이 인터페이스만 알면 되므로
// 다른 엔진으로 갈아끼울 수 있다. API 키가 없으면 isConfigured() 가 false 이고,
// 호출부는 번역 없이 원문만 노출한다(기능이 죽지 않는다).
import { CONFIG } from "./config";

// 번역량이 월 60회 수준이라 비용 차이가 무의미하다. 유일한 실패 모드가
// "곡명·고유명사는 원문 유지" 지시를 어기는 것이므로 지시 준수 쪽을 택했다.
// 코딩 특화(3.8-flash)나 레거시 표기(3.5-flash)는 피했다. config.json 의
// geminiModel 로 재빌드 없이 바꿀 수 있다.
const DEFAULT_MODEL = "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 30000;
// 한 번에 보낼 수 있는 양. 공지 본문은 평균 1.5천자, 최대 6천자대다.
const MAX_INPUT_CHARS = 12000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
// 5xx 는 일시적 과부하라 몇 초 뒤 재시도가 통한다. 429 는 여기 넣지 않는다 — 아래 참고.
const RETRYABLE = new Set([500, 502, 503, 504]);

// 429 는 할당량(quota) 소진이다("exceeded your current quota"). 무료 티어 일일 한도라
// 3초 재시도로는 회복되지 않고, 계속 때리면 할당량만 더 깎이고 로그가 도배된다. 한 번
// 맞으면 이 시간 동안 모든 번역 호출을 건너뛴다(전역 쿨다운). 지나면 다시 시도하고,
// 여전히 429 면 재무장. 새 공지 번역과 백필 재시도 모두 이 가드를 공유한다.
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;
let quotaCooldownUntil = 0;
export function isQuotaCoolingDown(): boolean {
  return Date.now() < quotaCooldownUntil;
}

// 폭주 감지: 최근 창 안의 실제 API 호출 수가 임계 이상이면(백필 루프 오작동 등으로
// 요청이 몰리는 상황) 쿨다운을 건다. 정상 사용(새 공지 몇 건 + 10분 주기 백필)은
// 이 값에 한참 못 미치고, 사고 때 같은 폴링 반복 호출은 여기 걸린다.
const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 10;
let callTimes: number[] = [];

// 공지문은 날짜·조건 같은 사실이 핵심이라 의역보다 정확성을 요구하고,
// 곡명/고유명사는 원문을 유지시킨다(검색·대조가 가능해야 하므로).
// 제목과 본문을 각각 호출하므로 문맥이 공유되지 않는다. 용어집을 고정해
// 같은 단어가 호출마다 다르게 번역되는 것을 막는다(ちほー가 "지방"/"치호"로 갈리던 문제).
const GLOSSARY: [string, string][] = [
  ["ちほー", "지방"],
  ["つあーメンバー", "투어 멤버"],
  ["ネームプレート", "네임플레이트"],
  ["フレーム", "프레임"],
  ["おともだち対戦", "친구 대전"],
  ["あそびかた", "플레이 방법"],
  ["稼働", "가동"],
  ["楽曲追加", "신곡 추가"],
  ["譜面", "채보"],
  ["収録", "수록"],
  // 브랜드·서비스명은 한국에서도 원문 표기로 쓰인다. 번역하면 오히려 못 알아본다.
  ["Aime", "Aime"],
  ["maimai でらっくす", "maimai でらっくす"],
];

const SYSTEM_PROMPT = [
  "다음 일본어 게임(maimai でらっくす) 공지를 한국어로 번역해라.",
  "규칙:",
  "- 날짜, 시각, 숫자, 가격, 조건은 절대 바꾸지 마라.",
  "- 곡 제목, 캐릭터 이름, 콜라보 작품명, 지방(ちほー) 이름도 한국어로 옮겨라.",
  "- 이름을 옮길 때는 한국에서 실제로 통용되는 정식 번역명/관용 표기를 최우선으로 써라.",
  "  정식 번역명을 모르면 뜻으로 의역하지 말고 발음대로 음차해라. 없는 이름을 지어내지 마라.",
  "- 알파벳으로 표기된 곡명·아티스트명은 그대로 두어라(예: ZEUS, DÉ DÉ MOUSE).",
  "- 같은 이름은 문서 안에서 항상 같은 표기로 써라.",
  "- 설명, 해설, 인사말을 덧붙이지 마라. 번역문만 출력해라.",
  "- 줄바꿈 구조를 유지해라.",
  "- 아래 용어는 반드시 지정된 표기를 써라:",
  ...GLOSSARY.map(([ja, ko]) => `  ${ja} → ${ko}`),
].join("\n");

export function isConfigured(): boolean {
  return !!CONFIG.geminiApiKey?.trim();
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

// 제목과 본문을 따로 호출하면 문맥이 안 이어져 같은 고유명사가 다르게 표기된다
// (실측: 제목 "초 카구야히메!" / 본문 "초카구야히메!"). 용어집으로는 미리 알 수 없는
// 이름까지 맞추려면 한 번에 번역해야 한다. 구획 표시를 못 찾으면 개별 번역으로 돌아간다.
const TITLE_MARK = "<<<TITLE>>>";
const BODY_MARK = "<<<BODY>>>";

export async function translateNewsItem(
  title: string,
  body: string,
): Promise<{ title?: string; body?: string }> {
  if (!isConfigured()) return {};
  if (!body.trim()) return { title: await translateJaToKo(title) };

  const merged = `${TITLE_MARK}\n${title}\n${BODY_MARK}\n${body}`;
  const out = await translateJaToKo(merged, MERGE_HINT);
  if (out) {
    const ti = out.indexOf(TITLE_MARK);
    const bi = out.indexOf(BODY_MARK);
    if (ti !== -1 && bi > ti) {
      return {
        title: out.slice(ti + TITLE_MARK.length, bi).trim() || undefined,
        body: out.slice(bi + BODY_MARK.length).trim() || undefined,
      };
    }
    console.warn("[translate] 구획 표시를 찾지 못해 개별 번역으로 대체");
  }
  const [t, b] = await Promise.all([translateJaToKo(title), translateJaToKo(body)]);
  return { title: t, body: b };
}

const MERGE_HINT = [
  "",
  `입력은 ${TITLE_MARK} 다음 줄에 제목, ${BODY_MARK} 다음 줄에 본문이 온다.`,
  `출력에도 ${TITLE_MARK} 와 ${BODY_MARK} 를 같은 순서로 그대로 넣어라.`,
  "제목과 본문에 같은 이름이 나오면 반드시 똑같은 표기를 써라.",
].join("\n");

/** 실패하면 undefined. 번역은 부가 기능이라 호출부를 중단시키지 않는다. */
export async function translateJaToKo(text: string, extraHint = ""): Promise<string | undefined> {
  const key = CONFIG.geminiApiKey?.trim();
  if (!key) return undefined;
  const source = text.trim();
  if (!source) return undefined;
  // 할당량 쿨다운 중이면 API 를 호출하지 않고 즉시 실패로 돌려준다(호출/할당량 낭비 방지).
  if (Date.now() < quotaCooldownUntil) return undefined;
  const clipped = source.length > MAX_INPUT_CHARS ? source.slice(0, MAX_INPUT_CHARS) : source;

  const model = CONFIG.geminiModel?.trim() || DEFAULT_MODEL;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 폭주 감지: 최근 창의 실제 호출 수가 임계 이상이면 쿨다운 걸고 중단.
    const nowTs = Date.now();
    callTimes = callTimes.filter((t) => nowTs - t < BURST_WINDOW_MS);
    if (callTimes.length >= BURST_LIMIT) {
      quotaCooldownUntil = nowTs + QUOTA_COOLDOWN_MS;
      console.warn(`[translate] 다중 요청 감지(${callTimes.length}/${Math.round(BURST_WINDOW_MS / 60000)}분) → ${Math.round(QUOTA_COOLDOWN_MS / 60000)}분 쿨다운`);
      return undefined;
    }
    callTimes.push(nowTs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT + extraHint }] },
          contents: [{ role: "user", parts: [{ text: clipped }] }],
          generationConfig: { temperature: 0 },
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        // 429 는 할당량 소진 → 재시도하지 않고 전역 쿨다운을 건다(그동안 모든 호출 스킵).
        if (res.status === 429) {
          quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
          console.warn(`[translate] ${model} HTTP 429 할당량 소진 → ${Math.round(QUOTA_COOLDOWN_MS / 60000)}분 쿨다운`);
          return undefined;
        }
        // 5xx 는 일시적 과부하다. 한 번 더 시도한다.
        if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }
        console.warn(`[translate] ${model} HTTP ${res.status}: ${detail}`);
        return undefined;
      }
      const data = await res.json() as GeminiResponse;
      const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (!out) return undefined;
      // 지시를 무시하고 입력을 그대로 되돌려주는 모델이 있다(실측: 3.5-flash-lite).
      // 번역이 안 된 결과를 "번역본"으로 보여주면 원문보다 나쁘므로 실패로 취급한다.
      if (out === clipped) {
        console.warn(`[translate] ${model}: 입력을 그대로 반환(번역 안 됨)`);
        return undefined;
      }
      return out;
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      console.warn("[translate] 실패:", e instanceof Error ? e.message : e);
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
  return undefined;
}
