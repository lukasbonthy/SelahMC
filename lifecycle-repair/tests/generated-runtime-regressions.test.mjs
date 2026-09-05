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

function beginLifecycle(context, minecraft, world = minecraft.O) {
  return context.SD_worldLifecycleBegin(minecraft, world);
}

function commitLifecycle(context, minecraft) {
  return context.SD_worldLifecycleCommit(minecraft);
}

function markJoining(context, minecraft) {
  beginLifecycle(context, minecraft);
  return minecraft;
}

function markReady(context, minecraft) {
  beginLifecycle(context, minecraft);
  assert.equal(commitLifecycle(context, minecraft), 1);
  return minecraft;
}

function pausingWorldLoader(pauseAt) {
  const stack = [];
  let suspending = false;
  let resuming = false;
  let paused = false;
  const player = {};
  const iterator = { E: () => false, R() { return this; } };
  const boundary = (name, value) => () => {
    if (name === pauseAt && !paused) {
      paused = true;
      suspending = true;
      stack.push(name);
      return;
    }
    if (resuming) {
      assert.equal(stack.pop(), name, "pending child must resume before its caller returns");
      resuming = false;
    }
    return value;
  };
  const stubs = Object.fromEntries([
    "AE4", "AL9", "AS5", "BVz", "BRm", "DPR", "DV", "Due", "Eey", "EZy",
    "GDd", "GdB", "Ghq", "Gxi", "GN7", "HFj", "PO", "Xx", "AJD", "BWq",
  ].map((name) => [name, () => undefined]));
  const evaluated = evaluateGenerated("G6r", {
    ...stubs,
    A4P: class {}, AWF: () => ({}), Ebs: () => player,
    BA: false, C1r: boundary("C1r", {}), D1k: boundary("D1k"),
    DvO: () => null, EKI: () => false, Ev: () => iterator, HOB: () => ({}),
    Ipr: {}, Ipq: {}, Ips: {}, Ipt: {}, Ipu: {},
    B: () => suspending, Gt: () => resuming,
    DI: () => ({ l: () => stack.pop(), s: (...args) => stack.push(...args) }),
  });
  const minecraft = makeMinecraft({
    O: null, t: null, hl: null, BI: null, Dq: { bl6: null }, Fi: {}, HI: {},
    cI: { YU: {}, a2I: { Gh: {} }, dd: { Dl: { PC: {}, yL: {} } } },
    e7: { bpZ: {}, cgK: { bLw: {} } }, fV: {}, gj: null, iW: null, c9: {},
  });
  return {
    ...evaluated, minecraft, player, stack,
    resume() {
      suspending = false;
      resuming = true;
      evaluated.fn();
      assert.equal(resuming, false, "child continuation was consumed");
      assert.equal(stack.length, 0, "TeaVM stack must be empty after completion");
    },
  };
}

test("loadWorld survives real suspension before publication and during player setup", async (t) => {
  for (const pauseAt of ["C1r", "D1k"]) {
    await t.test(pauseAt, () => {
      const loader = pausingWorldLoader(pauseAt);
      const { context, fn, minecraft, player, stack } = loader;
      const world = {};
      fn(minecraft, world);
      assert.ok(stack.length > 1);
      assert.equal(context.SD_worldLifecycleGetState(minecraft, 0)?.phase, "JOINING");
      assert.equal(context.SD_worldLifecycleReady(minecraft), 0);
      loader.resume();
      assert.equal(minecraft.O, world);
      assert.equal(minecraft.t, player);
      assert.equal(minecraft.hl, player);
      assert.equal(context.SD_worldLifecycleReady(minecraft), 1);
    });
  }
});

test("a superseded load resumes its child but cannot publish or commit the old world", () => {
  const loader = pausingWorldLoader("C1r");
  const { context, fn, minecraft } = loader;
  fn(minecraft, {});
  context.SD_worldLifecycleReset(minecraft);
  const newWorld = {};
  context.SD_worldLifecycleBegin(minecraft, newWorld);
  loader.resume();
  assert.equal(minecraft.O, null);
  assert.equal(minecraft.t, null);
  assert.equal(context.SD_worldLifecycleGetState(minecraft, 0).world, newWorld);
  assert.equal(context.SD_worldLifecycleReady(minecraft), 0);
});

