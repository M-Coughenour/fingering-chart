import './style.css';
import { INSTRUMENTS, getInstrument, baseOf, variantsOf } from './data/instruments.js';
import { createScene } from './scene.js';
import { loadModel } from './models/index.js';
import { Fingering } from './highlight.js';
import { loadSample, playNote, stopAll } from './audio.js';
import { midiToBothNames, midiToName } from './notes.js';
import { createStaff } from './staff.js';
import { createPicker } from './picker.js';
import { MAJOR_KEYS, scaleSequence } from './data/scales.js';
import { startTuner, stopTuner } from './tuner.js';

const MAP_MODE = new URLSearchParams(location.search).has('map');
const credits = fetch(`${import.meta.env.BASE_URL}models/credits.json`)
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));

const $ = (id) => document.getElementById(id);
const ui = {
  instrument: $('instrument'), variant: $('variant'), viewer: $('viewer'), tooltip: $('tooltip'), loading: $('loading'),
  noteName: $('note-name'), noteSub: $('note-sub'), prev: $('prev'), next: $('next'),
  range: $('range'), play: $('play'), scale: $('scale'), alt: $('alt'), keys: $('keys'),
  staff: $('staff'), audioStatus: $('audio-status'), credit: $('credit'),
  resetView: $('reset-view'), tunerToggle: $('tuner-toggle'), tuner: $('tuner'),
  tunerNote: $('tuner-note'), tunerNeedle: $('tuner-needle'), tunerReadout: $('tuner-readout'),
  divider: $('divider'), scaleKey: $('scale-key'), octaves: $('octaves'), staffWrap: $('staff-wrap'),
  staffTitle: $('staff-title'), staffPrev: $('staff-prev'), staffNext: $('staff-next'), staffFull: $('staff-full'),
  scaleInfo: $('scale-info'), arpeggio: $('arpeggio'),
};

// staffPos: staff position to highlight on the next render (scale notes repeat on the way down).
const state = { inst: null, index: 0, alt: 0, fingering: null, scaleTimer: null, arpeggio: false, staffPos: undefined };
const view = createScene(ui.viewer);
view.onFrame.add((dt, t) => state.fingering?.update(dt, t));

