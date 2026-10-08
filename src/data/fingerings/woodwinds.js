// Woodwind fingering charts. Each chart line is "Note: key key key | alt keys | alt keys".
// Key ids must match the part names in the 3D models (see src/models/woodwinds.js).
// A ':half' suffix means the hole is half-covered (oboe/bassoon half-hole).
// Clarinet, oboe and bassoon are based on the Woodwind Fingering Guide (wfg.woodwind.org).
import { noteToMidi } from '../../notes.js';

function parse(text) {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      const [note, rest] = line.split(':').map((s) => s.trim());
      const [main, ...alts] = rest.split('|').map((f) => f.trim().split(/\s+/).filter(Boolean));
      return { midi: noteToMidi(note), keys: main, alts: alts.map((keys) => ({ keys })) };
    });
}

// Parsing splits on the first ':' only for the note, so restore ':half' suffixes.
function parseHalf(text) {
  return parse(text.replaceAll(':half', '~half')).map((e) => {
    const fix = (keys) => keys.map((k) => k.replace('~half', ':half'));
    return { ...e, keys: fix(e.keys), alts: e.alts.map((a) => ({ keys: fix(a.keys) })) };
  });
}

// ---------------------------------------------------------------- Flute (concert pitch)
export const flute = {
  keys: {
    thumbB: 'Left thumb B key', thumbBb: 'Left thumb B♭ key', L1: 'Left 1', L2: 'Left 2',
    L3: 'Left 3', LP_Gs: 'Left pinky G♯ key', R1: 'Right 1', R2: 'Right 2', R3: 'Right 3',
    RP_Eb: 'Right pinky E♭ key', RP_Cs: 'Foot C♯ key', RP_C: 'Foot C key',
    trillD: 'D trill key (right 1st finger side)', trillDs: 'D♯ trill key (right 2nd finger side)',
  },
  chart: parse(`
    C4: thumbB L1 L2 L3 R1 R2 R3 RP_C
    C#4: thumbB L1 L2 L3 R1 R2 R3 RP_Cs
    D4: thumbB L1 L2 L3 R1 R2 R3
    D#4: thumbB L1 L2 L3 R1 R2 R3 RP_Eb
    E4: thumbB L1 L2 L3 R1 R2 RP_Eb
    F4: thumbB L1 L2 L3 R1 RP_Eb
    F#4: thumbB L1 L2 L3 R3 RP_Eb
    G4: thumbB L1 L2 L3 RP_Eb
    G#4: thumbB L1 L2 L3 LP_Gs RP_Eb
    A4: thumbB L1 L2 RP_Eb
    A#4: thumbB L1 R1 RP_Eb | thumbBb L1 RP_Eb
    B4: thumbB L1 RP_Eb
    C5: L1 RP_Eb
    C#5: RP_Eb
    D5: thumbB L2 L3 R1 R2 R3
    D#5: thumbB L2 L3 R1 R2 R3 RP_Eb
    E5: thumbB L1 L2 L3 R1 R2 RP_Eb
    F5: thumbB L1 L2 L3 R1 RP_Eb
    F#5: thumbB L1 L2 L3 R3 RP_Eb
    G5: thumbB L1 L2 L3 RP_Eb
    G#5: thumbB L1 L2 L3 LP_Gs RP_Eb
    A5: thumbB L1 L2 RP_Eb
    A#5: thumbB L1 R1 RP_Eb | thumbBb L1 RP_Eb
    B5: thumbB L1 RP_Eb
    C6: L1 RP_Eb
    C#6: RP_Eb
    D6: thumbB L2 L3 RP_Eb
    D#6: thumbB L1 L2 L3 LP_Gs R1 R2 R3 RP_Eb
    E6: thumbB L1 L2 R1 R2 RP_Eb
    F6: thumbB L1 L3 R1 RP_Eb
    F#6: thumbBb L1 L3 R3 RP_Eb | thumbB L1 L3 R3 RP_Eb
    G6: L1 L2 L3 RP_Eb
    G#6: L2 L3 LP_Gs RP_Eb
    A6: thumbB L2 R1 RP_Eb
    A#6: thumbB R1 trillD
    B6: thumbBb L1 L3 trillDs
    C7: L1 L2 L3 LP_Gs R1
  `),
};

