// บริการซิงค์และอัปเดตราคาตลาดประจำวัน (Daily Market Price Sync) สำหรับหุ้นและกองทุนรวม พร้อมระบบต่ออายุรอบเงินปันผลอัตโนมัติ (Rolling Schedules)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AssetSummary } from '../types/database';
import { fetchStockPrice } from './stockService';
import { fetchFundNav } from './fundService';
import { getAssetCurrency, getCachedExchangeRate } from './currencyService';
import { clear7DayHistoryCache } from './historyService';
import { getLocalDateString } from '../utils/dateUtils';

const LAST_SYNC_DATE_KEY = '@my_dividend_last_price_sync_date';

// Mutex lock to prevent duplicate concurrent network sync executions
let isSyncInProgress = false;

/**
 * บวกเดือนอย่างปลอดภัยโดยไม่เกิดปัญหา 31st-day overflow
 */
function addMonthsSafe(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return dateStr;
  const [y, m, d] = parts;
  let targetYear = y;
  let targetMonth = m - 1 + months;
  targetYear += Math.floor(targetMonth / 12);
  targetMonth = ((targetMonth % 12) + 12) % 12;
  const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(d, maxDays);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Checks whether prices have already been synchronized today.
 */
export async function hasSyncedToday(): Promise<boolean> {
  try {
    const lastSyncDate = await AsyncStorage.getItem(LAST_SYNC_DATE_KEY);
    return lastSyncDate === getLocalDateString();
  } catch {
    return false;
  }
}

/**
 * ตรวจสอบและต่ออายุรอบเงินปันผล/ดอกเบี้ย 12 เดือนล่วงหน้า (Rolling Dividend Schedule Generator)
 * ป้องกันปัญหารอบปันผลหมดอายุกลายเป็น 0 เมื่อเวลาผ่านไปข้ามปี
 */
export async function rollExpiredDividendSchedulesIfNeeded(assets: AssetSummary[]): Promise<number> {
  const activeAssets = assets.filter((a) => a.id && !a.is_archived);
  if (activeAssets.length === 0) return 0;

  const todayKey = getLocalDateString();
  const today = new Date();
  const oneYearAhead = new Date(today);
  oneYearAhead.setFullYear(today.getFullYear() + 1);
  const oneYearAheadKey = getLocalDateString(oneYearAhead);

  try {
    const activeAssetIds = activeAssets.map((a) => a.id);
    const { data: allSchedules, error } = await supabase
      .from('dividend_schedules')
      .select('id, asset_id, dpu, xd_date, payment_date, is_projected')
      .in('asset_id', activeAssetIds)
      .order('xd_date', { ascending: true });

    if (error || !allSchedules) {
      return 0;
    }

    const schedulesByAsset = new Map<string, any[]>();
    allSchedules.forEach((s) => {
      const list = schedulesByAsset.get(s.asset_id) || [];
      list.push(s);
      schedulesByAsset.set(s.asset_id, list);
    });

    const newSchedulesToInsert: {
      asset_id: string;
      dpu: number;
      xd_date: string;
      is_projected: boolean;
    }[] = [];

    for (const asset of activeAssets) {
      const existingList = schedulesByAsset.get(asset.id) || [];
      const futureSchedules = existingList.filter((s) => s.xd_date >= todayKey);

      // ถ้ามีรอบปันผลในอนาคตเหลืออย่างน้อย 2 รอบแล้ว ถือว่ามีข้อมูลเพียงพอ ไม่ต้องต่อรอบเพิ่ม
      if (futureSchedules.length >= 2) {
        continue;
      }

      const existingDates = new Set(existingList.map((s) => s.xd_date));

      if (asset.asset_type === 'CASH') {
        // สำหรับ CASH: ตรวจสอบรอบดอกเบี้ยปลายปีหรือครึ่งปี
        const currentYear = today.getFullYear();
        const candidateDates = [
          `${currentYear}-06-30`,
          `${currentYear}-12-31`,
          `${currentYear + 1}-06-30`,
          `${currentYear + 1}-12-31`,
        ];

        // หา DPU จากงวดเดิมหรือจากอัตราดอกเบี้ยปัจจุบัน
        const prevSched = existingList[existingList.length - 1];
        const annualRate = Number(asset.current_price) || 0.015;
        const dpuToUse = prevSched && Number(prevSched.dpu) > 0 ? Number(prevSched.dpu) : Number((annualRate / 2).toFixed(6));

        for (const cDate of candidateDates) {
          if (cDate >= todayKey && cDate <= oneYearAheadKey && !existingDates.has(cDate)) {
            newSchedulesToInsert.push({
              asset_id: asset.id,
              dpu: dpuToUse,
              xd_date: cDate,
              is_projected: true,
            });
            existingDates.add(cDate);
          }
        }
      } else {
        // สำหรับ STOCKS และ FUNDS:
        if (existingList.length === 0) continue;

        // หางวดล่าสุดที่มี DPU > 0
        const validScheds = existingList.filter((s) => Number(s.dpu) > 0);
        if (validScheds.length === 0) continue;

        const latestSched = validScheds[validScheds.length - 1];
        const latestDpu = Number(latestSched.dpu);

        // ตรวจสอบความถี่ (Frequency) จากจำนวนงวดในอดีต
        const stepMonths = existingList.length >= 10 ? 1 : existingList.length >= 4 ? 3 : existingList.length >= 2 ? 6 : 12;

        let currentDateStr = latestSched.xd_date;
        let guard = 0;
        while (guard < 16) {
          guard++;
          currentDateStr = addMonthsSafe(currentDateStr, stepMonths);
          if (currentDateStr > oneYearAheadKey) break;

          if (currentDateStr >= todayKey && !existingDates.has(currentDateStr)) {
            newSchedulesToInsert.push({
              asset_id: asset.id,
              dpu: latestDpu,
              xd_date: currentDateStr,
              is_projected: true,
            });
            existingDates.add(currentDateStr);
          }
        }
      }
    }

    if (newSchedulesToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('dividend_schedules')
        .insert(newSchedulesToInsert);

      if (insertErr) {
        console.warn('[RollingSchedules] Failed to insert rolling schedules:', insertErr.message);
        return 0;
      }
      return newSchedulesToInsert.length;
    }

    return 0;
  } catch (err: any) {
    console.warn('[RollingSchedules] Error during rolling schedules check:', err?.message || err);
    return 0;
  }
}

/**
 * Synchronizes latest market prices and NAVs for active holdings.
 * - Runs automatically on first app open of the day (once-a-day).
 * - Runs on-demand when user pulls to refresh (force = true).
 * - Updates Supabase `assets.current_price` so SQL view `view_asset_summary` re-computes all metrics.
 * - Checks and rolls forward expired dividend schedules.
 * 
 * @returns boolean indicating whether any asset price or schedule was updated in the database.
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

  const todayKey = getLocalDateString();

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

    let priceUpdates: { id: string; symbol: string; newPriceTHB: number }[] = [];
    let successfulFetchCount = 0;

    if (eligibleAssets.length > 0) {
      // 2. Fetch latest quotes in small batches with gentle throttling to protect upstream APIs against rate limits (HTTP 429)
      const BATCH_SIZE = 3;

      for (let i = 0; i < eligibleAssets.length; i += BATCH_SIZE) {
        const batch = eligibleAssets.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (asset) => {
            try {
              const rawSymbol = asset.symbol.trim().toUpperCase();

              if (asset.asset_type === 'STOCKS') {
                const rawMarketPrice = await fetchStockPrice(rawSymbol);
                if (rawMarketPrice !== null && !isNaN(rawMarketPrice) && rawMarketPrice > 0) {
                  successfulFetchCount++;
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
                  successfulFetchCount++;
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
              console.warn(`Price sync notice for ${asset.symbol}:`, assetErr?.message || assetErr);
            }
          })
        );

        // Brief delay between batches to respect upstream API rate limits
        if (i + BATCH_SIZE < eligibleAssets.length) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }

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
    }

    // 4. Auto-roll expired dividend schedules for all active assets
    let schedulesRolledCount = 0;
    try {
      schedulesRolledCount = await rollExpiredDividendSchedulesIfNeeded(assets);
    } catch (schedErr) {
      console.warn('Roll expired dividend schedules notice:', schedErr);
    }

    // 5. Record successful sync date for today only if at least one quote succeeded or no eligible assets
    if (successfulFetchCount > 0 || eligibleAssets.length === 0) {
      await AsyncStorage.setItem(LAST_SYNC_DATE_KEY, todayKey);
    }

    return priceUpdates.length > 0 || schedulesRolledCount > 0;
  } catch (err: any) {
    console.warn('Daily price sync execution failed:', err?.message || err);
    return false;
  } finally {
    isSyncInProgress = false;
  }
}
