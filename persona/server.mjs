import express from "express";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  addClaim, addDecision, addObservation, createDatabase, getPerson, imageFromRow,
  listPeople, seedDatabase, updateClaim, updateObservation, upsertPerson
} from "./db.mjs";
import { generateCharacterImage } from "./image-service.mjs";

const app = express();
const db = createDatabase();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const samplePeople = JSON.parse(await readFile(new URL("./seed.json", import.meta.url), "utf8"));
seedDatabase(db, samplePeople);

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use("/generated", express.static(resolve("data/generated"), { fallthrough: false }));

const cleanList = value => Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean).slice(0, 30) : [];
const validEvidence = new Set(["observed", "self_report", "inferred"]);

function validatePerson(body) {
  const name = String(body.name || "").trim();
  if (!name) return { error: "称呼不能为空" };
  return {
    value: {
      name: name.slice(0, 50), relation: String(body.relation || "").slice(0, 50),
      knownFor: String(body.knownFor || "").slice(0, 50), mbti: String(body.mbti || "不确定").slice(0, 20),
      zodiac: String(body.zodiac || "不确定").slice(0, 20), traits: cleanList(body.traits), cares: cleanList(body.cares),
      communication: String(body.communication || "").slice(0, 2000), boundaries: String(body.boundaries || "").slice(0, 2000),
      color: /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#3d7771",
      consentStatus: ["granted", "not_recorded", "declined"].includes(body.consentStatus) ? body.consentStatus : "not_recorded"
    }
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, database: true, imageProviderConfigured: Boolean(process.env.OPENAI_API_KEY) }));
app.get("/api/people", (_req, res) => res.json({ people: listPeople(db) }));
app.get("/api/people/:id", (req, res) => {
  const person = getPerson(db, req.params.id);
  if (!person) return res.status(404).json({ error: "人物档案不存在" });
  res.json({ person });
});

app.post("/api/people", (req, res) => {
  const parsed = validatePerson(req.body);
  if (parsed.error) return res.status(400).json(parsed);
  res.status(201).json({ person: upsertPerson(db, parsed.value) });
});

app.patch("/api/people/:id", (req, res) => {
  const current = getPerson(db, req.params.id);
  if (!current) return res.status(404).json({ error: "人物档案不存在" });
  const parsed = validatePerson({ ...current, ...req.body });
  if (parsed.error) return res.status(400).json(parsed);
  res.json({ person: upsertPerson(db, parsed.value, req.params.id) });
});

