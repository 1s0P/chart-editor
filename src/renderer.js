import { INTERNAL_DIV } from './constants.js';

export class CanvasRenderer {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(model){
    this.canvas.width = 820;
    const px = model.laneHeight / (INTERNAL_DIV / 16);
    this.canvas.height = px * INTERNAL_DIV * model.measureCount;
  }

  draw(model, selRect=null){
    this.resize(model);
    const { ctx, canvas } = this;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const laneCount = model.laneCount;
    const laneW = canvas.width / laneCount;
    const px = model.laneHeight / (INTERNAL_DIV / 16);

    // grid
    for(let m=0;m<model.measureCount;m++){
      const base = canvas.height - m*INTERNAL_DIV*px;
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,base); ctx.lineTo(canvas.width,base); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = '12px sans-serif'; ctx.textBaseline='bottom';
      ctx.fillText(m+1,4,base-2);

      for(let i=1;i<INTERNAL_DIV;i++){
        const y = base - i*px;
        if(i % (INTERNAL_DIV/4)===0){ctx.strokeStyle='#bbb'; ctx.lineWidth=1.5;}
        else if(i % (INTERNAL_DIV/16)===0){ctx.strokeStyle='#eee'; ctx.lineWidth=1;}
        else continue;
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
      }
    }
    ctx.strokeStyle='#888'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(canvas.width,0); ctx.stroke();

    ctx.strokeStyle='#ccc'; ctx.lineWidth=1;
    for(let i=0;i<=laneCount;i++){
      const x=i*laneW;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }

    // helpers
    const sel = model.selected;

    // taps
    model.taps.forEach((t,i)=>{
      const pos = t.measure*INTERNAL_DIV + t.time;
      const y = canvas.height - pos*px;
      const x = t.lane*laneW + laneW*0.1;
      ctx.fillStyle = sel.taps.includes(i) ? '#66bb66' : '#228b22';
      ctx.fillRect(x, y-model.laneHeight*0.2, laneW*0.8, model.laneHeight*0.4);
    });

    // holds
    model.longNotes.forEach((ln,i)=>{
      const s = ln.startMeasure*INTERNAL_DIV + ln.startUnit;
      const e = ln.endMeasure*INTERNAL_DIV + ln.endUnit;
      const y1 = canvas.height - s*px;
      const y2 = canvas.height - e*px;
      const h = (y1 - y2);
      const x = ln.lane*laneW + laneW*0.1;
      ctx.fillStyle = sel.long.includes(i) ? 'rgba(80,160,255,0.6)' : 'rgba(0,0,255,0.3)';
      ctx.fillRect(x, y2, laneW*0.8, h);
    });

    // ticks
    model.ticks.forEach((t,i)=>{
      const pos=t.measure*INTERNAL_DIV + t.time;
      const y=canvas.height - pos*px;
      const x=t.lane*laneW + laneW*0.1;
      ctx.fillStyle = sel.ticks.includes(i) ? '#ffe680' : '#ff0';
      ctx.fillRect(x, y-model.laneHeight*0.2, laneW*0.8, model.laneHeight*0.4);
      ctx.strokeStyle='rgba(0,0,0,0.15)';
      ctx.strokeRect(x, y-model.laneHeight*0.2, laneW*0.8, model.laneHeight*0.4);
    });

    // fx tap
    model.fxTaps.forEach((t,i)=>{
      const pos=t.measure*INTERNAL_DIV + t.time;
      const y=canvas.height - pos*px;
      const x=t.lane*laneW + laneW*0.1;
      ctx.fillStyle = sel.fxTaps.includes(i) ? '#ff8080' : '#ff3333';
      ctx.fillRect(x, y-model.laneHeight*0.2, laneW*0.8, model.laneHeight*0.4);
    });

    // fx hold
    model.fxLongNotes.forEach((ln,i)=>{
      const s=ln.startMeasure*INTERNAL_DIV + ln.startUnit;
      const e=ln.endMeasure*INTERNAL_DIV + ln.endUnit;
      const y1=canvas.height - s*px;
      const y2=canvas.height - e*px;
      const h=(y1 - y2);
      const x=ln.lane*laneW + laneW*0.1;
      ctx.fillStyle = sel.fxLong.includes(i) ? 'rgba(255,100,100,0.6)' : 'rgba(255,0,100,0.3)';
      ctx.fillRect(x, y2, laneW*0.8, h);
    });

    // slash
    model.slashFx.forEach((sfx,i)=>{
      const pos=sfx.measure*INTERNAL_DIV + sfx.time;
      const y=canvas.height - pos*px;
      const x=sfx.lane*laneW + laneW*0.1;
      const w=laneW*0.8, h=model.laneHeight*0.4;

      ctx.fillStyle = sfx.color==='red'
        ? (sel.slash.includes(i)? '#ff9999':'#ff4444')
        : (sel.slash.includes(i)? '#99b6ff':'#3366ff');

      ctx.beginPath();
      const steps=8, dy=h/steps;
      for(let k=0;k<=steps;k++){
        const xx=(k%2===0)? x : (x+w);
        const yy=(y - h/2 + k*dy);
        if(k===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
      }
      ctx.lineTo(x, y+h/2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.stroke();
    });

    // selection rectangle
    if(selRect){
      ctx.strokeStyle='rgba(0,128,0,0.8)';
      ctx.lineWidth=1;
      ctx.strokeRect(selRect.x, selRect.y, selRect.w, selRect.h);
    }
  }
}
