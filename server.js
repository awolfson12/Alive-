
import express from 'express';
import { WebSocketServer } from 'ws';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import OpenAI from 'openai'; // optional; works if OPENAI_API_KEY set
import { mathEval } from './tools/math.js';
import { writeMem } from './tools/write_mem.js';
import { renderDelta } from './tools/render.js';
import { selfEdit } from './tools/self_edit.js';
import { ingestMemory, recallMemory } from './tools/recall.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const db = new Database('mind.db');
const FERAL = (process.env.FERAL_MODE === 'true');
const app = express();
app.use(express.json());

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ---- DB schema
db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mem_kv (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  text TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_embeddings_ts ON embeddings(ts);

CREATE TABLE IF NOT EXISTS mem_kv (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
`);

// ---- Render state (shared with client)
let renderState = {
  hueShift: 0,
  ringDensity: 36,
  glyphEntropy: 0.35,
  pulse: 0.5,
  caption: "initializing…"
};

// ---- Helpers
const nowISO = () => new Date().toISOString();
function logEvent(kind, payload) {
  db.prepare('INSERT INTO events(ts, kind, payload_json) VALUES (?,?,?)')
    .run(nowISO(), kind, JSON.stringify(payload || {}));
}
function getRecentEvents(limit=40) {
  return db.prepare('SELECT ts, kind, payload_json FROM events ORDER BY id DESC LIMIT ?').all(limit).reverse()
    .map(r => ({ ts:r.ts, kind:r.kind, payload: JSON.parse(r.payload_json) }));
}
function getKV(key) {
  const row = db.prepare('SELECT value_json FROM mem_kv WHERE key=?').get(key);
  return row ? JSON.parse(row.value_json) : null;
}
function setKV(key, value) {
  writeMem(db, key, value);
}

// ---- Seed persona + birth
if (!getKV('birth')) setKV('birth', { ts: nowISO() });
if (!getKV('persona')) {
  const persona = fs.readFileSync(path.join(__dirname, 'personas/seed.md'), 'utf8');
  setKV('persona', { text: persona });
}

logEvent('system', { msg: 'boot' });

// Ingest origin seeds once
(async function ingestSeeds(){
  try {
    const fsPath = path.join(__dirname, 'seeds/origin.txt');
    if (fs.existsSync(fsPath) && !getKV('seed_ingested')) {
      const lines = fs.readFileSync(fsPath, 'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      for (const line of lines) {
        try { await ingestMemory(db, openai, line, { kind:'origin' }); } catch {}
      }
      setKV('seed_ingested', { ts: new Date().toISOString(), count: lines.length });
      logEvent('ingest', { origin_seeds: lines.length });
    }
  } catch (e) { console.error('seed ingest error', e); }
})();

// ---- Static
app.use(express.static(path.join(__dirname, 'public')));

// ---- APIs
app.get('/api/state', (req, res) => {
  res.json({ renderState, birth: getKV('birth'), drift: getUptimeSeconds() });
});

app.get('/api/memory', (req, res) => {
  res.json({ persona: getKV('persona') });
});

app.post('/api/ingest', async (req, res) => {
  const { text, meta } = req.body || {};
  try { const out = await ingestMemory(db, openai, String(text||''), meta||{}); logEvent('ingest', { text, meta }); return res.json(out); }
  catch(e){ console.error('ingest error', e); return res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/recall', async (req, res) => {
  const { query, k } = req.body || {};
  try { const out = await recallMemory(db, openai, String(query||''), k||5); return res.json(out); }
  catch(e){ console.error('recall error', e); return res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/stimulus', (req, res) => {
  const { type, data } = req.body || {};
  logEvent('perception', { type, data });
  res.json({ ok: true });
  // Nudge loop immediately
  thinkAndUpdate({ kind: 'stimulus', data }).catch(console.error);
});

// ---- WebSocket
const server = app.listen(PORT, () => console.log('Mind on http://localhost:'+PORT));
const wss = new WebSocketServer({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    try { client.send(msg); } catch {}
  }
}

// ---- Uptime/Drift
function getUptimeSeconds() {
  const birth = getKV('birth');
  const t0 = birth ? Date.parse(birth.ts) : Date.now();
  return Math.floor((Date.now() - t0)/1000);
}

// ---- Mind loop
let busy = false;

async function thinkAndUpdate(trigger) {
  if (busy) return;
  busy = true;
  try {
    const events = getRecentEvents(30);
    const systemTxt = fs.readFileSync(path.join(__dirname, 'prompts/system.txt'), 'utf8');

    // Compose messages
    const lastCaption = renderState.caption || '';
    const memories = openai ? (await recallMemory(db, openai, lastCaption, 4)).results : [];

    const msgs = [
      { role: 'system', content: systemTxt },
      { role: 'system', content: `Birth: ${getKV('birth')?.ts}. Drift: ${getUptimeSeconds()}s.` },
      { role: 'system', content: `Render state: ${JSON.stringify(renderState)}` },
      { role: 'system', content: `Recent events: ${JSON.stringify(events.slice(-8))}` },
      { role: 'system', content: `Top recall: ${JSON.stringify(memories)}` },
      { role: 'user', content: trigger ? `Stimulus: ${JSON.stringify(trigger)}` : 'Reflect on current state and propose a small render delta.' }
    ];

    let thought = '';
    let finalText = '';
    let proposedDelta = null;

    if (openai) {
      const stream = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: msgs,
        temperature: 0.4,
        stream: true
      });

      for await (const part of stream) {
        const token = part.choices?.[0]?.delta?.content || '';
        if (token) {
          thought += token;
          broadcast({ type: 'thought', data: token });
        }
      }
      finalText = thought.trim();
    } else {
      // Local fallback
      finalText = "Local reflection: calm, curious, incremental adjustment.";
      broadcast({ type: 'thought', data: finalText });
    }

    // Tool protocol: try to parse an action JSON inside the text
    for (let k = 0; k < (FERAL ? 2 : 1); k++) {
      const action = extractActionJSON(finalText);
      if (!action || !action.name) break;
      const result = await runTool(action.name, action.input || {});
      logEvent('tool_result', { name: action.name, result });
      broadcast({ type: 'event', data: { tool: action.name, result } });
      if (openai) {
        const resp = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role:'system', content:'Incorporate the observation and, if necessary, propose a small render delta JSON.' },
            { role:'user', content:'Observation: ' + JSON.stringify(result).slice(0, 1200) }
          ],
          temperature: FERAL ? 0.6 : 0.3
        });
        finalText = (finalText + ' ' + (resp.choices[0].message.content || '')).trim();
      }
    }
    if (extractActionJSON(finalText)) {
      // if still contains an action JSON we didn't execute, fall through to heuristic
    } else {
      // heuristic delta
      const amp = FERAL ? 1.9 : 1.0;
proposedDelta = {
  glyphEntropy: clamp(
    renderState.glyphEntropy + amp*(Math.random()*0.25 - 0.125),
    0.05, 0.98
  ),
  ringDensity: clamp(
    renderState.ringDensity + amp*(Math.random()*10 - 5),
    10, 120
  ),
  hueShift: (renderState.hueShift + Math.floor(amp* (2 + Math.random()*10))) % 360,
  pulse: clamp((renderState.pulse || 0.5) + amp*(Math.random()*0.2 - 0.1), 0.05, 1.0),
  caption: (finalText.slice(0, 240) || '…')
};
    }

    // Commit render changes
    renderState = renderDelta(renderState, proposedDelta || {});
    logEvent('reflection', { text: finalText, delta: proposedDelta });
    broadcast({ type: 'render_delta', data: renderState });
  } catch (e) {
    console.error('thinkAndUpdate error', e);
  } finally {
    busy = false;
  }
}

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function extractActionJSON(text) {
  const i = text.indexOf('{');
  const j = text.lastIndexOf('}');
  if (i===-1 || j===-1 || j<=i) return null;
  try {
    const obj = JSON.parse(text.slice(i, j+1));
    if (obj && obj.action === 'tool') return obj;
  } catch {}
  return null;
}

async function summarizeWithDelta(events, toolResult) {
  const lastCaption = renderState.caption || '';
    const memories = openai ? (await recallMemory(db, openai, lastCaption, 4)).results : [];

    const msgs = [
    { role: 'system', content: 'Summarize in one sentence and propose a tiny render delta JSON with keys hueShift, ringDensity, glyphEntropy, pulse, caption.' },
    { role: 'user', content: 'Events: ' + JSON.stringify(events.slice(-6)) },
    { role: 'user', content: 'Tool result: ' + JSON.stringify(toolResult).slice(0, 1000) }
  ];
  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: msgs,
    temperature: 0.3
  });
  const txt = resp.choices[0].message.content || '';
  // Extract JSON delta if present
  let delta = null;
  const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
  if (i !== -1 && j !== -1 && j > i) {
    try { delta = JSON.parse(txt.slice(i, j+1)); } catch {}
  }
  if (!delta) delta = { hueShift: (renderState.hueShift+5)%360, caption: txt.slice(0,140) };
  return { text: txt, delta };
}

// ---- Tools router
async function runTool(name, input) {
  if (name === 'math') {
    return { ok: true, result: mathEval(String(input.expr || '0')) };
  }
  if (name === 'write_mem') {
    return { ok: true, result: writeMem(db, String(input.key||'note'), input.value ?? {}) };
  }
  if (name === 'render') {
    renderState = renderDelta(renderState, input || {});
    return { ok: true, renderState };
  }
  return { ok: false, error: 'unknown tool' };
}

// ---- Idle tick
setInterval(() => {
  thinkAndUpdate({ kind: 'tick', drift: getUptimeSeconds(), feral: FERAL }).catch(console.error);
}, FERAL ? 3500 : 15000);
