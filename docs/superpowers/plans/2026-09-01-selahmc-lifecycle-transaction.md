# SelahMC v8.3.7 Lifecycle Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SelahMC's inferred world-readiness hotfixes with a committed lifecycle transaction that keeps GUI input usable while blocking every unsafe gameplay consumer.

**Architecture:** A per-Minecraft lifecycle generation begins before generated `loadWorld` publishes a world and commits only after the generated player/camera initialization completes. Exact generated-code transforms add capability guards to GUI and gameplay input while existing render/controller guards consume the committed state.

**Tech Stack:** Node.js 24, built-in `node:test`, `node:vm`, checksum-pinned TeaVM JavaScript transformation, Go portable launcher, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-01-selahmc-lifecycle-transaction-design.md`

## Global Constraints

- Preserve internal `TuffClient` protocol identity and all Tuff/ViaBlocks/ViaEntities/deferred-rendering assets.
- Preserve visible SelahMC branding.
- Build only from base SHA-256 `6e775ed50e83a6ba976aea593e0ef70ed74b662f652f3f47f616499a85005ba4`.
- Do not modify production main or deploy to the VPS.
- Use exact-count transforms that fail closed when the generated bundle drifts.
- Write and observe each failing regression before changing production code.

---

### Task 1: Transactional lifecycle policy

**Files:**
- Modify: `lifecycle-repair/tests/world-lifecycle-policy.test.mjs`
- Modify: `lifecycle-repair/src/world-lifecycle-barrier.js`

**Interfaces:**
- Produces: `SD_worldLifecycleBegin(mc, world) -> generation`, `SD_worldLifecycleCommit(mc) -> boolean`, `SD_worldLifecycleReset(mc)`, and `SD_worldLifecycleReady(mc, gate) -> 0|1`.
- Produces diagnostics fields `phase`, `generation`, `committedGeneration`, `blockedCalls`, `lastGate`, and `blockedBy`.

- [ ] **Step 1: Replace the camera-repair expectation with failing transaction tests**

```js
const lifecycle = await loadPolicy();
const mc = { O: {}, t: { id: "player" }, hl: { id: "camera" } };
lifecycle.begin(mc, mc.O);
assert.equal(lifecycle.ready(mc, "test.uncommitted"), 0);
assert.equal(lifecycle.commit(mc), true);
assert.equal(lifecycle.ready(mc, "test.committed"), 1);
```

Add a separate assertion that `{ O: {}, t: player, hl: null }` remains JOINING and leaves `hl` unchanged.

- [ ] **Step 2: Run the focused policy test and verify RED**

Run: `node --test lifecycle-repair/tests/world-lifecycle-policy.test.mjs`

Expected: FAIL because begin/commit/reset are not defined and the old policy mutates the camera.

- [ ] **Step 3: Implement the minimal per-instance transaction policy**

Use a private property name on the Minecraft object with fallback state only for null diagnostics. `begin` increments generation and clears commitment; `commit` succeeds only when world, player, and camera exist; `ready` rejects an active uncommitted generation and never writes `mc.t` or `mc.hl`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test lifecycle-repair/tests/world-lifecycle-policy.test.mjs`

Expected: all policy tests pass without warnings or errors.

- [ ] **Step 5: Commit the policy slice**

```bash
git add lifecycle-repair/src/world-lifecycle-barrier.js lifecycle-repair/tests/world-lifecycle-policy.test.mjs
git commit -m "fix: make world readiness transactional"
```

### Task 2: Generated load-world and GUI boundaries

**Files:**
- Modify: `lifecycle-repair/tests/generated-runtime-regressions.test.mjs`
- Modify: `lifecycle-repair/tools/build-lifecycle-repair.mjs`

**Interfaces:**
- Consumes: lifecycle policy functions from Task 1.
- Produces replacement metrics `loadWorldTransaction` and `displayGuiScreen`.

- [ ] **Step 1: Add failing generated-runtime tests for `G6r` and `HjP`**

Execute extracted functions with real lifecycle policy. For `HjP`, provide an `Fff` function that throws if called during JOINING; assert the screen closes without calling it. After commit, assert a healthy player closes normally and `Fff() <= 0` constructs the game-over screen. For `G6r`, drive the generated state machine with lightweight stubs and assert begin precedes the observed `a.O = b`, reset runs on null-world completion, and commit is observed only after `a.hl === a.t`.

- [ ] **Step 2: Run the generated regression file and verify RED**

Run: `node --test lifecycle-repair/tests/generated-runtime-regressions.test.mjs`

Expected: FAIL because `G6r` and `HjP` have no transaction transforms.

