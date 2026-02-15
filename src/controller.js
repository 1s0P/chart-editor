import { INTERNAL_DIV } from './constants.js';
import { ChartModel } from './model.js';
import { CanvasRenderer } from './renderer.js';
import { getCanvasCoords, intersects, snapUnits } from './utils.js';
import { exportMidi, importMidiToModel } from './midi.js';

const model = new ChartModel();
const canvas = document.getElementById('editor');
const renderer = new CanvasRenderer(canvas);

let mode = 'tap';
let pendingLong = null;

let selStart = null;
let selRect = null;
let isDragging = false;

let isTickPainting = false;
let isErasing = false;

const copyBtn = document.getElementById('copyBtn');
const pasteBtn = document.getElementById('pasteBtn');
const mirrorPasteBtn = document.getElementById('mirrorPasteBtn');
const deleteBtn = document.getElementById('deleteBtn');
const flipBtn = document.getElementById('flipBtn');
const lanemode = document.getElementById('laneMode');

function updateActionButtons(){
  const hasSel = model.hasSelection();
  const hasClip = model.hasClipboard();
  const canPaste = hasClip && model.pasteTarget != null;

  copyBtn.disabled = !hasSel;
  deleteBtn.disabled = !hasSel;
  flipBtn.disabled = !hasSel;
  pasteBtn.disabled = !canPaste;
  mirrorPasteBtn.disabled = !canPaste;
}

function redraw(){
  renderer.draw(model, selRect);
  updateActionButtons();
}

function canvasToGlobalUnits(y){
  const pxUnit = model.laneHeight / (INTERNAL_DIV / 16);
  return (canvas.height - y) / pxUnit;
}

function placeTickAt(coord){
  const raw = canvasToGlobalUnits(coord.y);
  const gu = snapUnits(raw, model.unitDiv, model.measureCount);
  const m = Math.floor(gu/INTERNAL_DIV);
  const u = gu%INTERNAL_DIV;
  const lane = Math.floor(coord.x/(canvas.width/model.laneCount));
  if(m<0 || m>=model.measureCount) return;
  if(lane<0 || lane>=model.laneCount) return;
  model.addTick(m,lane,u);
  redraw();
}

function eraseAt(coord){
  const raw = canvasToGlobalUnits(coord.y);
  const gu = Math.round(raw);
  const m = Math.floor(gu/INTERNAL_DIV);
  const u = gu%INTERNAL_DIV;
  const lane = Math.floor(coord.x/(canvas.width/model.laneCount));

  // tap
  let idx = model.taps.findIndex(t=>t.measure===m&&t.lane===lane&&t.time===u);
  if(idx>=0){ model.taps.splice(idx,1); redraw(); return; }

  // hold
  idx = model.longNotes.findIndex(ln=>{
    const s=ln.startMeasure*INTERNAL_DIV+ln.startUnit;
    const e=ln.endMeasure*INTERNAL_DIV+ln.endUnit;
    return s<=gu && gu<=e && ln.lane===lane;
  });
  if(idx>=0){ model.longNotes.splice(idx,1); redraw(); return; }

  // tick
  idx = model.ticks.findIndex(t=>t.measure===m&&t.lane===lane&&t.time===u);
  if(idx>=0){ model.ticks.splice(idx,1); redraw(); return; }

  // fx tap
  idx = model.fxTaps.findIndex(t=>t.measure===m&&t.lane===lane&&t.time===u);
  if(idx>=0){ model.fxTaps.splice(idx,1); redraw(); return; }

  // fx hold
  idx = model.fxLongNotes.findIndex(ln=>{
    const s=ln.startMeasure*INTERNAL_DIV+ln.startUnit;
    const e=ln.endMeasure*INTERNAL_DIV+ln.endUnit;
    return s<=gu && gu<=e && ln.lane===lane;
  });
  if(idx>=0){ model.fxLongNotes.splice(idx,1); redraw(); return; }

  // slash
  idx = model.slashFx.findIndex(s=>s.measure===m&&s.lane===lane&&s.time===u);
  if(idx>=0){ model.slashFx.splice(idx,1); redraw(); return; }
}

