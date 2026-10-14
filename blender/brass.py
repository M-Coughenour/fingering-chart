# Brass instruments at real size (metres). Blender axes: +Z up, the camera looks from -Y,
# so -Y is the side facing the viewer. Each builder returns a list of Parts; pressable parts
# (valve buttons, levers, the trombone slide) carry a `key` for the fingering chart.
import math
from mathutils import Matrix, Vector
from lib import (Part, tube, lathe, cylinder, torus, axis_matrix, offset_profile, knurl,
                 transform_all)

UP = (0, 0, 1)
UP_V = Vector(UP)

# ---------------------------------------------------------------- shared components


def bell_profile(length, throat_r, rim_r, gamma=0.7, n=70):
    """Bessel-horn flare as (radius, z) from the throat (z=0) to the rim (z=length).
    Returns the profile and radius_at(z)."""
    d0 = length / ((rim_r / throat_r) ** (1 / gamma) - 1)

    def radius_at(z):
        d = max(0.0, length - z)
        return rim_r * (d0 / (d + d0)) ** gamma

    prof = []
    for i in range(n + 1):
        d = length * (1 - i / n) ** 2.2  # denser near the rim where the flare turns fastest
        prof.append((radius_at(length - d), length - d))
    return prof, radius_at


def add_bell(body, mat, throat, direction, length, throat_r, rim_r, gamma=0.7, wall=0.0006,
             bead=None, garland=True, segs=96):
    """Thin-walled bell with a rolled rim. Returns radius_at(distance from throat)."""
    prof, radius_at = bell_profile(length, throat_r, rim_r, gamma)
    inner = offset_profile(prof, wall)
    m = axis_matrix(throat, direction)
    lathe(body, prof + list(reversed(inner)), mat, m, segs=segs)
    d = Vector(direction).normalized()
    bead = bead or max(0.0011, rim_r * 0.018)
    torus(body, Vector(throat) + d * (length - bead * 0.5), d, rim_r - bead * 0.3, bead, mat,
          segs=segs + 32, minor_segs=12)
    if garland:
        for back, w in ((rim_r * 0.2, bead * 0.55), (rim_r * 0.36, bead * 0.4)):
            torus(body, Vector(throat) + d * (length - back), d, radius_at(length - back) + wall * 0.4, w,
                  mat, segs=segs, minor_segs=8)
    return radius_at


def ferrule(body, mat, center, direction, radius, length=0.008):
    d = Vector(direction).normalized()
    cylinder(body, Vector(center) - d * (length / 2), d, length, radius + 0.0007, mat, segs=32,
             bevel=0.0006)


def sleeve(body, M, start, end, radius):
    """Nickel outer slide tube over a leg, with a brass ferrule on its open end."""
    a, b = Vector(start), Vector(end)
    d = (b - a).normalized()
    cylinder(body, a, d, (b - a).length, radius + 0.0005, M['nickel'], segs=32, bevel=0.0003)
    ferrule(body, M['brass'], b, d, radius + 0.0005, min(0.005 + radius * 0.4, 0.014))


def brace(body, mat, a, b, r=0.0016):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    cylinder(body, a, d, (b - a).length, r, mat, segs=16)
    for p, s in ((a, d), (b, -d)):  # flared feet where the brace is soldered on
        lathe(body, [(r * 2.6, 0), (r * 1.6, r * 0.75), (r * 1.05, r * 1.9), (r, r * 2.2)],
              mat, axis_matrix(p, s), segs=24)


def u_slide(body, M, a, b, out, depth, r, sleeves=True, max_step=0.006):
    """Tuning slide: legs leave points a and b along `out`, joined by a round bow."""
    a, b, out = Vector(a), Vector(b), Vector(out).normalized()
    gap = (b - a).length
    bend = min(gap / 2, depth * 0.95)
    tube(body, [a, a + out * depth, b + out * depth, b], r, M['brass'], bend=[bend, bend],
         max_step=max_step)
    if sleeves:
        for p in (a, b):
            sleeve(body, M, p + out * depth * 0.12, p + out * depth * 0.55, r)


def mouthpiece(body, mat, shank, direction, k=1.0, deep=False):
    """Mouthpiece with its shank tip at `shank`, rim along `direction`. k=1 is a trumpet
    mouthpiece (88 mm); `deep` gives a French horn's funnel cup."""
    if deep:
        prof = [(0.0022, 0), (0.0042, 0), (0.0046, 0.035), (0.0052, 0.055), (0.0068, 0.07),
                (0.0105, 0.079), (0.0128, 0.0835), (0.0124, 0.0862), (0.0112, 0.0876),
                (0.0092, 0.0876), (0.0084, 0.086), (0.0072, 0.082), (0.0046, 0.072),
                (0.0025, 0.06), (0.0018, 0.05), (0.0022, 0.0)]
    else:
        prof = [(0.0024, 0), (0.0048, 0), (0.0052, 0.03), (0.0058, 0.05), (0.0072, 0.064),
                (0.0105, 0.074), (0.0128, 0.08), (0.0133, 0.0835), (0.0128, 0.0862),
                (0.0115, 0.0878), (0.0095, 0.0878), (0.0085, 0.0862), (0.0078, 0.083),
                (0.0058, 0.077), (0.003, 0.072), (0.0019, 0.068), (0.0018, 0.06), (0.0024, 0.02),
                (0.0024, 0)]
    prof = [(r * k, z * k) for r, z in prof]
    lathe(body, prof, mat, axis_matrix(shank, direction), segs=64)


