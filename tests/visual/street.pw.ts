import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * The app's network is replayed from network.har.zip, recorded once from the live sources, so a
 * nightly data update can't change the pictures. Re-record after changing what the app fetches:
 *
 *   pnpm build && RECORD=1 pnpm test:visual --update-snapshots
 *
 * Aerial photos and city map tiles are left out: they're large, and nothing here is about them.
 * Each city is recorded apart (network.har.zip, dc-network.har.zip and so on); `--grep DC`
 * re-records DC alone.
 */
const RECORD = Boolean(process.env.RECORD);

interface Street {
  address: string;
  /** Each city's network goes in its own recording, so re-recording one leaves the other. */
  har: string;
}

const NYC_STREET: Street = {
  address: '33 Union Square West, New York, NY 10003',
  har: new URL('./network.har.zip', import.meta.url).pathname,
};

// Permits from DDOT, Washington Gas and Pepco on one block, inlets, lamps and signals.
const DC_STREET: Street = {
  address: '800 F St NW, Washington, DC',
  har: new URL('./dc-network.har.zip', import.meta.url).pathname,
};

// The Civic Center: permits from PG&E and the city, the steam loop, and sewers at measured depths.
const SF_STREET: Street = {
  address: '1 Dr Carlton B Goodlett Pl, San Francisco',
  har: new URL('./sf-network.har.zip', import.meta.url).pathname,
};

// City Hall: LADWP's and AT&T's permits on Spring St, and LA Sanitation's sewers nearby.
const LA_STREET: Street = {
  address: '200 N Spring St, Los Angeles',
  har: new URL('./la-network.har.zip', import.meta.url).pathname,
};

// Downtown: Cox and AT&T permits, and the city's water main and sewer at its measured depth.
const SD_STREET: Street = {
  address: '100 W Broadway, San Diego',
  har: new URL('./sd-network.har.zip', import.meta.url).pathname,
};

// Downtown: Comcast and CenturyLink permits by block, and SPU's sewers at their recorded depth.
const SEA_STREET: Street = {
  address: '1420 5th Ave, Seattle',
  har: new URL('./sea-network.har.zip', import.meta.url).pathname,
};

// The Ross-Broadway library branch: Denver Water's and Xcel's permits by block, a storm drain and
// sewers at the depths their manholes give, and Denver Water's lead inventory for the lot.
const DEN_STREET: Street = {
  address: '33 E Bayaud Ave, Denver',
  har: new URL('./den-network.har.zip', import.meta.url).pathname,
};

// A two-flat block in Lakeview: Water Management's, Peoples Gas's and ComEd's permits by block,
// with no pipes or lead inventory published, so every line comes from permits.
const CHI_STREET: Street = {
  address: '3500 N Lakewood Ave, Chicago',
  har: new URL('./chi-network.har.zip', import.meta.url).pathname,
};

const TODAY = new Date('2026-11-01T12:00:00-05:00').getTime();

/**
 * Waits until no request has been in flight for `quietMs`. Moving the camera loads the cells it
 * reaches, a few hundred milliseconds after it stops, so one quiet stretch isn't enough on its own.
 */
const settle = async (page: Page, quietMs = 2000) => {
  let inFlight = 0;
  let lastChange = Date.now();
  const track = (delta: number) => () => {
    inFlight += delta;
    lastChange = Date.now();
  };
  const started = track(1);
  const ended = track(-1);
  page.on('request', started);
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);
  try {
    while (inFlight > 0 || Date.now() - lastChange < quietMs) await page.waitForTimeout(250);
  } finally {
    page.off('request', started);
    page.off('requestfinished', ended);
    page.off('requestfailed', ended);
  }
};

interface Options {
  /**
   * Street features (hydrants, lamps, manholes...) start off, so the map opens on the pipes.
   * True switches them all on, the way a browser that turned them on remembers it.
   */
  features?: boolean;
}

const ALL_FEATURES_ON = JSON.stringify(
  Object.fromEntries(
    [
      'hydrant',
      'catch-basin',
      'manhole',
      'linknyc',
      'street-lamp',
      'traffic-signal',
      'outfall',
      'electric-structure',
    ].map((kind) => [kind, true]),
  ),
);

