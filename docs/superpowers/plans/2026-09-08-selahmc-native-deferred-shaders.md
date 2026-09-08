# SelahMC Native Deferred Shaders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original native Eaglercraft deferred/PBR shader settings inside the Selah/Tuff 1.12.2 client and ship a distinct v8.3.9 release.

**Architecture:** The recovered client already contains the complete deferred renderer, native GUI, and optional OptiFine entry. Remove the transform that diverts `SD_openShaderScreen` into the DOM bridge, retain the independent native button-ID `901` bridge action, and leave the generic render-safety transforms in place. Then bump release-facing identifiers to v8.3.9 and build hash-qualified artifacts.

**Tech Stack:** Node.js 24 test runner, TeaVM-generated JavaScript transforms, Go portable localhost launcher, Bash/PowerShell launch scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-selahmc-native-deferred-shaders.md`

## Global Constraints

- Preserve the actual Selah/Tuff Minecraft 1.12.2 client and all existing lifecycle fixes.
- The native deferred/PBR GUI is authoritative; no HTML overlay may replace it.
- `OptiFine Packs...` remains available only through its separate explicit native-screen action.
- Do not modify the recovered v8.3.3 input bundle.
- Publish a hash-qualified v8.3.9 portable archive and retain rollback instructions.

---

### Task 1: Lock the Native Shader Route With Runtime Tests

**Files:**
- Modify: `lifecycle-repair/tests/generated-runtime-regressions.test.mjs`

**Interfaces:**
- Consumes: `transformBundle(baseSource, barrierSource)` and `evaluateGenerated(name, additions)`.
- Produces: regression coverage for `SD_openShaderScreen` and `SD_Eef`.

- [ ] **Step 1: Replace the browser-first test with a supported-native-screen test**

Create a test that supplies `SD_openOptiFine: () => { throw new Error("browser bridge hijacked native screen"); }`, makes `SD_Cn1()` return true, and asserts that `SD_Biu` is initialized and displayed with `com` and `minecraft.w.nv` equal to the value returned by `SD_getEnabled()`.

- [ ] **Step 2: Add a separate OptiFine action test**

Evaluate `SD_Eef` with `{ bq: 901 }` and assert that it calls `SD_openOptiFine()` exactly once without executing deferred enable/disable work.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test --test-name-pattern='native deferred|OptiFine action' tests/generated-runtime-regressions.test.mjs`

Expected: the native screen test fails with `browser bridge hijacked native screen` because the current transform calls the bridge first; the separate action test passes as a characterization of behavior that must remain.

### Task 2: Remove the Browser-First Shader Hijack

**Files:**
- Modify: `lifecycle-repair/tools/build-lifecycle-repair.mjs`
- Modify: `lifecycle-repair/tests/generated-runtime-regressions.test.mjs`

**Interfaces:**
- Consumes: the recovered bundle's original `SD_openShaderScreen` implementation.
- Produces: generated code that enters native `SD_Biu`/`SD_BYw` screens directly.

- [ ] **Step 1: Delete the `patchFunction("SD_openShaderScreen", ...)` transform**

Remove the transform whose replacement changes `case 0:b=a.f.w;$p=1;` into `case 0:if(SD_openOptiFine())return;b=a.f.w;$p=1;`.

- [ ] **Step 2: Remove the obsolete replacement-count assertion**

Delete `assert.equal(transformed.replacements.shaderSettingsPanelSafety, 1);`; the native behavior test becomes the contract.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `node --test --test-name-pattern='native deferred|OptiFine action|unsupported devices' tests/generated-runtime-regressions.test.mjs`

Expected: all matching tests pass.

- [ ] **Step 4: Run the complete generated-runtime suite**

Run: `node --test tests/generated-runtime-regressions.test.mjs`

Expected: zero failures.

### Task 3: Version the Corrected Release as v8.3.9

