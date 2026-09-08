import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { transformOptiFineBridge } from "../tools/patch-optifine-bridge.mjs";
import { extractGeneratedFunction } from "./helpers/extract-generated-function.mjs";

const bridgeFixture = String.raw`
function snapshotState(gl) {
    return {
      framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
      texture: gl.getParameter(gl.TEXTURE_BINDING_2D),
      viewport: gl.getParameter(gl.VIEWPORT),
      blend: gl.isEnabled(gl.BLEND), depth: gl.isEnabled(gl.DEPTH_TEST),
      cull: gl.isEnabled(gl.CULL_FACE), scissor: gl.isEnabled(gl.SCISSOR_TEST)
    };
  }

function restoreState(gl, saved) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
    gl.useProgram(saved.program);
    gl.bindVertexArray(saved.vao);
    gl.activeTexture(saved.activeTexture);
    gl.bindTexture(gl.TEXTURE_2D, saved.texture);
    gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
    [[gl.BLEND, saved.blend], [gl.DEPTH_TEST, saved.depth], [gl.CULL_FACE, saved.cull], [gl.SCISSOR_TEST, saved.scissor]].forEach(function (entry) {
      if (entry[1]) gl.enable(entry[0]); else gl.disable(entry[0]);
    });
  }

function renderPost() {
    if (!state.enabled || !state.deferredEnabled || !state.deferredReady || !state.compiled.length || document.hidden) return;
    state.gl.touched();
  }

function open() {
    buildOverlay().style.display = "block";
    refreshDetails();
  }
`;

function makeFakeWebGL2() {
  const gl = {
    ACTIVE_TEXTURE: 1,
    TEXTURE_BINDING_2D: 2,
    VIEWPORT: 3,
    CURRENT_PROGRAM: 4,
    VERTEX_ARRAY_BINDING: 5,
    FRAMEBUFFER_BINDING: 6,
    DRAW_FRAMEBUFFER_BINDING: 7,
    READ_FRAMEBUFFER_BINDING: 8,
    COLOR_WRITEMASK: 9,
    BLEND: 10,
    DEPTH_TEST: 11,
    CULL_FACE: 12,
    SCISSOR_TEST: 13,
    TEXTURE_2D: 14,
    FRAMEBUFFER: 15,
    DRAW_FRAMEBUFFER: 16,
    READ_FRAMEBUFFER: 17,
    TEXTURE0: 33_984,
    TEXTURE1: 33_985,
  };
  const state = {
    activeTexture: gl.TEXTURE1,
    textures: new Map([
      [gl.TEXTURE0, "game-atlas"],
      [gl.TEXTURE1, "light-map"],
    ]),
    drawFramebuffer: "game-draw-fbo",
    readFramebuffer: "game-read-fbo",
    program: "game-program",
    vao: "game-vao",
    viewport: [3, 5, 1_912, 948],
    colorMask: [false, true, false, true],
    enabled: new Set([gl.BLEND, gl.SCISSOR_TEST]),
  };

  gl.getParameter = (parameter) => {
    switch (parameter) {
      case gl.ACTIVE_TEXTURE: return state.activeTexture;
      case gl.TEXTURE_BINDING_2D: return state.textures.get(state.activeTexture) ?? null;
      case gl.FRAMEBUFFER_BINDING: return state.drawFramebuffer;
      case gl.DRAW_FRAMEBUFFER_BINDING: return state.drawFramebuffer;
      case gl.READ_FRAMEBUFFER_BINDING: return state.readFramebuffer;
      case gl.CURRENT_PROGRAM: return state.program;
      case gl.VERTEX_ARRAY_BINDING: return state.vao;
      case gl.VIEWPORT: return state.viewport.slice();
      case gl.COLOR_WRITEMASK: return state.colorMask.slice();
      default: throw new Error(`unexpected parameter ${parameter}`);
    }
  };
  gl.isEnabled = (capability) => state.enabled.has(capability);
  gl.activeTexture = (unit) => { state.activeTexture = unit; };
  gl.bindTexture = (_target, texture) => { state.textures.set(state.activeTexture, texture); };
  gl.bindFramebuffer = (target, framebuffer) => {
    if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) state.drawFramebuffer = framebuffer;
    if (target === gl.FRAMEBUFFER || target === gl.READ_FRAMEBUFFER) state.readFramebuffer = framebuffer;
  };
  gl.useProgram = (program) => { state.program = program; };
  gl.bindVertexArray = (vao) => { state.vao = vao; };
  gl.viewport = (...viewport) => { state.viewport = viewport; };
  gl.colorMask = (...mask) => { state.colorMask = mask; };
  gl.enable = (capability) => { state.enabled.add(capability); };
  gl.disable = (capability) => { state.enabled.delete(capability); };

  return { gl, state };
}

