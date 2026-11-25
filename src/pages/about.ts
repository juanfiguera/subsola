import { REGIONS } from '../regions';
import { CONFIDENCE_LABELS, type Confidence } from '../sources/catalog';
import { CONTACT_LINK, OPERATOR, REPO_URL, SITE_NAME } from '../site';
import { escapeHtml } from '../ui/dom';
import { page } from './shell';

/**
 * subsola.com/about: what Subsola is and isn't, who it's for, how the map is built, where the
 * data comes from and who makes it. It speaks for every city, since a page isn't tied to one
 * address; the map's own card keeps what is (the sources that answered for the address on
 * screen, and that city's 811 notice). Every claim describes what the code and the data do.
 */

const MAKER = {
  name: 'Juan Figuera',
  linkedin: 'https://www.linkedin.com/in/juanfiguera',
  github: 'https://github.com/juanfiguera',
};

const LABEL_ORDER: Confidence[] = [
  'surveyed',
  'utility',
  'block-level',
  'lot-level',
  'crowdsourced',
  'inferred',
];

const section = (id: string, title: string, body: string, extraClass = '') => `
      <section class="block${extraClass ? ` ${extraClass}` : ''}" aria-labelledby="${id}">
        <h2 id="${id}">${title}</h2>
        ${body}
      </section>`;

const point = (title: string, text: string) => `<h3 class="faq-q">${title}</h3>
        <p>${text}</p>`;

const markoutList = () =>
  `<ul class="plain-list">${REGIONS.map(
    (region) =>
      `<li><b>${escapeHtml(region.name)}:</b> <a href="${escapeHtml(region.markout.url)}" target="_blank" rel="noopener">${escapeHtml(region.markout.center)}</a>, at least ${escapeHtml(region.markout.notice)} ahead</li>`,
  ).join('')}</ul>`;

export const aboutPage = (stylesheet: string) =>
  page({
    head: {
      title: `About | ${SITE_NAME}`,
      description: `${SITE_NAME} maps the pipes and cables under US city streets from public records, for the people who plan work there. Free, open source, rebuilt nightly.`,
      path: '/about',
      stylesheet,
    },
    current: 'about',
    intro: {
      label: 'About',
      title: `About ${SITE_NAME}`,
      lede: 'The pipes and cables under the street, mapped from public records. Made for engineers, contractors, utility coordinators and real estate teams who plan work there.',
      chips: [`${REGIONS.length} cities`, 'Rebuilt nightly', 'Free, no account', 'Open source'],
      after: '<p><a class="cta" href="/">Open the map</a></p>',
    },
    body: `${section(
      'not-a-locate',
      'Research, not a utility locate',
      `<p>Many gas, electric and telecom companies don't publish where their mains are, and private lines on a property never appear in permits. What ${SITE_NAME} shows is what the public record says, not what's in the ground.</p>
        <p><b>Before any digging,</b> the law in every city ${SITE_NAME} covers requires a free request to its one-call center, which sends the utilities out to mark their lines:</p>
        ${markoutList()}`,
      'warn',
    )}${section(
      'uses',
      "What it's for",
      `${point('Site research', 'Which utilities serve a lot, how deep they likely run and who digs there, before the survey.')}
        ${point('Scoping a dig', 'What is likely in the way of a trench and at what depth, to plan the work and the locate request.')}
        ${point('Due diligence', "A property's water service and house sewer, lead status where the city publishes it, and how often its street gets opened, in a lot report you can print.")}
        ${point('Coordinating street work', 'Who has permits out front today and who keeps coming back, so the same block is not opened twice.')}`,
    )}${section(
      'how',
      'How the map is built',
      `${point('A permit puts a utility on a block', 'A utility appears on a block when the city has issued an excavation permit for it there. Permits name the block, not the position in the street, so each utility gets its own lane, spaced so none hides another. Where crews wrote down how far from the curbs they opened the street, those notes set the lane instead.')}
        ${point("A city's own map, where it publishes one", 'Where a city maps its sewers, storm drains or water mains, those lines are drawn on their surveyed route, at their recorded depth when the city keeps one, in place of anything guessed from permits.')}
        ${point('Gaps are filled and labeled', 'Mains run the length of a street, but permits only cover the blocks someone dug. A utility with permits on part of a street is carried through the rest of it and labeled Inferred.')}
        ${point('Services run straight to each lot', 'Water services and house sewers are drawn straight from the main to each lot, because their routes are not published.')}
        ${point('Depth from standards', 'Few public records give the actual depth of a pipe. Where they don’t, lines sit at the minimum cover that federal, state, city and utility installation standards require, and their labels say "est." Older lines may be shallower or deeper.')}
        ${point('Every line says how it is known', 'Each line carries a label for where it came from:')}
        <ul class="plain-list">${LABEL_ORDER.map(
          (confidence) =>
            `<li><b>${escapeHtml(CONFIDENCE_LABELS[confidence].label)}:</b> ${escapeHtml(CONFIDENCE_LABELS[confidence].detail)}</li>`,
        ).join('')}</ul>`,
    )}${section(
      'data',
      'Where the data comes from',
      `<p>Only from records that cities, counties and utilities already publish: excavation and street opening permits, sewer, water and storm drain maps, lead service line inventories, hydrants, catch basins, manholes and street lights. Every city is rebuilt each night from a fresh download.</p>
        <p>Each source, city by city, with its license and how it's credited, is on the <a href="/credits">data credits page</a>. On the map, an address's card shows which sources answered for it.</p>
        <p>The code is open source under the AGPL, on <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>, and AI assistants can ask about any address through the <a href="/mcp">MCP server</a>.</p>`,
    )}${section(
      'who',
      'Who makes it',
      `<p>${SITE_NAME} is made by <a href="${MAKER.linkedin}" target="_blank" rel="noopener">${MAKER.name}</a> (<a href="${MAKER.github}" target="_blank" rel="noopener">GitHub</a>) and run by ${OPERATOR}.</p>
        <p>A wrong line, a missing street or an idea: use the <a href="/?sel=feedback">feedback form</a> on the map, or email ${CONTACT_LINK}. Common questions are answered in the <a href="/faq">FAQ</a>.</p>`,
    )}`,
  });
