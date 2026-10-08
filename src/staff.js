// Note picker drawn as a music staff: every note in the instrument's range as a whole note,
// in the instrument's clef, with ledger lines and accidentals. The clef stays put while the
// notes scroll sideways. Replaces the old mini piano keyboard.
const SVG = 'http://www.w3.org/2000/svg';
const GAP = 10; // distance between staff lines
const STEP = GAP / 2; // one diatonic step (line to space)
const NOTE_W = 30; // horizontal room per note
const CLEF_W = 44;

// Pitch class -> [letter index C=0..B=6, flat?]. Flats read most naturally for band
// instruments (B♭, E♭...).
const SPELLING = [[0, 0], [1, 1], [1, 0], [2, 1], [2, 0], [3, 0], [4, 1], [4, 0], [5, 1], [5, 0], [6, 1], [6, 0]];
// Diatonic step of the bottom staff line: E4 in treble clef, G2 in bass clef.
const BOTTOM_LINE = { treble: 2 + 7 * 4, bass: 4 + 7 * 2 };
// Clef glyphs and where their ink should sit, in staff spaces from the top line (+ = down).
// Fonts pad glyphs differently, so the ink is measured and fitted to these bounds.
const CLEF = {
  treble: { glyph: '\u{1D11E}', top: -1.7, bottom: 5.5 },
  bass: { glyph: '\u{1D122}', top: -0.05, bottom: 3.2 },
};
const CLEF_FONT = "'Noto Music', 'Bravura', 'Apple Symbols', 'Segoe UI Symbol', serif";

/** Font size and baseline offset that make `glyph`'s ink span exactly `height` px. */
function fitGlyph(glyph, height) {
  const probe = 100;
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${probe}px ${CLEF_FONT}`;
  const m = c.measureText(glyph);
  const ink = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || probe;
  const scale = height / ink;
  return { size: probe * scale, ascent: (m.actualBoundingBoxAscent || probe * 0.8) * scale };
}

/** Diatonic step (letter + 7 × octave) and whether the note needs a flat. */
export function staffStep(midi) {
  const [letter, flat] = SPELLING[((midi % 12) + 12) % 12];
  return { step: letter + 7 * (Math.floor(midi / 12) - 1), flat: Boolean(flat) };
}

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/**
 * Draw the staff into `container` for `chart` (sorted chart entries) in `clef`
 * ('treble' | 'bass'). `onPick(index)` fires when a note is tapped.
 * Returns { select(index) } to highlight and scroll to a note.
 */
export function createStaff(container, chart, clef = 'treble', onPick = () => {}) {
  const bottom = BOTTOM_LINE[clef];
  const steps = chart.map((e) => staffStep(e.midi));
  // Room above and below the staff for the highest/lowest notes and their ledger lines.
  const above = Math.max(8, ...steps.map((s) => s.step - bottom)) - 8;
  const below = Math.max(0, ...steps.map((s) => bottom - s.step));
  const top = (above + 5) * STEP;
  const height = top + 8 * STEP + (below + 4) * STEP;
  const yOf = (step) => top + (bottom + 8 - step) * STEP;
  const staffLines = (svg, width) => {
    for (let i = 0; i < 5; i++) {
      const y = yOf(bottom + 2 * i);
      svg.append(el('line', { x1: 0, x2: width, y1: y, y2: y, class: 'staff-line' }));
    }
  };

  // Fixed clef on the left.
  const clefSvg = el('svg', {
    width: CLEF_W, height, viewBox: `0 0 ${CLEF_W} ${height}`, class: 'staff-clef', 'aria-hidden': 'true',
  });
  staffLines(clefSvg, CLEF_W);
  const spec = CLEF[clef];
  const topLine = yOf(bottom + 8);
  const { size, ascent } = fitGlyph(spec.glyph, (spec.bottom - spec.top) * GAP);
  const clefText = el('text', {
    x: 6, y: topLine + spec.top * GAP + ascent, 'font-size': size, 'font-family': CLEF_FONT,
  });
  clefText.textContent = spec.glyph;
  clefSvg.append(clefText);

  // Scrolling notes.
  const width = chart.length * NOTE_W + NOTE_W;
  const notes = el('svg', {
    width, height, viewBox: `0 0 ${width} ${height}`, class: 'staff-notes', role: 'listbox', 'aria-label': 'Notes',
  });
  staffLines(notes, width);
  const groups = chart.map((entry, i) => {
    const { step, flat } = steps[i];
    const x = NOTE_W * (i + 1);
    const y = yOf(step);
    const g = el('g', { class: 'staff-note', role: 'option', tabindex: -1, 'data-index': i });
    // Generous invisible hit area so notes are easy to tap.
    g.append(el('rect', { x: x - NOTE_W / 2, y: 0, width: NOTE_W, height, class: 'staff-hit' }));
    for (let s = bottom - 2; s >= step; s -= 2) {
      g.append(el('line', { x1: x - 10, x2: x + 10, y1: yOf(s), y2: yOf(s), class: 'staff-ledger' }));
    }
    for (let s = bottom + 10; s <= step; s += 2) {
      g.append(el('line', { x1: x - 10, x2: x + 10, y1: yOf(s), y2: yOf(s), class: 'staff-ledger' }));
    }
    g.append(el('ellipse', { cx: x, cy: y, rx: 6.4, ry: 4.6, transform: `rotate(-20 ${x} ${y})`, class: 'staff-head' }));
    if (flat) {
      const acc = el('text', { x: x - 15, y: y + 4, class: 'staff-acc' });
      acc.textContent = '♭';
      g.append(acc);
    }
    g.addEventListener('click', () => onPick(i));
    notes.append(g);
    return g;
  });

  const scroller = document.createElement('div');
  scroller.className = 'staff-scroll';
  scroller.append(notes);
  container.replaceChildren(clefSvg, scroller);

  return {
    select(index) {
      groups.forEach((g, i) => {
        g.classList.toggle('sel', i === index);
        g.setAttribute('aria-selected', String(i === index));
      });
      // Scroll only the strip (scrollIntoView would also scroll the panel on phones).
      // The SVG scales up in fullscreen, so measure its rendered size.
      const zoom = notes.getBoundingClientRect().height / height || 1;
      scroller.scrollLeft = NOTE_W * (index + 1) * zoom - scroller.clientWidth / 2;
    },
  };
}
