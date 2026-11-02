import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {crc32, deflateRawSync} from 'node:zlib';
import {Core, toolDefinitions} from './core.mjs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, content] of entries) {
    const n = Buffer.from(name), b = Buffer.from(content), compressed = deflateRawSync(b), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(8,8); h.writeUInt32LE(crc32(b),14); h.writeUInt32LE(compressed.length,18); h.writeUInt32LE(b.length,22); h.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20,6); c.writeUInt16LE(8,10); c.writeUInt32LE(crc32(b),16); c.writeUInt32LE(compressed.length,20); c.writeUInt32LE(b.length,24); c.writeUInt16LE(n.length,28); c.writeUInt32LE(offset,42);
    local.push(h,n,compressed); central.push(c,n); offset += h.length + n.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(process.cwd(),'.dyanari-test-documents-')), ws = path.join(root,'workspace'); fs.mkdirSync(ws);
  const core = new Core(path.join(root,'data')); core.save({tools:true,read:true,workspaces:[{path:ws,write:false}]});
  t.after(() => core.db.close());
  return {core, ws, root, put(name, data) { const file = path.join(ws,name); fs.writeFileSync(file,data); return file; }, read(file, args={}, signal) { return core.tool('read_document',{path:file,...args},signal); }};
}
const docx = text => zip([['word/document.xml',`<w:document xmlns:w="${W}"><w:body>${text}</w:body></w:document>`]]);
const para = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
function xlsx(target='worksheets/sheet1.xml', external=false) {
  return zip([
    ['xl/workbook.xml',`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Budget" sheetId="1" state="hidden" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="${target}"${external?' TargetMode="External"':''}/></Relationships>`],
    ['xl/sharedStrings.xml',`<sst xmlns="${S}"><si><r><t>Hello </t></r><r><t>world</t></r></si></sst>`],
    ['xl/worksheets/sheet1.xml',`<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>SUM(17,25)</f><v>42</v></c><c r="C1" t="inlineStr"><is><t>£10 &amp; tea</t></is></c></row></sheetData></worksheet>`],
  ]);
}

