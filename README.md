# 11 — Rust

A chamfered steel cube oxidizes in a dark spotlight studio. An automatic gun
sweeps a broad, flat laser fan across the surface, revealing silver beneath the
oxide. Rust returns at .036 per second. The fan's rays intersect the real mesh;
a thin luminous sheet joins only adjacent rays with confirmed surface hits. Missed
rays are omitted, and sparks spawn only at confirmed impacts. The fan stays
perpendicular to the local surface travel direction and rotates through turns.

Run `npm run dev` in the visible VS Code terminal. Vite uses strict port **1234**.
Reuse the shared VS Code browser at `http://127.0.0.1:1234/?ui=1`.
**H** opens the inherited controls, **M** toggles sound, **Space** pauses.
Left-drag or one finger orbits; right-drag pans; wheel zooms. Two fingers pan/zoom.
All aiming is automatic; pointer input only operates the camera and unlocks audio.
The Motion tab contains rust growth, laser radius (fan scale), and power. Mesh
contains cube size, chamfer, and initial oxidation. Restart surface starts a fresh
specimen; Reset settings restores defaults. Continuous Strudel audio follows the
working laser; pause, visibility changes and mute suspend it.

## Surface implementation

`rust-mask.js` unwraps the RoundedBoxGeometry into six distinct atlas islands.
The 768 × 512 linear data texture stores the rust/metal mix. Three.js raycasting
provides the interpolated hit UV, point and surface normal. The hit's wide, thin fan
footprint projects into the atlas through precomputed texel surface positions.
This cleans across neighboring chamfer islands without affecting an opposite
face. Consecutive hits sweep a continuous segment to avoid gaps between frames.
The mask grows with elapsed simulation time and loses oxide under the beam.

`rust-view.js` extends the inherited physically based material shader: the mask
mixes clean-metal and rust color, metalness and roughness. Object-space
multi-scale noise supplies corrosion patches, pitting and brushed metal detail.
The gun follows the actual surface normal; its beam, impact ring, light and
short-lived sparks follow the real intersection. Construction ink follows the
cube and the ground projection derives from its actual dimensions.

`rust-simulation.js` uses the inherited Box3D world, stepping and cleanup. Its
convex hull is derived from the same chamfered geometry used for rendering and
picking. Box3D owns its resting pose and floor collision.

## Inheritance inventory

Base: **`../01-fold`**, copied before subject replacement. Also inspected the
fuller studio implementations in **`../02-shatter-drafting`** and
**`../04-tangle-drafting`**. Shared sources retained:

| Feature | Source retained here |
| --- | --- |
| Drawer, tabs, H/M/Space, FPS, Reset, Save/Reload | Fold `controls.js` and styles; Rust replaces only subject controls |
| Palette library and workshop | Fold `palette-library.js`, `palette-workshop.js`, palette definitions |
| Camera and saved view/follow | Fold `camera.js`; left pointer orbits, right pointer pans |
| Box3D initialization, fixed stepping, collision and disposal | Fold `physics.js`, new Rust hull |
| Strudel activation, cancellation, mute/pause, live synth controls | Fold `score.js`, `synth.js`, `live-modulation.js`, audio helpers |
| Key, fill, hemisphere, spotlight, shadows and environment reflections | Fold `lighting-controls.js`, `lighting-settings.js`, `shadows.js` |
| Material editor, roughness, metallic response, emission and opacity | Fold `material-controls.js`, `material-settings.js`; Rust endpoint defaults |
| Contact AO, bloom and camera tilt blur | Fold `scene-effects.js`, `tilt-focus.js` |
| Paper grain and drawing PNG export | Fold `drawing-plate.js`, shell export action |
| Gallery player integration | Fold `player-bridge.js` |
| Atomic JSON setup API, ownership checks and schema validation | Fold `server/setup-api.js`, `persistence.js`, Rust identity |

Deliberate subject changes: the folding assembly, hinge commands, composition
and recorded clacks are replaced by the cube, oxidation controls and automatic
laser sound. The physics rig has no motors or grab spring. The palette colors the
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
painted mask intentionally resets on reload/rebuild.

`npm run check` runs the tests and builds production assets. Tests cover opposite
face isolation, cleaning across UV seams, rust return, Box3D floor contact,
material/environment rebuilds, legacy setup migration, temporary-file GET/PUT
round trips, lighting/material inputs, bloom/focus passes, and Strudel activation,
voice overlap, mute/pause, cancellation and synth controls.

Browser QA uses the user's existing shared tab. Verified actual ownership
response, live material/environment/exposure/bloom/focus/FPS/camera controls,
subject rebuild, Save/Reload equality and Reset defaults, plus pointer cleaning
and Strudel start/stop. The user's saved setup is restored after verification.
