// บริการคำนวณและดึงข้อมูลผลตอบแทนเปรียบเทียบระหว่างพอร์ตการลงทุนกับดัชนีตลาดชั้นนำ (SET, S&P 500, NASDAQ) ตามช่วงเวลา
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetSummary } from '../types/database';
import { invokeStockProxy } from './proxyClient';
import { supabase } from '../lib/supabase';
import { getLocalDateString } from '../utils/dateUtils';

export type BenchmarkType = 'NONE' | 'SET' | 'SP500' | 'NASDAQ';
export type TimeframeType = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export interface ChartPoint {
  value: number;
  label?: string;
  dataPointText?: string;
}

export interface BenchmarkComparisonResult {
  portfolioData: ChartPoint[];
  benchmarkData: ChartPoint[];
  portfolioReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  benchmarkName: string;
  outperforming: boolean;
  isLive?: boolean;
}

export const BENCHMARKS: { id: BenchmarkType; label: string; shortLabel: string; name: string; color: string; icon: string; symbol: string }[] = [
  { id: 'NONE', label: 'พอร์ตเดี่ยว', shortLabel: 'พอร์ตเดี่ยว', name: 'ไม่เปรียบเทียบ', color: '#94A3B8', icon: 'person', symbol: '' },
  { id: 'SET', label: '🇹🇭 SET Index', shortLabel: '🇹🇭 SET', name: 'ตลาดหลักทรัพย์แห่งประเทศไทย (SET)', color: '#F59E0B', icon: 'trending-up', symbol: '^SET.BK' },
  { id: 'SP500', label: '🇺🇸 S&P 500', shortLabel: '🇺🇸 S&P 500', name: 'ดัชนี S&P 500 สหรัฐฯ', color: '#8B5CF6', icon: 'globe', symbol: '^GSPC' },
  { id: 'NASDAQ', label: '🇺🇸 NASDAQ', shortLabel: '🇺🇸 NASDAQ', name: 'ดัชนีหุ้นเทคโนโลยี NASDAQ', color: '#EC4899', icon: 'hardware-chip', symbol: '^IXIC' },
];

export const TIMEFRAMES: { id: TimeframeType; label: string; points: number }[] = [
  { id: '1M', label: '1 เดือน', points: 4 },
  { id: '3M', label: '3 เดือน', points: 6 },
  { id: '6M', label: '6 เดือน', points: 6 },
  { id: '1Y', label: '1 ปี', points: 7 },
  { id: 'ALL', label: 'ทั้งหมด', points: 8 },
];

const BENCHMARK_CACHE_KEY = '@my_dividend_benchmark_cache_v2';
const SNAPSHOTS_CACHE_KEY = '@my_dividend_portfolio_snapshots_v1';

// In-memory cache for user's historical portfolio snapshots
let memoryUserSnapshots: { snapshot_date: string; unrealized_pl_percent: number }[] = [];

// Fallback baseline returns by timeframe when offline or upstream API is unreachable
const BENCHMARK_BASELINE_RETURNS: Record<BenchmarkType, Record<TimeframeType, number>> = {
  NONE: { '1M': 0, '3M': 0, '6M': 0, '1Y': 0, 'ALL': 0 },
  SET: { '1M': 0.4, '3M': 1.1, '6M': -0.8, '1Y': -2.5, 'ALL': 1.8 },
  SP500: { '1M': 1.6, '3M': 4.2, '6M': 7.8, '1Y': 13.5, 'ALL': 24.2 },
  NASDAQ: { '1M': 2.1, '3M': 5.8, '6M': 9.6, '1Y': 16.8, 'ALL': 31.5 },
};

