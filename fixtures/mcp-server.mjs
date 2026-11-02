// Owned, dependency-free stdio MCP acceptance fixture.
import readline from 'node:readline';
if(process.argv.includes('--bad-json'))console.log('invalid protocol stdout');
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const tools=[{name:'echo',description:'Echo JSON arguments',inputSchema:{type:'object',properties:{text:{type:'string'}}}},{name:'fail',description:'Return tool error',inputSchema:{type:'object'}},{name:'slow',description:'Wait without completion',inputSchema:{type:'object'}},{name:'roots',description:'Request advertised roots',inputSchema:{type:'object'}},{name:'environment',description:'Check credential isolation',inputSchema:{type:'object'}}];
const waiting=new Map();let next=100;
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);if(m.method==='notifications/initialized')return;
 if(m.method==='initialize'){send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:m.params.protocolVersion,serverInfo:{name:'Dyanari owned MCP fixture',version:'1.0'},capabilities:{tools:{}}}});return}
 if(m.method==='tools/list'){send({jsonrpc:'2.0',id:m.id,result:m.params.cursor?{tools:tools.slice(2)}:{tools:tools.slice(0,2),nextCursor:'second'}});return}
 if(m.method==='tools/call'){
  const {name,arguments:args}=m.params;if(name==='slow')return;
  if(name==='roots'){const id=next++;waiting.set(id,m.id);send({jsonrpc:'2.0',id,method:'roots/list',params:{}});return}
  const result=name==='fail'?{isError:true,content:[{type:'text',text:'owned fixture failure'}]}:{content:[{type:'text',text:JSON.stringify(name==='environment'?{hasToken:!!process.env.GH_TOKEN,hasSecret:!!process.env.DYANARI_TEST_SECRET,nodeOptions:process.env.NODE_OPTIONS||''}:args)}]};send({jsonrpc:'2.0',id:m.id,result});return;
 }
 if(waiting.has(m.id)){const id=waiting.get(m.id);waiting.delete(m.id);send({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(m.result)}]}})}
});
