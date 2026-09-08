# SelahMC v8.3.7 Lifecycle Transaction Design

## Problem

SelahMC's generated TeaVM client exposes a partially initialized multiplayer world to browser callbacks. In generated `Minecraft.loadWorld` (`G6r`), `a.O = b` publishes the world at state 3, `a.t = c` assigns the player at state 29, and player preparation, spawning, configuration, and the real camera assignment do not finish until states 26 and 27. Every `if(B()){break _;}` between those states can suspend the Java method and permit GUI, input, controller, or renderer work to observe an invalid combination of fields.

Vanilla Minecraft relies on `loadWorld` being synchronous. Its GUI code assumes `world != null` implies `player != null` and calls `player.getHealth()` when closing a screen. TeaVM breaks that implicit atomicity, producing the reported resource-pack crash and the earlier potion, sky-color, controller, and rendering crashes.

The v8.3.6 helper also contains an unsafe recovery: when player exists but camera does not, it writes `renderViewEntity = player` and declares READY. That can release world work after state 29 but before states 26 and 27 finish configuring the player.

## Chosen Architecture

Model `loadWorld` as an explicit transaction owned by the Minecraft instance:

- `SD_worldLifecycleBegin(minecraft, world)` starts a new generation before a non-null world is published and marks it JOINING.
- `SD_worldLifecycleCommit(minecraft)` commits only at the real successful end of `loadWorld`, after the generated code has prepared and spawned the player and assigned the camera.
- `SD_worldLifecycleReset(minecraft)` clears the transaction on `loadWorld(null)` and marks NO_WORLD.
- `SD_worldLifecycleReady(minecraft, gate)` returns true only for a committed generation whose world, player, and camera are all present.
- No lifecycle helper writes Minecraft's player or camera fields.

State is stored per Minecraft instance when possible, with public read-only diagnostics exposed through `window.SelahWorldLifecycle`. Diagnostics include phase, generation, committed generation, blocked-call count, last gate, and the missing capability.

## Capability Boundaries

### World loading

Patch generated `G6r` at exact, checksum-pinned anchors:

1. Begin a lifecycle generation before the non-null load path publishes `a.O`.
2. Reset during the null-world return path.
3. Commit immediately after the original `a.hl = a.t` at the successful end.

The transformer must refuse zero, duplicate, or drifted anchors.

### GUI

Patch generated `HjP` so `displayGuiScreen(null)` does not call `getHealth` while the lifecycle is uncommitted or the player is absent. It must still close the resource-pack confirmation screen and must preserve vanilla behavior after commit, including opening the game-over screen for a dead player.

### Input

GUI input remains active during JOINING so users can answer the server-resource prompt. Gameplay input is isolated:

- `runTickMouse` and `runTickKeyboard` may process an active GUI.
- If a GUI callback closes the screen while JOINING, the same input invocation must not fall through into gameplay behavior.
- `processKeyBinds`, `clickMouse`, `rightClickMouse`, `middleClickMouse`, and `sendClickBlockToController` receive direct lifecycle guards as defense in depth.

### Controller, world tick, and rendering

Existing centralized gates remain, but they use committed transaction state. Gates after TeaVM suspension points revalidate the current generation before dereferencing player or camera fields. Custom spectator cameras are preserved because the policy never rewrites `renderViewEntity`.

## Compatibility Constraints

- Preserve the internal `TuffClient` protocol identity.
- Preserve Tuff modern assets, ViaBlocks, ViaEntities, deferred shaders, and current plugin assets.
- Preserve visible SelahMC branding.
- Do not change production `main` or deploy to the VPS as part of this repair.
- Build from the pinned v8.3.3 base bundle SHA-256 `6e775ed50e83a6ba976aea593e0ef70ed74b662f652f3f47f616499a85005ba4`.
- Publish only through the repair branch and a v8.3.7 portable prerelease.

## Test Strategy

Tests execute real extracted generated functions in a Node VM. Required regressions:

- An uncommitted world with player and camera objects is still blocked.
- A player without a camera never causes the policy to mutate the camera.
- The `G6r` load transaction begins before world publication, resets on unload, and commits only after the original final camera assignment.
- Closing `GuiYesNo` during JOINING never calls `getHealth`; closing it after commit retains healthy and dead-player behavior.
- GUI mouse and keyboard callbacks execute during JOINING, but gameplay input cannot run after the callback closes the screen.
- All direct gameplay entry points return safely during JOINING and behave normally after commit.
- Previous renderer, fog, potion, controller, integrated-server, packaging, portable-server, and deterministic-archive regressions continue to pass.

## Release

Version the generated client and packages as v8.3.7. The GitHub workflow creates or updates prerelease tag `v8.3.7-portable` with the deterministic Windows ZIP and SHA-256 file. Main and the VPS remain untouched until the user separately authorizes deployment.
