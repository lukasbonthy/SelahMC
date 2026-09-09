# Deferred runtime contracts implementation plan

**Goal:** Repair shared texture state and add tests that detect mode-transition defects.

**Architecture:** Keep the pinned-bundle transformer, isolate shader contract
changes in a module, and test against the complete TeaVM runtime. Preserve
coroutine continuation state and the native shader menu.

**Spec:** ../specs/2026-09-09-deferred-runtime-contracts.md

1. Add complete-runtime tests for constructing an atlas with shaders off,
   enabling shaders and registering the same ResourceLocation twice. Use the
   actual Java HashMap so object-vs-string lookup defects cannot be hidden.
2. Route B8p through SD_BZY regardless of renderer mode; change the first
   SD_Ed6 lookup to use b.bF() while retaining saved coroutine locals.
3. Preserve SD_CtG's Ii-to-UZ correction in the source transformer.
4. Seed the PBR missing-image sprite from the original missing-image frame
   and the renderer's zero-normal/default-material values before stitching.
5. Test complete mip chains and patterned 2x2 downsampling against an
   independent reference; correct the row-width indexing defect.
6. Verify failing tests on the baseline, passing tests on the candidate,
   existing Node regression tests, and candidate JavaScript syntax. Record
   blocked graphics/Windows checks explicitly and keep publication separate.
