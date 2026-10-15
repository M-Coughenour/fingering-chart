# Woodwinds at real size (metres). Bodies stand along +Z; keys sit on the body at an angle
# around it: 0° faces the camera (-Y), positive angles turn toward +X (the player's left
# hand side as seen from the audience). The key layouts follow src/models/woodwinds.js:
# positions there are mapped onto the real body length and key sizes scaled to the bore.
import math
from mathutils import Matrix, Vector
from lib import Part, tube, lathe, cylinder, torus, axis_matrix, offset_profile, transform_all

DEG = math.pi / 180


def outward(angle):
    a = angle * DEG
    return Vector((math.sin(a), -math.cos(a), 0))


def box(part, center, size, mat, matrix=Matrix()):
    """Axis-aligned box (in `matrix`'s frame) as two capped rings."""
    sx, sy, sz = (s / 2 for s in size)
    c = Vector(center)
    rings = [[matrix @ (c + Vector((x, y, z))) for x, y in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy))]
             for z in (-sz, sz)]
    part.add_grid(rings, mat, cap_start=True, cap_end=True)


class Body:
    """A woodwind tube: `radius(z)`, plus the mapping from the JS layout's y to real z."""

    def __init__(self, part, radius, y_to_z, k, center=(0, 0), metal=None, key_lift=0.004, chimneys=False):
        self.part = part
        # How high key cups sit above the body (layout units, scaled by k), and whether the
        # big cups sit on raised tone-hole rims (saxophones).
        self.key_lift = key_lift
        self.chimneys = chimneys
        self.radius = radius
        self.y_to_z = y_to_z
        self.k = k
        self.center = Vector((*center, 0))
        self.metal = metal
        self.rods = []

    def surface(self, angle, z, lift=0.0):
        return self.center + outward(angle) * (self.radius(z) + lift) + Vector((0, 0, z))

    def frame(self, angle, z, lift=0.0):
        """Local frame on the surface: X along the circumference, Y up the body, Z outward."""
        out = outward(angle)
        side = Vector((0, 0, 1)).cross(out)
        rot = Matrix((side, Vector((0, 0, 1)), out)).transposed().to_4x4()
        return Matrix.Translation(self.surface(angle, z, lift)) @ rot


# ---------------------------------------------------------------- keys


def key_geometry(part, kind, s, m, M, metal):
    """Build one key in the local frame `m` (Z out of the body), size s ~ hole radius."""
    if kind == 'hole':
        torus(part, m @ Vector((0, 0, s * 0.22)), m.to_3x3() @ Vector((0, 0, 1)), s * 0.85, s * 0.11,
              metal, segs=40, minor_segs=8)
    elif kind in ('plate', 'flute'):
        lathe(part, [(0, s * 0.06), (s * 0.98, s * 0.06), (s * 0.98, s * 0.14)], M['pad'], m, segs=40)
        prof = [(s * 0.9, s * 0.1), (s * 1.06, s * 0.14), (s * 1.08, s * 0.3), (s * 1.0, s * 0.38),
                (s * 0.75, s * 0.42)]
        if kind == 'flute':
            prof += [(s * 0.44, s * 0.44), (s * 0.38, s * 0.47), (s * 0.34, s * 0.42)]
            lathe(part, [(s * 0.35, s * 0.36), (0, s * 0.36)], M['hole'], m, segs=32)
        else:
            prof += [(s * 0.4, s * 0.44), (0, s * 0.45)]
        lathe(part, prof, metal, m, segs=48)
    elif kind == 'pearl':
        lathe(part, [(0, s * 0.06), (s * 1.42, s * 0.06), (s * 1.42, s * 0.16)], M['pad'], m, segs=48)
        lathe(part, [(s * 1.35, s * 0.1), (s * 1.52, s * 0.14), (s * 1.55, s * 0.38), (s * 1.42, s * 0.48),
                     (s * 0.85, s * 0.52), (s * 0.85, s * 0.62), (s * 0.78, s * 0.64)], metal, m, segs=56)
        lathe(part, [(s * 0.78, s * 0.64), (s * 0.6, s * 0.75), (s * 0.3, s * 0.82), (0, s * 0.84)],
              M['pearl'], m, segs=40)
    elif kind == 'lever':
        # Rounded spatula, long along the body, on a short stem.
        sm = m @ Matrix.Diagonal((0.6, 1.7, 1, 1))
        lathe(part, [(0, s * 0.3), (s * 0.85, s * 0.3), (s, s * 0.42), (s * 0.95, s * 0.56),
                     (s * 0.6, s * 0.62), (0, s * 0.63)], metal, sm, segs=32)
        cylinder(part, m @ Vector((0, 0, -s * 0.1)), m.to_3x3() @ Vector((0, 0, 1)), s * 0.42, s * 0.14,
                 metal, segs=12)
    else:  # 'small' round touch on a stem
        lathe(part, [(0, s * 0.45), (s * 0.9, s * 0.45), (s, s * 0.55), (s * 0.9, s * 0.78), (0, s * 0.8)],
              metal, m, segs=32)
        cylinder(part, m @ Vector((0, 0, -s * 0.1)), m.to_3x3() @ Vector((0, 0, 1)), s * 0.6, s * 0.18,
                 metal, segs=12)


# How far each cup reaches from its centre, in units of the key size (see key_geometry).
KEY_REACH = {'hole': 0.96, 'plate': 1.08, 'flute': 1.08, 'pearl': 1.55}


