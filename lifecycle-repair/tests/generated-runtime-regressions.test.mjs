import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { transformBundle } from "../tools/build-lifecycle-repair.mjs";
import { extractGeneratedFunction } from "./helpers/extract-generated-function.mjs";

const baseBundleUrl = new URL(
  "../../recovered-live/selahmc-client-v8.3.3.js",
  import.meta.url,
);
const barrierUrl = new URL("../src/world-lifecycle-barrier.js", import.meta.url);

const [baseSource, barrierSource] = await Promise.all([
  readFile(baseBundleUrl, "utf8"),
  readFile(barrierUrl, "utf8"),
]);

const transformed = transformBundle(baseSource, barrierSource, {
  applyLifecycleTransforms:
    process.env.SELAH_DISABLE_LIFECYCLE_TRANSFORMS !== "1",
});

function makeMinecraft(overrides = {}) {
  const player = { id: "player" };
  return {
    O: {},
    eJ: 948,
    eZ: 1912,
    gj: {},
    hl: player,
    iW: {},
    t: player,
    w: { h5: 0 },
    ...overrides,
  };
}

function evaluateGenerated(name, additions = {}) {
  const context = {
    B: () => false,
    Date: { now: () => 1_000 },
    DI: () => ({ l: () => null, s: () => undefined }),
    Gs: () => {
      throw new Error("invalid TeaVM state");
    },
    Gt: () => false,
    console: { info: () => undefined, warn: () => undefined },
    window: {},
    ...additions,
  };
  const functionSource = extractGeneratedFunction(transformed.code, name);

  vm.runInNewContext(`${barrierSource}\n${functionSource}`, context, {
    filename: `${name}.generated.js`,
  });

  return { context, fn: context[name] };
}

test("render-world dispatcher blocks JOINING and preserves both READY branches", () => {
  for (const deferred of [false, true]) {
    const calls = [];
    const { fn: renderWorld } = evaluateGenerated("FRN", {
      SD_FuK: () => {
        calls.push("deferred");
        return "deferred-result";
      },
      SD_TUFF_FRN: () => {
        calls.push("tuff");
        return "tuff-result";
      },
      SD_getEnabled: () => deferred,
    });
    const joining = makeMinecraft({ hl: null, t: null });

    assert.doesNotThrow(() => renderWorld({ bD: joining }, 0, 0));
    assert.deepEqual(calls, []);

    const ready = makeMinecraft();
    const result = renderWorld({ bD: ready }, 0, 0);
    assert.equal(result, deferred ? "deferred-result" : "tuff-result");
    assert.deepEqual(calls, [deferred ? "deferred" : "tuff"]);
  }
});

test("world-only generated entry points return before dangerous downstream calls", async (t) => {
  const cases = [
    {
      additions: { HbQ: () => { throw new Error("fog camera lookup reached"); } },
      args: (mc) => [{ bD: mc }, 0],
      name: "G1D",
    },
    {
      additions: { EmX: () => { throw new Error("world pass reached"); } },
      args: (mc) => [{ bD: mc }, 0, 0, 0],
      name: "CIX",
    },
    {
      additions: {
        SD_GM1: () => { throw new Error("deferred lightmap reached"); },
        SD_TUFF_HbC: () => { throw new Error("Tuff lightmap reached"); },
        SD_getEnabled: () => true,
      },
      args: (mc) => [{ bD: mc }, 0],
      name: "HbC",
    },
    {
      additions: { DJh: () => { throw new Error("deferred lightmap body reached"); } },
      args: (mc) => [{ bD: mc, cga: 1 }, 0],
      name: "SD_GM1",
    },
    {
      additions: { DJh: () => { throw new Error("Tuff lightmap body reached"); } },
      args: (mc) => [{ bD: mc, coF: 1 }, 0],
      name: "SD_TUFF_HbC",
    },
    {
      additions: { SD_GM1: () => { throw new Error("deferred render setup reached"); } },
      args: (mc) => [{ bD: mc }, 0, 0],
      name: "SD_FuK",
    },
    {
      additions: { HbC: () => { throw new Error("Tuff render setup reached"); } },
      args: (mc) => [{ bD: mc }, 0, 0],
      name: "SD_TUFF_FRN",
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const { fn } = evaluateGenerated(fixture.name, fixture.additions);
      const joining = makeMinecraft({ hl: null, t: null });

      assert.doesNotThrow(() => fn(...fixture.args(joining)));
    });
  }
});

test("fog rechecks lifecycle after TeaVM camera lookup", () => {
  const minecraft = makeMinecraft();
  let lookups = 0;
  const { fn: updateFogColor } = evaluateGenerated("G1D", {
    HbQ: (mc) => {
      lookups += 1;
      mc.t = null;
      mc.hl = null;
      return null;
    },
  });

  assert.doesNotThrow(() => updateFogColor({ bD: minecraft }, 0));
  assert.equal(lookups, 1);
});