// ---------------------------------------------------------------- persistence (best effort)
const saved = (() => {
  try { return JSON.parse(localStorage.getItem('fingering-chart') ?? '{}'); } catch { return {}; }
})();
// Layout and scale choices: { panelW, viewerH, scaleKey, octaves, variants }.
// `variants` remembers the last version picked per instrument (menu id -> instrument id).
// The scale always starts on Chromatic; the octave count is remembered.
const prefs = { octaves: 1, ...saved.prefs, scaleKey: 'chromatic' };
prefs.variants = { ...prefs.variants };
function save() {
  try {
    localStorage.setItem('fingering-chart', JSON.stringify({
      instrument: state.inst.id, midi: currentEntry().midi, prefs,
    }));
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- instrument picker
const picker = createPicker(
  ui.instrument,
  [['woodwind', 'Woodwinds'], ['brass', 'Brass']].map(([family, label]) => ({
    label,
    options: INSTRUMENTS.filter((i) => i.family === family && !i.variantOf).map((i) => ({ value: i.id, label: i.name })),
  })),
  (id) => {
    // Reopen the version used last, if it's still a version of this instrument.
    const last = INSTRUMENTS.find((i) => i.id === prefs.variants[id]);
    selectInstrument(last && baseOf(last) === id ? last.id : id);
  },
);

/** Version toggle (e.g. 3 / 4 valves) for instruments that come in more than one build. */
function syncVariants(inst) {
  const variants = variantsOf(inst);
  ui.variant.hidden = variants.length < 2;
  ui.variant.replaceChildren(...variants.map((v) => {
    const b = document.createElement('button');
    b.textContent = v.variant;
    b.setAttribute('aria-pressed', String(v.id === inst.id));
    // Keep the same written note when switching, if the other version can play it.
    b.addEventListener('click', () => v.id !== state.inst.id && selectInstrument(v.id, currentEntry().midi));
    return b;
  }));
}

let loadToken = 0;
async function selectInstrument(id, midi) {
  stopScale();
  const inst = getInstrument(id);
  state.inst = inst;
  picker.value = baseOf(inst);
  if (inst.variant) prefs.variants[baseOf(inst)] = inst.id;
  syncVariants(inst);
  const found = inst.chart.findIndex((e) => e.midi === midi);
  state.index = found >= 0 ? found : Math.floor(inst.chart.length / 2);
  ui.range.max = inst.chart.length - 1;
  buildStaff();

  const token = ++loadToken;
  ui.loading.hidden = false;
  const { object, source } = await loadModel(inst.model);
  if (token !== loadToken) return; // a newer selection won
  ui.loading.hidden = true;
  state.object = object;
  state.fingering = new Fingering(object);
  view.show(object);
  render();
  showCredit(inst.model, source);
  mapTool?.load();
  // Warm up the samples once audio is allowed (after the first interaction).
  if (audioUnlocked) preloadSample();
}

async function showCredit(model, source) {
  const c = source === 'model' ? (await credits)[model] : null;
  ui.credit.hidden = !c;
  if (!c) return;
  ui.credit.replaceChildren(
    'Model: ',
    c.url
      ? Object.assign(document.createElement('a'), { href: c.url, target: '_blank', rel: 'noopener', textContent: c.title })
      : c.title,
    ` by ${c.author} (${c.license})`,
  );
}

// ---------------------------------------------------------------- note display
const currentEntry = () => state.inst.chart[state.index];

function fingeringFor(entry) {
  const options = [{ keys: entry.keys, slide: entry.slide }, ...entry.alts];
  return { options, current: options[state.alt % options.length] };
}

function render() {
  const { inst } = state;
  const entry = currentEntry();
  const { options, current } = fingeringFor(entry);
  const concert = entry.midi + inst.transpose;

  ui.noteName.textContent = midiToBothNames(entry.midi);
  ui.noteSub.textContent = inst.transpose
    ? `Written pitch · sounds ${midiToBothNames(concert)} (concert)`
    : `Concert pitch${inst.clef === 'bass' ? ' · bass clef' : ''}`;
  ui.range.value = state.index;
  ui.prev.disabled = state.index === 0;
  ui.next.disabled = state.index === inst.chart.length - 1;

  ui.alt.hidden = options.length < 2;
  ui.alt.textContent = `Fingering ${(state.alt % options.length) + 1} of ${options.length} ↻`;

  ui.keys.replaceChildren();
  const add = (text, cls) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    ui.keys.append(li);
  };
  if (current.slide) add(`Slide position ${current.slide}`);
  for (const k of current.keys) {
    const [id, mode] = k.split(':');
    add(`${inst.keys[id] ?? id}${mode === 'half' ? ' (half-hole)' : ''}`, mode === 'half' ? 'half' : '');
  }
  if (!current.keys.length && !current.slide) add(inst.family === 'brass' ? 'Open (no valves)' : 'All open', 'open');

  state.fingering?.show(current.keys, current.slide);
  staff?.select(state.index, state.staffPos);
  state.staffPos = undefined;
  updateScaleInfo();
  ui.staffTitle.textContent = midiToBothNames(entry.midi);
  save();
  syncSustain();
}

/** Show chart note `index`; `pos` picks which staff position to highlight when it repeats. */
function go(index, pos) {
  state.index = Math.max(0, Math.min(state.inst.chart.length - 1, index));
  state.staffPos = pos;
  state.alt = 0;
  render();
}

ui.prev.addEventListener('click', () => go(state.index - 1));
ui.next.addEventListener('click', () => go(state.index + 1));
ui.range.addEventListener('input', () => go(Number(ui.range.value)));
ui.alt.addEventListener('click', () => { state.alt++; render(); });

// ---------------------------------------------------------------- note staff
// Chromatic shows the instrument's whole range; a major scale shows exactly what Play scale
// plays (up and back down), spelled in the key.
let staff = null;
let staffItems = [];
function buildStaff() {
  const { chart, clef } = state.inst;
  if (prefs.scaleKey === 'chromatic') {
    staffItems = chart.map((e, index) => ({ index, midi: e.midi }));
  } else {
    const { indices, letters } = scaleNotes();
    staffItems = indices.map((index, i) => ({ index, midi: chart[index].midi, letter: letters[i] }));
  }
  staff = createStaff(ui.staff, staffItems, clef ?? 'treble', (i, pos) => {
    go(i, pos);
    if (!sustain) playCurrent(0.9); // while Play is on, go() already switched the note
  });
  staff.select(state.index);
}

/** Step along the staff (fullscreen ‹ ›): through the scale as written, or chromatically. */
function stepStaff(delta) {
  if (prefs.scaleKey === 'chromatic') return go(state.index + delta);
  const from = staff.position < 0 ? (delta > 0 ? -1 : staffItems.length) : staff.position;
  const pos = Math.max(0, Math.min(staffItems.length - 1, from + delta));
  go(staffItems[pos].index, pos);
}

// ---------------------------------------------------------------- audio
let audioUnlocked = false;

function preloadSample() {
  const { sample, name } = state.inst;
  ui.audioStatus.textContent = `Loading ${name} sound…`;
  loadSample(sample)
    .then(() => { if (state.inst.sample === sample) ui.audioStatus.textContent = ''; })
    .catch(() => { ui.audioStatus.textContent = 'Could not load sounds — check your connection.'; });
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  preloadSample();
}

/** Play the current note; with `duration` it's a one-shot, otherwise returns a stopper. */
function playCurrent(duration) {
  unlockAudio();
  const midi = currentEntry().midi + state.inst.transpose;
  return playNote(state.inst.sample, midi, { duration }).catch(() => {
    ui.audioStatus.textContent = 'Could not load sounds — check your connection.';
    return () => {};
  });
}

// Play is a toggle: while it's on the current note sustains, and changing the note or
// instrument switches the sound to match.
let sustain = null; // { key, stop: Promise<stop function> }

function setPlaying(on) {
  if (on) {
    stopScale();
    sustain = { key: null, stop: Promise.resolve(null) };
    syncSustain();
  } else if (sustain) {
    sustain.stop.then((fn) => fn?.());
    sustain = null;
  }
  ui.play.classList.toggle('active', on);
  ui.play.setAttribute('aria-pressed', String(on));
  ui.play.textContent = on ? '■ Stop' : '▶ Play';
}

/** Restart the sustained note if the note or instrument changed. */
function syncSustain() {
  if (!sustain || !state.inst) return;
  const key = `${state.inst.sample}:${currentEntry().midi + state.inst.transpose}`;
  if (key === sustain.key) return;
  sustain.stop.then((fn) => fn?.());
  sustain.key = key;
  sustain.stop = playCurrent();
}

ui.play.addEventListener('click', () => setPlaying(!sustain));

// ---------------------------------------------------------------- scale playback
const arpeggioOn = () => state.arpeggio && prefs.scaleKey !== 'chromatic';

function stopScale() {
  clearTimeout(state.scaleTimer);
  state.scaleTimer = null;
  ui.scale.textContent = arpeggioOn() ? 'Play arpeggio' : 'Play scale';
  ui.scale.setAttribute('aria-pressed', 'false');
}

/**
 * Chart indices to play: the chromatic run from the current note, or a major scale or
 * arpeggio (with each note's staff letter, spelled in the key).
 */
function scaleNotes() {
  const { chart, transpose } = state.inst;
  if (prefs.scaleKey === 'chromatic') {
    const from = state.index === chart.length - 1 ? 0 : state.index;
    return { indices: chart.slice(from).map((_, i) => from + i), letters: [], label: '' };
  }
  const key = MAJOR_KEYS.find((k) => k.name === prefs.scaleKey) ?? MAJOR_KEYS[0];
  const seq = scaleSequence(chart, transpose, key.pc, prefs.octaves, { arpeggio: state.arpeggio });
  const kind = state.arpeggio ? 'major arpeggio' : 'major';
  if (!seq.indices.length) return { indices: [], letters: [], label: `${key.name} ${kind} doesn't fit this instrument's range.` };
  const written = transpose ? ` · written ${midiToName(seq.tonic).replace(/-?\d+$/, '')} ${kind}` : '';
  const oct = `${seq.octaves} octave${seq.octaves > 1 ? 's' : ''}`;
  const limited = seq.octaves < prefs.octaves ? ` (range allows ${seq.octaves})` : '';
  return { indices: seq.indices, letters: seq.letters, label: `Concert ${key.name} ${kind}${written} · ${oct}${limited}` };
}

ui.scale.addEventListener('click', () => {
  if (state.scaleTimer) { stopScale(); stopAll(); return; }
  const { indices } = scaleNotes();
  if (!indices.length) return;
  setPlaying(false);
  unlockAudio();
  ui.scale.textContent = 'Stop';
  ui.scale.setAttribute('aria-pressed', 'true');
  let n = 0;
  // The staff shows the same sequence for a major scale, so highlight position n there.
  const onStaff = prefs.scaleKey !== 'chromatic';
  const step = () => {
    go(indices[n], onStaff ? n : undefined);
    playCurrent(0.55);
    n++;
    state.scaleTimer = n < indices.length ? setTimeout(step, 650) : setTimeout(stopScale, 600);
  };
  step();
});

// Key picker and octave toggle.
ui.scaleKey.append(new Option('Chromatic', 'chromatic'));
for (const k of MAJOR_KEYS) ui.scaleKey.append(new Option(`${k.name} major (concert)`, k.name));
const octaveButtons = [...ui.octaves.querySelectorAll('button')];
/** Sync the scale controls and redraw the staff for the chosen scale. */
function syncScaleOptions() {
  const chromatic = prefs.scaleKey === 'chromatic';
  ui.scaleKey.value = prefs.scaleKey;
  for (const b of octaveButtons) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.octaves) === prefs.octaves));
    b.disabled = chromatic;
  }
  ui.arpeggio.disabled = chromatic;
  ui.arpeggio.setAttribute('aria-pressed', String(arpeggioOn()));
  stopScale(); // never playing here (changeScale stops first); refreshes the button label
  if (state.inst) buildStaff();
  updateScaleInfo();
}
/** Describe what Play scale will play for the current instrument and choices. */
function updateScaleInfo() {
  if (!state.inst) return;
  ui.scaleInfo.textContent = prefs.scaleKey === 'chromatic' ? 'Chromatic, from the current note to the top' : scaleNotes().label;
}
// Changing the scale mid-playback would leave the staff and the sequence out of step.
const changeScale = (fn) => { if (state.scaleTimer) stopAll(); fn(); syncScaleOptions(); save(); };
ui.scaleKey.addEventListener('change', () => changeScale(() => { prefs.scaleKey = ui.scaleKey.value; }));
for (const b of octaveButtons) {
  b.addEventListener('click', () => changeScale(() => { prefs.octaves = Number(b.dataset.octaves); }));
}
ui.arpeggio.addEventListener('click', () => changeScale(() => { state.arpeggio = !state.arpeggio; }));
syncScaleOptions();

