/**
 * Notices when the last page load died without closing. On iPhones WebKit kills a tab that runs
 * out of memory and reloads it, which reads to the user as the site loading twice, and nothing
 * reaches Sentry from a killed page. The next load reports it instead, with how far the dead one
 * got, so the cause shows up without needing a screen recording.
 */
const KEY = 'subsola:open';
// The last few deaths, kept across visits so ?debug can show them on the phone that had them.
const HISTORY_KEY = 'subsola:crashes';
const HISTORY_LENGTH = 5;

export interface Crash {
  /** When the dead load opened, as an ISO time. */
  at: string;
  seconds: number;
  stage: string;
  /** Every stage it reached, oldest first, with seconds since opening. */
  path: string[];
}

interface OpenPage {
  openedAt: number;
  stage: string;
  path: string[];
}

const write = (page: OpenPage) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(page));
  } catch (error) {
    // Private modes can refuse storage; the page works the same without the check.
    console.info('[subsola] crash check unavailable', error);
  }
};

let current: OpenPage = { openedAt: Date.now(), stage: 'starting', path: ['0 s starting'] };

const remember = (crash: Crash) => {
  try {
    const history = pastCrashes();
    localStorage.setItem(HISTORY_KEY, JSON.stringify([crash, ...history].slice(0, HISTORY_LENGTH)));
  } catch (error) {
    console.info('[subsola] crash history unavailable', error);
  }
};

/** Deaths of earlier loads on this device, newest first. */
export const pastCrashes = (): Crash[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as Crash[];
  } catch {
    return [];
  }
};

/** How far this load has got, for ?debug. */
export const stagesSoFar = () => current.path;

/** Starts watching this load, and returns how the last one died if it did. */
export const watchForCrashes = (): Crash | null => {
  let crash: Crash | null = null;
  try {
    const previous = sessionStorage.getItem(KEY);
    if (previous) {
      const dead = JSON.parse(previous) as OpenPage;
      const seconds = Math.round((Date.now() - dead.openedAt) / 1000);
      crash = {
        at: new Date(dead.openedAt).toISOString(),
        seconds,
        stage: dead.stage,
        path: dead.path ?? [],
      };
      remember(crash);
      // No quotes around the stage: error reports blank out quoted text, where addresses go.
      console.error(
        `[subsola] the last page load ended without closing, likely killed for memory: ${seconds} s after opening, at stage: ${dead.stage}`,
      );
    }
  } catch (error) {
    console.info('[subsola] crash check unavailable', error);
  }
  write(current);
  // A normal close, reload or navigation fires pagehide; a killed page doesn't.
  addEventListener('pagehide', () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch (error) {
      console.info('[subsola] crash check unavailable', error);
    }
  });
  // Back from the back-forward cache: open again.
  addEventListener('pageshow', (event) => {
    if (event.persisted) write(current);
  });
  return crash;
};

/** Records how far this page has got, for the report if it dies. */
export const markStage = (stage: string) => {
  const seconds = ((Date.now() - current.openedAt) / 1000).toFixed(1);
  current = { ...current, stage, path: [...current.path, `${seconds} s ${stage}`] };
  write(current);
};
