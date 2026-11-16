import { toMesh, type MeshData } from './meshes';
import type { Vec3 } from './local';

/**
 * Street fixtures built from simple solids, in meters with z up and the origin at street level.
 * Proportions follow the real castings; +x points at the street (hydrant pumper nozzle, catch
 * basin gutter side) and +y runs along the curb.
 */
interface Builder {
  positions: number[];
  normals: number[];
  indices: number[];
}

const builder = (): Builder => ({ positions: [], normals: [], indices: [] });

const done = (b: Builder): MeshData => toMesh(b.positions, b.normals, b.indices);

type Axis = 'x' | 'y' | 'z';

/** Maps (along-axis, u, v) to x, y, z for a cylinder lying on `axis`. */
const orient = (axis: Axis, along: number, u: number, v: number): Vec3 =>
  axis === 'z' ? [u, v, along] : axis === 'x' ? [along, u, v] : [u, along, v];

/** Closed cylinder; `sides: 5` makes the pentagon nut NYC hydrants are opened with. */
const cylinder = (
  b: Builder,
  axis: Axis,
  center: Vec3,
  radius: number,
  length: number,
  sides = 20,
) => {
  const at = (point: Vec3): Vec3 => [
    point[0] + center[0],
    point[1] + center[1],
    point[2] + center[2],
  ];
  const push = (point: Vec3, normal: Vec3) => {
    b.positions.push(...at(point));
    b.normals.push(...normal);
    return b.positions.length / 3 - 1;
  };
  const half = length / 2;
  const ring: number[][] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const [u, v] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    const normal = orient(axis, 0, Math.cos(angle), Math.sin(angle));
    ring.push([push(orient(axis, -half, u, v), normal), push(orient(axis, half, u, v), normal)]);
  }
  for (let i = 0; i < sides; i++) {
    const [a0, a1] = ring[i]!;
    const [b0, b1] = ring[i + 1]!;
    b.indices.push(a0!, b0!, a1!, a1!, b0!, b1!);
  }
  for (const end of [-1, 1]) {
    const normal = orient(axis, end, 0, 0);
    const middle = push(orient(axis, end * half, 0, 0), normal);
    const rim: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      rim.push(
        push(orient(axis, end * half, Math.cos(angle) * radius, Math.sin(angle) * radius), normal),
      );
    }
    for (let i = 0; i < sides; i++) {
      if (end > 0) b.indices.push(middle, rim[i]!, rim[i + 1]!);
      else b.indices.push(middle, rim[i + 1]!, rim[i]!);
    }
  }
};

/** Closed tube between any two points, for the bent parts like a lamp's arm. */
const strut = (b: Builder, from: Vec3, to: Vec3, radius: number, sides = 12) => {
  const axis: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...axis) || 1;
  const unit = axis.map((n) => n / length) as Vec3;
  const helper: Vec3 = Math.abs(unit[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cross = (p: Vec3, q: Vec3): Vec3 => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
  const side = cross(unit, helper);
  const sideLength = Math.hypot(...side);
  const u = side.map((n) => n / sideLength) as Vec3;
  const v = cross(u, unit);
  const ring: number[][] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const normal: Vec3 = [
      u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
      u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
      u[2] * Math.cos(angle) + v[2] * Math.sin(angle),
    ];
    const pair = [from, to].map((end) => {
      b.positions.push(
        end[0] + normal[0] * radius,
        end[1] + normal[1] * radius,
        end[2] + normal[2] * radius,
      );
      b.normals.push(...normal);
      return b.positions.length / 3 - 1;
    });
    ring.push(pair);
  }
  for (let i = 0; i < sides; i++) {
    const [a0, a1] = ring[i]!;
    const [b0, b1] = ring[i + 1]!;
    b.indices.push(a0!, b0!, a1!, a1!, b0!, b1!);
  }
};

/** Axis-aligned box from its center and full size. */
const box = (b: Builder, center: Vec3, size: Vec3, skip: 'top'[] = []) => {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const faces: { normal: Vec3; corners: Vec3[] }[] = [
    {
      normal: [1, 0, 0],
      corners: [
        [hx, -hy, -hz],
        [hx, hy, -hz],
        [hx, hy, hz],
        [hx, -hy, hz],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [-hx, hy, -hz],
        [-hx, -hy, -hz],
        [-hx, -hy, hz],
        [-hx, hy, hz],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [hx, hy, -hz],
        [-hx, hy, -hz],
        [-hx, hy, hz],
        [hx, hy, hz],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [hx, -hy, hz],
        [-hx, -hy, hz],
      ],
    },
    {
      normal: [0, 0, 1],
      corners: [
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, hy, hz],
        [-hx, hy, hz],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [-hx, hy, -hz],
        [hx, hy, -hz],
        [hx, -hy, -hz],
        [-hx, -hy, -hz],
      ],
    },
  ];
  for (const { normal, corners } of faces) {
    if (skip.includes('top') && normal[2] === 1) continue;
    const start = b.positions.length / 3;
    for (const [x, y, z] of corners) {
      b.positions.push(x + center[0], y + center[1], z + center[2]);
      b.normals.push(...normal);
    }
    b.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
};

/** Barrel, flange, band and bonnet: the painted body of an NYC hydrant, about 0.8 m tall. */
export const hydrantBodyMesh = (): MeshData => {
  const b = builder();
  cylinder(b, 'z', [0, 0, 0.03], 0.17, 0.06);
  cylinder(b, 'z', [0, 0, 0.33], 0.11, 0.56);
  cylinder(b, 'z', [0, 0, 0.585], 0.135, 0.07);
  cylinder(b, 'z', [0, 0, 0.66], 0.12, 0.08);
  // The nozzle barrels; their caps are the colored part.
  cylinder(b, 'y', [0, 0.15, 0.44], 0.045, 0.1);
  cylinder(b, 'y', [0, -0.15, 0.44], 0.045, 0.1);
  cylinder(b, 'x', [0.15, 0, 0.4], 0.065, 0.1);
  return done(b);
};

