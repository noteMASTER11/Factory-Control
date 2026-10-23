// Coordinates are observed examples, not an assertion that every machine is mapped.
export function productionMapModel(groups,scope,resource,options={}){
 const role=['producers','consumers'].includes(options.mapRole)?options.mapRole:'all',issues=[];
 for(const group of groups||[]){
  if(group.surface!==scope.surface||group.force!==scope.force)continue;
  const matches=entry=>!resource||entry.name===resource.name&&(entry.type||'item')===resource.kind;
  const produces=(group.products||[]).some(matches),consumes=(group.ingredients||[]).some(matches);
  if(!produces&&!consumes||role==='producers'&&!produces||role==='consumers'&&!consumes)continue;
  const points=[],seen=new Set();
  for(const point of group.examples||[]){if(!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;const key=point.x+'|'+point.y;if(!seen.has(key)){seen.add(key);points.push({x:point.x,y:point.y});}}
  const cells=[...new Map(points.map(p=>{const x=Math.floor(p.x/32),y=Math.floor(p.y/32);return [x+'|'+y,{x,y}];})).values()];
  const bounds=cells.length?{left:Math.min(...cells.map(c=>c.x))*32,top:Math.min(...cells.map(c=>c.y))*32,right:(Math.max(...cells.map(c=>c.x))+1)*32,bottom:(Math.max(...cells.map(c=>c.y))+1)*32}:null;
  const relation=produces&&consumes?'both':produces?'producer':'consumer',critical=['no_power','low_power','no_fuel'].includes(group.status);
  issues.push({id:JSON.stringify([scope.id,resource?.id||'all',group.name,group.recipe,group.status,relation]),surface:scope.surface,force:scope.force,name:group.name,recipe:group.recipe,status:group.status,role:relation,
   count:points.length,totalMachines:group.count||0,points,cells,bounds,located:!!points.length,severity:critical?'critical':'warning',color:critical?'#ff665e':relation==='producer'?'#50e6ff':relation==='consumer'?'#7dff81':'#ffd16b'});
 }
 const selected=issues.find(r=>r.id===options.mapSelected)||issues.find(r=>r.located)||issues[0]||null;
 return {issues,selected,options:{scope:scope.id},role,allResources:!resource,resource:resource||null,totalMachines:issues.reduce((n,r)=>n+r.totalMachines,0),coordinateCount:issues.reduce((n,r)=>n+r.points.length,0),qualityUnmeasured:!!resource&&resource.quality!=='normal'};
}
