import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Theme } from '../theme';

const SCRIPT = readFileSync(new URL('../../public/shell.js', import.meta.url), 'utf8');

interface Element {
  hidden: boolean;
  title: string;
  attributes: Map<string, string>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | undefined;
}

const element = (extra: object = {}): Element & Record<string, unknown> => {
  const attributes = new Map<string, string>();
  return {
    hidden: true,
    title: '',
    attributes,
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    ...extra,
  };
};

/** Runs public/shell.js, the file the pages load, against a stand-in page. */
const run = ({ theme, tops }: { theme?: Theme; tops?: (number | null)[] }) => {
  const clicks: (() => void)[] = [];
  const button = element({
    addEventListener: (_: string, listener: () => void) => clicks.push(listener),
  });
  // A null top is a section that isn't laid out (it has no boxes).
  const sections = (tops ?? []).map((top, index) => ({
    id: `s${index}`,
    getClientRects: () => (top === null ? [] : [{}]),
    getBoundingClientRect: () => ({ top: top ?? 0 }),
  }));
  const links = sections.map((section) => element({ hash: `#${section.id}` }));
  const nav = { querySelectorAll: () => links, scrollWidth: 0, clientWidth: 0 };
  const state = { theme: theme ?? 'light', set: [] as string[] };
  runInNewContext(SCRIPT, {
    window: {
      subsolaTheme: theme
        ? {
            get theme() {
              return state.theme;
            },
            set: (choice: Theme) => {
              state.set.push(choice);
              state.theme = choice;
            },
            subscribe: () => undefined,
          }
        : undefined,
    },
    document: {
      querySelectorAll: (selector: string) =>
        selector === '.theme-switch' ? [button] : tops ? [nav] : [],
      getElementById: (id: string) => sections.find((section) => section.id === id) ?? null,
    },
    addEventListener: () => undefined,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
  });
  return { button, click: () => clicks.forEach((listener) => listener()), state, links };
};

describe('public/shell.js', () => {
  it('leaves the theme switch hidden when theme.js did not run', () => {
    expect(run({}).button.hidden).toBe(true);
  });

  it('shows the switch with the theme in effect and flips it on a click', () => {
    const page = run({ theme: 'dark' });
    expect(page.button.hidden).toBe(false);
    expect(page.button.getAttribute('aria-checked')).toBe('true');
    page.click();
    expect(page.state.set).toEqual(['light']);
  });

  it('marks the last section whose top has passed the reading line', () => {
    const marks = run({ tops: [-900, -200, 120, 700] }).links.map((link) =>
      link.getAttribute('aria-current'),
    );
    expect(marks).toEqual(['false', 'false', 'true', 'false']);
  });

  it('marks the first section while none has been read, or none is laid out yet', () => {
    for (const tops of [
      [400, 900, 1600],
      [null, null, null],
    ])
      expect(run({ tops }).links[0]!.getAttribute('aria-current')).toBe('true');
  });
});
