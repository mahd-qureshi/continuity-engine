//
//  weight-sweep.js — how much do the memory weights actually matter?
//
//  The recall score is a weighted sum of four components, and the default
//  weights (0.40 tags, 0.25 recency, 0.20 intensity, 0.15 relationship) were
//  chosen by taste. This asks whether that taste is load-bearing: sweep the
//  simplex, replay a fixed playthrough under each weighting, and measure how
//  far the recalled set drifts from the default.
//
//  Run: npm run experiment
//

import { runChoices } from "../src/engine.js";
import { orbitalRelay } from "../src/scenario.js";

const COMPONENTS = ["tags", "recency", "intensity", "relationship"];
const PLAYTHROUGH = ["tell-truth", "reassure", "sacrifice"];
const STEP = 0.1;

/** Every weight vector on a simplex grid summing to 1. */
function* simplex(step = STEP) {
  const ticks = Math.round(1 / step);

  for (let a = 0; a <= ticks; a += 1) {
    for (let b = 0; b <= ticks - a; b += 1) {
      for (let c = 0; c <= ticks - a - b; c += 1) {
        const d = ticks - a - b - c;
        yield {
          tags: a / ticks,
          recency: b / ticks,
          intensity: c / ticks,
          relationship: d / ticks,
        };
      }
    }
  }
}

/** The memory ids recalled at each turn, flattened in order. */
function recallSignature(weights) {
  const { turns } = runChoices(orbitalRelay, PLAYTHROUGH, {
    memory: { weights },
  });

  return turns.map((turn) => turn.recalledMemories.map((memory) => memory.id));
}

/** Fraction of turns whose recalled set differs from the baseline's. */
function divergence(baseline, candidate) {
  let differing = 0;

  for (let index = 0; index < baseline.length; index += 1) {
    const before = new Set(baseline[index]);
    const after = candidate[index] ?? [];
    const overlap = after.filter((id) => before.has(id)).length;
    const union = new Set([...baseline[index], ...after]).size;

    if (union > 0 && overlap / union < 1) differing += 1;
  }

  return differing / baseline.length;
}

function format(weights) {
  return COMPONENTS.map((name) => `${name[0]}=${weights[name].toFixed(1)}`).join(" ");
}

function main() {
  const baseline = recallSignature({
    tags: 0.4,
    recency: 0.25,
    intensity: 0.2,
    relationship: 0.15,
  });

  const results = [];

  for (const weights of simplex()) {
    let signature;
    try {
      signature = recallSignature(weights);
    } catch {
      // Weight vectors that fail validation (floating point drift off the
      // simplex) are skipped rather than reported as findings.
      continue;
    }

    results.push({ weights, divergence: divergence(baseline, signature) });
  }

  const unchanged = results.filter((entry) => entry.divergence === 0).length;
  const total = results.length;

  // Which single component moves recall most when pushed to its extreme?
  const extremes = COMPONENTS.map((name) => {
    const dominant = results.find((entry) => entry.weights[name] >= 0.9);
    return { name, divergence: dominant ? dominant.divergence : null };
  }).sort((left, right) => (right.divergence ?? -1) - (left.divergence ?? -1));

  console.log(`Playthrough: ${PLAYTHROUGH.join(" -> ")}`);
  console.log(`Weight vectors tested: ${total} (grid step ${STEP})\n`);
  console.log(
    `Recall identical to default: ${unchanged}/${total} `
      + `(${((unchanged / total) * 100).toFixed(1)}%)\n`,
  );

  console.log("Pushing one component to 0.9+:");
  for (const entry of extremes) {
    const value = entry.divergence === null ? "n/a" : `${(entry.divergence * 100).toFixed(0)}%`;
    console.log(`  ${entry.name.padEnd(13)} turns changed: ${value}`);
  }

  const worst = [...results].sort((a, b) => b.divergence - a.divergence).slice(0, 5);
  console.log("\nMost divergent weightings:");
  for (const entry of worst) {
    console.log(`  ${format(entry.weights)}  ->  ${(entry.divergence * 100).toFixed(0)}% of turns changed`);
  }
}

main();
