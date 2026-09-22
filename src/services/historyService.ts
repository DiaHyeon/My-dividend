// บริการดึงและจัดเก็บแคชข้อมูลราคาปิดย้อนหลัง 7 วัน (Historical 7-Day Prices) ของหุ้นและกองทุน เพื่อแสดงผลกราฟแนวโน้มจริงในหน้าสินทรัพย์
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetSummary } from '../types/database';

const CACHE_PREFIX = '@sparkline_7d_';
const SEC_API_KEY = process.env.EXPO_PUBLIC_SEC_API_KEY || '';
import { invokeStockProxy } from './proxyClient';
import { isKnownUSSymbol } from './currencyService';

// In-memory cache สำหรับความเร็ว 0ms ใน Session ปัจจุบัน
const MEMORY_CACHE = new Map<string, { dateKey: string; timestamp: number; result: HistoryResult }>();

export interface HistoryResult {
  points: number[];
  isReal: boolean;
  change7dPct: number;
}

/**
 * ดึงคีย์วันที่ปัจจุบันในรูปแบบ YYYY-MM-DD
 */
function getTodayDateKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * ดึงข้อมูลราคาปิดย้อนหลัง 7 วันของสินทรัพย์
 * ใช้กลยุทธ์ "Once-a-Day EOD Cache" ร่วมกับ On-Demand Refresh:
 * - ถ้าเคยดึงในรอบวันแล้ว (หรือตลาดปิดอยู่) จะอ่านจาก Cache 100% (0 API calls)
 * - จะยิง API ใหม่เมื่อข้ามวัน หรือเมื่อผู้ใช้สั่ง forceRefresh (Pull-to-Refresh) เท่านั้น
 */
