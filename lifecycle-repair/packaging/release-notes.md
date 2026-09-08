SelahMC v8.3.8 repair prerelease

Changes from v8.3.7:
- WorldClient entity lookup handles an absent local player and still looks up remote entities normally. Existing unknown-entity packet handling is preserved.
- Sky mesh cleanup clears the correct index-buffer and vertex-array fields, preventing repeated deletion and retaining invalid handles.
- The deferred renderer stays disabled through EPK/resource-manager reload and opens only after Selah reports `Finished loading`, preventing stale VAO/program use during the hand-off.
- Font strike/underline shadow replay now treats a missing cached direct render as a safe no-op, preventing `EaglercraftGPU.renderAgain()` from throwing during loading-overlay display-list rendering.
- The Shaders button now opens the isolated browser shader panel first, avoiding the native deferred-settings screen that could render as a featureless black frame. The native screen remains the fallback when the bridge is unavailable.
- When the canvas owns fullscreen, the bridge exits fullscreen and waits for completion before displaying the HTML shader panel, preventing an invisible settings screen and permanently paused rendering.
- OptiFine post-processing pauses while its settings panel is visible and restores texture-unit 0, the previously active texture, read/draw framebuffers, program, VAO, viewport, color mask, and render-enable flags before returning control to Minecraft.
- Portable, VPS/lifecycle, and Codespaces packages now ship and hash-pin the same repaired bridge instead of retaining the original state-leaking script.
- The singleplayer worker explicitly uses the packaged client URL and cache hash.
- Portable launcher binds the first available localhost port from 3001 through 3010, without terminating another process. A custom --port starts the same bounded search there.

The compatible loader and EPK remain hash-pinned v8.3.3 assets. Their version numbers do not imply a worker version mismatch.

Extract the Windows ZIP fully, then run START_SELAHMC.cmd. Keep the prior package for rollback. Browser world storage is separate per port; use the original port to access existing worlds.

These changes address reproduced code defects. Full gameplay, resource-pack reload, and the entire reported WebGL error sequence have not been validated in a live browser. This is a prerelease, not a claim that every reported error is resolved.
