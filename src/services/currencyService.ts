import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AssetType } from '../types/database';
import { fetchExchangeRate } from './stockService';

const ASSET_CURRENCY_STORAGE_KEY = '@my_dividend_asset_currencies';
const EXCHANGE_RATE_STORAGE_KEY = '@my_dividend_cached_exchange_rate';

// Popular US symbols list for instant heuristic identification
const KNOWN_US_SYMBOLS = new Set([
  'AAPL', 'MSFT', 'NVDA', 'AMD', 'INTC', 'GOOGL', 'GOOG', 'AMZN', 'META',
  'TSLA', 'KO', 'PEP', 'JNJ', 'V', 'MA', 'WMT', 'COST', 'JPM', 'O', 'DIS',
  'SCHD', 'SPY', 'QQQ', 'VOO', 'TSM', 'MCD', 'AVGO', 'CRM', 'ORCL', 'NFLX',
  'BAC', 'WFC', 'C', 'GS', 'MS', 'XOM', 'CVX', 'COP', 'SHEL', 'UNH', 'LLY',
  'ABBV', 'MRK', 'TMO', 'PFE', 'NKE', 'SBUX', 'HD', 'LOW', 'PG', 'CL',
  'CAT', 'HON', 'GE', 'LIN', 'BND', 'TLT', 'VNQ', 'JEPI', 'JEPQ',
]);

const KNOWN_TH_SYMBOLS = new Set([
  'PTT', 'PTTEP', 'CPALL', 'BDMS', 'SCB', 'KBANK', 'AOT', 'ADVANC', 'DELTA',
  'GULF', 'TRUE', 'BBL', 'KTB', 'SCC', 'BH', 'INTUCH', 'OR', 'CPN', 'MINT',
  'HANA', 'KCE', 'CCET', 'EA', 'SPRC', 'IRPC', 'BANPU', 'RATCH', 'EGCO',
  'TTB', 'TISCO', 'KKP', 'BCH', 'PR9', 'CHG', 'VIBHA', 'CPF', 'CBG', 'OSP',
  'CRC', 'HMPRO', 'GLOBAL', 'DOHOME', 'BEM', 'BTS', 'AAV', 'IVL', 'TU',
]);

/**
 * Checks whether an asset is a US stock based on:
 * 1. Explicit asset type (CASH is always THB)
 * 2. Saved preference in AsyncStorage
 * 3. Known US ticker symbols
 * 4. Withholding tax rate (15% indicates US W-8BEN treaty)
 */
export async function isUSStockAsset(
  symbol: string,
  assetType?: AssetType,
  taxRate?: number,
  assetId?: string
): Promise<boolean> {
  if (assetType === 'CASH') return false;

  const upper = (symbol || '').trim().toUpperCase();

  // If saved explicitly for this asset ID
  if (assetId) {
    const saved = await getAssetCurrency(assetId, symbol, taxRate, assetType);
    if (saved === 'USD') return true;
    if (saved === 'THB') return false;
  }

  // Known symbol lookup
  if (KNOWN_US_SYMBOLS.has(upper)) return true;
  if (KNOWN_TH_SYMBOLS.has(upper)) return false;

  // Tax rate heuristic: 15% is the standard US withholding tax under W-8BEN
  if (taxRate !== undefined && Math.abs(taxRate - 0.15) < 0.005) {
    return true;
  }

  // If Thai characters are present, it's definitely Thai
  if (/[\u0E00-\u0E7F]/.test(upper)) {
    return false;
  }

  return false;
}

/**
 * Synchronous check for known US symbol without async lookup.
 */
export function isKnownUSSymbol(symbol: string): boolean {
  return KNOWN_US_SYMBOLS.has((symbol || '').trim().toUpperCase());
}

/**
 * Retrieves the currency ('USD' | 'THB') of a specific asset.
 */
export async function getAssetCurrency(
  assetId: string,
  symbol: string,
  taxRate?: number,
  assetType?: AssetType,
  dbCurrency?: 'THB' | 'USD'
): Promise<'THB' | 'USD'> {
  if (assetType === 'CASH') return 'THB';
  if (dbCurrency) return dbCurrency;

  try {
    const raw = await AsyncStorage.getItem(ASSET_CURRENCY_STORAGE_KEY);
    if (raw) {
      const map: Record<string, 'THB' | 'USD'> = JSON.parse(raw);
      if (map[assetId]) {
        return map[assetId];
      }
    }
  } catch {
    // ignore
  }

  const isUS = await isUSStockAsset(symbol, assetType, taxRate);
  return isUS ? 'USD' : 'THB';
}

