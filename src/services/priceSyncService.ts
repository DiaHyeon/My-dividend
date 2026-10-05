// บริการซิงค์และอัปเดตราคาตลาดประจำวัน (Daily Market Price Sync) สำหรับหุ้นและกองทุนรวม พร้อมระบบต่ออายุรอบเงินปันผลอัตโนมัติ (Rolling Schedules)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AssetSummary, DividendSchedule } from '../types/database';
import { fetchStockPrice } from './stockService';
import { fetchFundNav } from './fundService';
import { getAssetCurrency, getCachedExchangeRate, resolveIsUSStock } from './currencyService';
import { clear7DayHistoryCache } from './historyService';
import { getLocalDateString, estimatePayoutDate, computeLearnedPayoutLag } from '../utils/dateUtils';
import { detectCashFrequency } from './taxService';
import { getSpecialScheduleIds } from '../components/AdjustDividendModal';

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
    const specialIds = await getSpecialScheduleIds().catch(() => new Set<string>());
    const isSpecialSched = (s: any) => Boolean(s.is_special) || specialIds.has(s.id);

    const activeAssetIds = activeAssets.map((a) => a.id);
    const { data: allSchedules, error } = await supabase
      .from('dividend_schedules')
      .select('*')
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

      // ตรวจสอบว่ามีรอบปันผลที่ครอบคลุมถึงช่วงปลายของกรอบ 12 เดือนข้างหน้าหรือไม่ (อย่างน้อย 9 เดือนข้างหน้า)
      const hasCoverageUntilLateHorizon = futureSchedules.some((s) => {
        const schedTime = new Date(s.xd_date).getTime();
        const nineMonthsAhead = new Date(today.getFullYear(), today.getMonth() + 9, 1).getTime();
        return schedTime >= nineMonthsAhead;
      });

      if (hasCoverageUntilLateHorizon && futureSchedules.length >= 2) {
        continue;
      }

      const existingDates = new Set(existingList.map((s) => s.xd_date));

      if (asset.asset_type === 'CASH') {
        // สำหรับ CASH: ตรวจสอบว่าเป็นรอบรายเดือนหรือกึ่งปีโดยใช้ detectCashFrequency
        const isMonthlyCash = detectCashFrequency(existingList.map((s) => s.xd_date)) === 'MONTHLY';
        const currentYear = today.getFullYear();
        const candidateDates: string[] = [];

        if (isMonthlyCash) {
          for (const yr of [currentYear, currentYear + 1]) {
            for (let m = 0; m < 12; m++) {
              candidateDates.push(`${yr}-${String(m + 1).padStart(2, '0')}-28`);
            }
          }
        } else {
          candidateDates.push(
            `${currentYear}-06-30`,
            `${currentYear}-12-31`,
            `${currentYear + 1}-06-30`,
            `${currentYear + 1}-12-31`
          );
        }

        // หา DPU จากงวดเดิมหรือจากอัตราดอกเบี้ยปัจจุบัน
        const prevSched = existingList[existingList.length - 1];
        const annualRate = Number(asset.current_price) || 0.015;
        const dpuToUse = prevSched && Number(prevSched.dpu) > 0
          ? Number(prevSched.dpu)
          : isMonthlyCash
          ? Number((annualRate / 12).toFixed(6))
          : Number((annualRate / 2).toFixed(6));

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

        // หางวดปกติล่าสุดที่มี DPU > 0 (ไม่รวมงวดพิเศษ)
        const validScheds = existingList.filter((s) => Number(s.dpu) > 0 && !isSpecialSched(s));
        if (validScheds.length === 0) continue;

        const latestSched = validScheds[validScheds.length - 1];
        const latestDpu = Number(latestSched.dpu);

        // กลยุทธ์ที่ 1 (Same-Month Next-Year Roll):
        // สำหรับงวดปกติที่ผ่านมาแล้วหรือกำลังจะหมดอายุ ให้ Roll ไปเป็นเดือนเดิมของปีถัดไป (+12 เดือน)
        // เพื่อรักษาเดือนที่ขึ้นเครื่องหมายจริงของบริษัทไว้ได้อย่างแม่นยำ
        let generatedAny = false;
        for (const pastSched of validScheds) {
          if (isSpecialSched(pastSched)) continue;
          const nextYearDate = addMonthsSafe(pastSched.xd_date, 12);
          if (nextYearDate >= todayKey && nextYearDate <= oneYearAheadKey && !existingDates.has(nextYearDate)) {
            newSchedulesToInsert.push({
              asset_id: asset.id,
              dpu: Number(pastSched.dpu) > 0 ? Number(pastSched.dpu) : latestDpu,
              xd_date: nextYearDate,
              is_projected: true,
            });
            existingDates.add(nextYearDate);
            generatedAny = true;
          }
        }

        // กลยุทธ์ที่ 2 (Fallback กรณีเป็นสินทรัพย์ใหม่ที่มีแค่งวดเดียว หรือยังไม่มีรอบในอนาคต):
        // ตรวจสอบความถี่จากจำนวนงวดในรอบ 365 วันล่าสุด (Trailing 1 Year Count) เท่านั้น
        // ห้ามใช้ existingList.length รวมทั้งหมด เพื่อป้องกันตัวเลขสะสมข้ามปีเพี้ยน
        const futureCount = Array.from(existingDates).filter((d) => d >= todayKey && d <= oneYearAheadKey).length;
        if (!generatedAny && futureCount < 2) {
          const oneYearAgoDate = new Date(today);
          oneYearAgoDate.setFullYear(today.getFullYear() - 1);
          const oneYearAgoKey = getLocalDateString(oneYearAgoDate);

          const trailingScheds = validScheds.filter((s) => s.xd_date >= oneYearAgoKey && s.xd_date <= todayKey);
          const trailingCount = trailingScheds.length;

          const stepMonths =
            trailingCount >= 10 ? 1 : trailingCount >= 3 ? 3 : trailingCount >= 2 ? 6 : 12;

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

    // 4.1 Auto-lock past foreign dividend schedules FX rates for unconfirmed payouts
    try {
      const activeList = assets.filter((a) => a.id && !a.is_archived);
      const activeIds = activeList.map((a) => a.id).filter(Boolean);
      if (activeIds.length > 0) {
        const { data: allSchedules } = await supabase
          .from('dividend_schedules')
          .select('*')
          .in('asset_id', activeIds);
        if (allSchedules && allSchedules.length > 0) {
          await autoLockPastForeignDividendRates(activeList, allSchedules as DividendSchedule[], fxRate);
        }
      }
    } catch (fxErr) {
      console.warn('Auto-lock foreign dividend rates notice:', fxErr);
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

/**
 * ตรวจสอบและ Auto-Lock อัตราแลกเปลี่ยน (received_fx_rate) สำหรับเงินปันผลต่างประเทศที่ถึงวันจ่ายเงินแล้ว
 * ป้องกันยอดเงินปันผลในอดีตผันผวนตามค่าเงินบาทในอนาคต หากผู้ใช้ไม่ได้กดปุ่มยืนยันด้วยตนเอง
 */
export async function autoLockPastForeignDividendRates(
  assets: AssetSummary[],
  schedules: DividendSchedule[],
  exchangeRate: number
): Promise<number> {
  if (!exchangeRate || exchangeRate <= 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedulesByAsset = new Map<string, DividendSchedule[]>();
  schedules.forEach((s) => {
    const list = schedulesByAsset.get(s.asset_id) || [];
    list.push(s);
    schedulesByAsset.set(s.asset_id, list);
  });

  const assetMap = new Map<string, AssetSummary>();
  assets.forEach((a) => assetMap.set(a.id, a));

  const toLock: { schedule: DividendSchedule; lockedRate: number }[] = [];
  const lockedRate = Number(exchangeRate.toFixed(4));

  for (const s of schedules) {
    const parentAsset = assetMap.get(s.asset_id);
    if (!parentAsset) continue;

    const isUS = resolveIsUSStock(parentAsset);
    if (!isUS) continue;

    // ถ้ามีการล็อกเรทแล้ว ไม่ต้องล็อกซ้ำ
    if (s.received_fx_rate && Number(s.received_fx_rate) > 0) continue;

    const assetScheds = schedulesByAsset.get(s.asset_id) || [];
    const learnedLag = computeLearnedPayoutLag(assetScheds);
    const payoutDateObj = estimatePayoutDate(s.xd_date, s.payment_date, {
      isUS: true,
      learnedLagDays: learnedLag,
    });
    if (!payoutDateObj) continue;
    payoutDateObj.setHours(0, 0, 0, 0);

    // ถ้าวันจ่ายเงินผ่านไปแล้ว (<= today) ให้ Auto-Lock เรท
    if (payoutDateObj.getTime() <= today.getTime()) {
      toLock.push({ schedule: s, lockedRate });
    }
  }

  if (toLock.length === 0) return 0;

  let lockedCount = 0;
  for (const item of toLock) {
    try {
      const { error } = await supabase
        .from('dividend_schedules')
        .update({
          received_fx_rate: item.lockedRate,
          is_projected: false,
        })
        .eq('id', item.schedule.id);

      if (!error) {
        item.schedule.received_fx_rate = item.lockedRate;
        item.schedule.is_projected = false;
        lockedCount++;
      }
    } catch {
      // ignore
    }
  }

  return lockedCount;
}
