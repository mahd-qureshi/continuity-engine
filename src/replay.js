//
//  replay.js — export and import a playthrough.
//
//  The engine's core claim is that the same events always produce the same
//  state. This module is that claim made operational: if it is true, a
//  playthrough does not need to be saved — only the choices do, because
//  everything else is recomputed.
//
//  So there are two formats, and the difference between them is the point:
//
//    Replay file  — every event, plus a fingerprint of the final state. Full
//                   fidelity, and it detects drift: if a later version of the
//                   engine replays these events to a different state, the
//                   fingerprint no longer matches and the file says so.
//    Share code   — the choice ids alone. Beats, memories, and affect are all
//                   derived, so a whole playthrough compresses to a few bytes
//                   in a URL. This only works because the engine is
//                   deterministic; it is the property, used.
//

import { replayEvents, startScenario, stateFingerprint } from "./engine.js";

const FORMAT = "continuity-replay";
const VERSION = 1;

/** A full replay file: every event, with an integrity fingerprint. */
export function exportReplay(scenario, state) {
  if (!Array.isArray(state?.events)) {
    throw new Error("Cannot export a state without an event history.");
  }

  return {
    format: FORMAT,
    version: VERSION,
    scenarioId: scenario.id,
    events: state.events.map((event) => ({
      type: event.type,
      sourceId: event.sourceId,
      step: event.step,
      elapsedTime: event.elapsedTime,
    })),
    fingerprint: stateFingerprint(state),
  };
}

/**
 * Rebuild a state from a replay file.
 *
 * Event validity is not re-implemented here: `replayEvents` already rejects
 * bad chronology and ineligible sources, so importing simply replays and lets
 * the engine be the authority.
 */
export function importReplay(scenario, file) {
  if (file === null || typeof file !== "object") {
    throw new Error("Replay must be an object.");
  }

  if (file.format !== FORMAT) {
    throw new Error(`Unrecognised replay format: ${String(file.format)}`);
  }

  if (file.version !== VERSION) {
    throw new Error(`Unsupported replay version ${String(file.version)}; expected ${VERSION}.`);
  }

  if (file.scenarioId !== scenario.id) {
    throw new Error(
      `Replay belongs to scenario "${String(file.scenarioId)}", not "${scenario.id}".`,
    );
  }

  const state = replayEvents(scenario, file.events ?? []);
  const warnings = [];

  // A mismatch means the file is fine but the engine has changed underneath
  // it — worth surfacing loudly, and not the same thing as a corrupt file.
  if (file.fingerprint !== undefined && file.fingerprint !== stateFingerprint(state)) {
    warnings.push(
      "Replayed state does not match the fingerprint recorded with this file. "
        + "The events are valid, so the engine's behaviour has most likely changed since it was saved.",
    );
  }

  return { state, warnings };
}

// ---------------------------------------------------------------------------
// Share codes
// ---------------------------------------------------------------------------

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  const binary = String.fromCharCode(...bytes);
  const base64 = typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(text, "utf8").toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code) {
  const base64 = code.replace(/-/g, "+").replace(/_/g, "/");

  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * The choice ids alone, base64url encoded.
 *
 * Beats are chosen by the planner from the state the choices produced, so
 * recording them would be storing a value that is already implied.
 */
export function encodeShareCode(state) {
  const choiceIds = (state.events ?? [])
    .filter((event) => event.type === "choice")
    .map((event) => event.sourceId);

  return toBase64Url(choiceIds.join(","));
}

/**
 * Rebuild a full state from a share code by re-running the choices.
 *
 * Ineligible or unknown choices throw, so a hand-edited URL cannot drive the
 * engine into a state a real playthrough could not reach.
 */
export function decodeShareCode(scenario, code, advance) {
  if (typeof code !== "string" || code.trim() === "") {
    return startScenario(scenario);
  }

  let decoded;
  try {
    decoded = fromBase64Url(code.trim());
  } catch {
    throw new Error("Share code is not valid base64url.");
  }

  const choiceIds = decoded.split(",").filter((id) => id !== "");
  let state = startScenario(scenario);

  for (const choiceId of choiceIds) {
    state = advance(scenario, state, choiceId).nextState;
  }

  return state;
}
