# Algorithms

This note defines the calculations used by version 0.1. The constants are
deliberately visible and easy to change; they are design hypotheses, not
learned truths.

## Emotional decay

Each affect dimension decays toward a configured baseline:

```text
next = baseline + (current - baseline) × e^(-rate × elapsed)
```

The included scenario uses:

```text
baseline = { valence: 0, arousal: .35, control: .50 }
rate = .20
```

After decay, event deltas are applied and values are clamped:

- valence: `[-1, 1]`
- arousal and control: `[0, 1]`
- trust and tension: `[0, 1]`

This prevents old emotional shocks from persisting forever while keeping state
numerically valid.

## Memory relevance

Tag similarity is Jaccard similarity:

```text
similarity(A, B) = |A ∩ B| / |A ∪ B|
```

Recency uses exponential decay:

```text
recency = e^(-.18 × ageInSteps)
```

The relevance score is:

```text
relevance =
    .40 × tagSimilarity
  + .25 × recency
  + .20 × emotionalIntensity
  + .15 × relationshipRelevance
```

All components are normalized before weighting.

### Diversity with MMR

Pure relevance frequently returns three memories saying nearly the same thing.
Maximal Marginal Relevance balances relevance against redundancy:

```text
MMR(candidate) =
    λ × relevance(candidate)
  - (1 - λ) × maxSimilarity(candidate, selected)
```

Version 0.1 uses `λ = .72` and selects at most three memories from prior turns.
Duplicate identifiers and normalized duplicate text are removed before
selection. Equal scores are ordered by memory identifier.

For `n` memories and selection limit `k`, repeated sorting and redundancy checks
produce `O(kn log n + nk²)` time. Here, `k = 3`.

## Beat eligibility

A beat may define:

- numeric preconditions such as `trust >= .53`
- whether it can be used only once
- state deltas
- continuity tags

Ineligible beats do not enter the search. Their failed constraints remain in
the decision trace.

## Beat preview scoring

The planner simulates the beat, then calculates:

```text
score =
    .68 × goalFit
  + .32 × contextContinuity
```

`goalFit` is one minus the mean normalized distance between the simulated state
and the scenario's target trust, tension, and valence. `contextContinuity` is
Jaccard similarity between the beat tags and the current choice plus recalled
memory tags.

## Bounded beam search

At each depth the planner:

1. evaluates every eligible beat for every state in the frontier
2. applies emotional decay and beat deltas
3. carries the selected beat's tags into the next continuity comparison
4. evaluates the path's terminal goal fit
5. keeps the best `beamWidth` paths

Terminal goal fit is the primary ordering. Discounted adjacent-beat continuity
is the secondary ordering, followed by a stable path identifier:

```text
terminalGoalFit ↓
discountedContinuity ↓
stablePathId ↑
```

The demo uses horizon `3` and beam width `4`.

For `m` beats, horizon `h`, and beam width `b`, the dominant work is roughly
`O(h × b × m log(bm))`. Both `h` and `b` are intentionally small.

## Known modeling limits

- Hand-authored tags encode the ontology.
- Linear weights cannot represent every dramatic interaction.
- One numeric goal state compresses artistic intent.
- Planning assumes event effects are known and deterministic.

These are useful constraints for an inspectable prototype, not claims about how
all narratives work.
