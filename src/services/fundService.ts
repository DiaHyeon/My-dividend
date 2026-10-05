/**
 * This service provides Thai mutual fund search autocomplete, daily NAV retrieval, and dividend history analysis using the SEC Open API and local fund catalog.
 */

import { DividendAnalysis } from './stockService';
import { getLocalDateString } from '../utils/dateUtils';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { invokeStockProxy } from './proxyClient';

export const FUNDS_CATALOG_SYNC_KEY = '@mydividend_last_funds_catalog_sync';
export const FUNDS_SYNC_INTERVAL_DAYS = 30;

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

export type FundShareClassType = 'DIVIDEND' | 'ACCUMULATION' | 'TAX_SAVING' | 'AUTO_REDEEM' | 'GENERAL';

export interface FundClassMeta {
  type: FundShareClassType;
  tokenText: string;     // 'D', 'A', 'SSF', 'RMF', 'TESG', 'R'
  label: string;         // 'ปันผล', 'สะสมมูลค่า', 'ลดหย่อนภาษี', 'รับซื้อคืน'
  tokenColor: string;    // Gold '#D97706', Gray '#64748B', Purple '#7C3AED', Blue '#2563EB'
  tokenBg: string;       // '#FEF3C7', '#F1F5F9', '#F5F3FF', '#EFF6FF'
  tokenBorder: string;   // '#F59E0B', '#CBD5E1', '#DDD6FE', '#93C5FD'
  isDividend: boolean;
}

/**
 * Detects the share class of a Thai mutual fund from its symbol and name.
 * Disambiguates Dividend-paying (-D) vs Accumulation (-A) vs Tax-Saving (SSF/RMF/TESG).
 */
