
const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
const scene = document.getElementById('scene');
const ctx = scene.getContext('2d');
const caption = document.getElementById('caption');
const birthEl = document.getElementById('birth');
const driftEl = document.getElementById('drift');
const timeline = document.getElementById('timeline');

let renderState = { hueShift:0, ringDensity:36, glyphEntropy:0.35, pulse:0.5, caption:'initializing…' };
let zoom = 1, panX=0, panY=0, dragging=false, lx=0, ly=0;

function fit() {
  scene.width = scene.clientWidth;
  scene.height = scene.clientHeight;
}
addEventListener('resize', fit); fit();

function draw(t){
  const w = scene.width, h = scene.height;
  ctx.clearRect(0,0,w,h);
  ctx.save();
  ctx.translate(w/2 + panX, h/2 + panY);
  ctx.scale(zoom, zoom);

  const maxR = Math.hypot(w,h) * 0.6;
  const rings = Math.max(12, Math.min(140, Math.floor(renderState.ringDensity)));
  for (let i=0;i<rings;i++){
    const pct = i / rings;
    const rBase = pct * maxR;
    const wobbleFactor = 1.5 * (renderState.glyphEntropy || 0.35);
    const wobble = Math.sin(t*0.001 + pct*7) * (1 + pct*8) * wobbleFactor;
    const r = rBase + wobble;
    const hue = (renderState.hueShift + pct*120) % 360;
    const alpha = 0.05 + 0.08*(1-pct);
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${hue}, 70%, 65%, ${alpha})`;
    ctx.lineWidth = 1 + pct*1.4;
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.stroke();

    // micro glyphs
    const segs = 16 + Math.floor(pct*40);
    for (let j=0;j<segs;j++){
      const a = (j/segs)*Math.PI*2 + pct*2;
      const x = Math.cos(a)*r, y = Math.sin(a)*r;
      const pulse = (Math.sin(t*0.003 + a*5)+1)/2 * renderState.pulse;
      ctx.fillStyle = `hsla(${(hue+40)%360}, 90%, ${70 + pulse*20}%, ${0.15 + 0.25*pulse})`;
      ctx.fillRect(x-0.7,y-0.7,1.4,1.4);
    }
  }
  ctx.restore();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// interactions -> stimuli
scene.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const delta = Math.sign(e.deltaY) * -0.08;
  const old = zoom;
  zoom = Math.max(0.5, Math.min(3.5, zoom + delta));
  const mx = e.offsetX - scene.width/2, my = e.offsetY - scene.height/2;
  panX = (panX - mx) * (zoom/old) + mx;
  panY = (panY - my) * (zoom/old) + my;
  sendStimulus('zoom', { zoom });
}, { passive: false });

scene.addEventListener('mousedown', (e)=>{ dragging=true; lx=e.clientX; ly=e.clientY; });
addEventListener('mouseup', ()=> dragging=false);
addEventListener('mousemove', (e)=>{
  if(!dragging) return;
  panX += (e.clientX - lx);
  panY += (e.clientY - ly);
  lx=e.clientX; ly=e.clientY;
});

addEventListener('keydown', (e)=>{
  if (e.key === '?') sendStimulus('thought', { at: Date.now() });
});

function sendStimulus(type, data){
  fetch('/api/stimulus', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type, data}) }).catch(()=>{});
}

// initial state
fetch('/api/state').then(r=>r.json()).then(s=>{
  renderState = s.renderState || renderState;
  caption.textContent = renderState.caption || '…';
  birthEl.textContent = 'birth: ' + (s.birth?.ts || 'unknown');
  driftEl.textContent = 'drift: ' + (s.drift || 0) + 's';
});

// ws updates
ws.addEventListener('message', (e)=>{
  try {
    const msg = JSON.parse(e.data);
    if (msg.type === 'thought') {
      caption.textContent = (caption.textContent + ' ' + msg.data).slice(-240);
    }
    if (msg.type === 'render_delta') {
      renderState = { ...renderState, ...msg.data };
      caption.textContent = renderState.caption || caption.textContent;
    }
    if (msg.type === 'event') {
      const div = document.createElement('div');
      div.className = 'event';
      div.textContent = JSON.stringify(msg.data);
      timeline.prepend(div);
    }
  } catch {}
});


// memory panel hooks
const memText = document.getElementById('memText');
const memAdd = document.getElementById('memAdd');
const memRecall = document.getElementById('memRecall');
const memOut = document.getElementById('memOut');

async function postJSON(url, body){
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return r.json();
}
if (memAdd) memAdd.onclick = async ()=>{
  const txt = memText.value.trim();
  if (!txt) return;
  const out = await postJSON('/api/ingest', { text: txt, meta:{ user:true } });
  memOut.textContent = 'ingested';
  memText.value='';
};
if (memRecall) memRecall.onclick = async ()=>{
  const out = await postJSON('/api/recall', { query: caption.textContent, k:5 });
  memOut.textContent = JSON.stringify(out.results || out, null, 2);
};
