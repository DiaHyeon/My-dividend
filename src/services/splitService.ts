// บริการตรวจจับ ประมวลผล และปรับสัดส่วนการแตกพาร์หุ้น (Stock Splits) อัตโนมัติจากตลาดหลักทรัพย์
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Transaction, AssetSummary } from '../types/database';
import { isKnownUSSymbol } from './currencyService';
import { invokeStockProxy } from './proxyClient';

export interface StockSplitEvent {
  date: string;          // 'YYYY-MM-DD'
  timestamp: number;
  numerator: number;     // e.g. 10
  denominator: number;   // e.g. 1
  ratio: number;         // numerator / denominator (e.g. 10)
  splitRatioStr: string; // '10:1'
}

export interface SplitDetectionResult {
  hasSplit: boolean;
  latestSplit: StockSplitEvent;
  eligibleTransactions: Transaction[];
  totalEligibleShares: number;
  newEstimatedShares: number;
  newEstimatedCost: number;
  currentAvgCost: number;
}

const APPLIED_SPLITS_STORAGE_KEY = '@my_dividend_applied_splits_map';

/**
 * ดึงรายการวันที่ที่เคยทำการปรับแตกพาร์ไปแล้วของสินทรัพย์นี้
 */
export async function getAppliedSplitsForAsset(assetId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(APPLIED_SPLITS_STORAGE_KEY);
    if (!raw) return new Set();
    const map = JSON.parse(raw);
    const dates = map[assetId];
    return new Set(Array.isArray(dates) ? dates : []);
  } catch {
    return new Set();
  }
}

/**
 * บันทึกว่าสินทรัพย์นี้ได้รับการปรับแตกพาร์ของวันที่นี้เรียบร้อยแล้ว
 */
