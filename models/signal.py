"""
NYC traffic signal for Subsola: a mast-arm pole on the corner with two heads over the street.

Run: pnpm models (blender -b -P models/signal.py -- public/models [preview.png])
Writes signal.glb with meshes "pole", "heads" and "lenses", read by src/scene/glb.ts. Given a
PNG path, also renders a preview there.

Meters, z up, origin at the foot of the pole. The arm reaches along +x over the intersection and
the heads face -y, toward traffic coming up the cross street. True size: the app scales it down
with the street lamps so it doesn't tower over the low building massing.
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
OUT = Path(argv[0])
PREVIEW = Path(argv[1]) if len(argv) > 1 else None
OUT.mkdir(parents=True, exist_ok=True)

SIDES = 12
POLE_HEIGHT = 6.6
ARM_HEIGHT = 5.7
ARM_REACH = 5.2
# Heads hang this far out along the arm, over the near and far lanes.
HEAD_AT = (2.9, 4.7)


def lathe(bm, profile, sides=SIDES, matrix=Matrix()):
    """Spins (radius, z) points around z. Endpoints at radius 0 close the shape."""
    rings = []
    for i in range(sides):
        angle = 2 * math.pi * (i + 0.5) / sides
        rings.append([bm.verts.new(matrix @ Vector((r * math.cos(angle), r * math.sin(angle), z))) for r, z in profile])
    for i in range(sides):
        a, b = rings[i], rings[(i + 1) % sides]
        for j in range(len(profile) - 1):
            unique = list(dict.fromkeys([a[j], b[j], b[j + 1], a[j + 1]]))
            if len({v.co.to_tuple(5) for v in unique}) >= 3:
                bm.faces.new(unique)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)


def tube(bm, start, end, r0, r1, sides=SIDES):
    """A closed, tapered tube from `start` to `end`."""
    direction = end - start
    rotation = direction.to_track_quat("Z", "Y").to_matrix().to_4x4()
    length = direction.length
    lathe(bm, [(0, 0), (r0, 0), (r1, length), (0, length)], sides, Matrix.Translation(start) @ rotation)


def box(bm, center, size):
    geometry = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=geometry["verts"])
    bmesh.ops.translate(bm, vec=center, verts=geometry["verts"])


def build_pole():
    bm = bmesh.new()
    # Cast base, then the tapered shaft and a ball finial.
    lathe(bm, [(0, 0), (0.24, 0), (0.24, 0.06), (0.2, 0.1), (0.17, 0.55), (0.2, 0.6), (0, 0.6)], sides=8)
    tube(bm, Vector((0, 0, 0.55)), Vector((0, 0, POLE_HEIGHT)), 0.12, 0.085)
    lathe(bm, [(0, POLE_HEIGHT), (0.06, POLE_HEIGHT + 0.03), (0.07, POLE_HEIGHT + 0.09), (0.04, POLE_HEIGHT + 0.15), (0, POLE_HEIGHT + 0.16)], sides=8)
    # The arm rises a little toward its tip, with a tie rod from the top of the pole.
    tip = Vector((ARM_REACH, 0, ARM_HEIGHT + 0.35))
    tube(bm, Vector((0, 0, ARM_HEIGHT)), tip, 0.075, 0.045)
    tube(bm, Vector((0, 0, POLE_HEIGHT - 0.25)), Vector((ARM_REACH * 0.55, 0, ARM_HEIGHT + 0.2)), 0.022, 0.022, sides=6)
    box(bm, Vector((0.1, 0, ARM_HEIGHT)), Vector((0.12, 0.26, 0.4)))
    # Hangers from the arm down to each head.
    for x in HEAD_AT:
        rise = 0.35 * x / ARM_REACH
        tube(bm, Vector((x, 0, ARM_HEIGHT + rise)), Vector((x, 0, ARM_HEIGHT + rise - 0.3)), 0.025, 0.025, sides=6)
    # The pedestrian signal and push button box, on the street side of the pole.
    box(bm, Vector((0.12, -0.2, 2.9)), Vector((0.08, 0.34, 0.36)))
    box(bm, Vector((0.13, 0, 1.05)), Vector((0.06, 0.1, 0.16)))
    return bm


def head_frames():
    """Each head's center, just under its hanger."""
    for x in HEAD_AT:
        rise = 0.35 * x / ARM_REACH
        yield Vector((x, 0, ARM_HEIGHT + rise - 0.3 - 0.55))


LIGHT_SPACING = 0.32


def visor(bm, light, radius=0.15, depth=0.22, segments=8):
    """The hood over a light: the top half of a tube, open below, reaching toward traffic (-y)."""
    rings = []
    for y in (light.y, light.y - depth):
        rings.append([
            bm.verts.new(Vector((light.x + radius * math.cos(a), y, light.z + radius * math.sin(a))))
            for a in (math.pi * i / segments for i in range(segments + 1))
        ])
    near, far = rings
    for i in range(segments):
        bm.faces.new([near[i], near[i + 1], far[i + 1], far[i]])


def build_heads():
    bm = bmesh.new()
    for center in head_frames():
        box(bm, center, Vector((0.36, 0.28, 1.04)))
        # Backplate behind the housing, so the head reads against the sky.
        box(bm, center + Vector((0, 0.15, 0)), Vector((0.58, 0.02, 1.2)))
        for k in (-1, 0, 1):
            visor(bm, center + Vector((0, -0.14, k * LIGHT_SPACING)))
    return bm


def build_lenses():
    bm = bmesh.new()
    for center in head_frames():
        for k in (-1, 0, 1):
            light = center + Vector((0, -0.145, k * LIGHT_SPACING))
            lens = Matrix.Translation(light) @ Matrix.Rotation(math.pi / 2, 4, "X")
            lathe(bm, [(0, 0.005), (0.11, 0.0), (0, -0.01)], sides=SIDES, matrix=lens)
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


bpy.ops.wm.read_factory_settings(use_empty=True)
parts = [to_object(build_pole(), "pole"), to_object(build_heads(), "heads"), to_object(build_lenses(), "lenses")]
print(f"signal: {sum(triangles(p) for p in parts)} triangles")

for obj in parts:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "signal.glb"),
    use_selection=True,
    export_format="GLB",
    export_materials="NONE",
    export_apply=True,
    export_yup=True,
)
print(f"wrote {OUT / 'signal.glb'}: {(OUT / 'signal.glb').stat().st_size} bytes")

if PREVIEW is None:
    sys.exit(0)

COLORS = {"pole": (150, 156, 163), "heads": (24, 27, 33), "lenses": (255, 238, 196)}
for obj in parts:
    material = bpy.data.materials.new(obj.name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*[c / 255 for c in COLORS[obj.name]], 1)
    shader.inputs["Roughness"].default_value = 0.5
    obj.data.materials.append(material)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "CYCLES"
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.92, 0.93, 0.95, 1)
bpy.ops.mesh.primitive_plane_add(size=20, location=(2.5, 0, 0))
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3
sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(150))
scene.collection.objects.link(sun)
camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
scene.collection.objects.link(camera)
camera.location = (9, -9, 6)
camera.rotation_euler = (Vector((2.4, 0, 3.4)) - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera
scene.render.filepath = str(PREVIEW)
bpy.ops.render.render(write_still=True)
print(f"rendered {PREVIEW}")
