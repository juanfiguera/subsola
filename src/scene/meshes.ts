import type { Vec3 } from './local';

export interface MeshData {
  attributes: {
    positions: { value: Float32Array; size: 3 };
    normals: { value: Float32Array; size: 3 };
  };
  indices: { value: Uint16Array; size: 1 };
}

export const toMesh = (positions: number[], normals: number[], indices: number[]): MeshData => ({
  attributes: {
    positions: { value: new Float32Array(positions), size: 3 },
    normals: { value: new Float32Array(normals), size: 3 },
  },
  indices: { value: new Uint16Array(indices), size: 1 },
});

/**
 * Open tube along the x axis from -0.5 to 0.5 with radius 1. Every instance is stretched and
 * turned onto its pipe segment by a transform matrix, so one mesh serves every pipe.
 */
export const tubeMesh = (sides = 24): MeshData => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const [y, z] = [Math.cos(angle), Math.sin(angle)];
    positions.push(-0.5, y, z, 0.5, y, z);
    normals.push(0, y, z, 0, y, z);
  }
  for (let i = 0; i < sides; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return toMesh(positions, normals, indices);
};

/**
 * Closed cylinder along x from -0.5 to 0.5 with radius 1: the coupling sleeves where pipe runs
 * meet. The flat ends show where a fitting stops and the pipe begins.
 */
export const sleeveMesh = (sides = 24): MeshData => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const [y, z] = [Math.cos(angle), Math.sin(angle)];
    positions.push(-0.5, y, z, 0.5, y, z);
    normals.push(0, y, z, 0, y, z);
  }
  for (let i = 0; i < sides; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (const end of [-0.5, 0.5]) {
    const center = positions.length / 3;
    positions.push(end, 0, 0);
    normals.push(Math.sign(end), 0, 0);
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      positions.push(end, Math.cos(angle), Math.sin(angle));
      normals.push(Math.sign(end), 0, 0);
    }
    for (let i = 0; i < sides; i++) {
      const [a, b] = [center + 1 + i, center + 2 + i];
      indices.push(...(end > 0 ? [center, a, b] : [center, b, a]));
    }
  }
  return toMesh(positions, normals, indices);
};

/** Unit sphere, for the outside of elbows and valve bodies. */
export const sphereMesh = (rings = 12, sides = 20): MeshData => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= sides; s++) {
      const theta = (s / sides) * Math.PI * 2;
      positions.push(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      );
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * (sides + 1) + s;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // On a unit sphere every position is already its own normal.
  return toMesh(positions, positions, indices);
};

/**
 * Column-major model matrix that maps the unit tube onto the segment from `a` to `b`.
 * The translation stays zero because the layer adds each instance's position (the midpoint).
 * Written into `out` when given: deck.gl copies an accessor's result straight into its buffer,
 * and tens of thousands of fresh arrays per rebuild were a phone's worth of garbage.
 */
export const segmentMatrix = (
  a: Vec3,
  b: Vec3,
  radius: number,
  out: number[] = new Array<number>(16),
): number[] => {
  const [ax, ay, az] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(ax, ay, az) || 1;
  const [ux, uy, uz] = [ax / length, ay / length, az / length];
  // Any vector not parallel to the axis gives a stable pair of perpendiculars: side = unit x
  // helper, up = side x unit.
  const flat = Math.abs(uz) < 0.9;
  let [sx, sy, sz] = flat ? [uy, -ux, 0] : [0, uz, -uy];
  const sideLength = Math.hypot(sx, sy, sz) || 1;
  [sx, sy, sz] = [sx / sideLength, sy / sideLength, sz / sideLength];
  const [vx, vy, vz] = [sy * uz - sz * uy, sz * ux - sx * uz, sx * uy - sy * ux];
  out[0] = ax;
  out[1] = ay;
  out[2] = az;
  out[3] = 0;
  out[4] = sx * radius;
  out[5] = sy * radius;
  out[6] = sz * radius;
  out[7] = 0;
  out[8] = vx * radius;
  out[9] = vy * radius;
  out[10] = vz * radius;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
};

/** Scales a unit fitting by `scale` and turns its x axis along (dx, dy), keeping z up. */
export const headingMatrix = (dx: number, dy: number, scale: number): number[] => {
  const length = Math.hypot(dx, dy) || 1;
  const [c, s] = [(dx / length) * scale, (dy / length) * scale];
  // prettier-ignore
  return [
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, scale, 0,
    0, 0, 0, 1,
  ];
};

// prettier-ignore
export const scaleMatrix = (x: number, y = x, z = x): number[] => [
  x, 0, 0, 0,
  0, y, 0, 0,
  0, 0, z, 0,
  0, 0, 0, 1,
];
