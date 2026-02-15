import { INTERNAL_DIV } from './constants.js';
import { mirrorLane } from './utils.js';

export class ChartModel {
  constructor(){
    this.laneCount = 4;
    this.measureCount = 4;
    this.laneHeight = 20;
    this.bpm = 120;
    this.unitDiv = 16; // 1/16

    this.taps = [];
    this.longNotes = [];
    this.ticks = [];
    this.fxTaps = [];
    this.fxLongNotes = [];
    this.slashFx = [];

    // selection
    this.selected = {
      taps: [], long: [], ticks: [],
      fxTaps: [], fxLong: [], slash: []
    };

    // clipboard
    this.clip = {
      taps: [], long: [], ticks: [],
      fxTaps: [], fxLong: [], slash: [],
      origin: 0
    };

    this.pasteTarget = null; // globalUnits
  }

  setLaneCount(n){ this.laneCount = n; }
  setMeasureCount(n){ this.measureCount = n; }
  setLaneHeight(n){ this.laneHeight = n; }
  setBpm(n){ this.bpm = n; }
  setUnitDiv(n){ this.unitDiv = n; }

  clearAllNotes(){
    this.taps.length = 0; this.longNotes.length = 0; this.ticks.length = 0;
    this.fxTaps.length = 0; this.fxLongNotes.length = 0; this.slashFx.length = 0;
    this.clearSelection();
    this.pasteTarget = null;
  }

  clearSelection(){
    this.selected = { taps: [], long: [], ticks: [], fxTaps: [], fxLong: [], slash: [] };
  }

  hasSelection(){
    const s=this.selected;
    return s.taps.length||s.long.length||s.ticks.length||s.fxTaps.length||s.fxLong.length||s.slash.length;
  }

  hasClipboard(){
    const c=this.clip;
    return c.taps.length||c.long.length||c.ticks.length||c.fxTaps.length||c.fxLong.length||c.slash.length;
  }

  // --- note queries ---
  hasTickAt(measure, lane, time){
    return this.ticks.some(t => t.measure===measure && t.lane===lane && t.time===time);
  }

  // --- mutate: add ---
  addTap(measure, lane, time){ this.taps.push({ measure, lane, time }); }
  addTick(measure, lane, time){
    if(!this.hasTickAt(measure,lane,time)) this.ticks.push({ measure, lane, time });
  }
  addFxTap(measure, lane, time){ this.fxTaps.push({ measure, lane, time }); }
  addSlashFx(measure, lane, time, color){ this.slashFx.push({ measure, lane, time, color }); }

  addHold(startMeasure, startUnit, lane, endMeasure, endUnit){
    this.longNotes.push({ startMeasure, startUnit, lane, endMeasure, endUnit });
  }
  addFxHold(startMeasure, startUnit, lane, endMeasure, endUnit){
    this.fxLongNotes.push({ startMeasure, startUnit, lane, endMeasure, endUnit });
  }

  // --- selection operations ---
  copySelection(){
    const s=this.selected;
    this.clip.taps  = s.taps.map(i => ({...this.taps[i]}));
    this.clip.long  = s.long.map(i => ({...this.longNotes[i]}));
    this.clip.ticks = s.ticks.map(i => ({...this.ticks[i]}));
    this.clip.fxTaps = s.fxTaps.map(i => ({...this.fxTaps[i]}));
    this.clip.fxLong = s.fxLong.map(i => ({...this.fxLongNotes[i]}));
    this.clip.slash  = s.slash.map(i => ({...this.slashFx[i]}));

    const allG = [];
    for(const t of this.clip.taps)   allG.push(t.measure*INTERNAL_DIV + t.time);
    for(const t of this.clip.ticks)  allG.push(t.measure*INTERNAL_DIV + t.time);
    for(const t of this.clip.fxTaps) allG.push(t.measure*INTERNAL_DIV + t.time);
    for(const sfx of this.clip.slash) allG.push(sfx.measure*INTERNAL_DIV + sfx.time);
    for(const ln of this.clip.long)  allG.push(ln.startMeasure*INTERNAL_DIV + ln.startUnit);
    for(const ln of this.clip.fxLong) allG.push(ln.startMeasure*INTERNAL_DIV + ln.startUnit);

    this.clip.origin = allG.length ? Math.min(...allG) : 0;
    this.pasteTarget = null;
  }