function applySelectionRect(){
  model.clearSelection();
  model.pasteTarget = null;

  if(!selRect){ redraw(); return; }

  const laneW = canvas.width / model.laneCount;
  const px = model.laneHeight / (INTERNAL_DIV/16);
  const {x,y,w,h} = selRect;

  // taps
  model.taps.forEach((t,i)=>{
    const pos=t.measure*INTERNAL_DIV+t.time;
    const cy=canvas.height - pos*px;
    const cx=t.lane*laneW + laneW*0.1;
    if(intersects(x,y,w,h,cx,cy-model.laneHeight*0.2,laneW*0.8,model.laneHeight*0.4))
      model.selected.taps.push(i);
  });

  // holds
  model.longNotes.forEach((ln,i)=>{
    const s=ln.startMeasure*INTERNAL_DIV+ln.startUnit;
    const e=ln.endMeasure*INTERNAL_DIV+ln.endUnit;
    const y2=canvas.height - e*px;
    const h2=(s-e)*px; // 正の高さ
    const x2=ln.lane*laneW + laneW*0.1;
    if(intersects(x,y,w,h,x2,y2,laneW*0.8,h2))
      model.selected.long.push(i);
  });

  // ticks
  model.ticks.forEach((t,i)=>{
    const pos=t.measure*INTERNAL_DIV+t.time;
    const cy=canvas.height - pos*px;
    const cx=t.lane*laneW + laneW*0.1;
    if(intersects(x,y,w,h,cx,cy-model.laneHeight*0.2,laneW*0.8,model.laneHeight*0.4))
      model.selected.ticks.push(i);
  });

  // fx tap
  model.fxTaps.forEach((t,i)=>{
    const pos=t.measure*INTERNAL_DIV+t.time;
    const cy=canvas.height - pos*px;
    const cx=t.lane*laneW + laneW*0.1;
    if(intersects(x,y,w,h,cx,cy-model.laneHeight*0.2,laneW*0.8,model.laneHeight*0.4))
      model.selected.fxTaps.push(i);
  });

  // fx hold
  model.fxLongNotes.forEach((ln,i)=>{
    const s=ln.startMeasure*INTERNAL_DIV+ln.startUnit;
    const e=ln.endMeasure*INTERNAL_DIV+ln.endUnit;
    const y2=canvas.height - e*px;
    const h2=(s-e)*px;
    const x2=ln.lane*laneW + laneW*0.1;
    if(intersects(x,y,w,h,x2,y2,laneW*0.8,h2))
      model.selected.fxLong.push(i);
  });

  // slash
  model.slashFx.forEach((s,i)=>{
    const pos=s.measure*INTERNAL_DIV+s.time;
    const cy=canvas.height - pos*px;
    const cx=s.lane*laneW + laneW*0.1;
    if(intersects(x,y,w,h,cx,cy-model.laneHeight*0.2,laneW*0.8,model.laneHeight*0.4))
      model.selected.slash.push(i);
  });

  selRect=null;
  redraw();
}

function updateModeAvailability(){
  const is8 = (model.laneCount === 8);

  const banned = new Set(['fxTap','fxLong','slashfx']);

  document.querySelectorAll('input[name="mode"]').forEach(r => {
    if(banned.has(r.value)){
      r.disabled = is8;
    }
  });

  if(is8 && banned.has(mode)){
    mode = 'tap';
    const tapRadio = document.querySelector('input[name="mode"][value="tap"]');
    if(tapRadio) tapRadio.checked = true;
    pendingLong = null;
  }
}


