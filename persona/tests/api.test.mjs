import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
delete process.env.OPENAI_API_KEY;

const { app } = await import("../server.mjs");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test("health and seeded people are available", async () => {
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.database, true);
  assert.ok(health.response.headers.get("content-security-policy"));
  const protectedDatabase = await fetch(base + "/data/persona-notes.sqlite");
  assert.equal(protectedDatabase.status, 404);
  const people = await request("/api/people");
  assert.ok(people.body.people.length >= 2);
});

test("person CRUD, observation and decision flow", async () => {
  const created = await request("/api/people", {
    method: "POST",
    body: JSON.stringify({
      name: "测试人物", relation: "同学", mbti: "INTJ", zodiac: "不确定",
      traits: ["认真"], cares: ["守时"], communication: "先说明背景", consentStatus: "granted"
    })
  });
  assert.equal(created.response.status, 201);
  const id = created.body.person.id;

  const observation = await request(`/api/people/${id}/observations`, {
    method: "POST",
    body: JSON.stringify({ fact: "提前十分钟到达", context: "小组会议", interpretation: "可能重视守时", confidence: 80 })
  });
  assert.equal(observation.response.status, 201);
  const observationId = observation.body.observation.id;

  const editedObservation = await request(`/api/people/${id}/observations/${observationId}`, {
    method: "PATCH",
    body: JSON.stringify({ interpretation: "在这个场景中可能比较重视守时", confidence: 75 })
  });
  assert.equal(editedObservation.body.observation.confidence, 75);

  const claim = await request(`/api/people/${id}/claims`, {
    method: "POST",
    body: JSON.stringify({ label: "可能重视守时", category: "care", confidence: 75, observationIds: [observationId] })
  });
  assert.equal(claim.response.status, 201);
  assert.equal(claim.body.claim.evidence.length, 1);

  const updated = await request(`/api/people/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ relation: "合作伙伴", name: "测试人物" })
  });
  assert.equal(updated.body.person.relation, "合作伙伴");
  assert.equal(updated.body.person.observations.length, 1);
  assert.equal(updated.body.person.history.length, 1);
  assert.equal(updated.body.person.claims.length, 1);

  const decision = await request(`/api/people/${id}/decisions`, {
    method: "POST",
    body: JSON.stringify({ scenario: "安排会议", options: ["直接确定", "先询问时间"] })
  });
  assert.equal(decision.response.status, 200);
  assert.equal(decision.body.result.suggestedOption, "先询问时间");
  assert.ok(decision.body.decisionId);

  const feedback = await request(`/api/people/${id}/decisions/${decision.body.decisionId}/feedback`, {
    method: "PATCH",
    body: JSON.stringify({ outcome: "helpful", notes: "对方接受了先确认时间的方式" })
  });
  assert.equal(feedback.body.decision.outcome, "helpful");

  const image = await request(`/api/people/${id}/images`, { method: "POST", body: JSON.stringify({ style: "编辑插画" }) });
  assert.equal(image.response.status, 201);
  assert.equal(image.body.image.status, "prompt_ready");

  const removed = await request(`/api/people/${id}`, { method: "DELETE" });
  assert.equal(removed.response.status, 204);
  const missing = await request(`/api/people/${id}`);
  assert.equal(missing.response.status, 404);
});

test("backup can restore deleted data", async () => {
  const seeded = await request("/api/people");
  const personId = seeded.body.people[0].id;
  const obs = await request(`/api/people/${personId}/observations`, {
    method: "POST", body: JSON.stringify({ fact: "用于备份测试的观察", confidence: 70 })
  });
  await request(`/api/people/${personId}/claims`, {
    method: "POST", body: JSON.stringify({ label: "备份画像结论", observationIds: [obs.body.observation.id] })
  });
  const decision = await request(`/api/people/${personId}/decisions`, {
    method: "POST", body: JSON.stringify({ scenario: "备份决策", options: ["方案一"] })
  });
  await request(`/api/people/${personId}/decisions/${decision.body.decisionId}/feedback`, {
    method: "PATCH", body: JSON.stringify({ outcome: "mixed", notes: "备份反馈" })
  });
  const before = await request("/api/backup");
  const originalCount = before.body.people.length;
  await request("/api/data", { method: "DELETE", headers: { "x-confirm-delete": "DELETE-ALL" } });
  const empty = await request("/api/people");
  assert.equal(empty.body.people.length, 0);
  const restored = await request("/api/restore", {
    method: "POST",
    body: JSON.stringify({ confirm: true, people: before.body.people })
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.people, originalCount);
  const after = await request(`/api/people/${personId}`);
  assert.equal(after.body.person.claims[0].evidence.length, 1);
  assert.equal(after.body.person.decisions[0].outcomeNotes, "备份反馈");
});

test.after(() => new Promise(resolve => server.close(resolve)));