// ---------------------------------------------------------------- tuner
// Shows the note being played in the current instrument's written pitch, so it matches
// the chart. Tapping the note jumps to its fingering.
let tunerOn = false;
let heardMidi = null; // written pitch of the last clear reading

function showReading(reading) {
  if (!reading) {
    ui.tunerNeedle.classList.add('idle');
    return;
  }
  const { hz, midi, cents } = reading;
  heardMidi = midi - state.inst.transpose;
  const off = Math.abs(cents);
  ui.tunerNote.textContent = midiToBothNames(heardMidi);
  ui.tunerNote.disabled = false;
  ui.tunerNeedle.classList.remove('idle');
  ui.tunerNeedle.style.left = `${50 + cents}%`;
  ui.tunerNeedle.dataset.tune = off <= 5 ? 'good' : off <= 15 ? 'close' : 'off';
  const verdict = off <= 5 ? 'In tune' : `${Math.round(off)} cents ${cents > 0 ? 'sharp' : 'flat'}`;
  ui.tunerReadout.textContent = `${verdict} · ${hz.toFixed(1)} Hz`;
}

async function setTuner(on) {
  tunerOn = on;
  ui.tunerToggle.setAttribute('aria-pressed', String(on));
  ui.tunerToggle.classList.toggle('active', on);
  ui.tuner.hidden = !on;
  if (!on) {
    stopTuner();
    return;
  }
  // Don't let the app's own sound feed into the microphone.
  setPlaying(false);
  stopScale();
  stopAll();
  heardMidi = null;
  ui.tunerNote.textContent = '–';
  ui.tunerNote.disabled = true;
  ui.tunerNeedle.classList.add('idle');
  ui.tunerReadout.textContent = 'Play a note…';
  try {
    await startTuner(showReading);
    if (!tunerOn) stopTuner(); // switched off while the permission prompt was open
  } catch (err) {
    setTuner(false);
    ui.audioStatus.textContent = err?.name === 'NotAllowedError'
      ? 'Microphone access was blocked — allow it in the browser to use the tuner.'
      : `Tuner unavailable: ${err?.message ?? err}`;
  }
}