export async function fetch7DayPriceHistory(
  item: AssetSummary,
  forceRefresh: boolean = false
): Promise<HistoryResult> {
  const symbol = (item.symbol || '').trim().toUpperCase();
  const currentPrice = Number(item.current_price) || 0;
  const assetType = item.asset_type;
  const todayDateKey = getTodayDateKey();

  // 1. กรณีเงินฝาก (CASH): คำนวณดอกเบี้ยสะสมรายวันย้อนหลัง 7 วัน (0 API Calls เสมอ)
  if (assetType === 'CASH') {
    const annualRate = currentPrice; // เช่น 0.0222 (2.22%)
    const dailyRate = annualRate / 365;
    const base = 100;
    const points: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const val = base - i * (base * dailyRate);
      points.push(Number(val.toFixed(4)));
    }
    const change7dPct = ((points[points.length - 1] - points[0]) / (points[0] || 1)) * 100;
    return { points, isReal: true, change7dPct };
  }

  // 2. ตรวจสอบ In-Memory Cache ก่อน (ความเร็วระดับ 0ms ทันที)
  if (!forceRefresh && MEMORY_CACHE.has(symbol)) {
    const mem = MEMORY_CACHE.get(symbol)!;
    const isToday = mem.dateKey === todayDateKey;
    const isRecent = Date.now() - mem.timestamp < 16 * 60 * 60 * 1000;
    if (isToday || isRecent) {
      return mem.result;
    }
  }

  // 3. ตรวจสอบ Cache ใน AsyncStorage (Local Storage ของอุปกรณ์)
  const cacheKey = `${CACHE_PREFIX}${symbol}`;
  if (!forceRefresh) {
    try {
      const cachedStr = await AsyncStorage.getItem(cacheKey);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        const isSameDay = cached.dateKey === todayDateKey;
        const hoursAgo = (Date.now() - (cached.timestamp || 0)) / (1000 * 60 * 60);

        // ตรวจสอบวันหยุดสุดสัปดาห์ (เสาร์-อาทิตย์ ตลาดหุ้นปิด ราคาปิดจะไม่เปลี่ยน)
        const dayOfWeek = new Date().getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // ถ้าเป็นวันเดียวกัน หรือดึงมาไม่เกิน 16 ชั่วโมง หรือเป็นวันหยุดสุดสัปดาห์ -> ใช้ Cache ได้เลย 100%
        if ((isSameDay || hoursAgo < 16 || (isWeekend && hoursAgo < 72)) &&
            Array.isArray(cached.points) &&
            cached.points.length >= 2) {
          const result: HistoryResult = {
            points: cached.points,
            isReal: true,
            change7dPct: cached.change7dPct ?? 0,
          };
          MEMORY_CACHE.set(symbol, {
            dateKey: cached.dateKey || todayDateKey,
            timestamp: cached.timestamp || Date.now(),
            result,
          });
          return result;
        }
      }
    } catch (err) {
      // ignore cache read error
    }
  }

  // 4. ถ้าไม่มี Cache หรือแคชข้ามวัน หรือผู้ใช้สั่ง Pull-to-Refresh จึงจะยิง API
  let fetchedPoints: number[] | null = null;

  if (assetType === 'STOCKS') {
    fetchedPoints = await fetchYahoo7DayCloses(symbol);
  } else if (assetType === 'FUNDS') {
    fetchedPoints = await fetchSEC7DayNav(symbol);
  }

  // 5. ถ้าดึงข้อมูลจริงสำเร็จ -> บันทึกลงทั้ง Memory Cache และ AsyncStorage สำหรับวันนี้
  if (fetchedPoints && fetchedPoints.length >= 2) {
    const firstVal = fetchedPoints[0];
    const lastVal = fetchedPoints[fetchedPoints.length - 1];
    const change7dPct = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;

    const result: HistoryResult = {
      points: fetchedPoints,
      isReal: true,
      change7dPct,
    };

    // บันทึกลง In-Memory
    MEMORY_CACHE.set(symbol, {
      dateKey: todayDateKey,
      timestamp: Date.now(),
      result,
    });

    // บันทึกลง AsyncStorage สำหรับรอบวันนี้
    try {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          dateKey: todayDateKey,
          timestamp: Date.now(),
          points: fetchedPoints,
          change7dPct,
        })
      );
    } catch (err) {
      // ignore cache write error
    }

    return result;
  }

  // 6. Fallback สำรองกรณีออฟไลน์หรือไม่มีในตลาด
  const fallbackPoints = generateFallback7DayPoints(item);
  const first = fallbackPoints[0];
  const last = fallbackPoints[fallbackPoints.length - 1];
  const change7dPct = first > 0 ? ((last - first) / first) * 100 : 0;

  return {
    points: fallbackPoints,
    isReal: false,
    change7dPct,
  };
}

/**
 * ล้างแคชประวัติราคา 7 วันทั้งหมด (สำหรับกรณีผู้ใช้ต้องการบังคับอัปเดตทั้งหมด)
 */
export async function clear7DayHistoryCache(): Promise<void> {
  MEMORY_CACHE.clear();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const historyKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (historyKeys.length > 0) {
      await AsyncStorage.multiRemove(historyKeys);
    }
  } catch (err) {
    // ignore
  }
}

/**
 * ดึงราคาปิด 7 วันย้อนหลังจาก Yahoo Finance สำหรับหุ้น (US & SET/mai/REITs)
 */
