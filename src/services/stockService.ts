export interface StockSuggestion {
  symbol: string;         // Clean symbol (e.g., 'PTT', 'MCD', 'TSM')
  rawSymbol: string;      // Exchange symbol (e.g., 'PTT.BK', 'MCD', 'TSM')
  name: string;           // Company name
  market: 'US' | 'TH';
  exchange: string;       // 'SET', 'NYSE', 'NASDAQ', etc.
  currency: 'THB' | 'USD';
}

import { invokeStockProxy } from './proxyClient';
import { getLocalDateString } from '../utils/dateUtils';
import { registerSymbolCurrency } from './currencyService';

export function normalizeExchange(rawExch: string): string {
  const upper = (rawExch || '').toUpperCase();
  if (['NYQ', 'NYSE'].includes(upper)) return 'NYSE';
  if (['NMS', 'NGM', 'NCM', 'NAS', 'NASDAQ'].includes(upper)) return 'NASDAQ';
  if (['SET', 'BKK', 'MAI'].includes(upper)) return 'SET';
  if (['PCX', 'ARC', 'ASE', 'BATS', 'AMEX'].includes(upper)) return 'NYSE/AMEX';
  if (['PNK', 'OTC', 'OQX', 'OBB'].includes(upper)) return 'OTC';
  return upper || 'US';
}

