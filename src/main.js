import './style.css';
import { INSTRUMENTS, getInstrument } from './data/instruments.js';
import { createScene } from './scene.js';
import { loadModel } from './models/index.js';
import { Fingering } from './highlight.js';
import { loadSample, playNote, stopAll } from './audio.js';
import { midiToBothNames } from './notes.js';
import { createStaff } from './staff.js';
import { startTuner, stopTuner } from './tuner.js';

const MAP_MODE = new URLSearchParams(location.search).has('map');
const credits = fetch(`${import.meta.env.BASE_URL}models/credits.json`)
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));

const $ = (id) => document.getElementById(id);
const ui = {
  instrument: $('instrument'), viewer: $('viewer'), tooltip: $('tooltip'), loading: $('loading'),
  noteName: $('note-name'), noteSub: $('note-sub'), prev: $('prev'), next: $('next'),
  range: $('range'), play: $('play'), scale: $('scale'), alt: $('alt'), keys: $('keys'),
  staff: $('staff'), audioStatus: $('audio-status'), credit: $('credit'),
  resetView: $('reset-view'), tunerToggle: $('tuner-toggle'), tuner: $('tuner'),
  tunerNote: $('tuner-note'), tunerNeedle: $('tuner-needle'), tunerReadout: $('tuner-readout'),
};

const state = { inst: null, index: 0, alt: 0, fingering: null, scaleTimer: null };
const view = createScene(ui.viewer);
view.onFrame.add((dt, t) => state.fingering?.update(dt, t));

// ---------------------------------------------------------------- persistence (best effort)
const saved = (() => {
  try { return JSON.parse(localStorage.getItem('fingering-chart') ?? '{}'); } catch { return {}; }
})();
function save() {
  try {
    localStorage.setItem('fingering-chart', JSON.stringify({
      instrument: state.inst.id, midi: currentEntry().midi,
    }));
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- instrument picker
for (const [family, label] of [['woodwind', 'Woodwinds'], ['brass', 'Brass']]) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const inst of INSTRUMENTS.filter((i) => i.family === family)) {
    group.append(new Option(inst.name, inst.id));
  }
  ui.instrument.append(group);
}
ui.instrument.addEventListener('change', () => selectInstrument(ui.instrument.value));

let loadToken = 0;
async function selectInstrument(id, midi) {
  stopScale();
  const inst = getInstrument(id);
  state.inst = inst;
  ui.instrument.value = inst.id;
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
    Object.assign(document.createElement('a'), { href: c.url, target: '_blank', rel: 'noopener', textContent: c.title }),
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
  staff?.select(state.index);
  save();
  syncSustain();
}

function go(index) {
  state.index = Math.max(0, Math.min(state.inst.chart.length - 1, index));
  state.alt = 0;
  render();
}

ui.prev.addEventListener('click', () => go(state.index - 1));
ui.next.addEventListener('click', () => go(state.index + 1));
ui.range.addEventListener('input', () => go(Number(ui.range.value)));
ui.alt.addEventListener('click', () => { state.alt++; render(); });

// ---------------------------------------------------------------- note staff
let staff = null;
function buildStaff() {
  staff = createStaff(ui.staff, state.inst.chart, state.inst.clef ?? 'treble', (i) => {
    go(i);
    if (!sustain) playCurrent(0.9); // while Play is on, go() already switched the note
  });
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
function stopScale() {
  clearTimeout(state.scaleTimer);
  state.scaleTimer = null;
  ui.scale.textContent = 'Play scale';
  ui.scale.setAttribute('aria-pressed', 'false');
}

ui.scale.addEventListener('click', () => {
  if (state.scaleTimer) { stopScale(); stopAll(); return; }
  setPlaying(false);
  unlockAudio();
  ui.scale.textContent = 'Stop';
  ui.scale.setAttribute('aria-pressed', 'true');
  if (state.index === state.inst.chart.length - 1) go(0);
  const step = () => {
    playCurrent(0.55);
    if (state.index >= state.inst.chart.length - 1) {
      state.scaleTimer = setTimeout(stopScale, 600);
      return;
    }
    state.scaleTimer = setTimeout(() => { go(state.index + 1); step(); }, 650);
  };
  step();
});

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

// ---------------------------------------------------------------- keyboard shortcuts
ui.resetView.addEventListener('click', () => view.resetView());
window.addEventListener('keydown', (e) => {
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
