export const chatFeatures = [
  {id:'research',name:'Google research & source notebook',description:'Background Google search, cited source reading, retained evidence, later recall and visual-reference guidance.'},
  {id:'memory',name:'Memory & project context',description:'Search, review, correct, consolidate and recover memories; choose a project namespace.'},
  {id:'tools',name:'Files, documents & internet',description:'Workspace grants, text/code and PDF/DOCX/XLSX tools, web search/fetch and permissions.'},
  {id:'actions',name:'Computer actions & checks',description:'Approved Windows controls and source checks with exact approvals.'},
  {id:'development',name:'Coding, Git & GitHub',description:'Build/test recipes, branches, commits, pushes, issues and pull-request approvals.'},
  {id:'project-tasks',name:'Persistent project tasks',description:'Create, verify, pause, resume and review longer tasks.'},
  {id:'linked-projects',name:'Linked MCP tools',description:'Configure/start linked local servers, grant tools and review execution approvals.'},
  {id:'models',name:'Models & resources',description:'Select installed local models and inspect running model resource use.'},
  {id:'personality',name:'Personality',description:'Edit Dyanari’s personality independently of the local model.'},
  {id:'activity',name:'Activity, recovery & backup',description:'Inspect actions, approve file deletion, undo file operations and manage backups.'},
  {id:'services',name:'Voice, vision, images & 3D',description:'British Velvet voice, microphone/transcription, image/screen inspection, image generation, 3D generation and Save As, reminders and optional runtime setup.'},
];
export const chatFeatureDefinitions = [
  ['list_capabilities','List every application feature and enabled chat tool. Missing permissions must be enabled by the user; never claim a tool succeeded without its result.',{}],
  ['open_feature','Offer an existing feature panel inside the main conversation. Does not change permissions or execute actions. Use a feature id from list_capabilities.',{feature:'string'}],
];
export function chatFeature(name,args,core,definitions) {
  if(name==='list_capabilities')return {features:chatFeatures,enabled_tools:definitions.filter(t=>core.toolAvailable(t.function.name)).map(t=>t.function.name),note:'All feature controls can be opened alongside chat. Approvals, setup, permissions and review remain user-controlled.'};
  const feature=chatFeatures.find(f=>f.id===args.feature);if(!feature)throw Error('Unknown chat feature');return {open_feature:feature.id,name:feature.name};
}
