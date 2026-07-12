import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const defaultPath = resolve("data/persona-notes.sqlite");

export function createDatabase(filename = process.env.DATABASE_PATH || defaultPath) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT '',
      known_for TEXT NOT NULL DEFAULT '',
      mbti TEXT NOT NULL DEFAULT '不确定',
      zodiac TEXT NOT NULL DEFAULT '不确定',
      traits_json TEXT NOT NULL DEFAULT '[]',
      cares_json TEXT NOT NULL DEFAULT '[]',
      communication TEXT NOT NULL DEFAULT '',
      boundaries TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#3d7771',
      consent_status TEXT NOT NULL DEFAULT 'not_recorded',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      observed_at TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      fact TEXT NOT NULL,
      interpretation TEXT NOT NULL DEFAULT '',
      evidence_type TEXT NOT NULL DEFAULT 'observed',
      confidence INTEGER NOT NULL DEFAULT 60 CHECK(confidence BETWEEN 0 AND 100),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_images (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trait_claims (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'trait',
      confidence INTEGER NOT NULL DEFAULT 60 CHECK(confidence BETWEEN 0 AND 100),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trait_evidence (
      claim_id TEXT NOT NULL REFERENCES trait_claims(id) ON DELETE CASCADE,
      observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
      PRIMARY KEY (claim_id, observation_id)
    );

    CREATE TABLE IF NOT EXISTS profile_history (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      snapshot_json TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'manual_update',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      scenario TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      result_json TEXT NOT NULL,
      outcome TEXT,
      outcome_notes TEXT NOT NULL DEFAULT '',
      helpful_score INTEGER CHECK(helpful_score BETWEEN 1 AND 3),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_observations_person ON observations(person_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_images_person ON generated_images(person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_claims_person ON trait_claims(person_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_person ON profile_history(person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_person ON decisions(person_id, created_at DESC);
  `);
  return db;
}

const parseJson = (value, fallback = []) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export function rowToPerson(row, observations = [], images = []) {
  return {
    id: row.id,
    name: row.name,
    relation: row.relation,
    knownFor: row.known_for,
    mbti: row.mbti,
    zodiac: row.zodiac,
    traits: parseJson(row.traits_json),
    cares: parseJson(row.cares_json),
    communication: row.communication,
    boundaries: row.boundaries,
    color: row.color,
    consentStatus: row.consent_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    observations,
    images
  };
}

export function observationFromRow(row) {
  return {
    id: row.id,
    personId: row.person_id,
    date: row.observed_at,
    context: row.context,
    fact: row.fact,
    interpretation: row.interpretation,
    evidenceType: row.evidence_type,
    confidence: row.confidence,
    createdAt: row.created_at,
    text: row.fact,
    source: row.context
  };
}

export function imageFromRow(row) {
  return {
    id: row.id,
    personId: row.person_id,
    prompt: row.prompt,
    provider: row.provider,
    status: row.status,
    imageUrl: row.file_path ? `/generated/${row.file_path}` : null,
    createdAt: row.created_at
  };
}

export function claimFromRow(db, row) {
  const evidence = db.prepare(`
    SELECT o.* FROM observations o
    JOIN trait_evidence te ON te.observation_id = o.id
    WHERE te.claim_id = ? ORDER BY o.observed_at DESC
  `).all(row.id).map(observationFromRow);
  return {
    id: row.id, personId: row.person_id, label: row.label, category: row.category,
    confidence: row.confidence, notes: row.notes, evidence,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function decisionFromRow(row) {
  return {
    id: row.id, personId: row.person_id, scenario: row.scenario,
    options: parseJson(row.options_json), result: parseJson(row.result_json, {}),
    outcome: row.outcome, outcomeNotes: row.outcome_notes,
    helpfulScore: row.helpful_score, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function historyFromRow(row) {
  return {
    id: row.id, personId: row.person_id, snapshot: parseJson(row.snapshot_json, {}),
    reason: row.reason, createdAt: row.created_at
  };
}

export function getPerson(db, id) {
  const row = db.prepare("SELECT * FROM people WHERE id = ?").get(id);
  if (!row) return null;
  const observations = db.prepare("SELECT * FROM observations WHERE person_id = ? ORDER BY observed_at DESC, created_at DESC").all(id).map(observationFromRow);
  const images = db.prepare("SELECT * FROM generated_images WHERE person_id = ? ORDER BY created_at DESC").all(id).map(imageFromRow);
  const person = rowToPerson(row, observations, images);
  person.claims = db.prepare("SELECT * FROM trait_claims WHERE person_id = ? ORDER BY updated_at DESC").all(id).map(item => claimFromRow(db, item));
  person.history = db.prepare("SELECT * FROM profile_history WHERE person_id = ? ORDER BY created_at DESC LIMIT 30").all(id).map(historyFromRow);
  person.decisions = db.prepare("SELECT * FROM decisions WHERE person_id = ? ORDER BY created_at DESC LIMIT 50").all(id).map(decisionFromRow);
  return person;
}

export function listPeople(db) {
  return db.prepare("SELECT * FROM people ORDER BY updated_at DESC").all().map(row => getPerson(db, row.id));
}

export function upsertPerson(db, input, id = randomUUID()) {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM people WHERE id = ?").get(id);
  if (existing) {
    const snapshot = rowToPerson(existing);
    db.prepare("INSERT INTO profile_history (id, person_id, snapshot_json, reason, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), id, JSON.stringify(snapshot), "manual_update", now);
  }
  db.prepare(`
    INSERT INTO people (id, name, relation, known_for, mbti, zodiac, traits_json, cares_json, communication, boundaries, color, consent_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, relation=excluded.relation, known_for=excluded.known_for,
      mbti=excluded.mbti, zodiac=excluded.zodiac, traits_json=excluded.traits_json,
      cares_json=excluded.cares_json, communication=excluded.communication,
      boundaries=excluded.boundaries, color=excluded.color,
      consent_status=excluded.consent_status, updated_at=excluded.updated_at
  `).run(
    id, input.name, input.relation || "", input.knownFor || "", input.mbti || "不确定",
    input.zodiac || "不确定", JSON.stringify(input.traits || []), JSON.stringify(input.cares || []),
    input.communication || "", input.boundaries || "", input.color || "#3d7771",
    input.consentStatus || "not_recorded", existing?.created_at || now, now
  );
  return getPerson(db, id);
}

export function updateObservation(db, personId, observationId, input) {
  const existing = db.prepare("SELECT * FROM observations WHERE id = ? AND person_id = ?").get(observationId, personId);
  if (!existing) return null;
  const next = {
    date: input.date ?? existing.observed_at,
    context: input.context ?? existing.context,
    fact: input.fact ?? existing.fact,
    interpretation: input.interpretation ?? existing.interpretation,
    evidenceType: input.evidenceType ?? existing.evidence_type,
    confidence: Number(input.confidence ?? existing.confidence)
  };
  db.prepare(`UPDATE observations SET observed_at=?, context=?, fact=?, interpretation=?, evidence_type=?, confidence=? WHERE id=? AND person_id=?`)
    .run(next.date, next.context, next.fact, next.interpretation, next.evidenceType, next.confidence, observationId, personId);
  db.prepare("UPDATE people SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), personId);
  return observationFromRow(db.prepare("SELECT * FROM observations WHERE id = ?").get(observationId));
}

export function addClaim(db, personId, input) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO trait_claims (id, person_id, label, category, confidence, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, personId, input.label, input.category || "trait", Number(input.confidence ?? 60), input.notes || "", now, now);
  const link = db.prepare("INSERT OR IGNORE INTO trait_evidence (claim_id, observation_id) VALUES (?, ?)");
  for (const observationId of input.observationIds || []) link.run(id, observationId);
  return claimFromRow(db, db.prepare("SELECT * FROM trait_claims WHERE id = ?").get(id));
}

export function updateClaim(db, personId, claimId, input) {
  const existing = db.prepare("SELECT * FROM trait_claims WHERE id = ? AND person_id = ?").get(claimId, personId);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE trait_claims SET label=?, category=?, confidence=?, notes=?, updated_at=? WHERE id=? AND person_id=?")
    .run(input.label ?? existing.label, input.category ?? existing.category, Number(input.confidence ?? existing.confidence), input.notes ?? existing.notes, now, claimId, personId);
  if (Array.isArray(input.observationIds)) {
    db.prepare("DELETE FROM trait_evidence WHERE claim_id = ?").run(claimId);
    const link = db.prepare("INSERT OR IGNORE INTO trait_evidence (claim_id, observation_id) VALUES (?, ?)");
    for (const observationId of input.observationIds) link.run(claimId, observationId);
  }
  return claimFromRow(db, db.prepare("SELECT * FROM trait_claims WHERE id = ?").get(claimId));
}

export function addDecision(db, personId, scenario, options, result) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO decisions (id, person_id, scenario, options_json, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, personId, scenario, JSON.stringify(options), JSON.stringify(result), now, now);
  return decisionFromRow(db.prepare("SELECT * FROM decisions WHERE id = ?").get(id));
}

export function addObservation(db, personId, input) {
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO observations (id, person_id, observed_at, context, fact, interpretation, evidence_type, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, personId, input.date || now.slice(0, 10), input.context || "手动记录", input.fact,
    input.interpretation || "", input.evidenceType || "observed", Number(input.confidence ?? 60), now
  );
  db.prepare("UPDATE people SET updated_at = ? WHERE id = ?").run(now, personId);
  return observationFromRow(db.prepare("SELECT * FROM observations WHERE id = ?").get(id));
}

export function seedDatabase(db, people) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM people").get().count;
  if (count) return;
  db.exec("BEGIN");
  try {
    for (const person of people) {
      const saved = upsertPerson(db, person, person.id || randomUUID());
      for (const item of person.observations || []) {
        addObservation(db, saved.id, {
          date: item.date,
          context: item.context || item.source,
          fact: item.fact || item.text,
          interpretation: item.interpretation || "",
          evidenceType: item.evidenceType || "observed",
          confidence: item.confidence || 60
        });
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
