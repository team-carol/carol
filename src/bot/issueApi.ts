import { CONFIG } from "../config";

// carol-issue /triage/* 계약 (docs/openapi.json 원천).

export type IssueType = "bug" | "feature" | "question" | "task" | "other";
export type IssuePriority = "low" | "medium" | "high" | "critical";

export interface ReportContext {
  content: string;
  reporterId: string;
  reporterName: string;
  guildId: string;
  channelId: string;
  messageUrl: string;
  conversationLog?: string;
  attachments?: string[];
}

export interface Draft {
  title: string;
  summary: string;
  details?: string;
  reproduction?: string;
  expected?: string;
  actual?: string;
  labels: string[];
  type: IssueType;
  priority: IssuePriority;
  needsMoreInfo: boolean;
}

export interface IssueResult {
  issueNumber: number;
  issueUrl: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

export class CarolIssueError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "CarolIssueError";
  }
}

/** carolIssueBaseUrl + carolSharedSecret 이 모두 설정돼야 제보 기능이 활성화된다. */
export function isConfigured(): boolean {
  return Boolean(CONFIG.carolIssueBaseUrl && CONFIG.carolSharedSecret);
}

async function callTriage<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = CONFIG.carolIssueBaseUrl!.replace(/\/+$/, "");
  const guildId = typeof body.guildId === "string" ? body.guildId : "";

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONFIG.carolSharedSecret}`,
        "Content-Type": "application/json",
        "X-Carol-Client-Id": CONFIG.clientId,
        "X-Carol-Guild-Id": guildId,
        "X-Carol-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "요청 시간 초과" : "네트워크 오류";
    throw new CarolIssueError("NETWORK_ERROR", `${reason}: ${String(e)}`, 0);
  }

  if (!res.ok) {
    let code = "UNKNOWN";
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: { code?: string; message?: string } };
      if (json.error?.code) code = json.error.code;
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      /* 본문 파싱 실패 시 statusText 유지 */
    }
    throw new CarolIssueError(code, message, res.status);
  }

  return (await res.json()) as T;
}

export async function postDraft(ctx: ReportContext): Promise<Draft> {
  const { draft } = await callTriage<{ draft: Draft }>("/triage/draft", { ...ctx });
  return draft;
}

export async function postIssue(ctx: ReportContext, draft?: Draft): Promise<IssueResult> {
  return callTriage<IssueResult>("/triage/issues", draft ? { ...ctx, draft } : { ...ctx });
}

/** carol-issue 에러 코드 → 사용자 안내 메시지 + 관리자 alert 여부(§7). */
export function userMessageForError(e: unknown): { text: string; alert: boolean } {
  if (e instanceof CarolIssueError) {
    switch (e.code) {
      case "VALIDATION_ERROR":
        return { text: "⚠️ 입력을 확인해주세요. 제보 내용이 비어있거나 형식이 올바르지 않습니다.", alert: false };
      case "AI_PROVIDER_ERROR":
      case "AI_INVALID_OUTPUT":
        return { text: "⏳ AI 초안 생성이 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요.", alert: false };
      case "NETWORK_ERROR":
        return { text: "⏳ 제보 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.", alert: false };
      case "UNAUTHORIZED":
      case "FORBIDDEN_CLIENT":
      case "FORBIDDEN_GUILD":
      case "GITHUB_AUTH_ERROR":
      case "GITHUB_CREATE_ISSUE_ERROR":
      case "INTERNAL_ERROR":
        return { text: "❌ 제보 처리 중 서버 오류가 발생했습니다. 관리자에게 문의해주세요.", alert: true };
      default:
        return { text: "❌ 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", alert: true };
    }
  }
  return { text: "❌ 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", alert: true };
}
