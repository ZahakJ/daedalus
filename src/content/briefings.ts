/**
 * Program-office memos: the mission dossier's briefing text, one per mission.
 * Mini-markdown (src/content/render.ts) — same directives as the handbook.
 */
import type { MissionId } from '../schema.ts';

export const BRIEFINGS: Record<MissionId, string> = {
  'first-flight': `**FROM:** Program Office · **TO:** Design Bureau · **RE:** Vehicle DX-1

The Program begins where every program begins: a solid motor, four fins, and a parachute. The physics office has cleared a 1 km sounding corridor. Fly it, and bring the airframe home under canopy — hardware we recover is hardware we learn from.

The motor is fixed; the airframe is yours. Watch the relationship between {term:static-stability} and fin area — the preset flies, but the wind tunnel memo attached suggests it does not fly *straight*. A rocket that swaps ends at 40 m is a lawn dart with paperwork.

Rail exit speed and descent rate are both range-safety line items. Leave the rail slow and the crosswind sets your angle of attack for you ({term:rail-exit}); the signature failure on a first flight is not an explosion but a vehicle that departs the rail at 15 m/s, weathercocks, and flies a beautiful stable arc into the desert.

Objectives: 1 km apogee, airframe intact, and the recovery officer will hold you to 8 m/s at touchdown.`,

  'karman-line': `**FROM:** Program Office · **RE:** Vehicle DX-2 — 100 km sounding shot

The board has authorized a Kármán-line attempt. You now hold the full solid-motor design authority: grain mass, burn time, thrust profile, case material, and the airframe around it.

Understand what this altitude costs. One hundred kilometers on a single stage is a {term:mass-fraction} problem — every kilogram of case, fin, and ballast displaces propellant. The vehicle will pass {term:max-q} deep in the transonic band; the structures office flags {term:fin-flutter} as the loss-of-vehicle risk on thin fins.

Be clear about how this vehicle dies. Flutter gives no warning: telemetry is nominal, then a fin is gone, then the vehicle is tumbling at Mach 2 and the case is a scattering of parts. Torsional stiffness goes roughly as thickness cubed, so the fix is thickness and sweep, not hope.

Instrument package: 4 kg, non-negotiable. Recovery is not required above the line — but the airframe must survive to apogee intact.`,

  'liquid-fire': `**FROM:** Program Office · **RE:** Vehicle DX-3 — first liquid engine

Propulsion has released the LOX/RP-1 pressure-fed engine family to the bureau. For the first time the engine itself is on your drawing board: mixture ratio, chamber pressure, nozzle expansion — read the {term:cstar} and {term:thrust-coefficient} memos before touching the dials.

The trap in this architecture is documented at length: feed pressure must stand above chamber pressure, tank walls grow with both pressure and diameter ({term:hoop-stress}), and the helium budget grows with everything. Chase Isp too hard and the tanks will eat the vehicle.

The signature failure of this vehicle class is a nozzle chosen for vacuum and lit at sea level: exit pressure falls below a third of ambient, the flow separates asymmetrically off one wall, and the side loads tear the engine off its mounts in the first second ({term:nozzle-expansion}). The second is a tank wall sized below the weld floor, which bursts on the pad at pressurization.

Deliver a 20 kg instrument package to 150 km. The pad crew asks, again, that the nozzle not separate at ignition.`,

  'pumps-and-power': `**FROM:** Program Office · **RE:** Vehicle DX-4 — turbomachinery authorization

The pressure-fed spiral has been ruled a dead end above 2 MPa; the board has funded pumps. Gas-generator and electric-pump cycles are now available, with the throttle authority that comes with them.

Study the {term:open-cycle-tax} before selecting a cycle — turbine drive gas is propellant you paid to lift. The electric option trades that tax for {term:battery-trade} mass that never leaves the stage. Neither is free; the arithmetic decides, not the fashion.

Note the fine print, because it will outlive this mission: a cycle also buys — or forecloses — your restart budget and your minimum throttle. Gas-generator bottoms out at 60% thrust and relights once. Electric pumps throttle to 30% and **never** relight. Choose as though a coast-and-inject profile were three missions away, because it is.

Payload rises to 50 kg, target 250 km. A {term:throttle-bucket} through max-q is recommended by structures and resented by trajectory. Their memos are attached. Reconcile them.`,

  'two-steps': `**FROM:** Program Office · **RE:** Vehicle DX-5 — staging authorization

The rocket equation has been consulted and it is unmoved: one stage will not carry 500 kg where we are going. The board authorizes a second stage, interstage hardware, and a payload fairing.

{term:staging} resets the logarithm — but only if the split is right. Read the {term:delta-v-split} memo: a monster first stage under a sliver of an upper is as wasteful as the reverse. The upper stage may carry a true {term:vacuum-nozzle}; it must never light in the atmosphere.

Staging is also the largest new failure surface the Program has ever authorized. Two events must work, in sequence, unattended: separation after a 3-second coast, then ignition of an engine that has never run. Neither gets a second attempt, and a stage that separates cleanly and fails to light is indistinguishable, from the ground, from a stage that did neither.

Target: 500 km apogee, 400 km downrange, 500 kg. The {term:pitch-kick} is now flight-critical — degrees at 55 m/s become hundreds of kilometers at cutoff.`,

  'gravity-turn': `**FROM:** Program Office · **RE:** Vehicle DX-6 — orbital attempt

This is the one the Program was built for. A 200 km circular orbit: not altitude — *speed at altitude*. The full guidance suite is released: gravity-turn law, apoapsis-targeted cutoff, circularization at apoapsis.

The {term:gravity-turn} is unforgiving in a specific way: the entire ascent is decided by a pitch kick of a few degrees, executed below 100 m/s, minutes before its consequences arrive. Too shallow and you spear the atmosphere downrange; too steep and you loft into a coast that circularization cannot rescue.

Expect the signature near-miss: a vehicle that reaches 200 km with an apoapsis on target, coasts up, lights the circularization burn — and cuts off with periapsis still inside the atmosphere. That is not an orbit; that is a very expensive suborbital arc with good telemetry. Watch the {term:loss-budget}: if steering loss is not near zero, your kick was wrong and the turn spent the rest of the flight arguing with it.

Requirement: 200 km circular, eccentricity under 0.02, 100 kg. The debrief office has pre-printed the forms.`,

  'every-kilogram': `**FROM:** Program Office · **RE:** Vehicle DX-7 — cost-capped orbital delivery

New contract terms: one tonne to 400 km circular, under a 750-unit program cost ceiling. For the first time the accountants sit in the design reviews. Advanced materials, common bulkheads, and staged combustion are released — every one of them a {term:margin-cost-triangle} decision, not an upgrade.

The optimization memo is blunt: near the optimum, nothing is free. Staged combustion deletes the open-cycle tax and quadruples the engine invoice. Al-Li saves kilograms at a premium per kilogram. The {term:common-bulkhead} deletes a dome pair and adds a manufacturing line item.

One warning, in writing, because the ceiling invites it: safety factor is not a cost lever. The floor is 1.15 — the weld-knockdown limit — and a tank specified below it does not fly a degraded mission, it bursts at pressurization with the vehicle still on the pad. Trim mass from geometry, materials, and staging. Do not trim it from margin.

One tonne to 400 km circular, under 750 cost units. The board does not extend ceilings.`,

  'high-energy': `**FROM:** Program Office · **RE:** Vehicle DX-8 — geostationary transfer

Final campaign objective: 500 kg to GTO. The hydrogen upper stage is released — 450 seconds of Isp, purchased with 70 kg/m³ propellant density, mandatory insulation, and a {term:boiloff} clock that starts at liftoff.

The mission is a sequence, not a launch: park at 200 km, coast to the node, restart, and inject at the bottom of the well where the {term:oberth} effect pays best. Every minute of coast spends hydrogen; every restart spends ignition margin. Read the {term:mission-sequencing} memo twice.

Count the relights before you draw anything else. This profile needs two: one to circularize, one to inject. A gas-generator upper stage has one — it will make a perfect parking orbit and then refuse the burn that matters, and the vehicle will be a healthy satellite in a useless place. The other way to lose this mission is quieter: the hydrogen simply is not there when the second burn starts, and the debrief reads {term:boiloff} shortfall.

Deliver 500 kg to GTO and the Program's ledger closes complete. The museum has reserved the floor space.`,
};
