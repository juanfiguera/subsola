import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGlbMeshes } from './glb';

/** A one-triangle GLB in glTF's y-up frame, the way Blender writes it. */
const triangleGlb = () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, -3]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0]);
  const bin = new Uint8Array(36 + 36 + 8);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(normals.buffer), 36);
  bin.set(new Uint8Array(indices.buffer), 72);
  const gltf = {
    meshes: [
      { name: 'body', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { byteOffset: 0, byteLength: 36 },
      { byteOffset: 36, byteLength: 36 },
      { byteOffset: 72, byteLength: 6 },
    ],
  };
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
  padded.set(json);
  json = padded;
  const out = new Uint8Array(12 + 8 + json.length + 8 + bin.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  view.setUint32(20 + json.length, bin.length, true);
  view.setUint32(24 + json.length, 0x004e4942, true);
  out.set(bin, 28 + json.length);
  return out.buffer;
};

describe('parseGlbMeshes', () => {
  it('reads a mesh by name and turns it z up', () => {
    const body = parseGlbMeshes(triangleGlb()).get('body')!;
    expect([...body.attributes.positions.value]).toEqual([0, 0, 0, 1, 0, 0, 0, 3, 2]);
    expect([...body.attributes.normals.value]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect([...body.indices.value]).toEqual([0, 1, 2]);
  });

  it('rejects a file that is not a GLB', () => {
    expect(() => parseGlbMeshes(new ArrayBuffer(16))).toThrow('not a binary glTF');
  });

  it('reads the shipped hydrant model', () => {
    const file = readFileSync(new URL('../../public/models/hydrant.glb', import.meta.url));
    const meshes = parseGlbMeshes(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.length),
    );
    const body = meshes.get('body')!;
    const positions = body.attributes.positions.value;
    const heights = positions.filter((_, i) => i % 3 === 2);
    // Stands on the street and is about 0.8 m tall, like the code-built one.
    expect(Math.min(...heights)).toBeCloseTo(0, 3);
    expect(Math.max(...heights)).toBeGreaterThan(0.6);
    expect(meshes.has('trim')).toBe(true);
  });

  it('reads the shipped signal model, arm along +x', () => {
    const file = readFileSync(new URL('../../public/models/signal.glb', import.meta.url));
    const meshes = parseGlbMeshes(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.length),
    );
    expect([...meshes.keys()].sort()).toEqual(['heads', 'lenses', 'pole']);
    const positions = meshes.get('pole')!.attributes.positions.value;
    const xs = positions.filter((_, i) => i % 3 === 0);
    const zs = positions.filter((_, i) => i % 3 === 2);
    // Standing on the street, the arm reaching about 5 m toward the intersection.
    expect(Math.min(...zs)).toBeCloseTo(0, 3);
    expect(Math.max(...xs)).toBeGreaterThan(5);
  });
});
