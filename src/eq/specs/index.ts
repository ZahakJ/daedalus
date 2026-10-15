/**
 * The authored equation library. Each spec names its binding ids; the bureau
 * supplies live EqValues under the same ids. Binding ids are global: 'm0'
 * here is the same m₀ as in the mass readout.
 */
import { frac, fn, grp, num, op, sqrt, sub, sup, sym, type EqSpec } from '../types.ts';

/** Δv = v_e · ln(m₀ / m_f) — Tsiolkovsky. */
export const tsiolkovsky: EqSpec = {
  id: 'tsiolkovsky',
  nodes: [
    sym('Δv', 'dv'),
    op('='),
    sub(sym('v', 've'), 'e'),
    op('·'),
    fn('ln', [frac([sub(sym('m', 'm0'), '0')], [sub(sym('m', 'mf'), 'f')])]),
  ],
};

/** T/W = F / (m₀ · g₀) — thrust-to-weight. */
export const twr: EqSpec = {
  id: 'twr',
  nodes: [
    sym('T/W', 'twr'),
    op('='),
    frac([sym('F', 'thrust')], [sub(sym('m', 'm0'), '0'), op('·'), sub(sym('g', 'g0'), '0')]),
  ],
};

/** q = ½ · ρ · v² — dynamic pressure. */
export const dynamicPressure: EqSpec = {
  id: 'dynamic-pressure',
  nodes: [
    sym('q', 'q'),
    op('='),
    frac([num('1')], [num('2')]),
    op('·'),
    sym('ρ', 'rho'),
    op('·'),
    sup(sym('v', 'airspeed'), [num('2')]),
  ],
};

/** D = q · C_d · A — drag force. */
export const drag: EqSpec = {
  id: 'drag',
  nodes: [
    sym('D', 'dragForce'),
    op('='),
    sym('q', 'q'),
    op('·'),
    sub(sym('C', 'cd'), 'd'),
    op('·'),
    sym('A', 'refArea'),
  ],
};

/** σ = p · r / t — hoop stress. */
export const hoopStress: EqSpec = {
  id: 'hoop-stress',
  nodes: [
    sym('σ', 'stress'),
    op('='),
    frac([sym('p', 'meop'), op('·'), sym('r', 'radius')], [sym('t', 'wall')]),
  ],
};

/** Isp = c* · C_F / g₀ — specific impulse. */
export const isp: EqSpec = {
  id: 'isp',
  nodes: [
    sub(sym('I', 'isp'), 'sp'),
    op('='),
    frac([sym('c*', 'cstar'), op('·'), sub(sym('C', 'cf'), 'F')], [sub(sym('g', 'g0'), '0')]),
  ],
};

/** c* = √(γ·R·T_c) / Γ(γ) — characteristic velocity. */
export const cstar: EqSpec = {
  id: 'cstar',
  nodes: [
    sym('c*', 'cstar'),
    op('='),
    frac(
      [sqrt([sym('γ', 'gamma'), op('·'), sym('R', 'rspec'), op('·'), sub(sym('T', 'tc'), 'c')])],
      [sym('Γ(γ)', 'vdk')],
    ),
  ],
};

/** F = C_F · p_c · A_t — thrust from chamber pressure and throat area. */
export const thrust: EqSpec = {
  id: 'thrust',
  nodes: [
    sym('F', 'thrust'),
    op('='),
    sub(sym('C', 'cf'), 'F'),
    op('·'),
    sub(sym('p', 'pc'), 'c'),
    op('·'),
    sub(sym('A', 'at'), 't'),
  ],
};

/** Static margin = (x_cp − x_cg) / d, in calibers. */
export const staticMargin: EqSpec = {
  id: 'static-margin',
  nodes: [
    sym('SM', 'staticMargin'),
    op('='),
    frac(
      [sub(sym('x', 'cp'), 'cp'), op('−'), sub(sym('x', 'cg'), 'cg')],
      [sym('d', 'diameter')],
    ),
  ],
};

/** v_rail = √(2 · (T/W − 1) · g₀ · L) — rail-exit speed. */
export const railExit: EqSpec = {
  id: 'rail-exit',
  nodes: [
    sub(sym('v', 'railExit'), 'rail'),
    op('='),
    sqrt([
      num('2'),
      op('·'),
      grp([sym('T/W', 'twr'), op('−'), num('1')]),
      op('·'),
      sub(sym('g', 'g0'), '0'),
      op('·'),
      sym('L', 'railLength'),
    ]),
  ],
};

/** m_He = 1.6 · p·V / (R_He · T) — pressurant mass. */
export const pressurant: EqSpec = {
  id: 'pressurant',
  nodes: [
    sub(sym('m', 'heMass'), 'He'),
    op('='),
    num('1.6'),
    op('·'),
    frac(
      [sym('p', 'meop'), op('·'), sym('V', 'tankVolume')],
      [sub(sym('R', 'rhe'), 'He'), op('·'), sym('T', 'the')],
    ),
  ],
};

/** v = √(μ(2/r − 1/a)) — vis-viva. */
export const visViva: EqSpec = {
  id: 'vis-viva',
  nodes: [
    sym('v', 'orbitalSpeed'),
    op('='),
    sqrt([
      sym('μ', 'mu'),
      op('·'),
      grp([frac([num('2')], [sym('r', 'orbitalRadius')]), op('−'), frac([num('1')], [sym('a', 'sma')])]),
    ]),
  ],
};

/** ζ (mass fraction) = m_p / m₀. */
export const massFraction: EqSpec = {
  id: 'mass-fraction',
  nodes: [
    sym('ζ', 'pmf'),
    op('='),
    frac([sub(sym('m', 'mp'), 'p')], [sub(sym('m', 'm0'), '0')]),
  ],
};

export const EQUATIONS: Record<string, EqSpec> = {
  tsiolkovsky,
  twr,
  'dynamic-pressure': dynamicPressure,
  drag,
  'hoop-stress': hoopStress,
  isp,
  cstar,
  thrust,
  'static-margin': staticMargin,
  'rail-exit': railExit,
  pressurant,
  'vis-viva': visViva,
  'mass-fraction': massFraction,
};
