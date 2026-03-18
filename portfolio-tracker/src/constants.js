export const SERVER_BASE   = '.';
export const FX_SYMBOL     = 'EURUSD=X';
export const FX_FALLBACK   = 1.09;
export const BENCHMARK_SYM = 'VWCE.DE';
export const BENCHMARK_LBL = 'VWCE All-World';

// Supported non-EUR trading currencies and their Yahoo FX symbols (EUR-based)
export const FX_DEFS = {
  USD: { symbol: 'EURUSD=X', fallback: 1.09  },
  GBP: { symbol: 'EURGBP=X', fallback: 0.86  },
  GBX: { symbol: 'EURGBP=X', fallback: 0.86, scale: 100 },
  CLP: { symbol: 'EURCLP=X', fallback: 1000  },
  CHF: { symbol: 'EURCHF=X', fallback: 0.95  },
  SEK: { symbol: 'EURSEK=X', fallback: 11.5  },
  DKK: { symbol: 'EURDKK=X', fallback: 7.46  },
  NOK: { symbol: 'EURNOK=X', fallback: 11.5  },
  CAD: { symbol: 'EURCAD=X', fallback: 1.5   },
  AUD: { symbol: 'EURAUD=X', fallback: 1.65  },
  JPY: { symbol: 'EURJPY=X', fallback: 160   },
  MXN: { symbol: 'EURMXN=X', fallback: 20    },
  BRL: { symbol: 'EURBRL=X', fallback: 5.5   },
};

export const SUPPORTED_CURRENCIES = ['EUR', ...Object.keys(FX_DEFS)];

export const COLOR_PALETTE = [
  '#6366f1','#06b6d4','#f59e0b','#ef4444','#10b981','#eab308',
  '#8b5cf6','#fb923c','#84cc16','#f472b6','#22d3ee','#dc2626',
  '#64748b','#94a3b8','#a78bfa','#16a34a','#d946ef','#0284c7',
];

export const PRESET_COLORS = {
  ASTS:'#6366f1', RKLB:'#06b6d4', LUNR:'#f59e0b', SMR:'#ef4444',
  SXRT:'#10b981', PPFB:'#eab308', EUDF:'#8b5cf6',
  VWCE:'#64748b', IUIT:'#94a3b8', EXSA:'#78716c', EQQQ:'#a78bfa',
  ACHR:'#fb923c', LODE:'#84cc16', ATYR:'#f472b6', HODL:'#22d3ee', ZIM:'#dc2626',
};