async function fetchYahoo7DayCloses(symbol: string): Promise<number[] | null> {
  const cleanSym = (symbol || '').trim().toUpperCase();
  if (!cleanSym) return null;

  let targetSymbol = cleanSym;
  const isUS = isKnownUSSymbol(cleanSym);

  // หุ้นไทยใน SET, mai, กองรีท และกองทุนโครงสร้างพื้นฐานจะต่อท้ายด้วย .BK
  if (!isUS && !targetSymbol.endsWith('.BK') && !targetSymbol.includes('=')) {
    targetSymbol = `${targetSymbol}.BK`;
  }

  const tryFetchCloses = async (sym: string): Promise<number[] | null> => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=7d`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const rawCloses = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (Array.isArray(rawCloses)) {
          const validCloses = rawCloses
            .filter((c) => c !== null && c !== undefined && !isNaN(c) && c > 0)
            .map((c) => Number(Number(c).toFixed(4)));

          if (validCloses.length >= 2) {
            return validCloses;
          }
        }
      }
    } catch {
      // Fallback ผ่าน Edge Function (เมื่อเปิดบน Web Preview ติด CORS หรือเครือข่ายจำกัด)
      try {
        const { data } = await invokeStockProxy({ action: 'history-7d', symbol: sym });
        if (data) {
          const rawCloses = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
          if (Array.isArray(rawCloses) && rawCloses.length >= 2) {
            const valid = rawCloses
              .filter((c: any) => c !== null && c !== undefined && !isNaN(c) && c > 0)
              .map((c: any) => Number(Number(c).toFixed(4)));
            if (valid.length >= 2) return valid;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  };

  // 1. ลองดึงจาก targetSymbol หลักก่อน
  const primaryResult = await tryFetchCloses(targetSymbol);
  if (primaryResult) return primaryResult;

  // 2. สำรอง: ถ้าลองมี .BK แล้วยังไม่เจอ ให้ลองแบบไม่มี .BK (หรือกลับกัน)
  if (targetSymbol.endsWith('.BK')) {
    const fallbackNoBk = await tryFetchCloses(cleanSym);
    if (fallbackNoBk) return fallbackNoBk;
  } else {
    const fallbackBk = await tryFetchCloses(`${cleanSym}.BK`);
    if (fallbackBk) return fallbackBk;
  }

  return null;
}

/**
 * ดึงค่า NAV ย้อนหลัง 7 วันจาก SEC Open API สำหรับกองทุนรวมไทย
 */
async function fetchSEC7DayNav(symbol: string): Promise<number[] | null> {
  const directUrl = `https://api.sec.or.th/v2/fund/daily-info/nav?fund_class_name=${encodeURIComponent(symbol)}&page_size=14`;

  try {
    const res = await fetch(directUrl, {
      headers: {
        'Ocp-Apim-Subscription-Key': SEC_API_KEY,
      },
    });

    if (res.ok && res.status !== 204) {
      const data = await res.json();
      const items: any[] = data.items || [];
      if (items.length >= 2) {
        const sorted = [...items].sort((a, b) => (a.nav_date || '').localeCompare(b.nav_date || ''));
        const navs = sorted
          .slice(-7)
          .map((it) => Number(it.last_val))
          .filter((n) => !isNaN(n) && n > 0);

        if (navs.length >= 2) {
          return navs;
        }
      }
    }
  } catch (err) {
    // Fallback ผ่าน Edge Function
    try {
      const { data } = await invokeStockProxy({ action: 'fund-nav', symbol });
      if (data) {
        const items: any[] = data.history || data.items || [];
        if (items.length >= 2) {
          const sorted = [...items].sort((a, b) => (a.nav_date || '').localeCompare(b.nav_date || ''));
          const navs = sorted
            .slice(-7)
            .map((it) => Number(it.last_val))
            .filter((n) => !isNaN(n) && n > 0);
          if (navs.length >= 2) return navs;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * สร้างชุดข้อมูล 7 วันแบบจำลองสำรอง (Fallback)
 */
function generateFallback7DayPoints(item: AssetSummary): number[] {
  const currentPrice = Number(item.current_price) || 100;
  const plPercent = Number(item.unrealized_pl_percent) || 0;

  let seed = 0;
  for (let i = 0; i < item.symbol.length; i++) {
    seed += item.symbol.charCodeAt(i) * (i + 1);
  }

  const pseudoRandom = (step: number) => {
    const x = Math.sin(seed + step * 797) * 10000;
    return x - Math.floor(x);
  };

  const sevenDayTrendPct = plPercent >= 0 ? 0.015 : -0.015;
  const startVal = currentPrice / (1 + sevenDayTrendPct);
  const endVal = currentPrice;

  const points: number[] = [];
  const numPoints = 7;

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    const trend = startVal + (endVal - startVal) * progress;
    const wave = (pseudoRandom(i) - 0.5) * (Math.abs(endVal - startVal) * 0.3);
    points.push(Number((trend + wave).toFixed(2)));
  }

  points[numPoints - 1] = endVal;
  return points;
}
