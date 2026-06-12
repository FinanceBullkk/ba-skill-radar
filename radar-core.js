'use strict';
/* Radar Canvas — core: state, board, objects, charts, pointer interactions, io */

const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uid = () => 'o' + Math.random().toString(36).slice(2, 8);
function hexA(hex, a){ const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

/* series palette — same lightness/chroma, varied hue (+ neutral) */
const PAL = ['#B4543A', '#3E8A5E', '#34809C', '#5B73C4', '#A05B9B', '#8C7A33', '#8A8782'];
const INK = '#1C1B18';

/* ---------- Defaults ---------- */
function defaultRadarData(){
  return {
    title: 'Skill radar',
    max: 5,
    axes: ['Elicitation', 'Documentation', 'Process analysis', 'UAT & testing', 'Facilitation', 'Collaboration'],
    series: [
      { n: 'Current', color: PAL[6], dash: true,  vals: [2.5, 2, 2, 1.5, 2, 2.5] },
      { n: 'Target',  color: PAL[0], dash: false, vals: [4, 4, 3.5, 4, 4, 4] }
    ],
    active: 0
  };
}
function defaultState(){
  return {
    nextZ: 10,
    objects: [
      { id: 'title', type: 'text', x: 0.045, y: 0.06, w: 0.5, size: 34, bold: true, color: INK, text: 'Radar Canvas', z: 1 },
      Object.assign({ id: 'r1', type: 'radar', x: 0.30, y: 0.18, w: 0.40, h: 0.70, z: 2 }, { data: defaultRadarData() })
    ]
  };
}

/* ---------- State + persistence ---------- */
const KEY = 'radar-canvas-v1';
let state = defaultState();
try{
  const saved = localStorage.getItem(KEY);
  if(saved){
    const s = JSON.parse(saved);
    if(s && Array.isArray(s.objects)) state = Object.assign(defaultState(), s);
  }else{
    /* migrate from previous BA canvas tool if present */
    const old = localStorage.getItem('ba-canvas-v1');
    if(old){
      const o = JSON.parse(old);
      if(o && Array.isArray(o.skills) && o.skills.length){
        const d = defaultRadarData();
        d.axes = o.skills.map(k => k.n);
        d.series[0].vals = o.skills.map(k => k.cur);
        d.series[1].vals = o.skills.map(k => k.tg);
        state.objects.find(x => x.type === 'radar').data = d;
      }
    }
  }
}catch(e){}
function persist(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
function obj(id){ return state.objects.find(o => o.id === id); }

/* ---------- Board sizing (16:9, coords are fractions) ---------- */
const board = $('#board'), boardwrap = $('#boardwrap');
let BW = 1280, BH = 720;
function sizeBoard(){
  const avail = boardwrap.clientWidth - 52;
  BW = clamp(Math.round(avail), 360, 1560);
  BH = Math.round(BW * 9 / 16);
  board.style.width = BW + 'px';
  board.style.height = BH + 'px';
  renderBoard();
}
const SCALE = () => BW / 1600;

/* ---------- Charts (one per radar object) ---------- */
const charts = {};
function wrapLabel(s){
  if(s.length <= 16) return s;
  const words = s.split(' '), lines = []; let cur = '';
  words.forEach(w => { if((cur + ' ' + w).trim().length > 16){ if(cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if(cur) lines.push(cur);
  return lines;
}
function chartCfg(d){
  return {
    type: 'radar',
    data: {
      labels: d.axes.map(wrapLabel),
      datasets: d.series.map(s => ({
        label: s.n, data: s.vals,
        borderColor: s.color, backgroundColor: hexA(s.color, 0.10),
        borderDash: s.dash ? [6, 4] : [], pointRadius: 2.5, borderWidth: 2,
        pointBackgroundColor: s.color
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: true, labels: { boxWidth: 11, boxHeight: 11, font: { size: 11, family: '"Helvetica Neue", Helvetica, Arial, sans-serif' }, color: '#73706A' } } },
      scales: { r: {
        min: 0, max: d.max, ticks: { stepSize: d.max / 5, display: false },
        pointLabels: { font: { size: Math.max(9, Math.round(11.5 * SCALE())), family: '"Helvetica Neue", Helvetica, Arial, sans-serif' }, color: INK },
        grid: { color: 'rgba(28,27,24,0.13)' }, angleLines: { color: 'rgba(28,27,24,0.13)' }
      } }
    }
  };
}
function buildChart(o){
  const cv = board.querySelector('.obj[data-id="' + o.id + '"] canvas');
  if(!cv) return;
  if(charts[o.id]){ charts[o.id].destroy(); delete charts[o.id]; }
  charts[o.id] = new Chart(cv, chartCfg(o.data));
}
function syncChart(o){
  const c = charts[o.id]; if(!c) return;
  const cfg = chartCfg(o.data);
  c.data.labels = cfg.data.labels;
  c.data.datasets = cfg.data.datasets;
  c.options.scales.r.max = o.data.max;
  c.options.scales.r.ticks.stepSize = o.data.max / 5;
  c.update('none');
  const head = board.querySelector('.obj[data-id="' + o.id + '"] .w-title');
  if(head) head.textContent = o.data.title;
}

/* ---------- Render ---------- */
let selected = null, editing = null;
function px(o){ return { l: o.x * BW, t: o.y * BH, w: o.w * BW, h: (o.h != null ? o.h * BH : null) }; }
function renderBoard(){
  Object.keys(charts).forEach(id => { charts[id].destroy(); delete charts[id]; });
  board.querySelectorAll('.obj, #empty').forEach(n => n.remove());
  state.objects.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(o => board.appendChild(makeEl(o)));
  state.objects.filter(o => o.type === 'radar').forEach(buildChart);
  if(!state.objects.length){
    const e = document.createElement('div'); e.id = 'empty';
    e.innerHTML = 'Empty board.<br>Add a <b>◎ Radar</b> from the toolbar to get started.';
    board.appendChild(e);
  }
  decorate();
}
function makeEl(o){
  const el = document.createElement('div');
  el.className = 'obj ' + o.type; el.dataset.id = o.id; el.style.zIndex = o.z || 1;
  if(o.type === 'line'){ layoutLine(el, o); }
  else{
    const b = px(o);
    el.style.left = b.l + 'px'; el.style.top = b.t + 'px'; el.style.width = b.w + 'px';
    if(b.h != null) el.style.height = b.h + 'px';
  }
  if(o.type === 'text'){
    el.innerHTML = '<div class="obj-text" style="font-size:' + (o.size * SCALE()) + 'px;font-weight:' + (o.bold ? 600 : 400) + ';color:' + (o.color || INK) + '">' + esc(o.text || '') + '</div>';
  }else if(o.type === 'rect'){
    el.innerHTML = '<div class="obj-rect" style="border:2px solid ' + (o.color || INK) + ';background:' + hexA(o.color || INK, 0.05) + ';border-radius:' + (o.round ? 10 : 2) + 'px"></div>';
  }else if(o.type === 'image'){
    el.innerHTML = '<img class="obj-img" src="' + o.src + '" alt="">';
  }else if(o.type === 'line'){
    drawLine(el, o);
  }else if(o.type === 'radar'){
    el.classList.add('widget');
    el.innerHTML = '<div class="w-head"><span class="w-grip">⠿</span><span class="w-title">' + esc(o.data.title) + '</span></div>'
      + '<div class="radar-body"><canvas></canvas></div>';
  }
  return el;
}

/* ---------- Lines / arrows ---------- */
function lineBox(o){
  const pad = 10;
  return { l: Math.min(o.x1, o.x2) * BW - pad, t: Math.min(o.y1, o.y2) * BH - pad,
           w: Math.abs(o.x2 - o.x1) * BW + 2 * pad, h: Math.abs(o.y2 - o.y1) * BH + 2 * pad, pad };
}
function layoutLine(el, o){
  const b = lineBox(o);
  el.style.left = b.l + 'px'; el.style.top = b.t + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
}
function drawLine(el, o){
  const b = lineBox(o);
  const x1 = o.x1 * BW - b.l, y1 = o.y1 * BH - b.t, x2 = o.x2 * BW - b.l, y2 = o.y2 * BH - b.t;
  const col = o.color || INK, mid = 'm' + o.id;
  el.innerHTML =
    '<svg class="obj-line" width="' + b.w + '" height="' + b.h + '">'
    + (o.arrow ? '<defs><marker id="' + mid + '" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="' + col + '"></path></marker></defs>' : '')
    + '<line class="hit" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"></line>'
    + '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="2.5" stroke-linecap="round"' + (o.arrow ? ' marker-end="url(#' + mid + ')"' : '') + '></line>'
    + '</svg>';
}

/* ---------- Selection + handles ---------- */
function decorate(){
  board.querySelectorAll('.obj').forEach(n => { n.classList.remove('sel'); n.querySelectorAll('.h,.obj-del').forEach(h => h.remove()); });
  if(selected){
    const o = obj(selected), el = board.querySelector('.obj[data-id="' + selected + '"]');
    if(o && el){
      el.classList.add('sel');
      const d = document.createElement('button'); d.className = 'obj-del'; d.textContent = '✕'; d.title = 'Delete'; el.appendChild(d);
      if(o.type === 'line'){
        const b = lineBox(o);
        addHandle(el, 'h-end', o.x1 * BW - b.l - 5, o.y1 * BH - b.t - 5, 'p1');
        addHandle(el, 'h-end', o.x2 * BW - b.l - 5, o.y2 * BH - b.t - 5, 'p2');
      }else if(o.type === 'rect' || o.type === 'radar'){
        const h = document.createElement('div'); h.className = 'h h-br'; h.dataset.dir = 'br'; el.appendChild(h);
      }else{
        const h = document.createElement('div'); h.className = 'h h-r'; h.dataset.dir = 'r'; el.appendChild(h);
      }
    }
  }
  if(typeof updateInspector === 'function') updateInspector();
}
function addHandle(el, cls, x, y, dir){
  const h = document.createElement('div'); h.className = 'h ' + cls;
  h.style.left = x + 'px'; h.style.top = y + 'px'; h.dataset.dir = dir; el.appendChild(h);
}
function select(id){
  selected = id;
  if(id){
    const o = obj(id);
    if(o){ o.z = ++state.nextZ; const el = board.querySelector('.obj[data-id="' + id + '"]'); if(el) el.style.zIndex = o.z; }
  }
  decorate();
}

/* ---------- Pointer: move + resize ---------- */
let drag = null;
board.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.h');
  const del = e.target.closest('.obj-del');
  const el = e.target.closest('.obj');
  if(del){ e.preventDefault(); deleteObj(el.dataset.id); return; }
  if(!el){ if(editing) commitEdit(); select(null); return; }
  const id = el.dataset.id, o = obj(id);
  if(e.target.matches('input,button') || (editing === id && e.target.closest('.obj-text'))){ select(id); return; }
  if(handle){ select(id); startResize(e, o, handle.dataset.dir); return; }
  if(o.type === 'radar' && !e.target.closest('.w-head')){ select(id); return; } /* chart body = select only */
  select(id);
  startMove(e, o);
});
function startMove(e, o){
  e.preventDefault();
  if(o.type === 'line') drag = { mode: 'lmove', o, sx: e.clientX, sy: e.clientY, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 };
  else drag = { mode: 'move', o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', endDrag);
}
function startResize(e, o, dir){
  e.preventDefault();
  if(dir === 'p1' || dir === 'p2') drag = { mode: 'lpt', o, dir };
  else drag = { mode: 'resize', o, dir, sx: e.clientX, sy: e.clientY, ow: o.w, oh: o.h };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', endDrag);
}
function onMove(e){
  if(!drag) return;
  const o = drag.o, el = board.querySelector('.obj[data-id="' + o.id + '"]'); if(!el) return;
  const dfx = (e.clientX - drag.sx) / BW, dfy = (e.clientY - drag.sy) / BH;
  if(drag.mode === 'move'){
    o.x = clamp(drag.ox + dfx, 0, 1 - (o.w || 0.05)); o.y = clamp(drag.oy + dfy, 0, 0.99);
    el.style.left = o.x * BW + 'px'; el.style.top = o.y * BH + 'px';
  }else if(drag.mode === 'resize'){
    o.w = clamp(drag.ow + dfx, 0.06, 1); el.style.width = o.w * BW + 'px';
    if(drag.dir === 'br' && o.h != null){
      o.h = clamp(drag.oh + dfy, 0.06, 1); el.style.height = o.h * BH + 'px';
      if(o.type === 'radar' && charts[o.id]) charts[o.id].resize();
    }
  }else if(drag.mode === 'lmove'){
    o.x1 = drag.x1 + dfx; o.y1 = drag.y1 + dfy; o.x2 = drag.x2 + dfx; o.y2 = drag.y2 + dfy;
    layoutLine(el, o); drawLine(el, o); decorate();
  }else if(drag.mode === 'lpt'){
    const r = board.getBoundingClientRect();
    const fx = clamp((e.clientX - r.left) / BW, 0, 1), fy = clamp((e.clientY - r.top) / BH, 0, 1);
    if(drag.dir === 'p1'){ o.x1 = fx; o.y1 = fy; } else { o.x2 = fx; o.y2 = fy; }
    layoutLine(el, o); drawLine(el, o); decorate();
  }
}
function endDrag(){
  if(drag){ drag = null; persist(); }
  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', endDrag);
}

/* ---------- Text editing ---------- */
board.addEventListener('dblclick', e => {
  const t = e.target.closest('.obj-text'); if(!t) return;
  const el = t.closest('.obj'); editing = el.dataset.id;
  t.classList.add('editing'); t.contentEditable = 'true'; t.focus();
  const r = document.createRange(); r.selectNodeContents(t);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
});
function commitEdit(){
  if(!editing) return;
  const el = board.querySelector('.obj[data-id="' + editing + '"]');
  const t = el && el.querySelector('.obj-text');
  if(t){ const o = obj(editing); if(o) o.text = t.innerText.trim(); t.classList.remove('editing'); t.contentEditable = 'false'; }
  editing = null; persist();
}
board.addEventListener('focusout', e => { if(e.target.classList && e.target.classList.contains('obj-text')) commitEdit(); });

/* ---------- Add objects ---------- */
function nextColor(){
  const used = state.objects.filter(o => o.type === 'radar')
    .flatMap(o => o.data.series.map(s => s.color));
  return PAL.find(c => !used.includes(c)) || PAL[used.length % PAL.length];
}
function addObj(o){ o.id = uid(); o.z = ++state.nextZ; state.objects.push(o); renderBoard(); select(o.id); persist(); }
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if(!b) return;
  const t = b.dataset.add;
  if(t === 'radar'){
    const d = defaultRadarData();
    d.title = 'New radar';
    d.series = [{ n: 'Series A', color: nextColor(), dash: false, vals: d.axes.map(() => Math.round(d.max * 0.6 * 2) / 2) }];
    addObj({ type: 'radar', x: 0.30, y: 0.18, w: 0.36, h: 0.62, data: d });
  }
  else if(t === 'text') addObj({ type: 'text', x: 0.30, y: 0.42, w: 0.24, size: 22, bold: false, color: INK, text: 'Text' });
  else if(t === 'rect') addObj({ type: 'rect', x: 0.30, y: 0.40, w: 0.22, h: 0.16, color: INK, round: true });
  else if(t === 'line') addObj({ type: 'line', x1: 0.30, y1: 0.50, x2: 0.46, y2: 0.50, arrow: false, color: INK });
  else if(t === 'arrow') addObj({ type: 'line', x1: 0.30, y1: 0.55, x2: 0.46, y2: 0.55, arrow: true, color: INK });
  else if(t === 'image') $('#imgFile').click();
});
$('#imgFile').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => { addObj({ type: 'image', x: 0.30, y: 0.30, w: 0.22, src: r.result }); };
  r.readAsDataURL(f); e.target.value = '';
});

/* ---------- Delete ---------- */
function deleteObj(id){
  const o = obj(id); if(!o) return;
  if(o.type === 'radar' && !confirm('Delete this radar and its data?')) return;
  state.objects = state.objects.filter(x => x.id !== id);
  if(selected === id) selected = null;
  renderBoard(); persist();
}
document.addEventListener('keydown', e => {
  if((e.key === 'Delete' || e.key === 'Backspace') && selected && !editing){
    const a = document.activeElement;
    if(a && a.matches('input,select,[contenteditable="true"]')) return;
    e.preventDefault(); deleteObj(selected);
  }
});

/* ---------- Export / Import / Reset / PNG ---------- */
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1700); }
$('#exp').addEventListener('click', () => {
  const a = document.createElement('a'); a.download = 'radar-canvas.json';
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  a.click(); toast('Exported');
});
$('#imp').addEventListener('click', () => $('#impFile').click());
$('#impFile').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const s = JSON.parse(r.result);
      if(!s || !Array.isArray(s.objects)) throw 0;
      state = Object.assign(defaultState(), s);
      selected = null; sizeBoard(); persist(); toast('Imported');
    }catch(err){ toast('Invalid file'); }
    e.target.value = '';
  };
  r.readAsText(f);
});
$('#reset').addEventListener('click', () => {
  if(!confirm('Reset the whole canvas to defaults?')) return;
  state = defaultState(); selected = null; sizeBoard(); persist(); toast('Reset');
});
$('#png').addEventListener('click', () => {
  if(typeof html2canvas !== 'function'){ toast('Image library not loaded'); return; }
  const wasSel = selected; selected = null; decorate();
  document.body.classList.add('capturing');
  html2canvas(board, { backgroundColor: '#FFFFFF', scale: 2, useCORS: true })
    .then(c => { const a = document.createElement('a'); a.download = 'radar-canvas.png'; a.href = c.toDataURL('image/png'); a.click(); toast('PNG downloaded'); })
    .catch(() => toast('Could not render image'))
    .finally(() => { document.body.classList.remove('capturing'); selected = wasSel; decorate(); });
});

/* ---------- Init (called from radar-inspector.js once both files load) ---------- */
function initApp(){
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(sizeBoard, 120); });
  sizeBoard();
}
