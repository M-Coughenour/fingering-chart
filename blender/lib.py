# Geometry and material helpers for building instrument models in Blender.
#
# Models are built in metres with Blender's axes: +X toward the bell / front, +Z up, +Y the
# player's left. glTF export turns +Z into +Y, so the app sees them upright.
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- materials


def _principled(name, color, metallic=0.0, roughness=0.5, coat=0.0, coat_roughness=0.03,
                thin_film=0.0, texture=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    if texture:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = texture
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    if thin_film and 'Thin Film Thickness' in bsdf.inputs:
        bsdf.inputs['Thin Film Thickness'].default_value = thin_film
    return mat


def materials():
    return {
        # Clear-lacquered yellow brass.
        'brass': _principled('Brass', (0.95, 0.70, 0.32), metallic=1, roughness=0.13, coat=0.6),
        # Nickel silver: slide sleeves, ferrules, water key.
        'nickel': _principled('NickelSilver', (0.86, 0.86, 0.84), metallic=1, roughness=0.2),
        # Silver plate: mouthpiece.
        'silver': _principled('Silver', (0.96, 0.96, 0.97), metallic=1, roughness=0.07),
        # Mother-of-pearl finger buttons.
        'pearl': _principled('Pearl', (0.95, 0.93, 0.88), roughness=0.15, coat=1, thin_film=350),
        'felt': _principled('Felt', (0.45, 0.04, 0.05), roughness=0.95),
        'cork': _principled('Cork', (0.62, 0.45, 0.29), roughness=0.9),
        # Woodwind bodies: grenadilla (clarinet, oboe) and flamed maple (bassoon).
        'blackwood': _principled('Grenadilla', (1, 1, 1), roughness=0.3, coat=0.5, coat_roughness=0.15,
                                 texture=wood_image('grenadilla', (0.075, 0.055, 0.048), (0.012, 0.009, 0.008))),
        'maple': _principled('Maple', (1, 1, 1), roughness=0.28, coat=0.8, coat_roughness=0.08,
                             texture=wood_image('maple', (0.42, 0.12, 0.04), (0.16, 0.035, 0.01), flame=True)),
        'ebonite': _principled('Ebonite', (0.015, 0.015, 0.017), roughness=0.2, coat=0.6),
        'pad': _principled('Pad', (0.62, 0.48, 0.32), roughness=0.7),
        'hole': _principled('ToneHole', (0.01, 0.008, 0.007), roughness=0.9),
        'reed': _principled('Reed', (0.55, 0.37, 0.13), roughness=0.6),
        'thread': _principled('Thread', (0.1, 0.32, 0.18), roughness=0.8),
        'leather': _principled('Leather', (0.22, 0.12, 0.06), roughness=0.6),
        'rubber': _principled('Rubber', (0.03, 0.03, 0.03), roughness=0.7),
        'gold': _principled('GoldLacquer', (1.0, 0.76, 0.36), metallic=1, roughness=0.18, coat=0.4),
    }


def wood_image(name, base, dark, flame=False, w=256, h=512):
    """Generate a tiling grain texture: streaks along V (the body's length), plus a faint
    cross-grain shimmer for flamed maple. Packed into the .glb on export."""
    import random
    rnd = random.Random(name)
    cols = [0.0] * w
    for _ in range(90):
        c, width, amt = rnd.uniform(0, w), rnd.uniform(0.6, 4), rnd.uniform(0.15, 0.7)
        for x in range(w):
            d = min(abs(x - c), w - abs(x - c))
            if d < width * 3:
                cols[x] += amt * math.exp(-(d / width) ** 2)
    rows = [0.0] * h
    if flame:
        for y in range(h):
            rows[y] = 0.18 * math.sin(y / h * math.pi * 2 * 14 + 2 * math.sin(y / h * math.pi * 6))
    px = []
    for y in range(h):
        wob = int(3 * math.sin(y / h * math.pi * 2 * 2))
        for x in range(w):
            t = min(1.0, cols[(x + wob) % w] * 0.8)
            t = max(0.0, min(1.0, t + rows[y] * (0.5 + 0.5 * math.sin(x * 0.05))))
            px += [base[i] * (1 - t) + dark[i] * t for i in range(3)] + [1.0]
    img = bpy.data.images.new(name, w, h)
    img.pixels.foreach_set(px)
    img.file_format = 'PNG'
    img.pack()
    return img


# ---------------------------------------------------------------- parts


class Part:
    """One exported object (one glTF node). Geometry is added in world space; the object
    origin is placed at `origin` so pressed parts scale and move about a sensible point."""

    def __init__(self, name, origin=(0, 0, 0), parent=None, key=None, extras=None):
        self.name = name
        self.origin = Vector(origin)
        self.parent = parent
        # Fingering key this part shows: {'id', 'press': Vector (Blender axes), 'travel', ...}
        self.key = key
        self.extras = extras or {}
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []

    def transform(self, matrix):
        """Move everything built so far (and the origin / press direction) by `matrix`."""
        bmesh.ops.transform(self.bm, matrix=matrix, verts=self.bm.verts)
        self.origin = matrix @ self.origin
        if self.key:
            if 'press' in self.key:
                self.key['press'] = (matrix.to_3x3() @ Vector(self.key['press'])).normalized()
            scale = matrix.to_scale().x
            for k in ('travel', 'positionStep'):
                if k in self.key:
                    self.key[k] *= scale

    def merge(self, other):
        """Append another part's geometry (built and transformed separately) into this one."""
        tmp = bpy.data.meshes.new('tmp')
        other.bm.to_mesh(tmp)
        other.bm.free()
        n0 = len(self.bm.faces)
        self.bm.from_mesh(tmp)
        self.bm.faces.ensure_lookup_table()
        remap = [self._slot(m) for m in other.mats]
        for f in self.bm.faces[n0:]:
            f.material_index = remap[f.material_index]
        bpy.data.meshes.remove(tmp)

    def _slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add_grid(self, rings, mat, closed=True, cap_start=False, cap_end=False):
        """Skin a list of vertex rings (each a list of Vectors, same length) into faces."""
        idx = self._slot(mat)
        bm = self.bm
        vrings = [[bm.verts.new(p) for p in ring] for ring in rings]
        n = len(rings[0])
        cols = n if closed else n - 1
        # V runs along the rings (10 cm per texture repeat), U once around.
        vs = [0.0]
        for a, b in zip(rings, rings[1:]):
            vs.append(vs[-1] + (a[0] - b[0]).length * 10)
        for i, (a, b) in enumerate(zip(vrings, vrings[1:])):
            for j in range(cols):
                k = (j + 1) % n
                f = bm.faces.new((a[j], a[k], b[k], b[j]))
                f.material_index = idx
                f.smooth = True
                for loop, (u, v) in zip(f.loops, ((j, vs[i]), (j + 1, vs[i]), (j + 1, vs[i + 1]), (j, vs[i + 1]))):
                    loop[self.uv].uv = (u / n, v)
        if cap_start:
            bm.faces.new(list(reversed(vrings[0]))).material_index = idx
        if cap_end:
            bm.faces.new(vrings[-1]).material_index = idx

    def build(self, collection, built=None):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        bmesh.ops.translate(self.bm, verts=self.bm.verts, vec=-self.origin)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.mats:
            mesh.materials.append(m)
        mesh.set_sharp_from_angle(angle=math.radians(50))
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = self.origin
        if self.parent:
            obj.parent = built[self.parent.name]
            obj.location = self.origin - self.parent.origin
        for k, v in self.extras.items():
            obj[k] = v
        collection.objects.link(obj)
        return obj


def transform_all(parts, matrix):
    for p in parts:
        p.transform(matrix)
    return parts


def parts_json(parts, size=3):
    """The app's <model>.parts.json: each keyed part, press direction in glTF axes."""
    keys = {}
    for p in parts:
        if not p.key:
            continue
        x, y, z = p.key.get('press', (0, 0, -1))
        spec = {'node': p.name, 'pressDir': [round(x, 4), round(z, 4), round(-y, 4)],
                'travel': round(p.key.get('travel', 0.004), 5)}
        if 'positionStep' in p.key:
            spec['positionStep'] = p.key['positionStep']
        keys[p.key['id']] = spec
    return {'transform': {'rotation': [0, 0, 0], 'size': size}, 'keys': keys}


# ---------------------------------------------------------------- paths


def fillet_path(points, bend, samples_per_rad=10):
    """Polyline through `points` with each corner rounded to a circular arc of radius `bend`
    (a number, or a list with one value per interior corner)."""
    pts = [Vector(p) for p in points]
    bends = bend if isinstance(bend, (list, tuple)) else [bend] * (len(pts) - 2)
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p, d1, d2 = pts[i], (pts[i] - pts[i - 1]).normalized(), (pts[i + 1] - pts[i]).normalized()
        phi = d1.angle(d2, 0)
        R = bends[i - 1]
        if phi < 1e-4 or R <= 0:
            out.append(p)
            continue
        t = R * math.tan(phi / 2)
        a = p - d1 * t
        n = (d2 - d1 * d1.dot(d2)).normalized()
        c = a + n * R
        steps = max(2, int(phi * samples_per_rad) + 1)
        for s in range(steps + 1):
            ang = phi * s / steps
            out.append(c + (-n * math.cos(ang) + d1 * math.sin(ang)) * R)
    out.append(pts[-1])
    # Drop duplicates so the tangents stay defined.
    clean = [out[0]]
    for q in out[1:]:
        if (q - clean[-1]).length > 1e-6:
            clean.append(q)
    return clean


def _resample(pts, max_step):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, math.ceil((b - a).length / max_step))
        out += [a.lerp(b, i / n) for i in range(1, n + 1)]
    return out


