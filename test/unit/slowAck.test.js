// src/bot/utils/slowAck.ts — 핸들러가 늦으면 대신 defer 하고, 비공개 응답은 공개 대기 메시지를 지운 뒤 비공개로 보낸다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const { guardSlowAck } = require("../../dist/bot/utils/slowAck.js");

function fake(isButton = false) {
  const calls = [];
  const i = {
    deferred: false, replied: false,
    isButton: () => isButton,
    isMessageComponent: () => isButton,
    reply: async (o) => { calls.push(["reply", o]); i.replied = true; },
    deferReply: async (o) => { calls.push(["deferReply", o]); i.deferred = true; },
    editReply: async (o) => { calls.push(["editReply", o]); },
    deleteReply: async () => { calls.push(["deleteReply"]); },
    followUp: async (o) => { calls.push(["followUp", o]); return { id: "m1" }; },
    webhook: { editMessage: async (_m, o) => { calls.push(["webhookEdit", o]); } },
    update: async (o) => { calls.push(["update", o]); i.replied = true; },
    deferUpdate: async () => { calls.push(["deferUpdate"]); i.deferred = true; },
  };
  return { i, calls };
}
const names = (calls) => calls.map((c) => c[0]);
const EPH = { content: "비공개", flags: MessageFlags.Ephemeral };

test.beforeEach((t) => t.mock.timers.enable({ apis: ["setTimeout"] }));

test("제때 응답하면 끼어들지 않는다", async (t) => {
  const { i, calls } = fake();
  guardSlowAck(i);
  await i.reply({ content: "ok" });
  t.mock.timers.tick(3000);
  assert.deepEqual(names(calls), ["reply"]);
});

test("늦은 공개 응답: 대신 defer 하고 editReply", async (t) => {
  const { i, calls } = fake();
  guardSlowAck(i);
  t.mock.timers.tick(2300);
  await i.reply({ content: "ok", flags: undefined });
  assert.deepEqual(names(calls), ["deferReply", "editReply"]);
});

test("늦은 비공개 응답: 공개 대기 메시지를 지우고 비공개 followUp", async (t) => {
  const { i, calls } = fake();
  guardSlowAck(i);
  t.mock.timers.tick(2300);
  await i.reply(EPH);
  assert.deepEqual(names(calls), ["deferReply", "deleteReply", "followUp"]);
  assert.equal(calls[2][1].flags, MessageFlags.Ephemeral);
  assert.equal(calls[2][1].content, "비공개");
});

test("늦은 뒤 핸들러가 비공개로 defer → 이후 editReply 는 비공개 메시지로", async (t) => {
  const { i, calls } = fake();
  guardSlowAck(i);
  t.mock.timers.tick(2300);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await i.editReply({ content: "a" });
  await i.editReply({ content: "b" });
  assert.deepEqual(names(calls), ["deferReply", "deleteReply", "followUp", "webhookEdit"]);
});

test("원래 메시지를 고치는 버튼: deferUpdate 후 editReply", async (t) => {
  const { i, calls } = fake(true);
  guardSlowAck(i, "update");
  t.mock.timers.tick(2300);
  await i.update({ content: "page 2" });
  assert.deepEqual(names(calls), ["deferUpdate", "editReply"]);
});

test("늦은 Components V2 응답: 대신 defer 한 뒤에도 V2 플래그는 남긴다", async (t) => {
  const { i, calls } = fake();
  guardSlowAck(i);
  t.mock.timers.tick(2300);
  await i.reply({ components: [], flags: MessageFlags.IsComponentsV2 });
  const edit = calls.find((c) => c[0] === "editReply");
  assert.equal(edit[1].flags, MessageFlags.IsComponentsV2);
});