test("unload revokes gameplay before its first asynchronous operation", () => {
  const loader = pausingWorldLoader("C1r");
  const { context, fn, minecraft } = loader;
  minecraft.O = {};
  minecraft.t = minecraft.hl = {};
  markReady(context, minecraft);
  fn(minecraft, null);
  assert.equal(context.SD_worldLifecycleReady(minecraft), 0);
  loader.resume();
  assert.equal(minecraft.O, null);
  assert.equal(minecraft.t, null);
});

test("superseded load aborts its packet handler without touching an absent or newer player", async (t) => {
  for (const scenario of ["absent-player", "newer-player"]) {
    await t.test(scenario, () => {
      const stack = [];
      let suspending = false;
      let resuming = false;
      let childConsumed = false;
      const { context, fn } = evaluateGenerated("EN4", {
        B: () => suspending, Gt: () => resuming,
        DI: () => ({ l: () => stack.pop(), s: (...args) => stack.push(...args) }),
        AP6: class {}, AYA: class {}, BA: false, Cm3: () => ({}),
        F_i: () => {}, GN7: () => {}, GSR: () => {}, Ipq: {},
        C1r: () => {
          if (!resuming) { suspending = true; stack.push("C1r child"); return; }
          assert.equal(stack.pop(), "C1r child");
          resuming = false;
          childConsumed = true;
          return {};
        },
      });
      vm.runInNewContext(extractGeneratedFunction(transformed.code, "G6r"), context);
      const minecraft = makeMinecraft({ O: null, t: null, hl: null, w: {} });
      fn({ cg: minecraft, bBl: true }, { bNP: 7 });
      assert.ok(stack.length > 1);
      context.SD_worldLifecycleReset(minecraft);
      if (scenario === "newer-player") {
        minecraft.O = {}; minecraft.t = { iv: 99 }; minecraft.hl = minecraft.t;
        markReady(context, minecraft);
      }
      suspending = false;
      resuming = true;
      fn();
      assert.equal(childConsumed, true);
      assert.equal(resuming, false);
      assert.equal(stack.length, 0);
      if (scenario === "absent-player") {
        assert.equal(minecraft.O, null);
        assert.equal(minecraft.t, null);
      } else assert.equal(minecraft.t.iv, 99);
    });
  }
});

