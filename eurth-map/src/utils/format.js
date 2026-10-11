// Shown in place of any stat that is missing (null) in nations.js
export const MISSING = "—";

export function formatPopulation(n) {
  if (n == null) return MISSING;
  return (n / 1_000_000).toFixed(1) + " million";
}

export function formatGdppc(n) {
  if (n == null) return MISSING;
  // Round to nearest 500 for display
  const rounded = Math.round(n / 500) * 500;
  return "A$" + rounded.toLocaleString("en-US");
}

export function formatGdp(population, gdppc) {
  if (population == null || gdppc == null) return MISSING;
  // Compute with raw (unrounded) numbers
  const gdp = population * gdppc;
  // Trillions keep two decimals; billions are whole (999.5+ billion would round to "1000 billion")
  if (gdp >= 999.5e9) return "A$" + (gdp / 1e12).toFixed(2) + " trillion";
  if (gdp >= 1e9) return "A$" + Math.round(gdp / 1e9) + " billion";
  return "A$" + (gdp / 1e6).toFixed(2) + " million";
}

export const DISTANCE_UNITS = {
  km: { label: "km", perKm: 1 },
  mi: { label: "mi", perKm: 1 / 1.609344 },
  nmi: { label: "nmi", perKm: 1 / 1.852 },
};

export function formatDistance(km, unit = "km") {
  const { label, perKm } = DISTANCE_UNITS[unit];
  const value = km * perKm;
  // One decimal under 100, whole units above
  const digits = value < 100 ? 1 : 0;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " " + label;
}

export function formatArea(km2, unit = "km") {
  const { label, perKm } = DISTANCE_UNITS[unit];
  const value = km2 * perKm ** 2;
  const digits = value < 100 ? 1 : 0;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " " + label + "²";
}

export function formatLandArea(n) {
  if (n == null) return MISSING;
  // Round to nearest 1000
  const rounded = Math.round(n / 1000) * 1000;
  return rounded.toLocaleString("en-US") + " km²";
}

// Same rule as the review page (overlay-tools/review.html parseNum), so both editors agree:
// accepts "48,000,000", "48 million", "48m", "1.2bn", "A$39,500", "248,153 km²". NaN = not a number.
export function parseNum(text) {
  const m = text.toLowerCase().replace(/[,\s]|a\$|km²|km2/g, "").match(/^(\d*\.?\d+)(k|m|million|bn|b|billion)?$/);
  if (!m) return NaN;
  const mult = { k: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }[m[2]] || 1;
  return Math.round(parseFloat(m[1]) * mult * 100) / 100;
}

// What a stored stat looks like in an input box; round-trips through parseNum unchanged
export function formatNumInput(v) {
  return v == null ? "" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