def tube(part, points, radius, mat, bend=0.012, segs=32, max_step=0.006, caps=False):
    """Sweep a circle along a filleted path. `radius` is a number, a (start, end) pair, or a
    function of the 0..1 distance along the path."""
    path = _resample(fillet_path(points, bend), max_step)
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    if callable(radius):
        rfun = radius
    elif isinstance(radius, (tuple, list)):
        rfun = lambda u: radius[0] + (radius[1] - radius[0]) * u
    else:
        rfun = lambda u: radius
    # Rotation-minimising frames (parallel transport).
    tangents = []
    for i in range(len(path)):
        a, b = path[max(i - 1, 0)], path[min(i + 1, len(path) - 1)]
        tangents.append((b - a).normalized())
    t0 = tangents[0]
    helper = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    normal = t0.cross(helper).normalized()
    rings = []
    for i, (p, t) in enumerate(zip(path, tangents)):
        if i:
            q = tangents[i - 1].rotation_difference(t)
            normal = (q @ normal).normalized()
        binormal = t.cross(normal)
        r = rfun(lengths[i] / total)
        rings.append([p + (normal * math.cos(2 * math.pi * j / segs) +
                           binormal * math.sin(2 * math.pi * j / segs)) * r for j in range(segs)])
    part.add_grid(rings, mat, cap_start=caps, cap_end=caps)
    return path


