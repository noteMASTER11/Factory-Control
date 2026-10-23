export function resolveLocale(catalog, requested) {
  const id=typeof requested==='string'?requested.replaceAll('_','-').toLowerCase():'';
  return catalog.locales.find(item=>item.id.toLowerCase()===id)
    ?? catalog.locales.find(item=>id&&item.id.split('-')[0].toLowerCase()===id.split('-')[0])
    ?? catalog.locales.find(item=>item.id===catalog.defaultLocale);
}
export class Localization {
  static async load({systemLocale=Object.hasOwn(globalThis,'factorySystemLocale')?globalThis.factorySystemLocale:globalThis.navigator?.language}={}) {
    const catalog = await (await fetch('./locales/index.json')).json();
    let requested;
    try { requested = localStorage.getItem('factory-control.locale'); } catch { /* Default locale works without storage. */ }
    const transient=catalog.locales.find(item=>item.id===new URLSearchParams(globalThis.location?.search).get('locale'));
    const saved=catalog.locales.find(item=>item.id===requested);
    let entry=transient??saved??resolveLocale(catalog,systemLocale);
    let response=await fetch(`./locales/${entry.file}`);
    if(!response.ok){entry=resolveLocale(catalog,null);response=await fetch(`./locales/${entry.file}`);}
    if(!response.ok)throw new Error('locale_unavailable');
    const strings=await response.json(),result=new Localization(catalog,entry.id,strings);
    result.firstRun=!saved&&!transient;return result;
  }
  constructor(catalog, locale, strings) {
    this.catalog = catalog; this.locale = locale; this.strings = strings;
    this.integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    this.decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    this.clock = new Intl.DateTimeFormat(locale, { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  text(key, values = {}) {
    const template = this.strings[key];
    if (typeof template !== 'string') throw new Error(`Missing localization key: ${key}`);
    return template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  }
  number(value, decimal = false) {
    return Number.isFinite(value) ? (decimal ? this.decimal : this.integer).format(value) : this.text('common.empty');
  }
  has(key) { return typeof this.strings[key] === 'string'; }
  prototype(name, kind) {
    if (!name) return this.text('common.empty');
    for (const key of [kind && `prototype.${kind}.${name}`, `prototype.${name}`])
      if (key && this.has(key)) return this.text(key);
    return name;
  }
  prototypeSearch(search) {
    return [...new Set(Object.entries(this.strings).filter(([key,value]) => key.startsWith('prototype.') && value.toLocaleLowerCase(this.locale).includes(search))
      .map(([key]) => key.slice(10).replace(/^(item|entity|fluid|recipe|technology|equipment|planet)\./, '')))];
  }
  apply(root = document) {
    for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = this.text(element.dataset.i18n);
    for (const attribute of ['title','aria-label','placeholder']) {
      for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`))
        element.setAttribute(attribute, this.text(element.getAttribute(`data-i18n-${attribute}`)));
    }
    document.documentElement.lang = this.locale;
    document.title = this.text('app.title');
  }
  select(locale) {
    if (!this.catalog.locales.some(item => item.id === locale)) return;
    const url=new URL(location.href);url.searchParams.delete('locale');
    try { localStorage.setItem('factory-control.locale', locale); }
    catch { url.searchParams.set('locale',locale); /* Keep the selection for this window when storage is unavailable. */ }
    if(url.href===location.href)location.reload();else location.replace(url.href);
  }
}