def piston_valve(body, M, key_id, base, k=1.0, travel=0.015, turned=0.0, axis=None):
    """Piston valve at `base` (casing centre), sized relative to a trumpet valve (k=1:
    23.6 mm casing, 72 mm tall). The casing goes into `body`; returns the button Part."""
    casing = Part('casing')
    R, top, bottom, bz = 0.0118, 0.036, -0.036, 0.068
    cylinder(casing, (0, 0, bottom), UP, top - bottom, R, M['brass'], segs=48)
    for z in (top - 0.003, bottom + 0.003):
        torus(casing, (0, 0, z), UP, R, 0.0007, M['brass'], segs=48, minor_segs=8)
    cylinder(casing, (0, 0, top), UP, 0.0075, R + 0.001, M['brass'], segs=96, radial_fn=knurl(depth=0.035))
    lathe(casing, [(R - 0.001, top + 0.0075), (0.008, top + 0.0095), (0.0035, top + 0.0105),
                   (0.0022, top + 0.0105)], M['brass'])
    cylinder(casing, (0, 0, top + 0.0105), UP, 0.0025, 0.0055, M['felt'], segs=32)
    cylinder(casing, (0, 0, bottom - 0.006), UP, 0.006, R + 0.001, M['brass'], segs=96,
             radial_fn=knurl(depth=0.035))
    lathe(casing, [(0, bottom - 0.0105), (0.004, bottom - 0.0102), (0.0085, bottom - 0.0088),
                   (R, bottom - 0.006)], M['brass'])

    button = Part(key_id, origin=(0, 0, bz),
                  key={'id': key_id, 'press': (0, 0, -1), 'travel': travel / k})
    cylinder(button, (0, 0, top + 0.002), UP, bz - top - 0.002, 0.0021, M['nickel'], segs=24)
    lathe(button, [(0, bz - 0.0045), (0.0035, bz - 0.0045), (0.0088, bz - 0.0032), (0.0096, bz - 0.0015),
                   (0.0098, bz + 0.002), (0.0094, bz + 0.0032), (0.0082, bz + 0.0034)], M['brass'], segs=64)
    lathe(button, [(0.0082, bz + 0.0034), (0.0078, bz + 0.0036), (0.005, bz + 0.0031), (0.0, bz + 0.0028)],
          M['pearl'], segs=64)

    # `axis` tilts the valve so its button points that way (default: straight up).
    tilt = Vector(UP).rotation_difference(Vector(axis)).to_matrix().to_4x4() if axis else Matrix()
    m = Matrix.Translation(base) @ tilt @ Matrix.Rotation(turned, 4, 'Z') @ Matrix.Scale(k, 4)
    casing.transform(m)
    button.transform(m)
    body.merge(casing)
    return button


def rotary_valve(body, M, center, axis, r=0.016, length=0.04):
    """Rotary valve drum with a bearing cap and a stop-arm plate on the `axis` end."""
    c, d = Vector(center), Vector(axis).normalized()
    cylinder(body, c - d * (length / 2), d, length, r, M['brass'], segs=48, bevel=0.001)
    for s in (-1, 1):
        torus(body, c + d * s * (length / 2 - 0.002), d, r, 0.0008, M['brass'], segs=48, minor_segs=8)
    # Cap with knurled edge and a domed bearing.
    cylinder(body, c + d * (length / 2), d, 0.004, r * 1.08, M['brass'], segs=96, radial_fn=knurl(depth=0.03))
    lathe(body, [(r * 0.95, 0), (r * 0.7, 0.003), (r * 0.25, 0.005), (0, 0.0055)], M['brass'],
          axis_matrix(c + d * (length / 2 + 0.004), d), segs=48)
    cylinder(body, c - d * (length / 2 + 0.006), d, 0.006, r * 0.5, M['nickel'], segs=32)


def lever(M, key_id, pivot, tip, press, pad_r=0.008, travel=0.006):
    """Finger lever (horn / F-trigger): arm from `pivot` to a pearl-topped spatula at `tip`."""
    part = Part(key_id, origin=tip, key={'id': key_id, 'press': press, 'travel': travel})
    tube(part, [pivot, tip], 0.0018, M['nickel'], segs=12, caps=True)
    n = -Vector(press).normalized()
    lathe(part, [(0, -0.0015), (pad_r, -0.0015), (pad_r * 1.05, 0.0), (pad_r, 0.0015), (pad_r * 0.85, 0.0018)],
          M['nickel'], axis_matrix(tip, n), segs=40)
    lathe(part, [(pad_r * 0.85, 0.0018), (pad_r * 0.5, 0.0022), (0, 0.0024)], M['pearl'],
          axis_matrix(tip, n), segs=40)
    return part


