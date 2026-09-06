# SelahMC v8.3.8 WebGL gate

The attached startup trace shows the deferred renderer being enabled too early:

1. the EPK reports that resources are loaded;
2. the client begins GPU/resource-manager reload;
3. Selah reports `Finalizing` and then `Finished loading`;
4. the browser reports deleted VAOs/programs and an unbound element buffer.

The loader now keeps `__selahDeferredBootReady` false through the EPK and
resource-manager phases. It opens the native deferred and OptiFine hooks only
when `[Selah]: Finished loading` is observed. This preserves the existing
rendering path while WebGL resources are being rebuilt instead of allowing a
second renderer to use handles that are being retired.

The portable pack carries this loader as a local, reproducible asset override.
The remote asset manifest remains pinned for every other dependency, and the
ZIP checksum is generated from the patched loader bytes.

Regression coverage:

- EPK-loaded and `Finalizing` messages do not open the gate.
- `Finished loading` opens each hook exactly once.
- Portable packaging copies the patched loader without changing the pinned
  cache or other dependencies.
