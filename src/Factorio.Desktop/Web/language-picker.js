export class LanguagePicker {
 constructor(i18n){
  this.i18n=i18n;this.selected=i18n.locale;this.root=document.createElement('dialog');this.root.className='language-picker';this.root.id='language-picker';this.root.setAttribute('aria-labelledby','language-picker-title');this.root.setAttribute('aria-modal','true');
  const brand=document.createElement('div');brand.className='language-picker-brand';brand.textContent=i18n.text('app.brand');
  const title=document.createElement('h1');title.id='language-picker-title';title.textContent=i18n.text('language.choose');
  const list=document.createElement('div');list.className='language-buttons';this.buttons=[];
  for(const locale of i18n.catalog.locales){const button=document.createElement('button');button.type='button';button.textContent=locale.name;button.lang=locale.id;button.dataset.locale=locale.id;button.setAttribute('aria-pressed',String(locale.id===this.selected));button.addEventListener('click',()=>{this.selected=locale.id;for(const b of this.buttons)b.setAttribute('aria-pressed',String(b===button));});this.buttons.push(button);list.append(button);}
  this.confirm=document.createElement('button');this.confirm.type='button';this.confirm.className='language-confirm';this.confirm.textContent=i18n.text('language.continue');this.confirm.addEventListener('click',()=>i18n.select(this.selected));
  this.root.append(brand,title,list,this.confirm);this.root.addEventListener('cancel',event=>event.preventDefault());document.body.append(this.root);
 }
 show(){if(!this.i18n.firstRun||this.root.open)return;this.root.showModal();this.buttons.find(b=>b.dataset.locale===this.selected)?.focus();}
}