# ---------------------------------------------------------------- trumpet & mellophone


def trumpet_like(M, bell_r=0.0615, bell_len=0.24, bore=0.0059, scale=1.0, flare=0.7, receiver_x=-0.188,
                 throat_k=1.16, valves=3):
    """B♭ trumpet layout: +X toward the bell, valve 1 nearest the player, leadpipe on the
    viewer's side (-Y), valve slides on the far side, bell pipe along the top. With
    valves=4 the 4th piston sits in line after the 3rd, its long slide hanging below."""
    body = Part('Body')
    parts = [body]
    valve_x = tuple(0.027 * (i - (valves - 1) / 2) for i in range(valves))
    for i, x in enumerate(valve_x, 1):
        parts.append(piston_valve(body, M, f'valve{i}', (x, 0, 0)))

    by, bz = 0.019, 0.052
    bell_rim_x = 0.29
    throat = bell_rim_x - bell_len
    lead_y, lead_z = -0.019, 0.005
    B = M['brass']

    mouthpiece(body, M['silver'], (receiver_x + 0.012, lead_y, lead_z), (-1, 0, 0))
    cylinder(body, (receiver_x - 0.002, lead_y, lead_z), (1, 0, 0), 0.034, 0.0069, M['nickel'], segs=40, bevel=0.0008)
    torus(body, (receiver_x - 0.001, lead_y, lead_z), (1, 0, 0), 0.0069, 0.0009, M['nickel'], minor_segs=8)
    tube(body, [(receiver_x + 0.03, lead_y, lead_z), (0.125, lead_y, lead_z)], (bore * 0.82, bore), B)
    ferrule(body, B, (0.118, lead_y, lead_z), (1, 0, 0), bore)

    # Main tuning slide: U at the front, lower leg back into the 3rd casing.
    slide_x, low_z = 0.178, -0.026
    leg = (lead_z - low_z) / 2
    last = valve_x[-1]
    tube(body, [(0.115, lead_y, lead_z), (slide_x, lead_y, lead_z), (slide_x, lead_y, low_z),
                (max(0.085, last + 0.045), lead_y, low_z), (last + 0.023, -0.007, low_z), (last + 0.003, 0, low_z)],
         bore, B, bend=[leg, leg, 0.02, 0.012])
    for z in (lead_z, low_z):
        sleeve(body, M, (0.122, lead_y, z), (0.15, lead_y, z), bore)
    brace(body, B, (0.168, lead_y, lead_z - bore), (0.168, lead_y, low_z + bore), 0.0014)
    # Water key on the bottom of the bow.
    wk = Vector((slide_x + 0.004, lead_y, low_z - 0.003))
    cylinder(body, wk + Vector((0, 0, -0.004)), UP, 0.006, 0.0032, B, segs=24)
    tube(body, [wk + Vector((0.0, 0, -0.004)), wk + Vector((-0.022, 0, -0.008)), wk + Vector((-0.045, 0, -0.006))],
         0.0011, M['nickel'], bend=0.01, segs=12, caps=True)
    cylinder(body, wk + Vector((-0.002, 0, -0.0055)), UP, 0.003, 0.0026, M['cork'], segs=20)

    # Pinky hook on top of the leadpipe beside the 3rd valve.
    hk = Vector((0.04, lead_y, lead_z + bore))
    tube(body, [hk, hk + Vector((0, 0, 0.009)), hk + Vector((0.008, 0, 0.016))], 0.0014, B, bend=0.006,
         segs=12, caps=True)
    # Knuckles joining the casings on the viewer's side.
    for i, (xa, xb) in enumerate(zip(valve_x, valve_x[1:])):
        z = -0.014 if i % 2 == 0 else 0.02
        tube(body, [(xa + 0.004, -0.008, z), ((xa + xb) / 2, -0.0165, z), (xb - 0.004, -0.008, z)],
             bore * 0.9, B, bend=0.02)

    # Valve slides on the far side: 1st toward the player, 2nd short, 3rd toward the bell.
    def valve_slide(x_from, x_bow, y=0.018, z_top=-0.008, z_bot=-0.03):
        sx = 1 if x_bow > x_from else -1
        entry = x_from + sx * 0.006
        legr = (z_top - z_bot) / 2
        tube(body, [(x_from, 0.006, z_top), (entry, y, z_top), (x_bow, y, z_top), (x_bow, y, z_bot),
                    (entry, y, z_bot), (x_from, 0.006, z_bot)], bore * 0.95, B, bend=[0.006, legr, legr, 0.006])
        for z in (z_top, z_bot):
            a = entry + sx * 0.008
            sleeve(body, M, (a, y, z), (a + sx * abs(x_bow - entry) * 0.45, y, z), bore * 0.95)

    valve_slide(valve_x[0] - 0.004, -0.088)
    valve_slide(valve_x[2] + 0.004, 0.108 + valve_x[2] - 0.027)
    u_slide(body, M, (valve_x[1], 0.006, -0.012), (valve_x[1], 0.006, -0.03), (0, 1, 0), 0.03, bore * 0.9)
    if valves == 4:
        # 4th valve slide: the longest loop, hanging below and forward of the 4th casing.
        x4 = valve_x[3]
        u_slide(body, M, (x4 - 0.0065, 0.006, -0.046), (x4 + 0.0065, 0.006, -0.046), (0.35, 0.25, -1), 0.075,
                bore * 0.9)
    torus(body, (-0.07, 0.018, -0.008 + bore + 0.006), (0, 1, 0), 0.0065, 0.0013, B, segs=32,
          minor_segs=8, arc=math.pi)
    torus(body, (0.085, 0.018 + bore + 0.0035, -0.03 - bore - 0.006), (0, 1, 0.4), 0.0085, 0.0014, B,
          segs=40, minor_segs=8)

    # Bell section: out of valve 1, round the back bow, forward along the top to the bell.
    back_x = -0.128
    bow = (bz - 0.022) / 2
    throat_r = bore * throat_k
    tube(body, [(valve_x[0], 0.004, 0.022), (valve_x[0] - 0.02, by, 0.022), (back_x, by, 0.022),
                (back_x, by, bz), (throat + 0.001, by, bz)],
         lambda u: bore * (0.98 + 0.18 * max(0, (u - 0.55) / 0.45) ** 2), B, bend=[0.012, bow, bow])
    ferrule(body, B, (back_x + 0.035, by, bz), (1, 0, 0), bore * 1.04, 0.01)
    bell_at = add_bell(body, B, (throat, by, bz), (1, 0, 0), bell_len, throat_r, bell_r, gamma=flare)

    def under_bell(x):
        return bz - bell_at(x - throat)

    brace(body, B, (-0.098, by, bz - bore), (-0.098, lead_y, lead_z + bore))
    brace(body, B, (0.095, by - 0.003, under_bell(0.095)), (0.095, lead_y, lead_z + bore))
    brace(body, B, (0.205, by - 0.002, under_bell(0.205)), (slide_x + 0.004, lead_y, lead_z + 0.003))
    if scale != 1:
        transform_all(parts, Matrix.Scale(scale, 4))
    return parts