// ---------------------------------------------------------------- Oboe (concert pitch)
export const oboe = {
  keys: {
    oct1: '1st octave key (thumb)', oct2: '2nd octave key (side of L1)', L1: 'Left 1',
    L2: 'Left 2', L3: 'Left 3', LP_Gs: 'Left pinky G♯ key', LP_B: 'Left pinky low B key',
    LP_Bb: 'Left pinky low B♭ key', LP_Eb: 'Left pinky E♭ key', R1: 'Right 1', R2: 'Right 2',
    R3: 'Right 3', R_F: 'Right forked-F key', RP_C: 'Right pinky low C key',
    RP_Cs: 'Right pinky low C♯ key', RP_Eb: 'Right pinky E♭ key',
  },
  chart: parseHalf(`
    A#3: L1 L2 L3 LP_Bb R1 R2 R3 RP_C
    B3: L1 L2 L3 LP_B R1 R2 R3 RP_C
    C4: L1 L2 L3 R1 R2 R3 RP_C
    C#4: L1 L2 L3 R1 R2 R3 RP_Cs
    D4: L1 L2 L3 R1 R2 R3
    D#4: L1 L2 L3 R1 R2 R3 RP_Eb | L1 L2 L3 LP_Eb R1 R2 R3
    E4: L1 L2 L3 R1 R2
    F4: L1 L2 L3 R1 R2 R_F | L1 L2 L3 R1 R3 RP_Eb
    F#4: L1 L2 L3 R1
    G4: L1 L2 L3
    G#4: L1 L2 L3 LP_Gs
    A4: L1 L2
    A#4: L1 L2 R1
    B4: L1
    C5: L1 R1
    C#5: L1:half L2 L3 R1 R2 R3 RP_Cs
    D5: L1:half L2 L3 R1 R2 R3
    D#5: L1:half L2 L3 R1 R2 R3 RP_Eb
    E5: oct1 L1 L2 L3 R1 R2
    F5: oct1 L1 L2 L3 R1 R2 R_F | oct1 L1 L2 L3 R1 R3 RP_Eb
    F#5: oct1 L1 L2 L3 R1
    G5: oct1 L1 L2 L3
    G#5: oct1 L1 L2 L3 LP_Gs
    A5: oct2 L1 L2
    A#5: oct2 L1 L2 R1
    B5: oct2 L1
    C6: oct2 L1 R1
    C#6: L2 L3 R1 RP_C
    D6: L1:half L2 L3 RP_C
    D#6: L1:half L2 L3 LP_B R2 R3
    E6: oct1 L1:half L2 L3 LP_Gs LP_Eb R2 R3
    F6: oct1 L1:half L2 LP_Gs LP_Eb R2 R3
  `),
};

// ---------------------------------------------------------------- Bassoon (concert pitch)
export const bassoon = {
  keys: {
    LT_Bb: 'Left thumb low B♭ key', LT_B: 'Left thumb low B key', LT_C: 'Left thumb low C key',
    LT_D: 'Left thumb low D key', LT_Cs: 'Left thumb C♯ key', whisper: 'Whisper key (left thumb)',
    LT_A: 'A flick key (left thumb)',
    L1: 'Left 1', L2: 'Left 2', L3: 'Left 3', LP_Eb: 'Left pinky E♭ key',
    LP_Cs: 'Left pinky C♯ key', RT_Bb: 'Right thumb B♭ key', RT_E: 'Right thumb E key',
    RT_Fs: 'Right thumb F♯ key', R1: 'Right 1', R2: 'Right 2', R3: 'Right 3',
    RP_F: 'Right pinky F key', RP_Gs: 'Right pinky G♯ key',
  },
  chart: parseHalf(`
    A#1: LT_Bb LT_B LT_C LT_D L1 L2 L3 RT_E R1 R2 R3 RP_F
    B1: LT_B LT_C LT_D L1 L2 L3 RT_E R1 R2 R3 RP_F
    C2: LT_C LT_D L1 L2 L3 RT_E R1 R2 R3 RP_F
    C#2: LT_C LT_D L1 L2 L3 LP_Cs RT_E R1 R2 R3 RP_F
    D2: LT_D L1 L2 L3 RT_E R1 R2 R3 RP_F
    D#2: LT_D L1 L2 L3 LP_Eb RT_E R1 R2 R3 RP_F
    E2: whisper L1 L2 L3 RT_E R1 R2 R3 RP_F
    F2: whisper L1 L2 L3 R1 R2 R3 RP_F
    F#2: whisper L1 L2 L3 RT_Fs R1 R2 R3 RP_F
    G2: whisper L1 L2 L3 R1 R2 R3
    G#2: whisper L1 L2 L3 R1 R2 R3 RP_Gs
    A2: whisper L1 L2 L3 R1 R2
    A#2: whisper L1 L2 L3 RT_Bb R1 R2
    B2: whisper L1 L2 L3 R1
    C3: whisper L1 L2 L3
    C#3: LT_D LT_Cs whisper L1 L2 L3
    D3: whisper L1 L2
    D#3: whisper L1 L3
    E3: whisper L1
    F3: whisper
    F#3: whisper L1:half L2 L3 RT_Fs R1 R2 R3 RP_F
    G3: whisper L1:half L2 L3 LP_Eb R1 R2 R3
    G#3: whisper L1:half L2 L3 R1 R2 R3 RP_Gs
    A3: L1 L2 L3 R1 R2
    A#3: L1 L2 L3 RT_Bb R1 R2
    B3: L1 L2 L3 R1
    C4: L1 L2 L3
    C#4: LT_D LT_Cs L1 L2 L3
    D4: L1 L2
    D#4: L1 L2 R1 R2 R3
    E4: L1 L3 LP_Eb R1 R2 R3
    F4: L1 L3 LP_Eb R1 R2
    F#4: L2 L3 LP_Eb RT_Bb R1 R2
    G4: whisper L1:half L2 L3 LP_Eb R1 RP_F
    G#4: whisper L1:half L2 L3 LP_Eb R3
    A4: LT_A LT_Cs L1 L2 L3 LP_Eb R3
    A#4: LT_A LT_Cs L1 L2 L3 LP_Eb R1 R2 RP_F
  `),
};

