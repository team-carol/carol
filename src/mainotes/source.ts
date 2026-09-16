// mai-notes 채보 공급원.
//
// **지금은 채보 본문을 가져오지 않는다.** manifest.json 은 메타데이터 인덱스일 뿐이고
// simai 본문은 다른 경로에 있는데, 그 경로를 찾으려면 사이트 내부 통신을 뒤져야 한다.
// mai-notes 이용약관 제7조가 서비스의 해석·리버스 엔지니어링을 금지하고 있어,
// 운영자에게 이용 허락을 문의해 둔 상태다. 답을 받기 전에는 받아오지 않는다.
//
// 허락이 나오면 load() 안만 채우면 된다. 그때도 지켜야 할 것:
//   - 한 번 받은 채보는 simai_charts 에 source='mainotes' 로 캐시하고 다시 묻지 않는다
//   - 요청은 직렬로, 사용자가 실제로 연 채보만
//   - client.ts 의 User-Agent 를 그대로 쓴다
//
// 거절되면 이 파일과 src/mainotes/ 를 지우고, src/simai/source.ts 의 registerChartSource
// 호출 한 줄만 빼면 나머지 기능은 그대로 남는다.

import { ChartUnavailableError, type ChartSource } from "../simai/source";
import { getChartById } from "./index";

export const mainotesSource: ChartSource = {
  name: "mainotes",
  async load(id) {
    const meta = getChartById(id);
    if (!meta) throw new ChartUnavailableError("not-found");
    if (!meta.hasData) throw new ChartUnavailableError("no-data");
    // 목록에는 있고 상대도 데이터를 가지고 있지만, 아직 받아올 권한이 없다.
    throw new ChartUnavailableError("no-permission");
  },
};
