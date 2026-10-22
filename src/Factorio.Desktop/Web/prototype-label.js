const icons=await(await fetch('./icons/catalog.json')).json();
export function prototypeLabel(i18n,name,kind='item'){
 const label=document.createElement('span');label.className='resource-cell';const text=i18n.prototype(name,kind),path=icons[kind+'|'+name]||icons['item|'+name];
 if(path){const image=document.createElement('img');image.src='./icons/'+path;image.alt='';label.append(image);}
 const title=document.createElement('span');title.textContent=text;label.append(title);label.title=text;return label;
}