test("world pass rechecks lifecycle after fog work", () => {
  const minecraft = makeMinecraft();
  const { fn: renderWorldPass } = evaluateGenerated("CIX", {
    EmX: () => 0,
    FfH: () => undefined,
    G1D: (renderer) => {
      renderer.bD.t = null;
      renderer.bD.hl = null;
    },
    GUN: () => undefined,
    GpN: () => {
      throw new Error("clear reached after lifecycle invalidation");
    },
  });

  assert.doesNotThrow(() => renderWorldPass({ bD: minecraft }, 0, 0, 0));
});

test("world pass rechecks lifecycle before player and camera dereferences", async (t) => {
  await t.test("player after terrain setup", () => {
    const minecraft = makeMinecraft();
    const { fn: renderWorldPass } = evaluateGenerated("CIX", {
      CTH: (renderer) => {
        renderer.bD.t = null;
        renderer.bD.hl = null;
      },
      DGq: () => {
        throw new Error("null player reached DGq");
      },
      EmX: () => 0,
      FfH: () => undefined,
      G1D: () => undefined,
      GUN: () => undefined,
      GpN: () => undefined,
    });

    assert.doesNotThrow(() => renderWorldPass({ bD: minecraft }, 0, 0, 0));
  });

  await t.test("camera after lookup", () => {
    const minecraft = makeMinecraft();
    const { fn: renderWorldPass } = evaluateGenerated("CIX", {
      CTH: () => undefined,
      D7A: () => undefined,
      DGq: () => undefined,
      EmX: () => 0,
      FfH: () => undefined,
      G1D: () => undefined,
      GUN: () => undefined,
      GpN: () => undefined,
      HbQ: (mc) => {
        mc.t = null;
        mc.hl = null;
        return null;
      },
    });

    assert.doesNotThrow(() => renderWorldPass({ bD: minecraft }, 0, 0, 0));
  });
});

test("render wrappers recheck lifecycle after lightmap suspension", async (t) => {
  for (const fixture of [
    { lightmap: "SD_GM1", name: "SD_FuK" },
    { lightmap: "HbC", name: "SD_TUFF_FRN" },
  ]) {
    await t.test(fixture.name, () => {
      const minecraft = makeMinecraft();
      const additions = {
        DII: () => undefined,
        EX3: () => {
          throw new Error("render setup reached after lifecycle invalidation");
        },
      };
      additions[fixture.lightmap] = (renderer) => {
        renderer.bD.t = null;
        renderer.bD.hl = null;
      };
      const { fn } = evaluateGenerated(fixture.name, additions);

      assert.doesNotThrow(() => fn({ bD: minecraft }, 0, 0));
    });
  }
});

test("camera updater rechecks lifecycle after camera-specific suspension", () => {
  class Camera {}
  const camera = new Camera();
  const minecraft = makeMinecraft({ hl: camera });
  const { fn: updateRenderer } = evaluateGenerated("Dmj", {
    Dcf: () => {
      minecraft.t = null;
      minecraft.hl = null;
      return 1;
    },
    Dm: () => 0.5,
    T_: Camera,
  });

  assert.doesNotThrow(() => updateRenderer({ bD: minecraft }));
});

test("runTick keeps GUI input ticking while controller work is blocked without a player", () => {
  class TickProfiler {}

  const resourcePrompt = { ticks: 0 };
  const minecraft = makeMinecraft({
    BI: null,
    O: {},
    b0: null,
    bG: resourcePrompt,
    bGu: 0,
    bwx: 0,
    c9: {},
    cI: {},
    cn: 0,
    e7: {},
    fz: {},
    gX: null,
    hl: null,
    kA: 0,
    p9: {},
    t: null,
  });
  const { fn: runTick } = evaluateGenerated("CYD", {
    AMc: () => ({}),
    Bcs: TickProfiler,
    DD3: () => undefined,
    DEF: () => undefined,
    DEH: () => undefined,
    DG1: () => undefined,
    DJW: () => undefined,
    DQl: () => {
      throw new Error("controller update reached with no player");
    },
    EX3: () => undefined,
    FFy: () => 1_234,
    FfH: () => undefined,
    GJO: (screen) => {
      screen.ticks += 1;
      minecraft.cn = 1;
      minecraft.O = null;
    },
    GOh: () => undefined,
    Gwb: () => undefined,
  });

  assert.doesNotThrow(() => runTick(minecraft));
  assert.equal(resourcePrompt.ticks, 1);
  assert.equal(minecraft.bGu, 1_234);
});

test("PlayerControllerMP.updateController blocks all controller work while JOINING", () => {
  const controller = {
    fB: makeMinecraft({ hl: null, t: null }),
    hc: { m7: {} },
  };
  const { fn: updateController } = evaluateGenerated("DQl", {
    GU9: () => undefined,
    Gly: () => {
      throw new Error("network controller work reached with no player");
    },
  });

  assert.doesNotThrow(() => updateController(controller));
});