ui.tunerToggle.addEventListener('click', () => setTuner(!tunerOn));
ui.tunerNote.addEventListener('click', () => {
  if (heardMidi === null) return;
  const i = state.inst.chart.findIndex((e) => e.midi === heardMidi);
  if (i >= 0) go(i);
  else ui.audioStatus.textContent = `${midiToBothNames(heardMidi)} is out of range for ${state.inst.name}.`;
});

// ---------------------------------------------------------------- resizable panel
// Drag the divider to resize the panel (side by side) or the 3D view (stacked on phones).
const stacked = () => matchMedia('(max-width: 760px)').matches;
const root = document.documentElement.style;

function applyLayout() {
  if (prefs.panelW) root.setProperty('--panel-w', `${prefs.panelW}px`);
  else root.removeProperty('--panel-w');
  if (prefs.viewerH) root.setProperty('--viewer-h', `${prefs.viewerH}vh`);
  else root.removeProperty('--viewer-h');
  ui.divider.setAttribute('aria-orientation', stacked() ? 'horizontal' : 'vertical');
}

function resizeTo(clientX, clientY) {
  if (stacked()) {
    const top = ui.viewer.getBoundingClientRect().top;
    prefs.viewerH = Math.round(Math.min(75, Math.max(20, ((clientY - top) / innerHeight) * 100)));
  } else {
    prefs.panelW = Math.round(Math.min(innerWidth * 0.7, Math.max(260, innerWidth - clientX)));
  }
  applyLayout();
}

