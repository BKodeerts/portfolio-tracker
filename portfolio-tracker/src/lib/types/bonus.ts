export type BonusType = 'warrant' | 'call_option';

export interface BonusItem {
  id: string;
  label: string;
  type: BonusType;
  underlying: string;     // Yahoo symbol of underlying
  strike: number;
  expiry: string;         // YYYY-MM-DD
  quantity: number;
  grantPrice: number;     // price paid per unit in EUR
  multiplier?: number;    // contracts multiplier (default 1)
  // Computed fields from server Black-Scholes
  currentPrice?: number;
  underlyingPrice?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  impliedVol?: number;
  intrinsicValue?: number;
  timeValue?: number;
  totalValue?: number;
  totalCost?: number;
  pl?: number;
  plPct?: number;
  isOtm?: boolean;
  // Belgian tax (warrants)
  vaa?: number;
  atn?: number;
}

export interface BonusHistoryPoint {
  date: string;
  value: number;
  underlyingPrice?: number;
}