test("loadWorld brackets publication and final player setup in one lifecycle transaction", () => {
  const oldWorld = { id: "old-world" };
  const newWorld = { id: "new-world" };
  const player = { id: "player", i_: null };
  const minecraft = makeMinecraft({
    O: oldWorld,
    BI: {},
    Dq: { bl6: null },
    Fi: {},
    HI: {},
    cI: {
      YU: {},
      a2I: { Gh: {} },
      dd: { Dl: { PC: {}, yL: {} } },
    },
    e7: { bpZ: {}, cgK: { bLw: {} } },
    fV: {},
    gj: null,
    hl: { id: "old-camera" },
    iW: null,
    t: player,
  });
  let publishedDuringJoin = false;
  let cameraAssignedBeforeCommit = false;
  let worldValue = oldWorld;
  let cameraValue = minecraft.hl;
  Object.defineProperty(minecraft, "O", {
    configurable: true,
    get: () => worldValue,
    set: (value) => {
      const state = context.SD_worldLifecycleGetState(minecraft, 0);
      publishedDuringJoin = value === newWorld && state?.phase === "JOINING";
      worldValue = value;
    },
  });
  Object.defineProperty(minecraft, "hl", {
    configurable: true,
    get: () => cameraValue,
    set: (value) => {
      if (value === player) {
        const state = context.SD_worldLifecycleGetState(minecraft, 0);
        cameraAssignedBeforeCommit = state?.phase === "JOINING";
      }
      cameraValue = value;
    },
  });

  const iterator = {
    E: () => false,
    R() {
      return this;
    },
  };
  const { context, fn: loadWorld } = evaluateGenerated("G6r", {
    AE4: () => undefined,
    AL9: () => undefined,
    AS5: () => undefined,
    BA: false,
    BVz: () => undefined,
    C1r: () => ({}),
    D1k: () => undefined,
    DPR: () => undefined,
    DV: () => undefined,
    Due: () => undefined,
    DvO: () => null,
    EKI: () => false,
    Eey: () => undefined,
    Ev: () => iterator,
    EZy: () => undefined,
    G6r: undefined,
    GDd: () => undefined,
    GdB: () => undefined,
    Ghq: () => undefined,
    Gxi: () => undefined,
    GN7: () => undefined,
    HFj: () => undefined,
    HOB: () => ({ id: "recipe-book" }),
    Ipr: {},
    Ipq: {},
    Ips: {},
    Ipt: {},
    Ipu: {},
    PO: () => undefined,
    Xx: () => undefined,
  });

  loadWorld(minecraft, newWorld);

  assert.equal(publishedDuringJoin, true);
  assert.equal(cameraAssignedBeforeCommit, true);
  assert.equal(context.SD_worldLifecycleReady(minecraft, "test.afterLoad"), 1);
  assert.equal(context.window.SelahWorldLifecycle.committedGeneration, 1);

  loadWorld(minecraft, null);
  const stateAfterReset = context.SD_worldLifecycleGetState(minecraft, 0);
  assert.equal(stateAfterReset.phase, "NO_WORLD");
  assert.equal(stateAfterReset.committedGeneration, 0);
  assert.equal(stateAfterReset.world, null);
});

test("displayGuiScreen closes a resource prompt without reading a JOINING player", async (t) => {
  class ScreenBase {}
  class Layout {
    constructor() {
      this.fX = 1912;
      this.e_ = 948;
      this.t7 = 1;
    }
  }
  class GameOverScreen {
    eY5() {}
  }

  function evaluateDisplayGuiScreen(health) {
    let healthReads = 0;
    const evaluated = evaluateGenerated("HjP", {
      AXT: GameOverScreen,
      BT: (screen) => screen,
      C5O: () => undefined,
      DcJ: () => undefined,
      Dh0: () => undefined,
      DSR: () => ({ bjd: {} }),
      ENv: () => undefined,
      ErO: () => false,
      EZZ: () => undefined,
      Fff: () => {
        healthReads += 1;
        if (health instanceof Error) throw health;
        return health;
      },
      FKe: () => undefined,
      GP: Layout,
      H5: (screen) => screen,
      T1: ScreenBase,
    });
    return { ...evaluated, getHealthReads: () => healthReads };
  }

  await t.test("JOINING prompt close skips getHealth", () => {
    const expectedCrash = new Error("getHealth reached with null player");
    const { context, fn: displayGuiScreen, getHealthReads } =
      evaluateDisplayGuiScreen(expectedCrash);
    const minecraft = makeMinecraft({
      b0: { lw: () => undefined },
      fV: {},
      hl: null,
      t: null,
    });
    beginLifecycle(context, minecraft);

    assert.doesNotThrow(() => displayGuiScreen(minecraft, null));
    assert.equal(getHealthReads(), 0);
    assert.equal(minecraft.b0, null);
  });

  await t.test("READY healthy player keeps the normal close path", () => {
    const { context, fn: displayGuiScreen, getHealthReads } =
      evaluateDisplayGuiScreen(20);
    const minecraft = makeMinecraft({
      b0: { lw: () => undefined },
      fV: {},
    });
    beginLifecycle(context, minecraft);
    assert.equal(commitLifecycle(context, minecraft), 1);

    displayGuiScreen(minecraft, null);
    assert.equal(getHealthReads(), 1);
    assert.equal(minecraft.b0, null);
  });

  await t.test("READY dead player still opens the game-over screen", () => {
    const { context, fn: displayGuiScreen, getHealthReads } =
      evaluateDisplayGuiScreen(0);
    const minecraft = makeMinecraft({
      b0: { lw: () => undefined },
      fV: {},
    });
    beginLifecycle(context, minecraft);
    assert.equal(commitLifecycle(context, minecraft), 1);

    displayGuiScreen(minecraft, null);
    assert.equal(getHealthReads(), 1);
    assert.equal(minecraft.b0 instanceof GameOverScreen, true);
  });
});

