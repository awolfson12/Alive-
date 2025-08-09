
export function writeMem(db, key, value) {
  const stmt = db.prepare('INSERT INTO mem_kv(key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json');
  stmt.run(key, JSON.stringify(value));
  return "ok";
}
