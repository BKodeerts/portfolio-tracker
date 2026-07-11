export interface Settings {
  baseCurrency: string;
  watchlist: string[];
  intradayDuringMarketHours: boolean;
  pushInterval: number;
  /** false = disabled, ["*"] = all tickers, ["ASTS", ...] = specific tickers */
  pushPositions: false | string[];
  /** Meerwaardebelasting: exemption per person, doubled for couples. */
  taxHousehold: 'individual' | 'couple';
  /** Broker withholds 10% at sale (since 1 Jun 2026). */
  taxBrokerWithholds: boolean;
}