// Preloaded popular stocks for instant 0ms autocomplete response
const POPULAR_STOCKS: StockSuggestion[] = [
  // Thai SET Stocks
  { symbol: 'PTT', rawSymbol: 'PTT.BK', name: 'PTT Public Company Limited', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'CPALL', rawSymbol: 'CPALL.BK', name: 'CP ALL Public Company Limited', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'BDMS', rawSymbol: 'BDMS.BK', name: 'Bangkok Dusit Medical Services', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'SCB', rawSymbol: 'SCB.BK', name: 'SCB X Public Company Limited', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'KBANK', rawSymbol: 'KBANK.BK', name: 'Kasikornbank Public Company Limited', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'AOT', rawSymbol: 'AOT.BK', name: 'Airports of Thailand', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'ADVANC', rawSymbol: 'ADVANC.BK', name: 'Advanced Info Service', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'DELTA', rawSymbol: 'DELTA.BK', name: 'Delta Electronics (Thailand)', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'GULF', rawSymbol: 'GULF.BK', name: 'Gulf Energy Development', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'TRUE', rawSymbol: 'TRUE.BK', name: 'True Corporation', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'BBL', rawSymbol: 'BBL.BK', name: 'Bangkok Bank', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'KTB', rawSymbol: 'KTB.BK', name: 'Krung Thai Bank', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'SCC', rawSymbol: 'SCC.BK', name: 'The Siam Cement Public Company Limited', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'BH', rawSymbol: 'BH.BK', name: 'Bumrungrad Hospital', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'INTUCH', rawSymbol: 'INTUCH.BK', name: 'Intouch Holdings', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'OR', rawSymbol: 'OR.BK', name: 'PTT Oil and Retail Business', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'CPN', rawSymbol: 'CPN.BK', name: 'Central Pattana', market: 'TH', exchange: 'SET', currency: 'THB' },
  { symbol: 'MINT', rawSymbol: 'MINT.BK', name: 'Minor International', market: 'TH', exchange: 'SET', currency: 'THB' },

  // US Stocks (S&P 500, NASDAQ, NYSE)
  { symbol: 'TSM', rawSymbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'MCD', rawSymbol: 'MCD', name: "McDonald's Corporation", market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'AAPL', rawSymbol: 'AAPL', name: 'Apple Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'MSFT', rawSymbol: 'MSFT', name: 'Microsoft Corporation', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'NVDA', rawSymbol: 'NVDA', name: 'NVIDIA Corporation', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'AMD', rawSymbol: 'AMD', name: 'Advanced Micro Devices, Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'INTC', rawSymbol: 'INTC', name: 'Intel Corporation', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'GOOGL', rawSymbol: 'GOOGL', name: 'Alphabet Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'AMZN', rawSymbol: 'AMZN', name: 'Amazon.com Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'META', rawSymbol: 'META', name: 'Meta Platforms Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'TSLA', rawSymbol: 'TSLA', name: 'Tesla Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'KO', rawSymbol: 'KO', name: 'The Coca-Cola Company', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'PEP', rawSymbol: 'PEP', name: 'PepsiCo Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'JNJ', rawSymbol: 'JNJ', name: 'Johnson & Johnson', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'V', rawSymbol: 'V', name: 'Visa Inc.', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'WMT', rawSymbol: 'WMT', name: 'Walmart Inc.', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'COST', rawSymbol: 'COST', name: 'Costco Wholesale Corporation', market: 'US', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'JPM', rawSymbol: 'JPM', name: 'JPMorgan Chase & Co.', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'O', rawSymbol: 'O', name: 'Realty Income Corporation', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'DIS', rawSymbol: 'DIS', name: 'The Walt Disney Company', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'SCHD', rawSymbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', market: 'US', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'SPY', rawSymbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', market: 'US', exchange: 'NYSE', currency: 'USD' },
];

let popularRegistered = false;
function ensurePopularRegistered() {
  if (!popularRegistered) {
    popularRegistered = true;
    POPULAR_STOCKS.forEach((p) => {
      registerSymbolCurrency(p.symbol, p.currency);
      registerSymbolCurrency(p.rawSymbol, p.currency);
    });
  }
}

/**
 * Searches US and Thai stocks matching the query.
 * Combines instant local catalog matches with live search results.
 */
export async function searchStocks(query: string): Promise<StockSuggestion[]> {
  ensurePopularRegistered();
  const cleanQuery = query.trim().toUpperCase();
  if (!cleanQuery) return [];

  // 1. Immediate local matching:
  // Priority 1: Symbol starts with cleanQuery (e.g. typing 'A' -> AAPL, ADVANC, AOT, AMD, AMZN)
  const startsWithLocal = POPULAR_STOCKS.filter((item) =>
    item.symbol.toUpperCase().startsWith(cleanQuery)
  );

  // Priority 2: Only if query has at least 3 characters, allow substring in symbol or name
  const containsLocal =
    cleanQuery.length >= 3
      ? POPULAR_STOCKS.filter(
          (item) =>
            !item.symbol.toUpperCase().startsWith(cleanQuery) &&
            (item.symbol.toUpperCase().includes(cleanQuery) ||
              item.name.toUpperCase().includes(cleanQuery))
        )
      : [];

  const localMatches = [...startsWithLocal, ...containsLocal];

  // 2. Fetch live suggestions from Supabase Edge Function (CORS-friendly on web & mobile)
  let liveMatches: StockSuggestion[] = [];
  const isShortTicker = !cleanQuery.includes('.') && cleanQuery.length <= 10 && /^[A-Z0-9]+$/.test(cleanQuery);

  try {
    const searchPromises = [invokeStockProxy({ action: 'search', query: cleanQuery })];
    if (isShortTicker) {
      searchPromises.push(invokeStockProxy({ action: 'search', query: `${cleanQuery}.BK` }));
    }

    const searchResponses = await Promise.allSettled(searchPromises);
    const quotes: any[] = [];
    for (const res of searchResponses) {
      if (res.status === 'fulfilled' && res.value?.data?.quotes) {
        quotes.push(...res.value.data.quotes);
      }
    }

    for (const q of quotes) {
      const rawSym = (q.symbol || '').toUpperCase();
      const exch = (q.exchange || '').toUpperCase();
      const shortname = q.shortname || q.longname || rawSym;

      const isThai = exch === 'SET' || exch === 'BKK' || exch === 'MAI' || rawSym.endsWith('.BK');
      const isUS = [
        'NYQ', 'NMS', 'NGM', 'NCM', 'NAS', 'NYSE', 'NASDAQ',
        'BATS', 'ARC', 'ASE', 'PCX', 'PNK', 'OTC', 'OQX', 'OBB', 'IEX', 'AMEX',
      ].includes(exch);

      if (isThai || isUS) {
        const displaySymbol = isThai && rawSym.endsWith('.BK') ? rawSym.replace('.BK', '') : rawSym;
        const resolvedCurrency: 'THB' | 'USD' = isThai ? 'THB' : 'USD';
        registerSymbolCurrency(displaySymbol, resolvedCurrency);
        registerSymbolCurrency(rawSym, resolvedCurrency);
        liveMatches.push({
          symbol: displaySymbol,
          rawSymbol: rawSym,
          name: shortname,
          market: isThai ? 'TH' : 'US',
          exchange: normalizeExchange(exch),
          currency: resolvedCurrency,
        });
      }
    }
  } catch (err: any) {
    // Fallback directly to Yahoo search if edge function unreachable
    try {
      const urls = [
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery)}&quotesCount=12&newsCount=0`,
      ];
      if (isShortTicker) {
        urls.push(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery + '.BK')}&quotesCount=6&newsCount=0`
        );
      }
      const fbResponses = await Promise.allSettled(urls.map((u) => fetch(u)));
      for (const fbRes of fbResponses) {
        if (fbRes.status === 'fulfilled' && fbRes.value.ok) {
          const fbData = await fbRes.value.json();
          const quotes = fbData.quotes || [];
          for (const q of quotes) {
            const rawSym = (q.symbol || '').toUpperCase();
            const exch = (q.exchange || '').toUpperCase();
            const isThai = exch === 'SET' || exch === 'BKK' || exch === 'MAI' || rawSym.endsWith('.BK');
            const isUS = [
              'NYQ', 'NMS', 'NGM', 'NCM', 'NAS', 'NYSE', 'NASDAQ',
              'BATS', 'ARC', 'ASE', 'PCX', 'PNK', 'OTC', 'OQX', 'OBB', 'IEX', 'AMEX',
            ].includes(exch);
            if (isThai || isUS) {
              liveMatches.push({
                symbol: isThai && rawSym.endsWith('.BK') ? rawSym.replace('.BK', '') : rawSym,
                rawSymbol: rawSym,
                name: q.shortname || rawSym,
                market: isThai ? 'TH' : 'US',
                exchange: normalizeExchange(exch),
                currency: isThai ? 'THB' : 'USD',
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Deduplicate and separate into Priority Tiers:
  // Tier 1: symbol starts with cleanQuery
  // Tier 2: symbol or name contains cleanQuery (only if cleanQuery length >= 3)
  const seen = new Set<string>();
  const tier1StartsWith: StockSuggestion[] = [];
  const tier2Contains: StockSuggestion[] = [];

  for (const item of [...localMatches, ...liveMatches]) {
    if (!seen.has(item.rawSymbol)) {
      seen.add(item.rawSymbol);
      if (item.symbol.toUpperCase().startsWith(cleanQuery)) {
        tier1StartsWith.push(item);
      } else if (cleanQuery.length >= 3) {
        tier2Contains.push(item);
      }
    }
  }

  // Sort Tier 1: exact match first, then shorter symbol length, then alphabetical
  tier1StartsWith.sort((a, b) => {
    const aSym = a.symbol.toUpperCase();
    const bSym = b.symbol.toUpperCase();
    if (aSym === cleanQuery) return -1;
    if (bSym === cleanQuery) return 1;
    if (aSym.length !== bSym.length) {
      return aSym.length - bSym.length;
    }
    return aSym.localeCompare(bSym);
  });

  const combined = [...tier1StartsWith, ...tier2Contains];
  return combined.slice(0, 6);
}

/**
 * Resolves the target ticker symbol for market queries based on asset currency.
 * Thai assets (THB) are automatically mapped to the SET market (.BK suffix).
 */
export function resolveTargetStockSymbol(
  symbol: string,
  rawSymbol?: string,
  preferredCurrency?: 'THB' | 'USD'
): string {
  let target = (rawSymbol || symbol).trim().toUpperCase();

  // If explicitly specified as THB, ensure it targets Thailand SET (.BK)
  if (preferredCurrency === 'THB') {
    if (!target.endsWith('.BK') && !target.includes('=')) {
      return `${target.replace(/\.BK$/i, '')}.BK`;
    }
    return target;
  }

  // If explicitly specified as USD, ensure it targets US market
  if (preferredCurrency === 'USD') {
    return target.replace(/\.BK$/i, '');
  }

  // Fallback when currency not explicitly provided:
  if (target.endsWith('.BK')) return target;

  return target;
}

/**
 * Fetches the closing / current regular market price for a given stock.
 */
export async function fetchStockPrice(
  symbol: string,
  rawSymbol?: string,
  preferredCurrency?: 'THB' | 'USD'
): Promise<number | null> {
  const targetSymbol = resolveTargetStockSymbol(symbol, rawSymbol, preferredCurrency);

  // 1. Try fetching via Supabase Edge Function (works on Web & Mobile without CORS error)
  try {
    const { data: json } = await invokeStockProxy({ action: 'quote', symbol: targetSymbol });
    if (json) {
      const meta = json.chart?.result?.[0]?.meta;
      const currency = meta?.currency;
      if (preferredCurrency) {
        registerSymbolCurrency(targetSymbol, preferredCurrency);
        registerSymbolCurrency(symbol, preferredCurrency);
      } else if (currency === 'USD' || currency === 'THB') {
        registerSymbolCurrency(targetSymbol, currency);
        registerSymbolCurrency(symbol, currency);
      }
      const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose;

      if (price !== undefined && price !== null && !isNaN(price)) {
        return Number(Number(price).toFixed(4));
      }
    }
  } catch (err: any) {
    console.warn(`Edge function quote error for ${targetSymbol}:`, err.message);
  }

  // 2. Direct Yahoo Finance Chart fallback with 5000ms timeout guard
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}?interval=1d&range=1d`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      const meta = json.chart?.result?.[0]?.meta;
      const currency = meta?.currency;
      if (preferredCurrency) {
        registerSymbolCurrency(targetSymbol, preferredCurrency);
        registerSymbolCurrency(symbol, preferredCurrency);
      } else if (currency === 'USD' || currency === 'THB') {
        registerSymbolCurrency(targetSymbol, currency);
        registerSymbolCurrency(symbol, currency);
      }
      const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose;

      if (price !== undefined && price !== null && !isNaN(price)) {
        return Number(Number(price).toFixed(4));
      }
    }
  } catch (err: any) {
    console.warn(`Direct quote fallback error for ${targetSymbol}:`, err?.message || err);
  }

  // 3. Fallback: If not found and doesn't end with .BK and preferredCurrency is not USD, try with .BK
  if (preferredCurrency !== 'USD' && !targetSymbol.endsWith('.BK') && !targetSymbol.includes('=')) {
    try {
      const bkPrice = await fetchStockPrice(`${targetSymbol}.BK`, undefined, 'THB');
      if (bkPrice !== null) return bkPrice;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Fetches the current live USD to THB exchange rate.
 * Defaults to 34.00 if unreachable.
 */
export async function fetchExchangeRate(): Promise<number> {
  try {
    const { data: json } = await invokeStockProxy({ action: 'quote', symbol: 'USDTHB=X' });
    if (json) {
      const meta = json.chart?.result?.[0]?.meta;
      const rate = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
      if (rate && !isNaN(rate) && rate > 0) {
        return Number(Number(rate).toFixed(2));
      }
    }
  } catch (err: any) {
    console.warn('Exchange rate fetch error:', err.message);
  }

  return 34.00;
}

export interface DividendPayout {
  amount: number;
  date: string;
  timestamp: number;
}

export interface DividendAnalysis {
  hasDividends: boolean;
  latestDpu: number;               // Latest dividend amount per share
  annualProjectedDpu: number;      // Projected total annual dividend
  frequency: number;               // Payouts per year (e.g., 4 = quarterly, 2 = semi-annual, 12 = monthly)
  frequencyLabel: string;          // Human-readable frequency label
  lastXdDate: string | null;       // Most recent XD date ('YYYY-MM-DD')
  projectedNextXdDates: string[];  // Next projected XD dates for the upcoming 12 months
  rawHistory: DividendPayout[];
}

/**
 * Fetches historical dividend payouts from Yahoo Finance,
 * analyzes payout frequency, and calculates forward projected DPU & schedules.
 */
export async function fetchDividendAnalysis(
  symbol: string,
  rawSymbol?: string,
  preferredCurrency?: 'THB' | 'USD'
): Promise<DividendAnalysis> {
  const targetSymbol = resolveTargetStockSymbol(symbol, rawSymbol, preferredCurrency);

  const emptyResult: DividendAnalysis = {
    hasDividends: false,
    latestDpu: 0,
    annualProjectedDpu: 0,
    frequency: 0,
    frequencyLabel: 'ไม่มีประวัติจ่ายปันผล (Non-dividend)',
    lastXdDate: null,
    projectedNextXdDates: [],
    rawHistory: [],
  };

  let rawDividends: any = null;

  // 1. Try Supabase Edge Function (CORS-friendly for Web & Mobile)
  try {
    const { data: json } = await invokeStockProxy({ action: 'dividends', symbol: targetSymbol });
    if (json) {
      const meta = json?.chart?.result?.[0]?.meta;
      const currency = meta?.currency;
      if (preferredCurrency) {
        registerSymbolCurrency(targetSymbol, preferredCurrency);
        registerSymbolCurrency(symbol, preferredCurrency);
      } else if (currency === 'USD' || currency === 'THB') {
        registerSymbolCurrency(targetSymbol, currency);
        registerSymbolCurrency(symbol, currency);
      }
      rawDividends = json?.chart?.result?.[0]?.events?.dividends;
    }
  } catch (err: any) {
    console.warn(`Edge function dividend fetch notice for ${targetSymbol}:`, err.message);
  }

  // 2. Direct Yahoo Finance fallback (works natively on React Native) with 6000ms timeout guard
  if (!rawDividends) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}?interval=1mo&range=5y&events=div`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const meta = json?.chart?.result?.[0]?.meta;
        const currency = meta?.currency;
        if (preferredCurrency) {
          registerSymbolCurrency(targetSymbol, preferredCurrency);
          registerSymbolCurrency(symbol, preferredCurrency);
        } else if (currency === 'USD' || currency === 'THB') {
          registerSymbolCurrency(targetSymbol, currency);
          registerSymbolCurrency(symbol, currency);
        }
        rawDividends = json?.chart?.result?.[0]?.events?.dividends;
      }
    } catch (err: any) {
      console.warn(`Direct dividend fetch fallback notice for ${targetSymbol}:`, err?.message || err);
    }
  }

  // If no dividend events recorded, check if it's a Thai stock that needs .BK suffix
  if (!rawDividends || Object.keys(rawDividends).length === 0) {
    if (preferredCurrency !== 'USD' && !targetSymbol.endsWith('.BK') && !targetSymbol.includes('=')) {
      try {
        const bkAnalysis = await fetchDividendAnalysis(`${targetSymbol}.BK`, undefined, 'THB');
        if (bkAnalysis && bkAnalysis.hasDividends) {
          return bkAnalysis;
        }
      } catch {
        // ignore
      }
    }
    return emptyResult;
  }

  // Parse and sort payouts descending (newest first)
  const payouts: DividendPayout[] = Object.values(rawDividends)
    .map((d: any) => {
      const ts = typeof d.date === 'number' ? d.date * 1000 : Date.now();
      const dateStr = getLocalDateString(new Date(ts));
      return {
        amount: Number(d.amount) || 0,
        timestamp: ts,
        date: dateStr,
      };
    })
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (payouts.length === 0) {
    return emptyResult;
  }

  const lastXdDate = payouts[0].date;
  const isThai = targetSymbol.endsWith('.BK') || preferredCurrency === 'THB';

  // Chronological ascending order
  const chrono = [...payouts].sort((a, b) => a.timestamp - b.timestamp);

  // Calculate median amount to identify outlier/special payouts
  const amounts = chrono.map((p) => p.amount).sort((a, b) => a - b);
  const medianAmount = amounts[Math.floor(amounts.length / 2)];

  // Detect special dividends (off-cycle or massive outlier amount)
  const regularPayouts: DividendPayout[] = [];
  for (let i = 0; i < chrono.length; i++) {
    const cur = chrono[i];
    const prev = i > 0 ? chrono[i - 1] : null;
    const next = i < chrono.length - 1 ? chrono[i + 1] : null;

    const dayDistPrev = prev ? (cur.timestamp - prev.timestamp) / 86400000 : 999;
    const dayDistNext = next ? (next.timestamp - cur.timestamp) / 86400000 : 999;

    const isOffCycle = dayDistPrev < 40 || dayDistNext < 40;
    const isOutlierAmount = chrono.length >= 4 && cur.amount >= medianAmount * 2.2;

    if (isOffCycle || isOutlierAmount) {
      // Considered special/one-off dividend
    } else {
      regularPayouts.push(cur);
    }
  }

  const validRegular = regularPayouts.length >= 2 ? regularPayouts : chrono;
  const latestDpu = Number(validRegular[validRegular.length - 1].amount.toFixed(4));

  // Calculate month gaps between consecutive regular payouts
  const gapsInMonths: number[] = [];
  for (let i = 1; i < validRegular.length; i++) {
    const d1 = new Date(validRegular[i - 1].timestamp);
    const d2 = new Date(validRegular[i].timestamp);
    const mDiff = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (mDiff > 0) gapsInMonths.push(mDiff);
  }

  // Count in trailing 13 months
  const oneYearAgo = payouts[0].timestamp - 395 * 86400000;
  const recentPayouts = validRegular.filter((p) => p.timestamp >= oneYearAgo);
  const countInYear = recentPayouts.length;

  let frequency = 4;
  let frequencyLabel = 'ทุกไตรมาส (Quarterly)';
  let intervalMonths = 3;

  if (gapsInMonths.length >= 1) {
    gapsInMonths.sort((a, b) => a - b);
    const medianGap = gapsInMonths[Math.floor(gapsInMonths.length / 2)];
    if (medianGap <= 1.5) {
      frequency = 12;
      frequencyLabel = 'รายเดือน (Monthly)';
      intervalMonths = 1;
    } else if (medianGap <= 4.5) {
      frequency = 4;
      frequencyLabel = 'ทุกไตรมาส (Quarterly)';
      intervalMonths = 3;
    } else if (medianGap <= 8) {
      frequency = 2;
      frequencyLabel = 'ปีละ 2 ครั้ง (Semi-annual)';
      intervalMonths = 6;
    } else {
      frequency = 1;
      frequencyLabel = 'ปีละ 1 ครั้ง (Annual)';
      intervalMonths = 12;
    }
  } else if (countInYear >= 10) {
    frequency = 12;
    frequencyLabel = 'รายเดือน (Monthly)';
    intervalMonths = 1;
  } else if (countInYear >= 3 && countInYear <= 5) {
    frequency = 4;
    frequencyLabel = 'ทุกไตรมาส (Quarterly)';
    intervalMonths = 3;
  } else if (countInYear === 2) {
    frequency = 2;
    frequencyLabel = 'ปีละ 2 ครั้ง (Semi-annual)';
    intervalMonths = 6;
  } else {
    // Only 1 payout or sparse history
    frequency = 1;
    frequencyLabel = isThai ? 'ปีละ 1 ครั้ง (Annual)' : 'ปีละ 1 ครั้ง (Annual) (ประมาณการ)';
    intervalMonths = 12;
  }

  const annualProjectedDpu = Number((latestDpu * frequency).toFixed(4));

  // Project next upcoming XD dates for the next 12 months
  const projectedNextXdDates: string[] = [];
  const now = new Date();
  let cursor = new Date(lastXdDate);

  // Advance cursor until it represents the next upcoming date after today
  while (cursor.getTime() <= now.getTime()) {
    cursor.setMonth(cursor.getMonth() + intervalMonths);
  }

  // Collect schedule dates for the next 12 months (up to 12 cycles for monthly dividend payers)
  const maxCycles = Math.min(frequency, 12);
  const origDay = new Date(lastXdDate).getDate();

  for (let i = 0; i < maxCycles; i++) {
    projectedNextXdDates.push(getLocalDateString(cursor));

    // Safely advance month avoiding 31st day overflow (e.g. Jan 31 -> Feb 28)
    const nextTotalMonth = cursor.getMonth() + intervalMonths;
    const nextYear = cursor.getFullYear() + Math.floor(nextTotalMonth / 12);
    const normalizedMonth = ((nextTotalMonth % 12) + 12) % 12;
    const maxDaysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
    const safeDay = Math.min(origDay, maxDaysInNextMonth);
    cursor = new Date(nextYear, normalizedMonth, safeDay);
  }

  return {
    hasDividends: true,
    latestDpu,
    annualProjectedDpu,
    frequency,
    frequencyLabel,
    lastXdDate,
    projectedNextXdDates,
    rawHistory: payouts,
  };
}
