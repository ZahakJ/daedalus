# Architecture

daedalus is a single-page Vite + React 19 application written in strict
TypeScript. It has no server: the physics engine, the campaign and all
persistence run in the browser.

```
src/
  physics/     the engine: pure, deterministic, SI; imports nothing outside itself
  campaign/    missions as data, objective predicates, unlock rules, golden designs
  design/      the 26 decision cards and immutable design-patch helpers
  eq/          typed equation trees, the renderer, variable bindings
  blueprint/   design → cutaway geometry in metres; SVG renderer
  flight/      range view: canvas layers, camera, playback clock, strip charts
  frr/         one-line design diff between revisions
  debrief/     flight-report generator and margin timelines
  content/     handbook concepts (40), mission briefings, mini-markdown renderer
  views/       campaign, bureau, frr, flight, debrief, handbook, museum
  worker/      the simulation worker and its latest-wins client
  sim/         seeded PRNG, fixed-step loop, sim clock, number formatting
  store.ts     zustand store
  schema.ts    zod schemas for everything persisted
  persist.ts   versioned localStorage slices
  router.ts    hash router
  share.ts     share-link payloads: encode, decode, validate
```

## The engine boundary

`src/physics/` exports one function that matters at flight time:

```ts
simulateFlight(design: RocketDesign, env: { weatherSeed: string }): FlightResult
```

It is a pure function of its arguments. There is no `Math.random`, no clock
and no global state; randomness (the launch-day wind) is drawn from an sfc32
generator seeded by a string hash. The same call is made by the worker, by the
flight readiness review, by the flight and debrief views and by the tests, and
returns bit-identical results in each.

`RocketDesign` contains only numbers, string enums, booleans and nested
objects of those, so it survives `JSON.stringify`, `localStorage` and
`postMessage` unchanged. All quantities are SI (m, kg, s, N, Pa, K, rad);
unit conversion happens only at display time (`physics/units.ts`,
`components/bureau/fmt.ts`).

`FlightResult` is

| field      | content                                                              |
| ---------- | -------------------------------------------------------------------- |
| `table`    | `TrajectoryTable`: 21 `Float64Array` channels sharing one time axis  |
| `events`   | ordered `FlightEvent`s (liftoff, max-Q, staging, orbit, impact, ...) |
| `failures` | `FailureEvent`s with severity, lesson id and the numbers involved    |
| `orbit`    | osculating elements at end of flight, or `null` if not in orbit      |
| `summary`  | apogee, max-Q, max Mach, peak g, downrange, Δv spent, loss budget    |

The trajectory channels are structure-of-arrays so the worker can transfer
their buffers instead of copying them.

## Two evaluation tiers

The design bureau runs two kinds of evaluation on every edit.

**Tier 1, synchronous.** `computeDerived`, `computeVehicleMass`,
`stabilityReport`, `structuralMargins` and `designWarnings` are closed-form
algebra over the design (mass roll-up, per-stage Tsiolkovsky Δv, T/W, static
margin, wall margins against a fixed 35 kPa / 2° envelope). They take well
under a millisecond and drive the readouts, the live equations and the
findings strip.

**Tier 2, worker.** The full trajectory is integrated in
`worker/simWorker.ts`. `worker/simClient.ts` keeps at most one request in
flight and one pending slot; a new request overwrites the pending one, and
every caller resolves with the newest result. The bureau debounces requests
by 60 ms. The result fills the trajectory preview and the objective checks.

## Flight lifecycle

```
campaign ─▶ bureau ─▶ FRR ─▶ flight ─▶ debrief ─▶ bureau (next revision)
              ▲                                       │
              └───────────── accept & continue ───────┴─▶ campaign
```

1. **Bureau.** The design lives in the `designs` slice, one per mission. Every
   control is a pure patch (`design/update.ts`) producing a new design object.
2. **FRR.** The flight readiness review runs `simulateFlight` synchronously
   with the seed `<missionId>:<rev>` and polls every check as GO, MARGINAL or
   NO-GO. Each MARGINAL and NO-GO line must be waived before launch arms.
   Committing writes a `FlightRecord` (design, seed, outcome, apogee, max-Q,
   failure ids, waived risks, diff from the previous revision) to the
   `committed` and `revisions` slices.
3. **Flight and debrief.** Neither view stores a trajectory. Both re-run
   `simulateFlight(record.design, { weatherSeed: record.seed })`, which is
   possible only because the engine is deterministic.
4. **Completion.** Accepting a successful debrief writes a `CompletionRecord`
   (vehicle, flight count, best apogee, epitaph). Unlocks are derived from
   completions and never stored.

Revision letters are A, B, C, ... per mission. The weather depends only on the
mission part of the seed, so every revision faces the same launch day.

## State and persistence

One zustand store (`store.ts`) holds five persisted slices — `campaign`,
`designs`, `committed`, `revisions`, `settings` — plus ephemeral state (the
current preview, playback position, hovered binding, selected blueprint part).