test("syncCurrentPlayItem blocks a null player and still synchronizes a READY player", () => {
  class HeldItemChangePacket {}

  const sentPackets = [];
  const { fn: syncCurrentPlayItem } = evaluateGenerated("GU9", {
    "A$H": HeldItemChangePacket,
    F1l: (connection, packet) => sentPackets.push({ connection, packet }),
  });
  const joiningController = {
    d3k: 0,
    fB: makeMinecraft({ hl: null, t: null }),
    hc: { id: "joining-connection" },
  };

  assert.doesNotThrow(() => syncCurrentPlayItem(joiningController));
  assert.equal(joiningController.d3k, 0);
  assert.deepEqual(sentPackets, []);

  const readyConnection = { id: "ready-connection" };
  const readyController = {
    d3k: 2,
    fB: makeMinecraft({ t: { bv: { g4: 5 } } }),
    hc: readyConnection,
  };
  syncCurrentPlayItem(readyController);

  assert.equal(readyController.d3k, 5);
  assert.equal(sentPackets.length, 1);
  assert.equal(sentPackets[0].connection, readyConnection);
  assert.equal(sentPackets[0].packet.cmR, 5);
});

test("deferred RenderChunk initializer populates the current base-field names", () => {
  class RenderChunk {}
  class EnumFacing {}

  const mutex = { kind: "mutex" };
  const facingMap = { kind: "enum-map" };
  const renderGlobal = { kind: "render-global" };
  const position = { k: 64, m: 0, n: 0 };
  const compiledChunk = { kind: "compiled-chunk" };
  const chunk = { iP: compiledChunk, x5: null };
  const { fn: initializeDeferredRenderChunk } = evaluateGenerated("SD_DSn", {
    ACx: RenderChunk,
    BA: false,
    CPZ: () => facingMap,
    DR: () => mutex,
    E: (type) => type,
    F2E: (candidate) => {
      assert.equal(candidate.cLX, facingMap, "setPosition needs mapEnumFacing");
      assert.equal(candidate.ci1.data.length, 6, "setPosition needs neighbor cache");
    },
    G: (_type, length) => ({ data: Array(length).fill(null) }),
    GB: EnumFacing,
    IQ: () => false,
    Mws: compiledChunk,
    SD_AZa: () => undefined,
  });

  assert.doesNotThrow(() =>
    initializeDeferredRenderChunk(chunk, {}, renderGlobal, position, 0),
  );
  assert.equal(chunk.b0i, mutex);
  assert.equal(chunk.ci1, chunk.cbg);
  assert.equal(chunk.cLX, chunk.cA0);
  assert.equal(chunk.dJ7, renderGlobal);
});

test("integrated-server block hooks avoid client settings when Minecraft is absent", async (t) => {
  const common = {
    CT: () => undefined,
    EM5: () => true,
    Fw: () => undefined,
    Iow: null,
    Ium: {},
  };

  await t.test("mob spawner still creates its tile entity", () => {
    class MobSpawnerTileEntity {}
    const { fn: createNewTileEntity } = evaluateGenerated("EX_", {
      ...common,
      FnN: (tileEntity) => {
        tileEntity.initialized = true;
      },
      SB: MobSpawnerTileEntity,
    });

    const tileEntity = createNewTileEntity({}, {}, 0);
    assert.equal(tileEntity instanceof MobSpawnerTileEntity, true);
    assert.equal(tileEntity.initialized, true);
  });

  await t.test("mob spawner keeps the vanilla render type", () => {
    const modelRenderType = { kind: "model" };
    const { fn: getRenderType } = evaluateGenerated("CCq", {
      ...common,
      Ey: () => undefined,
      LN6: { kind: "hidden" },
      LN7: modelRenderType,
    });

    assert.equal(getRenderType({}), modelRenderType);
  });

  await t.test("connected-texture hook uses its vanilla fallback", () => {
    const { fn: shouldSideBeRendered } = evaluateGenerated("EN$", {
      ...common,
      "Gq$": () => 1,
    });

    assert.equal(shouldSideBeRendered({}, {}, {}, {}, {}), 1);
  });
});

test("real bundle records all centralized and resume-point gates exactly once", () => {
  const required = [
    "runTick",
    "runTickController",
    "playerControllerUpdate",
    "syncCurrentPlayItem",
    "deferredRenderChunkBaseFields",
    "integratedServerSettingsGuards",
    "updateRenderer",
    "cameraAndRender",
    "lightmap",
    "deferredLightmap",
    "tuffLightmap",
    "renderWorld",
    "deferredRenderWorld",
    "tuffRenderWorld",
    "renderWorldPass",
    "fog",
  ];

  for (const name of required) {
    assert.equal(transformed.replacements[name] >= 1, true, name);
  }
  assert.equal(transformed.replacements.tuffPotionNullGuard, 1);
  assert.equal(transformed.replacements.deferredPotionCapture, 1);
  assert.equal(transformed.replacements.tuffPotionCapture, 1);
  assert.equal(transformed.replacements.deferredRenderChunkBaseFields, 2);
  assert.equal(transformed.replacements.integratedServerSettingsGuards, 3);
});
