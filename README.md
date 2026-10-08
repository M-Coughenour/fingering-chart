# Fingering Chart 3D

Interactive fingering chart for 17 brass and woodwind instruments. Pick an instrument and a
note: the 3D model highlights the keys/valves to press (or moves the trombone slide), and you
can hear the note played with real instrument samples. Runs in any modern browser on phones,
Windows and Mac, and can be installed as an app (PWA).

```bash
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # also reachable from your phone on the same Wi-Fi
npm test               # fingering data checks
npm run build          # static site in dist/ (deploy to GitHub Pages, Netlify, ...)
```

## Controls

- **‹ / ›**, the slider, the mini keyboard, or the arrow keys change the note.
- **Play** toggles a sustained note on and off (space bar too). While it's on, changing
  the note or instrument switches the sound to match.
- **Play scale** steps through the whole range.
- **Fingering 1 of N** cycles alternate fingerings.
- Drag to rotate, right-drag / two fingers / WASD to move, scroll or pinch to zoom,
  **Reset view** (or R) to re-centre. Hover/tap a key to see its name.
- Blue = press, orange = half-hole.

## Tuner

Tap **🎤 Tuner** and allow the microphone. Play a note: the tuner shows it in the selected
instrument's written pitch (so it matches the chart), with a needle for how many cents sharp
or flat you are (green within ±5). Tap the note name to jump to its fingering. Tap **Tuner**
again to stop listening.

The microphone only works on secure pages: `localhost`, the deployed https site, or the
installed app. `npm run dev -- --host` serves https for testing on a phone; accept the
one-time certificate warning there. Phone mics pick up very low notes (tuba, bari sax)
weakly and may read them an octave high, but the sharp/flat reading is still right.

## Pitch

Charts show **written** pitch (what's on the player's sheet music). Transposing instruments
also show the concert pitch, and the audio always plays concert pitch.

## Real 3D models

All instruments use detailed models built in code (`src/models/`). A real 3D scan of
[Charlie Parker's alto saxophone](https://3d.si.edu/object/3d/alto-saxophone-owned-and-played-charlie-parker:c7c58ff8-fd1f-4cf6-9813-6bca3cd0b8b3)
(Smithsonian, CC0) is kept in `models-src/` with its key mapping. Move `altoSax.glb` and
`altoSax.parts.json` back into `public/models/` to use it again.

To add a realistic model (for example from Sketchfab or Free3D, which need a free account):

1. Download it as **glTF Binary (.glb)** and save it in `models-src/`. Check the license.
2. Optimize it into the app (model ids are in `src/data/instruments.js`):
   ```bash
   npm run prepare-model -- models-src/my-trumpet.glb trumpet
   ```
   This writes `public/models/trumpet.glb` and lists the model's parts.
3. Add its credit to `public/models/credits.json` (shown under the viewer).
4. Map the keys: open `http://localhost:5173/?map`, tick **Lock camera**, choose a
   key and click where it is on the model. **Copy JSON** into
   `public/models/trumpet.parts.json`. `npm test` checks every key in the chart is mapped.

`parts.json` can point a key at a whole part instead of a click point. Use this when a model's
valves or keys are separate objects, so they also move when pressed:

```json
{
  "transform": { "rotation": [0, 140, 0], "height": 2 },
  "keys": {
    "valve1": { "node": "Valve1_Button", "pressDir": [0, -1, 0], "travel": 0.05 },
    "L1": { "mesh": "Keys", "piece": 12 },
    "R1": { "marker": [0.1, -0.4, 0.05], "normal": [0.5, 0, 0.85], "size": 0.02 }
  }
}
```

`node` = object name, `piece` = connected piece of a mesh, `marker` = glowing ring at a point
(used for scans, which are one solid piece).

## Sounds

General MIDI soundfont samples (MusyngKite or FluidR3, whichever has loop points for that
instrument so notes can sustain) are loaded through
[smplr](https://github.com/danigb/smplr) and cached for offline use after their first download. Instruments
without their own sample share the closest one: bass clarinet → clarinet, mellophone →
French horn, baritone/euphonium → trombone, sousaphone → tuba.

## Fingering sources

Valve and slide charts are standard. The clarinet, oboe and bassoon charts follow the
[Woodwind Fingering Guide](https://www.wfg.woodwind.org/). Fingerings live in
`src/data/fingerings/` as plain text tables, so they're easy to fix or extend.
