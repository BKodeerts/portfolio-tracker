import fxDefs from '../../shared/fx-defs.json';

export const BENCHMARK_SYM = 'VWCE.DE';
export const BENCHMARK_LBL = 'VWCE All-World';

export interface FxDef {
  symbol: string;
  fallback: number;
  scale?: number; // e.g. GBX = GBP / 100
}

// Single source of truth shared with server/domain/fx.js.
export const FX_DEFS: Record<string, FxDef> = fxDefs;

export const SUPPORTED_CURRENCIES = ['EUR', ...Object.keys(FX_DEFS)];

export const COLOR_PALETTE = [
  '#6366f1', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#eab308',
  '#8b5cf6', '#fb923c', '#84cc16', '#f472b6', '#22d3ee', '#dc2626',
  '#64748b', '#94a3b8', '#a78bfa', '#16a34a', '#d946ef', '#0284c7',
];

export const PRESET_COLORS: Record<string, string> = {
  ASTS: '#6366f1', RKLB: '#06b6d4', LUNR: '#f59e0b', SMR: '#ef4444',
  SXRT: '#10b981', PPFB: '#eab308', EUDF: '#8b5cf6',
  VWCE: '#64748b', IUIT: '#94a3b8', EXSA: '#78716c', EQQQ: '#a78bfa',
  ACHR: '#fb923c', LODE: '#84cc16', ATYR: '#f472b6', HODL: '#22d3ee', ZIM: '#dc2626',
};
