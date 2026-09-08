import { replaceExact } from "./build-lifecycle-repair.mjs";

const originalSnapshot = `function snapshotState(gl) {
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
  }`;

const safeSnapshot = `function snapshotState(gl) {
    var activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0);
    var texture0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
    var activeTextureBinding = texture0;
    if (activeTexture !== gl.TEXTURE0) {
      gl.activeTexture(activeTexture);
      activeTextureBinding = gl.getParameter(gl.TEXTURE_BINDING_2D);
    }
    return {
      drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
      readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      activeTexture: activeTexture,
      texture0: texture0,
      activeTextureBinding: activeTextureBinding,
      viewport: gl.getParameter(gl.VIEWPORT),
      colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
      blend: gl.isEnabled(gl.BLEND), depth: gl.isEnabled(gl.DEPTH_TEST),
      cull: gl.isEnabled(gl.CULL_FACE), scissor: gl.isEnabled(gl.SCISSOR_TEST)
    };
  }`;

const originalRestore = `function restoreState(gl, saved) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
    gl.useProgram(saved.program);
    gl.bindVertexArray(saved.vao);
    gl.activeTexture(saved.activeTexture);
    gl.bindTexture(gl.TEXTURE_2D, saved.texture);
    gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
    [[gl.BLEND, saved.blend], [gl.DEPTH_TEST, saved.depth], [gl.CULL_FACE, saved.cull], [gl.SCISSOR_TEST, saved.scissor]].forEach(function (entry) {
      if (entry[1]) gl.enable(entry[0]); else gl.disable(entry[0]);
    });
  }`;

const safeRestore = `function restoreState(gl, saved) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.drawFramebuffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.readFramebuffer);
    gl.useProgram(saved.program);
    gl.bindVertexArray(saved.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, saved.texture0);
    if (saved.activeTexture !== gl.TEXTURE0) {
      gl.activeTexture(saved.activeTexture);
      gl.bindTexture(gl.TEXTURE_2D, saved.activeTextureBinding);
    }
    gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
    gl.colorMask(saved.colorMask[0], saved.colorMask[1], saved.colorMask[2], saved.colorMask[3]);
    [[gl.BLEND, saved.blend], [gl.DEPTH_TEST, saved.depth], [gl.CULL_FACE, saved.cull], [gl.SCISSOR_TEST, saved.scissor]].forEach(function (entry) {
      if (entry[1]) gl.enable(entry[0]); else gl.disable(entry[0]);
    });
  }`;

const originalRenderGate =
  "if (!state.enabled || !state.deferredEnabled || !state.deferredReady || !state.compiled.length || document.hidden) return;";
const safeRenderGate =
  "if (!state.enabled || !state.deferredEnabled || !state.deferredReady || !state.compiled.length || document.hidden || (state.overlay && state.overlay.style.display !== \"none\")) return;";

const originalOpen = `function open() {
    buildOverlay().style.display = "block";
    refreshDetails();
  }`;

const fullscreenSafeOpen = `function open() {
    var host = buildOverlay();
    var showPanel = function () {
      host.style.display = "block";
      refreshDetails();
      return true;
    };
    try {
      if (typeof document.exitPointerLock === "function") document.exitPointerLock();
    } catch (error) {
      setStatus("Could not release the mouse pointer.", error);
    }
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      try {
        var fullscreenExit = document.exitFullscreen();
        if (fullscreenExit && typeof fullscreenExit.then === "function") {
          return fullscreenExit.then(showPanel, function (error) {
            setStatus("Could not leave fullscreen. Press Escape and open Shaders again.", error);
            return false;
          });
        }
      } catch (error) {
        setStatus("Could not leave fullscreen. Press Escape and open Shaders again.", error);
        return false;
      }
    }
    return showPanel();
  }`;

export function transformOptiFineBridge(source) {
  const replacements = {
    fullscreenPanelSafety: 0,
    renderPostPanelGate: 0,
    webglStateSnapshot: 0,
    webglStateRestore: 0,
  };
  let code = replaceExact(
    source,
    originalOpen,
    fullscreenSafeOpen,
    1,
    "OptiFine fullscreen-safe panel",
  );
  replacements.fullscreenPanelSafety = 1;
  code = replaceExact(
    code,
    originalRenderGate,
    safeRenderGate,
    1,
    "OptiFine render-post panel gate",
  );
  replacements.renderPostPanelGate = 1;
  code = replaceExact(
    code,
    originalSnapshot,
    safeSnapshot,
    1,
    "OptiFine WebGL state snapshot",
  );
  replacements.webglStateSnapshot = 1;
  code = replaceExact(
    code,
    originalRestore,
    safeRestore,
    1,
    "OptiFine WebGL state restore",
  );
  replacements.webglStateRestore = 1;

  return { code, replacements };
}