/** Nozzle caps, bonnet top and the pentagon operating nut. */
export const hydrantTrimMesh = (): MeshData => {
  const b = builder();
  cylinder(b, 'y', [0, 0.215, 0.44], 0.055, 0.035);
  cylinder(b, 'y', [0, -0.215, 0.44], 0.055, 0.035);
  cylinder(b, 'x', [0.215, 0, 0.4], 0.08, 0.035);
  cylinder(b, 'z', [0, 0, 0.73], 0.085, 0.06);
  cylinder(b, 'z', [0, 0, 0.785], 0.035, 0.05, 5);
  return done(b);
};

/**
 * Gutter grating and curb piece of a curb inlet catch basin: a frame with bars you can see
 * between, and the iron hood standing in the curb. About 0.9 m along the curb.
 */
export const catchBasinMesh = (): MeshData => {
  const b = builder();
  // x across the gutter, y along the curb.
  const [width, length, height] = [0.55, 0.9, 0.035];
  box(b, [width / 2 - 0.025, 0, height / 2], [0.05, length, height]);
  box(b, [-width / 2 + 0.025, 0, height / 2], [0.05, length, height]);
  box(b, [0, length / 2 - 0.025, height / 2], [width, 0.05, height]);
  box(b, [0, -length / 2 + 0.025, height / 2], [width, 0.05, height]);
  // Bars across the gutter, so water running along the curb drops between them.
  for (let i = -3; i <= 3; i++) box(b, [0, i * 0.11, height / 2], [width, 0.03, height]);
  // Curb piece on the sidewalk side (-x), standing as tall as the curb.
  box(b, [-width / 2 - 0.05, 0, 0.09], [0.1, length, 0.18]);
  return done(b);
};

/** A 26-inch iron cover with a raised rim, flush with the street. */
export const manholeCoverMesh = (): MeshData => {
  const b = builder();
  cylinder(b, 'z', [0, 0, 0.015], 0.33, 0.03, 28);
  cylinder(b, 'z', [0, 0, 0.035], 0.36, 0.012, 28);
  cylinder(b, 'z', [0, 0, 0.04], 0.12, 0.012, 20);
  return done(b);
};

/**
 * Unit box from -0.5 to 0.5 on every axis with no lid, stretched into a basin chamber per
 * instance; looking through the grate you see down into the pit.
 */
export const openBoxMesh = (): MeshData => {
  const b = builder();
  box(b, [0, 0, 0], [1, 1, 1], ['top']);
  return done(b);
};

/**
 * NYC davit street light: a tapered pole about 9 m tall whose arm curves out over the street
 * (+x), with the luminaire hanging from the end.
 */
export const streetLampPoleMesh = (): MeshData => {
  const b = builder();
  box(b, [0, 0, 0.3], [0.38, 0.38, 0.6]);
  cylinder(b, 'z', [0, 0, 2.4], 0.11, 3.6, 12);
  cylinder(b, 'z', [0, 0, 6.0], 0.085, 3.6, 12);
  cylinder(b, 'z', [0, 0, 8.2], 0.07, 0.8, 12);
  // The davit: a quarter circle from the top of the pole out over the street.
  const radius = 1.4;
  const steps = 8;
  const at = (i: number): Vec3 => {
    const angle = (i / steps) * (Math.PI / 2);
    return [
      radius - radius * Math.cos(angle),
      0,
      8.6 + radius * Math.sin(angle) - 0.25 * (i / steps),
    ];
  };
  for (let i = 0; i < steps; i++) strut(b, at(i), at(i + 1), 0.06);
  const tip = at(steps);
  strut(b, tip, [tip[0] + 0.4, 0, tip[2] - 0.05], 0.055);
  // Luminaire housing.
  box(b, [tip[0] + 0.55, 0, tip[2] - 0.18], [0.7, 0.36, 0.2]);
  return done(b);
};

/** The lit lens under the luminaire. */
export const streetLampLensMesh = (): MeshData => {
  const b = builder();
  const radius = 1.4;
  const tipX = radius + 0.55;
  const tipZ = 8.6 + radius - 0.25;
  box(b, [tipX, 0, tipZ - 0.3], [0.6, 0.3, 0.05]);
  return done(b);
};

/**
 * LinkNYC kiosk: a slim stainless slab about 2.9 m tall, thin edge to the street (+x), with a
 * screen on each broad face looking along the sidewalk.
 */
export const linkKioskBodyMesh = (): MeshData => {
  const b = builder();
  box(b, [0, 0, 1.45], [0.28, 0.86, 2.9]);
  return done(b);
};

export const linkKioskScreenMesh = (): MeshData => {
  const b = builder();
  for (const side of [-1, 1]) box(b, [0, side * 0.435, 1.75], [0.2, 0.012, 1.3]);
  return done(b);
};

/**
 * A gate valve in pipe radii, lying along x: the body with a flange each side, the bonnet rising
 * from it and a square operating nut on top, which a crew turns with a key from the street.
 * Scaled to its pipe's radius and turned along the pipe per instance.
 */
export const valveMesh = (): MeshData => {
  const b = builder();
  cylinder(b, 'x', [0, 0, 0], 1.35, 2.4, 20);
  for (const end of [-1.15, 1.15]) cylinder(b, 'x', [end, 0, 0], 1.6, 0.25, 20);
  cylinder(b, 'z', [0, 0, 1.4], 0.7, 1.6, 16);
  cylinder(b, 'z', [0, 0, 2.35], 0.5, 0.3, 4);
  return done(b);
};