const openStreet = async (
  page: Page,
  { address, har }: Street = NYC_STREET,
  { features = false }: Options = {},
) => {
  // "Today" decides which permits count as active work, so it's pinned. Only Date moves: the
  // camera's transitions run on performance.now, and a stopped clock would stop them too.
  await page.addInitScript((today: number) => {
    const offset = today - Date.now();
    const RealDate = Date;
    class ShiftedDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length) super(...args);
        else super(RealDate.now() + offset);
      }
      static override now() {
        return RealDate.now() + offset;
      }
    }
    globalThis.Date = ShiftedDate as DateConstructor;
  }, TODAY);
  await page.route(
    /orthos\.its\.ny\.gov|openfreemap\.org|Ortho2025|tile\.sf\.gov|imagery\.nationalmap\.gov/,
    (route) => route.abort(),
  );
  await page.routeFromHAR(har, {
    url: /^https:\/\/(?!orthos|tiles\.openfreemap|tile\.sf\.gov|imagery\.nationalmap)(?!.*Ortho2025)/,
    update: RECORD,
    updateContent: 'attach',
    notFound: 'abort',
  });
  // Seen the guide already, so the card shows what it shows everyone after the first visit.
  await page.addInitScript(() => localStorage.setItem('subsola:guide-seen', '1'));
  if (features)
    await page.addInitScript(
      (layers) => localStorage.setItem('subsola:layers', layers),
      ALL_FEATURES_ON,
    );
  await page.goto(`/?q=${encodeURIComponent(address)}`);
  await expect(page.locator('body')).toHaveAttribute('data-records', 'loaded', {
    timeout: 60_000,
  });
  await settle(page);
};

/**
 * A search lands under the street. The street view tests switch to the 3D view, which the map
 * used to open on, so both views stay covered.
 */
const to3d = async (page: Page) => {
  test.setTimeout(420_000);
  await page.keyboard.press('2');
  await settle(page);
};

// The busiest 3D scenes (NYC, Seattle, every street feature on) take minutes on CI's software
// rendering to give two matching captures in a row: Seattle's took over four on a 2-core runner,
// though 34 s on a laptop. The test's own limit grows with it in to3d.
const SLOW_SCENE = { timeout: 360_000 };

test('street view with the home card', async ({ page }) => {
  await openStreet(page);
  await to3d(page);
  await expect(page).toHaveScreenshot('street.png', SLOW_SCENE);
});

// Street features start off; switched on they're neutral pins, ringed in their network's color.
test('street features in the 3D view', async ({ page }) => {
  await openStreet(page, NYC_STREET, { features: true });
  await to3d(page);
  await expect(page).toHaveScreenshot('features.png', SLOW_SCENE);
});

// Where a search lands: under the street, with only the pipes and active work on.
test('looking up from under the street', async ({ page }) => {
  await openStreet(page);
  await page.keyboard.press('3');
  await settle(page);
  // Every pipe drawn from below in software rendering: on CI two matching captures in a row
  // have taken from one to two minutes, right at the default limit.
  await expect(page).toHaveScreenshot('underground.png', { timeout: 240_000 });
});

test('lot report', async ({ page }) => {
  await openStreet(page);
  await page.getByRole('button', { name: 'View lot report' }).click();
  await expect(page.locator('#report')).toHaveScreenshot('report.png', {
    // The printed link carries the camera, which moves a hair between renders.
    mask: [page.locator('.report-print-only')],
  });
});

test('phone layout with the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStreet(page);
  await expect(page).toHaveScreenshot('phone.png');
});

test('DC street view with the home card', async ({ page }) => {
  await openStreet(page, DC_STREET);
  await to3d(page);
  await expect(page).toHaveScreenshot('dc-street.png', SLOW_SCENE);
});

// Where DC's sewers once sat level with its water mains, with basin leads through them.
test('DC from under the street', async ({ page }) => {
  await openStreet(page, DC_STREET);
  await page.keyboard.press('3');
  await settle(page);
  await expect(page).toHaveScreenshot('dc-underground.png');
});

