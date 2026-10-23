"""Import names from the installed game's own locale data; never query the game.

Only prototype.* keys already present in ru-RU are written. Missing community
translations fall back to installed English names, never Russian UI copy.
"""
from pathlib import Path
import importlib.util
import json
import re

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'src/Factorio.Desktop/Web'
GAME = Path('D:/SteamLibrary/steamapps/common/Factorio/data')
MODULES = ['core', 'base', 'space-age', 'quality', 'elevated-rails', 'recycler']
LANGUAGES = {'en-US':'en','uk-UA':'uk','de-DE':'de','es-ES':'es-ES','fr-FR':'fr','cs-CZ':'cs','hu-HU':'hu','et-EE':'et','fi-FI':'fi','pt-PT':'pt-PT'}
SECTIONS = {'item':'item-name','entity':'entity-name','fluid':'fluid-name','recipe':'recipe-name','technology':'technology-name','equipment':'equipment-name','planet':'space-location-name'}

def config(language):
    entries = {}
    for module in MODULES:
        for file in sorted((GAME / module / 'locale' / language).glob('*.cfg')):
            section = ''
            for line in file.read_text(encoding='utf-8-sig').splitlines():
                if line.startswith('[') and line.endswith(']'): section = line[1:-1]
                elif '=' in line and not line.startswith(';'):
                    key, value = line.split('=', 1)
                    if value: entries[f'{section}.{key}' if section else key] = value
    return entries

def resolver(entries):
    def resolve(value, seen=()):
        if isinstance(value, dict):
            key = value.get(1)
            if key in seen or key not in entries: return None
            text, seen = entries[key], (*seen, key)
            for i in range(2, len(value)+1):
                part = resolve(value[i], seen)
                if part is None: return None
                text = text.replace(f'__{i-1}__', part)
        elif isinstance(value, str): text = value
        else: return None
        references = {'ITEM':'item-name','ENTITY':'entity-name','FLUID':'fluid-name','RECIPE':'recipe-name','TECHNOLOGY':'technology-name','TILE':'tile-name','SPACE_LOCATION':'space-location-name'}
        text = re.sub(r'__(ITEM|ENTITY|FLUID|RECIPE|TECHNOLOGY|TILE|SPACE_LOCATION)__([^_]+(?:_[^_]+)?)__',lambda m:resolve({1:references[m[1]]+'.'+m[2]},seen) or m[0],text)
        return None if '__' in text or '[' in text else text
    return resolve

def main():
    spec=importlib.util.spec_from_file_location('catalog',ROOT/'scripts/import-game-catalog.py')
    catalog=importlib.util.module_from_spec(spec);spec.loader.exec_module(catalog)
    prototypes={}
    for module in MODULES:
        for file in sorted((GAME/module/'prototypes').rglob('*.lua')):
            for p in catalog.tables(file.read_text(encoding='utf-8-sig')):
                kind='item' if p['type'] in catalog.ITEM_TYPES else p['type'] if p['type'] in ['fluid','recipe','technology'] else 'entity'
                prototypes[(kind,p['name'])]=p
    source=json.loads((WEB/'locales/ru-RU.json').read_text(encoding='utf-8'))
    english=config('en');report={}
    for locale,language in LANGUAGES.items():
        file=WEB/'locales'/f'{locale}.json'
        if not file.exists(): raise FileNotFoundError(file)
        strings=json.loads(file.read_text(encoding='utf-8'));local=resolver({**english,**config(language)});english_resolve=resolver(english)
        def resolve(value): return local(value) or english_resolve(value)
        def name(kind,identifier):
            if identifier=='wood-processing':
                # Removed in experimental 2.1, still present in 2.0 captures.
                return {'en-US':'Wood processing','uk-UA':'Переробка деревини','de-DE':'Holzverarbeitung','es-ES':'Procesamiento de madera','fr-FR':'Traitement du bois','cs-CZ':'Zpracování dřeva','hu-HU':'Fafeldolgozás','et-EE':'Puidu töötlemine','fi-FI':'Puun käsittely','pt-PT':'Processamento de madeira'}[locale]
            p=prototypes.get((kind,identifier),{})
            value=resolve(p.get('localised_name') or {1:SECTIONS[kind]+'.'+identifier})
            if value: return value
            if kind in ['item','recipe'] and identifier.endswith('-barrel'):
                fluid=identifier.removeprefix('empty-').removesuffix('-barrel')
                template='item-name.filled-barrel' if kind=='item' else 'recipe-name.empty-filled-barrel' if identifier.startswith('empty-') else 'recipe-name.fill-barrel'
                value=resolve({1:template,2:{1:'fluid-name.'+fluid}})
                if value: return value
            for fallback in ['item','entity','fluid','technology']:
                value=resolve({1:SECTIONS[fallback]+'.'+identifier})
                if value: return value
        missing=[]
        for key in source:
            if not key.startswith('prototype.'): continue
            parts=key.split('.',2)
            if len(parts)==3 and parts[1] in SECTIONS: value=name(parts[1],parts[2])
            else:
                identifier=key[len('prototype.'):]
                value=next((v for kind in SECTIONS if (v:=name(kind,identifier))),None)
            if not value:
                missing.append(key);value=key.split('.')[-1].replace('-',' ')
            strings[key]=value
        file.write_text(json.dumps({k:strings[k] for k in source},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        report[locale]={'prototypeKeys':sum(k.startswith('prototype.') for k in strings),'unresolved':missing}
    (ROOT/'docs/evidence/prototype-locales.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({locale:{'prototypeKeys':r['prototypeKeys'],'unresolved':len(r['unresolved'])} for locale,r in report.items()},ensure_ascii=False))

if __name__=='__main__':main()
