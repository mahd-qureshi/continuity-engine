import test from "node:test";
import assert from "node:assert/strict";
import {
  choose,
  createStory,
  deserialize,
  getEnding,
  getScene,
  replay,
  rewind,
  serialize,
} from "../src/continuity.js";
import { character, story } from "../src/story.js";

function allStates(state = createStory()) {
  return [
    state,
    ...getScene(state).choices.flatMap((choice) =>
      allStates(choose(state, choice.id)),
    ),
  ];
}

const states = allStates();
const completed = states.filter((state) => state.finished);

function assertDeepFrozen(value) {
  if (value && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertDeepFrozen);
  }
}

test("a character and existing history precede the first decision", () => {
  const state = createStory();
  assert.equal(character.name, "Mara");
  assert.equal(character.age, 24);
  assert.equal(story.totalSteps, 5);
  assert.equal(state.version, 1);
  assert.deepEqual(state.choices, []);
  assert.deepEqual(state.events, []);
  assert.equal(state.memories.length, 2);
  assert.equal(state.finished, false);
  assert.equal(getEnding(state), null);
  assert.equal(getScene(state).chapter, 1);
  assert.equal(getScene(state).memory.sourceStep, 0);
});

test("all 189 reachable paths end after exactly five legal decisions", () => {
  assert.equal(completed.length, 189);
  assert.equal(new Set(completed.map((state) => getEnding(state).id)).size, 7);
  for (const state of states) {
    const scene = getScene(state);
    assert.equal(state.events.length, state.choices.length);
    assert.equal(state.memories.length, state.choices.length + 2);
    assert.equal(state.finished, state.choices.length === 5);
    assert.equal(
      new Set(scene.choices.map((choice) => choice.id)).size,
      scene.choices.length,
    );
    for (const value of Object.values(state.traits)) {
      assert.equal(Number.isFinite(value), true);
      assert.ok(value >= 0 && value <= 100);
    }
    if (state.finished) {
      assert.deepEqual(scene.choices, []);
      const ending = getEnding(state);
      assert.ok(
        ending.title && ending.summary && ending.paragraphs.length >= 3,
      );
      assert.equal(ending.callbacks.length, 6);
      for (const callback of ending.callbacks) {
        assert.ok(
          state.memories.some(
            (memory) =>
              memory.text === callback.text &&
              memory.sourceStep === callback.sourceStep,
          ),
        );
      }
    } else {
      assert.equal(scene.chapter, state.choices.length + 1);
      assert.ok(scene.choices.length >= 2 && scene.choices.length <= 3);
      assert.ok(scene.paragraphs.length >= 3);
      assert.equal(getEnding(state), null);
      if (scene.memory)
        assert.ok(
          state.memories.some(
            (memory) =>
              memory.text === scene.memory.text &&
              memory.sourceStep === scene.memory.sourceStep,
          ),
        );
      for (const choice of scene.choices)
        assert.ok(choice.id && choice.label && choice.description);
    }
    state.events.forEach((event, index) => {
      assert.equal(event.step, index + 1);
      assert.equal(event.choiceId, state.choices[index]);
      assert.ok(event.label && event.consequence && event.memory);
      assert.ok(
        event.changes.length > 0 &&
          event.changes.every(
            (change) => typeof change === "string" && change.length > 0,
          ),
      );
      assert.ok(
        state.memories.some(
          (memory) =>
            memory.sourceStep === event.step && memory.text === event.memory,
        ),
      );
    });
  }
});

test("the first decision changes the physical scene and the final goodbye", () => {
  const meetings = ["meet", "call", "later"].map((reply) =>
    getScene(replay([reply])),
  );
  assert.equal(new Set(meetings.map((scene) => scene.paragraphs[0])).size, 3);
  assert.match(meetings[0].paragraphs[0], /café/);
  assert.match(meetings[1].paragraphs[0], /ring/);
  assert.match(meetings[2].paragraphs[0], /vibrates/);
  const endings = ["meet", "call", "later"].map((reply) =>
    getEnding(replay([reply, "name-hurt", "send-photos", "sunday", "board"])),
  );
  assert.equal(new Set(endings.map((ending) => ending.paragraphs[1])).size, 3);
});