def place_key(body, M, spec, closed=False):
    """A key from a JS-layout spec. Pressable keys become their own Part; decorative cups
    (closed=True) go into the body."""
    kind = spec.get('kind', 'hole')
    s = spec.get('size', 0.03) * body.k
    z = body.y_to_z(spec['y'])
    angle = spec.get('angle', 0)
    lift = spec.get('lift', body.key_lift) * body.k
    # A pressed key moves in by `travel`; keep that inside the gap so it never sinks into the body.
    travel = min(0.0035, s * 0.35, lift * 0.8)
    m = body.frame(angle, z, lift)
    if kind == 'hole':
        # Open tone hole in the body under the ring.
        hm = body.frame(angle, z, 0)
        cylinder(body.part, hm @ Vector((0, 0, -0.004)), hm.to_3x3() @ Vector((0, 0, 1)), 0.0042,
                 s * 0.6, M['hole'], segs=28)
    key_id = spec.get('id')
    part = body.part if closed or not key_id else Part(
        key_id, origin=m @ Vector((0, 0, 0)),
        key={'id': key_id, 'press': -outward(angle), 'travel': travel})
    if body.chimneys and kind in ('pearl', 'plate'):
        # Raised tone-hole rim: the pad lands on it when the key is pressed.
        rim = body.surface(angle, z, -0.001)
        cylinder(body.part, rim, outward(angle), lift - travel + 0.001 - 0.0002, s * 1.15, body.metal, segs=40)
    key_geometry(part, kind, s, m, M, body.metal)
    # Arm back to the nearest rod alongside, if one runs past this height.
    near = [r for r in body.rods if r['z0'] - 0.01 <= z <= r['z1'] + 0.01 and 4 < abs(r['angle'] - angle) < 75]
    if near:
        rod = min(near, key=lambda r: abs(r['angle'] - angle))
        a = m @ Vector((0, 0, s * 0.3))
        b = body.surface(rod['angle'], z, rod['offset'])
        tube(part, [a, b], max(0.0007, s * 0.1), body.metal, segs=10, caps=True)
    elif kind in ('lever', 'small'):
        # No rod alongside: run the key's stem down into the body.
        cylinder(part, body.surface(angle, z, -0.001), outward(angle), lift + 0.001, s * 0.14, body.metal, segs=12)
    else:
        # No rod alongside: a post beside the cup holds its arm.
        hz = z + s * (KEY_REACH[kind] + 0.35)
        r = max(0.0008, s * 0.12)
        base = body.surface(angle, hz, -0.001)
        top = body.surface(angle, hz, lift + s * 0.3)
        cylinder(body.part, base, top - base, (top - base).length, r, body.metal, segs=12)
        tube(part, [top, m @ Vector((0, 0, s * 0.3))], r * 0.8, body.metal, segs=10, caps=True)
    return part


def rod(body, angle, y0, y1, offset=0.012):
    """Key rod along the body with pillar posts at the ends and middle."""
    k = body.k
    z0, z1 = sorted((body.y_to_z(y0), body.y_to_z(y1)))
    off = offset * k
    r = max(0.0011, 0.0032 * k)
    body.rods.append({'angle': angle, 'z0': z0, 'z1': z1, 'offset': off})
    pts = [body.surface(angle, z0 + (z1 - z0) * i / 12, off) for i in range(13)]
    tube(body.part, pts, r, body.metal, segs=12, caps=True, bend=0.001)
    for z in (z0, (z0 + z1) / 2, z1):
        base = body.surface(angle, z, 0)
        top = body.surface(angle, z, off)
        d = (top - base).normalized()
        cylinder(body.part, base - d * 0.001, d, (top - base).length + 0.001, r * 1.25, body.metal, segs=12)
        lathe(body.part, [(r * 2.2, 0), (r * 1.4, r * 0.6), (r * 1.25, r * 1.3)], body.metal,
              axis_matrix(base, d), segs=16)
        lathe(body.part, [(0, -r * 1.6), (r * 1.4, -r * 1.2), (r * 1.75, 0), (r * 1.4, r * 1.2), (0, r * 1.6)],
              body.metal, axis_matrix(top, d), segs=16)


def keywork(body, M, keys, rods, cups=(), cup_kind='plate'):
    """Rods first (keys reach toward them), then the playable keys and decorative cups."""
    for r in rods:
        rod(body, *r)
    parts = [place_key(body, M, spec) for spec in keys if spec.get('id')]
    for y, angle, size in cups:
        place_key(body, M, {'y': y, 'angle': angle, 'size': size, 'kind': cup_kind}, closed=True)
    return [p for p in parts if p is not body.part]


# ---------------------------------------------------------------- mouthpieces / reeds


def _spow(v, e):
    """Signed power: shapes a circle into a squarish superellipse."""
    return math.copysign(abs(v) ** e, v)


def _smooth(a, b, u):
    t = max(0.0, min(1.0, (u - a) / (b - a)))
    return t * t * (3 - 2 * t)


