// 채보를 어디서 가져오는지를 한 겹 감싼다.
//
// /보면 은 원래 유저가 올린 maidata.txt 만 재생했다. 공급원이 늘어나도 명령어
// 쪽은 그대로 두기 위해 여기로 모은다. 지금 있는 공급원은:
//
//   upload    유저가 첨부한 파일. 이 파일을 거치지 않고 chart.ts 가 직접 처리한다.
//   registry  운영자가 직접 확보해 DB 에 넣어 둔 채보 (simai_charts.source='registry')
//   mainotes  mai-notes.com. 검색은 되지만 채보 본문은 아직 받아오지 않는다.
//             — 운영자에게 이용 허락을 문의해 둔 상태이고, 답을 받기 전에는
//               가져오지 않는다. 허락이 나오면 src/mainotes/source.ts 만 채우면 되고,
//               거절되면 src/mainotes/ 를 지우고 아래 SOURCES 에서 한 줄만 빼면 된다.

import { getSimaiChart } from "../storage";
import { atwikiSourceUrlFromId } from "./atwiki";

/** 채보를 줄 수 없는 이유. 유저에게 왜 안 되는지 그대로 알려주기 위해 구분한다. */
export type UnavailableReason =
  | "not-found"      // 그런 채보가 없음
  | "no-data"        // 목록에는 있지만 본문을 가진 곳이 없음
  | "no-permission"; // 가져올 수는 있지만 아직 허락받지 않음

export class ChartUnavailableError extends Error {
  constructor(readonly reason: UnavailableReason, message?: string) {
    super(message ?? reason);
    this.name = "ChartUnavailableError";
  }
}

/** 공급원이 돌려주는 채보 한 개. maidata 본문은 호출한 쪽에서 파싱한다. */
export interface ResolvedChart {
  title: string;
  artist: string;
  designer: string;
  level: string;
  difficulty: number;
  maidata: string;
  /** 출처 표기에 쓴다. 예: "simai wiki" */
  attribution: string;
  /** 원본 페이지 링크(크레딧). 있으면 /보면 응답에 걸어 원작자를 알 수 있게 한다. */
  sourceUrl?: string;
  /** 이미 simai_charts 에 들어 있는 채보면 그 id. 있으면 다시 저장하지 않는다. */
  storedId?: string;
}

export interface ChartSource {
  readonly name: string;
  /** key 는 "<name>:<식별자>" 에서 앞부분을 뗀 나머지. */
  load(id: string): Promise<ResolvedChart>;
}

const registrySource: ChartSource = {
  name: "registry",
  async load(id) {
    const row = (await getSimaiChart(id)) as any;
    if (!row || row.source !== "registry") throw new ChartUnavailableError("not-found");
    if (!row.maidata) throw new ChartUnavailableError("no-data");
    // atwiki 에서 온 채보면 원본 페이지 링크를 붙여 크레딧을 남긴다(id 에서 유도).
    const sourceUrl = atwikiSourceUrlFromId(id) ?? undefined;
    return {
      title: row.title ?? "", artist: row.artist ?? "", designer: row.designer ?? "",
      level: row.level ?? "", difficulty: Number(row.difficulty ?? 0),
      maidata: row.maidata, attribution: sourceUrl ? "simai wiki" : "", sourceUrl, storedId: id,
    };
  },
};

const SOURCES: ChartSource[] = [registrySource];

/** 공급원을 등록한다. 모듈 하나를 통째로 들어내도 나머지가 돌아가게 하기 위한 통로. */
export function registerChartSource(source: ChartSource): void {
  if (!SOURCES.some((s) => s.name === source.name)) SOURCES.push(source);
}

export function makeChartKey(source: string, id: string): string { return `${source}:${id}`; }

/** "mainotes:<uuid>" 같은 키를 받아 채보를 가져온다. */
export async function resolveChart(key: string): Promise<ResolvedChart> {
  const at = key.indexOf(":");
  if (at <= 0) throw new ChartUnavailableError("not-found");
  const name = key.slice(0, at);
  const id = key.slice(at + 1);
  const source = SOURCES.find((s) => s.name === name);
  if (!source) throw new ChartUnavailableError("not-found");
  return source.load(id);
}
