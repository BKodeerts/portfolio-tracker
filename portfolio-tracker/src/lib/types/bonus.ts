export type BonusType = 'warrant' | 'call_option';

export interface BonusItem {
  id: string;
  label: string;
  type: BonusType;
  symbol: string;         // Yahoo symbol of underlying
  grantDate: string;      // YYYY-MM-DD
  strikePrice?: number;
  expiryDate?: string;    // YYYY-MM-DD
  quantity: number;
  grantPrice: number;     // price paid per unit in EUR
  ratio?: number;         // contracts multiplier (default 1)
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
