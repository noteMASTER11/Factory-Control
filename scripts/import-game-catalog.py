"""Import installed Russian names and original icon assets; never contact the game process."""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import re
import shutil
import struct

ITEM_TYPES = set('item ammo capsule gun armor module tool repair-tool rail-planner blueprint blueprint-book selection-tool deconstruction-item upgrade-item item-with-entity-data item-with-inventory item-with-label item-with-tags spidertron-remote copy-paste-tool space-platform-starter-pack'.split())
SECTIONS = {'item-name': 'item', 'entity-name': 'entity', 'fluid-name': 'fluid', 'recipe-name': 'recipe', 'technology-name': 'technology', 'equipment-name': 'equipment', 'space-location-name': 'planet'}
TOKEN = re.compile(r'--\[\[.*?\]\]|--[^\n]*|\[\[.*?\]\]|"(?:\\.|[^"\\])*"|\x27(?:\\.|[^\x27\\])*\x27|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[^\s]', re.S)


def tables(source):
    """Read literal prototype fields. Dynamic Lua expressions are skipped, never executed."""
    tokens = [t for t in TOKEN.findall(source) if not t.startswith('--')]
    found = []

    def skip(i):
        nesting = 0
        while i < len(tokens):
            token = tokens[i]
            if token == '{':
                _, i = table(i)
                continue
            if nesting == 0 and token in [',', ';', '}']:
                break
            if token in ['(', '[']: nesting += 1
            if token in [')', ']']: nesting -= 1
            i += 1
        return None, i

    def value(i):
        if i >= len(tokens): return None, i
        token = tokens[i]
        if token == '{': return table(i)
        if token[:1] in ['"', "'"]:
            result = token[1:-1].replace('\\"', '"').replace("\\'", "'").replace('\\\\', '\\')
            end = i + 1
        elif token in ['true', 'false']:
            result, end = token == 'true', i + 1
        elif re.fullmatch(r'(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?', token):
            result, end = float(token), i + 1
        elif token == '-' and i + 1 < len(tokens):
            result, end = value(i + 1)
            if isinstance(result, (float, int)): result = -result
        else: return skip(i)
        if end < len(tokens) and tokens[end] not in [',', ';', '}']:
            return skip(end)
        return result, end

    def table(i):
        i += 1
        result, position = {}, 1
        while i < len(tokens) and tokens[i] != '}':
            start = i
            if tokens[i] in [',', ';']:
                i += 1
                continue
            if i + 1 < len(tokens) and re.fullmatch(r'[A-Za-z_]\w*', tokens[i]) and tokens[i + 1] == '=':
                key, i = tokens[i], i + 2
            else:
                key, position = position, position + 1
            result[key], i = value(i)
            if i <= start: i = start + 1
        definition_fields = ['icon','icons','stack_size','subgroup','default_temperature','minable','ingredients','results','effects','unit','energy_source','selection_box','collision_box','order']
        if isinstance(result.get('type'), str) and isinstance(result.get('name'), str) and any(key in result for key in definition_fields): found.append(result)
        return result, min(len(tokens), i + 1)

    i = 0
    while i < len(tokens):
        if tokens[i] == '{': _, i = table(i)
        else: i += 1
    return found