ui.divider.addEventListener('pointerdown', (e) => {
  ui.divider.setPointerCapture(e.pointerId);
  ui.divider.classList.add('dragging');
  e.preventDefault();
});
ui.divider.addEventListener('pointermove', (e) => {
  if (ui.divider.hasPointerCapture(e.pointerId)) resizeTo(e.clientX, e.clientY);
});
const endDrag = (e) => {
  if (!ui.divider.hasPointerCapture(e.pointerId)) return;
  ui.divider.releasePointerCapture(e.pointerId);
  ui.divider.classList.remove('dragging');
  save();
};
ui.divider.addEventListener('pointerup', endDrag);
ui.divider.addEventListener('pointercancel', endDrag);
ui.divider.addEventListener('dblclick', () => {
  delete prefs[stacked() ? 'viewerH' : 'panelW'];
  applyLayout();
  save();
});
ui.divider.addEventListener('keydown', (e) => {
  const delta = { ArrowLeft: 20, ArrowRight: -20, ArrowUp: -20, ArrowDown: 20 }[e.key];
  if (delta === undefined) return;
  e.preventDefault();
  e.stopPropagation(); // don't also change the note
  const r = ui.divider.getBoundingClientRect();
  if (stacked()) resizeTo(0, r.top + delta);
  else resizeTo(r.left - delta, 0);
  save();
});
addEventListener('resize', applyLayout);
applyLayout();

// ---------------------------------------------------------------- fullscreen staff
// A fixed overlay works everywhere (iPhone Safari can't fullscreen page elements); the
// Fullscreen API also hides the browser's own bars where it's supported.
let staffFullscreen = false;

function setStaffFullscreen(on) {
  staffFullscreen = on;
  ui.staffWrap.classList.toggle('fullscreen', on);
  ui.staffFull.textContent = on ? '✕' : '⛶';
  ui.staffFull.setAttribute('aria-label', on ? 'Close fullscreen staff' : 'Fullscreen staff');
  if (on) ui.staffWrap.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  requestAnimationFrame(() => staff?.select(state.index)); // re-centre at the new size
}

ui.staffFull.addEventListener('click', () => setStaffFullscreen(!staffFullscreen));
ui.staffPrev.addEventListener('click', () => stepStaff(-1));
ui.staffNext.addEventListener('click', () => stepStaff(1));
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && staffFullscreen) setStaffFullscreen(false);
});

// ---------------------------------------------------------------- keyboard shortcuts
ui.resetView.addEventListener('click', () => view.resetView());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && staffFullscreen) setStaffFullscreen(false);
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (e.key === 'r' || e.key === 'R') view.resetView();
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { go(state.index + 1); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { go(state.index - 1); e.preventDefault(); }
  if (e.key === ' ' && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
    setPlaying(!sustain);
    e.preventDefault();
  }
});

// ---------------------------------------------------------------- part names on hover / tap
function showTooltip(e) {
  const id = view.partAt(e.clientX, e.clientY);
  const label = id === 'slide' ? 'Slide' : state.inst?.keys[id];
  ui.tooltip.hidden = !label;
  if (!label) return;
  const rect = ui.viewer.getBoundingClientRect();
  ui.tooltip.textContent = label;
  ui.tooltip.style.left = `${e.clientX - rect.left}px`;
  ui.tooltip.style.top = `${e.clientY - rect.top}px`;
}
view.canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') showTooltip(e); });
view.canvas.addEventListener('pointerdown', unlockAudio);
let downAt = null;
view.canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
view.canvas.addEventListener('pointerup', (e) => {
  // A tap (not a drag) toggles the label on touch screens.
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) showTooltip(e);
});

// ---------------------------------------------------------------- dev: key mapping (?map)
let mapTool = null;
if (MAP_MODE) {
  import('./mapTool.js').then(({ createMapTool }) => {
    mapTool = createMapTool({
      view,
      getContext: () => ({ inst: state.inst, object: state.object }),
      onChange: () => { state.fingering = new Fingering(state.object); render(); },
    });
    if (state.object) mapTool.load();
  });
  window.fingeringApp = { state, view }; // handy for debugging from the console
}

selectInstrument(saved.instrument ?? 'trumpet', saved.midi);
