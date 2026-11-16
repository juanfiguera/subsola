/**
 * The feedback card: a note, an optional email for a reply, and Cloudflare Turnstile, which
 * tells people from bots without a puzzle for most. Its script loads only when the card opens.
 * The server checks everything again (server/feedback.ts); nothing here is trusted.
 */

import { escapeHtml } from './dom';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const MESSAGE_MAX = 2000;

interface Turnstile {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      size?: 'flexible';
    },
  ) => string;
  reset: (id: string) => void;
}

let turnstileLoad: Promise<Turnstile> | null = null;
const loadTurnstile = () =>
  (turnstileLoad ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => {
      const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (turnstile) resolve(turnstile);
      else reject(new Error('Turnstile did not start'));
    };
    script.onerror = () => {
      turnstileLoad = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.append(script);
  }));

export const feedbackCard = (backButton: string) => `
  ${backButton}
  <h1 class="card-title">Send feedback</h1>
  <p class="hero-line">Something wrong on the map, missing, or confusing? Say what and where.</p>
  <form id="feedback-form" class="feedback-form" novalidate>
    <label for="feedback-message">Your note</label>
    <textarea id="feedback-message" name="message" rows="6" maxlength="${MESSAGE_MAX}" required></textarea>
    <label for="feedback-email">Email, if you'd like a reply</label>
    <input id="feedback-email" name="email" type="email" maxlength="200" autocomplete="email" />
    <div id="feedback-check" class="feedback-check"></div>
    <div id="feedback-status" class="feedback-status" role="status" tabindex="-1" hidden></div>
    <button class="pill pill-ink" type="submit" disabled>Send feedback</button>
  </form>
  <section id="feedback-sent" class="feedback-sent" tabindex="-1" hidden>
    <span class="feedback-sent-icon" aria-hidden="true">${CHECK_ICON}</span>
    <h2>Thanks, your note is sent</h2>
    <p>It went to the person who runs Subsola. If you left an email, you may hear back.</p>
    <button class="pill" type="button" data-feedback="again">Send another note</button>
  </section>
  <p class="fine">Your note and email go to the person who runs Subsola and nowhere else.</p>`;

const CHECK_ICON = '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg>';
const ALERT_ICON =
  '<svg viewBox="0 0 16 16"><path d="M8 2.5 14 13H2Z"/><path d="M8 6.5v3"/><circle cx="8" cy="11.3" r=".3"/></svg>';

type StatusKind = 'sending' | 'error';

/**
 * The outcome where it can't be missed: a sending line while the request is out, and a red box
 * with what went wrong when it fails. Success replaces the form instead (see mountFeedback).
 */
const showStatus = (status: HTMLElement, kind: StatusKind, text: string) => {
  status.hidden = false;
  status.dataset.kind = kind;
  status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  status.innerHTML =
    kind === 'error'
      ? `<span class="feedback-status-icon" aria-hidden="true">${ALERT_ICON}</span><div><strong>Not sent</strong><p>${escapeHtml(text)}</p></div>`
      : `<p>${escapeHtml(text)}</p>`;
};

/** Wires up the card `feedbackCard` drew. `page` says where the sender was, for context. */
export const mountFeedback = (
  card: HTMLElement,
  siteKey: string | undefined,
  page: () => string,
  onSent: () => void,
) => {
  const form = card.querySelector<HTMLFormElement>('#feedback-form');
  if (!form) return;
  const message = form.querySelector<HTMLTextAreaElement>('#feedback-message')!;
  const email = form.querySelector<HTMLInputElement>('#feedback-email')!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('#feedback-status')!;
  const sent = card.querySelector<HTMLElement>('#feedback-sent')!;
  const check = form.querySelector<HTMLElement>('#feedback-check')!;
  let token = '';
  let widget: string | null = null;
  let turnstile: Turnstile | null = null;
  const ready = () => {
    send.disabled = !token || message.value.trim().length < 3;
  };
  message.addEventListener('input', ready);

  sent.querySelector('[data-feedback="again"]')?.addEventListener('click', () => {
    sent.hidden = true;
    form.hidden = false;
    message.focus();
  });

  if (!siteKey) {
    showStatus(status, 'error', 'Feedback is not set up on this copy of Subsola.');
    return;
  }
  loadTurnstile()
    .then((loaded) => {
      turnstile = loaded;
      widget = loaded.render(check, {
        sitekey: siteKey,
        size: 'flexible',
        callback: (value) => {
          token = value;
          ready();
        },
        'expired-callback': () => {
          token = '';
          ready();
        },
      });
    })
    .catch((error: unknown) => {
      console.error('[subsola] feedback check failed to load', error);
      showStatus(
        status,
        'error',
        "The spam check didn't load. Check your connection and try again.",
      );
    });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (send.disabled) return;
    send.disabled = true;
    showStatus(status, 'sending', 'Sending…');
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.value,
        email: email.value,
        page: page(),
        turnstile: token,
      }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
        form.reset();
        status.hidden = true;
        form.hidden = true;
        sent.hidden = false;
        sent.focus();
        onSent();
      })
      .catch((error: unknown) => {
        const reason =
          error instanceof Error ? error.message : "Couldn't send it. Try again in a moment.";
        showStatus(status, 'error', `${reason} Your note is still here, so you can send it again.`);
        status.focus();
        console.info('[subsola] feedback not sent', error);
      })
      .finally(() => {
        // A Turnstile token works once; the next send needs a fresh one.
        token = '';
        if (turnstile && widget) turnstile.reset(widget);
        ready();
      });
  });
};
