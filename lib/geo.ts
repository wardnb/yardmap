/**
 * Geo utilities — measurements, GPS, area calcs
 */

/** Earth radius in feet */
const EARTH_RADIUS_FT = 20_902_231;

/** Haversine distance between two [lng,lat] points in feet */
export function distanceFt(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const h =
    sinDlat * sinDlat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDlng * sinDlng;
  return 2 * EARTH_RADIUS_FT * Math.asin(Math.sqrt(h));
}

export function distanceM(a: [number, number], b: [number, number]): number {
  return distanceFt(a, b) / 3.28084;
}

/** Polyline total distance */
export function polylineDistanceFt(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += distanceFt(coords[i - 1], coords[i]);
  }
  return total;
}

/**
 * Shoelace formula — polygon area in sq ft
 * coords: array of [lng, lat]
 */
export function polygonAreaSqFt(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = toRad(coords[i][0]) * Math.cos(toRad(coords[i][1]));
    const yi = toRad(coords[i][1]);
    const xj = toRad(coords[j][0]) * Math.cos(toRad(coords[j][1]));
    const yj = toRad(coords[j][1]);
    area += xi * yj - xj * yi;
  }
  // Convert from steradians to sq ft
  return Math.abs(area / 2) * EARTH_RADIUS_FT * EARTH_RADIUS_FT;
}

export function sqFtToSqM(sqFt: number): number {
  return sqFt / 10.7639;
}

/** Mulch bags needed: area in sqFt, depth in inches, bag covers ~2cu ft */
export function mulchBags(sqFt: number, depthIn: number, cuFtPerBag = 2): number {
  const cuFt = (sqFt * depthIn) / 12;
  return Math.ceil(cuFt / cuFtPerBag);
}

/** Cubic yards of mulch (for bulk orders) */
export function mulchCuYd(sqFt: number, depthIn: number): number {
  const cuFt = (sqFt * depthIn) / 12;
  return Math.round((cuFt / 27) * 10) / 10;
}

/** How many plants fit in a bed — simple grid spacing */
export function plantCount(sqFt: number, spacingIn: number): number {
  const spacingSqFt = Math.pow(spacingIn / 12, 2);
  return Math.floor(sqFt / spacingSqFt);
}

/** Format feet nicely */
export function fmtFt(ft: number): string {
  if (ft < 1) return `${Math.round(ft * 12)}"`;
  if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`;
  return `${Math.round(ft)} ft`;
}

export function fmtM(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function fmtArea(sqFt: number): string {
  return `${Math.round(sqFt).toLocaleString()} sq ft`;
}
