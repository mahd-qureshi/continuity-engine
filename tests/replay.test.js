import test from "node:test";
import assert from "node:assert/strict";

import { advanceStory, runChoices, startScenario, stateFingerprint } from "../src/engine.js";
import {
  decodeShareCode,
  encodeShareCode,
  exportReplay,
  importReplay,
} from "../src/replay.js";
import { orbitalRelay } from "../src/scenario.js";

const PLAYED = ["tell-truth", "reassure"];

function playedState() {
  return runChoices(orbitalRelay, PLAYED).state;
}

test("a replay round-trips to an identical state", () => {
  const original = playedState();
  const { state, warnings } = importReplay(orbitalRelay, exportReplay(orbitalRelay, original));

  assert.deepEqual(warnings, []);
  assert.equal(stateFingerprint(state), stateFingerprint(original));
});

test("an empty playthrough round-trips", () => {
  const start = startScenario(orbitalRelay);
  const { state } = importReplay(orbitalRelay, exportReplay(orbitalRelay, start));

  assert.equal(stateFingerprint(state), stateFingerprint(start));
});

test("a replay from another scenario is refused", () => {
  const file = exportReplay(orbitalRelay, playedState());
  file.scenarioId = "some-other-story";

  assert.throws(() => importReplay(orbitalRelay, file), /belongs to scenario/);
});

test("an unknown format or version is refused", () => {
  const file = exportReplay(orbitalRelay, playedState());

  assert.throws(() => importReplay(orbitalRelay, { ...file, format: "nope" }), /format/);
  assert.throws(() => importReplay(orbitalRelay, { ...file, version: 99 }), /version/);
});

test("a tampered event list is rejected by the engine, not by a second validator", () => {
  const file = exportReplay(orbitalRelay, playedState());
  file.events[0].sourceId = "not-a-real-choice";

  assert.throws(() => importReplay(orbitalRelay, file), /Unknown choice event source/);
});

test("a mismatched fingerprint warns without refusing the events", () => {
  const file = exportReplay(orbitalRelay, playedState());
  file.fingerprint = "deadbeef";

  const { state, warnings } = importReplay(orbitalRelay, file);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /engine's behaviour/);
  // The events were valid, so a state still comes back.
  assert.ok(state.events.length > 0);
});

test("a share code carries only choices and still rebuilds the whole state", () => {
  const original = playedState();
  const code = encodeShareCode(original);

  // The state contains beats too, but the code should not mention them.
  assert.ok(original.events.some((event) => event.type === "beat"));

  const rebuilt = decodeShareCode(orbitalRelay, code, advanceStory);

  assert.equal(stateFingerprint(rebuilt), stateFingerprint(original));
});

test("a share code is dramatically smaller than the full replay", () => {
  const original = playedState();
  const full = JSON.stringify(exportReplay(orbitalRelay, original)).length;
  const code = encodeShareCode(original).length;

  assert.ok(code * 4 < full, `share code ${code} was not much smaller than ${full}`);
});

test("an empty share code starts a fresh story", () => {
  const state = decodeShareCode(orbitalRelay, "", advanceStory);

  assert.equal(state.step, 0);
  assert.deepEqual(state.events, []);
});

test("a hand-edited share code cannot reach an unreachable state", () => {
  const forged = Buffer.from("tell-truth,tell-truth", "utf8").toString("base64url");

  // tell-truth is oneShot, so replaying it twice is not a state any real
  // playthrough could produce.
  assert.throws(() => decodeShareCode(orbitalRelay, forged, advanceStory), /ineligible/);
});

test("an unknown choice in a share code is refused", () => {
  const forged = Buffer.from("no-such-choice", "utf8").toString("base64url");

  assert.throws(() => decodeShareCode(orbitalRelay, forged, advanceStory), /Unknown choice/);
});
