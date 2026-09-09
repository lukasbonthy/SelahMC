# Deferred runtime contracts

The 94c4bc02 runtime switches between original and transplanted deferred
methods on persistent objects. TextureMap is constructed while deferred
rendering is disabled, so it lacks fields required after enabling shaders.
The previous loading-screen fix did not exercise this resource transition.

Repair object initialization independently of the current renderer mode.
Use the complete existing extended atlas initializer in both modes, preserve
the shared vanilla/deferred maps, and use the same string key for sprite
lookup and insertion. Preserve the loading-screen field correction in the
reproducible build transformer. Initialize the missing PBR texture from the
vanilla missing-image data before the atlas is stitched, with null-filled
slots for every requested mip level. Correct the PBR mip sampler to compute
2x2 source blocks using row width rather than total output pixel count.

Test these contracts using the complete generated TeaVM runtime, real
constructors, collections, strings and resource locations. Only bootstrap
logging and graphics/platform boundaries may be substituted, and tests must
identify those substitutions. Include repeated off/on transitions and a
missing-texture path, not merely isolated callback routing.

This repository contains a transformer of a pinned generated JavaScript
bundle, not the original integrated Java sources. A single TeaVM compilation
with debug/source maps is the long-term replacement for guessed field-name
bridges. It cannot be built from this repository alone.

Release gate: menu open, enable, Done, complete resource reload, enter a world,
render terrain, disable, reload, re-enable, and return to the menu must pass
in a WebGL2 browser. Unit/contract tests do not satisfy that gate. The local
browser connection currently reports ERR_BLOCKED_BY_CLIENT. Do not label
the candidate as a verified shader release or silently disable shaders.

## Candidate verification

Generated client SHA-256: `f0ba88523e25db18480af089e3bc7a6d1a95e4ca1bb8d9911b43649ee02e8e18`.

- Seven new complete-runtime contract tests pass. The patterned mip test
  failed against the previous row indexing and passes after correction.
- Full local Node suite: 140 tests, 137 pass; three Windows packaging tests
  cannot start because the local environment has no Go executable.
- Generated JavaScript syntax and the existing atlas tick/delete check pass.
- Candidate CI installs the repository's pinned Go toolchain, runs the full
  suite and packaging, and retains development artifacts without publishing
  a release. Its result must be checked separately.
- Browser rendering, shader compilation, real resource I/O, animated PBR
  textures and the complete menu/world cycle remain unverified. Passing
  contract tests must not be described as a passing in-game shader test.

TeaVM source-map and debug metadata configuration is documented at
https://teavm.org/docs/tooling/debugging.html. A source rebuild needs the
original client and deferred-renderer Java projects plus their asset inputs.