`persist.ts` stores each slice under `daedalus:v1:<slice>` as
`{ v, data }`. Writes are debounced (300 ms trailing) and flushed when the
page is hidden. Reads run the migration chain from the stored version to
`PERSIST_VERSION`, then a zod `safeParse`. A payload that fails to parse is
copied to `daedalus:corrupt-backup:<slice>` and the slice falls back to its
default; nothing is deleted. The zod schemas in `schema.ts` are annotated
`z.ZodType<T>` against the engine's TypeScript types, so the two cannot drift
without a compile error.

## Routing

`router.ts` is a hash router with seven routes:

```
#/campaign
#/bureau/<mission>   #/frr/<mission>   #/flight/<mission>   #/debrief/<mission>
#/handbook[/<concept>]
#/museum
#/m/<mission>/<d|f|r>/<payload>     shared design, flight or report
```

Unknown hashes resolve to the campaign map. `App.tsx` applies guards: a locked
mission redirects to the campaign, and flight or debrief without a committed
launch redirects to the bureau. After the first render the app sets
`body[data-app-ready="1"]`, which the screenshot tools wait for.

## Share links

`share.ts` packs a design into the fragment as base64url of one version byte
followed by deflate-raw (`CompressionStream`) of `{ m, d, r? }`: the mission,
the `RocketDesign` and the revision letter. A golden design takes 570 to 780
characters. Because the engine is deterministic and the weather depends only on
the mission, the design reproduces the flight, so `f` and `r` links rebuild the
same trajectory and report. Decoding rejects other versions, payloads over 4096
characters or 32 KB inflated, a mission that differs from the path, and any
design that fails `rocketDesignSchema`. `SharedView` shows the result in the
bureau, range or debrief in read-only mode; nothing is written until MAKE IT
MINE copies the design into the `designs` slice. Shared routes skip the unlock
guard, but a locked mission cannot be made yours.

The app is served from `/` locally and from `/daedalus/` on GitHub Pages
(`vite build --mode pages`); routes live in the hash, so the subpath only
changes the asset base.

## Rendering

**Live equations (`eq/`).** Equations are typed trees (`sym`, `frac`, `sup`,
`sqrt`, `fn`, ...) authored in `eq/specs/`, not parsed from TeX. Each symbol
can carry a binding id; the bureau and the handbook supply an `EqValues` map
under the same ids, and the renderer prints the current value under each
symbol. Binding ids are global: hovering `m₀` sets `ui.hoveredBinding` and
every symbol, readout and mass-tree row bound to `m₀` highlights.

**Blueprint (`blueprint/`).** `computeBlueprint` maps a design and the
engine's sizing outputs (tank lengths, nozzle contours, motor length) to
parts in a drawing frame measured in metres: x is radial offset from the
centreline, y runs from the nose tip to the nozzle exit. `Blueprint.tsx` sets
the one scale. The same geometry draws the museum silhouettes and the rocket
in the flight view.

**Range view (`flight/`).** One `SimClock` is advanced by a fixed-timestep
`requestAnimationFrame` loop. Five canvas layers (atmosphere, ground, trail,
rocket, plume) read the clock directly every frame without going through
React; a throttled mirror pushes the time into the store at about 10 Hz for
the scrub bar, MET readout and event log. The trajectory is Earth-centred
inertial; the scene rotates each sample by `ω_eff · t` once, in double
precision, into the launch-site frame. The camera works in log scale from
metres at the pad to megametres in orbit and always subtracts the camera
centre in double precision before scaling, because world coordinates reach
10⁷ m. Above 10× playback the clock drops to 1× three seconds before each
event and restores the previous rate 1.5 s after it.

## Content

Handbook concepts (`content/concepts.ts`) are mini-markdown with two
directives: `{eq:<id>}` embeds a live equation and `{term:<id>}` links to
another concept. `HandbookProvider` feeds the equations from the current
frontier mission's design, so the handbook shows the numbers of the vehicle
being designed. Each mission names the concepts it unlocks.

## Tests

`pnpm test` runs vitest over `src/**/__tests__` and `test/`:

- **Anchors.** USSA-1976 table values, Sutton nozzle charts, c\* for three
  propellant combinations, engine Isp against Merlin 1D, RL10 and Raptor
  class designs, Barrowman CP against an Estes Alpha geometry, Kepler and
  vis-viva identities, a V-2-geometry vertical flight.
- **Golden designs.** `campaign/golden.ts` holds a passing design for each
  mission; `golden.test.ts` flies each one and checks every objective.
- **Failure modes.** `failure-modes.test.ts` builds a design that triggers
  each entry in the failure catalog, so no failure becomes unreachable.
- **Determinism.** Identical arguments must produce identical results.
- **Share links.** Every golden design round-trips bit-exactly within a
  900-character budget; truncated, edited, mismatched, old-version,
  schema-invalid and decompression-bomb payloads are rejected.
- **App.** Router round-trips, schema validation, content rendering.

`pnpm smoke` builds, serves `vite preview` on port 6701, seeds
`localStorage` from `tools/smoke-seed.json`, loads every route in headless
Chromium, fails on any console error and writes `screenshots/<route>.png`.
`tools/makeSeed.ts` regenerates the seed from the golden designs.
