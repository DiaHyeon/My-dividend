// บริการซิงค์และอัปเดตราคาตลาดประจำวัน (Daily Market Price Sync) สำหรับหุ้นและกองทุนรวมลงฐานข้อมูล Supabase อัตโนมัติเมื่อขึ้นวันใหม่และเมื่อผู้ใช้รูดหน้าจอเพื่อรีเฟรช
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AssetSummary } from '../types/database';
import { fetchStockPrice } from './stockService';
import { fetchFundNav } from './fundService';
import { getAssetCurrency, getCachedExchangeRate } from './currencyService';
import { clear7DayHistoryCache } from './historyService';

const LAST_SYNC_DATE_KEY = '@my_dividend_last_price_sync_date';

// Mutex lock to prevent duplicate concurrent network sync executions
let isSyncInProgress = false;

/**
 * Returns current local date key in YYYY-MM-DD format.
 */
function getTodayDateKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether prices have already been synchronized today.
 */
export async function hasSyncedToday(): Promise<boolean> {
  try {
    const lastSyncDate = await AsyncStorage.getItem(LAST_SYNC_DATE_KEY);
    return lastSyncDate === getTodayDateKey();
  } catch {
    return false;
  }
}

/**
 * Synchronizes latest market prices and NAVs for active holdings.
 * - Runs automatically on first app open of the day (once-a-day).
 * - Runs on-demand when user pulls to refresh (force = true).
 * - Updates Supabase `assets.current_price` so SQL view `view_asset_summary` re-computes all metrics.
 * 
 * @returns boolean indicating whether any asset price was updated in the database.
 */
export async function syncDailyPricesIfNeeded(
  assets: AssetSummary[],
  force: boolean = false
): Promise<boolean> {
  if (!assets || assets.length === 0) {
    return false;
  }

  // Prevent multiple simultaneous sync requests (e.g. Overview & Holdings mounting together)
  if (isSyncInProgress) {
    return false;
  }

  const todayKey = getTodayDateKey();

  // If not forced and already synced today, skip external network calls
  if (!force) {
    try {
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_DATE_KEY);
      if (lastSync === todayKey) {
        return false;
      }
    } catch {
      // Proceed on cache read error
    }
  }

  isSyncInProgress = true;

  try {
    if (force) {
      await clear7DayHistoryCache();
    }

    // 1. Fetch current exchange rate for US stock conversions
    let fxRate = await getCachedExchangeRate();
    if (!fxRate || fxRate <= 0) {
      fxRate = 34.0;
    }

    // Filter to active non-CASH assets (CASH deposits maintain constant 1.0000 unit base)
    const eligibleAssets = assets.filter(
      (a) => a.id && a.symbol && a.asset_type !== 'CASH' && !a.is_archived
    );

    if (eligibleAssets.length === 0) {
      await AsyncStorage.setItem(LAST_SYNC_DATE_KEY, todayKey);
      return false;
    }

    // 2. Fetch latest quotes in parallel with individual error protection
    const priceUpdates: { id: string; symbol: string; newPriceTHB: number }[] = [];

    await Promise.all(
      eligibleAssets.map(async (asset) => {
        try {
          const rawSymbol = asset.symbol.trim().toUpperCase();

          if (asset.asset_type === 'STOCKS') {
            const rawMarketPrice = await fetchStockPrice(rawSymbol);
            if (rawMarketPrice !== null && !isNaN(rawMarketPrice) && rawMarketPrice > 0) {
              const currency = await getAssetCurrency(
                asset.id,
                asset.symbol,
                asset.tax_rate,
                asset.asset_type
              );
              const priceTHB = currency === 'USD' ? rawMarketPrice * fxRate : rawMarketPrice;
              const roundedTHB = Number(priceTHB.toFixed(4));

              const oldPrice = Number(asset.current_price) || 0;
              // Check if price changed by more than 0.0001
              if (Math.abs(roundedTHB - oldPrice) > 0.0001) {
                priceUpdates.push({
                  id: asset.id,
                  symbol: rawSymbol,
                  newPriceTHB: roundedTHB,
                });
              }
            }
          } else if (asset.asset_type === 'FUNDS') {
            const navResult = await fetchFundNav(undefined, rawSymbol);
            if (navResult && !isNaN(navResult.latestNav) && navResult.latestNav > 0) {
              const roundedTHB = Number(navResult.latestNav.toFixed(4));
              const oldPrice = Number(asset.current_price) || 0;

              if (Math.abs(roundedTHB - oldPrice) > 0.0001) {
                priceUpdates.push({
                  id: asset.id,
                  symbol: rawSymbol,
                  newPriceTHB: roundedTHB,
                });
              }
            }
          }
        } catch (assetErr: any) {
          console.warn(`Price sync error for ${asset.symbol}:`, assetErr?.message || assetErr);
        }
      })
    );

    // 3. Batch update changed assets in Supabase
    if (priceUpdates.length > 0) {
      await Promise.all(
        priceUpdates.map(async (u) => {
          const { error } = await supabase
            .from('assets')
            .update({ current_price: u.newPriceTHB })
            .eq('id', u.id);

          if (error) {
            console.warn(`Failed to update price for ${u.symbol}:`, error.message);
          }
        })
      );
    }

    // 4. Record successful sync date for today
    await AsyncStorage.setItem(LAST_SYNC_DATE_KEY, todayKey);
    return priceUpdates.length > 0;
  } catch (err: any) {
    console.warn('Daily price sync execution failed:', err?.message || err);
    return false;
  } finally {
    isSyncInProgress = false;
  }
}
