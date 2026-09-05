import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_BASE_SHA256 =
  "6e775ed50e83a6ba976aea593e0ef70ed74b662f652f3f47f616499a85005ba4";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyBaseBundle(source) {
  const actual = sha256(source);
  if (actual !== EXPECTED_BASE_SHA256) {
    throw new Error(
      `base bundle SHA-256 mismatch: expected ${EXPECTED_BASE_SHA256}, found ${actual}`,
    );
  }
  return actual;
}

export function replaceExact(
  source,
  before,
  after,
  expectedCount,
  label,
) {
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount}, found ${count}`);
  }
  return source.split(before).join(after);
}

export function injectLifecycleBarrier(source, barrierSource) {
  const anchor = "function CYD(";
  return replaceExact(
    source,
    anchor,
    `${barrierSource}\n${anchor}`,
    1,
    "lifecycle policy injection",
  );
}

function transformGeneratedFunction(source, name, transform) {
  const signature = `function ${name}(`;
  const count = source.split(signature).length - 1;
  if (count !== 1) {
    throw new Error(`generated function ${name}: expected 1, found ${count}`);
  }

  const start = source.indexOf(signature);
  const nextFunction = source.indexOf("\nfunction ", start + signature.length);
  const end = nextFunction === -1 ? source.length : nextFunction;
  const original = source.slice(start, end);
  const transformed = transform(original);
  return `${source.slice(0, start)}${transformed}${source.slice(end)}`;
}

function applyLifecycleRuntimeTransforms(source, replacements) {
  let code = source;

  function patchFunction(name, patches) {
    code = transformGeneratedFunction(code, name, (functionSource) => {
      let result = functionSource;
      for (const patch of patches) {
        result = replaceExact(
          result,
          patch.before,
          patch.after,
          patch.count ?? 1,
          `${name} ${patch.label}`,
        );
        replacements[patch.metric] =
          (replacements[patch.metric] || 0) + (patch.count ?? 1);
      }
      return result;
    });
  }

  function protectContinuation(name, minecraft, gate, expectedSuspensions) {
    code = transformGeneratedFunction(code, name, (source) => {
      let result = replaceExact(source, ",$p,$z;", ",SD_generation,$p,$z;", 1, `${name} generation local`);
      result = replaceExact(result, "$p=$T.l();", "$p=$T.l();SD_generation=$T.l();", 1, `${name} generation restore`);
      result = replaceExact(result, ",$p);}", ",SD_generation,$p);}", 1, `${name} generation save`);
      const entry = `case 0:if(!SD_worldLifecycleReady(${minecraft},"${gate}"))return;`;
      result = replaceExact(result, entry, `${entry}SD_generation=SD_worldLifecycleGetState(${minecraft},0).generation;`, 1, `${name} generation capture`);
      const suspension = /if\s*\(B\(\)\)\s*\{break _;\}/gu;
      const count = [...result.matchAll(suspension)].length;
      if (count !== expectedSuspensions) {
        throw new Error(`${name} continuations: expected ${expectedSuspensions}, found ${count}`);
      }
      replacements[`${gate}Continuations`] = count;
      // The pending child must consume its saved frames before cancellation.
      return result.replace(suspension, (boundary) => `${boundary}if(!SD_worldLifecycleOwns(${minecraft},SD_generation)||!SD_worldLifecycleReady(${minecraft},"${gate}.resume"))return;`);
    });
  }

  patchFunction("G6r", [
    {
      before: "var c,d,e,f,g,h,i,$p,$z;",
      after: "var c,d,e,f,g,h,i,SD_generation,$p,$z;",
      label: "transaction continuation local",
      metric: "loadWorldTransaction",
    },
    {
      before: "$p=$T.l();i=$T.l();",
      after: "$p=$T.l();SD_generation=$T.l();i=$T.l();",
      label: "restore transaction generation",
      metric: "loadWorldTransaction",
    },
    {
      before: "DI().s(a,b,c,d,e,f,g,h,i,$p);",
      after: "DI().s(a,b,c,d,e,f,g,h,i,SD_generation,$p);",
      label: "save transaction generation",
      metric: "loadWorldTransaction",
    },
    {
      before: "case 0:GN7();",
      after: "case 0:SD_generation=SD_worldLifecycleBegin(a,b);GN7();",
      label: "invalidate before first asynchronous operation",
      metric: "loadWorldTransaction",
    },
    {
      after:
        "BVz(a.c9,a.t);a.hl=a.t;SD_worldLifecycleCommit(a,SD_generation);a.bGu=BA;return;",
      before: "BVz(a.c9,a.t);a.hl=a.t;a.bGu=BA;return;",
      label: "commit after final player and camera setup",
      metric: "loadWorldTransaction",
    },
    {
      before: "if(B()){break _;}",
      after: "if(B()){break _;}if(!SD_worldLifecycleOwns(a,SD_generation))return 0;",
      count: 37,
      label: "discard superseded load after child completion",
      metric: "loadWorldResume",
    },
    {
      before: "if\n(B()){break _;}",
      after: "if\n(B()){break _;}if(!SD_worldLifecycleOwns(a,SD_generation))return 0;",
      label: "discard superseded load after wrapped child completion",
      metric: "loadWorldResume",
    },
    {
      before: "a.bGu=BA;return;",
      after: "a.bGu=BA;return 1;",
      count: 2,
      label: "explicit load completion result",
      metric: "loadWorldCompletion",
    },
  ]);

  // All direct callers must propagate cancellation, including join/respawn
  // packet handlers which immediately write player fields after loadWorld.
  for (const name of ["GjI", "CYD", "EIu", "EXw", "CaB", "B38", "GA_", "FfJ", "EN4", "FF1", "GKt", "CZ5", "DYf"]) {
    code = transformGeneratedFunction(code, name, (source) => {
      const calls = [...source.matchAll(/G6r\([^;]+\);if\s*\(B\(\)\)\s*\{break _;\}/gu)];
      if (calls.length !== 1) throw new Error(`${name} loadWorld caller: expected 1, found ${calls.length}`);
      replacements.loadWorldCallers = (replacements.loadWorldCallers || 0) + 1;
      return replaceExact(source, calls[0][0], `$z=${calls[0][0]}if(!$z)return;`, 1, `${name} canceled load`);
    });
  }

  patchFunction("HjP", [
    {
      after:
        'if(b!==null){$p=2;continue _;}if(!SD_worldLifecycleReady(a,"displayGuiScreen.close")){$p=2;continue _;}c=a.t;$p=3;continue _;',
      before: "if(b!==null){$p=2;continue _;}c=a.t;$p=3;continue _;",
      count: 2,
      label: "null-screen health boundary",
      metric: "displayGuiScreen",
    },
    {
      before: "case 3:$z=Fff(c);if(B()){break _;}e=$z;",
      after: 'case 3:$z=Fff(c);if(B()){break _;}if(c!==a.t||!SD_worldLifecycleReady(a,"displayGuiScreen.healthResume")){$p=2;continue _;}e=$z;',
      label: "health continuation recheck",
      metric: "displayGuiScreen",
    },
  ]);

  patchFunction("DEF", [
    {
      after:
        'case 1:$z=GC0();if(B()){break _;}b=$z;if(!b)return;if(a.b0===null&&!SD_worldLifecycleReady(a,"runTickMouse.gameplay")){$p=1;continue _;}',
      before: "case 1:$z=GC0();if(B()){break _;}b=$z;if(!b)return;",
      label: "gameplay event-loop boundary",
      metric: "runTickMouse",
    },
    {
      before: "if(b&&!Iph){e=a.t;$p=9;continue _;}",
      after: 'if(b&&!Iph&&SD_worldLifecycleReady(a,"runTickMouse.scroll")){e=a.t;$p=9;continue _;}',
      label: "scroll player boundary",
      metric: "runTickMouse",
    },
    {
      after:
        'case 2:DdZ(b,d);if(B()){break _;}if(!ZN()||!SD_worldLifecycleReady(a,"runTickMouse.wheel")){$p=3;continue _;}e=a.t;',
      before:
        "case 2:DdZ(b,d);if(B()){break _;}if(!ZN()){$p=3;continue _;}e=a.t;",
      label: "player wheel boundary",
      metric: "runTickMouse",
    },
    {
      after:
        'case 8:e.oq();if(B()){break _;}SD_worldLifecycleReady(a,"runTickMouse.afterScreen");$p=1;',
      before: "case 8:e.oq();if(B()){break _;}$p=1;",
      label: "screen callback boundary",
      metric: "runTickMouse",
    },
    ...[
      "case 4:$z=FjD(e);if(B()){break _;}",
      "case 9:$z=FjD(e);if(B()){break _;}",
      "case 13:$z=HjF(e);if(B()){break _;}",
      "case 14:$z=FR_(h,i,j);if(B()){break _;}",
    ].map((before) => ({
      before,
      after: `${before}if(!SD_worldLifecycleReady(a,"runTickMouse.playerResume")){$p=3;continue _;}`,
      label: "player continuation recheck",
      metric: "runTickMouseResume",
    })),
  ]);

  patchFunction("GOh", [
    {
      after:
        'case 1:$z=Gfq();if(B()){break _;}b=$z;if(!b){if(!SD_worldLifecycleReady(a,"runTickKeyboard.keyBinds"))return;$p=2;continue _;}if(a.b0===null&&!SD_worldLifecycleReady(a,"runTickKeyboard.gameplay")){$p=1;continue _;}',
      before: "case 1:$z=Gfq();if(B()){break _;}b=$z;if(!b){$p=2;continue _;}",
      label: "gameplay event-loop boundary",
      metric: "runTickKeyboard",
    },
    {
      after:
        'case 7:GSv(h);if(B()){break _;}if(a.b0===null&&!SD_worldLifecycleReady(a,"runTickKeyboard.afterScreen")){$p=1;continue _;}j=AHE();',
      before: "case 7:GSv(h);if(B()){break _;}j=AHE();",
      label: "screen callback boundary",
      metric: "runTickKeyboard",
    },
  ]);

  patchFunction("EcM", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a,"processKeyBinds"))return;b=a.w.cEf;',
      before: "case 0:b=a.w.cEf;",
      label: "entry gate",
      metric: "processKeyBinds",
    },
  ]);

  patchFunction("CtF", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a,"clickMouse"))return;if(a.xi>0)return;',
      before: "case 0:if(a.xi>0)return;",
      label: "entry gate",
      metric: "clickMouse",
    },
  ]);

  patchFunction("GLY", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a,"rightClickMouse"))return;$p=1;',
      before: "case 0:$p=1;",
      label: "entry gate",
      metric: "rightClickMouse",
    },
  ]);

  patchFunction("GVy", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a,"middleClickMouse"))return;b=a.fz;',
      before: "case 0:b=a.fz;",
      label: "entry gate",
      metric: "middleClickMouse",
    },
  ]);

  patchFunction("FP1", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a,"sendClickBlockToController"))return;if(!b)a.xi=0;',
      before: "case 0:if(!b)a.xi=0;",
      label: "entry gate",
      metric: "sendClickBlockToController",
    },
  ]);

  for (const [name, gate, count] of [
    ["EcM", "processKeyBinds", 50],
    ["CtF", "clickMouse", 16],
    ["GLY", "rightClickMouse", 25],
    ["GVy", "middleClickMouse", 61],
    ["FP1", "sendClickBlockToController", 10],
  ]) protectContinuation(name, "a", gate, count);

  patchFunction("CYD", [
    {
      before: "if(b!==null&&!b.Bp){",
      after: 'if(b!==null&&!b.Bp){if(a.O!==null&&!SD_worldLifecycleReady(a,"runTick.afterModalScreen")){$p=43;continue _;}',
      count: 13,
      label: "world boundary after modal screen events",
      metric: "runTickModalScreen",
    },
    {
      after:
        'if(!a.cn&&a.O!==null&&SD_worldLifecycleReady(a,"runTick.controller")){b=a.c9;$p=9;continue _;}',
      before: "if(!a.cn&&a.O!==null){b=a.c9;$p=9;continue _;}",
      label: "controller slice boundary",
      metric: "runTickController",
    },
    {
      after:
        'b=a.O;if(b!==null&&!SD_worldLifecycleReady(a,"runTick")){$p=43;continue _;}',
      before: "b=a.O;if(b!==null&&a.t===null){$p=43;continue _;}",
      label: "world tick boundary",
      metric: "runTick",
    },
  ]);

  patchFunction("DQl", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.fB,"playerController.updateController"))return;$p=1;case 1:GU9(a);',
      before: "case 0:$p=1;case 1:GU9(a);",
      label: "entry gate",
      metric: "playerControllerUpdate",
    },
  ]);
  protectContinuation("DQl", "a.fB", "playerController.updateController", 47);

  patchFunction("GU9", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.fB,"playerController.syncCurrentPlayItem"))return;b=a.fB.t.bv.g4;',
      before: "case 0:b=a.fB.t.bv.g4;",
      label: "player inventory gate",
      metric: "syncCurrentPlayItem",
    },
  ]);

  patchFunction("SD_DSn", [
    {
      after:
        "a.iP=Mws;a.bU6=DR();a.b0i=a.bU6;a.b5S=(-1);a.bGW=1;a.cFB=0;a.cbg=G(ACx,6);a.ci1=a.cbg;",
      before:
        "a.iP=Mws;a.bU6=DR();a.b5S=(-1);a.bGW=1;a.cFB=0;a.cbg=G(ACx,6);",
      label: "base mutex and neighbor cache aliases",
      metric: "deferredRenderChunkBaseFields",
    },
    {
      after:
        "f=$z;a.cA0=f;a.cLX=a.cA0;a.bX8=b;a.duj=c;a.dJ7=a.duj;",
      before: "f=$z;a.cA0=f;a.bX8=b;a.duj=c;",
      label: "base facing map and renderer aliases",
      metric: "deferredRenderChunkBaseFields",
    },
  ]);

  patchFunction("EX_", [
    {
      after:
        "case 3:Fw();if(B()){break _;}if(Iow===null){b=new SB;$p=2;continue _;}b=Iow.cFc;",
      before: "case 3:Fw();if(B()){break _;}b=Iow.cFc;",
      label: "integrated-server tile entity fallback",
      metric: "integratedServerSettingsGuards",
    },
  ]);

  patchFunction("CCq", [
    {
      after:
        "case 2:Fw();if(B()){break _;}if(Iow===null){Ey();return LN7;}d=Iow.cFc;",
      before: "case 2:Fw();if(B()){break _;}d=Iow.cFc;",
      label: "integrated-server render type fallback",
      metric: "integratedServerSettingsGuards",
    },
  ]);

  patchFunction("EN$", [
    {
      after:
        "case 3:Fw();if(B()){break _;}if(Iow===null){$p=2;continue _;}f=Iow.cFc;",
      before: "case 3:Fw();if(B()){break _;}f=Iow.cFc;",
      label: "integrated-server connected texture fallback",
      metric: "integratedServerSettingsGuards",
    },
  ]);

  patchFunction("Dmj", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"updateRenderer"))return;b=a.bD.hl;if(b instanceof T_){',
      before: "case 0:b=a.bD.hl;if(b instanceof T_){",
      label: "entry gate",
      metric: "updateRenderer",
    },
    {
      after:
        'case 1:$z=Dcf(b);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"updateRenderer.resume"))return;d=$z;c=a.a08;',
      before: "case 1:$z=Dcf(b);if(B()){break _;}d=$z;c=a.a08;",
      label: "camera resume gate",
      metric: "updateRenderer",
    },
    {
      after:
        'case 6:DII(b,f);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"updateRenderer.cameraAssigned"))return;b=a.bD;g=b.hl;if(g===null)return;b=b.O;',
      before:
        "case 6:DII(b,f);if(B()){break _;}b=a.bD;g=b.hl;if(g===null)return;b=b.O;",
      label: "camera assignment resume gate",
      metric: "updateRenderer",
    },
  ]);
  protectContinuation("Dmj", "a.bD", "updateRenderer", 17);

  patchFunction("FSs", [
    {
      after:
        'e=e.t;if(e===null){e=a.bD;if(e.a_v)return;g=e.w.pa;$p=5;continue _;}$p=34;continue _;',
      before: "e=e.t;$p=34;continue _;",
      label: "null player input branch",
      metric: "cameraAndRender",
    },
    {
      after:
        'if(k.O!==null&&SD_worldLifecycleReady(k,"cameraAndRender")){$p=15;continue _;}g=0;',
      before: "if(k.O!==null){$p=15;continue _;}g=0;",
      label: "world branch gate",
      metric: "cameraAndRender",
    },
    {
      after:
        'case 18:FRN(a,b,c);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"cameraAndRender.resume"))return;k=a.bD;$p=19;',
      before: "case 18:FRN(a,b,c);if(B()){break _;}k=a.bD;$p=19;",
      label: "render resume gate",
      metric: "cameraAndRender",
    },
  ]);

  patchFunction("HbC", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"lightmap"))return;if(SD_getEnabled()){$p=1;continue _;}',
      before: "case 0:if(SD_getEnabled()){$p=1;continue _;}",
      label: "dispatcher gate",
      metric: "lightmap",
    },
  ]);

  patchFunction("SD_GM1", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"deferredLightmap"))return;if(a.cga){',
      before: "case 0:if(a.cga){",
      label: "entry gate",
      metric: "deferredLightmap",
    },
    {
      after: "if\n(h&&s!==null){$p=15;continue _;}",
      before: "if\n(h){s=a.bD.t;$p=15;continue _;}",
      label: "captured potion player",
      metric: "deferredPotionCapture",
    },
  ]);

  patchFunction("SD_TUFF_HbC", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"tuffLightmap"))return;if(a.coF){',
      before: "case 0:if(a.coF){",
      label: "entry gate",
      metric: "tuffLightmap",
    },
    {
      after: "$z=s===null?0:CqK(s,u);if(B()){break _;}h=$z;",
      before: "$z=CqK(s,u);if(B()){break _;}h=$z;",
      label: "potion null guard",
      metric: "tuffPotionNullGuard",
    },
    {
      after: "if(h&&s!==null){$p=\n15;continue _;}",
      before: "if(h){s=a.bD.t;$p=\n15;continue _;}",
      label: "captured potion player",
      metric: "tuffPotionCapture",
    },
  ]);

  patchFunction("FRN", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"renderWorld"))return;if(SD_getEnabled()){$p=1;continue _;}',
      before: "case 0:if(SD_getEnabled()){$p=1;continue _;}",
      label: "dispatcher gate",
      metric: "renderWorld",
    },
  ]);

  patchFunction("SD_FuK", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"deferredRenderWorld"))return;$p=1;',
      before: "case 0:$p=1;",
      label: "entry gate",
      metric: "deferredRenderWorld",
    },
    {
      after:
        'case 1:SD_GM1(a,b);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"deferredRenderWorld.resume"))return;d=a.bD;',
      before: "case 1:SD_GM1(a,b);if(B()){break _;}d=a.bD;",
      label: "lightmap resume gate",
      metric: "deferredRenderWorld",
    },
  ]);

  patchFunction("SD_TUFF_FRN", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"tuffRenderWorld"))return;$p=1;',
      before: "case 0:$p=1;",
      label: "entry gate",
      metric: "tuffRenderWorld",
    },
    {
      after:
        'case 1:HbC(a,b);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"tuffRenderWorld.resume"))return;d=a.bD;',
      before: "case 1:HbC(a,b);if(B()){break _;}d=a.bD;",
      label: "lightmap resume gate",
      metric: "tuffRenderWorld",
    },
  ]);

  patchFunction("CIX", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"renderWorldPass"))return;e=a.bD;',
      before: "case 0:e=a.bD;",
      label: "entry gate",
      metric: "renderWorldPass",
    },
    {
      after:
        'case 4:G1D(a,c);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"renderWorldPass.fogResume"))return;i=16640;',
      before: "case 4:G1D(a,c);if(B()){break _;}i=16640;",
      label: "fog resume gate",
      metric: "renderWorldPass",
    },
    {
      after:
        'case 6:CTH(a,c,b);if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"renderWorldPass.player"))return;j=a.bD;m=j.t;',
      before: "case 6:CTH(a,c,b);if(B()){break _;}j=a.bD;m=j.t;",
      label: "player reacquire gate",
      metric: "renderWorldPass",
    },
    {
      after:
        'case 9:$z=HbQ(j);if(B()){break _;}n=$z;if(n===null||!SD_worldLifecycleReady(a.bD,"renderWorldPass.camera"))return;o=n.fS;',
      before: "case 9:$z=HbQ(j);if(B()){break _;}n=$z;o=n.fS;",
      label: "camera reacquire gate",
      metric: "renderWorldPass",
    },
    {
      after:
        'case 29:DIt();if(B()){break _;}if(!SD_worldLifecycleReady(a.bD,"renderWorldPass.hand"))return;j=a.cxM;i=a.dY1;',
      before: "case 29:DIt();if(B()){break _;}j=a.cxM;i=a.dY1;",
      label: "hand player gate",
      metric: "renderWorldPass",
    },
  ]);

  patchFunction("G1D", [
    {
      after:
        'case 0:if(!SD_worldLifecycleReady(a.bD,"fog"))return;c=a.bD;d=c.O;$p=1;',
      before: "case 0:c=a.bD;d=c.O;$p=1;",
      label: "entry gate",
      metric: "fog",
    },
    {
      after:
        'case 1:$z=HbQ(c);if(B()){break _;}e=$z;if(e===null||!SD_worldLifecycleReady(a.bD,"fog.camera1"))return;f=1.0-G2(',
      before: "case 1:$z=HbQ(c);if(B()){break _;}e=$z;f=1.0-G2(",
      label: "first camera resume gate",
      metric: "fog",
    },
    {
      after:
        'case 2:$z=HbQ(c);if(B()){break _;}c=$z;if(c===null||!SD_worldLifecycleReady(a.bD,"fog.camera2"))return;$p=3;',
      before: "case 2:$z=HbQ(c);if(B()){break _;}c=$z;$p=3;",
      label: "second camera resume gate",
      metric: "fog",
    },
  ]);

  return code;
}

export function transformBundle(source, barrierSource, options = {}) {
  const baseSha256 = verifyBaseBundle(source);
  let code = injectLifecycleBarrier(source, barrierSource);
  const replacements = { policyInjection: 1 };

  if (options.applyLifecycleTransforms !== false) {
    code = applyLifecycleRuntimeTransforms(code, replacements);
  }

  return {
    baseSha256,
    code,
    outputSha256: sha256(code),
    replacements,
  };
}

function readArgument(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`missing required argument: ${name}`);
  }
  return resolve(args[index + 1]);
}

async function main(args) {
  const inputPath = readArgument(args, "--input");
  const barrierPath = readArgument(args, "--barrier");
  const outputPath = readArgument(args, "--output");
  const applyLifecycleTransforms = !args.includes("--no-lifecycle-transforms");
  const [source, barrierSource] = await Promise.all([
    readFile(inputPath, "utf8"),
    readFile(barrierPath, "utf8"),
  ]);
  const result = transformBundle(source, barrierSource, {
    applyLifecycleTransforms,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.code, "utf8");

  const replacementSummary = Object.entries(result.replacements)
    .map(([name, count]) => `${name}=${count}`)
    .join(" ");
  console.log(
    `base ${result.baseSha256} output ${result.outputSha256} ${replacementSummary}`,
  );
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (modulePath === invokedPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
