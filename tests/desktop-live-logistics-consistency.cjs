// Explicit, read-only full-load check against the player's running gateway.
const assert=require('node:assert/strict'),fs=require('node:fs');
if(!process.argv.includes('--live'))throw new Error('Pass --live to read the current game telemetry.');
const list=v=>Array.isArray(v)?v:[],key=r=>[r.name,r.quality??'normal'].join('|');
const contents=rows=>{const result=new Map();for(const row of list(rows))result.set(key(row),(result.get(key(row))||0)+Math.max(0,row.count||0));return result;};
(async()=>{
 let full,status;
 for(let i=0;i<3;i++){
  full=await(await fetch('http://127.0.0.1:18741/api/v1/logistics')).json();
  status=await(await fetch('http://127.0.0.1:18741/api/v1/client/status')).json();
  if(full.tick===status.topics.logistics.tick&&full.session_id===status.session_id)break;
 }
 assert.equal(full.tick,status.topics.logistics.tick);assert.equal(full.session_id,status.session_id);
 assert(status.discovery_complete,'Wait for map discovery');
 const raw=full.payload.data,summary=status.topics.logistics.payload.data,groups=new Map();
 assert(raw.requesters_available&&summary.requesters_available);
 assert(raw.requesters.length>10000,'Full-load check requires more than 10000 requesters');
 assert.equal(raw.requesters.length,summary.requester_count);
 for(const chest of raw.requesters){
  const requested=new Map();
  for(const section of list(chest.sections)){
   if(section.active===false)continue;
   for(const filter of list(section.filters)){
    const item=filter.value;if(!item?.name||(item.type??'item')!=='item'||(item.comparator??'=')!=='=')continue;
    requested.set(key(item),(requested.get(key(item))||0)+Math.floor((filter.min||0)*(section.multiplier??1)));
   }
  }
  const held=contents(chest.items),incoming=contents(chest.delivering);
  for(const [item,count] of requested){
   if(count<=0)continue;
   const id=[chest.surface,chest.force,item].join('|'),row=groups.get(id)||{requested:0,present:0,incoming:0,missing:0,containers:0};
   const present=held.get(item)||0,delivery=incoming.get(item)||0;
   row.requested+=count;row.present+=present;row.incoming+=delivery;row.missing+=Math.max(0,count-present-delivery);row.containers++;groups.set(id,row);
  }
 }
 assert.equal(groups.size,summary.request_groups_total);
 for(const row of summary.requests){const actual=groups.get([row.surface,row.force,key(row)].join('|'));for(const field of ['requested','present','incoming','missing','containers'])assert.equal(actual[field],row[field],row.name+' '+field);}
 const result={passed:true,session:status.session_id,gameProcessId:status.source_process_id,requesters:raw.requesters.length,groups:groups.size,comparedGroups:summary.requests.length,fullApiRetainsDetails:true,aggregatesMatch:true,transport:status.transport};
 fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/performance-live-api.json',JSON.stringify(result,null,2));console.log(result);
})().catch(error=>{console.error(error);process.exitCode=1;});