test('DC lot report', async ({ page }) => {
  await openStreet(page, DC_STREET);
  await page.getByRole('button', { name: 'View lot report' }).click();
  await expect(page.locator('#report')).toHaveScreenshot('dc-report.png', {
    mask: [page.locator('.report-print-only')],
  });
});

test('SF street view with the home card', async ({ page }) => {
  await openStreet(page, SF_STREET);
  await to3d(page);
  await expect(page).toHaveScreenshot('sf-street.png', SLOW_SCENE);
});

// The city's own sewers, each at the depth measured at its manholes.
test('SF from under the street', async ({ page }) => {
  await openStreet(page, SF_STREET);
  await page.keyboard.press('3');
  await settle(page);
  await expect(page).toHaveScreenshot('sf-underground.png', { timeout: 240_000 });
});

test('LA street view with the home card', async ({ page }) => {
  await openStreet(page, LA_STREET);
  await to3d(page);
  await expect(page).toHaveScreenshot('la-street.png', SLOW_SCENE);
});

test('LA lot report', async ({ page }) => {
  await openStreet(page, LA_STREET);
  await page.getByRole('button', { name: 'View lot report' }).click();
  await expect(page.locator('#report')).toHaveScreenshot('la-report.png', {
    mask: [page.locator('.report-print-only')],
  });
});

test('San Diego street view with the home card', async ({ page }) => {
  await openStreet(page, SD_STREET);
  await to3d(page);
  await expect(page).toHaveScreenshot('sd-street.png', SLOW_SCENE);
});

test('San Diego lot report', async ({ page }) => {
  await openStreet(page, SD_STREET);
  await page.getByRole('button', { name: 'View lot report' }).click();
  await expect(page.locator('#report')).toHaveScreenshot('sd-report.png', {
    mask: [page.locator('.report-print-only')],
  });
});

test('Seattle street view with the home card', async ({ page }) => {
  await openStreet(page, SEA_STREET);
  await to3d(page);
  await expect(page).toHaveScreenshot('sea-street.png', SLOW_SCENE);
});

test('Seattle lot report', async ({ page }) => {
  await openStreet(page, SEA_STREET);
  await page.getByRole('button', { name: 'View lot report' }).click();
  await expect(page.locator('#report')).toHaveScreenshot('sea-report.png', {
    mask: [page.locator('.report-print-only')],
  });
});

// Denver's cells reach data.subsola.com with the nightly after Denver merges; until its network is
// recorded (RECORD=1 pnpm test:visual --grep Denver), these wait rather than fail.
test.describe('Denver', () => {
  test.skip(
    !RECORD && !existsSync(DEN_STREET.har),
    'Denver is recorded once the nightly publishes its cells',
  );

  test('Denver street view with the home card', async ({ page }) => {
    await openStreet(page, DEN_STREET);
    await to3d(page);
    await expect(page).toHaveScreenshot('den-street.png', SLOW_SCENE);
  });

  test('Denver lot report', async ({ page }) => {
    await openStreet(page, DEN_STREET);
    await page.getByRole('button', { name: 'View lot report' }).click();
    await expect(page.locator('#report')).toHaveScreenshot('den-report.png', {
      mask: [page.locator('.report-print-only')],
    });
  });
});

// Chicago's cells reach data.subsola.com with the nightly after Chicago merges; until its network
// is recorded (RECORD=1 pnpm test:visual --grep Chicago), these wait rather than fail.
test.describe('Chicago', () => {
  test.skip(
    !RECORD && !existsSync(CHI_STREET.har),
    'Chicago is recorded once the nightly publishes its cells',
  );

  test('Chicago street view with the home card', async ({ page }) => {
    await openStreet(page, CHI_STREET);
    await to3d(page);
    await expect(page).toHaveScreenshot('chi-street.png', SLOW_SCENE);
  });

  test('Chicago lot report', async ({ page }) => {
    await openStreet(page, CHI_STREET);
    await page.getByRole('button', { name: 'View lot report' }).click();
    await expect(page.locator('#report')).toHaveScreenshot('chi-report.png', {
      mask: [page.locator('.report-print-only')],
    });
  });
});
