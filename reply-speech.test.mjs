import {test} from 'node:test';import assert from 'node:assert/strict';
await import('./public/reply-speech.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('speech starts before the full response arrives and prepares one clip ahead',async()=>{
 const rendered=[],played=[];let active=0,max=0;const q=new globalThis.DyanariReplySpeech({synthesize:async text=>{active++;max=Math.max(max,active);rendered.push(text);await delay(2);active--;return text},play:async text=>{played.push(text);await delay(8)},stop:()=>{}});
 q.push('The first sentence is ready. ');await delay(5);assert.equal(played.length,1);q.push('The second sentence follows. The third completes the answer.');await q.finish();assert.equal(max,1);assert.equal(played.join(''),'The first sentence is ready. The second sentence follows. The third completes the answer.');assert.equal(rendered.length,3);
});
test('long replies stay bounded, preserve text and stop without later playback',async()=>{
 const chunks=[];const q=new globalThis.DyanariReplySpeech({synthesize:async t=>{chunks.push(t);return t},play:async()=>{},stop:()=>{}}),text='Long answer without punctuation '.repeat(300);q.push(text);await q.finish();assert.ok(chunks.every(t=>t.length<=240));assert.equal(chunks.join(''),text);
 let played=0,stopped=0;const cancelled=new globalThis.DyanariReplySpeech({synthesize:async(t,signal)=>{await delay(10);if(signal.aborted)throw new DOMException('Stopped','AbortError');return t},play:async()=>{played++},stop:()=>{stopped++}});cancelled.push('Cancel this sentence. ');cancelled.cancel();await delay(20);assert.equal(played,0);assert.equal(stopped,1);
});