  deleteSelection(){
    const s=this.selected;
    s.taps.sort((a,b)=>b-a).forEach(i=>this.taps.splice(i,1));
    s.long.sort((a,b)=>b-a).forEach(i=>this.longNotes.splice(i,1));
    s.ticks.sort((a,b)=>b-a).forEach(i=>this.ticks.splice(i,1));
    s.fxTaps.sort((a,b)=>b-a).forEach(i=>this.fxTaps.splice(i,1));
    s.fxLong.sort((a,b)=>b-a).forEach(i=>this.fxLongNotes.splice(i,1));
    s.slash.sort((a,b)=>b-a).forEach(i=>this.slashFx.splice(i,1));
    this.clearSelection();
    this.pasteTarget = null;
  }

  flipSelectionLR(){
    const s=this.selected;
    s.taps.forEach(i => { this.taps[i].lane = mirrorLane(this.taps[i].lane, this.laneCount); });
    s.long.forEach(i => { this.longNotes[i].lane = mirrorLane(this.longNotes[i].lane, this.laneCount); });
    s.ticks.forEach(i => { this.ticks[i].lane = mirrorLane(this.ticks[i].lane, this.laneCount); });
    s.fxTaps.forEach(i => { this.fxTaps[i].lane = mirrorLane(this.fxTaps[i].lane, this.laneCount); });
    s.fxLong.forEach(i => { this.fxLongNotes[i].lane = mirrorLane(this.fxLongNotes[i].lane, this.laneCount); });
    s.slash.forEach(i => {
      const sfx = this.slashFx[i];
      sfx.lane = mirrorLane(sfx.lane, this.laneCount);
      // 端色ルール（現仕様）
      sfx.color = (sfx.lane===0) ? 'red' : (sfx.lane===this.laneCount-1 ? 'blue' : sfx.color);
    });
  }

  pasteFromClipboard(mirror=false){
    if(this.pasteTarget == null) return;
    const laneCount = this.laneCount;
    const origin = this.clip.origin;
    const target = this.pasteTarget;

    const mir = (l)=> mirror ? mirrorLane(l, laneCount) : l;

    for(const n of this.clip.taps){
      const rel = n.measure*INTERNAL_DIV + n.time - origin;
      const g = target + rel;
      this.taps.push({ measure: Math.floor(g/INTERNAL_DIV), lane: mir(n.lane), time: g%INTERNAL_DIV });
    }
    for(const ln of this.clip.long){
      const rel = ln.startMeasure*INTERNAL_DIV + ln.startUnit - origin;
      const g = target + rel;
      const dur = (ln.endMeasure*INTERNAL_DIV + ln.endUnit) - (ln.startMeasure*INTERNAL_DIV + ln.startUnit);
      const g1 = g + dur;
      this.longNotes.push({
        startMeasure: Math.floor(g/INTERNAL_DIV),
        startUnit: g%INTERNAL_DIV,
        lane: mir(ln.lane),
        endMeasure: Math.floor(g1/INTERNAL_DIV),
        endUnit: g1%INTERNAL_DIV
      });
    }
    for(const n of this.clip.ticks){
      const rel = n.measure*INTERNAL_DIV + n.time - origin;
      const g = target + rel;
      const m = Math.floor(g/INTERNAL_DIV);
      const u = g%INTERNAL_DIV;
      const lane = mir(n.lane);
      if(!this.hasTickAt(m,lane,u)) this.ticks.push({ measure:m, lane, time:u });
    }
    for(const n of this.clip.fxTaps){
      const rel = n.measure*INTERNAL_DIV + n.time - origin;
      const g = target + rel;
      this.fxTaps.push({ measure: Math.floor(g/INTERNAL_DIV), lane: mir(n.lane), time: g%INTERNAL_DIV });
    }
    for(const ln of this.clip.fxLong){
      const rel = ln.startMeasure*INTERNAL_DIV + ln.startUnit - origin;
      const g = target + rel;
      const dur = (ln.endMeasure*INTERNAL_DIV + ln.endUnit) - (ln.startMeasure*INTERNAL_DIV + ln.startUnit);
      const g1 = g + dur;
      this.fxLongNotes.push({
        startMeasure: Math.floor(g/INTERNAL_DIV),
        startUnit: g%INTERNAL_DIV,
        lane: mir(ln.lane),
        endMeasure: Math.floor(g1/INTERNAL_DIV),
        endUnit: g1%INTERNAL_DIV
      });
    }
    for(const sfx of this.clip.slash){
      const rel = sfx.measure*INTERNAL_DIV + sfx.time - origin;
      const g = target + rel;
      const lane = mir(sfx.lane);
      const color = (lane===0) ? 'red' : (lane===laneCount-1 ? 'blue' : sfx.color);
      this.slashFx.push({ measure: Math.floor(g/INTERNAL_DIV), lane, time: g%INTERNAL_DIV, color });
    }
  }
}
