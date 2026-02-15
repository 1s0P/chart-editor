import { INTERNAL_DIV, QUARTER_UNITS, EIGHTH_UNITS } from './constants.js';

const { Midi } = window;
const LANE_PITCH = {
  4: ['C','D','E','F'],
  6: ['C','D','E','F', 'G', 'A'],
  8: ['C','C#','D','D#','E','F','G','G#'] 
};


export function sanitizeMidiTracks(uint8){
  const arr = uint8 instanceof Uint8Array ? uint8 : new Uint8Array(uint8);
  let i = 0; const out = [];
  const push32 = (n)=> out.push((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);

  while(i < arr.length){
    const id = String.fromCharCode(arr[i],arr[i+1],arr[i+2],arr[i+3]);
    const len = (arr[i+4]<<24)|(arr[i+5]<<16)|(arr[i+6]<<8)|arr[i+7];
    const bodyStart = i+8, bodyEnd = bodyStart + len;

    if(id !== 'MThd' && id !== 'MTrk'){
      out.push(arr[i],arr[i+1],arr[i+2],arr[i+3]); push32(len);
      for(let k=bodyStart;k<bodyEnd;k++) out.push(arr[k]);
      i = bodyEnd; continue;
    }
    if(id === 'MThd'){
      out.push(0x4D,0x54,0x68,0x64); push32(len);
      for(let k=bodyStart;k<bodyEnd;k++) out.push(arr[k]);
      i = bodyEnd; continue;
    }

    let eotPos = -1;
    for(let k=bodyStart; k<=bodyEnd-3; k++){
      if(arr[k]===0xFF && arr[k+1]===0x2F && arr[k+2]===0x00){ eotPos = k+3; break; }
    }
    const newLen = (eotPos > -1 ? (eotPos - bodyStart) : len);

    out.push(0x4D,0x54,0x72,0x6B); push32(newLen);
    const copyEnd = bodyStart + newLen;
    for(let k=bodyStart;k<copyEnd;k++) out.push(arr[k]);

    i = bodyEnd;
  }
  return new Uint8Array(out);
}

export function exportMidi(model){
  const { Track, Writer, NoteEvent } = window.MidiWriter;
  const track = new Track();
  track.setTempo(model.bpm);

  const ppq = 128;
  const WHOLE_TICKS = ppq * 4;
  const toTicks = (units) => Math.max(1, Math.round(units * WHOLE_TICKS / INTERNAL_DIV));

  const quarterTicks = WHOLE_TICKS / 4;
  const tapTicks = toTicks(1);
  const pitchTable = LANE_PITCH[model.laneCount];

  // taps
  model.taps.forEach(t=>{
    const startUnits = t.measure*INTERNAL_DIV + t.time;
    track.addEvent(new NoteEvent({
      pitch: pitchTable[t.lane]+'1',
      duration: 'T'+tapTicks,
      startTick: toTicks(startUnits)
    }));
  });

  // holds
  model.longNotes.forEach(ln=>{
    const s = ln.startMeasure*INTERNAL_DIV + ln.startUnit;
    const e = ln.endMeasure*INTERNAL_DIV + ln.endUnit;
    const d = e - s;

    let stTick, duTick;
    if(Math.abs(d - EIGHTH_UNITS) <= 1){
      stTick = toTicks(s + EIGHTH_UNITS);
      duTick = toTicks(EIGHTH_UNITS);
    }else{
      stTick = toTicks(s);
      duTick = toTicks(d + QUARTER_UNITS);
    }

    track.addEvent(new NoteEvent({
      pitch: pitchTable[ln.lane]+'2',
      duration: 'T'+duTick,
      startTick: stTick
    }));
  });

  // ticks
  model.ticks.forEach(t=>{
    const pos = t.measure*INTERNAL_DIV + t.time;
    const shifted = pos + EIGHTH_UNITS;
    track.addEvent(new NoteEvent({
      pitch: pitchTable[t.lane]+'3',
      duration: 'T'+quarterTicks,
      startTick: toTicks(shifted)
    }));
  });

  // fx taps
  model.fxTaps.forEach(t=>{
    const startUnits = t.measure*INTERNAL_DIV + t.time;
    track.addEvent(new NoteEvent({
      pitch: pitchTable[t.lane]+'4',
      duration: 'T'+tapTicks,
      startTick: toTicks(startUnits)
    }));
  });

  // fx holds
  model.fxLongNotes.forEach(ln=>{
    const s = ln.startMeasure*INTERNAL_DIV + ln.startUnit;
    const e = ln.endMeasure*INTERNAL_DIV + ln.endUnit;
    const d = e - s;

    let stTick, duTick;
    if(Math.abs(d - EIGHTH_UNITS) <= 1){
      stTick = toTicks(s + EIGHTH_UNITS);
      duTick = toTicks(EIGHTH_UNITS);
    }else{
      stTick = toTicks(s);
      duTick = toTicks(d + QUARTER_UNITS);
    }

    track.addEvent(new NoteEvent({
      pitch: pitchTable[ln.lane]+'5',
      duration: 'T'+duTick,
      startTick: stTick
    }));
  });

  // slash
  model.slashFx.forEach(t=>{
    if(t.lane !== 0 && t.lane !== model.laneCount-1) return;
    const startUnits = t.measure*INTERNAL_DIV + t.time;
    const pitch = (t.lane===0) ? 'C6' : ((model.laneCount === 4)? 'F6' : 'A6');
    track.addEvent(new NoteEvent({
      pitch,
      duration: 'T'+tapTicks,
      startTick: toTicks(startUnits)
    }));
  });

  const writer = new Writer([track]);
  const built = writer.buildFile();
  return sanitizeMidiTracks(new Uint8Array(built));
}

export async function importMidiToModel(file, model){
  const buf = await file.arrayBuffer();
  const { Midi } = window;
  const midi = new Midi(buf);
  const pitchTable = LANE_PITCH[model.laneCount];

  model.clearAllNotes();

  if(midi.header.tempos?.length){
    model.setBpm(Math.round(midi.header.tempos[0].bpm));
  }

  const ppq = midi.header?.ppq || 128;
  const WHOLE_TICKS = ppq * 4;
  const toUnits = (ticks) => Math.round(ticks * INTERNAL_DIV / WHOLE_TICKS);

  const parseName = (name) => {
  // 例: "C#4" "F1"
  const m = /^([A-G]#?)(-?\d+)$/.exec(name || '');
  if(!m) return null;
  return { note: m[1], oct: Number(m[2]) };
};

  let maxTick = 0;

  midi.tracks.forEach(track=>{
    track.notes.forEach(n=>{
      const parsed = parseName(n.name);
      if(!parsed) return;

      const { note, oct } = parsed;

      const lane = pitchTable.indexOf(note);
      if(lane < 0) return;

      const startUnits0 = toUnits(n.ticks);
      const durUnits = toUnits(n.durationTicks);

      const m = Math.floor(startUnits0 / INTERNAL_DIV);
      const u = startUnits0 % INTERNAL_DIV;

      if(oct===1){
        model.addTap(m,lane,u);
        maxTick = Math.max(maxTick, n.ticks);
      }else if(oct===2){
        if(Math.abs(durUnits - EIGHTH_UNITS) <= 1){
          const startUnits = Math.max(0, startUnits0 - EIGHTH_UNITS);
          const endUnits = startUnits + EIGHTH_UNITS;
          model.addHold(
            Math.floor(startUnits/INTERNAL_DIV), startUnits%INTERNAL_DIV, lane,
            Math.floor(endUnits/INTERNAL_DIV), endUnits%INTERNAL_DIV
          );
        }else{
          const editorDur = Math.max(1, durUnits - QUARTER_UNITS);
          const endUnits = startUnits0 + editorDur;
          model.addHold(m,u,lane, Math.floor(endUnits/INTERNAL_DIV), endUnits%INTERNAL_DIV);
        }
        maxTick = Math.max(maxTick, n.ticks);
      }else if(oct===3){
        const pos = Math.max(0, startUnits0 - EIGHTH_UNITS);
        model.addTick(Math.floor(pos/INTERNAL_DIV), lane, pos%INTERNAL_DIV);
        maxTick = Math.max(maxTick, n.ticks);
      }else if(oct===4){
        if (model.laneCount === 8) return;
        model.addFxTap(m,lane,u);
        maxTick = Math.max(maxTick, n.ticks);
      }else if(oct===5){
        if (model.laneCount === 8) return;
        if(Math.abs(durUnits - EIGHTH_UNITS) <= 1){
          const startUnits = Math.max(0, startUnits0 - EIGHTH_UNITS);
          const endUnits = startUnits + EIGHTH_UNITS;
          model.addFxHold(
            Math.floor(startUnits/INTERNAL_DIV), startUnits%INTERNAL_DIV, lane,
            Math.floor(endUnits/INTERNAL_DIV), endUnits%INTERNAL_DIV
          );
        }else{
          const editorDur = Math.max(1, durUnits - QUARTER_UNITS);
          const endUnits = startUnits0 + editorDur;
          model.addFxHold(m,u,lane, Math.floor(endUnits/INTERNAL_DIV), endUnits%INTERNAL_DIV);
        }
        maxTick = Math.max(maxTick, n.ticks);
      }else if(oct===6){
        if (model.laneCount === 8) return;
        const isLeft = (lane===0) && n.name.startsWith('C');
        const isRight = (model.laneCount===4)? ((lane===3) && n.name.startsWith('F')): ((lane===5) && n.name.startsWith('A'));
        if(isLeft || isRight){
          model.addSlashFx(m,lane,u, lane===0?'red':'blue');
        }
        maxTick = Math.max(maxTick, n.ticks);
      }
    });
  });

  const totalUnits = toUnits(maxTick);
  model.setMeasureCount(Math.max(1, Math.ceil(totalUnits / INTERNAL_DIV)));
}