def lathe(part, profile, mat, matrix=Matrix(), segs=48, radial_fn=None):
    """Revolve a (radius, z) profile around the local Z axis, then transform by `matrix`.
    `radial_fn(j, segs)` can scale the radius per segment (knurling)."""
    rings = []
    for r, z in profile:
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            rr = r * (radial_fn(j, segs) if radial_fn else 1)
            ring.append(matrix @ Vector((rr * math.cos(a), rr * math.sin(a), z)))
        rings.append(ring)
    part.add_grid(rings, mat)


def axis_matrix(origin, direction):
    """Matrix that maps local +Z onto `direction`, placed at `origin`."""
    d = Vector(direction).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    return Matrix.Translation(Vector(origin)) @ rot


def cylinder(part, origin, direction, length, radius, mat, segs=32, bevel=0.0004, radial_fn=None):
    """Closed cylinder with slightly rounded edges, from `origin` along `direction`."""
    b = min(bevel, radius * 0.3, length * 0.3)
    prof = [(0, 0), (radius - b, 0), (radius - b * 0.3, b * 0.3), (radius, b),
            (radius, length - b), (radius - b * 0.3, length - b * 0.3), (radius - b, length),
            (0, length)]
    lathe(part, prof, mat, axis_matrix(origin, direction), segs, radial_fn)


def torus(part, center, axis, major, minor, mat, segs=48, minor_segs=12, arc=2 * math.pi):
    m = axis_matrix(center, axis)
    rings = []
    closed = arc >= 2 * math.pi - 1e-6
    count = segs if closed else segs + 1
    for i in range(count):
        a = arc * i / segs
        ca, sa = math.cos(a), math.sin(a)
        rings.append([m @ Vector(((major + minor * math.cos(2 * math.pi * j / minor_segs)) * ca,
                                  (major + minor * math.cos(2 * math.pi * j / minor_segs)) * sa,
                                  minor * math.sin(2 * math.pi * j / minor_segs)))
                      for j in range(minor_segs)])
    if closed:
        rings.append(rings[0])
    part.add_grid(rings, mat)


def knurl(count=60, depth=0.06):
    return lambda j, segs: 1 - depth * (j % 2)


def offset_profile(profile, thickness):
    """Inner wall of a (radius, z) shell profile, offset along the 2D normal."""
    out = []
    for i, (r, z) in enumerate(profile):
        a, b = profile[max(i - 1, 0)], profile[min(i + 1, len(profile) - 1)]
        dr, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dr, dz) or 1
        out.append((r - dz / L * thickness, z + dr / L * thickness))
    return out


# ---------------------------------------------------------------- scene / export


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene.collection


def export_glb(path, objects):
    for o in bpy.context.scene.objects:
        o.select_set(o in objects)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
        export_extras=True, export_image_format='AUTO',
    )


def render_preview(path, target, distance, direction=(0.45, -1.0, 0.35), res=(1000, 700)):
    """Studio render for checking the model: sky lighting, soft key light, Cycles."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.25
    scene.world = world

    key = bpy.data.lights.new('Key', 'AREA')
    key.energy = 120
    key.size = 1.2
    key_obj = bpy.data.objects.new('Key', key)
    key_obj.location = Vector(target) + Vector((0.6, -0.8, 1.0))
    key_obj.rotation_euler = (Vector(target) - key_obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(key_obj)
    fill = bpy.data.lights.new('Fill', 'AREA')
    fill.energy = 40
    fill.size = 2
    fill_obj = bpy.data.objects.new('Fill', fill)
    fill_obj.location = Vector(target) + Vector((-1.0, -0.4, 0.3))
    fill_obj.rotation_euler = (Vector(target) - fill_obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(fill_obj)

    cam = bpy.data.cameras.new('Cam')
    cam.lens = 70
    cam_obj = bpy.data.objects.new('Cam', cam)
    cam_obj.location = Vector(target) + Vector(direction).normalized() * distance
    cam_obj.rotation_euler = (Vector(target) - cam_obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
