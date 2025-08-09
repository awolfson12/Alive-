
import { getEmbedding, cosine } from './embed.js';

export async function ingestMemory(db, openai, text, meta={}) {
  const emb = await getEmbedding(text, openai);
  db.prepare('INSERT INTO embeddings(ts, text, vector_json, meta_json) VALUES (?,?,?,?)')
    .run(new Date().toISOString(), text, JSON.stringify(emb), JSON.stringify(meta));
  return { ok:true };
}

export async function recallMemory(db, openai, query, k=5) {
  const qv = await getEmbedding(query, openai);
  const rows = db.prepare('SELECT id, ts, text, vector_json, meta_json FROM embeddings ORDER BY id DESC LIMIT 1000').all();
  const scored = rows.map(r => {
    const v = JSON.parse(r.vector_json);
    return { id:r.id, ts:r.ts, text:r.text, meta: JSON.parse(r.meta_json||'{}'), score: cosine(qv, v) };
  }).sort((a,b)=>b.score-a.score).slice(0, k);
  return { ok:true, results: scored };
}
