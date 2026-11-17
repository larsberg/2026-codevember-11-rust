# 11 — Rust

A 70-unit skinned rectangular metal tube oxidizes in a dark spotlight studio. One fixed task-lamp laser with a powder-coated black stand
sweeps a broad, flat laser fan across the surface, revealing silver beneath the
oxide. Rust returns at .036 per second. The fan's rays intersect the real mesh;
a thin luminous sheet joins only adjacent rays with confirmed surface hits. Missed
rays are omitted, and sparks spawn only at confirmed impacts. Each fan stays
perpendicular to the local surface travel direction and rotates through turns.

Run `npm run dev` in the visible VS Code terminal. Vite uses strict port **1234**.
Reuse the shared VS Code browser at `http://127.0.0.1:1234/?ui=1`.
**H** opens the inherited controls, **M** toggles sound, **Space** pauses.
Drag the tube to grab and lift it; release to drop it. Drag the background to
orbit; right-drag pans; wheel zooms. Two fingers pan/zoom. All laser aiming stays
automatic. Grabbing freezes camera follow and uses a native Box3D motor spring
at the clicked point on the deformed skin. Pause, blur, pointer cancellation,
hidden tabs and rebuild release the joint and restore the camera.
The Motion tab contains rust growth, laser radius (fan scale), and power. Mesh
contains tube length and initial oxidation. The hollow profile stays fixed at
13 × 10 units, 1.2-unit wall thickness and 2.2-unit outer corner radius. Restart surface starts a fresh
specimen; Reset settings restores defaults. Continuous Strudel audio follows the
working laser; pause, visibility changes and mute suspend it.

## Surface implementation

`tube-geometry.js` builds rounded rectangular outer and inner walls, connected
by annular end rims with open bores. Outer walls, inner walls, and each end rim
occupy separate UV bands in the 768 × 512 rust/metal mix texture.
`rust-mask.js` stores and updates this texture.
Ray intersections use the current deformed skin. Barycentric coordinates recover
rest-space positions and normals so cleaned patches remain attached as it bends.
A cached deformed raycast mesh matches the rendered SkinnedMesh, avoiding repeated
bone transformations for every fan ray. The fan stays perpendicular to travel;
its ray angles and intensity jitter at independent high frequencies. Every ray
stops at a confirmed metal intersection, with gaps breaking the fan sheet.

`rust-view.js` mixes clean-metal/rust color, roughness and metalness in the inherited
PBR shader. Object-space grain supplies corrosion and brushed steel detail. The
spotlight casts shadows on a physically lit floor. Sparks spawn at actual fan
impacts, use Box3D sphere colliders and cool from hot streaks to brown particles.
Floor impacts retire their bodies and deposit persistent dust in a bounded pool.

`laser-stands.js` builds one fixed lamp matching the supplied reference: a low
round weighted base, paired slim lower links, an elbow, a single upper link,
visible hinge pins and balance springs, and a cylindrical head with a recessed circular face. Its radius tracks
one quarter of the fan half-width at the impact, including live changes to the laser radius. The housing and stand share matte black powder-coat material settings;
only the shade/head pivots to aim. One 25-ray fan replaces the three-source
version, removing the extra intersection and mask passes. Recoil uses the full
single-source time step. `spotlight-floor.js` masks the floor to the actual
spotlight cone so it fades to black through the penumbra. The spotlight and its
contact shadows are preserved.

