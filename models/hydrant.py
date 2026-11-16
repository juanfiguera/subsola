"""
NYC fire hydrant for Subsola, built in Blender from a turned profile plus castings.

Run: pnpm models (blender -b -P models/hydrant.py -- public/models)
Writes hydrant.glb with meshes "body" and "trim", read by src/scene/glb.ts.

Same frame as src/scene/fixtureMeshes.ts: meters, z up, origin at street level, +x toward the
street (pumper nozzle), +y along the curb. Body is painted silver, trim takes the utility color.
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
OUT = Path(argv[0])
OUT.mkdir(parents=True, exist_ok=True)

SIDES = 24
# Chains and thread rings vanish at map scale; they quadruple the triangle count.
CHAINS = False
THREAD_RINGS = 1


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def lathe(bm, profile, sides=SIDES, matrix=Matrix()):
    """Spins (radius, z) points around z. Endpoints at radius 0 close the shape."""
    rings = []
    for i in range(sides):
        angle = 2 * math.pi * i / sides
        ring = []
        for radius, z in profile:
            point = Vector((radius * math.cos(angle), radius * math.sin(angle), z))
            ring.append(bm.verts.new(matrix @ point))
        rings.append(ring)
    for i in range(sides):
        a, b = rings[i], rings[(i + 1) % sides]
        for j in range(len(profile) - 1):
            quad = [a[j], b[j], b[j + 1], a[j + 1]]
            # Points on the axis collapse a quad to a triangle.
            unique = list(dict.fromkeys(quad))
            if len(unique) >= 3 and len({v.co.to_tuple(5) for v in unique}) >= 3:
                bm.faces.new(unique)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)


def along(axis, origin):
    """Matrix taking a z-up local frame to one pointing along `axis` from `origin`."""
    rotation = {
        "z": Matrix(),
        "x": Matrix.Rotation(math.pi / 2, 4, "Y"),
        "y": Matrix.Rotation(-math.pi / 2, 4, "X"),
        "-y": Matrix.Rotation(math.pi / 2, 4, "X"),
    }[axis]
    return Matrix.Translation(origin) @ rotation


def cylinder(bm, matrix, radius, z0, z1, sides=SIDES):
    lathe(bm, [(0, z0), (radius, z0), (radius, z1), (0, z1)], sides, matrix)


def barrel_profile():
    # Base flange bolted to the standpipe, a tapered barrel, the wider nozzle section, the upper
    # flange and the domed bonnet of the NYC hydrant.
    return [
        (0.0, 0.0),
        (0.165, 0.0),
        (0.165, 0.045),
        (0.13, 0.055),
        (0.112, 0.075),
        (0.105, 0.28),
        (0.118, 0.32),
        (0.122, 0.52),
        (0.112, 0.56),
        (0.142, 0.565),
        (0.142, 0.605),
        (0.118, 0.612),
        (0.112, 0.66),
        (0.095, 0.7),
        (0.07, 0.72),
        (0.0, 0.725),
    ]


NOZZLES = [
    # axis, height, boss radius, cap radius, reach of the cap face from the barrel axis
    ("x", 0.40, 0.07, 0.078, 0.235),
    ("y", 0.44, 0.05, 0.056, 0.205),
    ("-y", 0.44, 0.05, 0.056, 0.205),
]


def torus(bm, matrix, major, minor, segments=8, sides=4):
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new(matrix @ Vector((r * math.cos(a), r * math.sin(a) * 1.5, minor * math.sin(b)))))
        rings.append(ring)
    for i in range(segments):
        for j in range(sides):
            a, b = rings[i], rings[(i + 1) % segments]
            bm.faces.new([a[j], b[j], b[(j + 1) % sides], a[(j + 1) % sides]])


def chain(bm, start, end, links=4):
    """Links hanging in a sag from the cap to the ear cast on the barrel, alternately turned."""
    direction = (end - start).normalized()
    for k in range(links):
        t = (k + 0.5) / links
        center = start.lerp(end, t) - Vector((0, 0, 0.03 * math.sin(math.pi * t)))
        frame = direction.to_track_quat("Y", "Z").to_matrix().to_4x4()
        twist = Matrix.Rotation(math.pi / 2 * (k % 2), 4, "Y")
        torus(bm, Matrix.Translation(center) @ frame @ twist, 0.008, 0.0025)


def build_body():
    bm = bmesh.new()
    lathe(bm, barrel_profile())
    # Hex bolts on the base flange and the upper flange.
    for count, radius, z, height in [(8, 0.145, 0.045, 0.018), (8, 0.128, 0.605, 0.014)]:
        for i in range(count):
            angle = 2 * math.pi * (i + 0.5) / count
            origin = Vector((radius * math.cos(angle), radius * math.sin(angle), z))
            cylinder(bm, Matrix.Translation(origin), 0.012, 0, height, sides=6)
    for axis, height, boss, cap, reach in NOZZLES:
        matrix = along(axis, Vector((0, 0, height)))
        # Cast boss out of the barrel, a collar, then the threaded outlet.
        cylinder(bm, matrix, boss, 0.06, reach - 0.06)
        cylinder(bm, matrix, boss * 1.18, reach - 0.06, reach - 0.045)
        for k in range(THREAD_RINGS):
            z = reach - 0.042 + k * 0.009
            cylinder(bm, matrix, boss * 0.92, z, z + 0.006, sides=12)
        # Chain from the cap down to an ear cast on the barrel below the nozzle.
        out = matrix.to_3x3() @ Vector((0, 0, 1))
        base = Vector((0, 0, height))
        ear = base + out * 0.115 - Vector((0, 0, 0.1))
        if CHAINS:
            cylinder(bm, Matrix.Translation(ear) @ along(axis, Vector()), 0.014, -0.02, 0.012, sides=8)
        if CHAINS:
            chain(bm, base + out * (reach + 0.005) - Vector((0, 0, cap * 0.8)), ear + out * 0.012)
    return bm


def build_trim():
    bm = bmesh.new()
    for axis, height, boss, cap, reach in NOZZLES:
        matrix = along(axis, Vector((0, 0, height)))
        lathe(
            bm,
            [(0, reach - 0.015), (cap, reach - 0.015), (cap, reach + 0.012), (cap * 0.9, reach + 0.02), (0, reach + 0.02)],
            matrix=matrix,
        )
        # Pentagon nut on each cap, turned with the same wrench as the operating nut.
        cylinder(bm, matrix, cap * 0.42, reach + 0.02, reach + 0.042, sides=5)
    # Weather cap over the bonnet and the pentagon operating nut.
    lathe(bm, [(0, 0.712), (0.082, 0.712), (0.088, 0.73), (0.075, 0.752), (0.045, 0.76), (0, 0.761)])
    cylinder(bm, Matrix(), 0.034, 0.76, 0.805, sides=5)
    return bm


def to_object(bm, name):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    obj.select_set(False)
    return obj


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


reset()
body = to_object(build_body(), "body")
trim = to_object(build_trim(), "trim")
print(f"new hydrant: {triangles(body) + triangles(trim)} triangles")

for obj in (body, trim):
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "hydrant.glb"),
    use_selection=True,
    export_format="GLB",
    export_materials="NONE",
    export_apply=True,
    export_yup=True,
)
print(f"wrote {OUT / 'hydrant.glb'}: {(OUT / 'hydrant.glb').stat().st_size} bytes")
