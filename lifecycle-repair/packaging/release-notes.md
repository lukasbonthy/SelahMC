Repairs the reported resource-pack confirmation crash and the related join-time null-player failures in the pinned SelahMC client.

- World loading now begins and commits an explicit transaction, preserves its generation across TeaVM suspensions, and rejects superseded loads.
- Closing the resource-pack prompt avoids reading health from a missing player. Mouse, scroll, keyboard, and modal-screen paths keep processing input while unsafe world work waits.
- Readiness checks no longer cancel an unfinished join or permanently freeze a previously committed world when a field is temporarily unavailable.
- Existing controller, fog, sky, lightmap, deferred renderer, and integrated-server repairs are retained.

For Windows, extract **SelahMC-v8.3.7-Portable-Windows.zip** completely and run **START_SELAHMC.cmd**. Close the older portable command window first if it is using port 3001.

For the VPS, use **SelahMC-v8.3.7-Lifecycle-Transaction.zip** and its included README/install script. The installer verifies checksums and backs up the existing client before switching the entry page.

The GitHub build runs generated-runtime regressions, saved-continuation tests, package/installer tests, Go tests and vet, JavaScript syntax checks, and ZIP integrity checks. This remains a prerelease: the development cloud browser could not reach the local test server, so a live server join and resource-pack download are not yet verified. No claim is made that every unrelated client or server bug is resolved.
