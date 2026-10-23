"""Package the approved RGBA master as a Windows multi-resolution icon.

Requires Pillow. Run explicitly when replacing the icon master; normal .NET
builds consume the checked-in ICO and need no Python/image dependencies.
"""
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parent.parent / 'src/Factorio.Desktop/Assets'
sizes = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
with Image.open(assets / 'factory-control-master.png') as source:
    image = source.convert('RGBA')
    if image.width != image.height or image.getextrema()[3][0] != 0:
        raise ValueError('Expected a square master with transparency')
    image.save(assets / 'factory-control.ico', format='ICO',
               sizes=[(size, size) for size in sizes])
with Image.open(assets / 'factory-control.ico') as icon:
    assert icon.ico.sizes() == {(size, size) for size in sizes}
print(f'Created {assets / "factory-control.ico"}: {", ".join(map(str, sizes))} px')