test("naming, accepting, or postponing the apology persists into later prose", () => {
  const apologies = ["name-hurt", "accept", "not-now"];
  const nextScenes = apologies.map((id) => getScene(replay(["call", id])));
  assert.equal(new Set(nextScenes.map((scene) => scene.paragraphs[0])).size, 3);
  const laterScenes = apologies.map((id) =>
    getScene(replay(["call", id, "his-job"])),
  );
  assert.equal(
    new Set(laterScenes.map((scene) => scene.paragraphs[1])).size,
    3,
  );
  for (let index = 0; index < apologies.length; index += 1) {
    const state = replay(["call", apologies[index], "his-job"]);
    assert.equal(getScene(state).memory.text, state.events[1].memory);
    assert.equal(getScene(state).memory.sourceStep, 2);
  }
});

test("a conversation begun by message stays in messages, and Eli cannot search the flat from the station", () => {
  const textOption = getScene(createStory()).choices.find(
    (choice) => choice.id === "later",
  );
  assert.equal(textOption.label, "We can text.");
  assert.match(textOption.description, /messages/);
  const firstText = replay(["later"]);
  assert.match(firstText.events[0].memory, /agreed to talk by text/);
  assert.match(getScene(firstText).paragraphs[0], /Text is fine/);
  assert.doesNotMatch(
    JSON.stringify(firstText.events[0]),
    /another day|Not tonight/,
  );
  for (const state of states.filter((item) => item.choices[0] === "later")) {
    const sceneText = getScene(state).paragraphs.join(" ");
    const eventText = state.events.map((event) => event.consequence).join(" ");
    const endingText = getEnding(state)?.paragraphs.join(" ") ?? "";
    assert.doesNotMatch(
      `${sceneText} ${eventText} ${endingText}`,
      /\bhe says\b|\bEli says\b|\bShe says\b|\bshe says\b|\bcall ends\b|\bsecond ring\b/,
    );
  }
  const atStation = getScene(replay(["meet", "accept", "his-job"]));
  assert.match(atStation.paragraphs[0], /when he gets home/);
});

test("finishing the email is available only when a draft actually exists", () => {
  for (const state of states.filter((item) => item.choices.length === 4)) {
    const options = getScene(state).choices.map((choice) => choice.id);
    assert.equal(
      options.includes("finish-email"),
      state.choices[2] === "write-together",
    );
    if (state.choices[2] !== "write-together")
      assert.throws(() => choose(state, "finish-email"), /not available/);
  }
  const draft = replay(["meet", "accept", "write-together", "sunday"]);
  assert.notEqual(
    getEnding(choose(draft, "board")).id,
    getEnding(choose(draft, "finish-email")).id,
  );
  assert.match(
    choose(draft, "board").events.at(-1).consequence,
    /half-written/,
  );
});

test("concrete responsibility and contact arrangements produce distinct endings", () => {
  const ending = (help, promise) =>
    getEnding(replay(["call", "accept", help, promise, "board"]));
  assert.equal(ending("send-photos", "space").id, "in-his-hands");
  assert.equal(ending("write-together", "space").id, "unfinished");
  assert.equal(ending("his-job", "sunday").id, "sunday");
  assert.equal(ending("his-job", "arrival").id, "arrival");
  assert.equal(ending("his-job", "space").id, "room");
  assert.match(
    ending("send-photos", "sunday").paragraphs.at(-1),
    /Sunday at six/,
  );
  assert.match(
    ending("send-photos", "arrival").paragraphs.at(-1),
    /message she promised/,
  );
  assert.match(
    ending("send-photos", "space").paragraphs.at(-1),
    /no next call/,
  );
});

test("every path can leave; postponement always requires an explicit choice", () => {
  for (const state of states.filter((item) => item.choices.length === 4)) {
    assert.ok(getScene(state).choices.some((choice) => choice.id === "board"));
    assert.notEqual(getEnding(choose(state, "board")).id, "tomorrow");
    const delayed = choose(state, "stay");
    assert.equal(getEnding(delayed).id, "tomorrow");
    assert.match(delayed.events.at(-1).changes.join(" "), /Mara’s choice/);
    assert.match(getEnding(delayed).paragraphs[0], /not been told yes/);
  }
});

