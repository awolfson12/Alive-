
import fs from 'fs'; import path from 'path';
export function selfEdit(kind, text, __dirname) {
  const safe = (txt) => String(txt || '').slice(0, 4000);
  if (kind === 'persona') {
    const p = path.join(__dirname, 'personas/seed.md');
    const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    fs.writeFileSync(p, safe(text), 'utf8');
    return { ok:true, file:'personas/seed.md', prev: prev.slice(-400), next: text.slice(0,400) };
  }
  if (kind === 'system') {
    const p = path.join(__dirname, 'prompts/system.txt');
    const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    fs.writeFileSync(p, safe(text), 'utf8');
    return { ok:true, file:'prompts/system.txt', prev: prev.slice(-400), next: text.slice(0,400) };
  }
  return { ok:false, error:'unsupported edit kind' };
}
