import { pastCrashes, stagesSoFar } from '../crashes';
import { escapeHtml } from './dom';

/**
 * subsola.com/?debug: what a phone can't show otherwise. A tab iOS kills for memory reloads with
 * no trace on screen, so this lists how far the earlier loads got before dying, and this load's
 * progress, for a screenshot.
 */
export const showDebugPanel = (facts: () => Record<string, string | number>) => {
  const panel = document.createElement('pre');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-label', 'Debug details');
  document.body.append(panel);
  const render = () => {
    const crashes = pastCrashes();
    panel.innerHTML = escapeHtml(
      [
        `${navigator.userAgent}`,
        `screen ${screen.width}x${screen.height} @${devicePixelRatio}x`,
        ...Object.entries(facts()).map(([key, value]) => `${key} ${value}`),
        '',
        'this load:',
        ...stagesSoFar(),
        '',
        crashes.length ? 'earlier loads that died:' : 'no earlier load died',
        ...crashes.flatMap((crash) => [
          `${crash.at.slice(0, 19).replace('T', ' ')} UTC, ${crash.seconds} s in, at ${crash.stage}`,
          ...crash.path.map((step) => `  ${step}`),
        ]),
      ].join('\n'),
    );
  };
  render();
  setInterval(render, 1000);
};