export function detectFundClass(symbol: string, name?: string): FundClassMeta {
  const sym = symbol.toUpperCase().trim();
  const n = (name || '').toUpperCase().trim();

  // 1. Tax saving classes (SSF, RMF, TESG, ThaiESG)
  if (sym.includes('SSF') || n.includes('SSF') || sym.includes('-SSF') || sym.includes('(SSF)')) {
    return {
      type: 'TAX_SAVING',
      tokenText: 'SSF',
      label: 'ลดหย่อนภาษี',
      tokenColor: '#7C3AED',
      tokenBg: '#F5F3FF',
      tokenBorder: '#DDD6FE',
      isDividend: false,
    };
  }
  if (sym.includes('RMF') || n.includes('RMF') || sym.includes('-RMF') || sym.includes('(RMF)')) {
    return {
      type: 'TAX_SAVING',
      tokenText: 'RMF',
      label: 'ลดหย่อนภาษี',
      tokenColor: '#7C3AED',
      tokenBg: '#F5F3FF',
      tokenBorder: '#DDD6FE',
      isDividend: false,
    };
  }
  if (sym.includes('TESG') || sym.includes('THAIESG') || n.includes('THAIESG') || n.includes('THAI ESG')) {
    return {
      type: 'TAX_SAVING',
      tokenText: 'TESG',
      label: 'ลดหย่อนภาษี',
      tokenColor: '#7C3AED',
      tokenBg: '#F5F3FF',
      tokenBorder: '#DDD6FE',
      isDividend: false,
    };
  }

  // 2. Explicit Dividend paying class (-D, -A(D), (D), -DIV, or name has 'ปันผล' / 'DIVIDEND' / 'HI DIV')
  const isExplicitDiv =
    sym.endsWith('-D') ||
    sym.endsWith('(D)') ||
    sym.includes('-A(D)') ||
    sym.includes('-D(') ||
    sym.endsWith('-DIV') ||
    sym.includes('DIVIDEND') ||
    sym.includes('KFDIV') ||
    sym.includes('SCBDV') ||
    sym.includes('TISCOHD') ||
    n.includes('ปันผล') ||
    n.includes('DIVIDEND');

  if (isExplicitDiv) {
    return {
      type: 'DIVIDEND',
      tokenText: 'D',
      label: 'ปันผล',
      tokenColor: '#B45309', // Deep Gold Amber
      tokenBg: '#FEF3C7',    // Warm light amber
      tokenBorder: '#F59E0B',// Vivid Gold
      isDividend: true,
    };
  }

  // 3. Auto Redemption (-R, (R), (AR), or 'รับซื้อคืนอัตโนมัติ')
  const isAutoRedeem =
    sym.endsWith('-R') ||
    sym.endsWith('(R)') ||
    sym.includes('-A(R)') ||
    sym.includes('-R(') ||
    n.includes('รับซื้อคืนอัตโนมัติ') ||
    n.includes('AUTO REDEMPTION');

  if (isAutoRedeem) {
    return {
      type: 'AUTO_REDEEM',
      tokenText: 'R',
      label: 'รับซื้อคืน',
      tokenColor: '#2563EB',
      tokenBg: '#EFF6FF',
      tokenBorder: '#93C5FD',
      isDividend: false,
    };
  }

  // 4. Accumulation class (-A, -A(A), (A), -ACC, or name has 'สะสมมูลค่า')
  const isAccum =
    sym.endsWith('-A') ||
    sym.endsWith('(A)') ||
    sym.includes('-A(A)') ||
    sym.includes('-A(') ||
    sym.endsWith('-ACC') ||
    n.includes('สะสมมูลค่า') ||
    n.includes('ACCUMULATION');

  if (isAccum) {
    return {
      type: 'ACCUMULATION',
      tokenText: 'A',
      label: 'สะสมมูลค่า',
      tokenColor: '#64748B', // Cool slate gray
      tokenBg: '#F1F5F9',
      tokenBorder: '#CBD5E1',
      isDividend: false,
    };
  }

  // 5. General / Default Fund
  return {
    type: 'GENERAL',
    tokenText: 'F',
    label: 'ทั่วไป',
    tokenColor: '#8B5CF6',
    tokenBg: '#F3E8FF',
    tokenBorder: '#DDD6FE',
    isDividend: false,
  };
}

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
    symbol: 'SCBDV-A',
    rawSymbol: 'SCBDV-A',
    name: 'กองทุนเปิดไทยพาณิชย์หุ้นทุนปันผล (ชนิดสะสมมูลค่า)',
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
    symbol: 'KF-GTECH-D',
    rawSymbol: 'KF-GTECH-D',
    name: 'กองทุนเปิดกรุงศรีโกลบอลเทคโนโลยีอิควิตี้ (ชนิดจ่ายเงินปันผล)',
    amc: 'บลจ.กรุงศรี',
    exchange: 'KSAM',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'KF-GTECH-A',
    rawSymbol: 'KF-GTECH-A',
    name: 'กองทุนเปิดกรุงศรีโกลบอลเทคโนโลยีอิควิตี้ (ชนิดสะสมมูลค่า)',
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
  {
    symbol: 'PRINCIPAL iPROP-D',
    rawSymbol: 'PRINCIPAL iPROP-D',
    name: 'กองทุนเปิดพรินซิเพิล อินคัม พร็อพเพอร์ตี้ (ชนิดจ่ายเงินปันผล)',
    amc: 'บลจ.พรินซิเพิล',
    exchange: 'Principal',
    market: 'TH',
    currency: 'THB',
    category: 'Property',
  },
  {
    symbol: 'PRINCIPAL iPROP-A',
    rawSymbol: 'PRINCIPAL iPROP-A',
    name: 'กองทุนเปิดพรินซิเพิล อินคัม พร็อพเพอร์ตี้ (ชนิดสะสมมูลค่า)',
    amc: 'บลจ.พรินซิเพิล',
    exchange: 'Principal',
    market: 'TH',
    currency: 'THB',
    category: 'Property',
  },
  {
    symbol: 'PRINCIPAL GCLOUD',
    rawSymbol: 'PRINCIPAL GCLOUD',
    name: 'กองทุนเปิดพรินซิเพิล โกลบอล คลาวด์ คอมพิวติ้ง',
    amc: 'บลจ.พรินซิเพิล',
    exchange: 'Principal',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'M-EDGE',
    rawSymbol: 'M-EDGE',
    name: 'กองทุนเปิดเอ็มเอฟซี โกลบอล เอ็ดจ์',
    amc: 'บลจ.เอ็มเอฟซี',
    exchange: 'MFC',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'M-VIETNAM',
    rawSymbol: 'M-VIETNAM',
    name: 'กองทุนเปิดเอ็มเอฟซี เวียดนาม อิควิตี้',
    amc: 'บลจ.เอ็มเอฟซี',
    exchange: 'MFC',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'M-MIDSMALL',
    rawSymbol: 'M-MIDSMALL',
    name: 'กองทุนเปิดเอ็มเอฟซี มิด สมอล แค็ป',
    amc: 'บลจ.เอ็มเอฟซี',
    exchange: 'MFC',
    market: 'TH',
    currency: 'THB',
    category: 'Equity',
  },
  {
    symbol: 'M-REIT',
    rawSymbol: 'M-REIT',
    name: 'กองทุนเปิดเอ็มเอฟซี เรียล เอสเตท พลัส',
    amc: 'บลจ.เอ็มเอฟซี',
    exchange: 'MFC',
    market: 'TH',
    currency: 'THB',
    category: 'Property',
  },
  {
    symbol: 'LHGEQ',
    rawSymbol: 'LHGEQ',
    name: 'กองทุนเปิด แอล เอช โกลบอล อิควิตี้',
    amc: 'บลจ.แลนด์ แอนด์ เฮ้าส์',
    exchange: 'LHFund',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'LHVIET',
    rawSymbol: 'LHVIET',
    name: 'กองทุนเปิด แอล เอช เวียดนาม',
    amc: 'บลจ.แลนด์ แอนด์ เฮ้าส์',
    exchange: 'LHFund',
    market: 'TH',
    currency: 'THB',
    category: 'Foreign',
  },
  {
    symbol: 'LHPROPD',
    rawSymbol: 'LHPROPD',
    name: 'กองทุนเปิด แอล เอช พร็อพเพอร์ตี้ พลัส ปันผล',
    amc: 'บลจ.แลนด์ แอนด์ เฮ้าส์',
    exchange: 'LHFund',
    market: 'TH',
    currency: 'THB',
    category: 'Property',
  },
];

