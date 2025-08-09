
export function mathEval(expr) {
  if (!/^[\d\.\+\-\*\/\(\)\s]+$/.test(expr)) {
    return "math: only arithmetic allowed";
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${expr})`);
    return String(fn());
  } catch (e) {
    return "math error: " + e.message;
  }
}
