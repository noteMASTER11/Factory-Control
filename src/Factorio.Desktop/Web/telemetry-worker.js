import {TelemetryEngine} from './telemetry-engine.js';
const engine=new TelemetryEngine();
onmessage=({data})=>{
 try{
  if(data.type==='ingest')engine.accept(data.packet);
  if(data.type==='select')engine.select(data.view);
  if(data.type==='configure')engine.configure(data.view,data.options);
  if(data.type==='clock')engine.rebuild();
  postMessage({type:'frame',...engine.frame()});
 }catch(error){postMessage({type:'error',message:error.message});}
};
