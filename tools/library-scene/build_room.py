"""Builds Origami's 3D library room in Blender and renders it.

Run with Blender 5.x:
  blender -b --factory-startup -P tools/library-scene/build_room.py -- \
      --assets <folder with Poly Haven assets> --out public/library-themes/<theme> [--preview] [--only bg_day] [--json-only]

Renders, from one fixed camera:
  bg_<variant>.webp     the room as the reader sees it (AgX), shelves empty
  light_<variant>.png   white planes in front of every shelf row, lit like the
                        room (Standard view, scaled down by LIGHT_SCALE); the app
                        lights its live 3D books with these so they match the room
variants: day, night, night_dim (night with flames at 75%, for flicker)
and scene.json: camera and shelf geometry for the app (Blender coordinates).
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument("--assets", required=True)
args.add_argument("--out", required=True)
args.add_argument("--preview", action="store_true")
args.add_argument("--only", nargs="*")
args.add_argument("--save-blend", action="store_true")
args.add_argument("--json-only", action="store_true", help="write scene.json without rendering")
opt = args.parse_args(sys.argv[sys.argv.index("--") + 1:])
ASSETS = Path(opt.assets).resolve()
OUT = Path(opt.out).resolve()
OUT.mkdir(parents=True, exist_ok=True)

# --- Layout (metres; camera looks along +Y) ---------------------------------
ROOM = dict(x0=-3.6, x1=3.6, y0=-7.0, y1=2.0, z1=4.2)
CASE = dict(x0=-3.1, x1=2.3, front=1.62, back=1.98, top=3.20)
BOARD_TOPS = [0.16, 0.60, 1.04, 1.48, 1.92, 2.36, 2.80]
BOARD_T = 0.035
DIVIDER_T = 0.05
SPINE_Y = CASE["front"] + 0.015
WINDOW = dict(y0=-0.05, y1=1.35, z0=0.70, z1=3.55)
CAMERA = dict(loc=(1.25, -5.4, 1.52), target=(-0.55, 1.6, 1.68), lens=30.0)
RES = (3840, 2160)
LIGHT_SCALE = 4.0  # light passes are stored at 1/4 so sunlit spots fit in 8 bits

scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


# --- Helpers -----------------------------------------------------------------
def tex_image(nodes, path, colour):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path), check_existing=True)
    node.image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    node.projection = "BOX"
    node.projection_blend = 0.25
    return node


def pbr(name, folder, tile=1.0, tint=None, rough_mul=1.0, bump=1.0):
    """A Poly Haven texture set, box-projected in world space (tile = metres)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / tile, 1 / tile, 1 / tile)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    base = ASSETS / "textures" / folder
    diff = tex_image(nodes, next(base.glob("diff.*")), True)
    links.new(mapping.outputs["Vector"], diff.inputs["Vector"])
    if tint:
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        links.new(diff.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = (*tint, 1)
        links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        links.new(diff.outputs["Color"], bsdf.inputs["Base Color"])
    rough_files = list(base.glob("rough.*"))
    if rough_files:
        rough = tex_image(nodes, rough_files[0], False)
        links.new(mapping.outputs["Vector"], rough.inputs["Vector"])
        math_node = nodes.new("ShaderNodeMath")
        math_node.operation = "MULTIPLY"
        math_node.inputs[1].default_value = rough_mul
        links.new(rough.outputs["Color"], math_node.inputs[0])
        links.new(math_node.outputs["Value"], bsdf.inputs["Roughness"])
    nor_files = list(base.glob("nor_gl.*"))
    if nor_files:
        nor = tex_image(nodes, nor_files[0], False)
        links.new(mapping.outputs["Vector"], nor.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = bump
        links.new(nor.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def flat(name, colour, rough=0.5, metal=0.0, emit=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


BOXES = []


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.0):
    BOXES.append((name, [x0, x1, y0, y1, z0, z1]))
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return obj


def import_model(name, location, rotation_z=0.0, scale=1.0):
    folder = ASSETS / "models" / name
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(next(folder.glob("*.gltf"))))
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    root.location = location
    root.rotation_euler = (0, 0, rotation_z)
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return root, new


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


# --- Materials ----------------------------------------------------------------
walnut = pbr("walnut", "dark_wood", tile=1.2, tint=(0.55, 0.36, 0.24), rough_mul=0.75, bump=0.6)
walnut_back = pbr("walnut_back", "dark_wood", tile=1.0, tint=(0.32, 0.21, 0.14), rough_mul=0.9, bump=0.4)
parquet = pbr("parquet", "herringbone_parquet", tile=2.6, tint=(0.82, 0.68, 0.55), rough_mul=0.8)
plaster = pbr("plaster", "beige_wall_001", tile=3.0, tint=(0.40, 0.47, 0.37), bump=0.15)
ceiling_mat = flat("ceiling", (0.82, 0.78, 0.70), rough=0.9)
trim = flat("window_trim", (0.86, 0.83, 0.76), rough=0.45)
brass = flat("brass", (0.80, 0.58, 0.28), rough=0.3, metal=1.0)
rug_mat = flat("rug", (0.075, 0.022, 0.022), rough=0.97)
rug_border = flat("rug_border", (0.22, 0.15, 0.07), rough=0.95)

# --- Room shell (two tall windows in the left wall) ---------------------------
R, W = ROOM, WINDOW
# The second window, out of frame, throws the long sun shaft across the shelves.
WINDOWS = [dict(y0=-3.0, y1=-1.6, z0=W["z0"], z1=W["z1"]), W]
box("floor", R["x0"], R["x1"], R["y0"], R["y1"], -0.1, 0.0, parquet)
box("ceiling", R["x0"], R["x1"], R["y0"], R["y1"], R["z1"], R["z1"] + 0.1, ceiling_mat)
box("wall_back", R["x0"], R["x1"], R["y1"], R["y1"] + 0.1, 0, R["z1"], plaster)
box("wall_right", R["x1"], R["x1"] + 0.1, R["y0"], R["y1"], 0, R["z1"], plaster)
box("wall_front", R["x0"], R["x1"], R["y0"] - 0.1, R["y0"], 0, R["z1"], plaster)
wx0, wx1 = R["x0"] - 0.25, R["x0"]
edges = [R["y0"]] + [v for win in WINDOWS for v in (win["y0"], win["y1"])] + [R["y1"]]
for i in range(0, len(edges), 2):
    box(f"wall_left_{i}", wx0, wx1, edges[i], edges[i + 1], 0, R["z1"], plaster)
f = 0.06
for n, win in enumerate(WINDOWS):
    box(f"wall_left_sill_{n}", wx0, wx1, win["y0"], win["y1"], 0, win["z0"], plaster)
    box(f"wall_left_head_{n}", wx0, wx1, win["y0"], win["y1"], win["z1"], R["z1"], plaster)
    # Frame, mullion and transoms (open panes let the sun through cleanly).
    box(f"win_sill_{n}", wx0 - 0.02, wx1 + 0.08, win["y0"] - 0.08, win["y1"] + 0.08, win["z0"] - 0.05, win["z0"], trim, 0.01)
    box(f"win_left_{n}", wx0, wx1 + 0.03, win["y0"], win["y0"] + f, win["z0"], win["z1"], trim)
    box(f"win_right_{n}", wx0, wx1 + 0.03, win["y1"] - f, win["y1"], win["z0"], win["z1"], trim)
    box(f"win_top_{n}", wx0, wx1 + 0.03, win["y0"], win["y1"], win["z1"] - f, win["z1"], trim)
    mid_y = (win["y0"] + win["y1"]) / 2
    box(f"win_mullion_{n}", wx0 + 0.08, wx0 + 0.13, mid_y - 0.025, mid_y + 0.025, win["z0"], win["z1"], trim)
    for i in range(1, 5):
        z = win["z0"] + (win["z1"] - win["z0"]) * i / 5
        box(f"win_transom_{n}_{i}", wx0 + 0.08, wx0 + 0.13, win["y0"], win["y1"], z - 0.02, z + 0.02, trim)
# Walnut wainscoting with a chair rail, and a crown moulding under the ceiling.
WAINSCOT = 1.05
for name, x0, x1, y0, y1 in [("back_l", R["x0"], CASE["x0"] - 0.1, R["y1"] - 0.03, R["y1"]),
                             ("back_r", CASE["x1"] + 0.1, R["x1"], R["y1"] - 0.03, R["y1"]),
                             ("right", R["x1"] - 0.03, R["x1"], R["y0"], R["y1"])]:
    box(f"wainscot_{name}", x0, x1, y0, y1, 0, WAINSCOT, walnut, 0.004)
    box(f"chair_rail_{name}", x0, x1, y0 - 0.02, y1, WAINSCOT, WAINSCOT + 0.05, walnut, 0.008)
for n, (y0, y1) in enumerate(zip(edges[0::2], edges[1::2])):
    box(f"wainscot_left_{n}", R["x0"], R["x0"] + 0.03, y0, y1, 0, WAINSCOT, walnut, 0.004)
    box(f"chair_rail_left_{n}", R["x0"], R["x0"] + 0.05, y0, y1, WAINSCOT, WAINSCOT + 0.05, walnut, 0.008)
for name, x0, x1, y0, y1 in [("back", R["x0"], R["x1"], R["y1"] - 0.14, R["y1"]),
                             ("left", R["x0"], R["x0"] + 0.14, R["y0"], R["y1"]),
                             ("right", R["x1"] - 0.14, R["x1"], R["y0"], R["y1"])]:
    box(f"crown_{name}", x0, x1, y0, y1, R["z1"] - 0.16, R["z1"], trim, 0.02)
# Skirting and a rug.
box("rug_border", -2.1, 1.7, -3.5, 1.0, 0.0, 0.010, rug_border)
box("rug", -1.95, 1.55, -3.35, 0.85, 0.0, 0.013, rug_mat)

# --- Bookcase -----------------------------------------------------------------
C = CASE
bay_w = (C["x1"] - C["x0"] - 4 * DIVIDER_T) / 3
box("case_back", C["x0"], C["x1"], C["back"], R["y1"], 0, C["top"], walnut_back)
box("case_plinth", C["x0"] - 0.03, C["x1"] + 0.03, C["front"] - 0.03, C["back"], 0, BOARD_TOPS[0], walnut, 0.008)
box("case_top", C["x0"] - 0.05, C["x1"] + 0.05, C["front"] - 0.05, C["back"], C["top"], C["top"] + 0.06, walnut, 0.01)
box("case_cornice", C["x0"] - 0.10, C["x1"] + 0.10, C["front"] - 0.12, C["back"], C["top"] + 0.06, C["top"] + 0.22, walnut, 0.02)
box("case_crown", C["x0"] - 0.14, C["x1"] + 0.14, C["front"] - 0.16, C["back"], C["top"] + 0.22, C["top"] + 0.27, walnut, 0.015)
bays = []
x = C["x0"]
for d in range(4):
    box(f"case_divider_{d}", x, x + DIVIDER_T, C["front"], C["back"], 0, C["top"], walnut)
    box(f"case_stile_{d}", x - 0.012, x + DIVIDER_T + 0.012, C["front"] - 0.025, C["front"], BOARD_TOPS[0], C["top"], walnut, 0.006)
    if d < 3:
        bays.append((x + DIVIDER_T, x + DIVIDER_T + bay_w))
        x += DIVIDER_T + bay_w
for b, (bx0, bx1) in enumerate(bays):
    for r, z in enumerate(BOARD_TOPS[1:], start=1):
        box(f"case_board_{b}_{r}", bx0, bx1, C["front"], C["back"], z - BOARD_T, z, walnut)
        box(f"case_lip_{b}_{r}", bx0, bx1, C["front"] - 0.02, C["front"], z - BOARD_T - 0.012, z, walnut, 0.005)

shelves = []
for b, (bx0, bx1) in enumerate(bays):
    for r, z in enumerate(BOARD_TOPS):
        ceiling_z = (BOARD_TOPS[r + 1] - BOARD_T) if r + 1 < len(BOARD_TOPS) else C["top"]
        # Kept clear of the dividers and the front stiles that overlap the bay.
        shelves.append({"bay": b, "row": r, "x0": bx0 + 0.018, "x1": bx1 - 0.018, "z": z,
                        "height": round(ceiling_z - z, 4), "spineY": SPINE_Y,
                        "depth": round(C["back"] - SPINE_Y - 0.02, 4)})

# --- Furniture and props (kept clear of the shelves as seen from the camera) --
props = {}
try:
    root, objs = import_model("ClassicConsole_01", (R["x0"] + 0.32, -1.25, 0), math.radians(-90))
    props["console"] = bounds(objs)
    lo, hi = props["console"]
    candle_root, candle_objs = import_model("brass_candleholders", ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z), math.radians(-90), 0.9)
    props["candles"] = bounds(candle_objs)
except Exception as error:  # a prop failing must not stop the render
    print("console/candles skipped:", error)
try:
    # In front of the window, clear of the bookcase (which starts at CASE x0).
    root, objs = import_model("potted_plant_02", (R["x0"] + 0.38, 0.85, 0), math.radians(-30), 1.2)
    lo, hi = bounds(objs)
    assert hi.x < CASE["x0"] - 0.02 or hi.y < CASE["front"] - 0.02, "plant overlaps the bookcase"
except Exception as error:
    print("plant skipped:", error)
try:
    root, objs = import_model("ArmChair_01", (2.95, -1.4, 0), math.radians(-125))
    props["chair"] = bounds(objs)
    root2, objs2 = import_model("vintage_oil_lamp", (3.25, -0.35, 0.0), 0)
    root3, objs3 = import_model("potted_plant_02", (2.95, 1.55, 0), math.radians(40), 1.45)
except Exception as error:
    print("chair skipped:", error)
try:
    root, objs = import_model("Chandelier_01", (-0.4, -1.4, 0), 0)
    lo, hi = bounds(objs)
    root.location.z = R["z1"] - (hi.z - lo.z) - 0.02
    bpy.context.view_layer.update()
    props["chandelier"] = bounds(objs)
except Exception as error:
    print("chandelier skipped:", error)

# --- Atmosphere ---------------------------------------------------------------
haze = bpy.data.materials.new("haze")
haze.use_nodes = True
nt = haze.node_tree
nt.nodes.remove(nt.nodes["Principled BSDF"])
vol = nt.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Density"].default_value = 0.022
vol.inputs["Anisotropy"].default_value = 0.55
vol.inputs["Color"].default_value = (1.0, 0.97, 0.92, 1)
nt.links.new(vol.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
haze_box = box("haze", R["x0"] + 0.01, R["x1"] - 0.01, R["y0"] + 0.01, R["y1"] - 0.01, 0.01, R["z1"] - 0.01, haze)
haze_box.visible_shadow = True

# --- Lights -------------------------------------------------------------------
def light(name, kind, location, energy, colour, size=0.05):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = colour
    if kind in ("POINT", "SPOT"):
        data.shadow_soft_size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    return obj


sun = light("sun", "SUN", (0, 0, 10), 11.0, (1.0, 0.92, 0.80))
sun_dir = Vector((1.0, 0.80, -0.36)).normalized()
sun.rotation_euler = sun_dir.to_track_quat("-Z", "Y").to_euler()
sun.data.angle = math.radians(0.8)
moon = light("moon", "SUN", (0, 0, 10), 2.6, (0.52, 0.66, 1.0))
moon.rotation_euler = Vector((1.0, 0.3, -0.75)).normalized().to_track_quat("-Z", "Y").to_euler()
moon.data.angle = math.radians(2.0)
# Light spilling in from the open window for the daytime sky.
sky_fill = light("sky_fill", "AREA", (R["x0"] - 0.05, (W["y0"] + W["y1"]) / 2, (W["z0"] + W["z1"]) / 2), 260, (0.85, 0.9, 1.0))
sky_fill.data.shape = "RECTANGLE"
sky_fill.data.size = W["y1"] - W["y0"]
sky_fill.data.size_y = W["z1"] - W["z0"]
sky_fill.rotation_euler = (0, math.radians(-90), 0)  # area lights shine along -Z; this faces +X, into the room

flames = []
flame_colour = (1.0, 0.55, 0.22)
if "candles" in props:
    lo, hi = props["candles"]
    for i, t in enumerate((0.2, 0.5, 0.8)):
        flames.append(light(f"candle_{i}", "POINT", (lo.x + (hi.x - lo.x) * 0.5, lo.y + (hi.y - lo.y) * t, hi.z + 0.04), 9, flame_colour, 0.015))
if "chandelier" in props:
    lo, hi = props["chandelier"]
    c = (lo + hi) / 2
    radius = (hi.x - lo.x) * 0.38
    for i in range(6):
        a = i * math.tau / 6
        flames.append(light(f"chandelier_{i}", "POINT", (c.x + radius * math.cos(a), c.y + radius * math.sin(a), lo.z + (hi.z - lo.z) * 0.45), 9, flame_colour, 0.02))
flames.append(light("oil_lamp", "POINT", (3.25, -0.35, 0.55), 30, (1.0, 0.6, 0.28), 0.04))
# Brass picture lights over each bay: electric, so they stay steady at night.
bay_lights = []
lamp_glow = flat("lamp_glow", (1.0, 0.85, 0.6), rough=0.4, emit=(1.0, 0.78, 0.5), strength=6.0)
for b, (bx0, bx1) in enumerate(bays):
    cx = (bx0 + bx1) / 2
    box(f"bay_lamp_arm_{b}", cx - 0.02, cx + 0.02, C["front"] - 0.20, C["front"] - 0.02, C["top"] - 0.02, C["top"] + 0.02, brass)
    box(f"bay_lamp_{b}", cx - 0.38, cx + 0.38, C["front"] - 0.26, C["front"] - 0.18, C["top"] - 0.06, C["top"] + 0.0, brass, 0.01)
    box(f"bay_lamp_lens_{b}", cx - 0.36, cx + 0.36, C["front"] - 0.255, C["front"] - 0.185, C["top"] - 0.064, C["top"] - 0.058, lamp_glow)
    lamp = light(f"bay_light_{b}", "AREA", (cx, C["front"] - 0.22, C["top"] - 0.07), 75, (1.0, 0.78, 0.52))
    lamp.data.shape = "RECTANGLE"
    lamp.data.size = 0.72
    lamp.data.size_y = 0.06
    lamp.data.spread = math.radians(110)
    lamp.rotation_euler = Vector((0, 0.38, -1.0)).normalized().to_track_quat("-Z", "Y").to_euler()
    bay_lights.append(lamp)
reading_glow = light("reading_glow", "AREA", (0.2, -2.2, 3.6), 0, (1.0, 0.7, 0.45))
reading_glow.data.size = 2.5

# --- World ----------------------------------------------------------------------
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
wn = world.node_tree
env = wn.nodes.new("ShaderNodeTexEnvironment")
bg = wn.nodes["Background"]
wn.links.new(env.outputs["Color"], bg.inputs["Color"])


def set_world(hdri, strength):
    env.image = bpy.data.images.load(str(ASSETS / "hdri" / hdri), check_existing=True)
    bg.inputs["Strength"].default_value = strength


# --- Camera -----------------------------------------------------------------------
cam_data = bpy.data.cameras.new("camera")
cam_data.lens = CAMERA["lens"]
cam_data.sensor_width = 36
cam_data.sensor_fit = "HORIZONTAL"
cam = bpy.data.objects.new("camera", cam_data)
scene.collection.objects.link(cam)
cam.location = CAMERA["loc"]
cam.rotation_euler = (Vector(CAMERA["target"]) - Vector(CAMERA["loc"])).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
bpy.context.view_layer.update()

# --- Light-pass planes ----------------------------------------------------------
white = bpy.data.materials.new("lightpass_white")
white.use_nodes = True
wnodes = white.node_tree.nodes
wnodes.remove(wnodes["Principled BSDF"])
diffuse = wnodes.new("ShaderNodeBsdfDiffuse")
diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
white.node_tree.links.new(diffuse.outputs["BSDF"], wnodes["Material Output"].inputs["Surface"])
planes = []
for s in shelves:
    p = box(f"lp_{s['bay']}_{s['row']}", s["x0"], s["x1"], s["spineY"] - 0.001, s["spineY"], s["z"] + 0.002, s["z"] + s["height"] - 0.004, white)
    planes.append(p)

# --- Render settings --------------------------------------------------------------
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPTIX"
scene.cycles.max_bounces = 8
scene.cycles.volume_bounces = 1
scene.cycles.sample_clamp_indirect = 8.0
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.film_transparent = False


def colour_view(standard):
    vs = scene.view_settings
    vs.view_transform = "Standard" if standard else "AgX"
    try:
        vs.look = "None"
    except TypeError:
        pass


def set_variant(name):
    day = name == "day"
    set_world("symmetrical_garden_02.hdr" if day else "moonlit_golf.hdr", 1.0 if day else 0.06)
    sun.hide_render = not day
    sky_fill.hide_render = not day
    moon.hide_render = day
    vol.inputs["Density"].default_value = 0.014 if day else 0.009
    flame_scale = 0.0 if day else (0.75 if name == "night_dim" else 1.0)
    for fl in flames:
        fl.hide_render = day
        base = fl.get("base_energy") or fl.data.energy
        fl["base_energy"] = base
        fl.data.energy = base * flame_scale
    reading_glow.hide_render = True
    for lamp in bay_lights:
        lamp.hide_render = day
    scene.view_settings.exposure = 1.3 if day else 0.6


def render(path, light_pass):
    for o in scene.objects:
        if o.type == "MESH":
            o.visible_camera = (o in planes) if light_pass else (o not in planes)
            if o in planes and not light_pass:
                o.hide_render = True
            elif o in planes:
                o.hide_render = False
    colour_view(light_pass)
    scene.render.film_transparent = light_pass
    if light_pass:
        scene.view_settings.exposure = -math.log2(LIGHT_SCALE)
    scene.render.resolution_percentage = 50 if light_pass else 100
    if opt.preview:
        scene.render.resolution_percentage = 25 if not light_pass else 20
    scene.cycles.samples = (64 if opt.preview else 160) if light_pass else (64 if opt.preview else 384)
    img = scene.render.image_settings
    if light_pass:
        img.file_format = "PNG"
        img.color_mode = "RGBA"
        img.color_depth = "8"
    else:
        img.file_format = "WEBP"
        img.color_mode = "RGB"
        img.quality = 88
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


jobs = [] if opt.json_only else [(v, lp) for v in ("day", "night", "night_dim") for lp in (False, True)]
for variant, light_pass in jobs:
    stem = ("light_" if light_pass else "bg_") + variant
    if opt.only and stem not in opt.only:
        continue
    set_variant(variant)
    render(OUT / (stem + (".png" if light_pass else ".webp")), light_pass)

# --- Theme card previews (640 x 360) --------------------------------------------
for variant in ("day", "night"):
    source = OUT / f"bg_{variant}.webp"
    if source.is_file():
        image = bpy.data.images.load(str(source))
        image.scale(640, 360)
        image.filepath_raw = str(OUT / f"preview_{variant}.webp")
        image.file_format = "WEBP"
        image.save()

# --- Scene description for the app ---------------------------------------------
fov_h = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
fov_v = 2 * math.atan(math.tan(fov_h / 2) * RES[1] / RES[0])
data = {
    "version": 1,
    "units": "metres, Blender axes (Z up)",
    "image": {"width": RES[0], "height": RES[1]},
    "camera": {"matrixWorld": [list(row) for row in cam.matrix_world], "fovV": math.degrees(fov_v)},
    "lightScale": LIGHT_SCALE,
    "exposure": {"day": 1.3, "night": 0.6},
    "shelves": shelves,
    # Bookcase parts that can hide books: the app draws them depth-only so
    # books behind dividers, stiles and boards are cut exactly as in the render.
    "occluders": [b for n, b in BOXES if n.startswith(("case_divider", "case_stile", "case_board", "case_lip", "case_top", "case_cornice", "case_crown", "case_plinth"))],
}
(OUT / "scene.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
if opt.save_blend:
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "library.blend"))
print("done")
