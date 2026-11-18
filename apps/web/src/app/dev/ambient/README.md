# Stage 4.6.1C — unified Ambient Gallery

Run `pnpm dev` from the repository root and open **http://127.0.0.1:3000/dev/ambient**.
This is the sole development gallery route. `/dev/ambient/custom` and `/dev/ambient/library`, including trailing-slash forms, return 404 in development and production. No redirects are installed. The old page entries and their unused three-effect presentation component are removed; their renderer implementations remain intact.

## Selection and preview

One effect selector and one preview region cover all fifteen existing effects:

| Category              | Effects                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Atmospheric           | Original OGL, Dark Veil, Aurora, Ghost Fibers, Silk, Soft Aurora |
| Cosmic & Light        | Orb, Light Pillar, Side Rays, Galaxy, Lightning, Magic Rings     |
| Content & Interaction | Grid Distortion, Grid Motion, Radar                              |

No renderer implementation is loaded before selection. Explicit client-side dynamic imports request the chosen implementation/CSS only. Next's initial async-loader registration metadata is not an implementation preload. Previously fetched code can remain cached, but only the selected renderer is mounted. Switching tears down its GPU resources, observers, event listeners and RAF scheduling.

Every effect has its own recommended primary parameter and defaults. Primary values are remembered independently while switching effects during the page session. Original OGL additionally exposes speed, stars and palette; Dark Veil/Aurora expose speed, brightness and palette. Pointer controls are shown only where supported. Additional controls return to defaults on switching. Pause/reduced-motion/text/expanded view preferences are shared for consistent comparison. A reload clears this temporary state.

**Reset defaults** restores the selected effect's recommended parameters, pointer setting, movie selection and local demonstration state; restores text and normal motion; resumes animation; and recreates a failed/lost renderer. It keeps the current preview size. It does not reset another candidate's stored primary value.

**Expand preview** makes the same study panel fill the window. It changes CSS dimensions and runs native resize handling; it neither portals nor mounts a second renderer. The selection controls are inert, body scrolling is locked, keyboard focus stays in the study, and Escape closes it. It is a fullscreen-style panel, not the browser Fullscreen API. The same canvas remains connected across open/close.

## Content and accessibility

- All fifteen choices are native keyboard-accessible buttons with an explicit pressed state. Controls have names, visible focus treatment and responsive wrapping.
- Text overlay can be toggled. Magic Rings has a real centered action/status demonstration. Radar has real DOM loading/results status text driven by local state, with no production search connection.
- Grid Distortion uses its public `imageSrc` with local Sintel/Spring/Tears of Steel stills. Grid Motion receives actual `items` objects with local poster-format crops or stills. The gallery displays Blender credits, source/license links and the crop/compression disclosure. No production API dependency or new public asset is added.
- Grid Motion starts with row parallax enabled (`parallax=0.3`) and **Row drift speed (px/s)** at 8, adjustable from 0–30. **Row parallax** controls only row translation; native spotlight and static tilt remain unchanged. Zero drift speed preserves pointer response. Reset restores these defaults, and per-effect primary speed values remain independent when switching candidates.
- Lightning is warned as flashing before selection. Reduced motion substitutes a still CSS light streak, with no canvas or animation.
- Static fallback remains visible until the selected renderer is ready, and returns on context loss/unavailable WebGL/error. Reset retries. A no-ready timeout handles silent initialization failures in new vendors.

## Activity and cleanup

The existing `useAmbientActivity` controls system reduced motion, manual pause, intersection and document visibility. Original OGL, Dark Veil and Aurora retain their existing native pause/visible-static-redraw behavior: they keep one paused instance for setting changes and resize, schedule no continuous RAF while paused, and do not redraw hidden setting changes. This preserves the immutable-texture resize regression coverage. Other candidates unmount while paused/hidden/offscreen; resuming restarts their vendor clocks/seeds. Reduced motion unmounts every renderer. Only the selected legacy renderer may remain owned while paused/hidden; no inactive renderer survives switching.

Every native renderer owns its cleanup. The gallery additionally releases detached contexts after partial initialization, and defers context destruction so Strict Mode replay on connected canvases remains safe. The original shader algorithms and the fourteen vendor shader sources are unchanged in this consolidation. No dependencies are added.

