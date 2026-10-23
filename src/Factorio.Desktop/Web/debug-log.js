let enabled=false;
try{enabled=JSON.parse(localStorage.getItem('factory-control.settings'))?.debugLogs===true;}catch{}
const send=(level,message)=>{if(enabled)window.chrome?.webview?.postMessage({type:'debug.log',level,message:String(message).slice(0,8192)});};
const describe=value=>{
 if(value instanceof Error)return value.stack||value.message;
 if(typeof value==='string')return value.slice(0,4096);
 try{let count=0;const seen=new WeakSet();return JSON.stringify(value,(_,item)=>{if(++count>128)return '[…]';if(typeof item==='string')return item.slice(0,1024);if(item&&typeof item==='object'){if(seen.has(item))return '[circular]';seen.add(item);}return item;})?.slice(0,4096)??String(value);}catch{return String(value).slice(0,4096);}
};
for(const [name,level]of Object.entries({debug:'Debug',log:'Information',info:'Information',warn:'Warning',error:'Error',trace:'Debug'})){
 const original=console[name].bind(console);console[name]=(...args)=>{original(...args);if(enabled)send(level,args.slice(0,8).map(describe).join(' '));};
}
window.addEventListener('error',event=>{if(enabled)send('Error',event.error?.stack||`${event.message} ${event.filename||''}:${event.lineno||0}`);});
window.addEventListener('unhandledrejection',event=>{if(enabled)send('Error',describe(event.reason));});
export function setDebugLogging(value){enabled=value===true;}
