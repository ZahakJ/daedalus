/**
 * Sim worker: a thin shell over physics.simulateFlight. One message in
 * ({id, design, env}), one message out ({id, result}) with every trajectory
 * channel's Float64Array buffer transferred, not copied.
 */
import { simulateFlight } from '../physics/index.ts';
import type { Environment, FlightResult, RocketDesign } from '../physics/types.ts';

export interface SimRequest {
  id: number;
  design: RocketDesign;
  env: Environment;
}

export interface SimResponse {
  id: number;
  result: FlightResult;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SimRequest>) => void) | null;
  postMessage(msg: SimResponse, transfer: Transferable[]): void;
};

ctx.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, design, env } = e.data;
  const result = simulateFlight(design, env);
  const transfers: ArrayBuffer[] = [];
  for (const channel of Object.values(result.table)) {
    if (channel instanceof Float64Array) {
      const buf = channel.buffer as ArrayBuffer;
      if (!transfers.includes(buf)) transfers.push(buf);
    }
  }
  ctx.postMessage({ id, result }, transfers);
};
