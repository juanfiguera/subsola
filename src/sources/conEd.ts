import { z } from 'zod';
import type { Position } from 'geojson';
import type { AssetFeature } from './assets';
import { isPaused } from './catalog';

/**
 * Con Edison's underground network structures: the vaults and manholes of the secondary mesh
 * networks that feed most of the city, with the network each belongs to. Con Edison publishes
 * them on its public hosting capacity map, an ArcGIS layer anyone can query; it publishes no
 * cable routes, so these points are the only placed electric infrastructure it makes public.
 */
export const CON_ED_STRUCTURES_LAYER =
  'https://services.arcgis.com/ciPnsNFi1JLWVjva/arcgis/rest/services/CE_NwkHcv_StructureHCV_Prod/FeatureServer/0';

/** Attributes as the layer names them. */
export const conEdStructureSchema = z.object({
  STRUCT_NUMBER: z.string().nullish(),
  NETWORK_NAME: z.string().nullish(),
  DIV_NAME: z.string().nullish(),
  LATITUDE: z.number(),
  LONGITUDE: z.number(),
});

export type ConEdStructureRow = z.infer<typeof conEdStructureSchema>;

export const CON_ED_FIELDS = Object.keys(conEdStructureSchema.shape).join(',');

const queryResponseSchema = z.object({
  features: z.array(z.object({ attributes: z.unknown() })).default([]),
  error: z.object({ message: z.string() }).optional(),
});

/** Structure rows from an ArcGIS query response, skipping any that don't parse. */
export const conEdRowsFromResponse = (body: unknown): ConEdStructureRow[] => {
  const parsed = queryResponseSchema.parse(body);
  if (parsed.error) throw new Error(`Con Edison layer: ${parsed.error.message}`);
  return parsed.features.flatMap(({ attributes }) => {
    const row = conEdStructureSchema.safeParse(attributes);
    return row.success ? [row.data] : [];
  });
};

export const fetchConEdStructures = async (
  [lng, lat]: Position,
  radius: number,
  signal?: AbortSignal,
): Promise<AssetFeature[]> => {
  if (isPaused('conEdStructures')) return [];
  const query = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(radius),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: CON_ED_FIELDS,
    returnGeometry: 'false',
    f: 'json',
  });
  const res = await fetch(`${CON_ED_STRUCTURES_LAYER}/query?${query}`, { signal });
  if (!res.ok) throw new Error(`Con Edison layer returned ${res.status}`);
  return conEdStructuresFromRows(conEdRowsFromResponse(await res.json()));
};

// "WEST BRONX" reads as "West Bronx" in a card.
const titleCase = (text: string) =>
  text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export const conEdStructuresFromRows = (rows: ConEdStructureRow[]): AssetFeature[] =>
  rows.map((row) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [row.LONGITUDE, row.LATITUDE] },
    properties: {
      kind: 'electric-structure',
      utility: 'electric',
      title: 'Con Edison network structure',
      facts: [
        ...(row.STRUCT_NUMBER ? [['Structure', row.STRUCT_NUMBER] as [string, string]] : []),
        ...(row.NETWORK_NAME
          ? [['Network', `${titleCase(row.NETWORK_NAME)}`] as [string, string]]
          : []),
        [
          'Implies',
          'An underground vault or manhole on the secondary network, with cables in duct banks under the street',
        ],
      ],
      sourceKey: 'conEdStructures',
    },
  }));