test("GUI mouse and keyboard callbacks cannot fall through into JOINING gameplay", async (t) => {
  for (const event of [{ pressed: false, wheel: 0 }, { pressed: true, wheel: 0 }, { pressed: false, wheel: 1 }]) {
  await t.test(`mouse callback closes the prompt (${JSON.stringify(event)})`, () => {
    let minecraft;
    let mouseEvents = 0;
    let screenCallbacks = 0;
    const { context, fn: runTickMouse } = evaluateGenerated("DEF", {
      Bfu: () => 100,
      BS: (value) => value,
      DdZ: () => undefined,
      Dx: () => true,
      FFy: () => 1_000,
      FjD: () => { throw new Error("spectator player read while JOINING"); },
      Iph: false,
      GC0: () => {
        mouseEvents += 1;
        return mouseEvents === 1;
      },
      P: (value) => value,
      YA: () => event.wheel,
      ZN: () => event.pressed,
    });
    const prompt = {
      oq: () => {
        screenCallbacks += 1;
        minecraft.b0 = null;
      },
    };
    minecraft = makeMinecraft({
      BU: 0,
      b0: prompt,
      bGu: 0,
      hl: null,
      t: null,
    });
    markJoining(context, minecraft);

    assert.doesNotThrow(() => runTickMouse(minecraft));
    assert.equal(screenCallbacks, 1);
    assert.equal(mouseEvents, 2, "remaining input is drained while joining");
  });
  }

  await t.test("keyboard callback closes the prompt before processKeyBinds", () => {
    let minecraft;
    let keyboardEvents = 0;
    let screenCallbacks = 0;
    const { context, fn: runTickKeyboard } = evaluateGenerated("GOh", {
      AHE: () => false,
      AHw: () => 30,
      BA: false,
      BBp: () => 0,
      BpR: () => false,
      CWE: () => undefined,
      DdZ: () => undefined,
      Dg: () => false,
      EcM: () => {
        throw new Error("processKeyBinds reached after prompt closed");
      },
      EKI: () => false,
      Gf: () => false,
      Gfq: () => {
        keyboardEvents += 1;
        return keyboardEvents === 1;
      },
      GSv: () => {
        screenCallbacks += 1;
        minecraft.b0 = null;
      },
      Io_: false,
    });
    minecraft = makeMinecraft({
      b0: { id: "resource-prompt" },
      hl: null,
      t: null,
    });
    markJoining(context, minecraft);

    assert.doesNotThrow(() => runTickKeyboard(minecraft));
    assert.equal(screenCallbacks, 1);
    assert.equal(keyboardEvents, 2, "remaining input is drained while joining");
  });
});

test("runTick processes modal screen input while deferring uncommitted world updates", () => {
  let screenEvents = 0;
  let screenUpdates = 0;
  const { context, fn } = evaluateGenerated("CYD", {
    ADn: class {}, AMc: () => ({}), Bcs: class {},
    DG1: () => {}, DEH: () => {}, DD3: () => {}, DJW: () => {},
    EX3: () => {}, Gwb: () => {}, GJO: () => {}, FfH: () => {},
    GuL: () => { screenEvents++; }, FFy: () => 2_000,
    Dmj: () => { throw new Error("uncommitted world update after modal screen"); },
  });
  const minecraft = makeMinecraft({
    cn: false, bwx: 0, cI: {}, e7: {}, p9: {}, bG: {}, t: null, hl: null,
    b0: { Bp: false, hU: () => { screenUpdates++; } },
  });
  markJoining(context, minecraft);
  fn(minecraft);
  assert.equal(screenEvents, 1);
  assert.equal(screenUpdates, 1);
  assert.equal(minecraft.bGu, 2_000);
});

