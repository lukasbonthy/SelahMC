import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import * as packageRelease from "../tools/package-release.mjs";

test("release rewrites one pinned Selah client script from a newer live index", () => {
  const index = [
    "<html><body>",
    '<script src="selahmc-client-v8.3.5.js?v=ac271df3"></script>',
    "</body></html>",
  ].join("\n");

  assert.equal(typeof packageRelease.rewriteClientScript, "function");
  assert.equal(
    packageRelease.rewriteClientScript(
      index,
      "5bd2a230cbb0313c862e753dc57b80fe",
    ),
    [
      "<html><body>",
      '<script>window.eaglercraftXClientScriptURL=new URL("selahmc-client-v8.3.8.js?v=5bd2a230",document.baseURI).href;</script>',
      '<script src="selahmc-client-v8.3.8.js?v=5bd2a230"></script>',
      "</body></html>",
    ].join("\n"),
  );
});

test("release refuses an index with ambiguous Selah client scripts", () => {
  const script = '<script src="selahmc-client-v8.3.5.js?v=ac271df3"></script>';

  assert.equal(typeof packageRelease.rewriteClientScript, "function");
  assert.throws(
    () =>
      packageRelease.rewriteClientScript(
        `${script}\n${script}`,
        "5bd2a230",
      ),
    /index client script: expected 1, found 2/,
  );
});

test("release hash-pins exactly one repaired OptiFine bridge script", () => {
  const index = '<script src="selah-optifine-bridge-v8.3.3.js"></script>';

  assert.equal(
    packageRelease.rewriteOptiFineBridgeScript(
      index,
      "43daa2d91bd9927b736543cd418766c3",
    ),
    '<script src="selah-optifine-bridge-v8.3.3.js?v=43daa2d9"></script>',
  );
  assert.throws(
    () => packageRelease.rewriteOptiFineBridgeScript(`${index}\n${index}`, "43daa2d9"),
    /OptiFine bridge script: expected 1, found 2/,
  );
});


test("release worker URL points to the exact local client including its hash", () => {
 const html = packageRelease.rewriteClientScript('<script src="selahmc-client-v8.3.5.js?v=abcd"></script>', "1234567890abcdef");
 const initializer = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
 assert.ok(initializer, "worker source must be pinned before client execution");
 const window = { eaglercraftXClientScriptURL: "https://selahmc.me/client/selahmc-client-v8.3.5.js" };
 vm.runInNewContext(initializer, {window, URL, document: {baseURI: "http://127.0.0.1:3002/"}});
 const client = html.match(/src="([^"]+)"/u)[1];
 assert.equal(window.eaglercraftXClientScriptURL, new URL(client, "http://127.0.0.1:3002/").href);
});