test("OptiFine bridge restores every WebGL state it mutates", () => {
  const transformed = transformOptiFineBridge(bridgeFixture);
  const context = {};
  vm.runInNewContext(
    `${extractGeneratedFunction(transformed.code, "snapshotState")}\n${extractGeneratedFunction(transformed.code, "restoreState")}`,
    context,
  );
  const { gl, state } = makeFakeWebGL2();
  const saved = context.snapshotState(gl);

  assert.equal(state.activeTexture, gl.TEXTURE1, "snapshot must preserve the active unit");
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, "bridge-source");
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, "bridge-output");
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, "bridge-draw-fbo");
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, "bridge-read-fbo");
  gl.useProgram("bridge-program");
  gl.bindVertexArray("bridge-vao");
  gl.viewport(0, 0, 10, 10);
  gl.colorMask(true, true, true, true);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);

  context.restoreState(gl, saved);

  assert.equal(state.activeTexture, gl.TEXTURE1);
  assert.equal(state.textures.get(gl.TEXTURE0), "game-atlas");
  assert.equal(state.textures.get(gl.TEXTURE1), "light-map");
  assert.equal(state.drawFramebuffer, "game-draw-fbo");
  assert.equal(state.readFramebuffer, "game-read-fbo");
  assert.equal(state.program, "game-program");
  assert.equal(state.vao, "game-vao");
  assert.deepEqual(state.viewport, [3, 5, 1_912, 948]);
  assert.deepEqual(state.colorMask, [false, true, false, true]);
  assert.deepEqual([...state.enabled].sort((a, b) => a - b), [gl.BLEND, gl.SCISSOR_TEST]);
  assert.deepEqual(transformed.replacements, {
    fullscreenPanelSafety: 1,
    renderPostPanelGate: 1,
    webglStateSnapshot: 1,
    webglStateRestore: 1,
  });
});

test("OptiFine post-processing pauses while its settings panel is visible", () => {
  const transformed = transformOptiFineBridge(bridgeFixture);
  let touched = 0;
  const context = {
    document: { hidden: false },
    state: {
      compiled: [{}],
      deferredEnabled: true,
      deferredReady: true,
      enabled: true,
      gl: { touched: () => { touched += 1; } },
      overlay: { style: { display: "block" } },
    },
  };
  vm.runInNewContext(extractGeneratedFunction(transformed.code, "renderPost"), context);

  context.renderPost();

  assert.equal(touched, 0);
});

test("OptiFine settings waits for canvas fullscreen to end before showing its DOM panel", async () => {
  const transformed = transformOptiFineBridge(bridgeFixture);
  let resolveFullscreen;
  let pointerLockExits = 0;
  let refreshes = 0;
  const host = { style: { display: "none" } };
  const context = {
    buildOverlay: () => host,
    document: {
      exitFullscreen: () => new Promise((resolve) => { resolveFullscreen = resolve; }),
      exitPointerLock: () => { pointerLockExits += 1; },
      fullscreenElement: { nodeName: "CANVAS" },
    },
    refreshDetails: () => { refreshes += 1; },
    setStatus: () => {},
  };
  vm.runInNewContext(extractGeneratedFunction(transformed.code, "open"), context);

  const opened = context.open();

  assert.equal(pointerLockExits, 1);
  assert.equal(host.style.display, "none", "panel must stay hidden behind the fullscreen canvas");
  assert.equal(refreshes, 0);

  context.document.fullscreenElement = null;
  resolveFullscreen();
  assert.equal(await opened, true);
  assert.equal(host.style.display, "block");
  assert.equal(refreshes, 1);
  assert.equal(transformed.replacements.fullscreenPanelSafety, 1);
});

test("OptiFine settings opens immediately when the document is windowed", () => {
  const transformed = transformOptiFineBridge(bridgeFixture);
  let refreshes = 0;
  const host = { style: { display: "none" } };
  const context = {
    buildOverlay: () => host,
    document: { fullscreenElement: null },
    refreshDetails: () => { refreshes += 1; },
    setStatus: () => {},
  };
  vm.runInNewContext(extractGeneratedFunction(transformed.code, "open"), context);

  assert.equal(context.open(), true);
  assert.equal(host.style.display, "block");
  assert.equal(refreshes, 1);
});
