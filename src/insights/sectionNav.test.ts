import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currentSection } from './sectionNav';
import { isIconName } from '../ui/icons';

const PAGE = readFileSync(new URL('../../insights.html', import.meta.url), 'utf8');

describe('insights.html', () => {
  it('names only icons that exist, since a missing one stops the page', () => {
    const names = [...PAGE.matchAll(/data-icon="([^"]+)"/g)].map((match) => match[1]!);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(isIconName(name), name).toBe(true);
  });

  it('links the section nav only to sections on the page', () => {
    const nav = PAGE.slice(
      PAGE.indexOf('id="section-nav"'),
      PAGE.indexOf('</nav>', PAGE.indexOf('id="section-nav"')),
    );
    const targets = [...nav.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]!);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(PAGE, id).toContain(`id="${id}"`);
  });
});

describe('currentSection', () => {
  it('marks the first section before any has reached the reading line', () => {
    expect(currentSection([400, 900, 1600], 140)).toBe(0);
  });

  it('marks the last section whose top has passed the reading line', () => {
    expect(currentSection([-900, -200, 120, 700], 140)).toBe(2);
  });

  it('treats a missing section as never reached', () => {
    expect(currentSection([-50, Infinity, 300], 140)).toBe(0);
  });
});
