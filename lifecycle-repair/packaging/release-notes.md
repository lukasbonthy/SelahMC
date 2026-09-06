SelahMC v8.3.8 repair prerelease

Changes from v8.3.7:
- WorldClient entity lookup handles an absent local player and still looks up remote entities normally. Existing unknown-entity packet handling is preserved.
- Sky mesh cleanup clears the correct index-buffer and vertex-array fields, preventing repeated deletion and retaining invalid handles.
- The singleplayer worker explicitly uses the packaged client URL and cache hash.
- Portable launcher binds the first available localhost port from 3001 through 3010, without terminating another process. A custom --port starts the same bounded search there.

The compatible loader and EPK remain hash-pinned v8.3.3 assets. Their version numbers do not imply a worker version mismatch.

Extract the Windows ZIP fully, then run START_SELAHMC.cmd. Keep the prior package for rollback. Browser world storage is separate per port; use the original port to access existing worlds.

These changes address reproduced code defects. Full gameplay, resource-pack reload, and the entire reported WebGL error sequence have not been validated in a live browser. This is a prerelease, not a claim that every reported error is resolved.
