import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AssetType } from '../types/database';
import { fetchExchangeRate } from './stockService';

const ASSET_CURRENCY_STORAGE_KEY = '@my_dividend_asset_currencies';
const EXCHANGE_RATE_STORAGE_KEY = '@my_dividend_cached_exchange_rate';

// Dynamic in-memory registry of symbol currencies discovered from API lookups, DB, or transactions
const dynamicCurrencySymbolsMap = new Map<string, 'THB' | 'USD'>();

/**
 * Registers a symbol's verified currency into the runtime dynamic cache.
 */
export function registerSymbolCurrency(symbol: string, currency: 'THB' | 'USD'): void {
  if (!symbol) return;
  dynamicCurrencySymbolsMap.set(symbol.trim().toUpperCase(), currency);
}

/**
 * Checks whether an asset is a US stock based on:
 * 1. Explicit currency parameter ('USD')
 * 2. Explicit asset type (CASH is always THB)
 * 3. Saved preference in database or AsyncStorage
 * 4. Dynamic registry of verified symbols
 * 5. Withholding tax rate (15% indicates US W-8BEN treaty)
 */
export async function isUSStockAsset(
  symbol: string,
  assetType?: AssetType,
  taxRate?: number,
  assetId?: string,
  currency?: 'THB' | 'USD'
): Promise<boolean> {
  if (assetType === 'CASH') return false;
  if (currency === 'USD') return true;
  if (currency === 'THB') return false;

  const upper = (symbol || '').trim().toUpperCase();

  // If Thai characters or .BK suffix, it's definitively Thai
  if (upper.endsWith('.BK') || /[\u0E00-\u0E7F]/.test(upper)) {
    return false;
  }

  // Check dynamic registry
  if (dynamicCurrencySymbolsMap.get(upper) === 'USD') return true;
  if (dynamicCurrencySymbolsMap.get(upper) === 'THB') return false;

  // If saved explicitly for this asset ID
  if (assetId) {
    const saved = await getAssetCurrency(assetId, symbol, taxRate, assetType);
    if (saved === 'USD') return true;
    if (saved === 'THB') return false;
  }

  // Tax rate heuristic: 15% is the standard US withholding tax under W-8BEN
  if (taxRate !== undefined && Math.abs(taxRate - 0.15) < 0.005) {
    dynamicCurrencySymbolsMap.set(upper, 'USD');
    return true;
  }

  return false;
}

/**
 * Synchronous check for US symbol without async lookup.
 * Uses dynamic runtime registry and ticker conventions (no .BK suffix, non-Thai).
 */
export function isKnownUSSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const upper = symbol.trim().toUpperCase();
  if (upper.endsWith('.BK') || /[\u0E00-\u0E7F]/.test(upper)) return false;
  return dynamicCurrencySymbolsMap.get(upper) === 'USD';
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
