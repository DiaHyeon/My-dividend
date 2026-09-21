/**
 * This service provides Thai mutual fund search autocomplete, daily NAV retrieval, and dividend history analysis using the SEC Open API and local fund catalog.
 */

import { DividendAnalysis } from './stockService';

export interface FundSuggestion {
  symbol: string;        // Clean ticker (e.g. 'K-USA', 'SCBDV', 'B-INNOTECH')
  rawSymbol: string;
  name: string;          // Thai / English fund name
  amc: string;           // AMC full name (e.g. 'บลจ.กสิกรไทย', 'บลจ.ไทยพาณิชย์')
  exchange: string;      // AMC badge (e.g. 'KAsset', 'SCBAM', 'BBLAM', 'KSAM')
  market: 'TH';
  currency: 'THB';
  projId?: string;       // SEC project id if matched (e.g. 'M0017_2538')
  category?: string;     // Segment category (e.g. 'Foreign', 'Equity', 'FixedIncome')
}

const SUPABASE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ycflookcrilaujmeillt.supabase.co'}/functions/v1/stock-proxy`;
const SEC_API_KEY = process.env.EXPO_PUBLIC_SEC_API_KEY || '';

// Curated catalog of top popular Thai mutual funds for instant 0ms autocomplete
export const POPULAR_THAI_FUNDS: FundSuggestion[] = [
  // Kasikorn Asset Management (KAsset)
  {
    symbol: 'K-USA-A(A)',
    rawSymbol: 'K-USA-A(A)',
    name: 'กองทุนเปิดเค หุ้นยูเอส ดัชนี-A ชนิดสะสมมูลค่า',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0159_2555',
    category: 'Foreign',
  },
  {
    symbol: 'K-USA-A(D)',
    rawSymbol: 'K-USA-A(D)',
    name: 'กองทุนเปิดเค หุ้นยูเอส ดัชนี-A ชนิดจ่ายเงินปันผล',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0159_2555',
    category: 'Foreign',
  },
  {
    symbol: 'K-VIETNAM',
    rawSymbol: 'K-VIETNAM',
    name: 'กองทุนเปิดเค เวียดนาม หุ้นทุน',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0045_2565',
    category: 'Foreign',
  },
  {
    symbol: 'K-FIXED',
    rawSymbol: 'K-FIXED',
    name: 'กองทุนเปิดเค ตราสารหนี้',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0017_2538',
    category: 'FixedIncome',
  },
  {
    symbol: 'K-VALUE',
    rawSymbol: 'K-VALUE',
    name: 'กองทุนเปิดเค หุ้นปันผล (K Value Fund)',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0023_2538',
    category: 'Equity',
  },
  {
    symbol: 'K-SELECT',
    rawSymbol: 'K-SELECT',
    name: 'กองทุนเปิดเค ซีเล็คท์ หุ้นทุน',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0014_2536',
    category: 'Equity',
  },
  {
    symbol: 'K-CHINA',
    rawSymbol: 'K-CHINA',
    name: 'กองทุนเปิดเค ไชน่า หุ้นทุน',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'K-STAR',
    rawSymbol: 'K-STAR',
    name: 'กองทุนเปิดเค สตาร์ หุ้นทุน',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    category: 'Equity',
  },
  {
    symbol: 'K-GHEALTH',
    rawSymbol: 'K-GHEALTH',
    name: 'กองทุนเปิดเค โกลบอล เฮลท์แคร์ หุ้นทุน',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'K-SFPLUS',
    rawSymbol: 'K-SFPLUS',
    name: 'กองทุนเปิดเค เอสเอฟ พลัส',
    amc: 'บลจ.กสิกรไทย',
    exchange: 'KAsset',
    market: 'TH',
    currency: 'THB',
    projId: 'M0038_2559',
    category: 'FixedIncome',
  },

  // SCB Asset Management (SCBAM)
  {
    symbol: 'SCBDV',
    rawSymbol: 'SCBDV',
    name: 'กองทุนเปิดไทยพาณิชย์หุ้นทุนปันผล',
    amc: 'บลจ.ไทยพาณิชย์',
    exchange: 'SCBAM',
    market: 'TH',
    currency: 'THB',
    projId: 'M0452_2546',
    category: 'Equity',
  },
  {
    symbol: 'SCBBLN',
    rawSymbol: 'SCBBLN',
    name: 'กองทุนเปิดไทยพาณิชย์ บิลเลียนแนร์',
    amc: 'บลจ.ไทยพาณิชย์',
    exchange: 'SCBAM',
    market: 'TH',
    currency: 'THB',
    projId: 'M0386_2558',
    category: 'Foreign',
  },
  {
    symbol: 'SCBCEH',
    rawSymbol: 'SCBCEH',
    name: 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ ชนิดเฮดจ์',
    amc: 'บลจ.ไทยพาณิชย์',
    exchange: 'SCBAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'SCBSET50',
    rawSymbol: 'SCBSET50',
    name: 'กองทุนเปิดไทยพาณิชย์ เซ็ท 50 อินเด็กซ์',
    amc: 'บลจ.ไทยพาณิชย์',
    exchange: 'SCBAM',
    market: 'TH',
    currency: 'THB',
    projId: 'M0597_2552',
    category: 'Equity',
  },
  {
    symbol: 'SCBNDQ',
    rawSymbol: 'SCBNDQ',
    name: 'กองทุนเปิดไทยพาณิชย์ หุ้นยูเอส เอ็นดีคิว',
    amc: 'บลจ.ไทยพาณิชย์',
    exchange: 'SCBAM',
    market: 'TH',
    currency: 'THB',
    projId: 'M0311_2564',
    category: 'Foreign',
  },
  {
    symbol: 'SCBWORLD',
    rawSymbol: 'SCBWORLD',
    name: 'กองทุนเปิดไทยพาณิชย์ หุ้นเวิลด์',
    amc: 'บลจ.ไทยพาณิชย์',
    exchange: 'SCBAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },

  // BBL Asset Management (BBLAM)
  {
    symbol: 'B-INNOTECH',
    rawSymbol: 'B-INNOTECH',
    name: 'กองทุนเปิดบัวหลวงโกลบอลอินโนเวชั่นและเทคโนโลยี',
    amc: 'บลจ.บัวหลวง',
    exchange: 'BBLAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'B-GLOBAL',
    rawSymbol: 'B-GLOBAL',
    name: 'กองทุนเปิดบัวหลวงโกลบอลเฮลท์แคร์',
    amc: 'บลจ.บัวหลวง',
    exchange: 'BBLAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'B-CARE',
    rawSymbol: 'B-CARE',
    name: 'กองทุนเปิดบัวหลวงเพื่อชีวิตและสุขภาพ',
    amc: 'บลจ.บัวหลวง',
    exchange: 'BBLAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'BTP',
    rawSymbol: 'BTP',
    name: 'กองทุนเปิดบัวหลวงทศพล',
    amc: 'บลจ.บัวหลวง',
    exchange: 'BBLAM',
    market: 'TH',
    currency: 'THB',
    category: 'Equity',
  },
  {
    symbol: 'B-CHINE-EQ',
    rawSymbol: 'B-CHINE-EQ',
    name: 'กองทุนเปิดบัวหลวงไชน่าหุ้นทุน',
    amc: 'บลจ.บัวหลวง',
    exchange: 'BBLAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },

  // Krungsri Asset Management (KSAM)
  {
    symbol: 'KF-GTECH',
    rawSymbol: 'KF-GTECH',
    name: 'กองทุนเปิดกรุงศรีโกลบอลเทคโนโลยีอิควิตี้',
    amc: 'บลจ.กรุงศรี',
    exchange: 'KSAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'KF-HEALTHD',
    rawSymbol: 'KF-HEALTHD',
    name: 'กองทุนเปิดกรุงศรีโกลบอลเฮลธ์แคร์อิควิตี้ปันผล',
    amc: 'บลจ.กรุงศรี',
    exchange: 'KSAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'KF-US-A',
    rawSymbol: 'KF-US-A',
    name: 'กองทุนเปิดกรุงศรีเอ็กซ์คลูซีฟยูเอสอิควิตี้',
    amc: 'บลจ.กรุงศรี',
    exchange: 'KSAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'KFDIV',
    rawSymbol: 'KFDIV',
    name: 'กองทุนเปิดกรุงศรีหุ้นปันผล',
    amc: 'บลจ.กรุงศรี',
    exchange: 'KSAM',
    market: 'TH',
    currency: 'THB',
    category: 'Equity',
  },

  // UOB Asset Management (UOBAM)
  {
    symbol: 'UGIS',
    rawSymbol: 'UGIS',
    name: 'กองทุนเปิด ยูไนเต็ด โกลบอล อินคัม สตราทีจิค บอนด์',
    amc: 'บลจ.ยูโอบี',
    exchange: 'UOBAM',
    market: 'TH',
    currency: 'THB',
    category: 'FixedIncome',
  },
  {
    symbol: 'UHERO',
    rawSymbol: 'UHERO',
    name: 'กองทุนเปิด ยูไนเต็ด ฮีโร่ (Gaming & E-Sports)',
    amc: 'บลจ.ยูโอบี',
    exchange: 'UOBAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },

  // TISCO Asset Management
  {
    symbol: 'TISCOHD',
    rawSymbol: 'TISCOHD',
    name: 'กองทุนเปิด ทิสโก้ ไฮ ดิวิเดนด์ หุ้นทุน',
    amc: 'บลจ.ทิสโก้',
    exchange: 'TISCO',
    market: 'TH',
    currency: 'THB',
    category: 'Equity',
  },
  {
    symbol: 'TISCOUS',
    rawSymbol: 'TISCOUS',
    name: 'กองทุนเปิด ทิสโก้ ยูเอส อิควิตี้',
    amc: 'บลจ.ทิสโก้',
    exchange: 'TISCO',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },

  // ONE, KTAM, Principal
  {
    symbol: 'ONE-UGG',
    rawSymbol: 'ONE-UGG',
    name: 'กองทุนเปิด วรรณ อัลติเมท โกลบอล โกรท',
    amc: 'บลจ.วรรณ',
    exchange: 'ONEAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'KT-CHINA',
    rawSymbol: 'KT-CHINA',
    name: 'กองทุนเปิดเคแทม ไชน่า อิควิตี้ ฟันด์',
    amc: 'บลจ.กรุงไทย',
    exchange: 'KTAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'PRINCIPAL VNEQ',
    rawSymbol: 'PRINCIPAL VNEQ',
    name: 'กองทุนเปิดพรินซิเพิล เวียดนาม อิควิตี้',
    amc: 'บลจ.พรินซิเพิล',
    exchange: 'Principal',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
];

/**
 * Searches Thai mutual funds matching the query.
 * Matches ticker, Thai name, or AMC name.
 */
export async function searchThaiFunds(query: string): Promise<FundSuggestion[]> {
  const clean = query.trim().toUpperCase();
  if (!clean) return POPULAR_THAI_FUNDS.slice(0, 8);

  // 1. Priority 1: Fund ticker symbol starts with query (e.g. typing 'K' -> K-VALUE, K-SELECT, K-CHINA)
  const startsWithSymbol = POPULAR_THAI_FUNDS.filter((f) =>
    f.symbol.toUpperCase().startsWith(clean)
  );

  // Sort startsWith: exact match first, then shorter symbol length, then alphabetical
  startsWithSymbol.sort((a, b) => {
    const aSym = a.symbol.toUpperCase();
    const bSym = b.symbol.toUpperCase();
    if (aSym === clean) return -1;
    if (bSym === clean) return 1;
    if (aSym.length !== bSym.length) return aSym.length - bSym.length;
    return aSym.localeCompare(bSym);
  });

  // 2. Priority 2: Matches in AMC or fund name (only if query is Thai or length >= 3)
  const isThaiScript = /[\u0E00-\u0E7F]/.test(clean);
  const otherMatches = POPULAR_THAI_FUNDS.filter(
    (f) =>
      !f.symbol.toUpperCase().startsWith(clean) &&
      (clean.length >= 3 || isThaiScript) &&
      (f.symbol.toUpperCase().includes(clean) ||
        f.name.toUpperCase().includes(clean) ||
        f.amc.toUpperCase().includes(clean) ||
        f.exchange.toUpperCase().includes(clean))
  );

  return [...startsWithSymbol, ...otherMatches].slice(0, 8);
}

/**
 * Fetches the latest NAV for a Thai mutual fund.
 * Calls the Supabase Edge Function with SEC API fallback.
 */
export async function fetchFundNav(
  projId?: string,
  symbol?: string
): Promise<{ latestNav: number; navDate: string; fundClassName?: string } | null> {
  // Try matching projId from popular catalog if not provided
  let targetProjId = projId;
  const cleanSymbol = symbol ? symbol.trim().toUpperCase() : undefined;
  if (!targetProjId && cleanSymbol) {
    const matched = POPULAR_THAI_FUNDS.find(
      (f) => f.symbol.toUpperCase() === cleanSymbol
    );
    if (matched?.projId) {
      targetProjId = matched.projId;
    }
  }

  if (!targetProjId && !cleanSymbol) {
    return null;
  }

  // 1. Try fetching through Supabase Edge Function
  try {
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fund-nav',
        projId: targetProjId,
        symbol: cleanSymbol,
      }),
    });

    if (res.ok) {
      if (res.status === 204) {
        return null;
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (data.latestNav !== undefined && data.latestNav !== null) {
        return {
          latestNav: Number(data.latestNav),
          navDate: data.navDate || '',
          fundClassName: data.fundClassName,
        };
      }
    }
  } catch (err) {
    console.warn('Edge function fund-nav notice:', err);
  }

  // 2. Fallback: Direct call to SEC Open API
  try {
    const targetParam = cleanSymbol
      ? `fund_class_name=${encodeURIComponent(cleanSymbol)}`
      : `proj_id=${encodeURIComponent(targetProjId!)}`;
    const directUrl = `https://api.sec.or.th/v2/fund/daily-info/nav?${targetParam}&page_size=100`;
    const secRes = await fetch(directUrl, {
      headers: {
        'Ocp-Apim-Subscription-Key': SEC_API_KEY,
      },
    });

    if (secRes.ok && secRes.status !== 204) {
      const text = await secRes.text();
      const secData = text ? JSON.parse(text) : {};
      const items: any[] = secData.items || [];
      if (items.length > 0) {
        items.sort((a, b) => (b.nav_date || '').localeCompare(a.nav_date || ''));
        const latest = items[0];
        return {
          latestNav: Number(latest.last_val),
          navDate: latest.nav_date || '',
          fundClassName: latest.fund_class_name,
        };
      }
    }
  } catch (secErr) {
    console.warn('Direct SEC NAV call notice:', secErr);
  }

  return null;
}

/**
 * Fetches and analyzes dividend history for a Thai mutual fund.
 */
export async function fetchFundDividendAnalysis(
  projId?: string,
  symbol?: string
): Promise<DividendAnalysis | null> {
  let targetProjId = projId;
  const cleanSymbol = symbol ? symbol.trim().toUpperCase() : undefined;
  if (!targetProjId && cleanSymbol) {
    const matched = POPULAR_THAI_FUNDS.find(
      (f) => f.symbol.toUpperCase() === cleanSymbol
    );
    if (matched?.projId) {
      targetProjId = matched.projId;
    }
  }

  if (!targetProjId && !cleanSymbol) {
    return null;
  }

  let items: any[] = [];

  // 1. Try Edge function
  try {
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fund-dividends',
        projId: targetProjId,
        symbol: cleanSymbol,
      }),
    });

    if (res.ok) {
      if (res.status === 204) {
        items = [];
      } else {
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        items = data.items || [];
      }
    }
  } catch (err) {
    console.warn('Edge function fund-dividends notice:', err);
  }

  // 2. Direct fallback to SEC Open API
  if (items.length === 0) {
    try {
      const targetParam = cleanSymbol
        ? `class_abbr_name=${encodeURIComponent(cleanSymbol)}`
        : `proj_id=${encodeURIComponent(targetProjId!)}`;
      const directUrl = `https://api.sec.or.th/v2/fund/daily-info/dividend-history?${targetParam}&page_size=20`;
      const secRes = await fetch(directUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': SEC_API_KEY },
      });
      if (secRes.ok) {
        if (secRes.status === 204) {
          items = [];
        } else {
          const text = await secRes.text();
          const secData = text ? JSON.parse(text) : {};
          items = secData.items || [];
        }
      }
    } catch (secErr) {
      console.warn('Direct SEC dividend-history call notice:', secErr);
    }
  }

  if (items.length === 0) {
    return {
      latestDpu: 0,
      annualProjectedDpu: 0,
      frequency: 0,
      frequencyLabel: 'ไม่มีประวัติปันผล',
      lastXdDate: null,
      projectedNextXdDates: [],
      rawHistory: [],
      hasDividends: false,
    };
  }

  // Filter exact matches if cleanSymbol provided (avoid substring matches like SCBDV vs SCBDV-SSF)
  if (cleanSymbol) {
    const exactMatches = items.filter(
      (it) => (it.class_abbr_name || '').trim().toUpperCase() === cleanSymbol
    );
    if (exactMatches.length > 0) {
      items = exactMatches;
    }
  }

  // Sort by dividend_date / book_close_date descending
  items.sort((a, b) =>
    (b.book_close_date || b.dividend_date || '').localeCompare(
      a.book_close_date || a.dividend_date || ''
    )
  );

  const latestItem = items[0];
  const latestDpu = Number(latestItem.dividend_value) || 0;
  const lastXdDateStr = latestItem.book_close_date
    ? latestItem.book_close_date.split(' ')[0]
    : latestItem.dividend_date
    ? latestItem.dividend_date.split(' ')[0]
    : null;

  // Estimate frequency from items count in past 1-2 years
  const freq = items.length >= 4 ? 4 : (items.length >= 2 ? 2 : 1);
  const freqLabel =
    freq === 4
      ? 'ทุกไตรมาส (Quarterly)'
      : freq === 2
      ? 'ปีละ 2 ครั้ง (Semi-Annual)'
      : 'ปีละครั้ง (Annual)';
  const annualProjectedDpu = Number((latestDpu * freq).toFixed(4));

  // Generate projected next dates
  const projectedDates: string[] = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 30);
  const stepMonths = Math.floor(12 / freq);

  for (let i = 0; i < freq; i++) {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + (i * stepMonths));
    projectedDates.push(d.toISOString().split('T')[0]);
  }

  const rawHistory = items.map((it) => {
    const dateStr = (it.book_close_date || it.dividend_date || '').split(' ')[0] || '';
    return {
      amount: Number(it.dividend_value) || 0,
      date: dateStr,
      timestamp: dateStr ? new Date(dateStr).getTime() : 0,
    };
  });

  return {
    latestDpu,
    annualProjectedDpu,
    frequency: freq,
    frequencyLabel: freqLabel,
    lastXdDate: lastXdDateStr,
    projectedNextXdDates: projectedDates,
    rawHistory,
    hasDividends: latestDpu > 0,
  };
}

