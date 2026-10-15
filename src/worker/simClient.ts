/**
 * Latest-wins client for the sim worker. Protocol: monotonic request id, at
 * most ONE sim in flight, a single pending slot that each new request
 * overwrites. Superseded callers resolve with the newest result when it lands
 * (they all feed the same preview slot in the store, so newest is correct).
 */
import type { Environment, FlightResult, RocketDesign } from '../physics/types.ts';
import type { SimRequest, SimResponse } from './simWorker.ts';

type Resolver = (r: FlightResult) => void;

let worker: Worker | null = null;
let nextId = 1;
let inFlight: { id: number; resolvers: Resolver[] } | null = null;
let pending: { design: RocketDesign; env: Environment; resolvers: Resolver[] } | null = null;

function ensureWorker(): Worker {
  if (worker !== null) return worker;
  worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<SimResponse>) => {
    const { id, result } = e.data;
    if (inFlight !== null && inFlight.id === id) {
      const { resolvers } = inFlight;
      inFlight = null;
      for (const resolve of resolvers) resolve(result);
    }
    if (inFlight === null && pending !== null) {
      const p = pending;
      pending = null;
      send(p.design, p.env, p.resolvers);
    }
  };
  return worker;
}

function send(design: RocketDesign, env: Environment, resolvers: Resolver[]): void {
  const id = nextId++;
  inFlight = { id, resolvers };
  const msg: SimRequest = { id, design, env };
  ensureWorker().postMessage(msg);
}

/** Run a full trajectory sim off-thread; resolves with the freshest result. */
export function requestPreview(design: RocketDesign, env: Environment): Promise<FlightResult> {
  return new Promise<FlightResult>((resolve) => {
    if (inFlight === null) {
      send(design, env, [resolve]);
    } else if (pending === null) {
      pending = { design, env, resolvers: [resolve] };
    } else {
      pending.design = design;
      pending.env = env;
      pending.resolvers.push(resolve);
    }
  });
}
