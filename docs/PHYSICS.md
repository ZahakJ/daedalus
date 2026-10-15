# Physics

The engine in `src/physics/` turns a `RocketDesign` into sized hardware, then
flies it. Units are SI throughout; angles are radians. References are to
Sutton, *Rocket Propulsion Elements* (9th ed.), Barrowman (1967), Huzel &
Huang, NASA SP-8007 and Vallado unless noted.

Contents: [atmosphere](#atmosphere) · [propulsion](#propulsion) ·
[tanks](#tanks) · [mass and centre of gravity](#mass-and-centre-of-gravity) ·
[aerodynamics](#aerodynamics) · [stability and flutter](#stability-and-flutter) ·
[structures](#structures) · [wind](#wind) · [trajectory](#trajectory) ·
[guidance](#guidance) · [orbits](#orbits) · [loss budget](#loss-budget) ·
[cost](#cost)

## Atmosphere

`atmosphere.ts` implements the US Standard Atmosphere 1976 to 86 km
geometric altitude: seven layers with bases at 0, 11, 20, 32, 47, 51 and
71 km geopotential and lapse rates −6.5, 0, +1, +2.8, 0, −2.8 and −2 K/km.
Layer base pressures are chained hydrostatically from T₀ = 288.15 K and
p₀ = 101 325 Pa at module load.

```
h' = R·h / (R + h)                      geometric → geopotential
gradient layer:   p = p_b · (T/T_b)^(−g₀ / (L·R_air))
isothermal layer: p = p_b · exp(−g₀·Δh' / (R_air·T_b))
ρ = p / (R_air·T),   a = √(γ·R_air·T)
```

The conversion uses the engine's mean Earth radius (6371 km) rather than
USSA-76's 6356.766 km; the error stays inside ±0.5 % of the published table.
Above 86 km the pressure decays as `p₈₆ · exp(−(h − 86 km)/7200 m)` with
temperature held at its 86 km value, and above 150 km the atmosphere is hard
vacuum (p = ρ = 0).

## Propulsion

### Combustion

There is no equilibrium solver. `propulsion/propellants.ts` holds chamber
temperature T_c, product molar mass M̄ and γ against mixture ratio for
LOX/RP-1, LOX/CH₄, LOX/LH₂ and NTO/MMH, digested from NASA CEA runs at a
reference chamber pressure of 7 MPa and interpolated with a monotone cubic.
The mixture ratio is clamped to each grid. A chamber-pressure correction
`T_c · (p_c / 7 MPa)^0.015`, clamped to ±4 %, models the suppression of
dissociation at higher pressure. APCP is a fixed state (3200 K, 26 kg/kmol,
γ = 1.18).

```
Γ(γ) = √γ · (2/(γ+1))^((γ+1)/(2(γ−1)))        Vandenkerckhove function
c*_ideal = √((R_u/M̄)·T_c) / Γ(γ)               Sutton 3-32
```

Bulk density for tank sizing is the mass-weighted harmonic mean of oxidizer
and fuel densities at their storage conditions.

### Nozzle

`propulsion/nozzle.ts` uses isentropic closed forms. The exit Mach number is
found from the area ratio ε by a fixed 32-step bisection on the supersonic
branch, M ∈ [1, 12].

```
A/A* = (1/M)·[(2/(γ+1))·(1 + (γ−1)/2·M²)]^((γ+1)/(2(γ−1)))             3-14
p_e/p_c = (1 + (γ−1)/2·M_e²)^(−γ/(γ−1))                                3-13
C_F = √(2γ²/(γ−1) · (2/(γ+1))^((γ+1)/(γ−1)) · (1 − (p_e/p_c)^((γ−1)/γ)))
      + ε·(p_e − p_a)/p_c                                              3-30
```

The bell is an 80 % Rao contour: length `0.8·(r_e − r_t)/tan 15°`.
Flow separation follows the Summerfield criterion, p_e < 0.35·p_a.

### Liquid engines

`evaluateEngine` sizes one engine from its propellant, mixture ratio, chamber
pressure, vacuum thrust target, ε, cycle and count:

```
c*     = η_c* · c*_ideal
A_t    = F_vac / (C_F,vac · p_c)          throat sized to the thrust target
ṁ_core = p_c · A_t / c*
F      = C_F · p_c · A_t,   Isp = F / (ṁ · g₀)
```

| cycle             | η_c\* | engine T/W | throttle floor | restarts |
| ----------------- | ----- | ---------- | -------------- | -------- |
| pressure-fed      | 0.94  | 35         | 0.40           | 99       |
| gas-generator     | 0.98  | 90         | 0.60           | 1        |
| electric-pump     | 0.96  | 70         | 0.30           | 0        |
| staged-combustion | 0.985 | 110        | 0.55           | 2        |

The η values are calibrated so Merlin 1D, RL10 and Raptor class designs land
within ±3 % of their published Isp. The gas-generator cycle dumps turbine
exhaust overboard: total flow is `ṁ_core / 0.979` at unchanged thrust, which
lowers Isp by about 2 %.

Engine dry mass is `F_vac/(g₀·T/W)`, plus 0.4 % per unit of ε above 15, plus
8 kg of valves and actuators. The electric-pump cycle carries a battery sized
for the stage's whole burn:

```
P_pump = ṁ · (1.25·p_c) / (ρ_bulk · 0.65)
m_batt = 1.2 · P_pump · t_burn / (250 Wh/kg)
```

Pressure-fed tanks must supply `1.3·p_c + 0.5 MPa`; pump-fed tanks need only
0.25 MPa of suction head.

### Solid motors

`evaluateSolid` fixes the chamber pressure at 6 MPa and η_c\* at 0.94
(two-phase losses). The throat follows from the average mass flow:

```
ṁ_avg = m_p / t_b,   A_t = ṁ_avg · c* / p_c,   F_avg = ṁ_avg · c* · C_F,SL
```

The case is a cylinder holding the grain volume (ρ = 1800 kg/m³, +10 % for
voids) with hemispherical end domes. Wall thickness comes from hoop stress at
a design pressure of 1.5·p_c, clamped to the material's minimum gauge; shell
mass carries a 1.15 factor for weld lands and liner.

Three normalized thrust curves — progressive (0.75 → 1.25), neutral (flat
1.03 with a tail-off) and regressive (1.25 → 0.75) — each integrate to 1 over
the burn, so total impulse is independent of the profile.

## Tanks

`sizeStageTanks` sizes the two tanks of a liquid stage as cylinders with 2:1
ellipsoidal domes (dome height r/2; pair volume ⅔πr³, pair area 2·1.38·πr²).

- Propellant splits by mixture ratio; each volume gets 4 % ullage.
- MEOP = max(feed pressure, 0.25 MPa).
- Wall: `t = MEOP · r · SF / σ_y` (Barlow hoop stress), clamped to minimum
  gauge. One gauge covers the whole shell; mass carries a 1.12 non-optimum
  factor for weld lands, baffles and sumps.
- A common bulkhead removes one dome pair of mass.
- Helium: `m_He = 1.6 · MEOP · V / (R_He · 250 K)` (collapse factor 1.6),
  stored at 31 MPa and 290 K in a Ti-6Al-4V sphere with SF 1.5 and a 1.3
  non-optimum factor.
- Insulation, when fitted: 1.5 kg/m² of wetted tank area.
- LH₂ boils off at 0.2 %/h of the remaining mass when insulated and five
  times that when bare.

Seven materials are available (`materials.ts`): Al 2219-T87, Al-Li 2195,
stainless 304L and 301 full-hard, Ti-6Al-4V, carbon-fibre laminate and 4130
steel, each with density, yield and ultimate strength, Young's modulus,
minimum gauge, a cryogenic-compatibility flag and a cost index.

## Mass and centre of gravity

`computeVehicleMass` rolls every part into a `MassNode` tree: nose or fairing
(4.5 or 8 kg/m² of surface), payload, nose ballast, recovery (0.12 kg/m² of
canopy plus a 1.5 kg mortar), and per stage the engines, tanks, thrust
structure (`0.35·m_engines + 0.004·m_propellant`), pump battery, interstage
(11 kg/m²), avionics and propellant. Solid stages carry a composite airframe
tube three diameters long above the motor. Large fins are built-up structures
and weigh 45 % of a solid plate of the same thickness; fins under 0.05 m² are
solid.

`vehicleCG(propellantFraction)` places each mass at a station measured from
the nose tip. Nose ballast sits 30 % into the nose; the remaining propellant's
centroid moves aft as the stage drains. The static margin therefore changes
during the burn, which is what the simulator checks.

## Aerodynamics

Drag uses a Cd(M) table for a power-on, zero-incidence, fineness-8 body with a
conical nose (Hoerner, Sutton fig. 4-4): 0.30 to M 0.5, a transonic rise to
0.62 at M 1.1, and decay to 0.24 above M 6. The nose shape scales only the
wave component above the subsonic baseline (conical 1.0, ogive 0.92,
von Kármán 0.85). A fineness correction `clamp(1 + 0.012·(8 − L/D), 0.92,
1.15)` is available; the simulator evaluates Cd at the reference fineness 8.
Fins add `ΔCd = 2 · 0.008 · n · S_fin / S_ref`, and a deployed parachute adds
a drag area of `1.75 · A_canopy`.

```
q = ½ρv²,   D = q · Cd · S_ref,   M = v / a
```

All three use air-relative velocity: inertial velocity minus Earth rotation
minus wind.

## Stability and flutter

`stability.ts` implements Barrowman's method. Every nose that meets the body
at full diameter has CNα = 2; its centre of pressure is at 2/3, 0.466 or 0.5
of the nose length for conical, ogive and von Kármán shapes. For the fins,
with semispan s, body diameter d, chords c_r and c_t and leading-edge sweep Λ:

```
x_m  = s·tan Λ + (c_t − c_r)/2,     ℓ = √(s² + x_m²)
CNα  = 4n(s/d)² / (1 + √(1 + (2ℓ/(c_r + c_t))²)) · (1 + r/(s + r))
Δx   = s·tan Λ·(c_r + 2c_t)/(3(c_r + c_t)) + (c_r + c_t − c_r·c_t/(c_r + c_t))/6
X_cp = Σ CNα_i · x_i / Σ CNα_i
static margin = (X_cp − X_cg) / d        calibres
```

Fin flutter follows NACA TN 4197 in the form common in amateur rocketry, with
aspect ratio AR = s²/S, taper λ = c_t/c_r and shear modulus G = E/2.6:

```
V_f = a · √( G / ( 1.337·AR³·p·(λ+1) / (2·(AR+2)·(t/c_r)³) ) )
```

V_f scales with thickness to the power 1.5 and falls with ambient pressure,
so the boundary is lowest near the ground and rises with altitude.

Rail-exit speed assumes constant acceleration: `v = √(2·(T/W − 1)·g₀·L)`.

## Structures

The stage-0 wall is a thin monocoque cylinder. Its capability is the
buckling load from NASA SP-8007 with a knockdown of 0.3, plus membrane
credit from internal pressure, capped at 0.9·σ_y:

```
σ_cr = 0.3·E·t/r + p·r/(2t)
F_cap = σ_cr · 2πrt
```

The load is the inertial compression of everything above the joint plus an
aerodynamic bending moment converted to equivalent axial load:

```
F = m_above · a_sensed
M = q · α · CNα_above · S_ref · ℓ
F_eq = F + 2M/r,       margin = F_cap / F_eq − 1
```

At design time `structuralMargins` evaluates two fixed cases per stage: max-Q
at 35 kPa and 2° incidence, and max acceleration at burnout. In flight the
same formula runs every half second of ascent with the actual q, α and
acceleration.

## Wind

`windProfile(seed)` draws every random number once, from an sfc32 stream
seeded with `wx:<missionId>`, and returns a smooth closed form that is safe
to evaluate inside RK4 stages. The signed horizontal wind (positive = tail
wind along the launch azimuth) is the sum of:

1. a surface layer reaching the 10 m wind u₁₀ ∈ [−7, 7] m/s over about 200 m
   and fading above the boundary layer, `u₁₀·(1 − e^(−h/200))·e^(−h/1500)`;
2. a jet-stream bump peaking at 4–12 m/s at 10 km,
   `u_jet·(h/H)³·e^(3(1 − h/H))`;
3. three sinusoidal gust harmonics in altitude (0.3–0.9 m/s, wavelengths
   2–8 km) under an `e^(−h/30 km)` envelope.

The surface wind is reported separately as the 10 m reading; the FRR shows
it, and it drives weathercocking at rail exit. Because only the mission part
of the seed reaches the generator, every revision of a vehicle flies the same
weather.

## Trajectory

`simulateFlight.ts` integrates point-mass motion in a two-dimensional
Earth-centred inertial plane containing the launch site and the eastward
azimuth. The site starts at (0, R) with the co-rotating velocity
`ω_eff·(y, −x)`, where `ω_eff = ω_E·cos(latitude)`; air and ground move with
the same field.

```
state      (x, y, v_x, v_y), RK4
gravity    −μ·r/|r|³  (spherical Earth)
thrust     T(p_a)/m along the commanded attitude
drag       −D/(m·v_air) · v_air
step       0.1 s while burning, descending, or where p ≥ 1 Pa; 1 s otherwise
mass       forward Euler with ṁ held over the step
```

Thrust at ambient pressure p_a is `F_vac − p_a·A_e` (times throttle for
liquids, times the profile value for solids), never negative. The time limit
is two hours. Telemetry is recorded every second integration step (5 Hz)
during powered and atmospheric flight and every step (1 Hz) in coast.

### Phases

```
burn ─▶ coast-sep ─▶ coast-ignite ─▶ burn ─▶ … ─▶ final burn
final burn ─▶ ballistic | coast-apo ─▶ circularize ─▶ coast-gto ─▶ gto-burn ─▶ done
apogee during burn or ballistic ─▶ descent ─▶ touchdown | impact
```

Each stage burns to depletion, coasts for its separation delay, separates,
and the next stage ignites after its ignition delay. Solids burn for exactly
their burn time. The final burn may instead end at an apoapsis target.

### Events

Liftoff, rail exit, Mach 1, max-Q (emitted when q falls 15 % below a peak of
at least 2 kPa), burnout, separation, ignition, fairing jettison (after max-Q,
once q < 1 kPa by default), MECO, apogee, circularization start and end,
orbit, chute deploy, touchdown (under canopy below 15 m/s) and impact.

### Failure detection

Detection runs inside the integration loop, where the numbers are; the
catalog in `failures.ts` holds the titles, cause templates and fix hints.

| failure               | trigger                                                                | severity       |
| --------------------- | ---------------------------------------------------------------------- | -------------- |
| `tank-burst`          | any tank SF < 1.15, at t = 0                                           | loss           |
| `flow-separation`     | stage-1 p_e < 0.25·p₀ at t = 0; or p_e < 0.35·p_a for over 2 s in flight | loss / degraded |
| `cavitation`          | pump-fed: `0.08 MPa + 0.006·p_c` exceeds tank MEOP                     | loss           |
| `pad-crawl`           | liftoff T/W < 1.02                                                     | loss           |
| `weathercock`         | passive vehicle, margin > 3 cal and wind incidence > 4.5° at rail exit | degraded       |
| `fin-flutter`         | ascent airspeed above V_f at local p and a, with q > 500 Pa; fins lost | degraded       |
| `unstable-tumble`     | passive vehicle, margin < 0.5 cal, or fins lost, with q > 500 Pa       | loss           |
| `maxq-structural`     | stage-0 wall margin < 0 during ascent, q > 5 kPa                       | loss           |
| `pressurant-depleted` | pressure-fed helium exhausted before propellant; thrust × 0.45         | degraded       |
| `battery-depleted`    | restart beyond the cycle's allowance                                   | degraded       |
| `boiloff-shortfall`   | a burn runs dry after LH₂ boiled off in coast                          | degraded       |
| `chute-shred`         | canopy deployed above 1.2 kPa                                          | degraded       |

"Passive" means an unguided solid first stage: liquid vehicles are assumed to
steer with gimballed engines, so the static-margin checks do not apply to
them, though their fins can still flutter. A sustained flow separation costs
12 % thrust while it lasts. After a loss of vehicle the debris is integrated
for three more seconds with thrust cut.

The weathercock bend is `min(15°, α_wind · margin/3)` toward the wind, held
for the rest of the vertical-rise phase.

## Guidance

The guidance program is open loop:

1. **Vertical rise.** Attitude stays radial until the rail is cleared and the
   pad-relative ground speed reaches `verticalUntilSpeed`.
2. **Pitch kick.** At `pitchKick.atSpeed` the attitude snaps `angle` east of
   vertical. Gates use ground speed, not inertial speed (which includes about
   465·cos(latitude) m/s of Earth rotation) and not airspeed (which would make
   the kick depend on the wind).
3. **Gravity turn.** With the `prograde` law the attitude follows the
   air-relative velocity vector, slewing at no more than 4°/s. The
   alternative is a fixed inertial pitch rate.
4. **Throttle bucket.** On liquid stages the throttle drops to
   `max(level, throttle floor)` once q exceeds `fromQ`, and returns to full
   once max-Q has passed and q is below `toQ`.
5. **Cutoff.** The final burn ends at depletion or, above 30 km, as soon as
   the coasting apoapsis reaches the target.
6. **Circularization.** The engine restarts when the time to apoapsis,
   estimated as `ṙ / g_net`, falls to half the expected burn duration
   `Δv·m/F`. During the burn the thrust points along the local horizontal,
   pitched by `clamp(−8·ṙ/v_t, ±0.5)` to hold altitude. The burn ends when
   periapsis exceeds 150 km with e ≤ 0.015, when periapsis reaches 96 % of the
   target, or when apoapsis overshoots the target by 50 %; it is abandoned
   below 120 km or when the tanks run dry.
7. **GTO injection.** After a 600 s coast the stage restarts and burns
   inertial prograde until the apoapsis reaches `raiseApoapsisTo`.

Each restart is checked against the cycle's allowance. Pressure-fed stages
spend helium in proportion to propellant burned, and the bottle holds exactly
one blowdown, so a restart runs it dry before the tanks are empty.

## Orbits

`orbit.ts` computes osculating elements from the planar state vector:

```
ε = v²/2 − μ/r,          a = −μ/(2ε)
e = |((v² − μ/r)·r − (r·v)·v)| / μ
r_p = a(1 − e),   r_a = a(1 + e),   T = 2π√(a³/μ)
```

The eccentricity vector is better conditioned near e = 0 than
`√(1 + 2εh²/μ²)`. A state is an orbit when periapsis is above 140 km. The
flight result reports the elements at the end of the simulation.

## Loss budget

During powered flight the simulator accumulates

```
Δv_spent    = Σ (T/m)·dt
gravity     = Σ g·sin(γ)·dt              γ = flight-path angle, γ ≥ 0
drag        = Σ (D/m)·dt                 while thrusting only
steering    = Σ (T/m)·(1 − cos α)·dt
```

Max-Q and drag loss are ascent quantities: max-Q is taken from samples before
apogee, and reentry deceleration is not counted as a loss.

## Cost

`computeDerived` reports a program cost in arbitrary units, used by mission 7:

- liquid engines: `F_vac/10⁴ · cycle factor · count · 0.9`, with cycle
  factors 1 (pressure-fed), 1.8 (electric pump), 2.6 (gas generator) and
  4.2 (staged combustion);
- tanks: shell mass × material cost index × 0.05, COPV mass × 0.6, and 30 for
  a common bulkhead;
- solid stages: `0.12·m_propellant + 0.25·m_dry`;
- interstages ×0.08 and upper works ×0.15 of their mass.
