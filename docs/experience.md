# Before the last train

Continuity Engine starts with one person and one decision. Mara, a
24-year-old restoration apprentice, is about to leave town. An apology from
Eli and a request for help writing to their landlord complicate the departure.
Across five decisions, the reader determines what responsibility and contact
she chooses to keep.

## Reading and choosing

The screen presents the current scene, a small number of choices, and access
to the path already taken. Each choice moves the story forward. Earlier
decisions affect later prose, which choices are available, and the ending.

The writing is authored in `src/story.js`. Conditions connect that writing
to accumulated story state. A memory refers to a recorded choice; it is not
a generated summary. Resolve and openness describe Mara's response; they do
not lock her out of leaving.

The experience is deliberately small. Five decisions make it possible to
finish a path, remember why it unfolded that way, and try another.

## State and replay

`src/continuity.js` owns the deterministic story model:

| Function | Behavior |
| --- | --- |
| `createStory()` | Start a new story state. |
| `choose(state, id)` | Record an available choice and derive the next state. |
| `rewind(state, count)` | Keep the first `count` decisions and replay them. |
| `replay(choiceIds)` | Validate and reconstruct a choice sequence. |
| `getScene(state)` | Read the current scene and available choices. |
| `getEnding(state)` | Read the ending selected by a completed path. |
| `serialize(state)` / `deserialize(code)` | Encode and validate a shareable path. |

States and choice events are immutable. A choice must belong to its current
scene and meet that scene's conditions. Unknown choices and impossible
sequences are rejected.

The browser adapter in `src/app.js` renders the story and handles persistence
and sharing. The core does not need the DOM, browser storage, a server, or a
language-model API.

This separation makes continuity reproducible: the same valid choices produce
the same state, available actions, remembered details, and ending.

## Trying another path

Rewinding returns to an earlier decision with only its preceding history.
Choosing again replaces the later path. Consequences of discarded choices
must not survive into the new path.

Saved sessions let a reader continue in the same browser. A shared link
contains a versioned choice sequence (`v1.<choice-id>.<choice-id>`) rather
than arbitrary mutable story state. Loading it validates and replays at most
five choices through the same rules used during normal play. Storage is local
to the current browser and may be unavailable or cleared by the reader.

## What to verify

- Identical valid choice histories reconstruct identical state.
- Every displayed option can be accepted; unavailable choices cannot be forced.
- Earlier decisions produce the intended differences in prose and endings.
- Rewinding removes later consequences and permits a different continuation.
- Shared and saved paths are checked before they are used.
- Every valid complete path reaches an ending after five decisions.

The browser experience should also be checked at narrow and wide viewports,
with keyboard navigation, reduced motion, and unavailable browser storage.

## Relationship to the original project

The original orbital-relay engine remains available as source and tests. Its
memory scoring, emotional state, and beam-search planner are separate
experiments documented in [algorithms.md](algorithms.md) and
[architecture.md](architecture.md). They are not presented as mechanisms of
the Mara story.

The current demo makes one narrower claim: an authored story can carry the
reader's decisions forward in a visible, repeatable way.
