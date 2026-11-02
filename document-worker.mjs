import {parentPort, workerData} from 'node:worker_threads';
import {inflateRawSync, crc32} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {SaxesParser} from 'saxes';

const W = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
const S = new Set(['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main']);
const R = new Set(['http://schemas.openxmlformats.org/officeDocument/2006/relationships','http://purl.oclc.org/ooxml/officeDocument/relationships']);
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_LIMIT = 8 * 1024 * 1024;
const attr = (node, name, namespaces) => Object.values(node.attributes).find(a => a.local === name && (namespaces ? namespaces.has(a.uri) : !a.uri))?.value;

// Read ZIP entries in memory only. Never extract names or follow relationships on disk/network.
function archive(input) {
  const b = Buffer.from(input); let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { end = i; break; }
  if (end < 0) throw Error('Invalid ZIP document');
  const count = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), directory = b.readUInt32LE(end + 16);
  if (b.readUInt32LE(end + 4) || count !== b.readUInt16LE(end + 8) || count > 2048 || directory + size !== end) throw Error('Unsupported or oversized ZIP directory');
  const entries = new Map(); let pos = directory, total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || b.readUInt32LE(pos) !== 0x02014b50) throw Error('Invalid ZIP entry');
    const flags = b.readUInt16LE(pos + 8), method = b.readUInt16LE(pos + 10), crc = b.readUInt32LE(pos + 16), compressed = b.readUInt32LE(pos + 20), length = b.readUInt32LE(pos + 24);
    const nameLen = b.readUInt16LE(pos + 28), extra = b.readUInt16LE(pos + 30), comment = b.readUInt16LE(pos + 32), offset = b.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen + extra + comment > end) throw Error('Invalid ZIP lengths');
    const name = new TextDecoder('utf-8', {fatal:true}).decode(b.subarray(pos + 46, pos + 46 + nameLen));
    if (!name || name.length > 512 || name.includes('\\') || name.includes(':') || name.startsWith('/') || /[\x00-\x1f]/.test(name) || name.split('/').some(p => p === '..' || p === '.') || entries.has(name)) throw Error('Unsafe or duplicate ZIP path');
    total += length;
    if (flags & 1 || ![0,8].includes(method) || length > 32 * 1024 * 1024 || total > 64 * 1024 * 1024 || offset + 30 > directory || b.readUInt32LE(offset) !== 0x04034b50) throw Error('Unsupported or oversized ZIP entry');
    const localName = b.readUInt16LE(offset + 26), localExtra = b.readUInt16LE(offset + 28), begin = offset + 30 + localName + localExtra;
    if (b.readUInt16LE(offset + 6) !== flags || b.readUInt16LE(offset + 8) !== method || begin + compressed > directory || !b.subarray(offset + 30, offset + 30 + localName).equals(b.subarray(pos + 46, pos + 46 + nameLen))) throw Error('Inconsistent ZIP entry');
    entries.set(name, {begin, compressed, length, method, crc}); pos += 46 + nameLen + extra + comment;
  }
  if (pos !== end) throw Error('Invalid ZIP directory size');
  return {has:name => entries.has(name), read(name) {
    const e = entries.get(name); if (!e) throw Error('Missing document part: ' + name);
    if (e.length > XML_LIMIT) throw Error('Document XML exceeds 8 MiB');
    const raw = b.subarray(e.begin, e.begin + e.compressed);
    const result = e.method === 0 ? raw : inflateRawSync(raw, {maxOutputLength:XML_LIMIT});
    if (result.length !== e.length || crc32(result) !== e.crc) throw Error('Corrupt ZIP document part');
    return result;
  }};
}

function xml(bytes, namespaces, root, handlers) {
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', {fatal:true}).decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', {fatal:true}).decode(bytes);
  else text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  const parser = new SaxesParser({xmlns:true}); const stack = []; let nodes = 0;
  parser.on('doctype', () => { throw Error('Document DTDs are not supported'); });
  parser.on('error', () => { throw Error('Malformed document XML'); });
  parser.on('opentag', n => {
    if (++nodes > 300000 || stack.length >= 100) throw Error('Document XML complexity limit exceeded');
    if (!stack.length && (n.local !== root || !namespaces.has(n.uri))) throw Error('Unexpected document XML namespace/root');
    stack.push(n); handlers.open?.(n, stack);
  });
  parser.on('text', t => handlers.text?.(t, stack));
  parser.on('cdata', t => handlers.text?.(t, stack));
  parser.on('closetag', n => { handlers.close?.(n, stack); stack.pop(); });
  parser.write(text).close();
}

