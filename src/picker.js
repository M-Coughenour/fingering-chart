// Instrument menu: a button that opens a list below it. Replaces a native <select>, whose popup
// on macOS is placed over the current choice and can run off the top of the window. This list
// always opens below the button, stays inside the viewport and scrolls when it's too tall.

/**
 * Build the menu inside `root` from `groups` ([{ label, options: [{ value, label }] }]).
 * `onChange(value)` fires when the user picks a different option.
 * Returns { value } (get / set without firing onChange).
 */
export function createPicker(root, groups, onChange) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'picker-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const text = document.createElement('span');
  text.className = 'picker-text';
  button.append(text);

  const list = document.createElement('div');
  list.className = 'picker-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.hidden = true;
  const options = [];
  for (const group of groups) {
    const g = document.createElement('div');
    g.setAttribute('role', 'group');
    const head = document.createElement('div');
    head.className = 'picker-group';
    head.textContent = group.label;
    head.id = `picker-group-${group.label}`;
    g.setAttribute('aria-labelledby', head.id);
    g.append(head);
    for (const o of group.options) {
      const opt = document.createElement('div');
      opt.className = 'picker-option';
      opt.setAttribute('role', 'option');
      opt.dataset.value = o.value;
      opt.textContent = o.label;
      opt.addEventListener('click', () => choose(o.value));
      g.append(opt);
      options.push(opt);
    }
    list.append(g);
  }
  root.replaceChildren(button, list);

  let value = null;
  let active = -1; // keyboard highlight while open

  function setValue(v) {
    value = v;
    for (const o of options) o.setAttribute('aria-selected', String(o.dataset.value === v));
    text.textContent = options.find((o) => o.dataset.value === v)?.textContent ?? '';
  }

  function highlight(i) {
    active = Math.max(0, Math.min(options.length - 1, i));
    options.forEach((o, j) => o.classList.toggle('active', j === active));
    options[active].scrollIntoView({ block: 'nearest' });
  }

  /** Fit the list between the button and the bottom of the viewport. */
  function place() {
    const r = button.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const width = Math.min(Math.max(r.width, 240), vw - 2 * margin);
    list.style.width = `${width}px`;
    list.style.left = `${Math.max(margin, Math.min(r.right - width, vw - width - margin))}px`;
    list.style.top = `${r.bottom + 4}px`;
    list.style.maxHeight = `${Math.max(120, innerHeight - r.bottom - 4 - margin)}px`;
  }

  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    place();
    highlight(options.findIndex((o) => o.dataset.value === value));
    list.focus({ preventScroll: true });
  }

  function close(refocus = true) {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus({ preventScroll: true });
  }

  function choose(v) {
    close();
    if (v === value) return;
    setValue(v);
    onChange(v);
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation(); // the arrow keys also change the note elsewhere
      open();
    }
  });
  list.addEventListener('keydown', (e) => {
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    if (e.key in moves) highlight(active + moves[e.key]);
    else if (e.key === 'Home') highlight(0);
    else if (e.key === 'End') highlight(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(options[active].dataset.value);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { close(false); return; } // let focus move on
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) close(false); });
  addEventListener('resize', () => close(false));

  return {
    get value() { return value; },
    set value(v) { setValue(v); },
  };
}