def trumpet(M):
    return trumpet_like(M)


def mellophone(M):
    # Marching mellophone: same wrap as a trumpet but bigger, with a 10" forward bell.
    return trumpet_like(M, bell_r=0.106, bell_len=0.27, bore=0.0066, scale=1.2, flare=0.75)


# ---------------------------------------------------------------- upright brass


def upright(M, valves=3, side_fourth=False, bell_r=0.15, body_r=0.036, scale=1.0, valve_k=1.45,
            name='Body'):
    """Baritone / euphonium / tuba: valves in front (-Y) of the body, main branch down the
    back, a bow at the bottom and the bell branch rising on the right (+X)."""
    body = Part(name)
    parts = [body]
    B = M['brass']
    vy = -0.045
    spacing = 0.0118 * valve_k * 2 + 0.008
    first = -0.05 - (valves - 3) * spacing * 0.6
    vx = [first + i * spacing for i in range(valves)]
    casing_r = 0.0118 * valve_k
    vz = -0.05  # casing centre
    for i, x in enumerate(vx, 1):
        parts.append(piston_valve(body, M, f'valve{i}', (x, vy, vz), k=valve_k, travel=0.02))

    back_x, bell_x, y0 = -0.115, 0.125, 0.03
    bottom = -0.32
    bell_base = -0.03
    r0 = body_r * 0.32
    # Main bore: out of valve 1, round the main tuning slide behind, down the back branch,
    # round the bottom bow and up the bell branch, widening all the way.
    main = [(vx[0], vy + casing_r * 0.5, -0.07), (back_x - 0.035, vy + 0.01, -0.07),
            (back_x - 0.035, 0.11, -0.07), (back_x - 0.035, 0.11, 0.1), (back_x, y0, 0.1),
            (back_x, y0, bottom), (bell_x, y0, bottom), (bell_x, y0, bell_base + 0.001)]
    bow = (bell_x - back_x) / 2 * 0.98
    tube(body, main, lambda u: r0 + (body_r - r0) * u ** 1.6, B,
         bend=[0.03, 0.04, 0.05, 0.05, bow, bow], segs=40, max_step=0.01)
    # Sleeves of the main tuning slide (the loop behind the valves).
    sleeve(body, M, (back_x - 0.035, 0.02, 0.1 - 0.0), (back_x - 0.035, 0.07, 0.1), r0 * 1.6)
    ferrule(body, B, (back_x, y0, -0.12), UP, body_r * 0.65, 0.016)
    ferrule(body, B, (bell_x, y0, -0.12), UP, body_r * 0.92, 0.018)
    # Bow guard: a brass band protecting the bottom of the bow.
    torus(body, ((back_x + bell_x) / 2, y0, bottom + bow), (0, 1, 0), bow + body_r * 0.85,
          body_r * 0.16, B, segs=48, minor_segs=10, arc=math.pi)
    add_bell(body, B, (bell_x, y0, bell_base), UP, 0.4, body_r * 1.02, bell_r, gamma=1.25,
             wall=0.0009, segs=128)

    # Valve slides hanging under the casings, the 3rd (and 4th) longest.
    lengths = [0.085, 0.05, 0.12, 0.16]
    rs = r0 * 0.95
    for i, x in enumerate(vx):
        top = vz - 0.036 * valve_k - 0.008
        a = (x, vy - casing_r * 0.45, top + 0.012)
        b = (x, vy + casing_r * 0.45, top + 0.012)
        u_slide(body, M, a, b, (0, 0.25, -1), lengths[i], rs)
    # Knuckles between the casings (front) and the leadpipe up to the player (+Y, high).
    for xa, xb in zip(vx, vx[1:]):
        tube(body, [(xa, vy - casing_r * 0.6, vz + 0.02), ((xa + xb) / 2, vy - casing_r * 1.3, vz + 0.02),
                    (xb, vy - casing_r * 0.6, vz + 0.02)], rs, B, bend=0.03)
    lead_start = Vector((vx[0], vy, vz + 0.025))
    recv = Vector((back_x - 0.06, 0.13, 0.2))
    tube(body, [lead_start, lead_start + Vector((-0.03, -0.01, 0.02)), Vector((back_x - 0.06, 0.02, 0.12)), recv],
         (rs, 0.0068), B, bend=[0.03, 0.08], max_step=0.01)
    d = (recv - Vector((back_x - 0.06, 0.02, 0.12))).normalized()
    cylinder(body, recv - d * 0.03, d, 0.03, 0.0085, M['nickel'], segs=40, bevel=0.0008)
    mouthpiece(body, M['silver'], recv - d * 0.012, d, k=1.45)

    if side_fourth:
        # Euphonium: 4th valve beside the bell branch, played by the left hand.
        x4 = bell_x + body_r + casing_r + 0.012
        z4 = -0.13
        parts.append(piston_valve(body, M, 'valve4', (x4, y0 - 0.03, z4), k=valve_k, travel=0.02))
        for z in (z4 + 0.02, z4 - 0.02):
            tube(body, [(x4, y0 - 0.03, z), (bell_x + body_r * 0.5, y0, z)], rs, B)
        low = z4 - 0.036 * valve_k - 0.006
        u_slide(body, M, (x4, y0 - 0.03 - casing_r * 0.45, low), (x4, y0 - 0.03 + casing_r * 0.45, low),
                (0.5, 0, -1), 0.07, rs)
    # Braces: valve block to the back branch and the bell branch, branch to branch.
    brace(body, B, (vx[0], vy + casing_r, vz + 0.02), (back_x, y0 - body_r * 0.35, vz + 0.02), 0.0025)
    brace(body, B, (vx[-1], vy + casing_r, vz - 0.02), (bell_x, y0 - body_r * 0.6, vz - 0.02), 0.0025)
    brace(body, B, (back_x + body_r * 0.5, y0, -0.24), (bell_x - body_r * 0.85, y0, -0.24), 0.003)
    if scale != 1:
        transform_all(parts, Matrix.Scale(scale, 4))
    return parts


