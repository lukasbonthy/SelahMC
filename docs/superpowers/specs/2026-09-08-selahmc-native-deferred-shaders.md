# SelahMC Native Deferred Shaders Design

## Goal

Ship the actual Selah/Tuff Minecraft 1.12.2 client with the original Eaglercraft deferred/PBR renderer and its native Minecraft-style settings screens. The browser OptiFine pack importer remains available as a separate option and must never replace the native deferred settings screen.

## User-visible flow

1. Open **Options**.
2. Open **Shaders...**.
3. Open the native **Deferred Shaders...** screen.
4. Configure the built-in deferred renderer using the original native controls.
5. Open **OptiFine Packs...** only when explicitly choosing that separate button.

The native screen must retain the original settings for waving grass, dynamic lights, global SSAO, sun-shadow distance, colored and smoothed shadows, environment mapping, realistic water, god rays, raytracing/reflections, lens distortion, lens flares, bloom, and FXAA.

## Existing architecture

The recovered Selah v8.3.3 TeaVM bundle already contains:

- `EaglerDeferredPipeline` and the deferred GLSL/assets;
- the native deferred configuration and list screens (`SD_Biu` and related generated classes);
- `SD_openShaderScreen`, which selects the supported or unsupported native screen;
- an explicit native-screen action (`SD_Eef`, button ID `901`) for the separate OptiFine bridge.

The v8.3.9 regression came from a lifecycle transform that inserted `SD_openOptiFine()` at the start of `SD_openShaderScreen`. Because the bridge returned true, the native screen was never entered.

## Corrected architecture

- Remove only the redirect injected into `SD_openShaderScreen`.
- Keep the native `SD_Cn1()` capability check and native supported/unsupported screens authoritative.
- Keep `SD_openOptiFine()` and the native button-ID `901` action intact for the separate importer.
- Preserve the screen-dispatch guard and `renderAgain()` no-op fix that address the reported black-screen/display-list failures.
- Package the result as v8.3.9 so it cannot be confused with the incorrect v8.3.8 package.

## Verification contract

- A generated-runtime test must fail whenever `SD_openShaderScreen` invokes the browser bridge before the native screen.
- A supported device must receive the native deferred screen with the current enable state copied into it.
- An unsupported device must receive the native unsupported explanation screen.
- Button ID `901` inside the native shader screen must still open the OptiFine bridge.
- The generated bundle must retain the screen-dispatch and font-replay safety transforms.
- Release/package tests must require v8.3.9 filenames, URLs, launch marker, archive names, and release metadata.
