import { REGIONS, cityNames } from '../regions';
import { CONTACT_LINK, OPERATOR, REPO_URL, SITE_NAME } from '../site';
import { page } from './shell';

/**
 * subsola.com/faq: the questions people ask on first sight (is this a locate, how accurate is
 * it, isn't it a security risk, will it stay free), answered before they're asked. Every answer
 * describes what the code and the data actually do; change it when they change. The same
 * answers go into FAQPage structured data so search engines can show them.
 */

interface Question {
  id: string;
  q: string;
  /** HTML; links are allowed. The structured data gets the same text with tags removed. */
  a: string;
}

interface Group {
  id: string;
  title: string;
  questions: Question[];
}

const groups = (): Group[] => [
  {
    id: 'digging',
    title: 'Before you dig',
    questions: [
      {
        id: 'locate',
        q: `Can I dig based on what ${SITE_NAME} shows?`,
        a: `No. ${SITE_NAME} is research, not a utility locate. Call 811 a few working days before any digging. It's free, the law requires it, and the utilities send someone to mark their lines on the ground. Use ${SITE_NAME} earlier, while you're scoping, designing or bidding, so you know what to expect.`,
      },
      {
        id: 'accuracy',
        q: 'How accurate is it?',
        a: `It depends on the record, and each line says which kind it is. Some come from the owner's own map with measured depths, as many city sewers do, and their labels give the depth plainly ("Sewer, 7 ft"). Others aren't published anywhere, so ${SITE_NAME} draws them at the standard spot and depth that codes and utility rules give, and labels them as estimates ("Gas, est. 1 ft 6 in"). Tap any line to see where it came from. Real lines can sit feet away from either, and private lines on a property never appear.`,
      },
      {
        id: 'missing',
        q: 'Why does a utility say "not published"?',
        a: `Many utilities don't publish where their mains are. Where a city or utility hasn't released a layer, ${SITE_NAME} shows what the permits and the standards say instead, and labels the rest "not published" rather than guessing.`,
      },
    ],
  },
  {
    id: 'data',
    title: 'The data',
    questions: [
      {
        id: 'sources',
        q: 'Where does the data come from?',
        a: `Only from records that cities, counties and utilities already publish: excavation and street opening permits, sewer, water and storm drain maps, lead service line inventories, hydrants, catch basins, manholes and street lights. Every source is listed, city by city, on the <a href="/credits">credits page</a>.`,
      },
      {
        id: 'fresh',
        q: 'How up to date is it?',
        a: `Every city is rebuilt each night from a fresh download, so a permit usually shows up the night after the city publishes it. Some cities publish their records days or weeks after the fact, and each card says when its records were last updated. When a city's server is down for a night, the map keeps the last good copy rather than going blank.`,
      },
      {
        id: 'mistake',
        q: 'I found a mistake. What should I do?',
        a: `Tell us the address and what looks wrong, through the <a href="/?sel=feedback">feedback form</a> on the map or by email to ${CONTACT_LINK}. Most mistakes trace back to a record, and we can usually find it from the address alone.`,
      },
    ],
  },
  {
    id: 'security',
    title: 'Security and privacy',
    questions: [
      {
        id: 'risk',
        q: 'Is it safe to put this information online?',
        a: `${SITE_NAME} shows only what its publishers already put online, in the form they publish it. It has no access to utilities' private records and doesn't try to get them. Where a publisher's terms don't allow reuse, the layer is paused and ${SITE_NAME} links to the publisher's own site instead. Lines drawn from standards show where codes say a line usually goes. They don't locate anyone's equipment. Detailed private utility records are a different matter. New York, for one, is building a map of them that only authorized city staff will see.`,
      },
      {
        id: 'publisher',
        q: 'I publish some of this data and want it changed or removed.',
        a: `Email ${CONTACT_LINK}. We'll change a credit right away, and pause a layer while we talk if you have concerns about how it's shown.`,
      },
      {
        id: 'tracking',
        q: 'Do you keep the addresses I search?',
        a: `No. ${SITE_NAME} has no accounts and never stores the addresses you look up, on the map or through AI assistants, unless you send feedback, which includes the page you were on. Suggestions for a street address are matched in your browser, so what you type stays there until you pick one. The <a href="/privacy">privacy page</a> lists everything that is kept.`,
      },
    ],
  },
  {
    id: 'project',
    title: 'Cost and who runs it',
    questions: [
      {
        id: 'free',
        q: 'Is it really free?',
        a: `Yes. The map, the lot reports and the server for AI assistants are free, with no account and no ads, and ${SITE_NAME} doesn't sell data. Paid tools might come later if there's interest.`,
      },
      {
        id: 'who',
        q: `Who runs ${SITE_NAME}?`,
        a: `${OPERATOR}. ${SITE_NAME} isn't affiliated with or endorsed by any city or utility.`,
      },
      {
        id: 'open-source',
        q: 'Is it open source? Can I run my own copy?',
        a: `Yes. The code is on <a href="${REPO_URL}">GitHub</a> under the AGPL, and one Docker command runs your own copy with a nightly refresh. The records keep their publishers' terms, listed on the <a href="/credits">credits page</a>.`,
      },
    ],
  },
  {
    id: 'coverage',
    title: 'Cities and AI assistants',
    questions: [
      {
        id: 'cities',
        q: 'Which cities are covered?',
        a: `${REGIONS.length} so far: ${cityNames('and')}.`,
      },
      {
        id: 'my-city',
        q: "Why isn't my city here?",
        a: `At the least, a city needs to publish where its streets have been dug up, and most don't yet. We check new cities' open data regularly. To ask for yours, use the <a href="/?sel=feedback">feedback form</a> or email ${CONTACT_LINK}.`,
      },
      {
        id: 'ai',
        q: 'How do AI assistants use it?',
        a: `${SITE_NAME} runs an MCP server, a standard way for AI assistants to look things up. Add it to Claude, ChatGPT, Cursor or any other MCP client, then ask about an address. It's free and read-only. <a href="/mcp">Set it up</a>.`,
      },
    ],
  },
];

const plain = (html: string) =>
  html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const faqJsonLd = (all: Group[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: all.flatMap((group) =>
    group.questions.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: plain(a) },
    })),
  ),
});

export const faqPage = (stylesheet: string) => {
  const all = groups();
  return page({
    head: {
      title: `Questions | ${SITE_NAME}`,
      description: `How ${SITE_NAME} works, how accurate it is, where its data comes from, and why it's research, not a utility locate.`,
      path: '/faq',
      stylesheet,
      jsonLd: faqJsonLd(all),
    },
    current: 'faq',
    intro: {
      label: 'Questions',
      title: 'Questions people ask',
      lede: `What ${SITE_NAME} is, what it isn't, and where its data comes from.`,
    },
    body: `${all
      .map(
        (group) => `
      <section class="block faq" aria-labelledby="faq-${group.id}">
        <h2 id="faq-${group.id}">${group.title}</h2>
        ${group.questions
          .map(
            ({ id, q, a }) => `<h3 id="${id}" class="faq-q">${q}</h3>
        <p>${a}</p>`,
          )
          .join('\n        ')}
      </section>`,
      )
      .join('')}
      <section class="block" aria-labelledby="faq-more">
        <h2 id="faq-more">Something else?</h2>
        <p>Email ${CONTACT_LINK}, or use the <a href="/?sel=feedback">feedback form</a> on the map.</p>
      </section>`,
  });
};
