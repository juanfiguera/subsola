"""
Street cutaway for the link preview image (public/og.png).

blender -b -P models/preview/cutaway.py -- <out>/cutaway.png public/models/hydrant.glb
magick <out>/cutaway.png -trim +repage models/preview/cutaway-trim.png
Then open models/preview/og.html at a 1200x630 viewport and screenshot it.
"""
import math, sys
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out, hydrant = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def hexc(h, a=1):
    h = h.lstrip("#"); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    # Blender colors are linear.
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (a,)

def mat(h, rough=0.85):
    m = bpy.data.materials.new(h); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hexc(h); b.inputs["Roughness"].default_value = rough
    return m

def box(lo, hi, m):
    lo, hi = Vector(lo), Vector(hi)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(lo + hi) / 2)
    o = bpy.context.active_object; o.scale = hi - lo; o.data.materials.append(m)
    return o

def pipe(y, z, r, h, x0=-3.2, x1=7):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, end_fill_type='NOTHING', radius=r, depth=x1 - x0, location=((x0 + x1) / 2, y, z), rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object; o.data.materials.append(mat(h, 0.6)); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    # A lighter coupling sleeve at the cut, like the app's fittings.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r * 1.16, depth=0.32, location=(x0 + 0.12, y, z), rotation=(0, math.pi / 2, 0))
    s = bpy.context.active_object
    c = [int(h.lstrip("#")[i:i+2], 16) for i in (0, 2, 4)]
    s.data.materials.append(mat("#%02x%02x%02x" % tuple(round(v + (255 - v) * 0.28) for v in c), 0.6))
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))

# Soil block cut open at x = 0, the roadbed on top, sidewalks raised at the curbs.
box((0, -4, -3.0), (7, 4, -0.25), mat("#d9d1c4"))
box((0, -2.9, -0.25), (7, 2.9, 0), mat("#c9ced6"))
box((0, -4, -0.25), (7, -2.9, 0.15), mat("#eef0f3"))
box((0, 2.9, -0.25), (7, 4, 0.15), mat("#eef0f3"))
for x in (0.4, 2.4, 4.4):
    box((x, -0.06, 0), (x + 1.1, 0.06, 0.005), mat("#ffffff"))

# Utilities in APWA colors at roughly their standard depths, stretched like the app's depth view.
pipe(-2.3, -0.75, 0.16, "#e3262b")
pipe(-1.3, -0.95, 0.15, "#f2c200")
pipe(-0.45, -0.7, 0.14, "#f47c20")
pipe(0.9, -1.45, 0.24, "#1f6fd1")
pipe(2.0, -2.25, 0.4, "#2e9a48")

bpy.ops.import_scene.gltf(filepath=hydrant)
silver, blue = mat("#c4c9d0", 0.45), mat("#1f6fd1", 0.5)
for o in bpy.context.selected_objects:
    if o.type != "MESH": continue
    o.data.materials.clear(); o.data.materials.append(blue if "trim" in o.name else silver)
    o.location = (0.9, -3.4, 0.15); o.scale = (2.2, 2.2, 2.2)
    o.rotation_euler[2] = math.pi / 2

scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 96
scene.render.resolution_x, scene.render.resolution_y = 1400, 1260
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); scene.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 2.2; sun.data.angle = math.radians(6)
sun.rotation_euler = (math.radians(35), 0, math.radians(-60)); scene.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
cam.data.type = "ORTHO"; cam.data.ortho_scale = 11.5
cam.location = (-10, -9, 6.5); cam.rotation_euler = (Vector((1.4, 0.3, -1.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