## Source and provenance

- Original FRAME shader: `components/visual/ambient-shader.ts`, wrapper `cinematic-ambient-background.tsx`, existing OGL 1.0.11 (Unlicense). The preview links OGL's pinned source.
- Dark Veil/Aurora: React Bits revision `b0422bb475ac9ec1fe1680290970494ceff5d4eb`; full license, provenance and shader hashes remain in `components/visual/ambient-vendor`.
- Other twelve: React Bits revision `9d9c687dc4f55b23539aa5417b703078047efa74`; full license, [dependency/lifecycle audit](../../../components/visual/gallery-vendor/PROVENANCE.md), source and exact shader hashes remain in `components/visual/gallery-vendor`.

Each third-party preview links its own pinned upstream source. Both snapshots retain the complete MIT + Commons Clause notice; this is not unrestricted MIT. Grid Distortion/Magic Rings are native WebGL2 in the actual pinned source, not Three.js; Grid Motion uses DOM transforms. No new rendering dependency is introduced. Review license restrictions and shader ancestry before production adoption.

## Production isolation

Unchanged `next.config.ts` recognizes `page.dev.tsx` only in `PHASE_DEVELOPMENT_SERVER`; the remaining page also guards with `notFound()` outside development. No production page/layout imports gallery code. A real production build must exclude the route, client modules and shaders from manifests/emitted JS/CSS. The retained route and both removed URLs return 404 in production. Homepage/Search/Discover content smoke tests remain separate from production integration.

## Verification and evidence

```powershell
node --test tests/visual/ambient-gallery-source.test.cjs
node --test tests/visual/ambient-gallery.test.cjs
node --test tests/visual/ambient-webgl.test.cjs
node --test tests/visual/ambient.test.cjs
pnpm --filter @frame/web exec vitest run src/components/visual/use-ambient-activity.test.tsx src/components/visual/cinematic-ambient-background.test.tsx --maxWorkers=1
pnpm lint
pnpm typecheck
pnpm build
$env:FRAME_AMBIENT_QA='production'
node --test tests/visual/ambient.test.cjs
```

Gallery QA captures all fifteen at 320/375/393/430/768/1024/1440px; checks keyboard controls, primary setting retention/reset, one renderer, disposal, pause/resume, reduced motion, static fallback, expanded canvas identity, movie interfaces, local DOM states and desktop/mobile axe accessibility. It writes desktop/mobile screenshots and GPU/responsive reports into ignored `tmp/ambient-gallery`. `ambient-webgl.test.cjs` preserves real WebGL2 immutable-storage resize, RGBA16F/RGBA8, mipmaps, native paused static redraw, context loss and deliberately injected target-allocation/framebuffer failure coverage on the unified route. It writes `tmp/ambient-webgl-review`. Route/build isolation evidence is in `tmp/ambient-spike`.

Chromium SwiftShader is real software WebGL, not a physical-device performance result. Synthetic `document.hidden` events are not OS tab lifecycle certification. Physical-mobile thermal/battery behavior, other engines, exhaustive temporal contrast/flash safety, third-party provenance/legal approval and user visual selection remain open. Historical performance/provider/no-JavaScript streaming debt is unchanged. No Stage 4.6.2, production integration or production selection is included. Await user visual review.

## Final runtime regression verification

`node --test tests/visual/ambient-webgl.test.cjs` also covers Light Pillar allocation/framebuffer failure, resize, reset retry and context loss; Dark Veil/Aurora pointer enable-disable-enable without remount; and Original OGL zero-speed static redraw and smooth resume. Browser instrumentation normalizes development-qualified callback names when checking pending renderer RAFs. Original OGL speed zero is enforced inside its scheduler, so Gallery wake/resize paths cannot restart continuous drawing. Component coverage includes frozen animation time and a single resumed loop.

Evidence is written under ignored `tmp/ambient-webgl-review`, `tmp/ambient-gallery`, `tmp/grid-motion-fix` and `tmp/ambient-spike`. Final correction command results and SHA-256 source inventory are recorded in `tmp/ambient-runtime-corrections/verification.json`. Chromium uses SwiftShader; these checks do not certify physical-GPU performance or other browser engines.
