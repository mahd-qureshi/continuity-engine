//
//  validate.js — scenario validation at the boundary.
//
//  The engine assumes its scenario is well-formed and says so by throwing deep
//  inside a replay when it is not. That is the right behaviour for a hot path
//  and the wrong behaviour for an author, who wants every problem at once and
//  wants it before the story runs.
//
//  This module is the boundary check. It never throws for content problems; it
//  returns diagnostics, so a caller can decide whether a warning is fatal.
//
//  Two classes of check live here:
//
//    Structural — types, ranges, duplicate ids, unknown metrics. Exact.
//    Reachability — can this beat ever fire? Approximate, and deliberately so;
//                   see `reachableBounds` for what the approximation promises.
//

import { METRIC_RANGES, DEFAULT_MEMORY_WEIGHTS } from "./engine.js";

const OPERATORS = new Set([">=", "<=", ">", "<", "=="]);

const REQUIRED_TOP_LEVEL = [
  "id",
  "title",
  "affectBaseline",
  "affectDecayRate",
  "initialState",
  "goal",
  "memories",
  "choices",
  "beats",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Collects diagnostics without throwing, so one pass reports everything. */
class Report {
  constructor() {
    this.diagnostics = [];
  }

  error(code, path, message) {
    this.diagnostics.push({ level: "error", code, path, message });
  }

  warn(code, path, message) {
    this.diagnostics.push({ level: "warning", code, path, message });
  }

  get errors() {
    return this.diagnostics.filter((entry) => entry.level === "error");
  }

  get warnings() {
    return this.diagnostics.filter((entry) => entry.level === "warning");
  }
}

// ---------------------------------------------------------------------------
// Structural checks
// ---------------------------------------------------------------------------

function checkMetricMap(report, map, path, label) {
  if (!isPlainObject(map)) {
    report.error("type", path, `${label} must be an object.`);
    return;
  }

  for (const [metric, value] of Object.entries(map)) {
    const where = `${path}.${metric}`;

    if (!(metric in METRIC_RANGES)) {
      report.error("unknown-metric", where, `Unknown state metric "${metric}".`);
      continue;
    }

    if (!isFiniteNumber(value)) {
      report.error("type", where, `${label} value must be a finite number.`);
    }
  }
}

function checkConstraints(report, constraints, path, bounds) {
  if (constraints === undefined) return;

  if (!Array.isArray(constraints)) {
    report.error("type", path, "requires must be an array.");
    return;
  }

  constraints.forEach((constraint, index) => {
    const where = `${path}[${index}]`;

    if (!isPlainObject(constraint)) {
      report.error("type", where, "Constraint must be an object.");
      return;
    }

    if (!(constraint.metric in METRIC_RANGES)) {
      report.error("unknown-metric", where, `Unknown state metric "${constraint.metric}".`);
      return;
    }

    if (!OPERATORS.has(constraint.operator)) {
      report.error(
        "unknown-operator",
        where,
        `Unknown operator "${constraint.operator}". Expected one of ${[...OPERATORS].join(", ")}.`,
      );
      return;
    }

    if (!isFiniteNumber(constraint.value)) {
      report.error("type", where, "Constraint value must be a finite number.");
      return;
    }

    // A threshold outside the metric's own range is unsatisfiable no matter
    // what the story does, which is a typo rather than a design choice.
    const [minimum, maximum] = METRIC_RANGES[constraint.metric];

    if (constraint.value < minimum || constraint.value > maximum) {
      report.error(
        "impossible-constraint",
        where,
        `${constraint.metric} can only hold ${minimum}..${maximum}, so this constraint can never be satisfied.`,
      );
      return;
    }

    if (bounds) {
      checkAgainstBounds(report, constraint, where, bounds);
    }
  });
}

function checkIds(report, items, path, label) {
  const seen = new Set();

  items.forEach((item, index) => {
    const where = `${path}[${index}]`;

    if (!isPlainObject(item)) {
      report.error("type", where, `${label} must be an object.`);
      return;
    }

    if (typeof item.id !== "string" || item.id.trim() === "") {
      report.error("missing-id", where, `${label} needs a non-empty string id.`);
      return;
    }

    if (seen.has(item.id)) {
      // Lookups use `find`, so a duplicate id is silently unreachable rather
      // than an error at runtime — exactly the bug this check exists for.
      report.error("duplicate-id", where, `Duplicate ${label.toLowerCase()} id "${item.id}".`);
    }

    seen.add(item.id);
  });

  return seen;
}

function checkMemory(report, memory, path) {
  for (const field of ["intensity", "relationship"]) {
    const value = memory[field];

    if (!isFiniteNumber(value)) {
      report.error("type", `${path}.${field}`, `${field} must be a finite number.`);
    } else if (value < 0 || value > 1) {
      report.error("range", `${path}.${field}`, `${field} must be between 0 and 1.`);
    }
  }

  if (!Array.isArray(memory.tags) || memory.tags.some((tag) => typeof tag !== "string")) {
    report.error("type", `${path}.tags`, "tags must be an array of strings.");
  } else if (memory.tags.length === 0) {
    // Tag overlap is 40% of the recall score by default, so an untagged
    // memory is close to unrecallable without being an error.
    report.warn("no-tags", `${path}.tags`, "A memory with no tags scores near zero on relevance.");
  }

  if (typeof memory.text !== "string" || memory.text.trim() === "") {
    report.error("type", `${path}.text`, "text must be a non-empty string.");
  }
}

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

/**
 * Interval over-approximation of what each metric can ever hold.
 *
 * For every metric we take the initial value and add the `horizon` largest
 * positive deltas available across all choices and beats, then the `horizon`
 * most negative, clamping to the metric's declared range. One-shot sources
 * contribute at most once; repeatable ones may be counted up to `horizon`.
 *
 * This is deliberately unsound in one direction and sound in the other: it can
 * report a value as reachable when no legal path reaches it, but it never
 * reports a genuinely reachable value as out of bounds. So a constraint that
 * falls outside these bounds is definitely dead, which is the only claim the
 * diagnostics make. Proving the converse means searching the full state graph,
 * which is exponential and not worth it to catch a typo.
 */
export function reachableBounds(scenario, horizon = 6) {
  const bounds = {};

  for (const [metric, [minimum, maximum]] of Object.entries(METRIC_RANGES)) {
    const start = metric.startsWith("affect.")
      ? scenario.initialState?.affect?.[metric.slice("affect.".length)]
      : scenario.initialState?.[metric];

    const initial = isFiniteNumber(start) ? start : minimum;

    const deltas = [...(scenario.choices ?? []), ...(scenario.beats ?? [])]
      .flatMap((source) => {
        const delta = source?.deltas?.[metric];
        if (!isFiniteNumber(delta)) return [];
        // A repeatable source can contribute on every step of the horizon.
        return source.oneShot ? [delta] : Array.from({ length: horizon }, () => delta);
      });

    const gains = deltas.filter((value) => value > 0).sort((a, b) => b - a).slice(0, horizon);
    const losses = deltas.filter((value) => value < 0).sort((a, b) => a - b).slice(0, horizon);

    const sum = (values) => values.reduce((total, value) => total + value, 0);

    bounds[metric] = {
      minimum: Math.max(minimum, initial + sum(losses)),
      maximum: Math.min(maximum, initial + sum(gains)),
    };
  }

  return bounds;
}

function satisfiable(operator, threshold, { minimum, maximum }) {
  switch (operator) {
    case ">=":
      return maximum >= threshold;
    case ">":
      return maximum > threshold;
    case "<=":
      return minimum <= threshold;
    case "<":
      return minimum < threshold;
    case "==":
      return minimum <= threshold && threshold <= maximum;
    default:
      return true;
  }
}

function checkAgainstBounds(report, constraint, where, bounds) {
  const band = bounds[constraint.metric];
  if (!band) return;

  if (!satisfiable(constraint.operator, constraint.value, band)) {
    report.warn(
      "unreachable",
      where,
      `${constraint.metric} can only reach ${round(band.minimum)}..${round(band.maximum)} in this scenario, `
        + `so "${constraint.metric} ${constraint.operator} ${constraint.value}" never holds and this content is dead.`,
    );
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function checkGoalReachable(report, scenario, bounds) {
  for (const [metric, target] of Object.entries(scenario.goal ?? {})) {
    const band = bounds[metric];
    if (!band) continue;

    if (target < band.minimum || target > band.maximum) {
      report.warn(
        "unreachable-goal",
        `goal.${metric}`,
        `Goal wants ${metric} at ${target}, but it can only reach `
          + `${round(band.minimum)}..${round(band.maximum)}. The planner will always fall short on this metric.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Check a scenario and return every problem found.
 *
 * @returns {{ ok: boolean, diagnostics: Array, errors: Array, warnings: Array, bounds: object }}
 */
export function validateScenario(scenario) {
  const report = new Report();

  if (!isPlainObject(scenario)) {
    report.error("type", "", "Scenario must be an object.");
    return summarise(report, {});
  }

  for (const field of REQUIRED_TOP_LEVEL) {
    if (scenario[field] === undefined) {
      report.error("missing-field", field, `Scenario is missing "${field}".`);
    }
  }

  if (!isFiniteNumber(scenario.affectDecayRate) || scenario.affectDecayRate < 0) {
    report.error(
      "range",
      "affectDecayRate",
      "affectDecayRate must be a non-negative finite number.",
    );
  }

  checkMetricMap(report, scenario.goal ?? {}, "goal", "Goal");

  if (isPlainObject(scenario.goal) && Object.keys(scenario.goal).length === 0) {
    report.error("empty-goal", "goal", "Planner goal must define at least one metric.");
  }

  // initialState and affectBaseline are nested rather than dotted, so they are
  // checked against the same ranges by hand.
  for (const [label, source] of [
    ["initialState", scenario.initialState],
    ["affectBaseline", scenario.affectBaseline],
  ]) {
    if (!isPlainObject(source)) {
      report.error("type", label, `${label} must be an object.`);
      continue;
    }

    for (const [metric, [minimum, maximum]] of Object.entries(METRIC_RANGES)) {
      const isAffect = metric.startsWith("affect.");
      const key = isAffect ? metric.slice("affect.".length) : metric;
      const container = isAffect ? source.affect ?? source : source;

      if (label === "affectBaseline" && !isAffect) continue;

      const value = container?.[key];
      if (value === undefined) continue;

      if (!isFiniteNumber(value)) {
        report.error("type", `${label}.${key}`, `${key} must be a finite number.`);
      } else if (value < minimum || value > maximum) {
        report.error("range", `${label}.${key}`, `${key} must be between ${minimum} and ${maximum}.`);
      }
    }
  }

  const memories = Array.isArray(scenario.memories) ? scenario.memories : [];
  const choices = Array.isArray(scenario.choices) ? scenario.choices : [];
  const beats = Array.isArray(scenario.beats) ? scenario.beats : [];

  for (const [label, list, path] of [
    ["Memories", scenario.memories, "memories"],
    ["Choices", scenario.choices, "choices"],
    ["Beats", scenario.beats, "beats"],
  ]) {
    if (scenario[path] !== undefined && !Array.isArray(list)) {
      report.error("type", path, `${label} must be an array.`);
    }
  }

  checkIds(report, memories, "memories", "Memory");
  const choiceIds = checkIds(report, choices, "choices", "Choice");
  checkIds(report, beats, "beats", "Beat");

  memories.forEach((memory, index) => {
    if (isPlainObject(memory)) checkMemory(report, memory, `memories[${index}]`);
  });

  const bounds = reachableBounds(scenario);

  choices.forEach((choice, index) => {
    const path = `choices[${index}]`;
    if (!isPlainObject(choice)) return;

    checkMetricMap(report, choice.deltas ?? {}, `${path}.deltas`, "Delta");
    checkConstraints(report, choice.requires, `${path}.requires`, bounds);

    if (typeof choice.label !== "string" || choice.label.trim() === "") {
      report.error("type", `${path}.label`, "Choice needs a non-empty label.");
    }

    if (choice.memory !== undefined) {
      if (!isPlainObject(choice.memory)) {
        report.error("type", `${path}.memory`, "Choice memory must be an object.");
      } else {
        checkMemory(report, choice.memory, `${path}.memory`);
      }
    }
  });

  beats.forEach((beat, index) => {
    const path = `beats[${index}]`;
    if (!isPlainObject(beat)) return;

    checkMetricMap(report, beat.deltas ?? {}, `${path}.deltas`, "Delta");
    checkConstraints(report, beat.requires, `${path}.requires`, bounds);

    if (typeof beat.line !== "string" || beat.line.trim() === "") {
      report.error("type", `${path}.line`, "Beat needs a non-empty line.");
    }
  });

  checkGoalReachable(report, scenario, bounds);

  // A scenario with no beats plans nothing; with no choices it cannot start.
  if (choices.length === 0) {
    report.error("no-choices", "choices", "A scenario needs at least one choice.");
  }

  if (beats.length === 0) {
    report.error("no-beats", "beats", "A scenario needs at least one beat for the planner to select.");
  }

  // Every one-shot choice consumed means one fewer opening; if all of them are
  // one-shot the story runs out of moves after that many turns.
  if (choiceIds.size > 0 && choices.every((choice) => choice.oneShot)) {
    report.warn(
      "finite-choices",
      "choices",
      `Every choice is oneShot, so the story dead-ends after ${choices.length} turns.`,
    );
  }

  return summarise(report, bounds);
}

function summarise(report, bounds) {
  return {
    ok: report.errors.length === 0,
    diagnostics: report.diagnostics,
    errors: report.errors,
    warnings: report.warnings,
    bounds,
  };
}

/**
 * Throw unless the scenario is structurally sound. Warnings do not throw.
 *
 * This is what an engine entry point calls; `validateScenario` is what an
 * authoring tool calls, because it wants to show the warnings too.
 */
export function assertValidScenario(scenario) {
  const result = validateScenario(scenario);

  if (!result.ok) {
    const summary = result.errors
      .map((entry) => `  ${entry.path || "<root>"}: ${entry.message}`)
      .join("\n");

    throw new Error(`Scenario "${scenario?.id ?? "<unknown>"}" is invalid:\n${summary}`);
  }

  return result;
}

/** Human-readable diagnostics, for a CLI or a console. */
export function formatDiagnostics(result) {
  if (result.diagnostics.length === 0) return "No problems found.";

  return result.diagnostics
    .map((entry) => `${entry.level === "error" ? "error" : "warn "}  ${entry.path || "<root>"}  ${entry.message}`)
    .join("\n");
}

export { DEFAULT_MEMORY_WEIGHTS };
