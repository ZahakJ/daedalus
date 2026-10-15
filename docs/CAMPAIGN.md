# Campaign

The campaign is data in `src/campaign/`. Each `Mission` has a starting design
(`preset()`), a list of objectives, the handbook concepts it unlocks and the
bureau features it introduces. A mission is playable when every earlier one
is complete; features and concepts accumulate.

## Missions

| # | id                | goal                                    | payload  | new in the bureau                                        |
| - | ----------------- | --------------------------------------- | -------- | -------------------------------------------------------- |
| 1 | `first-flight`    | 1 km, touchdown ≤ 8 m/s                 | 1 kg     | three catalogue solid motors, fins, nose shape, recovery |
| 2 | `karman-line`     | 100 km                                  | 4 kg     | full solid-motor design, case and fin materials          |
| 3 | `liquid-fire`     | 150 km                                  | 20 kg    | pressure-fed liquid engine: MR, p_c, ε, thrust; tanks    |
| 4 | `pumps-and-power` | 250 km                                  | 50 kg    | gas-generator and electric-pump cycles, throttle bucket  |
| 5 | `two-steps`       | 500 km apogee, 400 km downrange         | 500 kg   | second stage, interstage, fairing, pitch kick            |
| 6 | `gravity-turn`    | 200 ± 25 km circular orbit, e ≤ 0.02    | ≥ 100 kg | prograde law, apoapsis cutoff, launch latitude           |
| 7 | `every-kilogram`  | 400 ± 40 km circular orbit, cost ≤ 750  | 1000 kg  | Al-Li and 301 stainless, common bulkhead, staged combustion, cost |
| 8 | `high-energy`     | GTO: apoapsis 35 786 ± 2000 km, periapsis ≥ 180 km | 500 kg | LOX/LH₂ upper stage, insulation, restarts, GTO injection |

Every mission also requires no loss of vehicle. Missions 1–5 launch from
32° N, missions 6–8 from 28.5° N; the sounding missions use launch rails of
6–20 m.

The presets are deliberately flawed: mission 1 tumbles, mission 2 flutters,
mission 6 lofts into the wrong orbit. `golden.ts` holds, for each mission, the
patch a player would plausibly arrive at after two to four flights, and the
test suite checks that every golden design meets every objective.

## Objectives

Objectives are small predicates over the flight result, the design and the
tier-1 derived performance (`objectives.ts`):

| constructor        | passes when                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `apogeeAtLeast`    | maximum altitude ≥ target                                             |
| `landingAtMost`    | touchdown under canopy at or below the given speed                    |
| `downrangeAtLeast` | final surface arc ≥ target                                            |
| `vehicleIntact`    | no failure of severity `loss-of-vehicle`                              |
| `orbitCircular`    | periapsis > 140 km, mean altitude within tolerance, e ≤ limit         |
| `gtoReached`       | apoapsis within tolerance of the target, periapsis ≥ minimum          |
| `costAtMost`       | program cost ≤ cap                                                    |

Each returns `{ pass, actual, target }` as display strings; the same grades
appear in the bureau preview, the FRR and the debrief.

## Design bureau

The left column holds up to 26 decision cards (`design/cards.tsx`), grouped
as propulsion, staging, structures, aero and stability, recovery, guidance
and program. A card appears once its feature is unlocked. Each card has its
controls, a live equation with the current values bound into it, a status
light, and a link to the handbook concept it teaches.

The centre column is the cutaway drawing in real metres, with CG and CP
marked for finned vehicles. The right column shows GLOW, Δv against the
mission requirement, liftoff T/W, Isp, predicted max-Q, static margin or
cost, the mass tree, and the worker's trajectory preview with objective
grades.

The findings strip at the top lists `designWarnings`: low T/W, sea-level flow
separation, tank SF under the weld floor, uninsulated LH₂, a common bulkhead
between cryogenic and storable propellants, static margin outside
0.5–3 calibres, and structural margins under 15 %.

## Flight readiness review

The FRR is the gate between design and flight. It runs the full simulation
for the next revision and polls each line:

| section    | lines                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| structures | wall margins per stage at max-Q and max-acceleration (≥ 15 %), predicted max-Q, fin flutter at sea level against peak airspeed below 40 km, static margin (0.5–3 cal) |
| propulsion | liftoff T/W (≥ 1.25), stage-1 nozzle exit pressure (≥ 0.35·p₀), tank SF (≥ 1.15, 1.25 recommended) |
| recovery   | dynamic pressure at canopy deployment (≤ 1.2 kPa)                                        |
| range      | 10 m surface wind (≤ 8 m/s), jet stream at 10 km (≤ 12 m/s), rail-exit speed (≥ 20 m/s) |
| trajectory | Δv budget, every mission objective, every failure the simulation predicts                |

Every MARGINAL and NO-GO line must be accepted individually before launch is
armed. The accepted lines are stored with the flight record, and the debrief
quotes them back. Because the FRR runs the same deterministic simulation as
the flight, a predicted failure is the failure that will happen.

## Debrief

`debrief/report.ts` builds the post-flight document. A flight that lost the
vehicle produces a mishap investigation report (`MIR-<mission>-<rev>`); any
other flight produces a flight report (`FR-<mission>-<rev>`).
Sections:

1. **Synopsis** — vehicle, revision, mission, apogee, flight time, landing
   point or final orbit.
2. **Timeline** — flight events and failures merged in time order.
3. **Findings** — one per failure, with the catalog's cause template filled
   from the numbers the simulator recorded at the moment of failure, the
   decision it implicates and the blueprint part to highlight.
4. **Performance** — apogee, max-Q, Mach, peak g, range, Δv spent, gravity,
   drag and steering losses, orbit.
5. **Probable cause and recommendations** — each recommendation links back
   to the bureau with the relevant part selected.
6. **Objectives** — graded.

The margin timeline (`debrief/margins.ts`) replays four checks over every
trajectory sample using the simulator's own formulas — structural load
against buckling capability, airspeed against the flutter boundary, static
margin against the 0.5 cal floor, and T/W against 1 — and plots proximity to
each limit, marking the closest approach.

A successful flight that meets every objective can be accepted. The vehicle
then enters the museum with a short epitaph derived from its revision history.

## Handbook and museum

The handbook has 40 concepts in campaign order. Each has a governing equation
rendered with the numbers of the current frontier mission's design, a short
text with cross-links, and a note on where the idea appears in practice.
Concepts unlock with their mission.

The museum draws every completed vehicle's silhouette at one common scale,
with the program's records.