async function read(data, format, start) {
  let total = 0, used = 0, blocked = false; const records = [], warnings = [];
  const emit = record => {
    const text = record.text ?? '';
    for (let offset = 0; offset < Math.max(1, text.length); offset += 1500) {
      const value = {...record, text:text.slice(offset, offset + 1500), index:total++, ...(text.length > 1500 ? {text_offset:offset} : {})};
      if (value.index < start) continue;
      const cost = JSON.stringify(value).length;
      if (blocked || used + cost > 6500 || records.length >= 80) { blocked = true; continue; }
      used += cost; records.push(value);
    }
    if (total > 500000) throw Error('Document record limit exceeded');
  };
  if (format === 'pdf') {
    const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({data:new Uint8Array(data), isEvalSupported:false, useWasm:false, disableFontFace:true, useSystemFonts:false, useWorkerFetch:false,
      cMapUrl:fileURLToPath(new URL('./node_modules/pdfjs-dist/cmaps/', import.meta.url)).replaceAll('\\','/'),
      standardFontDataUrl:fileURLToPath(new URL('./node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\','/'), verbosity:0});
    try {
      const doc = await task.promise;
      if (doc.numPages > 200) throw Error('PDF exceeds 200-page limit');
      let empty = 0;
      for (let page = 1; page <= doc.numPages; page++) {
        const p = await doc.getPage(page); const stream = p.streamTextContent(); const reader = stream.getReader(); let text = '';
        while (true) { const {value, done} = await reader.read(); if (done) break;
          for (const item of value.items) if (typeof item.str === 'string') { text += item.str + (item.hasEOL ? '\n' : ' '); if (text.length > 250000) throw Error('PDF page text limit exceeded'); }
        }
        if (!text.trim()) empty++;
        emit({page, text:text.trim()}); p.cleanup();
      }
      warnings.push('Text extraction only; reading order and layout may differ. No OCR, annotations or attachments.');
      if (empty) warnings.push(`${empty} page(s) contain no extractable text; scanned pages may need OCR.`);
    } finally { await task.destroy(); }
  } else {
    const zip = archive(data);
    if (format === 'docx') {
      let paragraph = 0, body = false, table = 0;
      const tables = [], paragraphs = [];
      xml(zip.read('word/document.xml'), W, 'document', {
        open(n, stack) {
          if (!W.has(n.uri)) return;
          if (n.local === 'body') body = true;
          if (!body) return;
          if (n.local === 'tbl') tables.push({table:++table,row:0,cell:0});
          if (n.local === 'tr' && tables.length) { tables.at(-1).row++; tables.at(-1).cell = 0; }
          if (n.local === 'tc' && tables.length) tables.at(-1).cell++;
          if (n.local === 'p') paragraphs.push({paragraph:++paragraph,...tables.at(-1),text:''});
          if (paragraphs.length && !stack.some(x => W.has(x.uri) && x.local === 'del')) {
            if (n.local === 'tab') paragraphs.at(-1).text += '\t';
            if (['br','cr'].includes(n.local)) paragraphs.at(-1).text += '\n';
          }
        },
        text(t, stack) { const n = stack.at(-1); if (body && paragraphs.length && n?.local === 't' && W.has(n.uri) && !stack.some(x => W.has(x.uri) && x.local === 'del')) paragraphs.at(-1).text += t; },
        close(n, stack) {
          if (!W.has(n.uri)) return;
          if (n.local === 'p' && body) emit(paragraphs.pop());
          if (n.local === 'tbl' && body) tables.pop();
          if (n.local === 'body') body = false;
        },
      });
      warnings.push('Body paragraphs and table text only. Headers, footers, comments, drawings and embedded objects are omitted; tracked deletions and field instructions are not read.');
    } else {
      const strings = []; let value = '', capture = false;
      if (zip.has('xl/sharedStrings.xml')) xml(zip.read('xl/sharedStrings.xml'), S, 'sst', {
        open(n, stack) { if (!S.has(n.uri)) return; if (n.local === 'si') value = ''; if (n.local === 't') capture = !stack.some(x => S.has(x.uri) && x.local === 'rPh'); },
        text(t) { if (capture) value += t; },
        close(n) { if (!S.has(n.uri)) return; if (n.local === 't') capture = false; if (n.local === 'si') strings.push(value); },
      });
      const relationships = new Map();
      xml(zip.read('xl/_rels/workbook.xml.rels'), new Set([REL]), 'Relationships', {open(n) {
        if (n.uri !== REL || n.local !== 'Relationship') return;
        const id = attr(n,'Id'), target = attr(n,'Target'), type = attr(n,'Type');
        if (!id || relationships.has(id)) throw Error('Invalid workbook relationship');
        relationships.set(id, {target, type, external:attr(n,'TargetMode') === 'External'});
      }});
      const sheets = [];
      xml(zip.read('xl/workbook.xml'), S, 'workbook', {open(n) {
        if (S.has(n.uri) && n.local === 'sheet') {
          const name = attr(n,'name'), state = attr(n,'state') || 'visible';
          if (!name || name.length > 128 || !['visible','hidden','veryHidden'].includes(state)) throw Error('Invalid worksheet name/state');
          sheets.push({name, id:attr(n,'id', R), state});
        }
      }});
      if (!sheets.length || sheets.length > 100) throw Error('Workbook must contain 1–100 sheets');
      for (const sheet of sheets) {
        const rel = relationships.get(sheet.id);
        if (!rel || rel.external || ![...R].some(uri => rel.type === uri + '/worksheet')) throw Error('Unsupported worksheet relationship');
        const target = rel.target?.startsWith('/xl/') ? rel.target.slice(1) : 'xl/' + rel.target;
        if (!target || /[\\:%?#]/.test(target) || target.split('/').some(p => p === '..' || p === '.' || !p)) throw Error('Unsafe worksheet target');
        let current = null, field = '', cells = 0;
        xml(zip.read(target), S, 'worksheet', {
          open(n, stack) {
            if (!S.has(n.uri)) return;
            if (n.local === 'c') {
              if (++cells > 100000) throw Error('Worksheet exceeds 100000 cells');
              const address = attr(n,'r'); if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address || '')) throw Error('Invalid worksheet cell address');
              current = {cell:address, type:attr(n,'t') || 'n', value:'', formula:'', inline:''};
            }
            if (current && ['v','f','t'].includes(n.local)) field = n.local === 't' && stack.some(x => S.has(x.uri) && x.local === 'rPh') ? '' : n.local;
          },
          text(t) { if (current && field) current[field === 'v' ? 'value' : field === 'f' ? 'formula' : 'inline'] += t; },
          close(n) {
            if (!S.has(n.uri)) return;
            if (['v','f','t'].includes(n.local)) field = '';
            if (n.local === 'c' && current) {
              let text = current.type === 'inlineStr' ? current.inline : current.value;
              if (current.type === 's') { const i = Number(current.value); if (!/^\d+$/.test(current.value) || !Number.isSafeInteger(i) || i >= strings.length) throw Error('Invalid shared string index'); text = strings[i]; }
              emit({sheet:sheet.name, visibility:sheet.state, cell:current.cell, type:current.type, text,
                ...(current.formula ? {formula:current.formula.slice(0,1000), formula_truncated:current.formula.length > 1000, cached_value:true} : {})}); current = null;
            }
          },
        });
      }
      warnings.push('Raw cell values, including hidden sheets. Dates/styles are not formatted. Formulas are never evaluated; cached values may be stale or absent. Charts, macros and external links are not loaded.');
    }
  }
  return {format, start, records, total_records:total, next_start:blocked ? start + records.length : null, warnings, untrusted_content:true};
}

try { parentPort.postMessage({result:await read(workerData.data, workerData.format, workerData.start)}); }
catch (e) { parentPort.postMessage({error:`Cannot read document: ${String(e.message).slice(0,300)}`}); }
