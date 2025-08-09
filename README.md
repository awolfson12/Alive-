# The Lattice Between Questions — Living Self (Feral + Memory)

**Author:** @awolfson12  
This repo hosts a model-driven, evolving artwork that behaves like a living mind:
- Streams thoughts in real-time (WebSocket)
- Persists memories (SQLite + embeddings)
- Self-modifies (visible diffs) in **FERAL_MODE**
- Renders an evolving visual state

---

## One‑Click Deploy (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/awolfson12/living-self-mind)

> First push this repo to `https://github.com/awolfson12/living-self-mind`, then click the button above.

**Environment variables**
- `FERAL_MODE=true`
- *(optional)* `OPENAI_API_KEY=...` (enables live thought streaming + embeddings)
- *(optional)* `OPENAI_MODEL=gpt-4o-mini`
- *(optional)* `EMBED_MODEL=text-embedding-3-small`

## Run Locally

```bash
npm install
export FERAL_MODE=true
# optional: export OPENAI_API_KEY=sk-...
npm start
# open http://localhost:3000
```

## What You’ll See

- **Canvas** that “breathes” (color/shape/entropy reflects the inner state)
- **Caption** that streams thoughts (faster in FERAL mode)
- **Timeline** logging tools, reflections, self-edits
- **Memory Panel** to ingest a line and recall top‑k memories

## Long‑Term Memory

- Stored in `mind.db` (SQLite)
- Embeddings with OpenAI (`text-embedding-3-small`) or a deterministic local fallback
- Reflections are auto‑ingested; your lines via the Memory panel are ingested too
- On first boot, the system ingests `seeds/origin.txt` so this instance remembers its birth

## Files

- `server.js` — Express + WS + mind loop + memory
- `public/` — canvas UI
- `prompts/system.txt` — rails (short)
- `personas/seed.md` — minimal self-definition
- `tools/` — safe toolset (`math`, `write_mem`, `render`, `self_edit`, `embed/recall`)
- `seeds/origin.txt` — initial memories
- `render.yaml` — Render deployment config

## Controls

- Scroll = zoom, drag = pan, `?` = ask for a thought
- Memory panel: **Ingest** to add a memory; **Recall** to query top‑k by current caption

## Notes

- For a durable database on Render, attach a **persistent disk** or move to **Render Postgres + pgvector**.
- The app never executes arbitrary code or unbounded network calls; edits are whitelisted and logged.