app.delete("/api/people/:id", (req, res) => {
  const result = db.prepare("DELETE FROM people WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "人物档案不存在" });
  res.status(204).end();
});

app.post("/api/people/:id/observations", (req, res) => {
  if (!getPerson(db, req.params.id)) return res.status(404).json({ error: "人物档案不存在" });
  const fact = String(req.body.fact || "").trim();
  if (!fact) return res.status(400).json({ error: "观察事实不能为空" });
  const confidence = Math.max(0, Math.min(100, Number(req.body.confidence ?? 60)));
  const observation = addObservation(db, req.params.id, {
    fact: fact.slice(0, 3000), context: String(req.body.context || "").slice(0, 500),
    interpretation: String(req.body.interpretation || "").slice(0, 2000),
    evidenceType: validEvidence.has(req.body.evidenceType) ? req.body.evidenceType : "observed",
    confidence, date: String(req.body.date || "").slice(0, 10)
  });
  res.status(201).json({ observation });
});

app.patch("/api/people/:personId/observations/:observationId", (req, res) => {
  const fact = req.body.fact === undefined ? undefined : String(req.body.fact).trim().slice(0, 3000);
  if (fact !== undefined && !fact) return res.status(400).json({ error: "观察事实不能为空" });
  const observation = updateObservation(db, req.params.personId, req.params.observationId, {
    fact,
    context: req.body.context === undefined ? undefined : String(req.body.context).slice(0, 500),
    interpretation: req.body.interpretation === undefined ? undefined : String(req.body.interpretation).slice(0, 2000),
    evidenceType: validEvidence.has(req.body.evidenceType) ? req.body.evidenceType : undefined,
    confidence: req.body.confidence === undefined ? undefined : Math.max(0, Math.min(100, Number(req.body.confidence))),
    date: req.body.date === undefined ? undefined : String(req.body.date).slice(0, 10)
  });
  if (!observation) return res.status(404).json({ error: "观察记录不存在" });
  res.json({ observation });
});

app.delete("/api/people/:personId/observations/:observationId", (req, res) => {
  const result = db.prepare("DELETE FROM observations WHERE id = ? AND person_id = ?").run(req.params.observationId, req.params.personId);
  if (!result.changes) return res.status(404).json({ error: "观察记录不存在" });
  res.status(204).end();
});

app.post("/api/people/:id/claims", (req, res) => {
  if (!getPerson(db, req.params.id)) return res.status(404).json({ error: "人物档案不存在" });
  const label = String(req.body.label || "").trim();
  if (!label) return res.status(400).json({ error: "性格结论不能为空" });
  const observationIds = Array.isArray(req.body.observationIds) ? req.body.observationIds.map(String).slice(0, 30) : [];
  const claim = addClaim(db, req.params.id, {
    label: label.slice(0, 100), category: ["trait", "care", "communication", "boundary"].includes(req.body.category) ? req.body.category : "trait",
    confidence: Math.max(0, Math.min(100, Number(req.body.confidence ?? 60))),
    notes: String(req.body.notes || "").slice(0, 1000), observationIds
  });
  res.status(201).json({ claim });
});

app.patch("/api/people/:personId/claims/:claimId", (req, res) => {
  const claim = updateClaim(db, req.params.personId, req.params.claimId, {
    label: req.body.label === undefined ? undefined : String(req.body.label).trim().slice(0, 100),
    category: ["trait", "care", "communication", "boundary"].includes(req.body.category) ? req.body.category : undefined,
    confidence: req.body.confidence === undefined ? undefined : Math.max(0, Math.min(100, Number(req.body.confidence))),
    notes: req.body.notes === undefined ? undefined : String(req.body.notes).slice(0, 1000),
    observationIds: Array.isArray(req.body.observationIds) ? req.body.observationIds.map(String).slice(0, 30) : undefined
  });
  if (!claim) return res.status(404).json({ error: "画像结论不存在" });
  res.json({ claim });
});

app.delete("/api/people/:personId/claims/:claimId", (req, res) => {
  const result = db.prepare("DELETE FROM trait_claims WHERE id = ? AND person_id = ?").run(req.params.claimId, req.params.personId);
  if (!result.changes) return res.status(404).json({ error: "画像结论不存在" });
  res.status(204).end();
});

app.post("/api/people/:id/decisions", (req, res) => {
  const person = getPerson(db, req.params.id);
  if (!person) return res.status(404).json({ error: "人物档案不存在" });
  const scenario = String(req.body.scenario || "").trim();
  if (!scenario) return res.status(400).json({ error: "请填写具体情境" });
  const options = cleanList(req.body.options);
  const result = {
    headline: "先确认事实，再给出清楚的选择",
    priorities: person.cares.slice(0, 3),
    suggestedOption: options[1] || options[0] || "先询问对方的想法，再共同确定方案",
    communication: person.communication || "用清楚、尊重且允许拒绝的方式直接询问。",
    question: "这个安排对你方便吗？有没有我还没考虑到的地方？",
    confidence: Math.min(90, 45 + person.observations.length * 10),
    basis: person.observations.slice(0, 3).map(item => ({ fact: item.fact, evidenceType: item.evidenceType, confidence: item.confidence }))
  };
  const decision = addDecision(db, person.id, scenario.slice(0, 2000), options, result);
  res.json({ result, decisionId: decision.id });
});

app.patch("/api/people/:personId/decisions/:decisionId/feedback", (req, res) => {
  const existing = db.prepare("SELECT * FROM decisions WHERE id = ? AND person_id = ?").get(req.params.decisionId, req.params.personId);
  if (!existing) return res.status(404).json({ error: "决策记录不存在" });
  const outcome = ["helpful", "mixed", "missed"].includes(req.body.outcome) ? req.body.outcome : null;
  const scoreMap = { missed: 1, mixed: 2, helpful: 3 };
  db.prepare("UPDATE decisions SET outcome=?, outcome_notes=?, helpful_score=?, updated_at=? WHERE id=? AND person_id=?")
    .run(outcome, String(req.body.notes || "").slice(0, 2000), outcome ? scoreMap[outcome] : null, new Date().toISOString(), req.params.decisionId, req.params.personId);
  res.json({ decision: getPerson(db, req.params.personId).decisions.find(item => item.id === req.params.decisionId) });
});

app.post("/api/people/:id/images", async (req, res, next) => {
  try {
    const person = getPerson(db, req.params.id);
    if (!person) return res.status(404).json({ error: "人物档案不存在" });
    const generated = await generateCharacterImage(person, { style: String(req.body.style || "").slice(0, 100) });
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare("INSERT INTO generated_images (id, person_id, prompt, provider, status, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, person.id, generated.prompt, generated.provider, generated.status, generated.fileName, createdAt);
    const row = db.prepare("SELECT * FROM generated_images WHERE id = ?").get(id);
    res.status(201).json({ image: imageFromRow(row), providerConfigured: Boolean(process.env.OPENAI_API_KEY) });
  } catch (error) { next(error); }
});

app.get("/api/privacy", (_req, res) => {
  const people = db.prepare("SELECT COUNT(*) AS count FROM people").get().count;
  const observations = db.prepare("SELECT COUNT(*) AS count FROM observations").get().count;
  const images = db.prepare("SELECT COUNT(*) AS count FROM generated_images").get().count;
  const claims = db.prepare("SELECT COUNT(*) AS count FROM trait_claims").get().count;
  const decisions = db.prepare("SELECT COUNT(*) AS count FROM decisions").get().count;
  res.json({ storage: "local-sqlite", people, observations, claims, decisions, images, host: HOST, databasePath: "data/persona-notes.sqlite" });
});

app.get("/api/backup", (_req, res) => {
  const backup = { version: 2, exportedAt: new Date().toISOString(), people: listPeople(db) };
  res.setHeader("Content-Disposition", `attachment; filename=persona-notes-backup-${Date.now()}.json`);
  res.json(backup);
});

app.post("/api/restore", (req, res) => {
  if (req.body.confirm !== true || !Array.isArray(req.body.people)) return res.status(400).json({ error: "恢复需要 confirm=true 和有效的 people 数组" });
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM people");
    for (const person of req.body.people) {
      const parsed = validatePerson(person);
      if (parsed.error) throw new Error(parsed.error);
      const saved = upsertPerson(db, parsed.value, person.id || randomUUID());
      for (const item of person.observations || []) addObservation(db, saved.id, {
        id: item.id, date: item.date, context: item.context || item.source, fact: item.fact || item.text,
        interpretation: item.interpretation, evidenceType: item.evidenceType, confidence: item.confidence
      });
      for (const claim of person.claims || []) addClaim(db, saved.id, {
        label: claim.label, category: claim.category, confidence: claim.confidence, notes: claim.notes,
        observationIds: (claim.evidence || []).map(item => item.id)
      });
      for (const decision of person.decisions || []) {
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO decisions (id, person_id, scenario, options_json, result_json, outcome, outcome_notes, helpful_score, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(decision.id || randomUUID(), saved.id, decision.scenario, JSON.stringify(decision.options || []), JSON.stringify(decision.result || {}),
            decision.outcome || null, decision.outcomeNotes || "", decision.helpfulScore || null, decision.createdAt || now, decision.updatedAt || now);
      }
      for (const history of person.history || []) {
        db.prepare("INSERT INTO profile_history (id, person_id, snapshot_json, reason, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(history.id || randomUUID(), saved.id, JSON.stringify(history.snapshot || {}), history.reason || "restored", history.createdAt || new Date().toISOString());
      }
      for (const image of person.images || []) {
        const fileName = image.imageUrl ? image.imageUrl.split("/").pop() : null;
        db.prepare("INSERT INTO generated_images (id, person_id, prompt, provider, status, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(image.id || randomUUID(), saved.id, image.prompt || "", image.provider || "restored", image.status || "prompt_ready", fileName, image.createdAt || new Date().toISOString());
      }
    }
    db.exec("COMMIT");
    res.json({ restored: true, people: listPeople(db).length });
  } catch (error) {
    db.exec("ROLLBACK");
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/data", (req, res) => {
  if (req.get("x-confirm-delete") !== "DELETE-ALL") return res.status(400).json({ error: "缺少删除确认" });
  db.exec("DELETE FROM people");
  res.status(204).end();
});

app.get("/", (_req, res) => res.sendFile(resolve("index.html")));
app.get("/styles.css", (_req, res) => res.sendFile(resolve("styles.css")));
app.get("/app.js", (_req, res) => res.sendFile(resolve("app.js")));
app.get("/{*splat}", (_req, res) => res.status(404).send("Not found"));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "服务器处理失败，请稍后重试" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, HOST, () => console.log(`识人簿运行在 http://${HOST}:${PORT}`));
}

export { app, db };
