/** Display-edge unit converters. Physics is strict SI; ONLY the UI calls these. */

export const paToBar = (pa: number): number => pa / 1e5;
export const barToPa = (bar: number): number => bar * 1e5;
export const paToMPa = (pa: number): number => pa / 1e6;
export const paToAtm = (pa: number): number => pa / 101325;
export const paToKPa = (pa: number): number => pa / 1e3;

export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const mToKm = (m: number): number => m / 1e3;
export const kmToM = (km: number): number => km * 1e3;
export const mToMm = (m: number): number => m * 1e3;
export const mmToM = (mm: number): number => mm / 1e3;

export const kgToT = (kg: number): number => kg / 1e3;
export const nToKN = (n: number): number => n / 1e3;
export const mpsToKmh = (mps: number): number => mps * 3.6;
