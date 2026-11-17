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
Left-drag or one finger orbits; right-drag pans; wheel zooms. Two fingers pan/zoom.
All aiming is automatic; pointer input only operates the camera and unlocks audio.
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
the fan half-width at the impact, including live changes to the laser radius. The housing and stand share matte black powder-coat material settings;
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
horizontal origin field acts coherently on the whole rig. No vertex-spring solver
or direct animation of body transforms is used. Each section has four flat-wall box colliders and
24 rotated corner boxes, leaving the interior empty. Box offset/rotation uses
the [native createBox implementation](https://github.com/monteslu/box3d-wasm/blob/main/csrc/glue.cpp#L1048). At the enlarged scale, the preset also
scales gravity, gun, particles, camera and spotlight for comparable dynamics.

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
| Paper grain and drawing PNG export | Fold `drawing-plate.js`, shell export action |
| Gallery player integration | Fold `player-bridge.js` |
| Atomic JSON setup API, ownership checks and schema validation | Fold `server/setup-api.js`, `persistence.js`, Rust identity |

Deliberate subject changes: the folding assembly, hinge commands, composition
and recorded clacks are replaced by the skinned tube, oxidation controls and automatic
laser sound. The jointed rig bends through applied physics torques and has no grab spring. The palette colors the
construction ink; the material editor owns the metal/rust endpoints. Ground audio
scopes and presentation/recording editors from Shatter are not part of Fold's
shell or this subject. Publishing/gallery scripts and Fold release metadata are
not carried into this local sketch.

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