/**
 * Resolves the fund category (e.g. Equity, FixedIncome, Foreign, Property)
 * from the curated catalog or dynamically from the SEC profile endpoint.
 */
export async function fetchFundCategory(symbol: string): Promise<string | null> {
  const clean = symbol.trim().toUpperCase();
  if (!clean) return null;

  // 1. Check local catalog first (0ms)
  const matched = POPULAR_THAI_FUNDS.find((f) => f.symbol.toUpperCase() === clean);
  if (matched?.category) {
    return matched.category;
  }

  // 2. Query SEC Open API profiles endpoint
  try {
    const directUrl = `https://api.sec.or.th/v2/fund/general-info/profiles?fund_class_name=${encodeURIComponent(clean)}&page_size=2`;
    const res = await fetch(directUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': SEC_API_KEY },
    });

    if (res.ok && res.status !== 204) {
      const text = await res.text();
      if (text) {
        const data = JSON.parse(text);
        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          const desc = (item.policy_desc || '').trim();
          const isForeign = item.invest_country_flag === 1 || !!item.feederfund_master_fund;

          if (desc.includes('ตราสารหนี้')) {
            return isForeign ? 'Foreign' : 'FixedIncome';
          }
          if (desc.includes('ตราสารทุน')) {
            return isForeign ? 'Foreign' : 'Equity';
          }
          if (desc.includes('ผสม')) return 'Mixed';
          if (desc.includes('อสังหา')) return 'Property';
          if (desc.includes('โภคภัณฑ์') || desc.includes('ทอง') || desc.includes('น้ำมัน')) return 'Commodity';
          if (desc.includes('ตลาดเงิน')) return 'MoneyMarket';
          if (isForeign) return 'Foreign';
        }
      }
    }
  } catch (err) {
    console.warn('fetchFundCategory notice:', err);
  }

  return null;
}