def import_catalog(game, web):
    locale_path = web / 'locales/ru-RU.json'
    strings = json.loads(locale_path.read_text(encoding='utf-8-sig'))
    locale, prototypes = {}, {}
    modules = ['core', 'base', 'space-age', 'quality', 'elevated-rails']
    for module in modules:
        folder = game / module
        for file in sorted((folder / 'locale/ru').glob('*.cfg')):
            section = ''
            for line in file.read_text(encoding='utf-8-sig').splitlines():
                if line.startswith('[') and line.endswith(']'): section = line[1:-1]
                elif '=' in line:
                    key, value = line.split('=', 1)
                    locale[f'{section}.{key}' if section else key] = value
        for file in sorted((folder / 'prototypes').rglob('*.lua')):
            for prototype in tables(file.read_text(encoding='utf-8-sig')):
                prototypes[(prototype['type'], prototype['name'])] = prototype

    def resolve(value, seen=()):
        if isinstance(value, dict):
            key = value.get(1)
            if key in seen: return None
            text = locale.get(key)
            if text is None: return None
            seen = (*seen, key)
            for index in range(2, len(value) + 1):
                part = resolve(value[index])
                if part is None: return None
                text = text.replace(f'__{index - 1}__', part)
        elif isinstance(value, str): text = value
        else: return None
        def reference(match):
            section = {'ITEM':'item-name', 'ENTITY':'entity-name', 'FLUID':'fluid-name', 'RECIPE':'recipe-name', 'TECHNOLOGY':'technology-name', 'TILE':'tile-name', 'SPACE_LOCATION':'space-location-name'}[match[1]]
            key = section + '.' + match[2]
            if key in seen: return match[0]
            return resolve({1:key}, seen) or match[0]
        text = re.sub(r'__(ITEM|ENTITY|FLUID|RECIPE|TECHNOLOGY|TILE|SPACE_LOCATION)__([^_]+(?:_[^_]+)?)__', reference, text)
        return None if '__' in text or '[' in text else text

    for section, kind in SECTIONS.items():
        for key in locale:
            if key.startswith(section + '.'):
                name = key[len(section) + 1:]
                text = resolve({1:key})
                if text:
                    strings[f'prototype.{kind}.{name}'] = text
                    strings.setdefault('prototype.' + name, text)

    def asset(path):
        if not isinstance(path, str): return None
        match = re.fullmatch(r'__([^_]+(?:-[^_]+)?)__/(.+)', path or '')
        file = game / match[1] / match[2] if match else None
        return file if file and file.is_file() else None

    icon_root = web / 'icons'
    catalog_path = icon_root / 'catalog.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8-sig'))
    tech_path = icon_root / 'technology/catalog.json'
    tech = json.loads(tech_path.read_text(encoding='utf-8-sig'))
    file_names = {}
    for module in modules:
        for file in sorted((game / module / 'graphics/icons').rglob('*.png')):
            if 'barreling' not in file.parts and 'parameter' not in file.parts: file_names.setdefault(file.stem, file)

    def copy(file):
        relative = Path('game') / file.relative_to(game)
        destination = icon_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or destination.read_bytes() != file.read_bytes(): shutil.copyfile(file, destination)
        return relative.as_posix()

    def composite(layers, name):
        defs, images = [], []
        for index, layer in enumerate(layers):
            file = asset(layer.get('icon'))
            if not file: continue
            raw = file.read_bytes()
            width, height = struct.unpack('>II', raw[16:24])
            size = layer.get('icon_size') or 64
            scale = layer.get('scale') or 32 / size
            # Factorio icons are composed on a 32-unit canvas; output is 64 pixels.
            out_size = size * scale * 2
            shift = layer.get('shift') or {}
            x = (64 - out_size) / 2 + (shift.get(1) or shift.get('x') or 0) * 2
            y = (64 - out_size) / 2 + (shift.get(2) or shift.get('y') or 0) * 2
            tint, effect = layer.get('tint'), ''
            if tint:
                channels = [tint.get(key, tint.get(n, 1)) for n, key in enumerate(['r','g','b','a'], 1)]
                if max(channels[:3]) > 1: channels[:3] = [v / 255 for v in channels[:3]]
                if channels[3] > 1: channels[3] /= 255
                r,g,b,a = channels
                defs.append(f'<filter id="t{index}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="{r} 0 0 0 0 0 {g} 0 0 0 0 0 {b} 0 0 0 0 0 {a} 0"/></filter>')
                effect = f' filter="url(#t{index})"'
            encoded = base64.b64encode(raw).decode('ascii')
            images.append(f'<svg x="{x}" y="{y}" width="{out_size}" height="{out_size}" viewBox="0 0 {size} {size}" overflow="hidden"><image width="{width}" height="{height}" href="data:image/png;base64,{encoded}"{effect}/></svg>')
        if not images: return None
        content = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs>' + ''.join(defs) + '</defs>' + ''.join(images) + '</svg>'
        relative = f'generated/{name}.svg'
        file = icon_root / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding='utf-8')
        return relative

    def kind(prototype):
        return 'item' if prototype['type'] in ITEM_TYPES else prototype['type'] if prototype['type'] in ['fluid','recipe','technology'] else 'entity'

    for (_, name), prototype in prototypes.items():
        category = kind(prototype)
        text = resolve(prototype.get('localised_name') or {1: {'item':'item-name','fluid':'fluid-name','recipe':'recipe-name','technology':'technology-name','entity':'entity-name'}[category] + '.' + name})
        if text:
            strings[f'prototype.{category}.{name}'] = text
            strings.setdefault('prototype.' + name, text)
        layers = prototype.get('icons')
        icon = composite([v for _, v in sorted(layers.items(), key=lambda kv:str(kv[0])) if isinstance(v,dict)], category+'-'+name) if isinstance(layers,dict) else None
        file = asset(prototype.get('icon')) or file_names.get(name)
        if not icon and file: icon = copy(file)
        if icon:
            catalog[f'{category}|{name}'] = icon
            if category == 'technology': tech[name] = icon
            else: catalog.setdefault('item|' + name, icon)

    # Recipes without explicit icons inherit the main result's icon.
    for (_, name), prototype in prototypes.items():
        if prototype['type'] != 'recipe' or 'recipe|' + name in catalog: continue
        results = prototype.get('results') or {}
        result = next((v for v in results.values() if isinstance(v,dict) and isinstance(v.get('name'),str)), {})
        main = prototype.get('main_product') or result.get('name') or name
        inherited = catalog.get('item|' + main) or catalog.get('fluid|' + main)
        if inherited: catalog['recipe|' + name] = inherited; catalog.setdefault('item|' + name, inherited)

    barrels = []
    base = '__base__/graphics/icons/fluid/barreling/'
    for (category, name), fluid in prototypes.items():
        if category != 'fluid' or fluid.get('auto_barrel') is False: continue
        text = resolve(fluid.get('localised_name') or {1:'fluid-name.' + name})
        if not text: continue
        barrel = name + '-barrel'
        for recipe, template in [(False,'item-name.filled-barrel'), (True,'recipe-name.fill-barrel')]:
            label = resolve({1:template, 2:{1:'fluid-name.' + name}})
            if label: strings[f'prototype.{"recipe" if recipe else "item"}.{barrel}'] = label; strings.setdefault('prototype.' + barrel, label)
        empty = 'empty-' + barrel
        label = resolve({1:'recipe-name.empty-filled-barrel', 2:{1:'fluid-name.' + name}})
        if label: strings['prototype.recipe.' + empty] = label; strings.setdefault('prototype.' + empty, label)
        def tinted(color):
            values = dict(color or {}); values['a'] = .75; return values
        for prefix, initial, side, top, shift in [('', 'empty-barrel.png', 'barrel-side-mask.png', 'barrel-hoop-top-mask.png', None), ('fill-', 'barrel-fill.png', 'barrel-fill-side-mask.png', 'barrel-fill-top-mask.png', {1:-8,2:-8}), ('empty-', 'barrel-empty.png', 'barrel-empty-side-mask.png', 'barrel-empty-top-mask.png', {1:7,2:8})]:
            layers = [{'icon':base+initial}, {'icon':base+side,'tint':tinted(fluid.get('base_color'))}, {'icon':base+top,'tint':tinted(fluid.get('flow_color'))}]
            if shift and fluid.get('icon'): layers.append({'icon':fluid['icon'],'icon_size':fluid.get('icon_size',64),'scale':16/fluid.get('icon_size',64),'shift':shift})
            icon = composite(layers, prefix+barrel)
            if prefix == '': catalog['item|' + barrel] = icon
            elif prefix == 'fill-': catalog['recipe|' + barrel] = icon
            else: catalog['recipe|' + empty] = icon; catalog['item|' + empty] = icon
        barrels.append(barrel)

    for name, file in file_names.items():
        if 'prototype.' + name in strings and 'item|' + name not in catalog: catalog['item|' + name] = copy(file)
    for file, value in [(locale_path,strings),(catalog_path,catalog),(tech_path,tech)]:
        file.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return dict(prototypes=len(prototypes),names=sum(k.startswith('prototype.') for k in strings),icons=len(catalog),technology_icons=len(tech),barrels=barrels)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--game-data',type=Path,default=Path('D:/SteamLibrary/steamapps/common/Factorio/data'))
    parser.add_argument('--web',type=Path,default=Path(__file__).resolve().parents[1]/'src/Factorio.Desktop/Web')
    args=parser.parse_args()
    print(json.dumps(import_catalog(args.game_data,args.web),ensure_ascii=False))
