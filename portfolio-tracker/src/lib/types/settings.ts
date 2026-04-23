export interface Settings {
  baseCurrency: string;
  watchlist: string[];
  intradayDuringMarketHours: boolean;
  pushInterval: number;
  /** false = disabled, ["*"] = all tickers, ["ASTS", ...] = specific tickers */
  pushPositions: false | string[];
}
