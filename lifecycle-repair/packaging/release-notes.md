SelahMC v8.3.10 deferred shader GUI compatibility prerelease

Changes from v8.3.9:
- Bridges the separately compiled deferred GUI's draw, button, and close virtual methods to the Selah/Tuff GUI ABI. Opening Shaders now keeps the native screen active instead of showing one black frame and dropping back to the pause menu.
- Applies the same draw and button bridge to the deferred-not-supported screen.
- Keeps both sets of TeaVM aliases so calls from the deferred module and the Selah host resolve to the same handlers.

Deferred shader behavior retained from v8.3.9:
- Restores the native deferred/PBR settings screen already integrated into the Selah/Tuff 1.12.2 client. The Shaders entry no longer redirects to an HTML panel.
- Keeps the native deferred controls and capability check. The optional importer is available only through the separate `OptiFine Packs...` action; it does not replace the built-in renderer.
- Preserves the stale-screen dispatch guard and the renderer fixes below.

Changes from v8.3.7:
- WorldClient entity lookup handles an absent local player and still looks up remote entities normally. Existing unknown-entity packet handling is preserved.
- Sky mesh cleanup clears the correct index-buffer and vertex-array fields, preventing repeated deletion and retaining invalid handles.
- The deferred renderer stays disabled through EPK/resource-manager reload and opens only after Selah reports `Finished loading`, preventing stale VAO/program use during the hand-off.
- Font strike/underline shadow replay now treats a missing cached direct render as a safe no-op, preventing `EaglercraftGPU.renderAgain()` from throwing during loading-overlay display-list rendering.
- OptiFine post-processing pauses while its settings panel is visible and restores texture-unit 0, the previously active texture, read/draw framebuffers, program, VAO, viewport, color mask, and render-enable flags before returning control to Minecraft.
- The singleplayer worker explicitly uses the packaged client URL and cache hash.
- Portable launcher binds the first available localhost port from 3001 through 3010, without terminating another process. A custom --port starts the same bounded search there.

The compatible loader and EPK remain hash-pinned v8.3.3 assets. Their version numbers do not imply a worker version mismatch.

Extract the Windows ZIP fully, then run START_SELAHMC.cmd. Keep the prior package for rollback. Browser world storage is separate per port; use the original port to access existing worlds.

These changes address reproduced code defects. Full gameplay, resource-pack reload, and the entire reported WebGL error sequence have not been validated in a live browser. This is a prerelease, not a claim that every reported error is resolved.
- Corrects a false shader-unavailable result by probing a real WebGL2 floating-point HDR framebuffer when the cached capability bits reject the context. Unsupported devices still stay on the native unavailable screen.
