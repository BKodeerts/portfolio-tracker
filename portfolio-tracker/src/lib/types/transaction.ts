export interface Transaction {
  date: string;       // YYYY-MM-DD
  ticker: string;     // internal short name
  shares: number;     // negative = sale
  costEur: number;    // absolute EUR cost
  yahoo?: string;     // Yahoo Finance symbol (may differ)
  label?: string;     // display name
  isin?: string;
  currency?: string;  // stock trading currency (USD/EUR/etc.)
  type?: 'buy' | 'sell' | 'dividend';
  note?: string;
}
