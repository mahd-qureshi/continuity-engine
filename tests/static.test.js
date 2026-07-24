import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("browser entrypoint is local and dependency-free", () => {
  assert.match(index, /<script type="module" src="\.\/src\/app\.js">/);
  assert.doesNotMatch(index, /(?:src|href)="https?:\/\//);
});

test("interactive controls expose accessible names", () => {
  assert.match(index, /aria-label="Trust"/);
  assert.match(index, /aria-label="Tension"/);
  assert.match(index, /id="reset-button"/);
  assert.match(app, /button\.setAttribute\("aria-label"/);
});

test("keyboard reset and reduced-motion behavior stay present", () => {
  assert.match(app, /event\.key\.toLowerCase\(\) === "r"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("one-time choices are disabled by engine eligibility", () => {
  assert.match(app, /evaluateChoiceEligibility\(state, choice\)/);
  assert.match(app, /button\.disabled = finished \|\| !eligibility\.eligible/);
});
