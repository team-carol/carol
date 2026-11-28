// 디스코드 Activity 보면 플레이어: 인스턴스·채널에 보면 잇기, Entry Point 명령 보존, 페이지가 인라인 스크립트를 쓰지 않는지.
const test = require("node:test");
const assert = require("node:assert/strict");
const activity = require("../../dist/activity.js");
const page = require("../../dist/web/activityPage.js");

test("버튼으로 띄운 직후: 채널에 걸어 둔 보면을 인스턴스에 묶는다", () => {
  activity.resetActivityStateForTest();
  activity.setPendingChart("ch1", "chartA", 1000);
  assert.deepEqual(activity.chartForInstance("inst1", "ch1", 2000), { chartId: "chartA", at: 1000 });
  // 1분이 지나도 인스턴스에 묶인 것은 남는다
  assert.deepEqual(activity.chartForInstance("inst1", "", 120_000), { chartId: "chartA", at: 1000 });
  // 다른 채널은 모른다
  assert.equal(activity.chartForInstance("inst2", "ch2", 2000), null);
  // 채널에 걸어 둔 것은 1분 뒤면 잊는다
  assert.equal(activity.chartForInstance("inst3", "ch1", 70_000), null);
});

test("이미 열린 Activity 에서 다른 보면을 고르면 새 보면이 이긴다", () => {
  activity.resetActivityStateForTest();
  activity.setInstanceChart("inst1", "chartA", 1000);
  activity.setPendingChart("ch1", "chartB", 5000);
  assert.deepEqual(activity.chartForInstance("inst1", "ch1", 6000), { chartId: "chartB", at: 5000 });
  // Activity 안에서 고른 보면이 채널에 걸어 둔 것보다 새로우면 그것
  activity.setInstanceChart("inst1", "chartC", 8000);
  assert.deepEqual(activity.chartForInstance("inst1", "ch1", 9000), { chartId: "chartC", at: 8000 });
});

test("보면 열기는 인스턴스마다 3초에 한 번", () => {
  activity.resetActivityStateForTest();
  assert.equal(activity.allowOpen("inst1", 0), true);
  assert.equal(activity.allowOpen("inst1", 1000), false);
  assert.equal(activity.allowOpen("inst2", 1000), true);
  assert.equal(activity.allowOpen("inst1", 3500), true);
});

test("명령 덮어쓰기에 Entry Point(type 4) 명령만 읽기 전용 필드를 빼고 다시 싣고, 처리는 봇이 한다(초대 메시지 없음)", () => {
  const existing = [
    { id: "1", application_id: "9", version: "5", type: 1, name: "보면", description: "d" },
    { id: "2", application_id: "9", version: "7", type: 4, name: "launch", description: "Launch", handler: 2, integration_types: [0, 1], contexts: [0, 1, 2], default_member_permissions: null, nsfw: false },
  ];
  assert.deepEqual(activity.entryPointCommands(existing), [
    { id: "2", name: "launch", description: "Launch", type: 4, handler: 1, nsfw: false, integration_types: [0, 1], contexts: [0, 1, 2] },
  ]);
  assert.equal(activity.ENTRY_POINT_APP_HANDLER, 1);
  assert.deepEqual(activity.entryPointCommands([]), []);
});

test("Activity 링크: 앱 ID 와 custom_id", () => {
  assert.equal(activity.activityLink("123", "sabcdef01234"), "https://discord.com/activities/123?custom_id=sabcdef01234");
  assert.equal(activity.activityLink("1", "a b&c"), "https://discord.com/activities/1?custom_id=a%20b%26c");
});

test("Activity 페이지는 인라인 스크립트·style 속성 없이 같은 서버 파일만 불러온다(CSP)", () => {
  const chart = { notes: [], stats: { tap: 0, hold: 0, slide: 0, touch: 0, touchHold: 0, break: 0, total: 0 }, durationMs: 61000, bpm: 120, bpmEvents: [], measures: 1 };
  for (const data of [null, { id: "abc", title: "</script><b>", artist: "a", designer: "", level: "13+", difficulty: 4, chart }]) {
    const html = page.activityPage({ clientId: "123", data, loadedAt: 1 });
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) {
      if (/type="application\/json"/.test(attrs)) continue;
      assert.match(attrs, /src="\/activity\/[a-z]+\.js"/);
      assert.equal(body, "");
    }
    assert.doesNotMatch(html, /\sstyle="/);
    assert.doesNotMatch(html, /<style/);
    assert.doesNotMatch(html, /https?:\/\//); // 외부 주소(CDN)는 Activity 안에서 막힌다
  }
  // 제목에 </script> 가 있어도 데이터 블록을 깨지 않는다
  const html = page.activityPage({ clientId: "1", data: { id: "x", title: "</script>", artist: "", designer: "", level: "", difficulty: 1, chart }, loadedAt: 1 });
  assert.equal((html.match(/<\/script>/g) || []).length, 4);
  for (const p of ["/activity/app.css", "/activity/app.js", "/activity/player.js", "/activity/sdk.js"]) assert.ok(page.activityAsset(p), p);
  assert.equal(page.activityAsset("/activity/nope.js"), null);
});