- [ ] **Step 3: Add exact transforms**

Patch `G6r` at its state-1 non-null branch to call `SD_worldLifecycleBegin(a,b)`, at its null-world return to call `SD_worldLifecycleReset(a)`, and immediately after `a.hl=a.t` to call `SD_worldLifecycleCommit(a)`. Patch `HjP` so the null-screen health branch bypasses `Fff(c)` when `c` is null or lifecycle is uncommitted, then continues through the original screen-closing path.

- [ ] **Step 4: Run generated and transformer tests and verify GREEN**

Run: `node --test lifecycle-repair/tests/generated-runtime-regressions.test.mjs lifecycle-repair/tests/bundle-transformer.test.mjs`

Expected: both files pass and exact-count metrics equal their intended values.

- [ ] **Step 5: Commit load and GUI boundaries**

```bash
git add lifecycle-repair/tools/build-lifecycle-repair.mjs lifecycle-repair/tests/generated-runtime-regressions.test.mjs
git commit -m "fix: commit world loads before releasing GUI"
```

### Task 3: GUI-safe gameplay input isolation

**Files:**
- Modify: `lifecycle-repair/tests/generated-runtime-regressions.test.mjs`
- Modify: `lifecycle-repair/tools/build-lifecycle-repair.mjs`

**Interfaces:**
- Consumes: `SD_worldLifecycleReady`.
- Produces metrics `runTickMouse`, `runTickKeyboard`, `processKeyBinds`, `clickMouse`, `rightClickMouse`, `middleClickMouse`, and `sendClickBlockToController`.

- [ ] **Step 1: Add failing input regressions**

Assert active GUI mouse/keyboard callbacks execute during JOINING. In the same test, have the callback set `a.b0 = null` and assert no following access to `a.t` occurs. Execute each direct gameplay function with an uncommitted world and throwing downstream stubs; each must return without reaching the stub. Commit the lifecycle and assert one representative READY path still reaches its original behavior.

- [ ] **Step 2: Run the generated regression file and verify RED**

Run: `node --test lifecycle-repair/tests/generated-runtime-regressions.test.mjs`

Expected: FAIL on a player dereference or throwing downstream stub.

- [ ] **Step 3: Implement input guards at generated function boundaries**

In `DEF` and `GOh`, preserve active-screen processing but return before gameplay fallthrough when the screen becomes null and lifecycle is uncommitted. Add entry guards to `EcM`, `CtF`, `GLY`, `GVy`, and `FP1`.

- [ ] **Step 4: Run the generated tests and verify GREEN**

Run: `node --test lifecycle-repair/tests/generated-runtime-regressions.test.mjs`

Expected: GUI tests and all direct-entry input tests pass.

- [ ] **Step 5: Commit input isolation**

```bash
git add lifecycle-repair/tools/build-lifecycle-repair.mjs lifecycle-repair/tests/generated-runtime-regressions.test.mjs
git commit -m "fix: isolate gameplay input during world joins"
```

### Task 4: Transaction-aware render and controller regression sweep

**Files:**
- Modify: `lifecycle-repair/tests/generated-runtime-regressions.test.mjs`
- Modify: `lifecycle-repair/tools/build-lifecycle-repair.mjs` only if a test exposes a missing recheck.

**Interfaces:**
- Consumes: transaction-aware `SD_worldLifecycleReady` and existing render/controller transforms.
- Produces: complete replacement-metric assertions for every lifecycle boundary.

- [ ] **Step 1: Make shared generated fixtures explicitly committed**

Update `makeMinecraft` or the evaluation helper so READY fixtures call begin and commit, while JOINING fixtures call begin without commit. Do not fake READY by field presence alone.

- [ ] **Step 2: Run the generated suite and observe any newly exposed RED failures**

Run: `node --test lifecycle-repair/tests/generated-runtime-regressions.test.mjs`

Expected: existing READY paths identify every fixture or recheck that relied on inferred readiness.

- [ ] **Step 3: Apply only evidence-required fixture or transform corrections**

Retain existing gates for `CYD`, `DQl`, `GU9`, `Dmj`, `FSs`, `HbC`, `SD_GM1`, `SD_TUFF_HbC`, `FRN`, `SD_FuK`, `SD_TUFF_FRN`, `CIX`, and `G1D`. Add a transform only where a real generated execution demonstrates a post-suspension unsafe dereference.

- [ ] **Step 4: Run the complete Node suite and verify GREEN**

Run: `cd lifecycle-repair && npm test`

Expected: zero failures, zero cancellations, and no unexpected warnings.

- [ ] **Step 5: Commit the regression sweep**

