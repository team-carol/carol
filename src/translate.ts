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
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

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
  const clipped = source.length > MAX_INPUT_CHARS ? source.slice(0, MAX_INPUT_CHARS) : source;

  const model = CONFIG.geminiModel?.trim() || DEFAULT_MODEL;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
        // 429/503 은 일시적 과부하다(실측: 3.8-flash 가 503 반환). 한 번 더 시도한다.
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