def single_reed_mouthpiece(part, M, base, direction, r, length, reed_side):
    """Hard-rubber mouthpiece with a flat table the reed lies on, a beak sloping to a thin
    tip, the reed, and a two-screw metal ligature clamping the reed to the table.
    `reed_side` is the direction (perpendicular to `direction`) the reed faces."""
    d = Vector(direction).normalized()
    side = Vector(reed_side)
    side = (side - d * side.dot(d)).normalized()
    x = d.cross(side)
    # Local frame: X across the reed, Y out through the reed, Z along the mouthpiece.
    m = Matrix.Translation(base) @ Matrix((x, side, d)).transposed().to_4x4()
    L = length
    T = 0.78 * r          # table height above the axis
    reed_hw = 0.6 * r     # half the reed's width
    heel, n = 0.12, 48

    def reed_th(u):
        """Reed thickness: thick heel (vamp starts at mid-length), paper-thin tip."""
        t = max(0.0, (u - heel) / (1 - heel))
        return r * (0.025 + 0.2 * (1 - _smooth(0.35, 1.0, t)))

    def section(u, top=None, grow=0.0):
        """Cross-section ring at u = z / L: round at the shank, then a flat table on top
        (+Y) and a rounded beak below that rises to meet the table at the tip."""
        blend = _smooth(0.1, 0.3, u)
        drop = 0.06 * r * max(0.0, (u - 0.78) / 0.22) ** 2   # facing curve: table falls away at the tip
        t_top = (T - drop) if top is None else top
        yb = -r + (r + T - drop - 0.13 * r) * max(0.0, (u - 0.45) / 0.55) ** 1.25
        w = r - 0.38 * r * max(0.0, (u - 0.4) / 0.6) ** 1.6
        if top is not None:
            w = max(w, reed_hw)
        yc, h = (t_top + yb) / 2, (t_top - yb) / 2
        ring = []
        for j in range(n):
            a = 2 * math.pi * j / n
            c, sn = math.cos(a), math.sin(a)
            e = 1 / 3 if sn >= 0 else 0.8   # squarish over the table, rounder under the beak
            sx, sy = w * _spow(c, e), yc + h * _spow(sn, e)
            px = r * c + (sx - r * c) * blend
            py = r * sn + (sy - r * sn) * blend
            ring.append(Vector((px + grow * c, py + grow * sn, u * L)))
        return ring

    # Mouthpiece body.
    us = [i / 40 for i in range(41)]
    part.add_grid([[m @ p for p in section(u)] for u in us], M['ebonite'], cap_start=True, cap_end=True)

    # Reed: flat on the table from the heel to the tip, its tip rounded.
    rings = []
    for i in range(25):
        u = heel + (1 - heel) * i / 24
        hw = reed_hw * (math.sqrt(max(0.0, 1 - ((u - 0.93) / 0.075) ** 2)) * 0.35 + 0.65 if u > 0.93 else 1)
        th = reed_th(u)
        rings.append([m @ Vector(p) for p in ((-hw, T, u * L), (hw, T, u * L), (hw, T + th, u * L), (-hw, T + th, u * L))])
    part.add_grid(rings, M['reed'], cap_start=True, cap_end=True)

    # Ligature: two bands hugging the mouthpiece and reed, joined by side straps, with
    # screw lugs and screws on the reed side.
    gap, thick = 0.0003, 0.0007
    for u0 in (0.24, 0.42):
        u1 = u0 + 0.07
        band = []
        for u in (u0, u0 + 0.004, u1 - 0.004, u1):
            g = gap + (thick if u in (u0 + 0.004, u1 - 0.004) else thick * 0.6)
            band.append([m @ p for p in section(u, top=T + reed_th(u) + gap, grow=g)])
        part.add_grid(band, M['nickel'])
        um = (u0 + u1) / 2
        top = T + reed_th(um) + gap + thick
        # Lugs either side of the reed and the screw through them, knurled head on +X.
        for sx in (-1, 1):
            box(part, (sx * reed_hw * 0.75, top + 0.12 * r, um * L), (0.16 * r, 0.24 * r, (u1 - u0) * L * 0.8),
                M['nickel'], m)
        cylinder(part, m @ Vector((-reed_hw * 1.25, top + 0.17 * r, um * L)), x, reed_hw * 2.6, 0.055 * r,
                 M['nickel'], segs=12)
        cylinder(part, m @ Vector((reed_hw * 1.25, top + 0.17 * r, um * L)), x, 0.09 * r, 0.16 * r,
                 M['nickel'], segs=24, radial_fn=lambda j, segs: 1 - 0.08 * (j % 2))
    for sx in (-1, 1):
        a = section(0.31)[0 if sx > 0 else n // 2]
        strap = [Vector((sx * (abs(a.x) + gap + thick * 0.5), a.y, 0.27 * L)),
                 Vector((sx * (abs(a.x) + gap + thick * 0.5), a.y, 0.45 * L))]
        tube(part, [m @ p for p in strap], 0.04 * r, M['nickel'], segs=8, caps=True)


def double_reed(part, M, base, direction, r):
    """Cork, wound thread and the two cane blades (oboe / bassoon reeds use different r)."""
    d = Vector(direction).normalized()
    m = axis_matrix(base, d)
    lathe(part, [(0, 0), (r * 0.55, 0), (r * 0.6, r * 1.2), (r * 0.52, r * 1.35)], M['cork'], m, segs=24)
    lathe(part, [(r * 0.5, r * 1.3), (r * 0.48, r * 2.6), (r * 0.36, r * 2.8)], M['thread'], m, segs=24)
    lathe(part, [(r * 0.34, r * 2.75), (r * 0.42, r * 3.6), (r * 0.5, r * 4.3), (r * 0.18, r * 4.45), (0, r * 4.45)],
          M['reed'], m @ Matrix.Diagonal((1, 0.32, 1, 1)), segs=24)


def ring_band(part, mat, center, z, r, width=0.004):
    cylinder(part, (center[0], center[1], z - width / 2), (0, 0, 1), width, r, mat, segs=48, bevel=0.0005)


# ---------------------------------------------------------------- clarinet family

CLARINET_KEYS = [
    {'id': 'register', 'y': 0.7, 'angle': 150, 'kind': 'lever', 'size': 0.018},
    {'id': 'thumb', 'y': 0.6, 'angle': 160, 'size': 0.02},
    {'id': 'aKey', 'y': 0.75, 'angle': 0, 'kind': 'lever', 'size': 0.017},
    {'id': 'gsKey', 'y': 0.66, 'angle': -40, 'kind': 'lever', 'size': 0.015},
    {'id': 'L1', 'y': 0.56, 'size': 0.021},
    {'id': 'sliver', 'y': 0.5, 'angle': 38, 'kind': 'lever', 'size': 0.012},
    {'id': 'L2', 'y': 0.44, 'size': 0.021},
    {'id': 'L3', 'y': 0.32, 'size': 0.021},
    {'id': 'LP_E', 'y': 0.24, 'angle': -48, 'kind': 'small', 'size': 0.014},
    {'id': 'LP_F', 'y': 0.19, 'angle': -48, 'kind': 'small', 'size': 0.014},
    {'id': 'LP_Fs', 'y': 0.14, 'angle': -48, 'kind': 'small', 'size': 0.014},
    {'id': 'LP_Gs', 'y': 0.09, 'angle': -48, 'kind': 'small', 'size': 0.014},
    {'id': 'LP_Cs', 'y': 0.04, 'angle': -48, 'kind': 'small', 'size': 0.014},
    {'id': 'side3', 'y': -0.02, 'angle': 70, 'kind': 'lever', 'size': 0.012},
    {'id': 'side4', 'y': -0.1, 'angle': 70, 'kind': 'lever', 'size': 0.012},
    {'id': 'R1', 'y': -0.08, 'size': 0.021},
    {'id': 'R2', 'y': -0.2, 'size': 0.021},
    {'id': 'RS_B', 'y': -0.21, 'angle': 36, 'kind': 'lever', 'size': 0.011},
    {'id': 'R3', 'y': -0.32, 'size': 0.021},
    {'id': 'RP_E', 'y': -0.42, 'angle': 42, 'kind': 'small', 'size': 0.014},
    {'id': 'RP_F', 'y': -0.47, 'angle': 42, 'kind': 'small', 'size': 0.014},
    {'id': 'RP_Fs', 'y': -0.52, 'angle': 42, 'kind': 'small', 'size': 0.014},
    {'id': 'RP_Gs', 'y': -0.57, 'angle': 42, 'kind': 'small', 'size': 0.014},
]
CLARINET_RODS = [(-28, 0.05, 0.72), (28, -0.62, -0.02), (-62, -0.55, 0.26), (62, -0.15, 0.55)]
CLARINET_CUPS = [(0.62, 55, 0.014), (0.68, 30, 0.013), (-0.62, -40, 0.02), (-0.68, -20, 0.022), (-0.74, 20, 0.022)]


def clarinet(M):
    part = Part('Body')
    R, Rs = 0.0145, 0.0165   # joint / socket radius
    z_bell, z_low, z_up, z_bar, z_mp = 0.115, 0.335, 0.555, 0.62, 0.71

    # Grenadilla profile: bell (with inner flare), lower joint, upper joint, barrel.
    inner = [(0.0075, 0.06), (0.009, 0.035), (0.016, 0.012), (0.027, 0.002)]
    outer = [(0.0315, 0.0), (0.033, 0.003), (0.032, 0.008), (0.026, 0.03), (0.0205, 0.06),
             (0.0175, 0.09), (Rs, 0.105), (Rs, z_bell + 0.015), (R, z_bell + 0.018),
             (R, z_low - 0.022), (Rs, z_low - 0.02), (Rs, z_low + 0.004), (R, z_low + 0.006),
             (R, z_up - 0.02), (Rs, z_up - 0.018), (Rs, z_up), (0.0168, z_up + 0.03), (0.0162, z_bar),
             (0.008, z_bar)]
    lathe(part, inner + outer, M['blackwood'], segs=64)
    for z, r in ((z_bell + 0.012, Rs + 0.0006), (z_low - 0.018, Rs + 0.0006), (z_low + 0.002, Rs + 0.0004),
                 (z_up - 0.016, Rs + 0.0006), (z_up + 0.002, 0.0168), (z_bar - 0.002, 0.0166)):
        ring_band(part, M['nickel'], (0, 0), z, r, 0.0035)
    single_reed_mouthpiece(part, M, Vector((0, 0, z_bar)), (0, 0, 1), 0.0128, z_mp - z_bar + 0.002, (0, 1, 0))

    body = Body(part, lambda z: R, lambda y: z_bell + (y + 0.8) * 0.275, 0.33, metal=M['nickel'])
    keys = keywork(body, M, CLARINET_KEYS, CLARINET_RODS, CLARINET_CUPS)
    # Thumb rest on the back of the lower joint.
    tm = body.frame(180, body.y_to_z(-0.1), 0.003)
    box(part, (0, 0, 0), (0.012, 0.016, 0.006), M['nickel'], tm)
    return [part] + keys


def bass_clarinet(M):
    part = Part('Body')
    R = 0.0225
    z0, z1 = 0.30, 1.10
    S = M['silver']
    lathe(part, [(0.013, z0 - 0.002), (R + 0.002, z0), (R + 0.002, z0 + 0.03), (R, z0 + 0.034),
                 (R, (z0 + z1) / 2 - 0.015), (R + 0.002, (z0 + z1) / 2 - 0.012), (R + 0.002, (z0 + z1) / 2 + 0.012),
                 (R, (z0 + z1) / 2 + 0.015), (R, z1 - 0.03), (R + 0.002, z1 - 0.026), (R + 0.002, z1), (0.012, z1)],
          M['blackwood'], segs=64)
    for z in (z0 + 0.002, (z0 + z1) / 2, z1 - 0.002):
        ring_band(part, M['nickel'], (0, 0), z, R + 0.0026, 0.005)
    # Upturned metal bell: down from the body, round a U, up and slightly forward.
    tube(part, [(0, 0, z0 + 0.01), (0, 0, 0.15), (0, -0.1, 0.15), (0, -0.115, 0.18)], (R * 0.95, R * 1.15), S,
         bend=[0.05, 0.03], segs=48)
    from brass import add_bell
    add_bell(part, S, (0, -0.115, 0.18), (0, -0.55, 1), 0.24, R * 1.15, 0.068, gamma=1.3, segs=96)
    # Neck curving back to the player, mouthpiece on the end.
    neck = [(0, 0, z1 - 0.01), (0, 0, 1.2), (0, 0.06, 1.27), (0, 0.13, 1.29)]
    tube(part, neck, (0.0105, 0.0085), S, bend=[0.06, 0.05], segs=40)
    d = Vector((0, 1, -0.25)).normalized()
    single_reed_mouthpiece(part, M, Vector((0, 0.128, 1.29)), d, 0.0115, 0.1, (0, 0.3, -1))
    # Floor peg.
    cylinder(part, (0, -0.055, 0.0), (0, 0, 1), 0.13, 0.004, M['nickel'], segs=16)

    body = Body(part, lambda z: R, lambda y: z0 + (y + 0.85) * 0.47, 0.31, metal=M['nickel'])
    specs = [{**k, 'size': k['size'] * 1.4, 'kind': k.get('kind', 'plate')} for k in CLARINET_KEYS]
    specs.append({'id': 'lowEb', 'y': -0.66, 'angle': -40, 'kind': 'lever', 'size': 0.02})
    keys = keywork(body, M, specs, CLARINET_RODS, CLARINET_CUPS)
    return [part] + keys


# ---------------------------------------------------------------- oboe


def oboe(M):
    part = Part('Body')
    top, bottom = 0.585, 0.085
    r_top, r_bot = 0.0115, 0.0175

    def radius(z):
        return r_top + (top - z) / (top - bottom) * (r_bot - r_top)

    # Bell with the oboe's inward-turned lip, then the conical body with joint sockets.
    prof = [(0.007, 0.03), (0.016, 0.006), (0.024, 0.0), (0.0265, 0.004), (0.0262, 0.012),
            (0.0235, 0.035), (0.02, 0.065), (r_bot + 0.002, bottom - 0.005), (r_bot + 0.002, bottom + 0.004),
            (radius(bottom + 0.006), bottom + 0.006), (radius(0.33), 0.33), (radius(0.33) + 0.0018, 0.332),
            (radius(0.35) + 0.0018, 0.35), (radius(0.352), 0.352), (r_top, top - 0.012),
            (r_top + 0.0015, top - 0.01), (r_top + 0.0015, top), (0.003, top)]
    lathe(part, prof, M['blackwood'], segs=64)
    for z in (bottom, 0.333, 0.349, top - 0.008):
        ring_band(part, M['nickel'], (0, 0), z, radius(z) + 0.0022, 0.0028)
    double_reed(part, M, Vector((0, 0, top)), (0, 0, 1), 0.0075)

    body = Body(part, radius, lambda y: bottom + (y + 0.75) / 3, 0.44, metal=M['nickel'])
    keys = keywork(body, M, [
        {'id': 'oct1', 'y': 0.64, 'angle': 150, 'kind': 'lever', 'size': 0.016},
        {'id': 'oct2', 'y': 0.62, 'angle': 45, 'kind': 'lever', 'size': 0.013},
        {'id': 'L1', 'y': 0.54, 'kind': 'plate', 'size': 0.017},
        {'id': 'L2', 'y': 0.43, 'kind': 'plate', 'size': 0.017},
        {'id': 'L3', 'y': 0.32, 'kind': 'plate', 'size': 0.017},
        {'id': 'LP_Gs', 'y': 0.24, 'angle': -48, 'kind': 'small', 'size': 0.013},
        {'id': 'LP_B', 'y': 0.19, 'angle': -48, 'kind': 'small', 'size': 0.013},
        {'id': 'LP_Bb', 'y': 0.14, 'angle': -48, 'kind': 'small', 'size': 0.013},
        {'id': 'LP_Eb', 'y': 0.09, 'angle': -48, 'kind': 'small', 'size': 0.013},
        {'id': 'R1', 'y': -0.08, 'kind': 'plate', 'size': 0.018},
        {'id': 'R2', 'y': -0.19, 'kind': 'plate', 'size': 0.018},
        {'id': 'R_F', 'y': -0.25, 'angle': 40, 'kind': 'lever', 'size': 0.011},
        {'id': 'R3', 'y': -0.3, 'kind': 'plate', 'size': 0.018},
        {'id': 'RP_C', 'y': -0.42, 'angle': 42, 'kind': 'small', 'size': 0.013},
        {'id': 'RP_Cs', 'y': -0.47, 'angle': 42, 'kind': 'small', 'size': 0.013},
        {'id': 'RP_Eb', 'y': -0.52, 'angle': 42, 'kind': 'small', 'size': 0.013},
    ], [(-30, -0.6, 0.7), (30, -0.65, 0.6), (-65, -0.4, 0.3), (65, -0.55, 0.1)],
        [(0.68, 20, 0.011), (0.48, -35, 0.011), (0.37, 35, 0.011), (0.02, -25, 0.014), (-0.36, -30, 0.015),
         (-0.58, 25, 0.017), (-0.64, -20, 0.018), (-0.7, 10, 0.018)])
    tm = body.frame(180, body.y_to_z(-0.1), 0.003)
    box(part, (0, 0, 0), (0.011, 0.015, 0.006), M['nickel'], tm)
    return [part] + keys


# ---------------------------------------------------------------- flute


def flute(M):
    part = Part('Body')
    S = M['silver']
    R = 0.0095
    L = 0.67
    to_z = lambda y: (y + 0.975) * 0.337
    lathe(part, [(0.0075, 0.0), (R, 0.0005), (R, L - 0.03), (0.0075, L - 0.03)], S, segs=56)
    # Joint sockets (body/foot, head/body) and the crown.
    for z in (to_z(-0.645), to_z(0.525)):
        cylinder(part, (0, 0, z - 0.012), (0, 0, 1), 0.024, R + 0.0008, S, segs=56, bevel=0.0006)
        torus(part, (0, 0, z + 0.012), (0, 0, 1), R + 0.0008, 0.0005, S, segs=56, minor_segs=8)
    lathe(part, [(0, L - 0.03), (R + 0.0012, L - 0.03), (R + 0.0014, L - 0.022), (R + 0.0012, L - 0.012),
                 (R * 0.95, L - 0.008), (R * 0.75, L - 0.002), (R * 0.3, L), (0, L)], S, segs=56)
    # Lip plate: a curved plate on the front with the oval embouchure hole and riser.
    ze = to_z(0.86)
    rings = []
    for i in range(13):
        t = i / 12
        zz = ze - 0.014 + t * 0.028
        w = 1 - (2 * t - 1) ** 4
        ring = []
        for j in range(17):
            a = (-50 + 100 * j / 16) * w * DEG
            ring.append(Vector((math.sin(a) * (R + 0.0009), -math.cos(a) * (R + 0.0009) - 0.0004 * w, zz)))
        rings.append(ring)
    part.add_grid(rings, S, closed=False)
    riser = Matrix.Translation((0, -R - 0.0009, ze)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1, 1.3, 1, 1))
    lathe(part, [(0.0052, 0.0028), (0.006, 0.0018), (0.0062, 0.0), (0.0054, -0.0002)], S, riser, segs=40)
    lathe(part, [(0.0052, 0.0028), (0.0048, -0.002), (0, -0.0022)], M['hole'], riser, segs=40)

    body = Body(part, lambda z: R, to_z, 0.365, metal=S)
    keys = keywork(body, M, [
        {'id': 'thumbBb', 'y': 0.42, 'angle': 155, 'kind': 'small', 'size': 0.013},
        {'id': 'thumbB', 'y': 0.36, 'angle': 155, 'kind': 'lever', 'size': 0.015},
        {'id': 'L1', 'y': 0.36, 'kind': 'flute', 'size': 0.022},
        {'id': 'L2', 'y': 0.24, 'kind': 'flute', 'size': 0.022},
        {'id': 'L3', 'y': 0.12, 'kind': 'flute', 'size': 0.022},
        {'id': 'LP_Gs', 'y': 0.03, 'angle': -50, 'kind': 'lever', 'size': 0.013},
        {'id': 'R1', 'y': -0.2, 'kind': 'flute', 'size': 0.022},
        {'id': 'R2', 'y': -0.32, 'kind': 'flute', 'size': 0.022},
        {'id': 'R3', 'y': -0.44, 'kind': 'flute', 'size': 0.022},
        {'id': 'trillD', 'y': -0.26, 'angle': 32, 'kind': 'lever', 'size': 0.011},
        {'id': 'trillDs', 'y': -0.38, 'angle': 32, 'kind': 'lever', 'size': 0.011},
        {'id': 'RP_Eb', 'y': -0.55, 'angle': 45, 'kind': 'lever', 'size': 0.013},
        {'id': 'RP_Cs', 'y': -0.82, 'angle': 35, 'kind': 'lever', 'size': 0.013},
        {'id': 'RP_C', 'y': -0.9, 'angle': 35, 'kind': 'lever', 'size': 0.013},
    ], [(62, -0.52, 0.46, 0.016), (50, -0.95, -0.66, 0.014)],
        [(0.46, 20, 0.018), (0.3, 18, 0.018), (0.03, 20, 0.02), (-0.08, 25, 0.02), (-0.56, 15, 0.022),
         (-0.75, 20, 0.022), (-0.86, 10, 0.022), (-0.94, 18, 0.022)])
    # Lay it sideways: head joint to the viewer's right, keys still facing the camera.
    return transform_all([part] + keys, Matrix.Rotation(math.pi / 2, 4, 'Y'))


