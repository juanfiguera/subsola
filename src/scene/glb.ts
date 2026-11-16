import { z } from 'zod';
import { toMesh, type MeshData } from './meshes';

/**
 * Reads the named meshes out of a binary glTF (.glb) exported from Blender, in the scene's
 * frame. Only what the fixture models use: one primitive per mesh with positions, normals and
 * indices, no transforms or materials. loaders.gl does all of glTF but would add about 50 KB of
 * code for this.
 */

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

const gltfSchema = z.object({
  meshes: z.array(
    z.object({
      name: z.string(),
      primitives: z
        .array(
          z.object({
            attributes: z.object({ POSITION: z.number(), NORMAL: z.number() }),
            indices: z.number(),
          }),
        )
        .min(1),
    }),
  ),
  accessors: z.array(
    z.object({
      bufferView: z.number(),
      byteOffset: z.number().default(0),
      componentType: z.number(),
      count: z.number(),
      type: z.string(),
    }),
  ),
  bufferViews: z.array(
    z.object({
      byteOffset: z.number().default(0),
      byteLength: z.number(),
      byteStride: z.number().optional(),
    }),
  ),
});

type Gltf = z.infer<typeof gltfSchema>;

const readAccessor = (gltf: Gltf, bin: DataView, index: number): number[] => {
  const accessor = gltf.accessors[index];
  if (!accessor) throw new Error(`glb: no accessor ${index}`);
  const view = gltf.bufferViews[accessor.bufferView];
  if (!view) throw new Error(`glb: no buffer view ${accessor.bufferView}`);
  const width = accessor.type === 'VEC3' ? 3 : accessor.type === 'SCALAR' ? 1 : 0;
  if (!width) throw new Error(`glb: unsupported accessor type ${accessor.type}`);
  const bytes =
    accessor.componentType === FLOAT || accessor.componentType === UNSIGNED_INT
      ? 4
      : accessor.componentType === UNSIGNED_SHORT
        ? 2
        : 0;
  if (!bytes) throw new Error(`glb: unsupported component type ${accessor.componentType}`);
  const stride = view.byteStride ?? width * bytes;
  const start = view.byteOffset + accessor.byteOffset;
  const values: number[] = [];
  for (let i = 0; i < accessor.count; i++) {
    for (let k = 0; k < width; k++) {
      const at = start + i * stride + k * bytes;
      values.push(
        accessor.componentType === FLOAT
          ? bin.getFloat32(at, true)
          : bytes === 4
            ? bin.getUint32(at, true)
            : bin.getUint16(at, true),
      );
    }
  }
  return values;
};

// glTF is y up; Blender exports its z-up (x, y, z) as (x, z, -y). The scene is z up.
const toZUp = (values: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 3)
    out.push(values[i]!, 0 - values[i + 2]!, values[i + 1]!);
  return out;
};

export const parseGlbMeshes = (buffer: ArrayBuffer): Map<string, MeshData> => {
  const data = new DataView(buffer);
  if (data.getUint32(0, true) !== GLB_MAGIC) throw new Error('glb: not a binary glTF file');
  let offset = 12;
  let json: unknown = null;
  let bin: DataView | null = null;
  while (offset < buffer.byteLength) {
    const length = data.getUint32(offset, true);
    const type = data.getUint32(offset + 4, true);
    const body = new Uint8Array(buffer, offset + 8, length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body));
    if (type === CHUNK_BIN) bin = new DataView(buffer, offset + 8, length);
    offset += 8 + length;
  }
  if (!bin) throw new Error('glb: no binary chunk');
  const gltf = gltfSchema.parse(json);
  return new Map(
    gltf.meshes.map((mesh) => {
      const primitive = mesh.primitives[0]!;
      return [
        mesh.name,
        toMesh(
          toZUp(readAccessor(gltf, bin, primitive.attributes.POSITION)),
          toZUp(readAccessor(gltf, bin, primitive.attributes.NORMAL)),
          readAccessor(gltf, bin, primitive.indices),
        ),
      ];
    }),
  );
};
