import { BASEMAP_CREDIT, CITY_CREDITS, linkCredit, NOT_ENDORSED, OSM_CREDIT } from '../attribution';
import { REGIONS } from '../regions';
import { PAUSED_SOURCES, SOURCES, type SourceKey } from '../sources/catalog';
import { CONTACT_LINK, SITE_NAME } from '../site';
import { escapeHtml } from '../ui/dom';
import { page } from './layout';

/**
 * subsola.com/credits: whose records each city's map is built from, with the credit each
 * publisher's terms ask for (Chicago's disclaimer among them), and the sources paused while
 * permission is asked. The wording lives in src/attribution.ts.
 */

const pausedItems = () =>
  (Object.keys(PAUSED_SOURCES) as SourceKey[])
    .map((key) => {
      const paused = PAUSED_SOURCES[key]!;
      return `<li>${escapeHtml(SOURCES[key].name)}, ${escapeHtml(SOURCES[key].publisher)}: <a href="${escapeHtml(paused.lookup)}">look it up on ${escapeHtml(paused.owner)}'s own site</a></li>`;
    })
    .join('');

export const creditsPage = (stylesheet: string) =>
  page(
    {
      title: `Data credits | ${SITE_NAME}`,
      description: `Whose public records ${SITE_NAME} is built from, city by city, with the credit each publisher asks for.`,
      path: '/credits',
      stylesheet,
    },
    `<header class="intro">
        <p class="kicker">Credits</p>
        <h1>Whose records these are</h1>
        <p class="lede">${SITE_NAME} is built from public records that cities, counties and utilities publish. Each city's map and answers credit them as their terms ask. ${escapeHtml(NOT_ENDORSED)}</p>
      </header>
      ${REGIONS.map(
        (region) => `
      <section class="block" aria-labelledby="credits-${region.id}">
        <h2 id="credits-${region.id}">${escapeHtml(region.name)}</h2>
        <p>${linkCredit(CITY_CREDITS[region.id], escapeHtml, '')}</p>
        <p class="note">Aerial photos: ${escapeHtml(region.photoCredit)}.</p>
      </section>`,
      ).join('')}
      <section class="block" aria-labelledby="credits-maps">
        <h2 id="credits-maps">Maps</h2>
        <p>${linkCredit(OSM_CREDIT, escapeHtml, '')}</p>
        <p>${linkCredit(BASEMAP_CREDIT, escapeHtml, '')}</p>
      </section>
      <section class="block" aria-labelledby="credits-paused">
        <h2 id="credits-paused">Paused while we ask</h2>
        <p>These records are public, but their publishers' terms don't allow republishing them, so ${SITE_NAME} doesn't show them while it asks for permission.</p>
        <ul class="plain-list">${pausedItems()}</ul>
      </section>
      <section class="block" aria-labelledby="credits-contact">
        <h2 id="credits-contact">Corrections</h2>
        <p>If you publish one of these sources and want it credited differently, email ${CONTACT_LINK}.</p>
      </section>`,
  );