test("input polling consumes saved TeaVM child frames when the world changes", async (t) => {
  for (const [name, poll] of [["DEF", "GC0"], ["GOh", "Gfq"]]) {
    await t.test(name, () => {
      const stack = [];
      let suspending = false;
      let resuming = false;
      let completed = false;
      const { context, fn } = evaluateGenerated(name, {
        B: () => suspending, Gt: () => resuming,
        DI: () => ({ s: (...args) => stack.push(...args), l: () => stack.pop() }),
        [poll]: () => {
          if (!resuming) {
            suspending = true;
            stack.push("poll-child");
            return;
          }
          assert.equal(stack.pop(), "poll-child");
          resuming = false;
          completed = true;
          return false;
        },
      });
      const minecraft = makeMinecraft({ b0: null });
      markReady(context, minecraft);
      fn(minecraft);
      assert.ok(stack.length > 1);
      markJoining(context, minecraft);
      minecraft.t = minecraft.hl = null;
      suspending = false;
      resuming = true;
      fn();
      assert.equal(completed, true);
      assert.equal(stack.length, 0);
    });
  }
});

test("a scroll event resumes safely when its player disappears during spectator lookup", () => {
  let minecraft;
  let calls = 0;
  let callbacks = 0;
  const { context, fn } = evaluateGenerated("DEF", {
    GC0: () => ++calls === 1, Bfu: () => 100, ZN: () => false,
    DdZ: () => {}, FFy: () => 1_000, Dx: () => true, BS: (v) => v, P: (v) => v,
    YA: () => 1, Iph: false,
    FjD: () => { minecraft.t = minecraft.hl = null; return false; },
  });
  minecraft = makeMinecraft({ b0: { oq: () => { callbacks++; } } });
  markReady(context, minecraft);
  fn(minecraft);
  assert.equal(callbacks, 1);
});

test("paused gameplay actions consume their child frames and stop after world replacement", async (t) => {
  for (const [name, leaf] of [["EcM", "G1_"], ["CtF", "FsC"], ["GLY", "A$B"], ["GVy", "GKs"], ["FP1", "FsC"], ["DQl", "GU9"], ["Dmj", "Dcf"]]) {
  for (const scenario of ["unload", "new-ready-world"]) {
    await t.test(`${name}: ${scenario}`, () => {
      const stack = [];
      let suspending = false;
      let resuming = false;
      let childCompleted = false;
      class Camera {}
      const blockHit = {};
      const { context, fn } = evaluateGenerated(name, {
        B: () => suspending, Gt: () => resuming,
        DI: () => ({ s: (...args) => stack.push(...args), l: () => stack.pop() }),
        [leaf]: () => {
          if (!resuming) { suspending = true; stack.push("click-child"); return; }
          assert.equal(stack.pop(), "click-child");
          resuming = false;
          childCompleted = true;
        },
        BA: false, D7: () => false, Io5: {},
        Ij: () => {}, Io1: blockHit, Ipv: {}, T_: Camera,
        CT: () => { throw new Error("stale click reached the replacement world"); },
        Gly: () => { throw new Error("stale controller reached network work"); },
      });
      const minecraft = makeMinecraft({ c9: { OF: false }, xi: 0, w: { cEf: {} },
        t: { bB: { ct: false }, Nk: false }, hl: new Camera(), fz: { ha: blockHit },
      });
      const receiver = name === "DQl" ? { fB: minecraft, hc: { m7: {} } } : name === "Dmj" ? { bD: minecraft } : minecraft;
      markReady(context, minecraft);
      fn(receiver, true);
      context.SD_worldLifecycleReset(minecraft);
      minecraft.O = minecraft.t = minecraft.hl = minecraft.c9 = null;
      if (scenario === "new-ready-world") {
        minecraft.O = {}; minecraft.t = {}; minecraft.hl = minecraft.t;
        minecraft.c9 = { OF: false };
        markReady(context, minecraft);
      }
      suspending = false;
      resuming = true;
      fn();
      assert.equal(childCompleted, true);
      assert.equal(stack.length, 0);
    });
  }
  }
});

