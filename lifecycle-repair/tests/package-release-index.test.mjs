import assert from "node:assert/strict";
import test from "node:test";

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
      '<script src="selahmc-client-v8.3.6.js?v=5bd2a230"></script>',
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
