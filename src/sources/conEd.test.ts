import { describe, expect, it } from 'vitest';
import { conEdRowsFromResponse, conEdStructuresFromRows } from './conEd';

describe('Con Edison network structures', () => {
  const response = {
    features: [
      {
        attributes: {
          STRUCT_NUMBER: '500',
          NETWORK_NAME: 'WEST BRONX',
          DIV_NAME: 'BRONX',
          LATITUDE: 40.806226,
          LONGITUDE: -73.927987,
        },
      },
      // No position: nothing to place it by.
      { attributes: { STRUCT_NUMBER: '501', NETWORK_NAME: 'WEST BRONX' } },
    ],
  };

  it('reads the rows that have a position', () => {
    const rows = conEdRowsFromResponse(response);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.STRUCT_NUMBER).toBe('500');
  });

  it('turns a row into an electric asset with its network', () => {
    const [structure] = conEdStructuresFromRows(conEdRowsFromResponse(response));
    expect(structure?.geometry.coordinates).toEqual([-73.927987, 40.806226]);
    expect(structure?.properties).toMatchObject({
      kind: 'electric-structure',
      utility: 'electric',
      sourceKey: 'conEdStructures',
    });
    expect(structure?.properties.facts).toContainEqual(['Network', 'West Bronx']);
  });

  it('reports an error the layer sends back with a 200', () => {
    expect(() => conEdRowsFromResponse({ error: { message: 'Invalid query' } })).toThrow(
      'Invalid query',
    );
  });
});
