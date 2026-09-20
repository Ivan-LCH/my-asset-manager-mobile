/** Income Tax Act Art.55, national tax; 2026 rules held constant for projections. */
export function comprehensiveTax(taxableIncome: number): number {
  const t = Math.max(0, taxableIncome)
  if (t <= 14_000_000) return t * 0.06
  if (t <= 50_000_000) return t * 0.15 - 1_260_000
  if (t <= 88_000_000) return t * 0.24 - 5_760_000
  if (t <= 150_000_000) return t * 0.35 - 15_440_000
  if (t <= 300_000_000) return t * 0.38 - 19_940_000
  if (t <= 500_000_000) return t * 0.40 - 25_940_000
  if (t <= 1_000_000_000) return t * 0.42 - 35_940_000
  return t * 0.45 - 65_940_000
}

/** Preserved optional dividend-separation scenario, not automatic eligibility. */
export function separatedDividendTax(dividend: number): number {
  const d = Math.max(0, dividend)
  if (d <= 20_000_000) return Math.round(d * 0.154)
  if (d <= 300_000_000) return Math.round(3_080_000 + (d - 20_000_000) * 0.22)
  if (d <= 5_000_000_000) return Math.round(64_680_000 + (d - 300_000_000) * 0.275)
  return Math.round(1_357_180_000 + (d - 5_000_000_000) * 0.33)
}