test('DOCX paragraphs, table coordinates, rich text and namespace aliases', async t => {
  const {put,read} = setup(t);
  const file = put('notes.docx',docx(para('Hello &amp; welcome') + '<w:tbl><w:tr><w:tc>'+para('Table value')+'</w:tc></w:tr></w:tbl>'));
  const result = await read(file); assert.equal(result.records[0].text,'Hello & welcome'); assert.equal(result.records[1].cell,1); assert.equal(result.records[1].row,1); assert.equal(result.next_start,null);
  const strict = put('strict.docx',zip([['word/document.xml','<document xmlns="http://purl.oclc.org/ooxml/wordprocessingml/main"><body><p><r><t>Strict namespace</t></r></p></body></document>']]));
  assert.equal((await read(strict)).records[0].text,'Strict namespace');
});
test('XLSX exposes sheet/cell context, rich strings and unevaluated formula cache', async t => {
  const {put,read} = setup(t), r = await read(put('budget.xlsx',xlsx()));
  assert.deepEqual(r.records.map(x=>x.text),['Hello world','42','£10 & tea']); assert.equal(r.records[1].formula,'SUM(17,25)'); assert.equal(r.records[0].visibility,'hidden'); assert.equal(r.records[0].sheet,'Budget');
});
test('bounded pagination reconstructs all text and rejects changed-file continuations', async t => {
  const {put,read} = setup(t), text = 'abcdefghij'.repeat(4000), file = put('long.docx',docx(para(text)));
  let r = await read(file), all = ''; const hash = r.sha256;
  while (true) { assert.ok(JSON.stringify(r).length < 9000); all += r.records.map(x=>x.text).join(''); if (r.next_start === null) break; r = await read(file,{start:r.next_start,expected_sha256:hash}); }
  assert.equal(all,text); put('long.docx',docx(para('changed')));
  await assert.rejects(read(file,{start:1,expected_sha256:hash}),/changed/); await assert.rejects(read(file,{start:1}),/requires/); await assert.rejects(read(file,{start:0.5}),/Invalid/);
});
test('malformed XML, wrong namespaces, DTDs and invalid shared strings fail closed', async t => {
  const {put,read} = setup(t);
  for (const xml of ['<broken>', '<document xmlns="urn:wrong"/>',`<!DOCTYPE w:document [<!ENTITY a SYSTEM "file:///C:/secret">]><w:document xmlns:w="${W}"><w:body/></w:document>`]) {
    await assert.rejects(read(put('bad.docx',zip([['word/document.xml',xml]]))),/Cannot read document/);
  }
  await assert.rejects(read(put('bad.pdf',Buffer.from('not a pdf'))),/Cannot read document/);
});
test('ZIP traversal, duplicate paths, CRC corruption, expansion and file size limits', async t => {
  const {put,read} = setup(t);
  for (const entries of [[['../outside','x']], [['word/document.xml','x'],['word/document.xml','y']], [['huge','x'.repeat(33*1024*1024)]]]) await assert.rejects(read(put('bad.docx',zip(entries))),/Cannot read document/);
  const bad = docx(para('ok')); const center = bad.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); bad.writeUInt32LE(0,center+16);
  await assert.rejects(read(put('crc.docx',bad)),/Corrupt/);
  await assert.rejects(read(put('xml.docx',docx(para('x'.repeat(8*1024*1024))))),/8 MiB/);
  await assert.rejects(read(put('large.pdf',Buffer.alloc(16*1024*1024+1))),/16 MiB/);
});
test('external and escaping workbook relationships are never followed', async t => {
  const {put,read} = setup(t);
  for (const target of ['../../outside.xml','https://example.com/sheet.xml','worksheets/%2e%2e/secret.xml']) await assert.rejects(read(put('bad.xlsx',xlsx(target))),/Unsafe|Missing/);
  await assert.rejects(read(put('external.xlsx',xlsx('https://example.com',true))),/Unsupported worksheet/);
});
test('workspace scope, junctions, default OFF and read revocation are enforced', async t => {
  const {core,root,ws,put,read} = setup(t), file = put('a.docx',docx(para('private')));
  core.save({tools:false}); assert.equal(core.toolAvailable('read_document'),false); await assert.rejects(read(file),/permission/);
  core.save({tools:true,read:false}); await assert.rejects(read(file),/permission/); core.save({read:true});
  const outside = path.join(root,'outside'); fs.mkdirSync(outside); const secret = path.join(outside,'secret.docx'); fs.writeFileSync(secret,docx(para('outside')));
  await assert.rejects(read(secret),/Outside/); fs.symlinkSync(outside,path.join(ws,'link'),process.platform==='win32'?'junction':'dir'); await assert.rejects(read(path.join(ws,'link','secret.docx')),/Outside/);
  assert.deepEqual(toolDefinitions.find(t=>t.function.name==='read_document').function.parameters.required,['path']);
});
test('Stop and permission changes in this or another host cancel workers', async t => {
  const {core,root,put,read} = setup(t), file = put('a.docx',docx(para('hello')));
  const controller = new AbortController(); const pending = read(file,{},controller.signal); controller.abort(); await assert.rejects(pending,/cancelled/);
  const revoked = read(file); core.save({read:false}); await assert.rejects(revoked,/cancelled|revoked|permission/); core.save({read:true});
  const other = new Core(path.join(root,'data')); const pendingOther = read(file); other.save({tools:false}); await assert.rejects(pendingOther,/cancelled|revoked|permission/); other.db.close();
  assert.equal(core.controllers.size,0);
});
test('independently produced PDF, DOCX and XLSX fixtures', async t => {
  const {put,read} = setup(t);
  for (const ext of ['pdf','docx','xlsx']) {
    const r = await read(put('example.'+ext,fs.readFileSync(new URL('./test-fixtures/documents/example.'+ext,import.meta.url))));
    assert.ok(r.records.some(x=>x.text.includes('Dyanari document acceptance')),ext); assert.ok(r.records.some(x=>x.text.includes('42')),ext);
  }
});