test("direct gameplay input entry points reject an uncommitted world", async (t) => {
  const fixtures = [
    {
      additions: {
        G1_: () => {
          throw new Error("processKeyBinds body reached");
        },
      },
      args: (minecraft) => [minecraft],
      minecraft: () => makeMinecraft({ hl: null, t: null, w: { cEf: {} } }),
      name: "EcM",
    },
    {
      additions: {
        FsC: () => {
          throw new Error("clickMouse body reached");
        },
      },
      args: (minecraft) => [minecraft],
      minecraft: () => makeMinecraft({ hl: null, t: null, xi: 0 }),
      name: "CtF",
    },
    {
      additions: {
        "A$B": () => {
          throw new Error("rightClickMouse body reached");
        },
      },
      args: (minecraft) => [minecraft],
      minecraft: () => makeMinecraft({ hl: null, t: null }),
      name: "GLY",
    },
    {
      additions: {
        Ij: () => {
          throw new Error("middleClickMouse body reached");
        },
      },
      args: (minecraft) => [minecraft],
      minecraft: () =>
        makeMinecraft({ fz: { ha: {} }, hl: null, t: null }),
      name: "GVy",
    },
    {
      additions: {},
      args: (minecraft) => [minecraft, false],
      minecraft: () => makeMinecraft({ hl: null, t: null, xi: 0 }),
      name: "FP1",
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      const { context, fn } = evaluateGenerated(fixture.name, fixture.additions);
      const minecraft = fixture.minecraft();
      markJoining(context, minecraft);

      assert.doesNotThrow(() => fn(...fixture.args(minecraft)));
    });
  }
});

test("committed gameplay input retains the original right-click path", () => {
  let rightClickCalls = 0;
  const { context, fn: rightClickMouse } = evaluateGenerated("GLY", {
    "A$B": () => {
      rightClickCalls += 1;
    },
    BA: false,
    D7: () => false,
    Io5: {},
  });
  const minecraft = makeMinecraft({ c9: { OF: true } });
  markReady(context, minecraft);

  rightClickMouse(minecraft);
  assert.equal(rightClickCalls, 1);
});

test("render-world dispatcher blocks JOINING and preserves both READY branches", () => {
  for (const deferred of [false, true]) {
    const calls = [];
    const { context, fn: renderWorld } = evaluateGenerated("FRN", {
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
    const joining = markJoining(
      context,
      makeMinecraft({ hl: null, t: null }),
    );

    assert.doesNotThrow(() => renderWorld({ bD: joining }, 0, 0));
    assert.deepEqual(calls, []);

    const ready = markReady(context, makeMinecraft());
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
      const { context, fn } = evaluateGenerated(fixture.name, fixture.additions);
      const joining = markJoining(
        context,
        makeMinecraft({ hl: null, t: null }),
      );

      assert.doesNotThrow(() => fn(...fixture.args(joining)));
    });
  }
});

test("fog rechecks lifecycle after TeaVM camera lookup", () => {
  const minecraft = makeMinecraft();
  let lookups = 0;
  const { context, fn: updateFogColor } = evaluateGenerated("G1D", {
    HbQ: (mc) => {
      lookups += 1;
      mc.t = null;
      mc.hl = null;
      return null;
    },
  });
  markReady(context, minecraft);

  assert.doesNotThrow(() => updateFogColor({ bD: minecraft }, 0));
  assert.equal(lookups, 1);
});