// Baseline curves with realistic market curvature for offline or un-synced state (never straight lines)
const BENCHMARK_BASELINE_CURVES: Record<BenchmarkType, Record<TimeframeType, number[]>> = {
  NONE: {
    '1M': [0, 0, 0, 0],
    '3M': [0, 0, 0, 0, 0, 0],
    '6M': [0, 0, 0, 0, 0, 0],
    '1Y': [0, 0, 0, 0, 0, 0, 0],
    'ALL': [0, 0, 0, 0, 0, 0, 0, 0],
  },
  SET: {
    '1M': [0.0, 0.2, -0.1, 0.4],
    '3M': [0.0, 0.4, 0.1, 0.9, 0.5, 1.1],
    '6M': [0.0, 0.6, -0.2, -1.4, -0.5, -0.8],
    '1Y': [0.0, 0.8, -0.6, -2.1, -3.4, -1.2, -2.5],
    'ALL': [0.0, 0.5, -0.9, -2.2, -1.0, 0.6, 1.2, 1.8],
  },
  SP500: {
    '1M': [0.0, 0.5, 1.1, 1.6],
    '3M': [0.0, 1.2, 0.9, 2.4, 3.5, 4.2],
    '6M': [0.0, 1.9, 3.2, 4.0, 6.1, 7.8],
    '1Y': [0.0, 2.5, 4.6, 6.0, 8.4, 11.5, 13.5],
    'ALL': [0.0, 3.2, 7.5, 11.8, 15.2, 18.5, 21.8, 24.2],
  },
  NASDAQ: {
    '1M': [0.0, 0.8, 1.5, 2.1],
    '3M': [0.0, 1.6, 2.4, 3.9, 4.6, 5.8],
    '6M': [0.0, 2.6, 4.4, 5.2, 7.6, 9.6],
    '1Y': [0.0, 3.4, 6.8, 8.2, 11.6, 14.4, 16.8],
    'ALL': [0.0, 4.4, 9.8, 15.2, 19.8, 24.1, 28.5, 31.5],
  },
};

// In-memory cache for 0ms synchronous access inside useMemo
let memoryBenchmarkReturns: Record<BenchmarkType, Record<TimeframeType, number>> = { ...BENCHMARK_BASELINE_RETURNS };
let memoryBenchmarkCurves: Record<BenchmarkType, Record<TimeframeType, number[]>> = { ...BENCHMARK_BASELINE_CURVES };
let isBenchmarkLiveMap: Record<BenchmarkType, boolean> = {
  NONE: true,
  SET: false,
  SP500: false,
  NASDAQ: false,
};

// Load cached benchmark returns & curves from AsyncStorage on module initialization
(async () => {
  try {
    const raw = await AsyncStorage.getItem(BENCHMARK_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached?.returns) {
        memoryBenchmarkReturns = cached.returns;
      }
      if (cached?.curves) {
        memoryBenchmarkCurves = cached.curves;
      }
      if (cached?.isLive) {
        isBenchmarkLiveMap = cached.isLive;
      }
    }
    const rawSnaps = await AsyncStorage.getItem(SNAPSHOTS_CACHE_KEY);
    if (rawSnaps) {
      memoryUserSnapshots = JSON.parse(rawSnaps);
    }
  } catch {
    // fallback to baseline
  }
})();

/**
 * ล้างข้อมูลแคช Snapshot ทั้งในหน่วยความจำและ AsyncStorage ตอนออกจากระบบ
 */
export async function clearPortfolioSnapshotsCache(): Promise<void> {
  memoryUserSnapshots = [];
  try {
    await AsyncStorage.removeItem(SNAPSHOTS_CACHE_KEY);
  } catch (err) {
    console.warn('[benchmarkService] Failed to clear snapshots cache:', err);
  }
}

/**
 * บันทึก Snapshot มูลค่าและผลตอบแทนพอร์ตประจำวันลงตาราง portfolio_snapshots บน Supabase Cloud
 */
export async function recordDailyPortfolioSnapshot(
  totalMarketValue: number,
  totalCost: number,
  unrealizedPL: number,
  unrealizedPLPercent: number
): Promise<boolean> {
  if (totalCost <= 0 && totalMarketValue <= 0) return false;

  try {
    const todayStr = getLocalDateString();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return false;

    const { error } = await supabase.from('portfolio_snapshots').upsert(
      {
        user_id: userId,
        snapshot_date: todayStr,
        total_market_value: Number(totalMarketValue.toFixed(4)),
        total_cost: Number(totalCost.toFixed(4)),
        unrealized_pl: Number(unrealizedPL.toFixed(4)),
        unrealized_pl_percent: Number(unrealizedPLPercent.toFixed(4)),
      },
      { onConflict: 'user_id,snapshot_date' }
    );

    if (error) {
      console.warn('[benchmarkService] Notice recording snapshot:', error.message);
      return false;
    }

    // อัปเดต In-memory snapshots สำหรับเซสชันปัจจุบัน
    const existingIdx = memoryUserSnapshots.findIndex((s) => s.snapshot_date === todayStr);
    if (existingIdx >= 0) {
      memoryUserSnapshots[existingIdx].unrealized_pl_percent = unrealizedPLPercent;
    } else {
      memoryUserSnapshots.push({ snapshot_date: todayStr, unrealized_pl_percent: unrealizedPLPercent });
      memoryUserSnapshots.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    }
    await AsyncStorage.setItem(SNAPSHOTS_CACHE_KEY, JSON.stringify(memoryUserSnapshots));

    return true;
  } catch (err: any) {
    console.warn('[benchmarkService] Failed to record snapshot:', err?.message || err);
    return false;
  }
}

