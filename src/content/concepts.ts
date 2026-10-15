/**
 * The engineering-handbook concept registry. Every id named by a mission's
 * newConcepts array in campaign/catalog.ts appears here, in campaign order.
 * Bodies are mini-markdown (src/content/render.ts): **bold**, *italic*,
 * `code`, - lists, {eq:<id>} live equations, {term:<conceptId>} cross-links.
 */
import type { MissionId } from '../schema.ts';

export interface Concept {
  id: string;
  title: string;
  unlockedBy: MissionId;
  /** Mini-markdown body. */
  body: string;
  /** Governing equations from src/eq/specs (rendered live above the body). */
  eqIds: string[];
}

export const CONCEPTS: Concept[] = [
  // ————— M1 · First Flight —————
  {
    id: 'tsiolkovsky',
    title: 'The Rocket Equation',
    unlockedBy: 'first-flight',
    eqIds: ['tsiolkovsky'],
    body: `Everything a rocket can do is written in one line: velocity gained equals exhaust velocity times the *logarithm* of the mass ratio. Two things matter — how fast you throw propellant out the back (**vₑ**, which is Isp·g₀), and what fraction of the vehicle is propellant. Nothing else. Not thrust, not size, not cleverness.

The logarithm is the tyranny. Doubling propellant does *not* double Δv; each additional m/s costs exponentially more mass, because the propellant you add must itself be accelerated before it is burned. That is why {term:mass-fraction} dominates vehicle design, and why {term:staging} — throwing away empty tanks mid-flight — is the only honest escape.

Work the equation backwards from your mission: required Δv fixes the mass ratio, the mass ratio fixes the vehicle. The rest of this handbook is commentary.

**In the field:** Tsiolkovsky derived it in 1897 as a schoolteacher's thought experiment; sixty years later it sized the R-7 that carried Sputnik.`,
  },
  {
    id: 'twr',
    title: 'Thrust-to-Weight Ratio',
    unlockedBy: 'first-flight',
    eqIds: ['twr'],
    body: `Thrust-to-weight is the ratio of what the engine pushes to what gravity pulls. Below 1.0 the vehicle stays bolted to the planet, burning propellant to accomplish nothing. Just above 1.0 it *crawls* — and every second spent crawling costs g₀ ≈ 9.8 m/s of Δv in pure {term:gravity-loss}.

So more is better? Only to a point. High T/W means a heavier engine (dead mass at burnout), harder structural loads, and a faster dive into the thick lower atmosphere where {term:max-q} and {term:drag} punish speed. Sounding rockets fly happily at T/W 4–8; orbital first stages settle near 1.2–1.6, a negotiated peace between gravity loss and everything else.

Note that T/W *rises* through the burn as propellant leaves: an engine sized for a gentle liftoff can end its burn pulling brutal acceleration.

**In the field:** Saturn V lifted off at T/W ≈ 1.2 — it took almost nine seconds to clear its own tower.`,
  },
  {
    id: 'drag',
    title: 'Aerodynamic Drag',
    unlockedBy: 'first-flight',
    eqIds: ['drag', 'dynamic-pressure'],
    body: `Drag is dynamic pressure times a shape coefficient times frontal area. Each factor tells you where the losses live: **q** grows with the *square* of airspeed and dies with altitude; **C_d** is geometry and Mach number (it spikes through the {term:transonic-drag} rise); **A** is the price of diameter — a rocket twice as fat pays four times the drag.

That squared-diameter penalty is why sounding rockets are long and thin, and why fineness ratio is a real design variable, not aesthetics. It is also why drag mostly doesn't matter for big vehicles: drag scales with area, but mass scales with volume, so large rockets lose only ~100–150 m/s to drag while small ones can lose several times that.

Minimize drag losses by climbing out of the atmosphere *before* going fast — which trades directly against {term:gravity-loss}. Ascent design is the argument between those two terms.

**In the field:** on a 1 km hobby flight, drag can eat a third of the theoretical apogee — the classic first surprise of model rocketry.`,
  },
  {
    id: 'static-stability',
    title: 'Static Stability (CP vs CG)',
    unlockedBy: 'first-flight',
    eqIds: ['static-margin'],
    body: `An unguided rocket is a weathervane. Disturb it, and aerodynamic forces act through the **center of pressure**; inertia acts through the **center of gravity**. If CP sits *behind* CG, a gust makes forces that push the nose back to prograde — stable. If CP leads CG, the same forces amplify the disturbance and the vehicle swaps ends in under a second.

The margin is measured in *calibers* (body diameters). Convention wants 1–2: below 1 is marginal, negative is a tumble, and much above 2 the rocket weathercocks — it obediently turns into every crosswind and flies sideways off the range.

Fins move CP aft. Nose ballast moves CG forward — dead mass bought purely for geometry, the oldest trick in sounding rocketry. Both cost performance; the equation doesn't care.

**In the field:** the Barrowman equations, published in a 1966 NARAM paper, still size the fins of nearly every amateur rocket flown today.`,
  },
  {
    id: 'rail-exit',
    title: 'Rail-Exit Speed',
    unlockedBy: 'first-flight',
    eqIds: ['rail-exit'],
    body: `Fins only stabilize a rocket that is *moving* — their corrective force grows with q, which grows with airspeed squared. For the first few meters of flight the vehicle has almost none, so the launch rail must do the fins' job until the air can take over.

The kinematics are freshman physics: net acceleration (T/W − 1)·g₀ over rail length L gives the exit speed. The requirement comes from the wind: at rail exit, the vehicle's angle of attack is roughly \`wind speed / exit speed\`. Leave the rail at 15 m/s into a 5 m/s crosswind and you are flying 18° sideways — enough to weathercock hard or shred the trajectory. The working rule: **exit above ~20 m/s**, faster on windy days.

Fixes are blunt: a longer rail, a higher-thrust motor, or a lighter vehicle. There is no aerodynamic cleverness below flying speed.

**In the field:** range safety officers scrub amateur launches when wind exceeds ~20 knots — the rail equation, applied as policy.`,
  },

  // ————— M2 · The Kármán Line —————
  {
    id: 'mass-fraction',
    title: 'Propellant Mass Fraction',
    unlockedBy: 'karman-line',
    eqIds: ['mass-fraction'],
    body: `ζ is the fraction of liftoff mass that is propellant — the single number that decides whether your vehicle is a rocket or a monument. The rocket equation only sees the mass *ratio*, and the mass ratio is set by whatever isn't propellant: tanks, case, fins, avionics, payload.

{eq:tsiolkovsky}

To reach 100 km on a single solid, you need ζ in the mid-0.8s. That sounds achievable until you tally the parasites: the motor case scales with propellant load *and* chamber pressure ({term:hoop-stress}); fins big enough for stability; ballast bought for CG. Every kilogram of structure displaces a kilogram of propellant at fixed liftoff mass — and unlike propellant, it never leaves.

This is why materials matter, why minimum gauge matters, and why the discipline of weighing every part is the oldest rite of rocketry.

**In the field:** Japan's SS-520, the smallest orbital launcher ever flown, is essentially a ζ-optimization exercise — a 2.6 t sounding rocket that put 4 kg in orbit.`,
  },
  {
    id: 'max-q',
    title: 'Maximum Dynamic Pressure',
    unlockedBy: 'karman-line',
    eqIds: ['dynamic-pressure'],
    body: `Dynamic pressure is the ½ρv² term the atmosphere charges for speed. On ascent it is a race between two exponentials: v² rising as the vehicle accelerates, ρ collapsing as it climbs. Their product peaks — **max-q** — typically between 8 and 14 km altitude, and that single moment sizes most of the airframe.

At max-q every aerodynamic load is at its worst: bending from angle of attack, {term:fin-flutter} margins, fairing loads, the works. Structure carried to survive that one second is carried, dead, all the way to burnout.

You can move the peak. Throttling down through the transonic band — the {term:throttle-bucket} — caps q at the cost of a little {term:gravity-loss}. Solid motors can't throttle, which is why sounding rockets are built like fence posts and guided vehicles grow throttle valves.

**In the field:** "Challenger, go at throttle up" — the Shuttle ran its mains at 65% through max-q on every flight; the callout marked the return to full power.`,
  },
  {
    id: 'transonic-drag',
    title: 'The Transonic Drag Rise',
    unlockedBy: 'karman-line',
    eqIds: ['drag'],
    body: `Between roughly Mach 0.8 and 1.2, drag coefficient doesn't creep — it *doubles*. As the vehicle nears the speed of sound, local flow over curved surfaces goes supersonic early, terminating in shock waves that radiate energy away as **wave drag**. Past Mach ~1.2 the shocks stabilize and C_d relaxes again.

You cannot avoid the barrier; you can only choose where to pay the toll. Punch through transonic while still low and the drag rise multiplies against high q — expensive. The nose shape matters most here: a von Kármán profile (minimum wave drag for its length) buys a measurably lower peak than a blunt ogive, which is why it is the default on anything fast.

Slender is the other lever: wave drag falls steeply with fineness ratio.

**In the field:** Richard Whitcomb's 1952 area rule — keep the *total* cross-section distribution smooth — gave transonic aircraft their pinched "coke-bottle" waists and is still baked into every launch vehicle's lines.`,
  },
  {
    id: 'fin-flutter',
    title: 'Fin Flutter',
    unlockedBy: 'karman-line',
    eqIds: [],
    body: `Flutter is aeroelasticity's murder weapon. A fin in flight is a spring: it bends, and it twists. Above a critical airspeed, the aerodynamic forces feed energy into those two modes faster than the structure can damp it — bending and torsion lock into a self-exciting oscillation whose amplitude *diverges*. From onset to structural failure is typically milliseconds. Telemetry shows a healthy vehicle, then no fin.

The flutter boundary scales brutally with thickness — stiffness in torsion goes roughly as t³ — and drops with altitude-corrected airspeed and panel aspect ratio. A fin that is perfectly stable at 200 m/s can flutter at 400. Since your max airspeed usually happens near {term:max-q}, that is where the check is run.

Defenses, in order of efficiency: thicker skin, stiffer material (steel over aluminum over composite layup mistakes), shorter span, more sweep.

**In the field:** flutter took a generation of 1940s aircraft and still eats high-performance amateur rockets — the classic post-mortem finds fin roots sheared clean, everything else nominal.`,
  },
  {
    id: 'gravity-loss',
    title: 'Gravity Loss',
    unlockedBy: 'karman-line',
    eqIds: ['twr'],
    body: `While the engine burns, gravity is subtracting g₀·sin(γ) from your acceleration every second — γ being the climb angle. Burn vertically and you pay the full 9.8 m/s per second; burn horizontally and you pay nothing. The integral of that subtraction over the whole burn is **gravity loss**, and for real ascents it is the dominant loss: 1.0–1.5 km/s to orbit, versus ~0.1 km/s for drag.

Two levers reduce it. Burn *harder* — higher {term:twr} shortens the time spent fighting gravity, which is why stubby high-thrust solids waste so little. Or burn *flatter*, earlier — pitch over and let the trajectory bend toward horizontal, which is the entire logic of the {term:gravity-turn}.

The tension: burning flatter keeps you in thick air longer and feeds {term:drag}; burning harder means heavier engines. Every ascent profile is a settlement of this dispute.

**In the field:** an Atlas booster burning to orbit spends roughly one of its nine kilometers-per-second just holding itself up.`,
  },

  // ————— M3 · Liquid Fire —————
  {
    id: 'cstar',
    title: 'Characteristic Velocity (c*)',
    unlockedBy: 'liquid-fire',
    eqIds: ['cstar'],
    body: `c* is combustion quality with the nozzle amputated. It measures how much chamber pressure a propellant combination generates per unit of mass flow through a given throat — pure thermochemistry: hot, light gas is good. It rises with flame temperature and falls with molecular mass, which is why hydrogen (M ≈ 10–13 in the exhaust) embarrasses kerosene (M ≈ 22–24) despite similar temperatures.

The engineer's virtue of c* is that it is measurable on the stand: chamber pressure times throat area over mass flow, three quantities you can instrument. Delivered over theoretical gives the combustion efficiency — a report card on your injector's mixing and your chamber's residence time, isolated from nozzle performance. The nozzle's contribution is graded separately by the {term:thrust-coefficient}.

Isp is their product: Isp = c*·C_F/g₀. Two clean multiplicative factors; diagnose them independently.

**In the field:** a well-developed injector delivers 92–98% of theoretical c* — the F-1's climb from ~89% to 93% consumed years of full-scale combustion-instability testing.`,
  },
  {
    id: 'thrust-coefficient',
    title: 'Thrust Coefficient (C_F)',
    unlockedBy: 'liquid-fire',
    eqIds: ['thrust', 'isp'],
    body: `If c* grades the chamber, C_F grades the nozzle. Thrust equals C_F·pc·At: chamber pressure pushing on throat area, amplified by the nozzle's expansion of hot gas into directed velocity. With no diverging bell at all, C_F ≈ 1.2 — the raw pressure thrust. A good bell raises it to 1.4 at sea level, 1.8–1.9 in vacuum.

C_F depends on the pressure ratio pc/pa, the area ratio ε, and γ — not on the propellant's chemistry. It is largest in vacuum, where no ambient pressure pushes back on the exit plane: the same hardware gains 10–20% thrust between the pad and space. That back-pressure term, pa·Ae, is also why huge nozzles at sea level can produce *negative* marginal thrust — see {term:nozzle-expansion}.

Together: Isp = c*·C_F/g₀. Chamber times nozzle. Two numbers, cleanly separable, fully diagnostic.

**In the field:** engine spec sheets always quote two thrusts — SL and vacuum. The delta is C_F arithmetic, nothing more.`,
  },
  {
    id: 'nozzle-expansion',
    title: 'Nozzle Expansion Ratio',
    unlockedBy: 'liquid-fire',
    eqIds: ['thrust'],
    body: `The area ratio ε = Ae/At sets how far the nozzle expands exhaust before releasing it — trading the gas's remaining pressure for exit velocity. Ideal expansion delivers the gas at exactly ambient pressure. Since ambient falls from 1 bar to zero during ascent, *every fixed nozzle is wrong at almost every altitude*.

Underexpanded (ε too small): gas exits above ambient, still holding pressure it could have converted to speed. Wasteful but benign. Overexpanded (ε too large): exit pressure falls below ambient, and the surrounding air squeezes performance away — and if pe drops below roughly a third of ambient, the **Summerfield criterion**, the flow separates from the wall asymmetrically. Separated nozzles slam side loads into the actuators; engines have been torn apart on ignition this way.

So first stages run modest ε (12–20) and swallow the vacuum penalty; upper stages, never lit in atmosphere, stretch to 80–150 — the {term:vacuum-nozzle}.

**In the field:** the RS-25 flew ε = 69 from sea level — tolerable only because 104% throttle kept its exit pressure just above separation.`,
  },
  {
    id: 'mixture-ratio',
    title: 'Mixture Ratio',
    unlockedBy: 'liquid-fire',
    eqIds: ['cstar'],
    body: `O/F is the oxidizer-to-fuel mass ratio at the injector, and its optimum is a small heresy: peak performance is *not* at stoichiometric. Burning exactly complete maximizes flame temperature, but c* wants √(T/M) — and running fuel-rich floats the exhaust with light molecules (CO, H₂ instead of CO₂, H₂O), dropping M faster than T. Kerosene engines peak near O/F 2.2–2.4 against a stoichiometric ~3.4; hydrogen engines run ~5.5–6.0 against 8.

The ratio also writes your tank architecture. LOX is dense; RP-1 less so; the O/F splits total propellant into two tank volumes, which sets lengths, dome count, and CG travel as they drain. Shift O/F and you are quietly redesigning the {term:hoop-stress} problem and the vehicle's stability history.

Run *too* rich and you trade Isp for soot — coked injectors and stained test stands.

**In the field:** the F-1 ran O/F 2.27, deliberately cool and rich — sacrificing Isp so the chamber wall survived 2500 K with 1960s metallurgy.`,
  },
  {
    id: 'hoop-stress',
    title: 'Hoop Stress',
    unlockedBy: 'liquid-fire',
    eqIds: ['hoop-stress'],
    body: `A pressurized cylinder wants to become a sphere, and hoop stress is the circumferential tension resisting it: σ = p·r/t, Barlow's formula, thin-wall membrane theory. It governs every tank and every motor case you will ever fly.

Read it as a scaling law. Stress grows with radius — so at fixed pressure, a fatter tank needs proportionally thicker wall, and since shell mass goes as surface area × thickness, tank mass scales roughly with *pressure × volume*. That product is the tyranny behind the {term:pressure-fed} spiral: raise feed pressure and every square meter of tank pays.

Sizing inverts the formula: t = p·r·SF/σ_yield, with the safety factor SF as your margin dial. Below ~1.5 mm aluminum you hit **minimum gauge** — walls too thin to weld and handle — where the material's strength stops mattering and lighter alloys stop helping.

**In the field:** the Atlas balloon tanks took Barlow to the limit — stainless walls so thin the vehicle collapsed without internal pressure; ground crews kept it inflated like a steel balloon.`,
  },
  {
    id: 'pressure-fed',
    title: 'The Pressure-Fed Cycle',
    unlockedBy: 'liquid-fire',
    eqIds: ['pressurant'],
    body: `The simplest way to feed an engine: pressurize the tanks *above* chamber pressure and let the plumbing do the rest. No pumps, no turbines, no ignition sequence for the feed system — just regulators and valves. It is the most reliable cycle ever flown, and the reason spacecraft thrusters are almost universally pressure-fed.

The catch is structural, and it compounds. Feed pressure must exceed pc by the injector drop — call it 1.3·pc. That pressure sets tank wall thickness through {term:hoop-stress}, so *tank mass scales with chamber pressure times tank volume*. Meanwhile the helium to hold that pressure needs its own COPV storage at 300 bar. Push pc past ~2 MPa and the spiral eats your {term:mass-fraction} alive; that ceiling caps your Isp, and no cleverness lifts it. Escaping the spiral is what {term:engine-cycles} are for.

**In the field:** the Apollo Service Module's pressure-fed AJ10 had to light behind the Moon, every time, with no second chances — simplicity was the mission requirement.`,
  },

  // ————— M4 · Pumps & Power —————
  {
    id: 'engine-cycles',
    title: 'Engine Power Cycles',
    unlockedBy: 'pumps-and-power',
    eqIds: ['isp'],
    body: `A pump-fed engine is two machines: the one that makes thrust, and the megawatt-class power plant that feeds it. *Where that power comes from* is the cycle — and it is the single decision that escapes the {term:pressure-fed} spiral, because pumps let a 0.25 MPa tank supply a 10 MPa chamber.

This program reduces each cycle to three numbers plus a restart count:

- **Pressure-fed** — no pump. η_c* 0.94, engine T/W 35, throttles to 40%, restarts effectively unlimited.
- **Gas-generator** — a side burner spins the turbine, exhaust overboard. η_c* 0.98, T/W 90, floor 60%, one restart.
- **Electric-pump** — motors and a battery. η_c* 0.96, T/W 70, floor 30%, and no restarts at all.
- **Staged combustion** — preburner gas drives the turbine *into* the chamber. η_c* 0.985, T/W 110, floor 55%, two restarts.

**In the field:** the V-2's turbopump ran on steam from hydrogen-peroxide decomposition — a drive borrowed, almost unchanged, from German fire-brigade pump practice.`,
  },
  {
    id: 'open-cycle-tax',
    title: 'The Open-Cycle Tax',
    unlockedBy: 'pumps-and-power',
    eqIds: ['isp'],
    body: `A gas-generator burns a small, deliberately cool, deliberately fuel-rich slice of the propellant to spin the turbine, then throws that gas over the side. It never sees the chamber or the bell, and leaves at roughly a *sixth* of core exhaust velocity — propellant you paid to tank, lift, and accelerate, in exchange for almost no impulse.

This program models the bleed as ~2.5% of total flow at that miserable exit speed: total flow becomes core flow ÷ 0.979, thrust unchanged, so **delivered Isp falls 2.1%** versus the same chamber on a closed cycle. On a 300 s first stage that is about 6 seconds — small next to what the pumps bought you over {term:pressure-fed}, and large enough that {term:staged-combustion-cycle} exists to recover it.

The tax buys simplicity: the turbine runs at its own pressure, decoupled from the chamber, so the whole engine is easier to start, throttle, and certify.

**In the field:** the Merlin's turbine exhaust dumps through a duct on the side of the nozzle — the sooty dark plume trailing the bright core on every Falcon 9 ascent is the tax, made visible.`,
  },
  {
    id: 'battery-trade',
    title: 'The Battery Trade',
    unlockedBy: 'pumps-and-power',
    eqIds: ['mass-fraction'],
    body: `Delete the turbine and drive the pumps with electric motors. You gain deep throttling (30% floor here, against 60% for a gas-generator), a start sequence with no pyrotechnics or spin-up gas, and no {term:open-cycle-tax} at all.

You pay in stored energy. This program sizes the pack from the hydraulics: pump power = ṁ·Δp/(ρ_bulk·η) with Δp = 1.25·pc and η = 0.65, integrated over the burn, at 250 Wh/kg with a 1.2 pack factor. Two consequences follow. Battery mass scales with **burn time**, so the cycle suits short-burning upper stages and punishes long first stages. And unlike propellant, *the pack never drains* — you carry every kilogram of it to burnout, where it sits in the dry mass term of {term:tsiolkovsky} doing nothing.

The sim also gives electric pumps **zero** restarts, which quietly disqualifies them from any coast-and-relight profile.

**In the field:** Rocket Lab's Rutherford is the flying proof — and Electron's second stage jettisons spent battery packs mid-burn rather than haul dead cells to orbit.`,
  },
  {
    id: 'cavitation',
    title: 'Cavitation & NPSH',
    unlockedBy: 'pumps-and-power',
    eqIds: ['pressurant'],
    body: `A pump impeller works by accelerating liquid, and accelerating liquid drops its static pressure. If the inlet pressure falls to the propellant's vapor pressure, the liquid *boils* right there on the blade — and the bubbles, sweeping into the high-pressure region downstream, collapse. Each collapse is a microscopic implosion driving a jet against the metal. Cavitation eats impellers, but it kills engines faster than that: the bubbly flow chokes the pump, head collapses, and the chamber starves.

The defense is **NPSH** — net positive suction head. Keep the tank pressurized above vapor pressure by a margin, and add an inducer ahead of the impeller to raise inlet pressure before the real work starts. This program models NPSH as a flat floor rather than a rotordynamic model: every pumped stage holds **0.25 MPa** minimum tank pressure ({term:hoop-stress} still charges for it), so you never see bubbles — you just pay the ullage mass.

**In the field:** Titan I's feed system taught the lesson through pogo, where structural bounce drives inlet pressure down toward vapor and thrust surges in sympathy; the fix was accumulators that detune the plumbing.`,
  },
  {
    id: 'throttle-bucket',
    title: 'The Throttle Bucket',
    unlockedBy: 'pumps-and-power',
    eqIds: ['dynamic-pressure'],
    body: `Pumps bring throttle authority, and the first thing to spend it on is {term:max-q}. Pull thrust back through the transonic band and the vehicle accelerates less exactly where ρ is still high — q peaks lower, every aerodynamic load scales down with it, and the airframe you must build to survive that second gets lighter.

The trace of thrust versus time shows a dip with a flat bottom: the **bucket**. This program drives it off dynamic pressure directly — the mission guidance names a \`fromQ\`, a \`toQ\`, and a level, and the engine throttles when q climbs past the entry threshold and recovers once the peak is passed and q falls below the exit. The M4 preset is 30 kPa in, 25 kPa out, at 75%.

Two limits bite. The commanded level is clamped to the cycle's throttle floor, so a gas-generator cannot go below 60% no matter what you ask. And every second at reduced thrust is bought with {term:gravity-loss}.

**In the field:** Falcon 9 throttles its center engines through max-Q on every flight — the pause you hear in the ascent audio before the callout.`,
  },

  // ————— M5 · Two Steps —————
  {
    id: 'staging',
    title: 'Staging',
    unlockedBy: 'two-steps',
    eqIds: ['tsiolkovsky'],
    body: `{term:tsiolkovsky} punishes dry mass with a logarithm, and there is exactly one way to cheat it: stop carrying the dry mass. Burn a stage empty, cut it loose, and the equation restarts with a new, much smaller m₀. Total Δv becomes a *sum* of logarithms instead of one — and sums grow linearly where logarithms crawl.

The bookkeeping trap is that each stage's "payload" is everything above it: upper stage, interstage, fairing, and the actual satellite. Design top-down. A kilogram added to the second stage costs several on the pad.

Nothing about it is free. You buy separation hardware, an interstage that is dead mass until the instant it becomes debris, a second engine, and a discrete event that must work — this program flies a 3-second separation coast, then a fresh ignition, with no second attempt at either. Staging is where reliability goes to die. See {term:delta-v-split} for how to divide the work.

**In the field:** the Saturn V's 2,000-tonne S-IC existed to give the S-II a running start — it burned for 2½ minutes and was never seen again.`,
  },
  {
    id: 'delta-v-split',
    title: 'The Δv Split',
    unlockedBy: 'two-steps',
    eqIds: ['tsiolkovsky'],
    body: `Two stages means deciding how to divide the mission Δv, and there is a real optimum. A stage's contribution is limited by its own structural fraction, so work assigned to a heavy-structure stage costs more propellant than the same work on a light one. Give more Δv to the stage with the better Isp and lighter structure — usually the upper, which flies a {term:vacuum-nozzle} and never fights the atmosphere.

For similar structural fractions, the classic result is a roughly even split; with a high-Isp upper stage, the balance shifts upward. Real two-stage-to-orbit vehicles land near 45/55 of the total ~9.3 km/s once {term:loss-budget} charges are counted against the first stage.

The optimum is **broad but not flat**: ±10% off the peak costs a few percent of payload, while a monster booster under a sliver of an upper — or the reverse — is catastrophic. Explore it; the surface is forgiving in the middle and cliff-edged at the ends.

**In the field:** Falcon 9 stages early, near 2.3 km/s, because recovering the booster is worth more than the optimum split.`,
  },
  {
    id: 'vacuum-nozzle',
    title: 'Vacuum Nozzles',
    unlockedBy: 'two-steps',
    eqIds: ['thrust'],
    body: `An upper stage lights above the atmosphere, so nothing pushes back on its exit plane. The pa·Ae term in the thrust equation vanishes, and {term:nozzle-expansion} stops being a compromise: expand as far as the hardware allows. Area ratios of 80–150 are routine, buying a C_F near 1.9 against a first stage's 1.4–1.5, worth 40–60 s of Isp on the same chamber.

The bell that gets you there would be lethal at sea level. At ε = 100 the exit pressure sits far below the Summerfield limit (this program flags separation when pe < 0.35·pa), and a separated nozzle slams asymmetric side loads into the gimbal actuators.

The cost is mass and length. Here, engine dry mass grows 0.4% per unit of ε beyond 15 — a big bell is a real structure, cooled or radiatively loaded, and it sets the interstage length that {term:staging} must carry.

**In the field:** the RL10B-2 solved the length problem with a carbon-carbon nozzle extension that deploys after separation — ε = 285, folded for the ride up.`,
  },
  {
    id: 'fairing-trade',
    title: 'The Fairing Trade',
    unlockedBy: 'two-steps',
    eqIds: ['drag'],
    body: `A satellite is a fragile, non-aerodynamic object. The fairing gives it a nose shape through the dense atmosphere, shields it from {term:max-q} pressure and the acoustic environment, and holds the aerothermal load off its blankets. Then, the moment the air thins, it becomes the purest dead mass on the vehicle: structure with no remaining function, riding the second stage all the way to orbit if you let it.

So jettison early — but not too early. Free-molecular heating on the bare payload has to fall below what its surfaces tolerate, which is the real gate. This program uses a dynamic-pressure proxy: the halves are released once the q peak is passed and q drops below the mission's threshold, typically 1000 Pa, and the nose share of the upper works leaves the mass ledger at that instant.

Every second of delay is Δv you spend accelerating a shell you are about to throw away.

**In the field:** Falcon 9's composite halves mass around 1.9 tonnes together — a full third of a GTO payload, whose entire working life is three minutes long.`,
  },
  {
    id: 'pitch-kick',
    title: 'The Pitch Kick',
    unlockedBy: 'two-steps',
    eqIds: [],
    body: `A rocket that flies straight up reaches space and falls back. To reach orbit it must end up horizontal — and the cheapest way to rotate is to nudge it once, early, then let gravity finish the job ({term:gravity-turn}).

The kick is that nudge: a few degrees of pitch commanded at low airspeed, where q is small enough that flying at an angle of attack neither snaps the vehicle nor costs much steering loss. This program executes it as a discrete event — at the commanded airspeed the attitude rotates downrange by the commanded angle, and from then on guidance blends toward air-relative prograde at 4°/s. Mission presets sit near 45–60 m/s and 5–17°.

The leverage is brutal. A degree at 50 m/s becomes hundreds of kilometers of downrange at cutoff, minutes later, with no way to take it back. Too shallow and you loft into a coast circularization cannot rescue; too steep and you spear into thick air at speed.

**In the field:** the Saturn V began its tilt-and-roll program at T+13 seconds and never again flew more than a couple of degrees off prograde.`,
  },

  // ————— M6 · The Gravity Turn —————
  {
    id: 'gravity-turn',
    title: 'The Gravity Turn',
    unlockedBy: 'gravity-turn',
    eqIds: ['twr'],
    body: `After the {term:pitch-kick}, stop steering. Point the vehicle straight along its own velocity vector and hold it there; gravity, pulling on a trajectory that is no longer vertical, does the rotating for you. The pitch angle bleeds off on its own, faster when speed is low and slower as speed builds — which is exactly the profile you want.

Two things make it optimal. Zero angle of attack means zero aerodynamic bending moment, so the airframe never carries a side load it did not have to. And the steering-loss term, integrated here as (F/m)·(1 − cos α), goes to zero when α does. You get the turn for free.

The catch is that the *only* control input is the kick, executed minutes before its consequences arrive. Guidance here follows air-relative prograde, blended at 4°/s — fast enough to track, slow enough that a bad kick stays bad. High {term:twr} steepens the resulting trajectory; low flattens it.

**In the field:** the Saturn V's S-IC flew a stored tilt table rather than true prograde — load relief in real winds was worth more than the last few m/s.`,
  },
  {
    id: 'vis-viva',
    title: 'The Vis-Viva Equation',
    unlockedBy: 'gravity-turn',
    eqIds: ['vis-viva'],
    body: `Conservation of energy, rearranged for orbits: specific energy ε = v²/2 − μ/r is constant, and equals −μ/2a. Solve for speed and you get the one line that answers every orbital question you will ask.

{eq:vis-viva}

Read it as: your speed depends only on where you are (**r**) and how big your orbit is (**a**). Circular orbits set r = a and collapse it to v = √(μ/r) — 7.78 km/s at 200 km altitude, using μ = 3.986×10¹⁴ m³/s². Ellipses run fast at periapsis and slow at apoapsis, and the whole of {term:oberth} is a corollary of that asymmetry.

Every burn is a bookkeeping entry against this equation. Want a higher apoapsis? Add speed at periapsis, which raises a. Want a circle? Add exactly the difference between your current speed at apoapsis and √(μ/r) there — the calculation {term:orbital-insertion} performs for you.

**In the field:** *vis viva*, "living force", was Leibniz's name for kinetic energy — the equation is older than orbital mechanics as a profession.`,
  },
  {
    id: 'loss-budget',
    title: 'The Loss Budget',
    unlockedBy: 'gravity-turn',
    eqIds: ['tsiolkovsky'],
    body: `A 200 km circular orbit needs 7.78 km/s of orbital speed. Your vehicle will spend about 9.3 km/s of Δv to get there. The 1.5 km/s difference is not waste to be engineered away — it is the price of leaving from the bottom of an atmosphere inside a gravity well, and accounting for it is how you diagnose an ascent.

This program integrates three terms during powered flight:

- **Gravity loss** — g·sin(γ) per second, thrust spent holding the vehicle up rather than speeding it along. Typically 1.0–1.5 km/s, by far the largest.
- **Drag loss** — D/m per second, counted only while thrusting. 50–150 m/s; smaller than beginners expect, since {term:drag} scales with area and mass with volume.
- **Steering loss** — (F/m)·(1 − cos α), the penalty for thrusting off the velocity vector. Near zero in a clean {term:gravity-turn}, and a warning sign when it is not.

Against these sits the {term:earth-rotation} credit — a rebate, not a loss.

**In the field:** a Saturn V ascent spent roughly 1,530 m/s on gravity and 40 m/s on drag — the ratio that shapes every launch vehicle.`,
  },
  {
    id: 'earth-rotation',
    title: "Earth's Rotation Credit",
    unlockedBy: 'gravity-turn',
    eqIds: [],
    body: `Sitting on the pad, you are already moving. The Earth turns once per sidereal day, so a point on the equator carries **465 m/s** of eastward inertial velocity, and every launch site carries 465·cos(latitude). Launch due east and orbit credits you that speed for free; it is the only line in the {term:loss-budget} that pays *you*.

The cosine is unforgiving. From the Cape at 28.5°N the credit is 409 m/s; from 32°N, 394; from Plesetsk at 62.9°N, barely 212. That is why equatorial sites are worth wars, and why launch azimuth is a payload decision — a polar orbit banks none of it.

The credit also creates the sim's nastiest gotcha, and one worth internalizing: the vehicle is born with 400-odd m/s of *inertial* speed but **zero airspeed**, because the atmosphere rotates with the ground. Guidance gates here read airspeed, never inertial speed. Confuse them and your kick fires on the pad.

**In the field:** Kourou sits at 5.2°N and banks 463 m/s — Ariane's standing structural advantage over every northern competitor.`,
  },
  {
    id: 'orbital-insertion',
    title: 'Orbital Insertion',
    unlockedBy: 'gravity-turn',
    eqIds: ['vis-viva'],
    body: `Altitude is easy; a sounding rocket did it in Mission 2. Orbit is *speed at altitude* — falling around the planet fast enough that the ground curves away as quickly as you drop. Two-thirds of the Δv goes horizontal.

The standard profile splits the job. Burn until apoapsis reaches your target altitude and cut off (MECO) — you are now on an ellipse whose periapsis is still inside the atmosphere. Coast up. Then, at apoapsis, burn horizontally to raise periapsis until the ellipse becomes a circle. Both halves are {term:vis-viva} arithmetic.

Two details here catch people out. The circularization burn *leads* apoapsis — it ignites when time-to-apoapsis is about half the burn duration, so the burn straddles the high point instead of chasing it. And it thrusts along the local horizontal with a small pitch bias against radial velocity, the way closed-loop guidance does. Success needs periapsis above 140 km; below that, drag decays the orbit within one revolution.

**In the field:** the Shuttle flew direct insertion — MECO left the orbiter on a suborbital arc, and OMS-2 at apoapsis made it an orbit.`,
  },

  // ————— M7 · Every Kilogram Counts —————
  {
    id: 'optimization',
    title: 'Design Optimization',
    unlockedBy: 'every-kilogram',
    eqIds: [],
    body: `Early in a design every slider pays. Add chamber pressure, gain Isp; drop a safety factor, gain payload. Then the gradients flatten. Near an optimum, every partial derivative is zero *by definition* — which means the last 2% of performance costs as much engineering as the first 40%, and the design stops being a search for a peak and becomes a negotiation between constraints.

Three things to hold onto. Optima are **coupled**: raising pc pulls {term:hoop-stress}, tank mass, {term:cavitation} margin, and cost all at once. Optima are **plateaus**, not spikes — see {term:delta-v-split} — so pick the manufacturable point, not the theoretical peak. And optima move when the objective does: this program's cost model is a simple bill of materials (thrust class × cycle factor, shell mass × material index, a flat premium for a {term:common-bulkhead}), not an industry estimate. Add a ceiling and the landscape tilts.

**In the field:** the X-33's composite hydrogen tank was optimal on paper and split during test in 1999 — the optimum in the analysis was not the optimum in the shop.`,
  },
  {
    id: 'margin-cost-triangle',
    title: 'Margin · Mass · Money',
    unlockedBy: 'every-kilogram',
    eqIds: ['hoop-stress'],
    body: `Safety factor, structural mass, and program cost sit at the corners of one triangle. Pull any corner and the other two move.

Drop the factor of safety and walls thin out — t = p·r·SF/σ_y — so mass falls and payload rises, right up until a weld land or a handling ding finds the margin you spent. Buy strength instead and money moves: Al-Li 2195 is 27% stronger and 5% lighter than Al-2219, at more than double the cost index here. Or buy neither and accept a smaller payload, which is cost by another name.

Launch vehicles fly ultimate factors near 1.25 (1.4 for crewed), well below aircraft practice, because every unnecessary tenth is payload burned on every flight. This program enforces a hard floor at **SF 1.15** — the weld-knockdown limit — below which the tank bursts at pressurization, at t = 0. That is not a fudge; it is where the material data stops supporting the arithmetic.

**In the field:** SpaceX's move from Al-Li to cheap stainless for Starship was this triangle argued in public — worse specific strength, better cryo behavior, a tenth the cost.`,
  },
  {
    id: 'common-bulkhead',
    title: 'The Common Bulkhead',
    unlockedBy: 'every-kilogram',
    eqIds: ['hoop-stress'],
    body: `Two separate tanks need four domes and an intertank barrel between them. Push them together so the aft dome of the oxidizer tank *is* the forward dome of the fuel tank, and you delete a dome pair plus the structure that spaced them — several percent of stage dry mass, and meters of vehicle length whose skin, wiring, and bending stiffness all vanish with it. This program credits exactly one dome pair's worth of shell mass.

Nothing is deleted for free. The shared dome carries a **differential** pressure that can reverse during the burn, so it must be designed for both signs. Worse, it is a thermal short: LOX at 90 K on one face, LH2 at 20 K on the other, and that gradient across a millimeter of aluminum will freeze oxygen or boil hydrogen unless the bulkhead is itself an insulator. The sim flags an uninsulated cryo/storable pairing, and charges a flat manufacturing premium — a double-walled dome is its own production line.

**In the field:** the Saturn S-II's honeycomb common bulkhead held that exact 20 K–90 K gradient and saved the stage several tonnes.`,
  },
  {
    id: 'staged-combustion-cycle',
    title: 'Staged Combustion',
    unlockedBy: 'every-kilogram',
    eqIds: ['isp'],
    body: `Burn *all* the propellant, twice. A preburner runs the full flow of one propellant with a little of the other — very rich or very lean, and therefore relatively cool — the resulting gas spins the turbine, and instead of going overboard it is injected into the main chamber and burned properly. The {term:open-cycle-tax} disappears: no flow leaves at a sixth of exhaust velocity, so this program gives the cycle η_c* 0.985 and the best delivered Isp on the board.

The bill arrives in pressure. The pumps must lift propellant *above* chamber pressure by the whole preburner and turbine pressure drop, so a 25 MPa chamber implies a 50 MPa pump discharge. Turbines run at full flow in hot, chemically vicious gas. Everything is stiffer, heavier per unit of margin, and far harder to start — the sim charges a 4.2× cost factor against the gas generator's 2.6, and a 55% throttle floor.

**In the field:** the US bought RD-180s through the 2000s because Soviet metallurgists had solved oxygen-rich turbine drive that American engineers had spent thirty years calling impossible.`,
  },

  // ————— M8 · High Energy —————
  {
    id: 'oberth',
    title: 'The Oberth Effect',
    unlockedBy: 'high-energy',
    eqIds: ['vis-viva'],
    body: `Δv is a velocity, but what a mission actually needs is *energy*. Kinetic energy goes as v², so the energy a burn delivers is d(v²/2) = v·dv — proportional to the speed you already had. The same kilogram of propellant, burned where you are moving fast, buys more orbit than where you are moving slow.

The consequence is counterintuitive and enormous: burn at **periapsis**, deep in the well, where {term:vis-viva} says you are fastest. From a 200 km circular parking orbit at 7.78 km/s, about 2.44 km/s of Δv throws apoapsis all the way to geostationary altitude. Try to make the same orbit change from a high, slow apoapsis and the cost multiplies.

There is no free lunch hidden here — energy is conserved. The exhaust simply carries away less residual kinetic energy when it is dropped from a fast-moving stage. This program models the injection burn as inertial-prograde thrust at the low point, which is exactly the maneuver.

**In the field:** New Horizons left Earth at 16.26 km/s on a single perigee burn — the fastest departure ever flown, and pure Oberth.`,
  },
  {
    id: 'high-energy-propellant',
    title: 'High-Energy Propellants',
    unlockedBy: 'high-energy',
    eqIds: ['cstar'],
    body: `{term:cstar} rewards hot, *light* exhaust — √(T/M) — and nothing in chemistry is lighter than hydrogen. LOX/LH2 running near O/F 5.5 gives this program a chamber around 3370 K with a mean exhaust molar mass of 12.5 g/mol, against kerosene's 22–24. The result is 450–465 s of vacuum Isp, roughly 50% more than {term:mixture-ratio}-optimized LOX/RP-1, and it compounds through the logarithm in {term:tsiolkovsky}.

The bill is *density*. Liquid hydrogen is 71 kg/m³ — a twelfth of RP-1. The same propellant mass needs vastly more tank volume, so shells grow, {term:hoop-stress} charges by surface area, insulation is mandatory rather than optional, and the vehicle gets long and fat. At 20 K there is also nowhere to hide from heat: see {term:boiloff}.

The trade resolves by stage. Down low, where structure and drag dominate, density wins. Up high, where Δv is long and dry mass is small, the Isp wins outright.

**In the field:** Centaur, the first hydrogen stage, broke up 54 seconds into its 1962 debut when the insulation panels tore away.`,
  },
  {
    id: 'boiloff',
    title: 'Cryogenic Boiloff',
    unlockedBy: 'high-energy',
    eqIds: [],
    body: `Liquid hydrogen boils at 20 K. Everything around it — sunlight, the Earth's infrared, the struts holding the tank, the residual gas in the ullage — is hundreds of degrees warmer. Heat gets in, hydrogen turns to gas, pressure rises, and you vent. It is a propellant leak with a thermodynamic cause, and it cannot be stopped, only slowed.

This program models it as a first-order heat leak proportional to the mass remaining: **0.2%/hour** with SOFI-class insulation (Centaur and SLS flight experience), **5× that** for a bare tank, applied during every unpowered coast. Insulation costs 1.5 kg/m² of tank surface, and running LH2 uninsulated raises a danger flag for a reason — over a long coast the stage simply drains.

The design consequence is that *time becomes a consumable*. A ten-minute parking coast is nothing; a multi-hour phasing coast is a design case. Run the tank dry mid-burn and the sim reports a boiloff shortfall against the Δv you did not get.

**In the field:** Centaur has flown coasts of several hours to reach direct-GEO and interplanetary windows — each one an insulation and vent-schedule argument.`,
  },
  {
    id: 'restart',
    title: 'Engine Restart',
    unlockedBy: 'high-energy',
    eqIds: [],
    body: `Relighting in orbit is not turning a valve. In free fall the propellant is not at the bottom of the tank — it is in blobs, anywhere — so the stage must first *settle* it with ullage thrusters, then chill the pumps and lines back down to cryogenic temperature (warm metal flashes the propellant to gas and the pump cavitates), spin up, and provide fresh ignition energy after a cold soak. Each restart is a small launch, and each one consumes a consumable: ullage propellant, helium, spin-start gas, or igniter charges.

So restarts are a hard, countable budget. This program allows, beyond the first ignition: **pressure-fed 99** (nothing to spin up), **staged combustion 2**, **gas-generator 1**, **electric-pump 0**. Ask for one you do not have and the relight is refused outright — the vehicle coasts, ballistic, with full tanks. It is the most avoidable mission loss in the campaign, and it is decided at design time by {term:engine-cycles}, not in flight.

**In the field:** the S-IVB relit exactly once per Apollo mission, for translunar injection, after ullage motors settled its hydrogen.`,
  },
  {
    id: 'mission-sequencing',
    title: 'Mission Sequencing',
    unlockedBy: 'high-energy',
    eqIds: [],
    body: `A GTO flight is not a launch, it is a timeline — and the budgets it spends are not all propellant. Here the sequence runs: ascent, MECO on apoapsis target, coast, **restart 1** to circularize into a 200 km parking orbit, a ten-minute coast around to the right point, then **restart 2** to inject at perigee where {term:oberth} pays.

Count that again: two restarts. A staged-combustion upper stage has exactly two. A gas-generator has one — it will circularize and then refuse the injection, leaving a good satellite in a useless orbit. An electric-pump stage has none. The propulsion decision you made three missions ago decides whether this profile is flyable at all.

Meanwhile the clock runs. Every minute of coast bleeds {term:boiloff} out of the hydrogen tank, and the Δv you planned assumes propellant that may not still be there. Sequencing is ordering the events so that all of these budgets — restarts, cryogens, and Δv — close simultaneously.

**In the field:** commercial GTO campaigns routinely trade longer coasts for lower-inclination injections, paying boiloff and battery to save the customer's own station-keeping propellant.`,
  },
];

export const CONCEPT_BY_ID: Record<string, Concept> = Object.fromEntries(
  CONCEPTS.map((c) => [c.id, c]),
);
