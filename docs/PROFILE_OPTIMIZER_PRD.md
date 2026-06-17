# Profile Optimizer PRD

> Version: v1.2.x
> Date: 2026-06-18
> Status: Integrated

## 1. Purpose

The Profile Optimizer improves Kaffelogic `.kpro` / `.npro` profiles by smoothing RoR behavior while preserving the profile's operational intent. It keeps the original profile settings, metadata, PID-related fields, fan settings, and roast landmarks intact unless the user explicitly edits them.

The optimizer is designed for two workflows:

- Editor workflow: user imports a profile, previews RoR optimization, accepts or rejects the result, then downloads the edited `.kpro`.
- Upload workflow: uploaded profiles can be analyzed and optionally optimized for smoother RoR, with a clear acceptance gate before applying changes.

## 2. Architecture

```text
lib/curve-optimizer.ts
├── cost function with 12 terms
├── acceptance gate with 10 safety constraints
├── control-handle optimization
├── optional free-knot optimization
├── knot shock scan
├── golden-section search
├── coordinate descent
└── Nelder-Mead optimization

lib/curve-bezier.ts
├── cubic Bezier evaluation
├── derivative / RoR estimation
├── dense sampling
└── curve interpolation helpers

lib/kpro.ts
├── raw field preservation
├── Bezier anchor parsing
├── sampled display points
└── Kaffelogic-compatible serialization
```

No external runtime dependency is required for optimization.

## 3. Optimization Cost Function

The cost function evaluates curve quality with 12 terms:

| # | Term | Purpose |
|---|------|---------|
| 1 | RoR roughness | Reduce second-derivative noise |
| 2 | Peak `dRoR/dt` | Avoid abrupt RoR transitions |
| 3 | Flick penalty | Avoid post-peak RoR rebound |
| 4 | Negative RoR penalty | Avoid invalid declining temperature profile sections |
| 5 | CC drift | Preserve colour-change timing |
| 6 | FC drift | Preserve first-crack timing |
| 7 | Drop drift | Preserve roast-end timing |
| 8 | Temperature fidelity | Keep optimized curve close to original |
| 9 | Phase-weighted deviation | Protect Maillard and development phases more strongly |
| 10 | Development RoR fidelity | Avoid disrupting post-FC behavior |
| 11 | Maillard plateau | Avoid flat, baked-feeling mid roast profiles |
| 12 | Boundary shock | Reduce abrupt RoR changes near Bezier knots |

## 4. Acceptance Gate

The optimizer rejects results when any of these constraints fail:

| # | Constraint | Threshold |
|---|------------|-----------|
| 1 | CC time drift | ±0.01s |
| 2 | FC time drift | ±0.01s |
| 3 | Drop time drift | ±0.01s |
| 4 | Post-peak flick count | 0 |
| 5 | End RoR degradation | not below 80% of original |
| 6 | Peak `dRoR/dt` worsening | not above 115% of original |
| 7 | Max temperature deviation | ≤8°C |
| 8 | RMS temperature deviation | ≤3°C |
| 9 | Development temperature deviation | ≤3°C |
| 10 | Development RoR instability | ≤2°C/min |

If rejected, the UI must show the reason and keep the original profile active.

## 5. Public API

```ts
optimizeProfileCurve(anchors, events)
optimizeWithFreeKnots(anchors, events, selectedKnotIndices)
scanKnotShocks(anchors, events)
```

Definitions:

- `anchors`: Kaffelogic Bezier anchor profile.
- `events`: expected CC, FC, and Drop temperatures.
- `selectedKnotIndices`: optional user-selected knot positions that may move within a bounded range.

## 6. Product Requirements

- The optimizer must never silently overwrite user data.
- The optimized profile must be downloadable as `.kpro`.
- Unknown `.kpro` fields must be preserved.
- Optimization output must include before/after metrics and acceptance reasons.
- Curves that fail the acceptance gate must remain available for manual editing but must not be auto-applied.
- The editor should clearly separate smoothing from roast-process decisions such as preheat policy, fan behavior, phase targets, and manual adjustment nodes.

## 7. Tests

Required checks:

- Parse and serialize `.kpro` without losing unknown fields.
- Keep generated Bezier profiles reparsable.
- Verify optimizer output keeps CC, FC, and Drop within tolerance.
- Verify rejected optimization results do not replace the active curve.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## 8. Current Status

The optimizer is integrated into the editor/upload path and has been refactored to remove public reference-source identifiers. Remaining production improvements should focus on UI explainability, browser-level QA, and production monitoring after deployment.
