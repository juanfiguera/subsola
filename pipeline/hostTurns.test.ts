import { describe, expect, it } from 'vitest';
import { sharedService, takeTurn } from './hostTurns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const LA = 'https://maps.lacity.org/lahub/rest/services';

const tracker = () => {
  let running = 0;
  let most = 0;
  const run = async () => {
    running += 1;
    most = Math.max(most, running);
    await sleep(5);
    running -= 1;
  };
  return { run, most: () => most };
};

describe('sharedService', () => {
  it("names LA's service, so its layers share one turn", () => {
    expect(sharedService(`${LA}/Public_Way_Reservations/MapServer/3/query?f=json`)).toBe(
      sharedService(`${LA}/Public_Way_Reservations/MapServer/7/query`),
    );
    expect(sharedService(`${LA}/Public_Way_Reservations/MapServer/3`)).not.toBe(
      sharedService(`${LA}/Sewer_Information/MapServer/3`),
    );
  });

  it('leaves other hosts alone', () => {
    expect(sharedService('https://services.arcgis.com/x/FeatureServer/0/query')).toBeUndefined();
  });
});

describe('takeTurn', () => {
  it("sends one LA service's queries one at a time", async () => {
    const permits = tracker();
    const url = `${LA}/Public_Way_Reservations/MapServer/3/query`;
    await Promise.all(Array.from({ length: 4 }, () => takeTurn(url, permits.run)));
    expect(permits.most()).toBe(1);
  });

  it('runs different LA services and other hosts together', async () => {
    const both = tracker();
    await Promise.all([
      takeTurn(`${LA}/Sewer_Information/MapServer/1/query`, both.run),
      takeTurn(`${LA}/Landbase_Information/MapServer/2/query`, both.run),
      takeTurn('https://services.arcgis.com/x/FeatureServer/0/query', both.run),
    ]);
    expect(both.most()).toBe(3);
  });

  it('moves on after a failed query', async () => {
    const url = `${LA}/Street_Information/MapServer/0/query`;
    await expect(takeTurn(url, () => Promise.reject(new Error('busy')))).rejects.toThrow('busy');
    await expect(takeTurn(url, async () => 'next')).resolves.toBe('next');
  });
});