def baritone(M):
    # Marching baritone: held like a trumpet with the bell forward, everything about 1.5x
    # bigger (35 mm valve casings, 9½" bell, large-shank mouthpiece).
    return trumpet_like(M, bell_r=0.086, bell_len=0.25, bore=0.0068, scale=1.5, flare=0.85,
                        receiver_x=-0.165, throat_k=1.5)


def euphonium(M):
    return upright(M, side_fourth=True, bell_r=0.15, body_r=0.036, valve_k=1.45)


def euphonium3(M):
    return upright(M, bell_r=0.15, body_r=0.036, valve_k=1.45)


def tuba(M):
    return upright(M, valves=4, bell_r=0.165, body_r=0.045, scale=1.45, valve_k=1.25)


# ---------------------------------------------------------------- sousaphone


def sousaphone(M):
    """BB♭ sousaphone as in a catalogue photo: the body loop faces the camera (-Y) with the
    26" bell sitting on top of it, about as wide as the loop and facing the same way. The
    body tubing spirals outward from the valves (two concentric passes, the outer one
    thickest) and its end climbs behind the bell as the gooseneck. The three pistons sit
    inside the ring on the right, tilted, with long slides curving down inside the loop."""
    body = Part('Body')
    parts = [body]
    B, N = M['brass'], M['nickel']

    # Body loop: a spiral in the XZ plane, widening and stepping back slightly each turn.
    th0, th1 = math.radians(-70), math.radians(450)

    def loop_point(t):
        th = th0 + (th1 - th0) * t
        R = 0.2 + 0.135 * t
        return Vector((R * math.cos(th), 0.025 * t, R * math.sin(th)))

    def loop_at(deg):
        return loop_point((math.radians(deg) - th0) / (th1 - th0))

    def loop_r(t):
        return 0.022 + 0.034 * t

    # Valve block inside the ring on the right, in front of the loop, buttons up and left.
    k = 1.75
    axis = Vector((-0.55, 0, 0.83)).normalized()
    row = Vector((0.83, 0, 0.55)).normalized()
    centre = Vector((0.12, -0.075, -0.06))
    pos = [centre + row * (0.048 * (i - 1)) for i in range(3)]
    for i, p in enumerate(pos, 1):
        parts.append(piston_valve(body, M, f'valve{i}', p, k=k, travel=0.022, axis=axis))
    under = [p - axis * 0.075 for p in pos]

    # Lead-in from under valve 1 to the start of the spiral, then the loop itself.
    steps = 120
    spiral = [loop_point(i / steps) for i in range(steps + 1)]
    lead_in = [under[0], under[0] - axis * 0.03 + Vector((-0.04, 0.02, -0.03)), Vector((0.0, 0.0, -0.17))]
    tube(body, lead_in + spiral, lambda u: loop_r(max(0.0, (u - 0.04) / 0.96)), B, bend=0.03, segs=40,
         max_step=0.012)

    # Gooseneck: from the top of the loop up behind the bell, turning forward into it.
    E = spiral[-1]
    throat = Vector((0.0, 0.2, 0.6))
    neck = [E, E + Vector((-0.07, 0.03, 0.04)), Vector((-0.06, 0.22, 0.44)), Vector((-0.01, 0.28, 0.57)),
            Vector((0.0, 0.24, 0.6)), throat]
    tube(body, neck, (loop_r(1.0), 0.066), B, bend=[0.06, 0.1, 0.06, 0.04], segs=40, max_step=0.012)
    bell_dir = Vector((0, -1, 0))
    bell_at = add_bell(body, B, throat, bell_dir, 0.46, 0.066, 0.33, gamma=1.0, wall=0.0012, segs=144)
    for off, rr, w in ((-0.03, 0.071, 0.028), (0.002, 0.075, 0.02)):
        cylinder(body, throat + bell_dir * off, bell_dir, w, rr, B, segs=64, bevel=0.002)
    clamp = throat + Vector((0, 0, 0.078))
    cylinder(body, clamp - UP_V * 0.006, UP_V, 0.022, 0.007, N, segs=20)
    lathe(body, [(0, 0), (0.016, 0), (0.017, 0.004), (0.016, 0.008), (0, 0.009)], N,
          axis_matrix(clamp + UP_V * 0.016, UP_V), segs=24)

    # Valve slides: long U's from under the casings, curving down and left inside the loop.
    slide_dir = Vector((-0.6, 0, -0.8)).normalized()
    for i, p in enumerate(under):
        u_slide(body, M, p + Vector((0, -0.013, 0)), p + Vector((0, 0.013, 0)), slide_dir,
                (0.21, 0.14, 0.26)[i], 0.0105, max_step=0.01)
    # Knuckles between the casings and the main tuning slide reaching up and right.
    for pa, pb in zip(pos, pos[1:]):
        tube(body, [pa + Vector((0, -0.02, 0)), (pa + pb) / 2 + Vector((0, -0.032, 0)), pb + Vector((0, -0.02, 0))],
             0.0095, B, bend=0.03)
    top3 = pos[2] + axis * 0.03
    u_slide(body, M, top3 + Vector((0, -0.012, 0)), top3 + Vector((0, 0.012, 0)), row, 0.13, 0.012, max_step=0.01)

    # Mouthpipe: up and left from the top valve to the mouthpiece inside the top of the ring.
    m0 = pos[0] + axis * 0.04 + Vector((0, -0.022, 0))
    recv = Vector((-0.01, -0.12, 0.19))
    mdir = Vector((-0.8, -0.35, 0.45)).normalized()
    mp = [m0, m0 + axis * 0.06, Vector((0.06, -0.11, 0.17)), recv]
    tube(body, mp, (0.0105, 0.0075), B, bend=[0.04, 0.05], max_step=0.008)
    ferrule(body, N, mp[2], (mp[3] - mp[2]).normalized(), 0.0088, 0.016)
    cylinder(body, recv - mdir * 0.03, mdir, 0.03, 0.0095, N, segs=40, bevel=0.0008)
    mouthpiece(body, M['silver'], recv - mdir * 0.012, mdir, k=1.75)

    # Braces: between the passes, valve block to the loop, bell to the top of the loop.
    for deg in (-20, 60, 150, 230):
        p1, p2 = loop_at(deg), loop_at(deg + 360)
        dd = (p2 - p1).normalized()
        brace(body, B, p1 + dd * 0.02, p2 - dd * 0.045, 0.004)
    brace(body, B, pos[1] + Vector((0, 0.02, 0)), loop_at(-5) + Vector((-0.02, 0, 0)), 0.005)
    brace(body, B, pos[0] - axis * 0.03 + Vector((0, 0.02, 0)), loop_at(-50) + Vector((0, 0, 0.02)), 0.005)
    yb = 0.2
    brace(body, B, throat + bell_dir * yb + Vector((0.1, 0, -bell_at(yb) * 0.75)),
          loop_at(400) + Vector((0, -0.02, 0.04)), 0.005)
    return parts