/**
 * Saves the selected currency of an asset into local storage and database.
 */
export async function setAssetCurrency(
  assetId: string,
  currency: 'THB' | 'USD'
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ASSET_CURRENCY_STORAGE_KEY);
    const map: Record<string, 'THB' | 'USD'> = raw ? JSON.parse(raw) : {};
    map[assetId] = currency;
    await AsyncStorage.setItem(ASSET_CURRENCY_STORAGE_KEY, JSON.stringify(map));

    if (assetId) {
      try {
        await supabase
          .from('assets')
          .update({ currency } as any)
          .eq('id', assetId);
      } catch {
        // Silently fallback if remote column not yet migrated
      }
    }
  } catch (err: any) {
    console.warn('Error saving asset currency:', err.message);
  }
}

/**
 * Loads all saved asset currencies into a map for instant lookup.
 */
export async function getAllAssetCurrencies(): Promise<Record<string, 'THB' | 'USD'>> {
  try {
    const raw = await AsyncStorage.getItem(ASSET_CURRENCY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Fetches the current USD to THB rate with local caching for instant display.
 */
export async function getCachedExchangeRate(): Promise<number> {
  try {
    const cached = await AsyncStorage.getItem(EXCHANGE_RATE_STORAGE_KEY);
    const liveRate = await fetchExchangeRate();
    if (liveRate && liveRate > 0) {
      await AsyncStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, liveRate.toString());
      return liveRate;
    }
    if (cached) {
      const parsed = parseFloat(cached);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return 34.00;
}

export const TX_CURRENCY_STORAGE_KEY = '@my_dividend_tx_currencies';

export interface TransactionCurrencyMeta {
  originalPrice: number;
  currency: 'THB' | 'USD';
  fxRate: number;
  assetId?: string;
}

/**
 * Saves original purchase currency and price for a specific transaction.
 */
export async function saveTransactionCurrencyMeta(
  txId: string,
  meta: TransactionCurrencyMeta
): Promise<void> {
  if (!txId) return;
  try {
    const raw = await AsyncStorage.getItem(TX_CURRENCY_STORAGE_KEY);
    const map: Record<string, TransactionCurrencyMeta> = raw ? JSON.parse(raw) : {};
    map[txId] = meta;
    await AsyncStorage.setItem(TX_CURRENCY_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to save transaction currency meta:', err);
  }
}

/**
 * Retrieves the original purchase currency and price for a specific transaction.
 */
export async function getTransactionCurrencyMeta(
  txId: string
): Promise<TransactionCurrencyMeta | null> {
  if (!txId) return null;
  try {
    const raw = await AsyncStorage.getItem(TX_CURRENCY_STORAGE_KEY);
    if (raw) {
      const map: Record<string, TransactionCurrencyMeta> = JSON.parse(raw);
      return map[txId] || null;
    }
  } catch {
    // fallback
  }
  return null;
}

/**
 * Loads all transaction currency metadata mappings.
 */
export async function getAllTransactionCurrencyMeta(): Promise<Record<string, TransactionCurrencyMeta>> {
  try {
    const raw = await AsyncStorage.getItem(TX_CURRENCY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Calculates the exact original USD weighted cost for an asset if transaction metadata exists.
 */
export async function getAssetAverageCostUSD(assetId: string): Promise<number | null> {
  if (!assetId) return null;
  try {
    const raw = await AsyncStorage.getItem(TX_CURRENCY_STORAGE_KEY);
    if (!raw) return null;
    const map: Record<string, TransactionCurrencyMeta> = JSON.parse(raw);
    const assetMetas = Object.values(map).filter(
      (m) => m.assetId === assetId && m.currency === 'USD' && m.originalPrice > 0
    );
    if (assetMetas.length === 0) return null;
    const total = assetMetas.reduce((sum, m) => sum + m.originalPrice, 0);
    return Number((total / assetMetas.length).toFixed(2));
  } catch {
    return null;
  }
}