// ---------------------------------------------------------------- Clarinet (written pitch)
// Clarion register (B4–C6) = chalumeau fingering a 12th lower + register key.
const CLARINET_LOW = parse(`
    E3: thumb L1 L2 L3 LP_E R1 R2 R3 | thumb L1 L2 L3 R1 R2 R3 RP_E
    F3: thumb L1 L2 L3 R1 R2 R3 RP_F | thumb L1 L2 L3 LP_F R1 R2 R3
    F#3: thumb L1 L2 L3 LP_Fs R1 R2 R3 | thumb L1 L2 L3 R1 R2 R3 RP_Fs
    G3: thumb L1 L2 L3 R1 R2 R3
    G#3: thumb L1 L2 L3 R1 R2 R3 RP_Gs | thumb L1 L2 L3 LP_Gs R1 R2 R3
    A3: thumb L1 L2 L3 R1 R2
    A#3: thumb L1 L2 L3 R1
    B3: thumb L1 L2 L3 R2
    C4: thumb L1 L2 L3
    C#4: thumb L1 L2 L3 LP_Cs
    D4: thumb L1 L2
    D#4: thumb L1 L2 sliver | thumb L1 L2 side4 | thumb L1 R1
    E4: thumb L1
    F4: thumb
`);
// Altissimo (same on all sizes of Boehm clarinet, per the Woodwind Fingering Guide).
const CLARINET_ALTISSIMO = parse(`
    C#6: register thumb L2 L3 R1 R2
    D6: register thumb L2 L3 R1 RP_Gs
    D#6: register thumb L2 L3 R1 RS_B RP_Gs
    E6: register thumb L2 L3 RP_Gs
    F6: register thumb L2 L3 LP_Cs RP_Gs
    F#6: register thumb L2 RP_Gs
    G6: register thumb L2 R1 R2 RP_Gs
    G#6: register thumb L2 L3 LP_Fs R1 R3
    A6: register thumb L2 L3 RP_F
    A#6: register thumb gsKey L2 L3 LP_Cs RP_Gs
    B6: register thumb gsKey L1 L2 R1 R2
    C7: register thumb gsKey L1 R1 RP_Fs
`);
const CLARINET_THROAT = parse(`
    F#4: L1 | thumb side3 side4
    G4:
    G#4: gsKey
    A4: aKey
    A#4: register aKey
`);

