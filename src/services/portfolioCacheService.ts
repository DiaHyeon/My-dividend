import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetSummary, Transaction, DividendSchedule } from '../types/database';

const PORTFOLIO_CACHE_KEY = '@my_dividend_portfolio_cache_v1';

export interface CachedPortfolioData {
  assets: AssetSummary[];
  transactions: Transaction[];
  dividendSchedules: DividendSchedule[];
  exchangeRate: number;
  cachedAt: number; // Unix timestamp ms
}

type OfflineNoticeListener = (message?: string) => void;
const offlineListeners = new Set<OfflineNoticeListener>();

/**
 * Triggers the global offline notice toast.
 */
export const notifyOffline = (message?: string) => {
  offlineListeners.forEach((fn) => {
    try {
      fn(message);
    } catch (e) {
      console.warn('Error in offline notice listener:', e);
    }
  });
};

/**
 * Subscribes to offline notice events. Returns an unsubscribe cleanup function.
 */
export const subscribeOfflineNotice = (fn: OfflineNoticeListener) => {
  offlineListeners.add(fn);
  return () => {
    offlineListeners.delete(fn);
  };
};

/**
 * Saves a fresh snapshot of portfolio data into AsyncStorage.
 * Enforces defensive soft-delete filtering (!is_archived).
 */
export const savePortfolioCache = async (data: {
  assets: AssetSummary[];
  transactions?: Transaction[];
  dividendSchedules?: DividendSchedule[];
  exchangeRate?: number;
}): Promise<void> => {
  try {
    const existingRaw = await AsyncStorage.getItem(PORTFOLIO_CACHE_KEY);
    const existing: CachedPortfolioData | null = existingRaw ? JSON.parse(existingRaw) : null;

    // Filter out archived assets defensively
    const cleanAssets = (data.assets || existing?.assets || []).filter((a) => !a.is_archived);

    const snapshot: CachedPortfolioData = {
      assets: cleanAssets,
      transactions: data.transactions !== undefined ? data.transactions : (existing?.transactions || []),
      dividendSchedules: data.dividendSchedules !== undefined ? data.dividendSchedules : (existing?.dividendSchedules || []),
      exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : (existing?.exchangeRate || 34.0),
      cachedAt: Date.now(),
    };

    await AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[portfolioCacheService] Failed to save portfolio cache:', error);
  }
};

/**
 * Retrieves the cached portfolio snapshot from AsyncStorage.
 * Returns null if no cache exists or if parsing fails.
 */
export const getCachedPortfolio = async (): Promise<CachedPortfolioData | null> => {
  try {
    const raw = await AsyncStorage.getItem(PORTFOLIO_CACHE_KEY);
    if (!raw) return null;

    const parsed: CachedPortfolioData = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.assets)) return null;

    // Defensive soft-delete filter
    parsed.assets = parsed.assets.filter((a) => !a.is_archived);

    return parsed;
  } catch (error) {
    console.warn('[portfolioCacheService] Failed to read portfolio cache:', error);
    return null;
  }
};

/**
 * Clears the portfolio cache if required.
 */
export const clearPortfolioCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PORTFOLIO_CACHE_KEY);
  } catch (error) {
    console.warn('[portfolioCacheService] Failed to clear portfolio cache:', error);
  }
};