```bash
git add lifecycle-repair/tools/build-lifecycle-repair.mjs lifecycle-repair/tests/generated-runtime-regressions.test.mjs
git commit -m "test: cover committed lifecycle boundaries"
```

### Task 5: Version and package v8.3.7

**Files:**
- Modify: `lifecycle-repair/tests/package-release-index.test.mjs`
- Modify: `lifecycle-repair/tests/package-installer.test.mjs`
- Modify: `lifecycle-repair/tests/portable-package.test.mjs`
- Modify: `lifecycle-repair/package.json`
- Modify: `lifecycle-repair/tools/package-release.mjs`
- Modify: `lifecycle-repair/tools/package-portable-release.mjs`
- Modify: `lifecycle-repair/packaging/install.sh`
- Modify: `lifecycle-repair/packaging/README.txt`
- Modify: `lifecycle-repair/portable/START_SELAHMC.cmd`
- Modify: `lifecycle-repair/portable/README.txt`
- Modify: `lifecycle-repair/portable/server/main.go`
- Modify: `lifecycle-repair/portable/server/main_test.go`
- Rename: `.github/workflows/selah-v8.3.6-release.yml` to `.github/workflows/selah-v8.3.7-release.yml`

**Interfaces:**
- Produces `selahmc-client-v8.3.7.js`, `SelahMC-v8.3.7-Lifecycle-Transaction.zip`, and `SelahMC-v8.3.7-Portable-Windows.zip`.

- [ ] **Step 1: Change package tests to expect v8.3.7 artifacts and URLs**

Keep the fixture input at v8.3.5, but expect output script `selahmc-client-v8.3.7.js?v=<hash>`, release directory `SelahMC-v8.3.7-Lifecycle-Transaction`, portable query `?portable=v8.3.7`, and portable release name `SelahMC-v8.3.7-Portable-Windows`.

- [ ] **Step 2: Run package and Go tests and verify RED**

Run: `cd lifecycle-repair && node --test tests/package-release-index.test.mjs tests/package-installer.test.mjs tests/portable-package.test.mjs && (cd portable/server && go test ./...)`

Expected: FAIL because production package names remain v8.3.6.

- [ ] **Step 3: Update all package, launcher, documentation, and workflow version references**

Use `v8.3.7-portable` as the prerelease tag and branch `lifecycle-barrier-v8.3.6` as the existing PR branch trigger. The workflow archive verification and release notes must reference only v8.3.7 artifacts.

- [ ] **Step 4: Run package and Go tests and verify GREEN**

Run: `cd lifecycle-repair && node --test tests/package-release-index.test.mjs tests/package-installer.test.mjs tests/portable-package.test.mjs && (cd portable/server && go test ./... && go vet ./...)`

Expected: all Node and Go tests pass.

- [ ] **Step 5: Commit versioned packaging**

```bash
git add .github/workflows lifecycle-repair
git commit -m "release: package SelahMC v8.3.7"
```

### Task 6: Full verification and GitHub prerelease update

**Files:**
- Verify all modified files.
- Update the existing GitHub PR and create/update prerelease assets only after local verification.

**Interfaces:**
- Produces a reviewable commit series, deterministic hashes, and a portable ZIP on the repair prerelease.

- [ ] **Step 1: Run the full local verification matrix**

```bash
cd lifecycle-repair
npm test
(cd portable/server && go test ./... && go vet ./...)
npm run build
npm run package
npm run package:portable
node --check dist/work/selahmc-client-v8.3.7.js
unzip -t dist/SelahMC-v8.3.7-Portable-Windows.zip
sha256sum dist/work/selahmc-client-v8.3.7.js dist/SelahMC-v8.3.7-Portable-Windows.zip
```

- [ ] **Step 2: Verify compatibility invariants**

Count the expected `TuffClient` identity in the generated bundle, confirm ViaBlocks/ViaEntities and deferred-render entry points remain present, inspect `git diff --check`, and confirm `git status --short` contains only intentional files.

- [ ] **Step 3: Push the existing repair branch**

Run: `git push origin lifecycle-barrier-v8.3.6`

Expected: the existing PR updates without touching main.

- [ ] **Step 4: Confirm GitHub Actions and prerelease assets**

Verify the v8.3.7 workflow succeeds, prerelease tag `v8.3.7-portable` targets the tested commit, both ZIP and SHA-256 assets exist, and their published hashes match local output.

- [ ] **Step 5: Report exact artifacts and hashes**

Provide the PR URL, prerelease URL, portable ZIP name, client SHA-256, ZIP SHA-256, test counts, and a clear statement that main/VPS were not changed.
