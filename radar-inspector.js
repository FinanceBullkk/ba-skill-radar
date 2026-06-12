'use strict';
/* Radar Canvas — inspector panel: edit data of the selected object */

const insp = document.getElementById('inspector');

function fmtV(v, max){ return max > 10 ? String(Math.round(v)) : Number(v).toFixed(1); }
function stepFor(max){ return max > 10 ? Math.max(1, Math.round(max / 20)) : 0.5; }

function palHTML(cur, key){
  return '<div class="pal">' + PAL.map(c =>
    '<button data-pal="' + c + '" data-key="' + (key || 'color') + '" style="background:' + c + '"' + (cur === c ? ' class="on"' : '') + ' title="' + c + '"></button>'
  ).join('') + '</div>';
}

function inspectorHTML(){
  const o = selected ? obj(selected) : null;
  if(!o){
    return '<div class="insp-h">Board</div>'
      + '<p class="insp-tip"><b>Click</b> any object to select it.<br>'
      + '<b>Drag</b> to move — radars move by their header.<br>'
      + '<b>Double-click</b> text to edit it.<br>'
      + '<b>Delete</b> key removes the selection.</p>'
      + '<p class="insp-tip">Select a radar to edit its axes and series here. Add as many radars to the board as you need — each keeps its own data.</p>';
  }
  if(o.type === 'radar') return radarHTML(o);
  if(o.type === 'text'){
    return '<div class="insp-h">Text</div>'
      + '<div class="field"><span class="insp-h">Size — ' + o.size + '</span>'
      + '<input type="range" id="tSize" min="12" max="72" step="1" value="' + o.size + '" style="accent-color:var(--ink)"></div>'
      + '<div class="optrow"><button id="tBold"' + (o.bold ? ' class="on"' : '') + '>Bold</button></div>'
      + '<div class="field"><span class="insp-h">Colour</span>' + palInk(o.color) + '</div>';
  }
  if(o.type === 'rect'){
    return '<div class="insp-h">Box</div>'
      + '<div class="optrow"><button id="rRound"' + (o.round ? ' class="on"' : '') + '>Rounded</button></div>'
      + '<div class="field"><span class="insp-h">Colour</span>' + palInk(o.color) + '</div>';
  }
  if(o.type === 'line'){
    return '<div class="insp-h">' + (o.arrow ? 'Arrow' : 'Line') + '</div>'
      + '<div class="optrow"><button id="lArrow"' + (o.arrow ? ' class="on"' : '') + '>Arrowhead</button></div>'
      + '<div class="field"><span class="insp-h">Colour</span>' + palInk(o.color) + '</div>';
  }
  if(o.type === 'image'){
    return '<div class="insp-h">Image</div>'
      + '<p class="insp-tip">Drag the side handle to resize. Height follows automatically.</p>';
  }
  return '';
}
function palInk(cur){
  const opts = [INK].concat(PAL);
  return '<div class="pal">' + opts.map(c =>
    '<button data-pal="' + c + '" style="background:' + c + '"' + (cur === c ? ' class="on"' : '') + ' title="' + c + '"></button>'
  ).join('') + '</div>';
}

function radarHTML(o){
  const d = o.data, act = Math.min(d.active || 0, d.series.length - 1);
  let h = '<div class="insp-h">Radar</div>';
  h += '<div class="field"><input type="text" id="rTitle" value="' + esc(d.title) + '" aria-label="Radar title"></div>';
  h += '<div class="field"><span class="insp-h">Scale</span><select id="rMax">'
    + [5, 10, 100].map(m => '<option value="' + m + '"' + (d.max === m ? ' selected' : '') + '>0 – ' + m + '</option>').join('')
    + '</select></div>';

  /* series management */
  h += '<div class="field"><div class="insp-h">Series<button id="sAdd">+ Add</button></div>';
  d.series.forEach((s, i) => {
    h += '<div class="srow">'
      + '<button class="swatch" data-si="' + i + '" style="background:' + s.color + '" title="Click to change colour"></button>'
      + '<input type="text" data-sn="' + i + '" value="' + esc(s.n) + '" aria-label="Series name">'
      + '<button class="tg' + (s.dash ? ' on' : '') + '" data-sd="' + i + '" title="Dashed line">– –</button>'
      + '<button class="tg" data-sc="' + i + '" title="Duplicate as snapshot">⧉</button>'
      + '<button class="xbtn" data-sx="' + i + '"' + (d.series.length <= 1 ? ' disabled' : '') + ' title="Remove series">✕</button>'
      + '</div>';
  });
  h += '</div>';

  /* axes + values of the active series */
  h += '<div class="field"><div class="insp-h">Values<button id="aAdd">+ Axis</button></div>';
  h += '<div class="chips">' + d.series.map((s, i) =>
    '<button class="chip' + (i === act ? ' on' : '') + '" data-act="' + i + '"><span class="dot" style="background:' + s.color + '"></span><span class="nm">' + esc(s.n) + '</span></button>'
  ).join('') + '</div>';
  const s = d.series[act], st = stepFor(d.max);
  d.axes.forEach((a, i) => {
    h += '<div class="arow">'
      + '<input type="text" data-an="' + i + '" value="' + esc(a) + '" aria-label="Axis name">'
      + '<input type="range" data-ai="' + i + '" min="0" max="' + d.max + '" step="' + st + '" value="' + s.vals[i] + '" aria-label="' + esc(a) + '">'
      + '<span class="av" data-av="' + i + '">' + fmtV(s.vals[i], d.max) + '</span>'
      + '<button class="xbtn" data-ax="' + i + '"' + (d.axes.length <= 3 ? ' disabled' : '') + ' title="Remove axis">✕</button>'
      + '</div>';
  });
  h += '</div>';

  h += '<div class="optrow"><button id="rDup">⧉ Duplicate radar</button></div>';
  return h;
}

