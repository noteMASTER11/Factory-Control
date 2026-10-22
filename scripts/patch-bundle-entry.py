"""Set D: cache/TEMP paths before the .NET apphost extracts its native bundle.

Adds a small x64 entry stub to our own unsigned published apphost. It calls the
apphost's existing SetEnvironmentVariableW import, preserves volatile registers
and the original stack, then jumps to the original entry point. Bundle offsets,
ASLR and the managed payload stay intact. No launcher/child executable is added.
"""
from pathlib import Path
import argparse
import struct


def patch(path: Path):
    data = bytearray(path.read_bytes())
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if data[:2] != b'MZ' or data[pe:pe + 4] != b'PE\0\0':
        raise ValueError('Expected a Windows PE file')
    if struct.unpack_from('<H', data, pe + 4)[0] != 0x8664:
        raise ValueError('Only our Windows x64 apphost is supported')
    count = struct.unpack_from('<H', data, pe + 6)[0]
    optional = pe + 24
    if struct.unpack_from('<H', data, optional)[0] != 0x20b:
        raise ValueError('Expected PE32+')
    table = optional + struct.unpack_from('<H', data, pe + 20)[0]
    sections = []
    for i in range(count):
        pos = table + i * 40
        name, virtual_size, rva, size, raw = struct.unpack_from('<8sIIII', data, pos)
        if name.rstrip(b'\0') == b'.fcboot':
            raise ValueError('The apphost is already patched; publish a fresh EXE')
        sections.append((virtual_size, rva, size, raw))
    new_header = table + count * 40
    if new_header + 40 > min(s[3] for s in sections) or any(data[new_header:new_header + 40]):
        raise ValueError('No unused PE section header is available')
    if any(struct.unpack_from('<II', data, optional + 112 + 4 * 8)):
        raise ValueError('Patch before signing the apphost')

    def offset(rva):
        for virtual_size, start, size, raw in sections:
            if start <= rva < start + max(size, virtual_size):
                return raw + rva - start
        raise ValueError(f'RVA outside sections: {rva:x}')

    descriptor = offset(struct.unpack_from('<I', data, optional + 112 + 8)[0])
    environment_iat = None
    while any(data[descriptor:descriptor + 20]):
        lookup, _, _, _, iat = struct.unpack_from('<IIIII', data, descriptor)
        lookup = offset(lookup or iat)
        index = 0
        while (entry := struct.unpack_from('<Q', data, lookup + index * 8)[0]):
            if not entry & (1 << 63):
                symbol = offset(entry) + 2
                end = data.index(0, symbol)
                if data[symbol:end] == b'SetEnvironmentVariableW':
                    environment_iat = iat + index * 8
            index += 1
        descriptor += 20
    if environment_iat is None:
        raise ValueError('The supported apphost must import SetEnvironmentVariableW')

    align = lambda value, alignment: (value + alignment - 1) // alignment * alignment
    section_alignment, file_alignment = struct.unpack_from('<II', data, optional + 32)
    old_entry = struct.unpack_from('<I', data, optional + 16)[0]
    new_rva = align(struct.unpack_from('<I', data, optional + 56)[0], section_alignment)
    code = bytearray.fromhex('f30f1efa 50 51 52 4150 4151 4152 4153 4883ec20')
    strings, fixups = [], []
    for key, value in [
        ('DOTNET_BUNDLE_EXTRACT_BASE_DIR', r'D:\ChatGPT\Cache\FactorioMonitor\Bundle'),
        ('TEMP', r'D:\ChatGPT\Temp\FactorioMonitor'),
        ('TMP', r'D:\ChatGPT\Temp\FactorioMonitor'),
    ]:
        for opcode, text in [('488d0d', key), ('488d15', value)]:
            code.extend(bytes.fromhex(opcode))
            fixups.append((len(code), len(strings)))
            strings.append((text + '\0').encode('utf-16le'))
            code.extend(b'\0' * 4)
        code.extend(bytes.fromhex('ff15'))
        code.extend(struct.pack('<i', environment_iat - (new_rva + len(code) + 4)))
    code.extend(bytes.fromhex('4883c420 415b 415a 4159 4158 5a 59 58 e9'))
    code.extend(struct.pack('<i', old_entry - (new_rva + len(code) + 4)))
    positions = []
    for text in strings:
        positions.append(len(code))
        code.extend(text)
    for location, string_index in fixups:
        struct.pack_into('<i', code, location, positions[string_index] - (location + 4))
    # The Windows loader validates an entry point against the existing CFG table.
    # Preserve every original target and register our entry stub as an extra target.
    load_config_rva = struct.unpack_from('<I', data, optional + 112 + 10 * 8)[0]
    if load_config_rva:
        config = offset(load_config_rva)
        image_base = struct.unpack_from('<Q', data, optional + 24)[0]
        target_table, target_count = struct.unpack_from('<QQ', data, config + 128)
        flags = struct.unpack_from('<I', data, config + 144)[0]
        if target_table and target_count:
            stride = 4 + (flags >> 28)
            targets = offset(target_table - image_base)
            while len(code) % 4:
                code.append(0)
            target_rva = new_rva + len(code)
            code.extend(data[targets:targets + target_count * stride])
            code.extend(struct.pack('<I', new_rva) + b'\0' * (stride - 4))
            struct.pack_into('<QQ', data, config + 128, image_base + target_rva, target_count + 1)
    raw = align(len(data), file_alignment)
    raw_size = align(len(code), file_alignment)
    data.extend(b'\0' * (raw - len(data)))
    data.extend(code)
    data.extend(b'\0' * (raw_size - len(code)))
    struct.pack_into('<8sIIIIIIHHI', data, new_header, b'.fcboot\0', len(code), new_rva, raw_size, raw, 0, 0, 0, 0, 0x60000020)
    struct.pack_into('<H', data, pe + 6, count + 1)
    struct.pack_into('<I', data, optional + 16, new_rva)
    struct.pack_into('<I', data, optional + 56, align(new_rva + len(code), section_alignment))
    struct.pack_into('<I', data, optional + 64, 0)
    path.write_bytes(data)
    return {'file': str(path), 'bytes': len(data), 'entry_stub_bytes': len(code), 'extraction_root': r'D:\ChatGPT\Cache\FactorioMonitor\Bundle'}


if __name__ == '__main__':
    import json
    parser = argparse.ArgumentParser()
    parser.add_argument('executable', type=Path)
    print(json.dumps(patch(parser.parse_args().executable)))