`rust-simulation.js` adapts **`../10-caustic/src/herd/body.js`**, the October 29
rig: seven section bodies with 28 native box colliders apiece, six cone/twist-limited
spherical joints, and skin
weights over neighboring bones. A real Three.js Skeleton/SkinnedMesh follows the
Box3D poses. Traveling torques bend the body; laser impulses recoil the nearest
section. Sustained contact builds a local curling response: neighboring sections
rotate inward toward the hit and lift, with larger joint travel and self-collision.
The response follows the moving impact and decays after release; its movement
comes entirely from Box3D forces/torques, not pose overrides. Gravity and floor contact govern its fall/landing; a mass-scaled,
horizontal origin field acts coherently on the whole rig. It pauses while held;
after release, a bounded friction allowance and shared velocity damping help the
undulating tube return without sticking far away or orbiting the origin. No vertex-spring solver
or direct animation of body transforms is used. Each section has four flat-wall box colliders and
24 rotated corner boxes, leaving the interior empty. Box offset/rotation uses
the [native createBox implementation](https://github.com/monteslu/box3d-wasm/blob/main/csrc/glue.cpp#L1048). At the enlarged scale, the preset also
scales gravity, gun, particles, camera and spotlight for comparable dynamics.

## Reactive sound

The inherited Strudel engine layers a quiet, overlapping laser carrier with
six procedural textures: sizzle, metal creak, spark ticks, settling dust,
floor knocks and soft contact clicks. Rust actually removed from the UV mask
controls the sizzle. Native body angular velocity and adjacent-bone bending
control creaks; Box3D tube/floor hit speeds control knocks. Spark and dust
counters produce sparse accents rather than one sound per particle. Screen
position supplies restrained stereo placement. Existing Audio controls own
master volume, mute and both voice layers; no extra controls were added.

`rust-sounds.js` bakes three short variants of each texture once, about 0.7 MB
at 48 kHz, and registers them as native Strudel sample voices. Sample playback
is capped at six concurrent voices, ten starts per second and a four-start burst;
synth playback has its own six-voice cap. Control signals update at 25 Hz, with
no downloads or per-frame audio-buffer generation. Mute, pause and hidden tabs
stop playback, and resuming discards accumulated events. Version 4 upgrades only
untouched old synth patches, preserving user volume, mute and customized voices.

## Inheritance inventory

Base: **`../01-fold`**, copied before subject replacement. Also inspected the
fuller studio implementations in **`../02-shatter-drafting`** and
**`../04-tangle-drafting`**. Shared sources retained:

| Feature | Source retained here |
| --- | --- |
| Drawer, tabs, H/M/Space, FPS, Reset, Save/Reload | Fold `controls.js` and styles; Rust replaces only subject controls |
| Palette library and workshop | Fold `palette-library.js`, `palette-workshop.js`, palette definitions |
| Camera and saved view/follow | Fold `camera.js`; left pointer orbits, right pointer pans |
| Box3D initialization, fixed stepping, collision and disposal | Fold `physics.js`; Caustic/October jointed hull-and-skin rig |
| Strudel activation, cancellation, mute/pause, live synth controls | Fold `score.js`, `synth.js`, `live-modulation.js`, audio helpers |
| Key, fill, hemisphere, spotlight, shadows and environment reflections | Fold `lighting-controls.js`, `lighting-settings.js`, `shadows.js` |
| Material editor, roughness, metallic response, emission and opacity | Fold `material-controls.js`, `material-settings.js`; Rust endpoint defaults |
| Contact AO, bloom and camera tilt blur | Fold `scene-effects.js`, `tilt-focus.js` |
| PNG export | Fold shell export action; drafting overlays and paper grain retired |
| Gallery player integration | Fold `player-bridge.js` |
| Atomic JSON setup API, ownership checks and schema validation | Fold `server/setup-api.js`, `persistence.js`, Rust identity |

Deliberate subject changes: the folding assembly, hinge commands, composition
and recorded clacks are replaced by the skinned tube, oxidation controls and automatic
laser sound. The jointed rig bends through applied physics torques and uses a temporary native grab spring while held. The palette workshop remains available for saved palette libraries; the material editor owns the metal/rust endpoints. Drafting controls, construction edges, projection guides and paper grain are removed from the scene, including when reading legacy saves. Ground audio
scopes and presentation/recording editors from Shatter are not part of Fold's
shell or this subject. Release tooling and the Pages workflow follow `../10-caustic`, with Rust-specific metadata and a real browser-captured thumbnail.

## Settings and verification

Development GET/PUT `/api/setup` uses `X-Sketch-Id: 11-rust`, validates settings,
and atomically saves `public/settings.json`. No development browser-storage
fallback. Older setups acquire missing Rust values while retaining shared studio,
camera, audio, material and palette edits. Production retains the inherited
per-sketch device-save behavior. Save stores parameters and view; the live
painted mask and dust intentionally reset on reload/rebuild. Version 2 migrates
the prior 7 × 1.3 capsule to 70 × 13 once, updating camera/spotlight scaling and
preserving saved sound, material and palette choices. Version 3 switches the
subject to a hollow rectangular tube; the legacy capsule radius remains accepted
in setup JSON but does not change the fixed tube profile.

`npm run check` runs the tests and builds production assets. Tests cover opposite
face isolation, cleaning across UV seams, rust return, seven-bone skinning and
bending, local recoil, origin return, Box3D floor contact, spark-to-dust settling,
material/environment rebuilds, legacy setup migration, temporary-file GET/PUT
round trips, lighting/material inputs, bloom/focus passes, and Strudel activation,
voice overlap, mute/pause, cancellation and synth controls.

Browser QA uses the user's existing shared tab. Verified actual ownership
response, live material/environment/exposure/bloom/focus/FPS/camera controls,
subject rebuild, Save/Reload equality and Reset defaults, actual skin deformation,
local recoil, noisy fan rays, dust deposits, spotlight shadows and Strudel start/stop. The user's saved setup is restored after verification.

## Build and deployment

Release preparation follows `../10-caustic`: relative Vite assets, bundled preset,
production-only per-device saves, the trusted gallery player bridge, metadata,
social previews, a real 1600 × 900 browser capture, and `.nojekyll`.
Development retains API-only Save/Reload with the `11-rust` ownership check.
`public/sketch.json` identifies the intended repository and Pages address as
`larsberg/2026-codevember-11-rust`. The generated gallery entry starts hidden;
gallery registration is separate from release preparation.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:release
```

`dist/` contains the complete static release, including Box3D WASM and locally
bundled Strudel. The release check verifies metadata, relative asset paths,
thumbnail dimensions, the saved preset, and the absence of development files.
`.github/workflows/pages.yml` builds, verifies and deploys `dist/` when main is
pushed, using GitHub Pages with **GitHub Actions** as its source. `pnpm deploy`
runs local checks and pushes source; the workflow performs the public deployment:

```sh
pnpm publish:source --dry-run
pnpm deploy
```

Before publishing, create the intended GitHub repository if needed, configure
`origin` to the repository declared in `public/sketch.json`, and commit source on
`main`. Publishers check repository identity; source publishing requires a clean
checkout. The optional legacy `pnpm publish:pages` command publishes only `dist/`
to `gh-pages`; use it only with Pages configured for **gh-pages / root**, instead
of the default Actions workflow. Do not run both publishers. No repository, push, public deployment or
gallery update is performed by release preparation alone.
