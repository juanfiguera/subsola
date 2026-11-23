/**
 * The docs page's own script: client tabs and copy buttons. The theme switch and the section nav
 * are the shared shell's (public/shell.js). Without it the page still works: every client's setup
 * shows stacked under its own heading.
 */
export const PAGE_SCRIPT = `
(() => {
  document.documentElement.classList.add('js');
  const status = document.querySelector('.status');
  let timer;
  const say = (text) => {
    status.textContent = text;
    status.classList.add('shown');
    clearTimeout(timer);
    timer = setTimeout(() => status.classList.remove('shown'), 2600);
  };

  // Tabs, as the ARIA Authoring Practices describe them: arrow keys move between tabs, Home and
  // End jump to the ends, and only the selected tab is in the tab order.
  for (const tabs of document.querySelectorAll('[data-tabs]')) {
    const list = tabs.querySelector('[role=tablist]');
    const buttons = [...list.querySelectorAll('[role=tab]')];
    const panels = buttons.map((button) => document.getElementById(button.getAttribute('aria-controls')));
    const select = (index, focus) => {
      buttons.forEach((button, i) => {
        const selected = i === index;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      });
      if (focus) buttons[index].focus();
    };
    list.hidden = false;
    for (const panel of panels) panel.setAttribute('role', 'tabpanel');
    select(0, false);
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => select(i, false));
      button.addEventListener('keydown', (event) => {
        const last = buttons.length - 1;
        const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(next, true);
      });
    });
  }

  const selectText = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  for (const button of document.querySelectorAll('[data-copy]')) {
    const label = button.querySelector('.copy-label');
    button.addEventListener('click', async () => {
      const node = document.getElementById(button.dataset.copy);
      try {
        await navigator.clipboard.writeText(node.textContent);
        if (label) {
          label.textContent = 'Copied';
          setTimeout(() => (label.textContent = button.dataset.label || 'Copy'), 1600);
        }
        say('Copied.');
      } catch {
        // Some browsers refuse the clipboard (an embedded view, a denied permission): select the
        // text so a keyboard shortcut copies it.
        selectText(node);
        say('Selected. Press Ctrl+C, or Command+C on a Mac, to copy.');
      }
    });
  }
})();
`;
