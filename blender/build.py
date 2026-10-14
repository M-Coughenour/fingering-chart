# Build instrument models in Blender and export them for the app.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build.py -- trumpet tuba [--render]
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build.py -- all
#
# Writes models-src/blender/<model>.glb and public/models/<model>.parts.json; then run
#   npm run prepare-model -- models-src/blender/<model>.glb <model>
# --render also saves a Cycles preview to models-src/blender/<model>.png.
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import lib  # noqa: E402
import brass  # noqa: E402
import woodwinds  # noqa: E402

MODELS = {**brass.MODELS, **woodwinds.MODELS}

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
render = '--render' in args
names = [a for a in args if not a.startswith('--')]
if names == ['all']:
    names = list(MODELS)

OUT = os.path.join(ROOT, 'models-src', 'blender')
os.makedirs(OUT, exist_ok=True)

for model in names:
    collection = lib.reset_scene()
    parts = MODELS[model](lib.materials())
    built = {}
    for p in parts:  # parents come before their children in the list
        built[p.name] = p.build(collection, built)
    objects = list(built.values())
    lib.export_glb(os.path.join(OUT, f'{model}.glb'), objects)
    with open(os.path.join(ROOT, 'public', 'models', f'{model}.parts.json'), 'w') as f:
        json.dump(lib.parts_json(parts), f, indent=2)
        f.write('\n')
    if render:
        from mathutils import Vector
        corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
        lo = Vector([min(c[i] for c in corners) for i in range(3)])
        hi = Vector([max(c[i] for c in corners) for i in range(3)])
        size = hi - lo
        tall = size.z > max(size.x, size.y)
        lib.render_preview(os.path.join(OUT, f'{model}.png'), (lo + hi) / 2, max(size) * 2.6,
                           res=(560, 900) if tall else (1000, 640))
    print(f'built {model}')
