export interface Settings {
  baseCurrency: string;
  watchlist: string[];
  intradayDuringMarketHours: boolean;
  pushInterval: number;
  pushPositions: 'none' | 'all' | 'select';
  pushTickers?: string[];
}