# ---------------------------------------------------------------- bassoon


def bassoon(M):
    part = Part('Body')
    W = M['maple']
    to_z = lambda y: (y + 0.9) * 0.58
    rA, rB = 0.0185, 0.0235
    bx, byy = rA + rB + 0.006, 0.012
    # Wing joint + boot bore (front, finger holes) and long joint + bell (back).
    za0, za1 = to_z(-0.8), to_z(0.7)
    lathe(part, [(0.006, za1), (rA * 0.85, za1), (rA * 0.85 + 0.002, za1 - 0.004), (rA * 0.9, za1 - 0.03),
                 (rA, za0 + 0.02), (rA, za0)], W, segs=48)
    zb0, zb1 = to_z(-0.8), to_z(1.3)
    lathe(part, [(rB, zb0), (rB, zb1 - 0.05), (rB * 1.06, zb1 - 0.03), (rB * 1.1, zb1), (rB * 0.7, zb1),
                 (rB * 0.7, zb1 - 0.02)], W, Matrix.Translation((bx, byy, 0)), segs=48)
    # Ivory-coloured ring on the bell and nickel joint rings.
    cylinder(part, (bx, byy, zb1 - 0.012), (0, 0, 1), 0.024, rB * 1.13, M['pearl'], segs=48, bevel=0.001)
    for z in (to_z(0.7) - 0.03, to_z(-0.25)):
        ring_band(part, M['nickel'], (0, 0), z, rA + 0.0015, 0.004)
    for z in (to_z(0.65), to_z(-0.25), zb1 - 0.03):
        ring_band(part, M['nickel'], (bx, byy), z, rB * 1.06 + 0.001, 0.004)
    # Boot joint: one oval block holding both bores, with a metal cap.
    oval = Matrix.Translation((bx / 2, byy / 2, 0)) @ Matrix.Diagonal((1.55, 1.0, 1, 1))
    lathe(part, [(0.0, to_z(-0.9) + 0.01), (0.03, to_z(-0.9) + 0.01), (0.032, to_z(-0.9) + 0.02),
                 (0.032, to_z(-0.68)), (0.029, to_z(-0.66)), (0.0, to_z(-0.66))], W, oval, segs=56)
    lathe(part, [(0, to_z(-0.9)), (0.031, to_z(-0.9)), (0.0325, to_z(-0.9) + 0.006), (0.0325, to_z(-0.9) + 0.012),
                 (0.031, to_z(-0.9) + 0.013)], M['nickel'], oval, segs=56)
    # Bocal: silver S-curve from the wing joint to the reed, with the whisper-key nub.
    bocal = [(0, 0, za1 - 0.01), (0, 0, za1 + 0.07), (-0.01, 0.04, za1 + 0.13), (-0.02, 0.15, za1 + 0.14)]
    tube(part, bocal, (0.0045, 0.0028), M['silver'], bend=[0.06, 0.05], segs=24)
    cylinder(part, (0, 0, za1 - 0.002), (0, 0, 1), 0.008, 0.0075, M['silver'], segs=32)  # tenon collar
    reed_dir = Vector((-0.05, 1, -0.1)).normalized()
    double_reed(part, M, Vector(bocal[-1]) - reed_dir * 0.006, reed_dir, 0.0085)
    # Hand rest (crutch) on the boot.
    tube(part, [(-0.006, -0.012, to_z(-0.45)), (-0.045, -0.04, to_z(-0.43))], 0.0022, M['nickel'], segs=12)
    lathe(part, [(0, -0.02), (0.012, -0.018), (0.014, 0.0), (0.012, 0.018), (0, 0.02)], M['ebonite'],
          axis_matrix((-0.05, -0.042, to_z(-0.43)), (0.3, -1, 0)) @ Matrix.Diagonal((1, 1.6, 0.6, 1)), segs=24)

    A = Body(part, lambda z: rA, to_z, 0.41, metal=M['nickel'])
    B = Body(part, lambda z: rB, to_z, 0.41, center=(bx, byy), metal=M['nickel'])
    for r in ((-40, -0.7, 0.1), (50, -0.75, -0.2)):
        rod(A, *r)
    for r in ((40, 0.35, 1.2, 0.014), (70, 0.4, 1.1, 0.012)):
        rod(B, *r)
    keys = keywork(A, M, [
        {'id': 'whisper', 'y': 0.5, 'angle': 95, 'kind': 'lever', 'size': 0.016},
        {'id': 'L1', 'y': 0.38, 'size': 0.018},
        {'id': 'L2', 'y': 0.26, 'size': 0.018},
        {'id': 'L3', 'y': 0.14, 'size': 0.018},
        {'id': 'LP_Eb', 'y': 0.04, 'angle': -50, 'kind': 'lever', 'size': 0.013},
        {'id': 'LP_Cs', 'y': -0.04, 'angle': -50, 'kind': 'lever', 'size': 0.013},
        {'id': 'RT_Bb', 'y': -0.22, 'angle': -95, 'kind': 'small', 'size': 0.014},
        {'id': 'RT_E', 'y': -0.3, 'angle': -95, 'kind': 'small', 'size': 0.016},
        {'id': 'RT_Fs', 'y': -0.38, 'angle': -95, 'kind': 'small', 'size': 0.014},
        {'id': 'R1', 'y': -0.3, 'size': 0.018},
        {'id': 'R2', 'y': -0.42, 'size': 0.018},
        {'id': 'R3', 'y': -0.54, 'size': 0.018},
        {'id': 'RP_F', 'y': -0.65, 'angle': 45, 'kind': 'lever', 'size': 0.013},
        {'id': 'RP_Gs', 'y': -0.72, 'angle': 45, 'kind': 'lever', 'size': 0.013},
    ], [], [(-0.12, -30, 0.016), (-0.62, 30, 0.018)])
    keys += keywork(B, M, [
        {'id': 'LT_Bb', 'y': 0.72, 'angle': 60, 'kind': 'lever', 'size': 0.015},
        {'id': 'LT_B', 'y': 0.64, 'angle': 60, 'kind': 'lever', 'size': 0.015},
        {'id': 'LT_C', 'y': 0.56, 'angle': 60, 'kind': 'lever', 'size': 0.015},
        {'id': 'LT_D', 'y': 0.48, 'angle': 60, 'kind': 'lever', 'size': 0.015},
        {'id': 'LT_Cs', 'y': 0.4, 'angle': 60, 'kind': 'small', 'size': 0.013},
        {'id': 'LT_A', 'y': 0.32, 'angle': 60, 'kind': 'small', 'size': 0.012},
    ], [], [(1.15, 30, 0.022), (1.0, 35, 0.022), (0.85, 40, 0.02)])
    return [part] + keys