function updateInspector(){ insp.innerHTML = inspectorHTML(); }

/* ---------- Events ---------- */
function selObj(){ return selected ? obj(selected) : null; }

insp.addEventListener('input', e => {
  const o = selObj(); if(!o) return;
  const t = e.target;
  if(o.type === 'radar'){
    const d = o.data, act = Math.min(d.active || 0, d.series.length - 1);
    if(t.id === 'rTitle'){ d.title = t.value; syncChart(o); persist(); return; }
    if(t.dataset.sn != null){ d.series[+t.dataset.sn].n = t.value; syncChart(o); persist(); return; }
    if(t.dataset.an != null){ d.axes[+t.dataset.an] = t.value; syncChart(o); persist(); return; }
    if(t.dataset.ai != null){
      const i = +t.dataset.ai, v = parseFloat(t.value);
      d.series[act].vals[i] = v;
      const av = insp.querySelector('[data-av="' + i + '"]'); if(av) av.textContent = fmtV(v, d.max);
      syncChart(o); persist(); return;
    }
  }
  if(o.type === 'text' && t.id === 'tSize'){
    o.size = +t.value;
    const el = board.querySelector('.obj[data-id="' + o.id + '"] .obj-text');
    if(el) el.style.fontSize = (o.size * SCALE()) + 'px';
    const lbl = t.parentElement.querySelector('.insp-h'); if(lbl) lbl.textContent = 'Size — ' + o.size;
    persist(); return;
  }
});

insp.addEventListener('change', e => {
  const o = selObj(); if(!o) return;
  if(o.type === 'radar' && e.target.id === 'rMax'){
    const d = o.data, oldMax = d.max, m = +e.target.value;
    d.max = m;
    d.series.forEach(s => { s.vals = s.vals.map(v => Math.round((v / oldMax) * m * 2) / 2); });
    syncChart(o); updateInspector(); persist();
  }
});

insp.addEventListener('click', e => {
  const o = selObj(); if(!o) return;
  const t = e.target.closest('button'); if(!t) return;

  /* shared palette swatches (text / rect / line) */
  if(t.dataset.pal && o.type !== 'radar'){
    o.color = t.dataset.pal;
    renderBoard(); persist(); return;
  }

  if(o.type === 'text' && t.id === 'tBold'){ o.bold = !o.bold; renderBoard(); persist(); return; }
  if(o.type === 'rect' && t.id === 'rRound'){ o.round = !o.round; renderBoard(); persist(); return; }
  if(o.type === 'line' && t.id === 'lArrow'){ o.arrow = !o.arrow; renderBoard(); persist(); return; }

  if(o.type !== 'radar') return;
  const d = o.data;

  if(t.id === 'sAdd'){
    if(d.series.length >= 6){ toast('Up to 6 series per radar'); return; }
    d.series.push({ n: 'Series ' + String.fromCharCode(65 + d.series.length), color: nextColor(), dash: false, vals: d.axes.map(() => d.max * 0.5) });
    d.active = d.series.length - 1;
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.dataset.si != null){ /* cycle colour */
    const s = d.series[+t.dataset.si];
    s.color = PAL[(PAL.indexOf(s.color) + 1) % PAL.length];
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.dataset.sd != null){
    const s = d.series[+t.dataset.sd]; s.dash = !s.dash;
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.dataset.sc != null){ /* duplicate series = snapshot */
    if(d.series.length >= 6){ toast('Up to 6 series per radar'); return; }
    const s = d.series[+t.dataset.sc];
    d.series.push({ n: s.n + ' copy', color: nextColor(), dash: true, vals: s.vals.slice() });
    d.active = d.series.length - 1;
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.dataset.sx != null){
    if(d.series.length <= 1) return;
    d.series.splice(+t.dataset.sx, 1);
    d.active = 0;
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.dataset.act != null){ d.active = +t.dataset.act; updateInspector(); return; }

  if(t.id === 'aAdd'){
    if(d.axes.length >= 12){ toast('Up to 12 axes'); return; }
    d.axes.push('New axis');
    d.series.forEach(s => s.vals.push(d.max * 0.5));
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.dataset.ax != null){
    if(d.axes.length <= 3){ toast('Keep at least 3 axes'); return; }
    const i = +t.dataset.ax;
    d.axes.splice(i, 1);
    d.series.forEach(s => s.vals.splice(i, 1));
    syncChart(o); updateInspector(); persist(); return;
  }
  if(t.id === 'rDup'){
    const copy = clone(o);
    copy.id = uid(); copy.z = ++state.nextZ;
    copy.x = clamp(o.x + 0.04, 0, 1 - o.w); copy.y = clamp(o.y + 0.05, 0, 0.9);
    copy.data.title = o.data.title + ' copy';
    state.objects.push(copy);
    renderBoard(); select(copy.id); persist(); return;
  }
});

/* boot */
initApp();