test("states, nested events, scenes, endings, and source metadata are immutable", () => {
  const before = createStory();
  const snapshot = JSON.stringify(before);
  const after = choose(before, "meet");
  assert.equal(JSON.stringify(before), snapshot);
  assert.notStrictEqual(before, after);
  assert.throws(() => after.choices.push("call"), TypeError);
  assert.throws(() => after.events[0].changes.push("forged"), TypeError);
  for (const state of states) {
    assertDeepFrozen(state);
    assertDeepFrozen(getScene(state));
    assertDeepFrozen(getEnding(state));
  }
  assertDeepFrozen(character);
  assertDeepFrozen(story);
});

test("replay reconstructs every event, memory, trait, and ending deterministically", () => {
  for (const state of states) {
    assert.deepEqual(replay(state.choices), state);
    assert.deepEqual(getEnding(replay(state.choices)), getEnding(state));
    assert.deepEqual(deserialize(serialize(state)), state);
    assert.match(serialize(state), /^[a-z0-9.-]+$/);
    assert.ok(serialize(state).length <= 160);
  }
});

test("rewind retains exactly the requested decisions and supports a real branch", () => {
  const original = replay([
    "meet",
    "name-hurt",
    "write-together",
    "space",
    "finish-email",
  ]);
  for (let count = 0; count <= 5; count += 1)
    assert.deepEqual(
      rewind(original, count),
      replay(original.choices.slice(0, count)),
    );
  const branch = choose(rewind(original, 2), "send-photos");
  assert.equal(
    branch.memories.some((memory) => /began writing/.test(memory.text)),
    false,
  );
  assert.equal(original.choices[2], "write-together");
  assert.deepEqual(branch.choices, ["meet", "name-hurt", "send-photos"]);
  for (const count of [-1, 6, 0.5, NaN, Infinity, "2", undefined])
    assert.throws(() => rewind(original, count), /Rewind count/);
});

test("malformed, unknown, out-of-order, and overlong choices fail closed", () => {
  for (const id of [
    "board",
    "__proto__",
    "constructor",
    "",
    null,
    1,
    {},
    "meet.call",
    "MEET",
    "a".repeat(1000),
  ])
    assert.throws(() => choose(createStory(), id));
  assert.throws(() => choose(replay(["meet"]), "meet"), /not available/);
  assert.throws(() => choose(completed[0], "board"), /complete/);
  for (const sequence of [
    null,
    {},
    "meet",
    ["meet", "accept", "his-job", "space", "board", "board"],
    [undefined],
  ])
    assert.throws(() => replay(sequence));
  for (const state of [
    null,
    {},
    { version: 2, choices: [] },
    { version: 1, choices: ["board"] },
  ]) {
    assert.throws(() => choose(state, "meet"));
    assert.throws(() => getScene(state));
    assert.throws(() => getEnding(state));
    assert.throws(() => serialize(state));
  }
});

test("share links are bounded, versioned, canonical histories, never supplied prose", () => {
  assert.equal(serialize(createStory()), "v1");
  assert.equal(serialize(replay(["meet", "accept"])), "v1.meet.accept");
  for (const code of [
    null,
    {},
    "",
    "v2.meet",
    "v01.meet",
    "v1.",
    "v1..meet",
    "v1.MEET",
    "v1.board",
    "v1.meet.meet",
    "v1.meet.accept.his-job.space.finish-email",
    "v1.meet.accept.his-job.space.board.stay",
    "v1.%6deet",
    "v1.meet\n",
    "v1.<script>",
    "v1." + "a".repeat(200),
  ])
    assert.throws(() => deserialize(code));
  const forged = {
    ...createStory(),
    traits: { resolve: 0, openness: 0 },
    memories: [{ text: "untrusted" }],
    finished: true,
    events: [{ consequence: "untrusted" }],
  };
  assert.deepEqual(choose(forged, "meet"), choose(createStory(), "meet"));
  assert.equal(serialize(forged), "v1");
});