**Files:**
- Modify: `lifecycle-repair/tests/package-release-index.test.mjs`
- Modify: `lifecycle-repair/tests/package-installer.test.mjs`
- Modify: `lifecycle-repair/tests/portable-package.test.mjs`
- Modify: `lifecycle-repair/tests/release-consumers.test.mjs`
- Modify: `lifecycle-repair/package.json`
- Modify: `lifecycle-repair/tools/package-release.mjs`
- Modify: `lifecycle-repair/tools/package-portable-release.mjs`
- Modify: `lifecycle-repair/packaging/install.sh`
- Modify: `lifecycle-repair/packaging/README.txt`
- Modify: `lifecycle-repair/packaging/release-notes.md`
- Modify: `lifecycle-repair/portable/README.txt`
- Modify: `lifecycle-repair/portable/START_SELAHMC.cmd`
- Modify: `lifecycle-repair/portable/server/main.go`
- Create: `.github/workflows/selah-v8.3.9-release.yml`
- Delete: `.github/workflows/selah-v8.3.8-release.yml`
- Modify: `.devcontainer/devcontainer.json`
- Modify: `.devcontainer/setup-selah-test.sh`
- Modify: `.devcontainer/start-selah-test.sh`
- Create: `.devcontainer/test-v8.3.9-codespace-setup.mjs`
- Delete: `.devcontainer/test-v8.3.8-codespace-setup.mjs`

**Interfaces:**
- Consumes: the corrected generated bundle hash.
- Produces: `selahmc-client-v8.3.9.js`, `SelahMC-v8.3.9-Lifecycle-Transaction.zip`, and `SelahMC-v8.3.9-${CLIENT_SHORT_SHA}-Portable-Windows.zip`.

- [ ] **Step 1: Change release tests to require v8.3.9 and run them RED**

Change literal release filenames, URLs, archive prefixes, workflow paths, launcher marker, and portable query version from `v8.3.8` to `v8.3.9` in the four release/package test files.

Run: `node --test tests/package-release-index.test.mjs tests/package-installer.test.mjs tests/release-consumers.test.mjs`

Expected: failures identify the still-v8.3.8 production constants and files.

- [ ] **Step 2: Update production packaging and launcher identifiers**

Change all release-facing v8.3.8 identifiers listed under **Files** to v8.3.9. Keep source inputs and existing dependency asset filenames at v8.3.3/v7.8 because those are hash-pinned recovered inputs, not release version identifiers.

- [ ] **Step 3: Rewrite release notes around the native deferred merge**

State that v8.3.9 restores the built-in deferred/PBR GUI, retains the separate OptiFine importer, and preserves the `renderAgain()` and stale-screen guards. Remove the false claim that the Shaders button opens the isolated browser panel.

- [ ] **Step 4: Regenerate the client hash pins**

Run: `npm run build`

Use the generated SHA-256 to update `.devcontainer/setup-selah-test.sh`, `.devcontainer/start-selah-test.sh`, and `.devcontainer/test-v8.3.9-codespace-setup.mjs`.

- [ ] **Step 5: Run release tests GREEN**

Run: `node --test tests/package-release-index.test.mjs tests/package-installer.test.mjs tests/release-consumers.test.mjs`

Expected: zero failures.

### Task 4: Build, Inspect, and Publish

**Files:**
- Generated: `lifecycle-repair/dist/work/selahmc-client-v8.3.9.js`
- Generated: `lifecycle-repair/dist/SelahMC-v8.3.9-Lifecycle-Transaction.zip`
- Generated: `lifecycle-repair/dist/SelahMC-v8.3.9-${CLIENT_SHORT_SHA}-Portable-Windows.zip`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: verified GitHub branch, prerelease, checksums, and download links.

- [ ] **Step 1: Run JavaScript syntax and complete tests**

Run: `node --check dist/work/selahmc-client-v8.3.9.js`

Run: `npm test`

Expected: zero test failures when Node, Go, zip, and unzip are available. If local Go is unavailable, record the three Go-dependent skips/failures and require GitHub Actions to run the full suite with Go 1.27.

- [ ] **Step 2: Build the lifecycle archive**

Run: `npm run package`

Expected: a v8.3.9 lifecycle ZIP whose checksum validates with `sha256sum -c`.

- [ ] **Step 3: Build the portable archive in GitHub Actions**

Push the reviewed commit to `stability-v8.3.9`; the workflow installs Go 1.27, runs the full Node/Go verification, creates both Windows executables, and publishes the hash-qualified prerelease.

- [ ] **Step 4: Inspect the released artifact**

Download the Git release ZIP, validate its `.sha256`, confirm `index.html` pins `selahmc-client-v8.3.9.js?v=${CLIENT_SHORT_SHA}`, and extract `SD_openShaderScreen` to confirm it contains the native `SD_Cn1()`/`SD_Biu` path and no browser-first redirect.

- [ ] **Step 5: Mark v8.3.8 as superseded**

Update the prior prerelease notes to point to the verified v8.3.9 archive so users do not download the incorrect browser-first package.
