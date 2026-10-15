<p align="center"><img src="docs/media/banner.png" width="820" alt="daedalus: design a rocket, fly it, read the mishap report"></p>

daedalus is a rocket-design simulator: eight missions, from a 1 km solid
sounding rocket to geostationary transfer orbit, where every flight is a
deterministic physics simulation and every failure is traced to the design
value that caused it.

<p align="center">
  <img src="docs/media/campaign.png" width="400" alt="Campaign map: eight missions on a log altitude ladder from 1 km to 36,000 km">
  <img src="docs/media/frr.png" width="400" alt="Flight readiness review: structural, propulsion, weather and trajectory checks polled GO, MARGINAL or NO-GO">
</p>
<p align="center">
  <img src="docs/media/flight.png" width="400" alt="Range view during the GTO injection burn, with live telemetry strip charts and the event sequence">
  <img src="docs/media/debrief.png" width="400" alt="Flight report: flight path, margin timeline and the typeset report">
</p>

## Run

Requires Node 20.19+ and pnpm.

```sh
git clone https://github.com/ZahakJ/daedalus && cd daedalus
pnpm install
pnpm dev                    # http://localhost:5701
```

`pnpm build` writes a static site to `dist/`; `pnpm preview` serves it on
port 6701. `pnpm build:pages` builds for GitHub Pages under `/daedalus/`.

## Use

Pick the open mission on the campaign map and enter the design bureau. Each
decision card changes one part of the vehicle and shows the governing
equation with the current numbers in it; the cutaway, mass budget and
trajectory preview update as you drag. The flight readiness review polls
every margin, and each risk must be accepted by hand before launch. Watch
the flight, read the debrief, revise. Press `?` for help on any screen.

Share copies a link that opens your design read-only on anyone's machine;
from the flight or the debrief it opens that flight. Make it mine copies a
shared design into your own campaign.

Progress is saved in the browser's `localStorage`.

## How it works

- `src/physics/` is a pure, deterministic engine in SI units: USSA-1976
  atmosphere, CEA-derived combustion tables, isentropic nozzle flow,
  hoop-stress tank sizing, Barrowman stability, NACA TN 4197 fin flutter and
  thin-shell buckling.
- `simulateFlight(design, { weatherSeed })` integrates a 2D Earth-centred
  inertial trajectory with RK4, flying an open-loop guidance program through
  staging, gravity turn, circularization and restarts, and detects twelve
  failure modes in the loop.
- The bureau runs closed-form estimates on every edit and the full simulation
  in a Web Worker; the flight and debrief views re-run it from the stored
  design and seed instead of storing trajectories.
- Tests pin the physics to published values (USSA-1976 tables, Merlin, RL10
  and Raptor Isp, Kepler orbits) and fly a known-good design for every
  mission.

```sh
pnpm typecheck
pnpm test        # vitest: physics anchors, golden designs, every failure mode
pnpm smoke       # build, preview, load every route in headless Chromium
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): modules, data flow, persistence,
  rendering, tests.
- [Physics](docs/PHYSICS.md): every model and equation in the engine.
- [Campaign](docs/CAMPAIGN.md): missions, objectives, the readiness review
  and the debrief.

## License

[MIT](LICENSE)