test("world pass rechecks lifecycle after fog work", () => {
  const minecraft = makeMinecraft();
  const { context, fn: renderWorldPass } = evaluateGenerated("CIX", {
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
  markReady(context, minecraft);

  assert.doesNotThrow(() => renderWorldPass({ bD: minecraft }, 0, 0, 0));
});

test("world pass rechecks lifecycle before player and camera dereferences", async (t) => {
  await t.test("player after terrain setup", () => {
    const minecraft = makeMinecraft();
    const { context, fn: renderWorldPass } = evaluateGenerated("CIX", {
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
    markReady(context, minecraft);

    assert.doesNotThrow(() => renderWorldPass({ bD: minecraft }, 0, 0, 0));
  });

  await t.test("camera after lookup", () => {
    const minecraft = makeMinecraft();
    const { context, fn: renderWorldPass } = evaluateGenerated("CIX", {
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
    markReady(context, minecraft);

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
      const { context, fn } = evaluateGenerated(fixture.name, additions);
      markReady(context, minecraft);

      assert.doesNotThrow(() => fn({ bD: minecraft }, 0, 0));
    });
  }
});

test("camera updater rechecks lifecycle after camera-specific suspension", () => {
  class Camera {}
  const camera = new Camera();
  const minecraft = makeMinecraft({ hl: camera });
  const { context, fn: updateRenderer } = evaluateGenerated("Dmj", {
    Dcf: () => {
      minecraft.t = null;
      minecraft.hl = null;
      return 1;
    },
    Dm: () => 0.5,
    T_: Camera,
  });
  markReady(context, minecraft);

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
  const { context, fn: runTick } = evaluateGenerated("CYD", {
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
  markJoining(context, minecraft);

  assert.doesNotThrow(() => runTick(minecraft));
  assert.equal(resourcePrompt.ticks, 1);
  assert.equal(minecraft.bGu, 1_234);
});

test("PlayerControllerMP.updateController blocks all controller work while JOINING", () => {
  const controller = {
    fB: makeMinecraft({ hl: null, t: null }),
    hc: { m7: {} },
  };
  const { context, fn: updateController } = evaluateGenerated("DQl", {
    GU9: () => undefined,
    Gly: () => {
      throw new Error("network controller work reached with no player");
    },
  });
  markJoining(context, controller.fB);

  assert.doesNotThrow(() => updateController(controller));
});

test("syncCurrentPlayItem blocks a null player and still synchronizes a READY player", () => {
  class HeldItemChangePacket {}

  const sentPackets = [];
  const { context, fn: syncCurrentPlayItem } = evaluateGenerated("GU9", {
    "A$H": HeldItemChangePacket,
    F1l: (connection, packet) => sentPackets.push({ connection, packet }),
  });
  const joiningController = {
    d3k: 0,
    fB: makeMinecraft({ hl: null, t: null }),
    hc: { id: "joining-connection" },
  };
  markJoining(context, joiningController.fB);

  assert.doesNotThrow(() => syncCurrentPlayItem(joiningController));
  assert.equal(joiningController.d3k, 0);
  assert.deepEqual(sentPackets, []);

  const readyConnection = { id: "ready-connection" };
  const readyController = {
    d3k: 2,
    fB: makeMinecraft({ t: { bv: { g4: 5 } } }),
    hc: readyConnection,
  };
  markReady(context, readyController.fB);
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
    "loadWorldTransaction",
    "displayGuiScreen",
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
  assert.equal(transformed.replacements.loadWorldTransaction, 5);
  assert.equal(transformed.replacements.loadWorldResume, 38);
  assert.equal(transformed.replacements.loadWorldCompletion, 2);
  assert.equal(transformed.replacements.loadWorldCallers, 13);
  for (const [name, count] of Object.entries({ processKeyBinds: 50, clickMouse: 16,
    rightClickMouse: 25, middleClickMouse: 61, sendClickBlockToController: 10,
    "playerController.updateController": 47, updateRenderer: 17 })) {
    assert.equal(transformed.replacements[`${name}Continuations`], count);
  }
  assert.equal(transformed.replacements.displayGuiScreen, 3);
  assert.equal(transformed.replacements.runTickModalScreen, 13);
  assert.equal(transformed.replacements.runTickMouse, 4);
  assert.equal(transformed.replacements.runTickMouseResume, 4);
  assert.equal(transformed.replacements.runTickKeyboard, 2);
  assert.equal(transformed.replacements.deferredRenderChunkBaseFields, 2);
  assert.equal(transformed.replacements.integratedServerSettingsGuards, 3);
});