/**
 * Performs a silent, non-blocking 30-day periodic synchronization of the Thai Mutual Funds catalog.
 * Only executes if 30 days have elapsed since the last successful sync.
 */
export async function syncFundsCatalogIfNeeded(): Promise<{ synced: boolean; count?: number }> {
  try {
    const lastSyncStr = await AsyncStorage.getItem(FUNDS_CATALOG_SYNC_KEY);
    if (lastSyncStr) {
      const lastDate = new Date(lastSyncStr).getTime();
      const now = Date.now();
      const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
      if (diffDays < FUNDS_SYNC_INTERVAL_DAYS) {
        return { synced: false };
      }
    }

    // 30 days elapsed or never synced before -> Trigger silent sync via Edge Function
    const res = await invokeStockProxy({ action: 'sync-funds' });
    if (res?.data?.items && Array.isArray(res.data.items)) {
      const records = res.data.items
        .map((it: any) => ({
          symbol: it.class_abbr_name || it.proj_abbr_name || it.fund_class_name,
          name_th: it.proj_name_th || it.fund_name_th,
          name_en: it.proj_name_en || it.fund_name_en,
          amc_name: it.unique_id || it.amc_name || 'บลจ.ไทย',
          exchange: it.amc_abbr || 'FUNDS',
          proj_id: it.proj_id,
          updated_at: new Date().toISOString(),
        }))
        .filter((r: any) => Boolean(r.symbol));

      if (records.length > 0) {
        await supabase.from('thai_funds_catalog').upsert(records, { onConflict: 'symbol' });
      }
    }

    await AsyncStorage.setItem(FUNDS_CATALOG_SYNC_KEY, new Date().toISOString());
    return { synced: true, count: res?.data?.synced || 0 };
  } catch (err: any) {
    console.warn('[fundService] Background 30-day sync notice:', err?.message || err);
    return { synced: false };
  }
}

/**
 * Searches Thai mutual funds matching the query.
 * First queries the Supabase thai_funds_catalog table, then falls back to local catalog.
 */
