import assert from "node:assert/strict";
import test from "node:test";

import { extractGeneratedFunction } from "./helpers/extract-generated-function.mjs";

test("extracts one generated function while ignoring braces in strings and comments", () => {
  const source = [
    "function Before(){}",
    "function Target(a){var x='}';/* { ignored } */return {value:a};}",
    "function After(){}",
  ].join("\n");

  assert.equal(
    extractGeneratedFunction(source, "Target"),
    "function Target(a){var x='}';/* { ignored } */return {value:a};}",
  );
});

test("rejects a missing or duplicated generated function", () => {
  assert.throws(
    () => extractGeneratedFunction("function Present(){}", "Missing"),
    /generated function Missing: expected 1, found 0/,
  );
  assert.throws(
    () =>
      extractGeneratedFunction(
        "function Target(){}\nfunction Target(a){}",
        "Target",
      ),
    /generated function Target: expected 1, found 2/,
  );
});