export const clarinet = {
  keys: {
    thumb: 'Left thumb hole', register: 'Register key (left thumb)', L1: 'Left 1', L2: 'Left 2',
    L3: 'Left 3', gsKey: 'G♯ throat key (left 1st finger)', aKey: 'A throat key (left 1st finger)',
    sliver: 'E♭/B♭ sliver key (left 1st finger)', LP_E: 'Left pinky E/B key',
    LP_F: 'Left pinky F/C key', LP_Fs: 'Left pinky F♯/C♯ key', LP_Gs: 'Left pinky A♭/E♭ key',
    LP_Cs: 'Left pinky C♯/G♯ key', R1: 'Right 1', R2: 'Right 2', R3: 'Right 3',
    RP_E: 'Right pinky E/B key', RP_F: 'Right pinky F/C key', RP_Fs: 'Right pinky F♯/C♯ key',
    RP_Gs: 'Right pinky A♭/E♭ key', side3: 'Right side trill key 3', side4: 'Right side trill key 4',
    RS_B: 'B/F♯ key (side of right 2nd finger)',
  },
  chart: [
    ...CLARINET_LOW,
    ...CLARINET_THROAT,
    ...CLARINET_LOW.map((e) => ({
      midi: e.midi + 19,
      keys: ['register', ...e.keys],
      alts: e.alts.map((a) => ({ keys: ['register', ...a.keys] })),
    })),
    ...CLARINET_ALTISSIMO,
  ],
};

// Bass clarinet: same fingerings, plus the low E♭ key below the soprano's range; its
// practical top is around written G6.
export const bassClarinet = {
  keys: { ...clarinet.keys, lowEb: 'Low E♭ key' },
  chart: [
    ...parse('D#3: thumb L1 L2 L3 LP_E R1 R2 R3 lowEb'),
    ...clarinet.chart.filter((e) => e.midi <= noteToMidi('G6')),
  ],
};

// ---------------------------------------------------------------- Saxophone (written pitch)
// Same written fingerings for alto, tenor and baritone; bari adds the low A key.
const SAX_KEYS = {
  octave: 'Octave key (left thumb)', L1: 'Left 1', bis: 'Bis key (between L1 and L2)',
  L2: 'Left 2', L3: 'Left 3', palmD: 'Palm key D', palmEb: 'Palm key E♭', palmF: 'Palm key F',
  frontF: 'Front F key', LP_Gs: 'Left pinky G♯ key', LP_Cs: 'Left pinky low C♯ key',
  LP_B: 'Left pinky low B key', LP_Bb: 'Left pinky low B♭ key', R1: 'Right 1', R2: 'Right 2',
  R3: 'Right 3', sideBb: 'Side B♭ key', sideC: 'Side C key', sideE: 'Side high E key',
  RP_Eb: 'Right pinky E♭ key', RP_C: 'Right pinky low C key',
  highFs: 'High F♯ key (right hand, side)',
};

const SAX_LOW = `
    A#3: L1 L2 L3 LP_Bb R1 R2 R3
    B3: L1 L2 L3 LP_B R1 R2 R3
    C4: L1 L2 L3 R1 R2 R3 RP_C
    C#4: L1 L2 L3 LP_Cs R1 R2 R3
    D4: L1 L2 L3 R1 R2 R3
    D#4: L1 L2 L3 R1 R2 R3 RP_Eb
    E4: L1 L2 L3 R1 R2
    F4: L1 L2 L3 R1
    F#4: L1 L2 L3 R2 | L1 L2 L3 R1 R2 R3
    G4: L1 L2 L3
    G#4: L1 L2 L3 LP_Gs
    A4: L1 L2
    A#4: L1 bis | L1 R1 | L1 sideBb
    B4: L1
    C5: L2 | L1 sideC
    C#5:`;

const SAX_HIGH = `
    D6: octave palmD
    D#6: octave palmD palmEb
    E6: octave palmD palmEb sideE | octave frontF palmD
    F6: octave palmD palmEb sideE palmF | octave frontF palmD palmEb
    F#6: octave palmD palmEb sideE palmF highFs`;

function saxChart(extraLow = '') {
  const low = parse(SAX_LOW);
  const octaveUp = low
    .filter((e) => e.midi >= noteToMidi('D4'))
    .map((e) => ({
      midi: e.midi + 12,
      keys: ['octave', ...e.keys],
      alts: e.alts.map((a) => ({ keys: ['octave', ...a.keys] })),
    }));
  return [...(extraLow ? parse(extraLow) : []), ...low, ...octaveUp, ...parse(SAX_HIGH)];
}

export const altoSax = { keys: SAX_KEYS, chart: saxChart() };
export const tenorSax = { keys: SAX_KEYS, chart: saxChart() };
export const bariSax = {
  keys: { ...SAX_KEYS, lowA: 'Low A key (left thumb)' },
  chart: saxChart('A3: lowA L1 L2 L3 LP_Bb R1 R2 R3'),
};
