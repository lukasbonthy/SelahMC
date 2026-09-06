# SelahMC v8.3.8 validation

## Reproduced defects

- `WorldClient.getEntityByID` read `Minecraft.player.cw` before checking whether
  the local player existed. A generated-function regression reproduced the
  reported `Cannot read properties of null (reading 'cw')` failure. The lookup
  now uses the player fast path only when the player is non-null, then preserves
  the normal entity-map lookup. Existing packet-handler null checks remain in
  place; entity packets are not discarded or reordered.
- `SD_F8R` deleted the sky mesh's index buffer and vertex array but cleared the
  vertex-buffer field after both operations. A repeatable cleanup regression
  proved that the deleted handles remained reachable. Cleanup now clears the
  matching `cd7` and `bdO` fields.
- The packaged page now sets `eaglercraftXClientScriptURL` to the exact local,
  hash-versioned client before loading it. This prevents integrated singleplayer
  from choosing an older remote client through source guessing.
- The portable server now binds the first available loopback port in a bounded
  ten-port range. It retries only address-in-use errors and never terminates the
  process already using a port.

WebGL 2 requires deleted-buffer bind attempts to fail with
`INVALID_OPERATION`, so retaining a deleted handle is invalid state rather than
a harmless warning: <https://registry.khronos.org/webgl/specs/latest/2.0/#5.14.5>.

## Automated verification

- 107 Node tests passed, including red/green regressions for the entity lookup,
  graphics cleanup, worker URL, occupied-port fallback, and v8.3.7 rollback
  backup.
- `go test ./...` and `go vet ./...` passed for the portable server.
- The generated client passed `node --check`.
- The Codespaces setup test passed against a local mirror of every pinned input
  and asset, with its nested regression suite actually enabled.
- Both release archives passed ZIP integrity checks and contain client SHA-256
  `bb6060cd64737bdd8c4f1ee899886b35723257dc28e814637e38453d2f7899dc`.

Local UTC-build archive SHA-256 values:

- VPS: `06b92f36972c5a50e7ddb072f8e80a754b91c508b5275aa776eebb6ea5c5cb9e`
- Windows portable: `5e623cbaec4c997354314c488b9c92e5799e766d7d937df09d11b673d15a2bbf`

## Remaining validation boundary

The full game was not run in a real browser from this environment. The exact
reported entity and stale-handle code defects are covered by executable tests,
but resource-pack reload, complete gameplay, and the whole WebGL error cascade
still require a live test. v8.3.8 is therefore published as a prerelease. Main
and the production VPS are unchanged.
