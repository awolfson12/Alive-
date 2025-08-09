
export function renderDelta(current, proposal) {
  const safe = {};
  if (typeof proposal !== 'object' || !proposal) return current;
  const allow = ["hueShift","ringDensity","glyphEntropy","pulse","caption"];
  for (const k of allow) if (k in proposal) safe[k] = proposal[k];
  return { ...current, ...safe };
}