# ---------------------------------------------------------------- French horn


def french_horn(M):
    """Double horn seen from the player's right: round wrap facing the camera, bell
    flaring back to the right, rotary valves in the middle with levers for the left hand."""
    body = Part('Body')
    parts = [body]
    B = M['brass']

    # Main wrap: two and a half turns, widening, drifting front to back so it clears itself.
    pts = []
    for i in range(0, 121):
        t = i / 120
        a = math.radians(150) - t * math.pi * 2 * 2.3
        r = 0.135 + t * 0.045
        pts.append(Vector((r * math.cos(a), -0.03 + t * 0.06, r * math.sin(a))))
    end = pts[-1]
    bell_dir = Vector((0.55, 0.7, -0.45)).normalized()
    pts.append(end + bell_dir * 0.02)
    tube(body, pts, lambda u: 0.006 + 0.022 * u ** 2.2, B, bend=0.02, segs=36, max_step=0.008)
    add_bell(body, B, pts[-1], bell_dir, 0.3, 0.028, 0.155, gamma=0.62, segs=128)

    # Inner coils of the F and B♭ sides, behind the valves.
    for r, y in ((0.095, 0.0), (0.08, 0.015)):
        tube(body, [Vector((r * math.cos(a / 40 * math.pi * 2), y, r * math.sin(a / 40 * math.pi * 2)))
                    for a in range(0, 38)], 0.0055, B, bend=0.01, max_step=0.008)

    # Rotary valves in a row, caps toward the camera.
    vz = 0.0
    xs = (-0.04, -0.005, 0.03)
    for x in xs:
        rotary_valve(body, M, (x, -0.045, vz), (0, -1, 0))
    rotary_valve(body, M, (-0.075, -0.045, vz - 0.035), (0, -1, 0))
    for xa, xb in zip(xs, xs[1:]):
        tube(body, [(xa, -0.045, vz + 0.017), (xb, -0.045, vz + 0.017)], 0.005, B)
    # Valve slides: pairs of U's above and below the valve row.
    for x, depth, up in ((xs[0], 0.07, 1), (xs[1], 0.05, 1), (xs[2], 0.09, 1),
                         (xs[0], 0.06, -1), (xs[1], 0.045, -1), (xs[2], 0.08, -1)):
        y = -0.035 if up > 0 else -0.02
        u_slide(body, M, (x - 0.007, y, vz + up * 0.02), (x + 0.007, y, vz + up * 0.02), (0.15, 0, up),
                depth, 0.0048)
    # Levers: spatulas for fingers 1–3 stacked on the left, the thumb trigger below them.
    for i, x in enumerate(xs):
        tip = Vector((-0.17, -0.07, 0.065 - i * 0.026))
        parts.append(lever(M, f'valve{i + 1}', (x, -0.07, vz + 0.008), tip, (0, 0, -1), 0.008))
    parts.append(lever(M, 'trigger', (-0.075, -0.07, vz - 0.035), Vector((-0.15, -0.075, -0.05)),
                       (0, 0, -1), 0.009))

    # Leadpipe from the valves up and left to the mouthpiece.
    recv = Vector((-0.27, -0.04, 0.17))
    tube(body, [(xs[0], -0.045, vz + 0.03), (-0.1, -0.04, 0.09), (-0.2, -0.04, 0.14), recv],
         (0.0055, 0.0048), B, bend=[0.04, 0.06])
    d = (recv - Vector((-0.2, -0.04, 0.14))).normalized()
    cylinder(body, recv - d * 0.025, d, 0.025, 0.0062, M['nickel'], segs=32)
    mouthpiece(body, M['silver'], recv - d * 0.01, d, deep=True)
    # Main tuning slide reaching down-left; leather hand guard on the outer wrap.
    u_slide(body, M, (-0.11, -0.01, -0.06), (-0.11, -0.01, -0.08), (-1, 0, -0.3), 0.07, 0.0065)
    lg = Part('guard')
    torus(lg, (0, 0.02, 0), (0, 1, 0), 0.178, 0.016, M['leather'], segs=24, minor_segs=10, arc=math.radians(55))
    lg.transform(Matrix.Translation((0, 0.02, 0)) @ Matrix.Rotation(math.radians(-80), 4, 'Y') @
                 Matrix.Translation((0, -0.02, 0)))
    body.merge(lg)
    for a in (30, 110, 200, 290):
        r = math.radians(a)
        brace(body, B, (0.1 * math.cos(r), -0.02, 0.1 * math.sin(r)), (0.14 * math.cos(r), -0.02, 0.14 * math.sin(r)),
              0.0016)
    return parts


