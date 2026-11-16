import { describe, expect, it } from 'vitest';
import { hydrantBodyMesh, linkKioskBodyMesh, streetLampPoleMesh } from './fixtureMeshes';

const bounds = (mesh: ReturnType<typeof streetLampPoleMesh>) => {
  const p = mesh.attributes.positions.value;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[i + k]!);
      max[k] = Math.max(max[k]!, p[i + k]!);
    }
  }
  return { min, max };
};

describe('fixture meshes', () => {
  it('reaches the davit arm out over the street, about 9 m up', () => {
    const { max } = bounds(streetLampPoleMesh());
    expect(max[0]).toBeGreaterThan(1.8);
    expect(max[2]).toBeGreaterThan(9.5);
  });

  it('gives every index a vertex', () => {
    for (const mesh of [streetLampPoleMesh(), hydrantBodyMesh(), linkKioskBodyMesh()]) {
      const count = mesh.attributes.positions.value.length / 3;
      expect(Math.max(...mesh.indices.value)).toBeLessThan(count);
    }
  });
});
