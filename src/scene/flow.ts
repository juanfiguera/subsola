import { LayerExtension, type Accessor, type Layer } from '@deck.gl/core';

/**
 * Light bands drifting along a tube in the direction its contents move. Only for lines whose
 * direction follows from what they are (a water service feeds the building, a house sewer drains
 * it) and sewer mains, which drain downhill (slope.ts). Water and gas mains are grids whose flow
 * nobody publishes, so they never move.
 *
 * Works on SimpleMeshLayer with the unit tube from meshes.ts: the tube runs from x = -0.5 at the
 * segment's start to 0.5 at its end, so x and the matrix's first column give meters along it.
 * The cost is one float per line; motion comes from a time uniform, not from rebuilding layers.
 */
export interface FlowExtensionProps<D> {
  /** 1 when the contents move from the segment's start to its end, -1 the other way, 0 still. */
  getFlow?: Accessor<D, number>;
  flowEnabled?: boolean;
}

// Slow enough to read as a trickle at street scale, and spaced so a short service shows two or
// three bands.
const SPEED_M_PER_S = 1.2;
const SPACING_M = 2.5;
// The shader's float time loses precision after hours; it only needs to keep moving.
const TIME_WRAP_S = 3600;

const uniformBlock = /* glsl */ `\
layout(std140) uniform flowUniforms {
  float time;
  float enabled;
} flow;
`;

const flowModule = {
  name: 'flow',
  vs: `${uniformBlock}
in float flowDirections;
out float flow_along;
out float flow_direction;
`,
  fs: `${uniformBlock}
in float flow_along;
in float flow_direction;
`,
  inject: {
    // Attributes are only in scope inside main(), not in the filter hooks.
    'vs:#main-end': /* glsl */ `
  flow_along = (positions.x + 0.5) * length(instanceModelMatrixCol0) * simpleMesh.sizeScale;
  flow_direction = flowDirections;
`,
    // Picking reads this same color as the object's id, so it must stay untouched there.
    'fs:DECKGL_FILTER_COLOR': /* glsl */ `
  if (flow.enabled > 0.5 && picking.isActive < 0.5 && abs(flow_direction) > 0.5) {
    float phase = fract((flow_along - flow_direction * flow.time * ${SPEED_M_PER_S.toFixed(2)}) / ${SPACING_M.toFixed(2)});
    float band = smoothstep(0.0, 0.18, phase) * (1.0 - smoothstep(0.18, 0.42, phase));
    color.rgb = mix(color.rgb, vec3(1.0), 0.5 * band);
  }
`,
  },
  uniformTypes: { time: 'f32', enabled: 'f32' },
  getUniforms: (opts?: { time?: number; enabled?: boolean }) => ({
    time: opts?.time ?? 0,
    enabled: opts?.enabled ? 1 : 0,
  }),
} as const;

export class FlowExtension extends LayerExtension {
  static override extensionName = 'FlowExtension';
  static override defaultProps = {
    getFlow: { type: 'accessor', value: 0 },
    flowEnabled: true,
  };

  override getShaders() {
    return { modules: [flowModule] };
  }

  override initializeState(this: Layer<FlowExtensionProps<unknown>>) {
    this.getAttributeManager()?.addInstanced({
      flowDirections: { size: 1, accessor: 'getFlow', defaultValue: 0 },
    });
  }

  override draw(this: Layer<FlowExtensionProps<unknown>>) {
    this.setShaderModuleProps({
      flow: {
        time: (performance.now() / 1000) % TIME_WRAP_S,
        enabled: this.props.flowEnabled ?? true,
      },
    });
  }
}

export const FLOW = new FlowExtension();
