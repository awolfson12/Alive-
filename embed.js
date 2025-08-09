
import OpenAI from 'openai';

// Compute embedding via OpenAI; fallback to simple hashing if no API key.
export async function getEmbedding(text, openai) {
  const input = String(text || '').slice(0, 4000);
  if (openai) {
    const resp = await openai.embeddings.create({ model: process.env.EMBED_MODEL || 'text-embedding-3-small', input });
    return resp.data[0].embedding;
  }
  // Fallback: deterministic pseudo-embedding
  const vec = new Array(256).fill(0);
  for (let i=0;i<input.length;i++) vec[i % 256] += (input.charCodeAt(i)%13)/13;
  const n = Math.hypot(...vec); return vec.map(v=>v/(n||1));
}

export function cosine(a,b){
  let s=0, na=0, nb=0;
  const L = Math.min(a.length, b.length);
  for(let i=0;i<L;i++){ s+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return s / (Math.sqrt(na||1)*Math.sqrt(nb||1));
}
