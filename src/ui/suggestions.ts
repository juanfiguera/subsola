import type { CitySuggestion } from '../sources/suggest';
import { prettyAddress } from './dom';

/**
 * Type-ahead under the search box, as an ARIA combobox: the input owns a listbox of addresses,
 * Up and Down move through it, Enter picks the highlighted row (or searches as before when none
 * is), Escape and leaving the box close it. The requests themselves live in
 * src/sources/suggest.ts; this is the list and its timing.
 */

/** Characters typed before anything is asked; fewer match too much to help. */
export const MIN_CHARS = 3;
/** Quiet time after a keystroke before asking, so a quick typist sends one request, not five. */
export const DEBOUNCE_MS = 220;

/**
 * The next highlighted row for an arrow key, where -1 is the box itself. Down from the last row
 * and Up from the first go back to what was typed, as browsers' own lists do.
 */
export const moveHighlight = (current: number, key: 'ArrowDown' | 'ArrowUp', count: number) => {
  if (count === 0) return -1;
  if (key === 'ArrowDown') return current + 1 >= count ? -1 : current + 1;
  return current <= -1 ? count - 1 : current - 1;
};

/**
 * How much of a row's start is what was typed, ignoring case and spacing, for the bold part:
 * "23" in "233 Broadway" is 2 characters.
 */
export const matchedLength = (line: string, typed: string) => {
  const want = typed.trim().toLowerCase().replace(/\s+/g, ' ');
  let matched = 0;
  for (let i = 0, j = 0; i < line.length && j < want.length; i++, j++) {
    if (line[i]!.toLowerCase() !== want[j]) break;
    matched = i + 1;
  }
  return matched;
};

export interface SuggestionRequests {
  /** Call on every edit; asks once typing pauses, and drops any answer to older text. */
  update: (text: string) => void;
  /** Stops whatever is pending or in flight. */
  cancel: () => void;
}

/**
 * Debounced, abortable requests where only the latest text's answer is shown. `ask` gets a signal
 * that aborts as soon as the text changes; an answer that arrives anyway is dropped by its
 * sequence number, since not every fetch honors the signal in time.
 */
export const createSuggestionRequests = ({
  ask,
  show,
  minChars = MIN_CHARS,
  debounceMs = DEBOUNCE_MS,
}: {
  ask: (text: string, signal: AbortSignal) => Promise<CitySuggestion[]>;
  show: (rows: CitySuggestion[], text: string) => void;
  minChars?: number;
  debounceMs?: number;
}): SuggestionRequests => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let sequence = 0;
  // The text last asked about, or null once the list was closed.
  let current: string | null = null;

  const stop = () => {
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
    sequence++;
  };

  const cancel = () => {
    stop();
    current = null;
  };

  const update = (raw: string) => {
    const text = raw.trim();
    // A space typed before the next word asks nothing new; the rows already shown still fit.
    if (text === current) return;
    stop();
    current = text;
    if (text.length < minChars) return show([], text);
    const asked = sequence;
    timer = setTimeout(() => {
      controller = new AbortController();
      const { signal } = controller;
      ask(text, signal).then(
        (rows) => {
          if (asked === sequence && !signal.aborted) show(rows, text);
        },
        // suggestAddresses already catches each city's failure; this is the last guard, quietly.
        (error: unknown) => {
          if (!signal.aborted)
            console.info(
              `[subsola] suggestions failed: ${error instanceof Error ? error.name : 'error'}`,
            );
        },
      );
    }, debounceMs);
  };

  return { update, cancel };
};

/** "233 BROADWAY" as people write it, keeping a spelled-out "200 North Spring Street" readable. */
const lineOf = (row: CitySuggestion) => prettyAddress(row.line.toUpperCase());

const placeOf = (row: CitySuggestion) =>
  // New York's rows name the borough; the city itself goes without saying beside it.
  row.region.id === 'nyc' ? `${prettyAddress(row.place)}, NY` : row.region.name;

/**
 * Wires the list to the search box. `onPick` loads the row; Enter with nothing highlighted is
 * left to the form's own submit.
 */
export const attachSuggestions = ({
  form,
  input,
  ask,
  onPick,
}: {
  form: HTMLFormElement;
  input: HTMLInputElement;
  ask: (text: string, signal: AbortSignal) => Promise<CitySuggestion[]>;
  onPick: (row: CitySuggestion) => void;
}) => {
  const list = document.createElement('ul');
  list.id = 'search-suggestions';
  list.className = 'suggestions';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Suggested addresses');
  list.hidden = true;
  // Says how many rows came, for screen readers; the list itself isn't announced on its own.
  const status = document.createElement('span');
  status.className = 'suggestions-status';
  status.setAttribute('role', 'status');
  form.append(list, status);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  let rows: CitySuggestion[] = [];
  let highlighted = -1;

  const optionId = (i: number) => `search-suggestion-${i}`;

  const setHighlight = (next: number) => {
    highlighted = next;
    Array.from(list.children).forEach((option, i) =>
      option.setAttribute('aria-selected', String(i === next)),
    );
    if (next < 0) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', optionId(next));
      list.children[next]?.scrollIntoView({ block: 'nearest' });
    }
  };

  const close = () => {
    rows = [];
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    setHighlight(-1);
  };

  const show = (next: CitySuggestion[], typed: string) => {
    // An answer that comes after the box was left would open a list nobody is looking at.
    if (!next.length || document.activeElement !== input) {
      status.textContent = '';
      return close();
    }
    rows = next;
    // Built from text nodes: the rows are what a city's server sent, never trusted as markup.
    list.replaceChildren(
      ...next.map((row, i) => {
        const option = document.createElement('li');
        option.id = optionId(i);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const line = lineOf(row);
        const bold = matchedLength(line, typed);
        const address = document.createElement('span');
        address.className = 'suggestion-line';
        if (bold) {
          const strong = document.createElement('strong');
          strong.textContent = line.slice(0, bold);
          address.append(strong);
        }
        address.append(line.slice(bold));
        const place = document.createElement('span');
        place.className = 'suggestion-place';
        place.textContent = placeOf(row);
        option.append(address, place);
        return option;
      }),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setHighlight(-1);
    status.textContent = `${next.length} suggested address${next.length === 1 ? '' : 'es'}`;
  };

  const requests = createSuggestionRequests({ ask, show });

  const pick = (i: number) => {
    const row = rows[i];
    if (!row) return;
    input.value = lineOf(row);
    requests.cancel();
    close();
    onPick(row);
  };

  input.addEventListener('input', () => requests.update(input.value));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) return;
      event.preventDefault();
      setHighlight(moveHighlight(highlighted, event.key, rows.length));
      return;
    }
    if (event.key === 'Enter') {
      if (list.hidden || highlighted < 0) {
        // The form searches the typed text; a late answer mustn't open a list over that.
        requests.cancel();
        close();
        return;
      }
      event.preventDefault();
      pick(highlighted);
      return;
    }
    if (event.key === 'Escape' && !list.hidden) {
      // Only the list closes; the page's own Escape (leave the box) waits for a second press.
      event.preventDefault();
      event.stopPropagation();
      requests.cancel();
      close();
    }
  });

  input.addEventListener('blur', () => {
    requests.cancel();
    close();
  });

  // Keeps the focus in the box through a click or tap on a row, so blur doesn't close the list
  // before the click lands.
  list.addEventListener('pointerdown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const option = (event.target as Element).closest('[role="option"]');
    if (!option) return;
    pick(Array.from(list.children).indexOf(option));
  });

  form.addEventListener('submit', () => {
    requests.cancel();
    close();
  });
};
