# React Bits ambient candidates

Upstream author: David Haz / React Bits contributors. These shaders are not authored by FRAME.

Pinned repository: https://github.com/DavidHDev/react-bits/tree/b0422bb475ac9ec1fe1680290970494ceff5d4eb

Retrieved 10 November 2026 from:

- `src/ts-default/Backgrounds/DarkVeil/DarkVeil.tsx` and `DarkVeil.css`
- `src/ts-default/Backgrounds/Aurora/Aurora.tsx` and `Aurora.css`
- Root `LICENSE.md`, retained in full beside these files.

License: MIT + Commons Clause License Condition v1.0, copyright 2026 David Haz. Commercial application/website use is permitted subject to the license; component/tool redistribution is restricted. These are the explicitly requested public candidates, not paid Pro components. Do not publish these files as a standalone component library.

Local adaptations are limited to lifecycle and integration: initialization status, safe context creation, initialization failure cleanup, effect-based settings-ref updates for React lint compatibility, stopping idle/zero-speed rendering, avoiding unused global pointer subscriptions, detached-only context loss for Strict Mode replay, and project formatting. The host handles live reduced motion, manual and visibility pause, context-loss fallback, static stars, dark-center shading, and single-candidate mounting. GLSL strings must remain identical to the pinned sources; the browser QA verifies their hashes before a run.

Upstream does not supply a complete separate provenance chain for the shader algorithms/coefficients. This evaluation does not certify that chain or grant rights beyond the retained license. Reassess it before any production adoption.

Dark Veil uses native WebGL2, two passes, and a color tint. Aurora uses native WebGL2, a color-stop curtain and one pass. Neither source requires OGL. Both explicitly cancel RAF, remove listeners/observers and delete GPU resources on unmount. Neither is integrated with a production route.

Targeted review correction: Dark Veil now allocates a fresh immutable texture for each target size, validates allocation and framebuffer completeness before publishing the dimensions, and deletes the replaced texture. Failed allocation/attachment stops rendering and invokes the host fallback; the previous attachment is restored and the framebuffer unbound. Mipmap generation is preserved. Dark Veil and Aurora also skip direct redraws while hidden or context-lost. All vendor GLSL strings and recorded source hashes remain unchanged.

# Stage 4.6.1C route consolidation note

The audit below describes the original snapshot. Its source, license and shader hashes are unchanged. Both effects now share the sole development route `/dev/ambient` with the other thirteen effects. The old subroutes return 404; earlier comparison-page references below are historical. Native paused redraw/resize and immutable-texture regression coverage are preserved. See the development Gallery README for current presentation and verification commands.

## Final pointer activation correction

Dark Veil and Aurora synchronize their owned pointer subscriptions with the current mouseInteraction setting without recreating GPU resources. Disabling clears pointer influence and removes listeners; cleanup removes subscriptions. Shader strings and pinned upstream hashes remain unchanged. Live Gallery tests cover repeated toggles, actual uniform response and expanded-preview interaction.
