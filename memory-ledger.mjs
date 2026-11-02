import crypto from 'node:crypto';
export const memoryCategories=['general','preference','relationship','project','lore','episode','workflow'];
const normalized=s=>s.normalize('NFKC').replace(/\s+/gu,' ').trim();
const words=s=>new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>1));
export class MemoryLedger {
 constructor(core){
  this.core=core;this.db=core.db;this.merges=new Map();
  this.db.exec(`CREATE TABLE IF NOT EXISTS memory_vectors(id INTEGER PRIMARY KEY,digest TEXT,vector TEXT,embedding_model TEXT NOT NULL DEFAULT 'all-minilm');
   CREATE TABLE IF NOT EXISTS memory_details(memory_id INTEGER PRIMARY KEY,category TEXT NOT NULL DEFAULT 'general',source TEXT NOT NULL DEFAULT 'legacy',evidence TEXT NOT NULL DEFAULT '',updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS memory_suggestions(id INTEGER PRIMARY KEY,content TEXT NOT NULL,project TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,evidence TEXT NOT NULL,source_message INTEGER,fingerprint TEXT NOT NULL UNIQUE,stamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS memory_dismissed(fingerprint TEXT PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS memory_merges(id INTEGER PRIMARY KEY,before_rows TEXT NOT NULL,after_row TEXT NOT NULL,undone INTEGER NOT NULL DEFAULT 0,stamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   INSERT OR IGNORE INTO memory_details(memory_id,category,source,evidence,updated) SELECT id,'general','legacy','',stamp FROM memories;`);
 }
 validate(content,project='',category='general'){
  if(typeof content!=='string'||!content.trim()||content.length>4000)throw Error('Memory must contain 1–4000 characters');
  if(typeof project!=='string'||project.length>100)throw Error('Project namespace must be at most 100 characters');
  if(!memoryCategories.includes(category))throw Error('Invalid memory category');
  return {content:content.trim(),project,category};
 }
 list({query='',category='',project=null,limit=5000}={}){
  if(typeof query!=='string'||query.length>300||category&&!memoryCategories.includes(category)||project!==null&&typeof project!=='string'||!Number.isInteger(limit)||limit<1||limit>100000)throw Error('Invalid memory filter');
  let rows=this.db.prepare(`SELECT m.*,coalesce(d.category,'general') category,coalesce(d.source,'legacy') source,coalesce(d.evidence,'') evidence,coalesce(d.updated,m.stamp) updated FROM memories m LEFT JOIN memory_details d ON d.memory_id=m.id ORDER BY m.id DESC`).all();
  if(project!==null)rows=rows.filter(m=>m.project===project);
  return rows.filter(m=>(!category||m.category===category)&&(!query||(m.content+' '+m.project+' '+m.category).toLowerCase().includes(query.toLowerCase()))).slice(0,limit).map(m=>({...m,snapshot:this.digest([m])}));
 }
 get(id){const row=this.db.prepare(`SELECT m.*,coalesce(d.category,'general') category,coalesce(d.source,'legacy') source,coalesce(d.evidence,'') evidence,coalesce(d.updated,m.stamp) updated FROM memories m LEFT JOIN memory_details d ON d.memory_id=m.id WHERE m.id=?`).get(Number(id));if(!row)throw Error('Memory not found');return row}
 digest(rows){return this.core.hash(JSON.stringify(rows.map(({id,content,project,category,source,evidence,updated})=>({id,content,project,category,source,evidence,updated}))))}
 metadata(id,{category='general',source='manual',evidence=''}={}){
  if(!memoryCategories.includes(category)||!['manual','explicit','approved-suggestion','legacy','restored','consolidated'].includes(source)||typeof evidence!=='string'||evidence.length>1000)throw Error('Invalid memory metadata');
  this.db.prepare('INSERT OR REPLACE INTO memory_details(memory_id,category,source,evidence,updated) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').run(id,category,source,evidence);
 }
 add(content,project='',options={}){
  const category=options.category||'general';const value=this.validate(content,project,category);
  const existing=this.list({project}).find(m=>normalized(m.content)===normalized(value.content));if(existing)return {id:existing.id,duplicate:true};
  const collision=this.db.prepare('SELECT id,project FROM memories WHERE content=?').get(value.content);if(collision)throw Error('This exact memory already exists in another project. Edit its scope or use distinct wording.');
  // Validate metadata before writing, so malformed imports cannot leave a half-created row.
  const source=options.source||'manual',evidence=options.evidence||'';
  if(!['manual','explicit','approved-suggestion','legacy','restored','consolidated'].includes(source)||typeof evidence!=='string'||evidence.length>1000)throw Error('Invalid memory metadata');
  this.db.exec('SAVEPOINT memory_add');try{const result=this.db.prepare('INSERT INTO memories(content,project) VALUES(?,?)').run(value.content,project);const id=Number(result.lastInsertRowid);this.metadata(id,{category,source,evidence});this.db.exec('RELEASE memory_add');return {id,duplicate:false}}catch(e){this.db.exec('ROLLBACK TO memory_add; RELEASE memory_add');throw e}
 }
 edit(id,content,project,category,expected){
  const before=this.get(id);if(typeof expected!=='string'||this.digest([before])!==expected)throw Error('Memory changed; refresh before editing');
  const v=this.validate(content,project,category);const duplicate=this.list({project}).find(m=>m.id!==before.id&&normalized(m.content)===normalized(v.content));if(duplicate)throw Error('Duplicate memory; use consolidation instead');
  this.db.exec('BEGIN IMMEDIATE');try{
   if(this.digest([this.get(id)])!==expected)throw Error('Memory changed');
   this.db.prepare('UPDATE memories SET content=?,project=? WHERE id=?').run(v.content,v.project,before.id);this.metadata(before.id,{category:v.category,source:'manual',evidence:before.evidence});this.db.prepare('DELETE FROM memory_vectors WHERE id=?').run(before.id);this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e}return this.get(id);
 }
 delete(id,expected){
  const row=this.get(id);if(typeof expected!=='string'||this.digest([row])!==expected)throw Error('Memory changed; refresh before deleting');
  this.db.exec('BEGIN IMMEDIATE');try{
   if(this.digest([this.get(id)])!==expected)throw Error('Memory changed');
   this.db.prepare('DELETE FROM memories WHERE id=?').run(row.id);this.db.prepare('DELETE FROM memory_details WHERE memory_id=?').run(row.id);this.db.prepare('DELETE FROM memory_vectors WHERE id=?').run(row.id);
   // A forgotten fact must not remain in merge recovery snapshots.
   const records=this.db.prepare('SELECT id,before_rows,after_row FROM memory_merges').all().map(m=>({...m,after:JSON.parse(m.after_row),before:JSON.parse(m.before_rows)}));
   const keys=new Set([row.project+'\0'+row.content]),remove=new Set();let changed=true;
   while(changed){changed=false;for(const m of records)if(!remove.has(m.id)&&((m.after.id===row.id&&m.after.project===row.project)||[...m.before,m.after].some(r=>keys.has(r.project+'\0'+r.content)))){remove.add(m.id);for(const r of [...m.before,m.after])keys.add(r.project+'\0'+r.content);changed=true}}
   for(const id of remove)this.db.prepare('DELETE FROM memory_merges WHERE id=?').run(id);
   for(const p of this.db.prepare('SELECT id,content,project FROM memory_suggestions').all())if(p.project===row.project&&normalized(p.content)===normalized(row.content))this.dismiss(p.id);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e}return {deleted:row.id};
 }
 fingerprint(content,project){return crypto.createHash('sha256').update(project+'\0'+normalized(content)).digest('hex')}
 propose(content,project='',category='general',evidence='',message=null){
  const v=this.validate(content,project,category);const fingerprint=this.fingerprint(v.content,project);
  if(this.db.prepare('SELECT 1 FROM memory_dismissed WHERE fingerprint=?').get(fingerprint)||this.list({project}).some(m=>normalized(m.content)===normalized(v.content)))return {created:false};
  if(this.db.prepare('SELECT count(*) n FROM memory_suggestions').get().n>=300)return {created:false,limit:true};
  const result=this.db.prepare('INSERT OR IGNORE INTO memory_suggestions(content,project,category,evidence,source_message,fingerprint) VALUES(?,?,?,?,?,?)').run(v.content,project,category,String(evidence).slice(0,1000),Number.isSafeInteger(message)?message:null,fingerprint);return {created:result.changes===1,id:Number(result.lastInsertRowid)};
 }
 captureUser(text,project='',{privateMode=false,message=null}={}){
  if(privateMode||!this.core.settings.memorySuggestionsEnabled||typeof text!=='string'||/^remember\b/i.test(text.trim()))return {created:0};
  let created=0;
  for(const raw of text.split(/\n|(?<=[.!])\s+/u).slice(0,30)){
   const sentence=raw.trim();if(sentence.length<8||sentence.length>500||/[?<>`]/.test(sentence)||/\b(?:if|imagine|suppose|hypothetical|fiction|roleplay|maybe|perhaps|password|secret|api key|access token|forget|do not remember|don't remember)\b/i.test(sentence)||/[“”"{}]/.test(sentence))continue;
   let category;
   if(/^(?:I (?:prefer|like|love|enjoy|dislike|hate)|My favou?rite\b)/i.test(sentence))category='preference';
   else if(/^(?:My (?:name|birthday|pronouns|job|occupation) (?:is|are)|Please call me\b)/i.test(sentence))category='general';
   else if(/^(?:For (?:this|the) project,? we (?:use|chose|decided)|Our project (?:uses|is named))/i.test(sentence)&&project)category='project';
   else if(/^When (?:editing|writing|testing|building)\b.{1,160}\b(?:I prefer|please|always|never)\b/i.test(sentence))category='workflow';
   if(category)created+=Number(this.propose(sentence,project,category,sentence,message).created);
  }return {created};
 }
 suggestions(project=null){return this.db.prepare('SELECT * FROM memory_suggestions ORDER BY id DESC LIMIT 300').all().filter(p=>project===null||p.project===project)}
 approve(id,{content,project,category}={}){
  const p=this.db.prepare('SELECT * FROM memory_suggestions WHERE id=?').get(Number(id));if(!p)throw Error('Suggestion not found');
  this.db.exec('BEGIN IMMEDIATE');try{const result=this.add(content??p.content,project??p.project,{category:category??p.category,source:'approved-suggestion',evidence:p.evidence});this.db.prepare('DELETE FROM memory_suggestions WHERE id=?').run(p.id);this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}
 }
 dismiss(id){const p=this.db.prepare('SELECT fingerprint FROM memory_suggestions WHERE id=?').get(Number(id));if(p){this.db.prepare('INSERT OR IGNORE INTO memory_dismissed VALUES(?)').run(p.fingerprint);this.db.prepare('DELETE FROM memory_suggestions WHERE id=?').run(Number(id))}return {dismissed:Number(id)}}
 duplicateCandidates(){const rows=this.list(),terms=rows.map(r=>new Set([...words(r.content)].slice(0,200)));const pairs=[];let comparisons=0;for(let i=0;i<rows.length&&comparisons<150000;i++)for(let j=i+1;j<rows.length&&comparisons++<150000;j++){if(rows[i].project!==rows[j].project)continue;let common=0;for(const word of terms[i])if(terms[j].has(word))common++;const union=terms[i].size+terms[j].size-common,score=union?common/union:0;if(score>=0.65)pairs.push({ids:[rows[i].id,rows[j].id],project:rows[i].project,contents:[rows[i].content,rows[j].content],score})}return pairs.sort((a,b)=>b.score-a.score).slice(0,30)}
 previewMerge(ids,content,category){
  if(!Array.isArray(ids)||ids.length<2||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)))throw Error('Select 2–20 distinct memory ids');
  const rows=ids.map(id=>this.get(id)).sort((a,b)=>a.id-b.id);if(rows.some(r=>r.project!==rows[0].project))throw Error('Consolidation cannot cross project boundaries');this.validate(content,rows[0].project,category);
  for(const [key,p]of this.merges)if(p.expires<Date.now())this.merges.delete(key);if(this.merges.size>=20)throw Error('Resolve existing consolidation previews first');
  const id=crypto.randomUUID();const p={id,rows,content:content.trim(),category,project:rows[0].project,digest:this.digest(rows),expires:Date.now()+300000};this.merges.set(id,p);return {id,expires:p.expires,before:rows,after:{content:p.content,category,project:p.project}};
 }
 confirmMerge(id){
  const p=this.merges.get(id);this.merges.delete(id);if(!p||p.expires<Date.now())throw Error('Merge preview expired or already used');
  this.db.exec('BEGIN IMMEDIATE');try{
   if(this.digest(p.rows.map(r=>this.get(r.id)))!==p.digest)throw Error('Memory changed; preview consolidation again');
   for(const row of p.rows){this.db.prepare('DELETE FROM memories WHERE id=?').run(row.id);this.db.prepare('DELETE FROM memory_details WHERE memory_id=?').run(row.id);this.db.prepare('DELETE FROM memory_vectors WHERE id=?').run(row.id)}
   const result=this.add(p.content,p.project,{category:p.category,source:'consolidated',evidence:'User-approved consolidation'});if(result.duplicate)throw Error('Merged text already exists as another memory');
   const after=this.get(result.id);const merge=this.db.prepare('INSERT INTO memory_merges(before_rows,after_row) VALUES(?,?)').run(JSON.stringify(p.rows),JSON.stringify(after));this.db.exec('COMMIT');return {merged:true,id:result.id,operation:Number(merge.lastInsertRowid)};
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 history(){return this.db.prepare('SELECT id,stamp,undone FROM memory_merges ORDER BY id DESC LIMIT 30').all()}
 undoMerge(id){
  const merge=this.db.prepare('SELECT * FROM memory_merges WHERE id=?').get(Number(id));if(!merge||merge.undone)throw Error('Merge cannot be undone');const after=JSON.parse(merge.after_row),before=JSON.parse(merge.before_rows);
  this.db.exec('BEGIN IMMEDIATE');try{
   if(this.digest([this.get(after.id)])!==this.digest([after]))throw Error('Merged memory changed; undo would overwrite corrections');
   this.db.prepare('DELETE FROM memories WHERE id=?').run(after.id);this.db.prepare('DELETE FROM memory_details WHERE memory_id=?').run(after.id);this.db.prepare('DELETE FROM memory_vectors WHERE id=?').run(after.id);
   for(const row of before){const result=this.add(row.content,row.project,{category:row.category,source:row.source,evidence:row.evidence});if(result.duplicate)throw Error('Original memory now exists; undo cancelled')}
   this.db.prepare('UPDATE memory_merges SET undone=1 WHERE id=?').run(merge.id);this.db.exec('COMMIT');return {undone:merge.id};
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 export(){if(this.db.prepare('SELECT count(*) n FROM memories').get().n>100000)throw Error('Export exceeds 100,000 memories');return {version:1,modelIndependent:true,exportedAt:new Date().toISOString(),memories:this.list({limit:100000})}}
 restoreMetadata(rows){if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid memory metadata backup');for(const row of rows){const found=this.db.prepare('SELECT id FROM memories WHERE content=? AND project=?').get(row.content,row.project);if(found)this.metadata(found.id,{category:row.category,source:row.source,evidence:row.evidence})}}
}
