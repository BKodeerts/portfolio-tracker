import { COLOR_PALETTE, PRESET_COLORS } from '$lib/constants';

const assigned: Record<string, string> = {};
let paletteIdx = 0;

export function getColor(ticker: string): string {
  if (!assigned[ticker]) {
    assigned[ticker] = PRESET_COLORS[ticker] ?? COLOR_PALETTE[paletteIdx++ % COLOR_PALETTE.length] ?? '#818cf8';
  }
  return assigned[ticker]!;
}

/** Seed colors from the portfolio store so colors are stable across page loads. */
export function seedColors(colors: Record<string, string>): void {
  for (const [ticker, color] of Object.entries(colors)) {
    assigned[ticker] = color;
  }
}