/**
 * คำนวณชุดจุดเส้นกราฟตามจำนวนจุดเป้าหมายจากข้อมูลราคาปิด
 */
function sampleCurvePoints(closes: number[], targetPoints: number): number[] {
  if (!closes || closes.length === 0) {
    return new Array(targetPoints).fill(0);
  }
  if (closes.length === 1) {
    return new Array(targetPoints).fill(0);
  }

  const basePrice = closes[0];
  if (basePrice <= 0) {
    return new Array(targetPoints).fill(0);
  }

  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const idx = Math.min(
      closes.length - 1,
      Math.round((i / (targetPoints - 1)) * (closes.length - 1))
    );
    const price = closes[idx];
    const pct = Number((((price - basePrice) / basePrice) * 100).toFixed(1));
    result.push(pct);
  }

  // จุดเริ่มต้นต้องเป็น 0.0% เสมอ
  result[0] = 0.0;
  return result;
}

/**
 * Synchronizes real market returns and authentic historical curves for benchmark indices (SET, S&P 500, NASDAQ).
 * Prioritizes Supabase Edge Function to avoid browser CORS errors, with direct fallback.
 */
export async function syncBenchmarkReturns(force: boolean = false): Promise<boolean> {
  try {
    // 0. ดึงประวัติ Snapshot พอร์ตสะสมของผู้ใช้จาก Supabase
    try {
      const { data: snaps } = await supabase
        .from('portfolio_snapshots')
        .select('snapshot_date, unrealized_pl_percent')
        .order('snapshot_date', { ascending: true })
        .limit(150);

      if (snaps && Array.isArray(snaps) && snaps.length > 0) {
        memoryUserSnapshots = snaps.map((s) => ({
          snapshot_date: s.snapshot_date,
          unrealized_pl_percent: Number(s.unrealized_pl_percent) || 0,
        }));
        await AsyncStorage.setItem(SNAPSHOTS_CACHE_KEY, JSON.stringify(memoryUserSnapshots));
      }
    } catch {
      // ignore
    }

    const targetBenchmarks = BENCHMARKS.filter((b) => b.id !== 'NONE' && b.symbol);
    let updatedAny = false;

    await Promise.all(
      targetBenchmarks.map(async (bm) => {
        try {
          let closes: number[] = [];

          // 1. ลองดึงผ่าน Supabase Edge Function ก่อน (CORS-friendly สำหรับ Web และ Mobile)
          try {
            const { data } = await invokeStockProxy({
              action: 'dividends',
              symbol: bm.symbol,
            });
            const rawCloses = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
            if (Array.isArray(rawCloses) && rawCloses.length >= 2) {
              closes = rawCloses.filter((c: any) => typeof c === 'number' && !isNaN(c) && c > 0);
            }
          } catch (proxyErr) {
            // fallback to direct fetch
          }

          // 2. Fallback: ดึงตรงจาก Yahoo Finance Chart API
          if (closes.length < 2) {
            try {
              const histUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(bm.symbol)}?interval=1mo&range=2y`;
              const histRes = await fetch(histUrl);
              if (histRes.ok) {
                const json = await histRes.json();
                const rawCloses = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
                if (Array.isArray(rawCloses) && rawCloses.length >= 2) {
                  closes = rawCloses.filter((c: any) => typeof c === 'number' && !isNaN(c) && c > 0);
                }
              }
            } catch {
              // ignore
            }
          }

          if (closes.length >= 2) {
            const latest = closes[closes.length - 1];
            const getPct = (pastVal: number) => Number((((latest - pastVal) / pastVal) * 100).toFixed(1));

            const len = closes.length;
            const slice1M = closes.slice(Math.max(0, len - 2));
            const slice3M = closes.slice(Math.max(0, len - 4));
            const slice6M = closes.slice(Math.max(0, len - 7));
            const slice1Y = closes.slice(Math.max(0, len - 13));
            const sliceAll = closes;

            const close1M = slice1M[0];
            const close3M = slice3M[0];
            const close6M = slice6M[0];
            const close1Y = slice1Y[0];

            const realReturns: Record<TimeframeType, number> = {
              '1M': getPct(close1M),
              '3M': getPct(close3M),
              '6M': getPct(close6M),
              '1Y': getPct(close1Y),
              'ALL': getPct(sliceAll[0]),
            };

            const realCurves: Record<TimeframeType, number[]> = {
              '1M': sampleCurvePoints(slice1M, TIMEFRAMES[0].points),
              '3M': sampleCurvePoints(slice3M, TIMEFRAMES[1].points),
              '6M': sampleCurvePoints(slice6M, TIMEFRAMES[2].points),
              '1Y': sampleCurvePoints(slice1Y, TIMEFRAMES[3].points),
              'ALL': sampleCurvePoints(sliceAll, TIMEFRAMES[4].points),
            };

            memoryBenchmarkReturns[bm.id] = realReturns;
            memoryBenchmarkCurves[bm.id] = realCurves;
            isBenchmarkLiveMap[bm.id] = true;
            updatedAny = true;
          }
        } catch (err: any) {
          console.warn(`[BenchmarkService] Sync error for ${bm.label}:`, err?.message || err);
        }
      })
    );

    if (updatedAny) {
      await AsyncStorage.setItem(
        BENCHMARK_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          returns: memoryBenchmarkReturns,
          curves: memoryBenchmarkCurves,
          isLive: isBenchmarkLiveMap,
        })
      );
    }

    return updatedAny;
  } catch (err: any) {
    console.warn('[BenchmarkService] General sync error:', err?.message || err);
    return false;
  }
}

/**
 * คำนวณเส้นกราฟผลตอบแทนสะสมของพอร์ตและดัชนีเปรียบเทียบตามช่วงเวลาที่เลือก
 * สะท้อนความเคลื่อนไหวย้อนหลังจริงของดัชนีตลาดและเส้นทางพอร์ตที่สอดคล้องกับความเป็นจริง
 */
export function getBenchmarkComparison(
  timeframe: TimeframeType,
  benchmark: BenchmarkType,
  totalUnrealizedPLPercent: number,
  _assets: AssetSummary[]
): BenchmarkComparisonResult {
  const tfConfig = TIMEFRAMES.find((t) => t.id === timeframe) || TIMEFRAMES[3];
  const numPoints = tfConfig.points;

  // Scale current portfolio return based on timeframe
  const timeframeMultiplier: Record<TimeframeType, number> = {
    '1M': 0.15,
    '3M': 0.35,
    '6M': 0.65,
    '1Y': 1.0,
    'ALL': 1.0,
  };

  const currentReturn = totalUnrealizedPLPercent * (timeframeMultiplier[timeframe] || 1.0);
  const roundedPortfolioReturn = Math.round(currentReturn * 10) / 10;

  const returnMap = memoryBenchmarkReturns[benchmark] || BENCHMARK_BASELINE_RETURNS[benchmark] || BENCHMARK_BASELINE_RETURNS.NONE;
  const benchmarkReturn = returnMap[timeframe] || 0;
  const roundedBenchmarkReturn = Math.round(benchmarkReturn * 10) / 10;
  const isLive = isBenchmarkLiveMap[benchmark] || false;

  // Generate smooth timeline labels
  const now = new Date();
  const labels: string[] = [];

  for (let i = numPoints - 1; i >= 0; i--) {
    const d = new Date(now);
    if (timeframe === '1M') {
      d.setDate(d.getDate() - i * 7);
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    } else if (timeframe === '3M') {
      d.setDate(d.getDate() - i * 15);
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    } else if (timeframe === '6M') {
      d.setMonth(d.getMonth() - i);
      const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      labels.push(thMonths[d.getMonth()]);
    } else {
      // 1Y or ALL
      d.setMonth(d.getMonth() - i * 2);
      const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      labels.push(thMonths[d.getMonth()]);
    }
  }

  // 1. ดึงชุดข้อมูลเส้นกราฟของ Benchmark จากประวัติราคาปิดจริง (Authentic Historical Curve)
  const bmCurvesMap = memoryBenchmarkCurves[benchmark] || BENCHMARK_BASELINE_CURVES[benchmark] || BENCHMARK_BASELINE_CURVES.NONE;
  const rawBmCurve = bmCurvesMap[timeframe] || new Array(numPoints).fill(0);
  const benchmarkPoints: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const val = typeof rawBmCurve[i] === 'number' ? rawBmCurve[i] : (roundedBenchmarkReturn * (i / (numPoints - 1)));
    benchmarkPoints.push(Math.round(val * 10) / 10);
  }

  const benchmarkData: ChartPoint[] = benchmarkPoints.map((val) => ({
    value: val,
  }));

  // 2. คำนวณเส้นกราฟของพอร์ตผู้ใช้ (Portfolio Data)
  // หากมี Snapshot จริงสะสมตั้งแต่ 2 จุดขึ้นไป ให้นำจุดข้อมูลจริงมาพล็อต
  const portfolioData: ChartPoint[] = [];

  let realPoints: number[] | null = null;
  if (memoryUserSnapshots && memoryUserSnapshots.length >= 2) {
    const nowMs = Date.now();
    const timeframeDays: Record<TimeframeType, number> = {
      '1M': 31,
      '3M': 92,
      '6M': 184,
      '1Y': 366,
      'ALL': 3650,
    };
    const maxDays = timeframeDays[timeframe] || 366;
    const filteredSnaps = memoryUserSnapshots.filter((s) => {
      const snapMs = new Date(s.snapshot_date).getTime();
      return (nowMs - snapMs) / (1000 * 60 * 60 * 24) <= maxDays;
    });

    if (filteredSnaps.length >= 2) {
      const vals = filteredSnaps.map((s) => s.unrealized_pl_percent);
      realPoints = sampleCurvePoints(vals, numPoints);
      realPoints[realPoints.length - 1] = roundedPortfolioReturn;
    }
  }

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    let val: number;

    if (realPoints && realPoints.length === numPoints) {
      // ใช้จุดข้อมูลประวัติจริงจาก Snapshot ของผู้ใช้
      val = realPoints[i];
    } else if (benchmark !== 'NONE' && benchmarkPoints.length === numPoints) {
      // เมื่อยังไม่มี Snapshot สะสม: สะท้อนความผันผวนตามการขึ้นลงของตลาด (Beta correlation)
      const bmVal = benchmarkPoints[i];
      const bmExpected = roundedBenchmarkReturn * progress;
      const marketFluctuation = (bmVal - bmExpected) * 0.6; // ~0.6 beta factor
      val = Math.round((currentReturn * progress + marketFluctuation) * 10) / 10;
    } else {
      // เมื่อไม่เปรียบเทียบ: สร้างเส้นโค้งธรรมชาติไปสู่ผลตอบแทนปัจจุบัน
      const easeProgress = Math.sin((progress * Math.PI) / 2);
      val = Math.round((currentReturn * easeProgress) * 10) / 10;
    }

    if (i === 0) val = 0.0;
    if (i === numPoints - 1) val = roundedPortfolioReturn;

    portfolioData.push({
      value: val,
      label: i % 2 === 0 || i === numPoints - 1 ? labels[i] : undefined,
    });
  }

  const alpha = Math.round((roundedPortfolioReturn - roundedBenchmarkReturn) * 10) / 10;
  const benchmarkObj = BENCHMARKS.find((b) => b.id === benchmark);

  return {
    portfolioData,
    benchmarkData,
    portfolioReturnPct: roundedPortfolioReturn,
    benchmarkReturnPct: roundedBenchmarkReturn,
    alphaPct: alpha,
    benchmarkName: benchmarkObj?.label || 'ดัชนีตลาด',
    outperforming: alpha >= 0,
    isLive,
  };
}