// --- UI wiring ---
window.addEventListener('load', ()=>{
  // mode radio
  document.querySelectorAll('input[name="mode"]').forEach(e=>e.addEventListener('change',ev=>{
    mode = ev.target.value;
    selRect=null; isDragging=false; isTickPainting=false; isErasing=false;
    model.clearSelection();
    model.pasteTarget = null;
    pendingLong = null;
    redraw();
  }));

  document.getElementById('unitSelect').addEventListener('change',e=>{ model.setUnitDiv(+e.target.value); });
  document.getElementById('laneHeight').addEventListener('input',e=>{ model.setLaneHeight(+e.target.value); redraw(); });
  document.getElementById('measureCount').addEventListener('change',e=>{ model.setMeasureCount(+e.target.value); redraw(); });
  document.getElementById('bpm').addEventListener('change',e=>{ model.setBpm(+e.target.value); });
  document.getElementById('laneMode').addEventListener('change', e => {model.laneCount = parseInt(e.target.value, 10);
    updateModeAvailability();
    redraw();
    if(model.laneCount === 8 && (mode==='fxTap' || mode==='fxLong' || mode==='slashfx')) {mode = 'tap';}
  });

  lanemode.addEventListener('change', e => {model.laneCount = parseInt(e.target.value, 10);

  })

  // shortcuts
  document.addEventListener('keydown', e=>{
    if(mode==='select' && e.ctrlKey && (e.key==='c'||e.key==='C')){
      if(!copyBtn.disabled){ copyBtn.click(); e.preventDefault(); }
    }
    if(mode==='select' && e.ctrlKey && (e.key==='v'||e.key==='V')){
      if(!pasteBtn.disabled){ pasteBtn.click(); e.preventDefault(); }
    }
    if(mode==='select' && e.key==='Delete'){
      if(!deleteBtn.disabled){ deleteBtn.click(); e.preventDefault(); }
    }
  });

  copyBtn.onclick = ()=>{ model.copySelection(); redraw(); };
  pasteBtn.onclick = ()=>{ model.pasteFromClipboard(false); redraw(); };
  mirrorPasteBtn.onclick = ()=>{ model.pasteFromClipboard(true); redraw(); };
  deleteBtn.onclick = ()=>{ model.deleteSelection(); redraw(); };
  flipBtn.onclick = ()=>{ model.flipSelectionLR(); redraw(); };

  // mouse
  canvas.addEventListener('mousedown', e=>{
    if(e.button===2 && mode!=='select'){
      isErasing = true;
      eraseAt(getCanvasCoords(canvas,e));
      e.preventDefault();
      return;
    }
    if(mode==='select'){
      isDragging = true;
      selStart = getCanvasCoords(canvas,e);
      selRect = null;
      model.clearSelection();
      model.pasteTarget = null;
      updateActionButtons();
    }
    if(mode==='tick' && e.button===0){
      isTickPainting = true;
      placeTickAt(getCanvasCoords(canvas,e));
    }
  });

  canvas.addEventListener('mousemove', e=>{
    if(isErasing){
      eraseAt(getCanvasCoords(canvas,e));
      return;
    }
    if(isDragging && mode==='select'){
      const cur = getCanvasCoords(canvas,e);
      const x = Math.min(selStart.x,cur.x);
      const y = Math.min(selStart.y,cur.y);
      const w = Math.abs(cur.x-selStart.x);
      const h = Math.abs(cur.y-selStart.y);
      selRect = {x,y,w,h};
      renderer.draw(model, selRect);
      return;
    }
    if(mode==='tick' && isTickPainting && (e.buttons & 1)){
      placeTickAt(getCanvasCoords(canvas,e));
    }
  });

  canvas.addEventListener('mouseup', e=>{
    if(e.button===2){ isErasing=false; return; }
    if(isDragging && mode==='select'){
      isDragging=false;
      applySelectionRect();
    }
    if(mode==='tick' && e.button===0){ isTickPainting=false; }
  });

  canvas.addEventListener('click', e=>{
    const coord = getCanvasCoords(canvas,e);
    const raw = canvasToGlobalUnits(coord.y);
    const gu = snapUnits(raw, model.unitDiv, model.measureCount);
    const m = Math.floor(gu/INTERNAL_DIV);
    const u = gu%INTERNAL_DIV;
    const lane = Math.floor(coord.x/(canvas.width/model.laneCount));

    // select mode paste target
    if(mode==='select' && model.hasClipboard()){
      model.pasteTarget = m*INTERNAL_DIV + u;
      updateActionButtons();
      return;
    }

    if(mode==='tap'){
      model.addTap(m,lane,u); redraw();
    }else if(mode==='fxTap'){
      model.addFxTap(m,lane,u); redraw();
    }else if(mode==='tick'){
      placeTickAt(coord);
    }else if(mode==='long'){
      if(pendingLong==null) pendingLong={m,u,lane};
      else{
        const start = pendingLong.m*INTERNAL_DIV + pendingLong.u;
        const end = m*INTERNAL_DIV + u;
        if(end <= start) alert('終点は始点より下（時間的に後）にしてください');
        else model.addHold(pendingLong.m,pendingLong.u,pendingLong.lane,m,u);
        pendingLong=null; redraw();
      }
    }else if(mode==='fxLong'){
      if(pendingLong==null) pendingLong={m,u,lane, fx:true};
      else{
        const start = pendingLong.m*INTERNAL_DIV + pendingLong.u;
        const end = m*INTERNAL_DIV + u;
        if(end <= start) alert('終点は始点より下（時間的に後）にしてください');
        else model.addFxHold(pendingLong.m,pendingLong.u,pendingLong.lane,m,u);
        pendingLong=null; redraw();
      }
    }else if(mode==='slashfx'){
      if(lane!==0 && lane!==model.laneCount-1){
        alert('SLASH FX は左右端レーンにのみ配置できます。');
        return;
      }
      const color = (lane===0) ? 'red' : 'blue';
      model.addSlashFx(m,lane,u,color);
      redraw();
    }
  });

  canvas.addEventListener('contextmenu', e=>{
    if(mode!=='select') e.preventDefault();
  });

  // midi export
  document.getElementById('exportMidi').addEventListener('click', ()=>{
    const safe = exportMidi(model);
    const blob = new Blob([safe], { type:'audio/midi' });
    const a=document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chart.mid';
    a.click();
  });

  // midi import
  document.getElementById('importMidi').addEventListener('change', async e=>{
    const file = e.target.files[0]; if(!file) return;
    await importMidiToModel(file, model);

    // UIへ反映（bpm/measureCount）
    document.getElementById('bpm').value = model.bpm;
    document.getElementById('measureCount').value = model.measureCount;

    redraw();
  });

  redraw();
});
