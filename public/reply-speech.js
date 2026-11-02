// Sentence queue with one prepared clip ahead of playback; no overlapping synthesis.
globalThis.DyanariReplySpeech = class {
  constructor({synthesize,play,stop,onError=()=>{}}){this.synthesize=synthesize;this.playClip=play;this.stopClip=stop;this.onError=onError;this.controller=new AbortController();this.buffer='';this.pending=[];this.prepared=[];this.rendering=false;this.playing=false;this.closed=false;this.stopped=false;this.done=new Promise(resolve=>{this.resolve=resolve});}
  push(text){if(this.stopped||this.closed)return;this.buffer+=text;this.split(false);}
  split(final){
    while(this.buffer.length){
      const sentence=this.buffer.match(/^([\s\S]{1,240}?[.!?](?:["')]*)(?:\s+|$)|[\s\S]{1,240}?\n)/);
      let end=sentence?.[0].length||0;
      if(!end&&this.buffer.length>=240){end=this.buffer.lastIndexOf(' ',240);if(end<60)end=240;}
      if(!end&&final)end=Math.min(240,this.buffer.length);
      if(!end)break;
      const chunk=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end);if(chunk.trim())this.pending.push(chunk);
    }
    this.render();
  }
  finish(){this.closed=true;this.split(true);this.check();return this.done;}
  cancel(){if(this.stopped)return;this.stopped=true;this.controller.abort();this.pending=[];this.prepared=[];this.buffer='';this.stopClip();this.resolve();}
  fail(error){if(!this.stopped){this.cancel();if(error.name!=='AbortError')this.onError(error);}}
  check(){if(this.closed&&!this.pending.length&&!this.prepared.length&&!this.rendering&&!this.playing)this.resolve();}
  async render(){
    if(this.stopped||this.rendering||this.prepared.length||!this.pending.length){this.check();return;}
    this.rendering=true;const text=this.pending.shift();
    try{const clip=await this.synthesize(text,this.controller.signal);if(!this.stopped)this.prepared.push(clip);}
    catch(e){this.fail(e)}finally{this.rendering=false;if(!this.stopped){this.play();this.check();}}
  }
  async play(){
    if(this.stopped||this.playing||!this.prepared.length)return;
    this.playing=true;const clip=this.prepared.shift();this.render();
    try{await this.playClip(clip,this.controller.signal)}catch(e){this.fail(e)}finally{this.playing=false;if(!this.stopped){this.play();this.render();this.check();}}
  }
};
