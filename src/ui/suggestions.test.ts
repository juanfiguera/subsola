import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NYC } from '../regions';
import type { CitySuggestion } from '../sources/suggest';
import { createSuggestionRequests, matchedLength, moveHighlight } from './suggestions';

const row = (line: string): CitySuggestion => ({
  line,
  place: 'Manhattan',
  query: line,
  region: NYC,
});

describe('moveHighlight', () => {
  it('moves down and up through the rows, through the box itself', () => {
    expect(moveHighlight(-1, 'ArrowDown', 3)).toBe(0);
    expect(moveHighlight(0, 'ArrowDown', 3)).toBe(1);
    expect(moveHighlight(2, 'ArrowDown', 3)).toBe(-1);
    expect(moveHighlight(-1, 'ArrowUp', 3)).toBe(2);
    expect(moveHighlight(0, 'ArrowUp', 3)).toBe(-1);
  });

  it('stays in the box with no rows', () => {
    expect(moveHighlight(-1, 'ArrowDown', 0)).toBe(-1);
    expect(moveHighlight(-1, 'ArrowUp', 0)).toBe(-1);
  });
});

describe('matchedLength', () => {
  it('bolds the part of a row that was typed', () => {
    expect(matchedLength('233 Broadway', '23')).toBe(2);
    expect(matchedLength('233 Broadway', '233 broad')).toBe(9);
    expect(matchedLength('233 Broadway', '  233   BROAD')).toBe(9);
    expect(matchedLength('233 Broadway', '24')).toBe(1);
    expect(matchedLength('233 Broadway', 'broad')).toBe(0);
  });
});

describe('createSuggestionRequests', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const show = vi.fn<(rows: CitySuggestion[], text: string) => void>();
    const answers = new Map<string, (rows: CitySuggestion[]) => void>();
    const signals = new Map<string, AbortSignal>();
    const ask = vi.fn(
      (text: string, signal: AbortSignal) =>
        new Promise<CitySuggestion[]>((resolve) => {
          answers.set(text, resolve);
          signals.set(text, signal);
        }),
    );
    const requests = createSuggestionRequests({ ask, show, debounceMs: 200, minChars: 3 });
    return { show, ask, answers, signals, requests };
  };

  it('waits for a pause in typing and asks once', async () => {
    const { ask, requests } = setup();
    requests.update('23');
    requests.update('233');
    requests.update('233 b');
    await vi.advanceTimersByTimeAsync(199);
    expect(ask).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0]![0]).toBe('233 b');
  });

  it('asks nothing new for a trailing space, but again after a cancel', async () => {
    const { ask, requests } = setup();
    requests.update('233');
    await vi.advanceTimersByTimeAsync(200);
    requests.update('233 ');
    await vi.advanceTimersByTimeAsync(200);
    expect(ask).toHaveBeenCalledOnce();
    requests.cancel();
    requests.update('233');
    await vi.advanceTimersByTimeAsync(200);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('asks nothing under three characters and clears the list', async () => {
    const { ask, show, requests } = setup();
    requests.update(' 23 ');
    await vi.advanceTimersByTimeAsync(500);
    expect(ask).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith([], '23');
  });

  it('aborts the older request and drops its late answer', async () => {
    const { show, answers, signals, requests } = setup();
    requests.update('233');
    await vi.advanceTimersByTimeAsync(200);
    requests.update('233 b');
    expect(signals.get('233')!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    // The new answer first, then the old one arriving late anyway.
    answers.get('233 b')!([row('233 BROADWAY')]);
    answers.get('233')!([row('233 W 77 ST')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(show).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledWith([row('233 BROADWAY')], '233 b');
  });

  it('shows nothing once cancelled, such as after a pick or Enter', async () => {
    const { show, answers, requests } = setup();
    requests.update('233 b');
    await vi.advanceTimersByTimeAsync(200);
    requests.cancel();
    answers.get('233 b')!([row('233 BROADWAY')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(show).not.toHaveBeenCalled();
  });

  it('swallows a failure quietly', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const show = vi.fn();
    const requests = createSuggestionRequests({
      ask: () => Promise.reject(new TypeError('Failed to fetch 233 Secret')),
      show,
      debounceMs: 10,
    });
    requests.update('233 Secret');
    await vi.advanceTimersByTimeAsync(10);
    expect(show).not.toHaveBeenCalled();
    expect(String(info.mock.calls[0]![0])).not.toMatch(/secret/i);
    info.mockRestore();
  });
});
