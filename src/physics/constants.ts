/** Physical constants. Strict SI everywhere in src/physics/ — m, kg, s, N, Pa, K, rad. */

/** Standard gravity, m/s² — the g0 in Isp = c*·CF/g0. */
export const G0 = 9.80665;

/** Universal gas constant, J/(kmol·K) — pairs with molar mass in kg/kmol. */
export const R_UNIVERSAL = 8314.462;

/** Earth gravitational parameter μ = GM, m³/s². */
export const MU_EARTH = 3.986004418e14;

/** Earth mean radius, m (spherical model — ellipsoidal J2 effects are far below
    the fidelity of a 2D planar sim; documented approximation). */
export const R_EARTH = 6.371e6;

/** Earth rotation rate, rad/s — eastward launches bank ωE·RE·cos(lat) for free. */
export const OMEGA_EARTH = 7.2921159e-5;

/** Sea-level standard pressure, Pa. */
export const P0 = 101325;

/** Sea-level standard temperature, K. */
export const T0 = 288.15;

/** Specific gas constant of air, J/(kg·K). */
export const R_AIR = 287.053;

/** Ratio of specific heats for air. */
export const GAMMA_AIR = 1.4;

/** Helium molar mass, kg/kmol (pressurant sizing). */
export const M_HELIUM = 4.0026;