export async function markSplitAsApplied(assetId: string, splitDate: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(APPLIED_SPLITS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const existing = new Set(Array.isArray(map[assetId]) ? map[assetId] : []);
    existing.add(splitDate);
    map[assetId] = Array.from(existing);
    await AsyncStorage.setItem(APPLIED_SPLITS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * ดึงประวัติการแตกพาร์ (Stock Splits) ย้อนหลัง 5 ปี จาก Yahoo Finance
 */
export async function fetchStockSplits(symbol: string): Promise<StockSplitEvent[]> {
  const cleanSym = (symbol || '').trim().toUpperCase();
  if (!cleanSym) return [];

  let targetSymbol = cleanSym;
  const isUS = isKnownUSSymbol(cleanSym);
  if (!isUS && !targetSymbol.endsWith('.BK') && !targetSymbol.includes('=')) {
    targetSymbol = `${targetSymbol}.BK`;
  }

  const parseSplits = (data: any): StockSplitEvent[] => {
    const rawSplits = data?.chart?.result?.[0]?.events?.splits;
    if (!rawSplits || typeof rawSplits !== 'object') return [];

    const list: StockSplitEvent[] = Object.values(rawSplits).map((s: any) => {
      const ts = typeof s.date === 'number' ? s.date * 1000 : Date.now();
      const dateStr = new Date(ts).toISOString().split('T')[0];
      const num = Number(s.numerator) || 1;
      const den = Number(s.denominator) || 1;
      const ratio = den > 0 ? num / den : 1;
      return {
        date: dateStr,
        timestamp: ts,
        numerator: num,
        denominator: den,
        ratio,
        splitRatioStr: s.splitRatio || `${num}:${den}`,
      };
    });

    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  };

  // 1. Direct fetch
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}?interval=1mo&range=5y&events=split`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const splits = parseSplits(data);
      if (splits.length > 0) return splits;
    }
  } catch {
    // 2. Edge Function Proxy fallback
    try {
      const { data } = await invokeStockProxy({ action: 'quote', symbol: targetSymbol });
      if (data) {
        const splits = parseSplits(data);
        if (splits.length > 0) return splits;
      }
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * ตรวจสอบว่าหุ้นตัวนี้มีประวัติการแตกพาร์ที่ยังไม่เคยถูกปรับในพอร์ตหรือไม่
 * โดยดูจากวันที่ซื้อของแต่ละไม้ (transaction_date < split.date)
 */
export async function detectPendingSplits(
  assetId: string,
  symbol: string,
  transactions: Transaction[]
): Promise<SplitDetectionResult | null> {
  if (!transactions || transactions.length === 0) return null;

  const splits = await fetchStockSplits(symbol);
  if (splits.length === 0) return null;

  const appliedDates = await getAppliedSplitsForAsset(assetId);

  // หา split ล่าสุดที่ยังไม่เคยถูกปรับ
  for (const split of splits) {
    if (appliedDates.has(split.date)) continue;

    // กรองเฉพาะไม้ที่ซื้อก่อนวันแตกพาร์
    const eligibleTxs = transactions.filter(
      (tx) =>
        tx.type === 'BUY' &&
        (tx.transaction_date || '').substring(0, 10) < split.date &&
        Number(tx.shares) > 0
    );

    if (eligibleTxs.length > 0) {
      const totalEligibleShares = eligibleTxs.reduce((sum, t) => sum + Number(t.shares), 0);
      const totalCost = eligibleTxs.reduce(
        (sum, t) => sum + Number(t.shares) * Number(t.price_per_share),
        0
      );
      const currentAvgCost = totalEligibleShares > 0 ? totalCost / totalEligibleShares : 0;

      const newEstimatedShares = totalEligibleShares * split.ratio;
      const newEstimatedCost = split.ratio > 0 ? currentAvgCost / split.ratio : currentAvgCost;

      return {
        hasSplit: true,
        latestSplit: split,
        eligibleTransactions: eligibleTxs,
        totalEligibleShares,
        newEstimatedShares,
        newEstimatedCost,
        currentAvgCost,
      };
    }
  }

  return null;
}

/**
 * ทำการปรับสัดส่วนการแตกพาร์ลงฐานข้อมูล Supabase ด้วยความแม่นยำ NUMERIC(15, 4)
 */
export async function applySplitAdjustment(
  asset: AssetSummary,
  split: StockSplitEvent,
  eligibleTransactions: Transaction[]
): Promise<{ updatedCount: number; newShares: number; newAvgCost: number; updatedScheduleCount: number }> {
  let updatedCount = 0;
  let updatedScheduleCount = 0;

  for (const tx of eligibleTransactions) {
    const originalShares = Number(tx.shares) || 0;
    const originalPrice = Number(tx.price_per_share) || 0;

    const newShares = Number((originalShares * split.ratio).toFixed(4));
    const newPrice = Number((originalPrice / split.ratio).toFixed(4));

    const { error } = await supabase
      .from('transactions')
      .update({
        shares: newShares,
        price_per_share: newPrice,
      })
      .eq('id', tx.id);

    if (!error) {
      updatedCount++;
    }
  }

  // ปรับค่าเงินปันผลต่อหุ้น (DPU) เฉพาะรอบปัจจุบันและอนาคตที่ยังไม่ได้จ่าย
  // ป้องกันการคำนวณเงินปันผลคาดการณ์เฟ้อตามจำนวนหุ้นที่เพิ่มขึ้น และไม่แตะต้องรอบในอดีตที่รับเงินจริงไปแล้ว
  try {
    const { data: schedules } = await supabase
      .from('dividend_schedules')
      .select('id, dpu, xd_date, payment_date, is_projected')
      .eq('asset_id', asset.id);

    if (schedules && schedules.length > 0) {
      for (const sch of schedules) {
        const isUnpaidOrFuture =
          sch.is_projected ||
          (sch.payment_date && sch.payment_date >= split.date) ||
          sch.xd_date >= split.date;

        if (isUnpaidOrFuture && sch.dpu) {
          const newDpu = Number((Number(sch.dpu) / split.ratio).toFixed(4));
          const { error: schErr } = await supabase
            .from('dividend_schedules')
            .update({ dpu: newDpu })
            .eq('id', sch.id);

          if (!schErr) {
            updatedScheduleCount++;
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[splitService] Error adjusting dividend schedules DPU for split:', err?.message);
  }

  // บันทึกวันที่แตกพาร์ว่าปรับเรียบร้อยแล้ว
  await markSplitAsApplied(asset.id, split.date);

  const totalOldShares = eligibleTransactions.reduce((s, t) => s + Number(t.shares), 0);
  const totalCost = eligibleTransactions.reduce(
    (s, t) => s + Number(t.shares) * Number(t.price_per_share),
    0
  );
  const newShares = totalOldShares * split.ratio;
  const newAvgCost = newShares > 0 ? totalCost / newShares : 0;

  return {
    updatedCount,
    newShares,
    newAvgCost,
    updatedScheduleCount,
  };
}

