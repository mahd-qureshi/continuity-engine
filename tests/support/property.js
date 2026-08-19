//
//  property.js — a small property-based testing harness.
//
//  Example-based tests check the cases you thought of. The engine is pure and
//  deterministic, which makes it the rare thing you can test the other way:
//  generate arbitrary inputs and assert what must hold for all of them.
//
//  Three things a property runner needs to be useful rather than annoying:
//
//    Seeded    — every run uses an explicit seed, so a failure reproduces
//                exactly instead of appearing once in CI and never again.
//    Shrinking — the first counterexample found is usually huge. Shrinking
//                walks it down to the smallest input that still fails, which
//                is the difference between a debuggable report and noise.
//    Honest    — a property that passes vacuously (every generated case was
//                skipped) is a passing test that checks nothing, so the runner
//                counts real checks and fails if too few happened.
//
//  No dependency; the repository has none and this is ~120 lines.
//

/** Mulberry32. Small, fast, and good enough for generating test inputs. */
export function makeRandom(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A generator produces values and knows how to make them smaller.
 *
 * `shrink` returns candidates in "most aggressive first" order, so the greedy
 * search below finds a small counterexample without exploring everything.
 */
function generator(generate, shrink = () => []) {
  return { generate, shrink };
}


/**
 * Candidates between `target` and `value`, closing in by halves.
 *
 * The obvious shrink for a number is `value - 1`, which is linear: reducing
 * 844 to the real boundary at 500 costs 344 rounds and exhausts the budget
 * long before it arrives. Halving the gap converges in log(n) instead, so the
 * greedy search below actually reaches the boundary.
 */
function* shrinkTowards(target, value, quantise = Math.round, granularity = 1) {
  if (value === target) return;

  yield target;

  let gap = value - target;
  let previous = value;

  while (Math.abs(gap) > granularity) {
    gap /= 2;
    const candidate = quantise(value - gap);

    // Quantising can map two successive gaps onto the same value; skipping the
    // repeat keeps the budget for candidates that are actually new.
    if (candidate !== value && candidate !== target && candidate !== previous) {
      previous = candidate;
      yield candidate;
    }
  }
}

export const gen = {
  integer(minimum, maximum) {
    return generator(
      (random) => minimum + Math.floor(random() * (maximum - minimum + 1)),
      (value) => shrinkTowards(minimum, value, Math.round, 1),
    );
  },

  number(minimum, maximum, precision = 3) {
    const factor = 10 ** precision;
    const quantise = (value) => Math.round(value * factor) / factor;
    // Zero is the clearest counterexample when the range allows it; otherwise
    // shrink toward the low end.
    const target = minimum <= 0 && maximum >= 0 ? 0 : minimum;

    return generator(
      (random) => quantise(minimum + random() * (maximum - minimum)),
      function* (value) {
        for (const candidate of shrinkTowards(target, value, quantise, 1 / factor)) {
          if (candidate >= minimum && candidate <= maximum) yield candidate;
        }
      },
    );
  },

  pick(options) {
    return generator(
      (random) => options[Math.floor(random() * options.length)],
      function* (value) {
        const index = options.indexOf(value);
        if (index > 0) yield options[0];
      },
    );
  },

  array(item, { min = 0, max = 8 } = {}) {
    return generator(
      (random) => {
        const length = min + Math.floor(random() * (max - min + 1));
        return Array.from({ length }, () => item.generate(random));
      },
      function* (value) {
        if (value.length > min) {
          yield value.slice(0, min);
          if (value.length > min + 1) yield value.slice(0, Math.floor(value.length / 2));
          yield value.slice(0, value.length - 1);
        }
        // Then try shrinking individual elements, keeping the length.
        for (let index = 0; index < value.length; index += 1) {
          for (const smaller of item.shrink(value[index])) {
            const copy = [...value];
            copy[index] = smaller;
            yield copy;
          }
        }
      },
    );
  },

  record(shape) {
    const keys = Object.keys(shape);
    return generator(
      (random) => Object.fromEntries(keys.map((key) => [key, shape[key].generate(random)])),
      function* (value) {
        for (const key of keys) {
          for (const smaller of shape[key].shrink(value[key])) {
            yield { ...value, [key]: smaller };
          }
        }
      },
    );
  },

  /** Derive one generator from another. Shrinks through the source value. */
  map(source, transform) {
    return generator(
      (random) => transform(source.generate(random)),
      function* (value) {
        if (value?.__source === undefined) return;
        for (const smaller of source.shrink(value.__source)) yield transform(smaller);
      },
    );
  },
};

function attempt(predicate, value) {
  try {
    const outcome = predicate(value);
    return outcome === false ? "predicate returned false" : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Greedy descent: keep the first smaller value that still fails. */
function shrinkFailure(source, failing, predicate, budget = 2000) {
  let best = failing;
  let bestError = attempt(predicate, failing);
  let steps = 0;

  let improved = true;
  while (improved && steps < budget) {
    improved = false;

    for (const candidate of source.shrink(best)) {
      steps += 1;
      if (steps >= budget) break;

      const error = attempt(predicate, candidate);
      if (error !== null) {
        best = candidate;
        bestError = error;
        improved = true;
        break;
      }
    }
  }

  return { value: best, error: bestError };
}

/**
 * Assert that `predicate` holds for every generated value.
 *
 * Throws with the seed and a shrunken counterexample, so a failure can be
 * reproduced by passing the reported seed back in.
 */
export function forAll(source, predicate, { runs = 120, seed = 0x5eed, minChecks = 1 } = {}) {
  const random = makeRandom(seed);
  let checks = 0;

  for (let run = 0; run < runs; run += 1) {
    const value = source.generate(random);
    const error = attempt(predicate, value);

    if (error === null) {
      checks += 1;
      continue;
    }

    const minimal = shrinkFailure(source, value, predicate);

    throw new Error(
      `Property failed on run ${run + 1}/${runs} (seed ${seed}).\n`
        + `Shrunk counterexample: ${JSON.stringify(minimal.value)}\n`
        + `Reason: ${minimal.error}`,
    );
  }

  // A property every case skipped is a green test that verified nothing.
  if (checks < minChecks) {
    throw new Error(`Property ran ${runs} times but only ${checks} cases were meaningful.`);
  }

  return checks;
}