export async function searchThaiFunds(query: string): Promise<FundSuggestion[]> {
  const clean = query.trim();
  if (!clean) return POPULAR_THAI_FUNDS.slice(0, 8);
  const cleanUpper = clean.toUpperCase();

  // 1. Tier 1: Query Supabase thai_funds_catalog table (Fast Indexed Search)
  try {
    const { data, error } = await supabase
      .from('thai_funds_catalog')
      .select('symbol, name_th, name_en, amc_name, exchange, proj_id, category')
      .or(`symbol.ilike.%${clean}%,name_th.ilike.%${clean}%,amc_name.ilike.%${clean}%,exchange.ilike.%${clean}%`)
      .limit(15);

    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped: FundSuggestion[] = data.map((d: any) => ({
        symbol: d.symbol,
        rawSymbol: d.symbol,
        name: d.name_th || d.name_en || d.symbol,
        amc: d.amc_name || 'กองทุนรวมไทย',
        exchange: d.exchange || 'FUNDS',
        market: 'TH' as const,
        currency: 'THB' as const,
        projId: d.proj_id,
        category: d.category,
      }));

      // Sort: exact symbol match first, then dividend class first
      mapped.sort((a, b) => {
        const aSym = a.symbol.toUpperCase();
        const bSym = b.symbol.toUpperCase();
        if (aSym === cleanUpper) return -1;
        if (bSym === cleanUpper) return 1;

        const aDiv = detectFundClass(a.symbol, a.name).isDividend;
        const bDiv = detectFundClass(b.symbol, b.name).isDividend;
        if (aDiv && !bDiv) return -1;
        if (!aDiv && bDiv) return 1;

        return 0;
      });

      return mapped.slice(0, 8);
    }
  } catch {
    // Database table not available or network error -> proceed with local catalog fallback
  }

  // 2. Tier 2: Local catalog search
  const startsWithSymbol = POPULAR_THAI_FUNDS.filter((f) =>
    f.symbol.toUpperCase().startsWith(cleanUpper)
  );

  startsWithSymbol.sort((a, b) => {
    const aSym = a.symbol.toUpperCase();
    const bSym = b.symbol.toUpperCase();
    if (aSym === cleanUpper) return -1;
    if (bSym === cleanUpper) return 1;

    const aDiv = detectFundClass(a.symbol, a.name).isDividend;
    const bDiv = detectFundClass(b.symbol, b.name).isDividend;
    if (aDiv && !bDiv) return -1;
    if (!aDiv && bDiv) return 1;

    if (aSym.length !== bSym.length) return aSym.length - bSym.length;
    return aSym.localeCompare(bSym);
  });

  const isThaiScript = /[\u0E00-\u0E7F]/.test(clean);
  const otherMatches = POPULAR_THAI_FUNDS.filter(
    (f) =>
      !f.symbol.toUpperCase().startsWith(cleanUpper) &&
      (clean.length >= 2 || isThaiScript) &&
      (f.symbol.toUpperCase().includes(cleanUpper) ||
        f.name.toUpperCase().includes(cleanUpper) ||
        f.amc.toUpperCase().includes(cleanUpper) ||
        f.exchange.toUpperCase().includes(cleanUpper))
  );

  const existingSymbols = new Set([...startsWithSymbol, ...otherMatches].map((f) => f.symbol.toUpperCase()));

  // 3. Tier 3: Flexible dynamic ก.ล.ต. search option (supports Thai and alphanumeric names)
  const dynamicOption: FundSuggestion[] =
    !existingSymbols.has(cleanUpper) && clean.length >= 2
      ? [
          {
            symbol: cleanUpper,
            rawSymbol: cleanUpper,
            name: `ดึงข้อมูล NAV ของ "${clean}" จาก ก.ล.ต.`,
            amc: 'กองทุนรวมไทย',
            exchange: 'ก.ล.ต.',
            market: 'TH',
            currency: 'THB',
          },
        ]
      : [];

  return [...startsWithSymbol, ...otherMatches, ...dynamicOption].slice(0, 8);
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

  // 1. Fetch through Supabase Edge Function (stock-proxy)
  try {
    const { data } = await invokeStockProxy({
      action: 'fund-nav',
      projId: targetProjId,
      symbol: cleanSymbol,
    });

    if (data && data.latestNav !== undefined && data.latestNav !== null) {
      return {
        latestNav: Number(data.latestNav),
        navDate: data.navDate || '',
        fundClassName: data.fundClassName,
      };
    }
  } catch (err: any) {
    console.warn('[fundService] Edge function fund-nav notice:', err?.message || err);
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

  // 1. Fetch through Supabase Edge Function (stock-proxy)
  try {
    const { data } = await invokeStockProxy({
      action: 'fund-dividends',
      projId: targetProjId,
      symbol: cleanSymbol,
    });

    if (data && Array.isArray(data.items)) {
      items = data.items;
    }
  } catch (err) {
    console.warn('Edge function fund-dividends notice:', err);
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
    projectedDates.push(getLocalDateString(d));
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

  // 2. Keyword heuristic fallback based on standard Thai mutual fund naming conventions
  if (clean.includes('BOND') || clean.includes('FIXED') || clean.includes('DEBT') || clean.includes('PLUS') || clean.includes('GOV') || clean.includes('TREASURY')) {
    return 'FixedIncome';
  }
  if (clean.includes('EQ') || clean.includes('DIV') || clean.includes('SET') || clean.includes('INDEX') || clean.includes('GROWTH')) {
    return 'Equity';
  }
  if (clean.includes('MIX') || clean.includes('BALANCED') || clean.includes('MULTI') || clean.includes('TARGET')) {
    return 'Mixed';
  }
  if (clean.includes('PROP') || clean.includes('INFRA') || clean.includes('REIT') || clean.includes('ESTATE')) {
    return 'Property';
  }
  if (clean.includes('GOLD') || clean.includes('OIL') || clean.includes('COMMODITY') || clean.includes('SILVER')) {
    return 'Commodity';
  }
  if (clean.includes('CASH') || clean.includes('MONEY') || clean.includes('LIQUID')) {
    return 'MoneyMarket';
  }
  if (clean.includes('FIF') || clean.includes('US') || clean.includes('GLOBAL') || clean.includes('CHINA') || clean.includes('TECH') || clean.includes('WORLD') || clean.includes('ASIA') || clean.includes('EUROPE') || clean.includes('INDIA') || clean.includes('JAPAN')) {
    return 'Foreign';
  }

  return 'Other';
}