# ---------------------------------------------------------------- saxophones

SAX_KEYS = [
    {'id': 'octave', 'y': 0.5, 'angle': 150, 'kind': 'small', 'size': 0.017},
    {'id': 'palmF', 'y': 0.66, 'angle': -70, 'kind': 'lever', 'size': 0.016},
    {'id': 'palmEb', 'y': 0.6, 'angle': -78, 'kind': 'lever', 'size': 0.016},
    {'id': 'palmD', 'y': 0.54, 'angle': -86, 'kind': 'lever', 'size': 0.016},
    {'id': 'frontF', 'y': 0.56, 'angle': 0, 'kind': 'small', 'size': 0.012},
    {'id': 'L1', 'y': 0.47, 'kind': 'pearl', 'size': 0.017},
    {'id': 'bis', 'y': 0.41, 'kind': 'small', 'size': 0.008},
    {'id': 'L2', 'y': 0.35, 'kind': 'pearl', 'size': 0.018},
    {'id': 'L3', 'y': 0.23, 'kind': 'pearl', 'size': 0.019},
    {'id': 'LP_Gs', 'y': 0.12, 'angle': -45, 'kind': 'lever', 'size': 0.016},
    {'id': 'LP_Cs', 'y': 0.05, 'angle': -45, 'kind': 'lever', 'size': 0.016},
    {'id': 'LP_B', 'y': -0.02, 'angle': -45, 'kind': 'lever', 'size': 0.016},
    {'id': 'LP_Bb', 'y': -0.09, 'angle': -45, 'kind': 'lever', 'size': 0.016},
    {'id': 'highFs', 'y': 0.17, 'angle': 70, 'kind': 'lever', 'size': 0.013},
    {'id': 'sideE', 'y': 0.08, 'angle': 70, 'kind': 'lever', 'size': 0.014},
    {'id': 'sideC', 'y': 0.0, 'angle': 70, 'kind': 'lever', 'size': 0.014},
    {'id': 'sideBb', 'y': -0.08, 'angle': 70, 'kind': 'lever', 'size': 0.014},
    {'id': 'R1', 'y': -0.14, 'kind': 'pearl', 'size': 0.021},
    {'id': 'R2', 'y': -0.26, 'kind': 'pearl', 'size': 0.022},
    {'id': 'R3', 'y': -0.38, 'kind': 'pearl', 'size': 0.023},
    {'id': 'RP_Eb', 'y': -0.48, 'angle': 40, 'kind': 'lever', 'size': 0.016},
    {'id': 'RP_C', 'y': -0.56, 'angle': 40, 'kind': 'lever', 'size': 0.016},
]