# ---------------------------------------------------------------- trombone

SLIDE_STEP = 0.088  # metres between slide positions


def trombone_base(M, trigger=False):
    """Tenor trombone, slide toward -X. Slide tubes in a vertical plane; bell section above
    and slightly behind; the moving outer slide is the 'slide' part."""
    body = Part('Body')
    parts = [body]
    B, N = M['brass'], M['nickel']
    r = 0.0072        # outer slide radius (13.9 mm bore)
    za, zb = 0.0, 0.09  # mouthpiece-side tube, bell-side tube
    y = 0.0
    inner_len = 0.66
    # Inner slide tubes and the stockings, fixed to the hand grip.
    for z in (za, zb):
        cylinder(body, (0.02, y, z), (-1, 0, 0), inner_len, r * 0.86, N, segs=32)
        cylinder(body, (0.0, y, z), (-1, 0, 0), 0.03, r * 1.05, N, segs=32)
    brace(body, N, (-0.005, y, za + r), (-0.005, y, zb - r), 0.0045)
    torus(body, (0.03, y, zb), (1, 0, 0), r * 1.3, 0.0016, B, segs=32, minor_segs=8)
    # Receiver and mouthpiece on the lower tube.
    cylinder(body, (0.02, y, za), (1, 0, 0), 0.05, r * 1.05, N, segs=40, bevel=0.0008)
    mouthpiece(body, M['silver'], (0.06, y, za), (1, 0, 0), k=1.3)

    # Bell section: gooseneck up from the upper tube, back to the tuning slide, forward
    # along the top to the bell.
    by, bz = 0.03, 0.24
    tune_x = 0.36
    neck = [(0.02, y, zb), (0.12, y, zb), (0.2, by, zb + 0.03), (0.28, by, zb + 0.02)]
    tube(body, neck, r * 1.02, B, bend=[0.06, 0.05])
    # Tuning slide U at the back.
    u_slide(body, M, (0.28, by, zb + 0.02), (0.28, by, bz), (1, 0, 0), tune_x - 0.28, r * 1.02)
    tube(body, [(0.28, by, bz), (-0.18, by, bz)], (r * 1.02, r * 1.3), B)
    ferrule(body, B, (0.2, by, bz), (1, 0, 0), r * 1.06, 0.015)
    bell_at = add_bell(body, B, (-0.18, by, bz), (-1, 0, 0), 0.5, r * 1.3, 0.108, gamma=0.72, segs=128)
    brace(body, B, (0.1, by, bz - r * 1.1), (0.1, y, zb + r * 1.05), 0.0035)
    brace(body, B, (-0.12, by, bz - bell_at(0.06)), (-0.12, y, zb + r * 0.9), 0.003)
    if trigger:
        # F attachment: rotary valve in the gooseneck, extra tubing coiled inside the bell
        # section, thumb lever reaching forward to the left-hand grip.
        rotary_valve(body, M, (0.15, by + 0.005, zb + 0.06), (0, 1, 0), r=0.017, length=0.04)
        coil = []
        for i in range(0, 61):
            a = i / 60 * math.pi * 2 * 0.95
            coil.append(Vector((0.26 + 0.075 * math.cos(a), by + 0.045 + i * 0.0003, zb + 0.08 + 0.065 * math.sin(a))))
        tube(body, [Vector((0.15, by + 0.03, zb + 0.06))] + coil, r, B, bend=0.01, max_step=0.008)
        parts.append(lever(M, 'trigger', (0.15, by + 0.03, zb + 0.045), Vector((0.03, by + 0.02, zb + 0.03)),
                           (0, 0, -1), 0.009, 0.006))
    else:
        cylinder(body, (0.24, by, bz), (1, 0, 0), 0.06, r * 1.6, B, segs=40, bevel=0.002)  # counterweight

    # Moving outer slide: two outer tubes, the bow (which glows to show the position),
    # the cross brace and the rubber bumper.
    slide = Part('slide', origin=(-0.04, y, (za + zb) / 2),
                 key={'id': 'slide', 'press': (-1, 0, 0), 'travel': 0, 'positionStep': SLIDE_STEP})
    out_len = 0.63
    for z in (za, zb):
        cylinder(slide, (-0.025, y, z), (-1, 0, 0), out_len, r, B, segs=32)
        ferrule(slide, B, (-0.03, y, z), (-1, 0, 0), r, 0.02)
        ferrule(slide, B, (-0.025 - out_len + 0.01, y, z), (-1, 0, 0), r, 0.02)
    brace(slide, B, (-0.1, y, za + r), (-0.1, y, zb - r), 0.0045)
    tip = Part('slideTip', origin=(-0.025 - out_len, y, (za + zb) / 2), parent=slide,
               extras={'slideTip': True})
    half = (zb - za) / 2
    tube(tip, [(-0.025 - out_len + 0.001, y, za), (-0.025 - out_len - half, y, za),
               (-0.025 - out_len - half, y, zb), (-0.025 - out_len + 0.001, y, zb)], r, B, bend=[half * 0.98, half * 0.98])
    lathe(slide, [(0, 0), (0.008, 0), (0.009, 0.004), (0.008, 0.008), (0, 0.009)], M['rubber'],
          axis_matrix((-0.025 - out_len - half - r * 0.6, y, (za + zb) / 2), (-1, 0, 0)), segs=24)
    parts += [slide, tip]
    return parts


def trombone(M):
    return trombone_base(M)


def trombone_f(M):
    return trombone_base(M, trigger=True)


MODELS = {
    'trumpet': trumpet, 'mellophone': mellophone, 'frenchHorn': french_horn,
    'trombone': trombone, 'tromboneF': trombone_f, 'baritone': baritone,
    'euphonium': euphonium, 'euphonium3': euphonium3, 'tuba': tuba, 'sousaphone': sousaphone,
}
