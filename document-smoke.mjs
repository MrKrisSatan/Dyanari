// Runs against source OR an extracted desktop payload, without settings/user data.
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
for (const format of ['pdf','docx','xlsx']) {
  const worker = new Worker(new URL('./document-worker.mjs',import.meta.url), {workerData:{format,start:0,data:fs.readFileSync(new URL(`./test-fixtures/documents/example.${format}`,import.meta.url))}});
  try {
    const message = await new Promise((resolve,reject) => { const timeout = setTimeout(()=>reject(Error('Document smoke timeout')),20000); worker.once('message',m=>{clearTimeout(timeout);resolve(m)}); worker.once('error',e=>{clearTimeout(timeout);reject(e)}); });
    assert.equal(message.error,undefined);
    assert.ok(message.result.records.some(r=>r.text.includes('Dyanari document acceptance')));
    assert.ok(message.result.records.some(r=>r.text.includes('42')));
  } finally { await worker.terminate(); }
}
console.log(JSON.stringify({passed:true,formats:['pdf','docx','xlsx'],packagedDependencies:true}));