def sax(M, scale=1.0, low_a=False, pigtail=False):
    """Alto-sized saxophone (scaled for tenor / bari): conical body, bow, upturned bell,
    neck swinging back toward the player."""
    from brass import add_bell, brace
    part = Part('Body')
    B = M['brass']
    z0, z1 = 0.17, 0.646
    r_top, r_bot = 0.0125, 0.034

    def radius(z):
        return r_top + (z1 - z) / (z1 - z0) * (r_bot - r_top)

    lathe(part, [(r_top * 0.7, z1), (r_top + 0.0012, z1), (r_top + 0.0012, z1 - 0.012), (r_top, z1 - 0.014),
                 (r_bot, z0)], B, segs=64)
    # Bow and upturned bell.
    bell_x = 0.1
    tube(part, [(0, 0, z0 + 0.001), (0, 0, 0.055), (bell_x, 0, 0.055), (bell_x, 0, 0.13)],
         (r_bot, r_bot * 1.12), B, bend=[0.05, 0.045], segs=56)
    ring_band(part, B, (0, 0), z0 + 0.03, radius(z0 + 0.03) + 0.0015, 0.004)
    bell_dir = Vector((0.1, -0.06, 1)).normalized()
    bell_at = add_bell(part, B, (bell_x, 0, 0.129), bell_dir, 0.24, r_bot * 1.12, 0.064, gamma=1.5, segs=96)
    # Bow guard: a rod under the bow (roughly a half circle), on three braces.
    bow_c, bow_r = Vector((bell_x * 0.525, 0, 0.1)), bell_x * 0.475
    guard_r = bow_r + r_bot * 1.06 + 0.006
    torus(part, bow_c, (0, 1, 0), guard_r, 0.003, B, segs=40, minor_segs=8, arc=math.pi)
    for deg in (200, 270, 340):
        d = Vector((math.cos(math.radians(deg)), 0, math.sin(math.radians(deg))))
        brace(part, B, bow_c + d * guard_r, bow_c + d * bow_r, 0.002)
    brace(part, B, (radius(0.3) * 0.9, 0, 0.3), (bell_x - bell_at(0.3 - 0.129) * 0.95 + 0.01, 0, 0.3), 0.003)
    # Low B / B♭ pad cups on the bell's back.
    for zz, a in ((0.2, 200), (0.27, 215)):
        out = outward(a)
        c = Vector((bell_x, 0, 0)) + bell_dir * zz + out * bell_at(zz - 0.129 + 0.0)
        lathe(part, [(0, 0.0), (0.017, 0.0), (0.018, 0.006), (0.016, 0.009), (0, 0.01)], B,
              axis_matrix(c, out), segs=40)
    # Neck: up off the body, swinging back toward the player; octave ring on top.
    T = Vector((0, 0, z1))
    if pigtail:
        R = 0.04
        loop = [T + Vector((0, 0, 0.03))]
        for i in range(0, 33):
            a = i / 32 * math.pi * 2 * 1.1
            loop.append(T + Vector((-R + R * math.cos(a), 0.0 + i * 0.0012, 0.03 + 0.05 + R * math.sin(a) - 0.05 + R)))
        pts = [T] + loop + [loop[-1] + Vector((-0.05, 0.05, 0.0)), loop[-1] + Vector((-0.08, 0.1, -0.005))]
        tube(part, pts, (r_top, r_top * 0.62), B, bend=0.012, segs=40)
        neck_end, neck_dir = pts[-1], (pts[-1] - pts[-2]).normalized()
    else:
        pts = [T, T + Vector((0, 0, 0.035)), T + Vector((-0.02, 0.02, 0.08)), T + Vector((-0.065, 0.065, 0.1)),
               T + Vector((-0.11, 0.11, 0.095))]
        tube(part, pts, (r_top, r_top * 0.62), B, bend=[0.02, 0.04, 0.05], segs=40)
        neck_end, neck_dir = pts[-1], (pts[-1] - pts[-2]).normalized()
    cylinder(part, T + Vector((0, 0, 0.004)), (0, 0, 1), 0.012, r_top + 0.0008, B, segs=48, bevel=0.0006)
    lathe(part, [(r_top * 0.66, 0), (r_top * 0.7, 0.0), (r_top * 0.7, 0.024), (r_top * 0.6, 0.026)],
          M['cork'], axis_matrix(neck_end - neck_dir * 0.002, neck_dir), segs=32)
    single_reed_mouthpiece(part, M, neck_end + neck_dir * 0.01, neck_dir, r_top * 0.95, 0.085, (0, 0, -1))
    # Strap ring and thumb rest on the back.
    body = Body(part, radius, lambda y: z0 + (y + 0.7) * 0.34, 0.36, metal=B, key_lift=0.011, chimneys=True)
    torus(part, body.surface(180, body.y_to_z(0.32), 0.006), (1, 0, 0), 0.005, 0.0011, B, segs=24, minor_segs=8)
    box(part, (0, 0, 0), (0.014, 0.018, 0.008), B, body.frame(180, body.y_to_z(-0.1), 0.003))

    specs = list(SAX_KEYS)
    if low_a:
        specs.append({'id': 'lowA', 'y': 0.4, 'angle': 150, 'kind': 'small', 'size': 0.016})
    keys = keywork(body, M, specs, [(-35, -0.6, 0.62, 0.016), (35, -0.62, 0.3, 0.016), (-70, 0.1, 0.6, 0.014)],
                   [(0.6, -40, 0.02), (0.4, 45, 0.022), (0.16, 40, 0.026), (-0.03, -35, 0.03), (-0.2, 40, 0.032),
                    (-0.32, -35, 0.034), (-0.5, 25, 0.04), (-0.6, -30, 0.042)])
    parts = [part] + keys
    if scale != 1:
        transform_all(parts, Matrix.Scale(scale, 4))
    return parts


MODELS = {
    'flute': flute, 'oboe': oboe, 'bassoon': bassoon, 'clarinet': clarinet,
    'bassClarinet': bass_clarinet,
    'altoSax': lambda M: sax(M),
    'tenorSax': lambda M: sax(M, scale=1.24),
    'bariSax': lambda M: sax(M, scale=1.55, low_a=True, pigtail=True),
}
