import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { AssetSummary, AssetType, Transaction, DividendSchedule } from '../types/database';
import { isKnownUSSymbol, getCachedExchangeRate, setAssetCurrency, getAllTransactionCurrencyMeta } from './currencyService';
import { detectSector, setAssetSector } from './sectorService';
import { fetchStockPrice, fetchDividendAnalysis } from './stockService';
import { fetchFundNav, fetchFundDividendAnalysis } from './fundService';
import { consolidateDuplicateAssets } from './assetConsolidationService';
import { ensureAuthenticated } from './authService';
import { syncAllUpcomingXdReminders } from './notificationService';
import { getLocalDateString } from '../utils/dateUtils';

export interface CsvAssetRow {
  symbol: string;
  asset_type: AssetType;
  shares: number;
  cost_price: number;
  currency: 'THB' | 'USD';
  current_price?: number;
  transaction_date: string;
  tax_rate?: number;
  expected_dpu?: number;
}

export interface ValidationIssue {
  rowNumber: number;
  symbol?: string;
  field: string;
  message: string;
  level: 'error' | 'warning';
}

export interface ParseResult {
  validRows: CsvAssetRow[];
  issues: ValidationIssue[];
  totalRawRows: number;
}

export interface ImportSummary {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * ล้างค่าตัวเลขที่มีเครื่องหมายจุลภาค สกุลเงิน หรือช่องว่างให้เป็นตัวเลขทศนิยม
 */
function cleanNumber(val: any, defaultValue: number = 0): number {
  if (val === null || val === undefined || val === '') return defaultValue;
  if (typeof val === 'number') return isNaN(val) ? defaultValue : val;
  const cleaned = String(val).replace(/[,฿$\s]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * ปรับรูปแบบวันที่ให้เป็น YYYY-MM-DD มาตรฐาน
 */
function normalizeDate(dateVal: any): string {
  if (!dateVal || String(dateVal).trim() === '') {
    return getLocalDateString();
  }
  const str = String(dateVal).trim();

  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY/MM/DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    // DD/MM/YYYY
    let year = parseInt(parts[2], 10);
    if (year > 2500) year -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return getLocalDateString(d);
    }
  } catch {
    // fallback
  }

  return getLocalDateString();
}

/**
 * วิเคราะห์ประเภทสินทรัพย์อัตโนมัติจากชื่อย่อ หากในไฟล์ไม่ได้ระบุไว้
 */
export function inferAssetType(symbol: string): AssetType {
  const upper = (symbol || '').trim().toUpperCase();

  // เงินฝาก
  if (
    upper.includes('KEPT') ||
    upper.includes('DIME') ||
    upper.includes('SAVINGS') ||
    upper.includes('DEPOSIT') ||
    upper.includes('เงินฝาก') ||
    upper.includes('ออมทรัพย์') ||
    upper.includes('ฝากประจำ')
  ) {
    return 'CASH';
  }

  // กองทุนรวมไทย (มีขีดคลาสย่อย หรือชื่อ บลจ. ชั้นนำ)
  if (
    upper.includes('-A') ||
    upper.includes('-D') ||
    upper.includes('-SSF') ||
    upper.includes('-RMF') ||
    upper.startsWith('K-') ||
    (upper.startsWith('SCB') && upper.length > 4) ||
    upper.startsWith('B-') ||
    upper.startsWith('KF-') ||
    (upper.startsWith('TISCO') && upper.length > 5) ||
    upper.startsWith('ONE-') ||
    upper.startsWith('UGIS') ||
    upper.startsWith('KT-')
  ) {
    return 'FUNDS';
  }

  return 'STOCKS';
}

/**
 * แปลงและตรวจเช็คข้อมูล CSV ให้เป็น CsvAssetRow[]
 */
export function parseAndValidateCsv(csvContent: string): ParseResult {
  const issues: ValidationIssue[] = [];
  const validRows: CsvAssetRow[] = [];

  const parsed = Papa.parse<Record<string, any>>(csvContent.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    parsed.errors.forEach((err) => {
      issues.push({
        rowNumber: (err.row ?? 0) + 1,
        field: 'csv_format',
        message: err.message,
        level: 'error',
      });
    });
  }

  const rawRows = parsed.data || [];

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // +1 for header, +1 for 1-index

    // ค้นหาคอลัมน์ Symbol
    const symbolKey = Object.keys(row).find((k) =>
      ['symbol', 'ticker', 'หลักทรัพย์', 'ชื่อหุ้น', 'ชื่อสินทรัพย์', 'asset', 'code'].includes(k)
    );
    const rawSymbol = symbolKey ? String(row[symbolKey] || '').trim() : '';

    if (!rawSymbol) {
      issues.push({
        rowNumber: rowNum,
        field: 'symbol',
        message: 'ไม่พบชื่อย่อสินทรัพย์ (Symbol ว่างเปล่า)',
        level: 'error',
      });
      return;
    }

    // ค้นหาคอลัมน์ Asset Type
    const typeKey = Object.keys(row).find((k) =>
      ['asset_type', 'type', 'ประเภท', 'หมวดหมู่', 'category'].includes(k)
    );
    let assetType: AssetType = inferAssetType(rawSymbol);
    if (typeKey && row[typeKey]) {
      const rawType = String(row[typeKey]).trim().toUpperCase();
      if (['STOCK', 'STOCKS', 'หุ้น'].includes(rawType)) assetType = 'STOCKS';
      else if (['FUND', 'FUNDS', 'กองทุน', 'กองทุนรวม'].includes(rawType)) assetType = 'FUNDS';
      else if (['CASH', 'เงินฝาก', 'DEPOSIT', 'ธนาคาร'].includes(rawType)) assetType = 'CASH';
    }

    // ค้นหาคอลัมน์ Shares
    const sharesKey = Object.keys(row).find((k) =>
      ['shares', 'volume', 'units', 'จำนวน', 'จำนวนหุ้น', 'หน่วยลงทุน', 'available', 'ยอดเงินฝาก'].includes(k)
    );
    const sharesVal = cleanNumber(sharesKey ? row[sharesKey] : null, 0);

    if (sharesVal <= 0) {
      issues.push({
        rowNumber: rowNum,
        symbol: rawSymbol,
        field: 'shares',
        message: `จำนวนหุ้นหรือยอดเงินฝากต้องมากกว่า 0 (พบ: ${sharesKey ? row[sharesKey] : 'ว่าง'})`,
        level: 'error',
      });
      return;
    }

    // ค้นหาคอลัมน์ Cost Price
    const costKey = Object.keys(row).find((k) =>
      ['cost_price', 'cost', 'avg cost', 'avg_cost', 'average cost', 'ต้นทุน', 'ราคาต้นทุน', 'ต้นทุนเฉลี่ย', 'price_per_share'].includes(k)
    );
    let costPrice = cleanNumber(costKey ? row[costKey] : null, assetType === 'CASH' ? 1.0 : 0);

    if (assetType !== 'CASH' && costPrice <= 0) {
      issues.push({
        rowNumber: rowNum,
        symbol: rawSymbol,
        field: 'cost_price',
        message: `ราคาต้นทุนต่อหน่วยควรมากกว่า 0`,
        level: 'warning',
      });
    }

    // ค้นหาคอลัมน์ Currency
    const currencyKey = Object.keys(row).find((k) =>
      ['currency', 'ccy', 'สกุลเงิน'].includes(k)
    );
    let currency: 'THB' | 'USD' = 'THB';
    if (currencyKey && row[currencyKey]) {
      const rawCcy = String(row[currencyKey]).trim().toUpperCase();
      if (rawCcy === 'USD' || rawCcy === '$') currency = 'USD';
    } else if (assetType === 'STOCKS' && isKnownUSSymbol(rawSymbol)) {
      currency = 'USD';
    }

    // ค้นหาคอลัมน์ Transaction Date
    const dateKey = Object.keys(row).find((k) =>
      ['transaction_date', 'date', 'วันที่', 'วันที่ซื้อ', 'วันที่เริ่มฝาก'].includes(k)
    );
    const transactionDate = normalizeDate(dateKey ? row[dateKey] : null);

    // ค้นหาคอลัมน์ Tax Rate
    const taxKey = Object.keys(row).find((k) =>
      ['tax_rate', 'tax', 'ภาษี', 'withholding_tax'].includes(k)
    );
    let taxRate: number | undefined = undefined;
    if (taxKey && row[taxKey] !== undefined && row[taxKey] !== '') {
      let parsedTax = cleanNumber(row[taxKey]);
      if (parsedTax > 1) parsedTax = parsedTax / 100; // หากกรอก 10 ให้แปลงเป็น 0.10
      taxRate = Number(parsedTax.toFixed(4));
    }

    // ค้นหาคอลัมน์ Expected DPU / ปันผล
    const dpuKey = Object.keys(row).find((k) =>
      ['expected_dpu', 'dpu', 'dividend', 'เงินปันผล', 'ปันผลต่อหุ้น', 'ดอกเบี้ย'].includes(k)
    );
    let expectedDpu: number | undefined = undefined;
    if (dpuKey && row[dpuKey] !== undefined && row[dpuKey] !== '') {
      expectedDpu = cleanNumber(row[dpuKey]);
    }

    // ค้นหาคอลัมน์ Current Price (ถ้ามีระบุในไฟล์)
    const currentPriceKey = Object.keys(row).find((k) =>
      ['current_price', 'market_price', 'market price', 'ราคาปัจจุบัน', 'nav', 'ราคาปิด'].includes(k)
    );
    let currentPrice: number | undefined = undefined;
    if (currentPriceKey && row[currentPriceKey]) {
      currentPrice = cleanNumber(row[currentPriceKey]);
    }

    validRows.push({
      symbol: rawSymbol.toUpperCase(),
      asset_type: assetType,
      shares: Number(sharesVal.toFixed(4)),
      cost_price: Number(costPrice.toFixed(4)),
      currency,
      current_price: currentPrice !== undefined ? Number(currentPrice.toFixed(4)) : undefined,
      transaction_date: transactionDate,
      tax_rate: taxRate,
      expected_dpu: expectedDpu !== undefined ? Number(expectedDpu.toFixed(4)) : undefined,
    });
  });

  return {
    validRows,
    issues,
    totalRawRows: rawRows.length,
  };
}

/**
 * บันทึกรายการสินทรัพย์จาก CSV เข้าสู่ฐานข้อมูล Supabase
 */
export async function importAssetRows(
  rows: CsvAssetRow[],
  onProgress?: (progress: { current: number; total: number; symbol: string }) => void
): Promise<ImportSummary> {
  await ensureAuthenticated();
  const exchangeRate = await getCachedExchangeRate();

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    onProgress?.({
      current: i + 1,
      total: rows.length,
      symbol: item.symbol,
    });

    try {
      const isUsd = item.currency === 'USD';
      const rate = isUsd ? exchangeRate : 1.0;

      // แปลงราคาเป็น THB (Base Currency) ตามกฎของระบบ
      const convertedCost = item.cost_price * rate;
      let convertedCurrent = item.current_price ? item.current_price * rate : convertedCost;

      // 1. ดึงราคาตลาดอัตโนมัติหากไม่ได้ระบุราคาปัจจุบันมา
      if (!item.current_price || item.current_price <= 0) {
        if (item.asset_type === 'STOCKS') {
          const livePrice = await fetchStockPrice(item.symbol);
          if (livePrice && livePrice > 0) {
            convertedCurrent = isUsd ? livePrice * rate : livePrice;
          }
        } else if (item.asset_type === 'FUNDS') {
          const navResult = await fetchFundNav(item.symbol);
          if (navResult && navResult.latestNav && navResult.latestNav > 0) {
            convertedCurrent = navResult.latestNav;
          }
        } else if (item.asset_type === 'CASH') {
          convertedCurrent = 1.0000;
        }
      }

      // คำนวณอัตราภาษีเริ่มต้น
      const taxRate = item.tax_rate !== undefined
        ? item.tax_rate
        : item.asset_type === 'CASH'
        ? 0.1500
        : isUsd
        ? 0.1500
        : 0.1000;

      // 2. ตรวจสอบว่ามีสินทรัพย์ตัวนี้ในพอร์ตอยู่แล้วหรือไม่
      const { data: existingAssets } = await supabase
        .from('assets')
        .select('*')
        .ilike('symbol', item.symbol)
        .eq('asset_type', item.asset_type)
        .eq('is_archived', false)
        .order('created_at', { ascending: true })
        .limit(1);

      let assetId: string;

      if (existingAssets && existingAssets.length > 0) {
        const existing = existingAssets[0];
        assetId = existing.id;
        // อัปเดตราคาล่าสุด
        await supabase
          .from('assets')
          .update({
            current_price: Number(convertedCurrent.toFixed(4)),
            tax_rate: taxRate,
          })
          .eq('id', assetId);
      } else {
        // เพิ่มสินทรัพย์ใหม่
        const { data: newAsset, error: assetErr } = await supabase
          .from('assets')
          .insert({
            symbol: item.symbol,
            asset_type: item.asset_type,
            current_price: Number(convertedCurrent.toFixed(4)),
            tax_rate: taxRate,
            is_archived: false,
          })
          .select()
          .single();

        if (assetErr || !newAsset) {
          throw new Error(assetErr?.message || 'ไม่สามารถเพิ่มสินทรัพย์ได้');
        }
        assetId = newAsset.id;
      }

      // 3. บันทึกธุรกรรมการซื้อเข้าตาราง transactions (พร้อม Resilient Fallback สำหรับ exchange_rate)
      const txPayload: any = {
        asset_id: assetId,
        type: 'BUY',
        shares: Number(item.shares.toFixed(4)),
        price_per_share: Number(convertedCost.toFixed(4)),
        transaction_date: item.transaction_date,
        exchange_rate: Number(rate.toFixed(4)),
      };

      let { data: insertedTx, error: txErr } = await supabase
        .from('transactions')
        .insert(txPayload)
        .select()
        .single();

      if (txErr && (txErr.message?.includes('exchange_rate') || txErr.code === '42703' || txErr.message?.includes('schema cache'))) {
        delete txPayload.exchange_rate;
        const retry = await supabase
          .from('transactions')
          .insert(txPayload)
          .select()
          .single();
        insertedTx = retry.data;
        txErr = retry.error;
      }

      if (txErr) {
        throw new Error(txErr.message || 'ไม่สามารถบันทึกธุรกรรมได้');
      }


      // 4. บันทึกตารางปันผล (dividend_schedules) ในอนาคต 12 เดือนข้างหน้า
      if (item.expected_dpu && item.expected_dpu > 0) {
        // ตรวจสอบก่อนว่าสินทรัพย์นี้มีตารางปันผลในอนาคตอยู่แล้วหรือไม่
        const { data: existingScheds } = await supabase
          .from('dividend_schedules')
          .select('id')
          .eq('asset_id', assetId)
          .eq('is_projected', true);

        if (existingScheds && existingScheds.length > 0) {
          // หากมีอยู่แล้ว ให้อัปเดต DPU ของกำหนดการเดิม ไม่ต้อง insert ซ้ำ
          await supabase
            .from('dividend_schedules')
            .update({ dpu: Number(item.expected_dpu.toFixed(4)) })
            .eq('asset_id', assetId)
            .eq('is_projected', true);
        } else {
          // ค้นหารอบวัน XD ในอนาคตจริง 12 เดือนข้างหน้า
          let futureXdDates: string[] = [];

          if (item.asset_type === 'STOCKS') {
            try {
              const divAnalysis = await fetchDividendAnalysis(item.symbol);
              if (divAnalysis?.hasDividends && divAnalysis.projectedNextXdDates.length > 0) {
                futureXdDates = divAnalysis.projectedNextXdDates;
              }
            } catch {
              // fallback
            }
          } else if (item.asset_type === 'FUNDS') {
            try {
              const fundDiv = await fetchFundDividendAnalysis(undefined, item.symbol);
              if (fundDiv?.hasDividends && fundDiv.projectedNextXdDates.length > 0) {
                futureXdDates = fundDiv.projectedNextXdDates;
              }
            } catch {
              // fallback
            }
          }

          // Fallback: หาก API ไม่มีข้อมูล หรือเป็น CASH ให้สร้างรอบในอนาคต 12 เดือนข้างหน้า
          if (futureXdDates.length === 0) {
            const today = new Date();
            const startMonth = new Date(today.getFullYear(), today.getMonth() + 1, 15);
            // Default 4 quarterly future cycles
            futureXdDates = [0, 3, 6, 9].map((offset) => {
              const d = new Date(startMonth);
              d.setMonth(d.getMonth() + offset);
              return getLocalDateString(d);
            });
          }

          const schedulesToInsert = futureXdDates.map((dateStr) => ({
            asset_id: assetId,
            dpu: Number(item.expected_dpu!.toFixed(4)),
            xd_date: dateStr,
            is_projected: true,
          }));

          await supabase.from('dividend_schedules').insert(schedulesToInsert);
        }
      }

      // 5. บันทึก Sector และ Currency
      const sector = detectSector(item.symbol, item.asset_type);
      await setAssetSector(assetId, sector);
      await setAssetCurrency(assetId, item.currency);

      successCount++;
    } catch (err: any) {
      failedCount++;
      errors.push(`${item.symbol}: ${err.message || 'เกิดข้อผิดพลาดในการบันทึก'}`);
    }
  }

  // รวมรายการซ้ำเพื่อความสมบูรณ์ของพอร์ต
  await consolidateDuplicateAssets();

  // ซิงค์การแจ้งเตือนวัน XD ล่วงหน้าสำหรับรายการที่นำเข้าใหม่
  await syncAllUpcomingXdReminders().catch(() => {});

  return {
    totalProcessed: rows.length,
    successCount,
    failedCount,
    errors,
  };
}

/**
 * สร้างไฟล์ CSV Template ตัวอย่างสำหรับดาวน์โหลดหรือคัดลอก
 */
export function generateCsvTemplate(): string {
  return [
    'symbol,asset_type,shares,cost_price,currency,transaction_date,expected_dpu',
    'PTT,STOCKS,1000,32.50,THB,2024-01-15,2.00',
    'AAPL,STOCKS,10,185.00,USD,2024-02-01,0.96',
    'SCBDV,FUNDS,500.25,12.4500,THB,2024-03-10,0.50',
    'Kept By Krungsri,CASH,50000,1.00,THB,2024-01-01,0.0175',
  ].join('\n');
}

export interface ExportCsvOptions {
  transactions?: Transaction[];
  schedules?: DividendSchedule[];
  currencyMap?: Record<string, 'THB' | 'USD'>;
}

/**
 * ส่งออกข้อมูลพอร์ตสินทรัพย์และประวัติธุรกรรมแบบ Full Backup เป็น CSV
 * ครอบคลุมประวัติการซื้อทุกไม้ ต้นทุนสกุลเงินจริง (USD/THB) และรอบปันผล เพื่อให้กู้คืนพอร์ตได้ 100%
 */
export async function exportPortfolioToCsv(
  assets: AssetSummary[],
  options?: ExportCsvOptions
): Promise<string> {
  const txMetas = await getAllTransactionCurrencyMeta();
  const txList = options?.transactions || [];
  const scheduleMap = new Map<string, number>();

  if (options?.schedules) {
    options.schedules.forEach((s) => {
      if (s.dpu !== undefined && s.dpu !== null) {
        scheduleMap.set(s.asset_id, Number(s.dpu));
      }
    });
  }

  // Schema แม่แบบที่ตรงกับ parseAndValidateCsv() สำหรับ Import กู้คืนได้ 100%
  const headers = [
    'symbol',
    'asset_type',
    'shares',
    'cost_price',
    'currency',
    'transaction_date',
    'expected_dpu',
    'tax_rate',
  ];

  // ถ้ามีรายการธุรกรรมย่อย (Transactions) ให้ส่งออกทุกไม้เพื่อรักษาวันที่และต้นทุนแต่ละรอบ
  if (txList.length > 0) {
    const assetById = new Map<string, AssetSummary>();
    assets.forEach((a) => assetById.set(a.id, a));

    const rows = txList.map((tx) => {
      const asset = assetById.get(tx.asset_id);
      const symbol = asset?.symbol || 'UNKNOWN';
      const assetType = asset?.asset_type || 'STOCKS';
      const meta = txMetas[tx.id];

      const currency =
        asset?.currency ||
        meta?.currency ||
        options?.currencyMap?.[tx.asset_id] ||
        (asset?.asset_type === 'STOCKS' && isKnownUSSymbol(symbol) ? 'USD' : 'THB');
      const costPrice = meta?.originalPrice ?? Number(tx.price_per_share || 0);
      const dpu = scheduleMap.get(tx.asset_id) ?? (asset?.asset_type === 'CASH' ? 0.015 : 0);
      const taxRate =
        asset?.tax_rate !== undefined
          ? Number(asset.tax_rate)
          : assetType === 'CASH'
          ? 0
          : currency === 'USD'
          ? 0.15
          : 0.1;

      return [
        `"${symbol.replace(/"/g, '""')}"`,
        assetType,
        Number(tx.shares || 0).toFixed(4),
        Number(costPrice || 0).toFixed(4),
        currency,
        tx.transaction_date || getLocalDateString(),
        Number(dpu || 0).toFixed(6),
        Number(taxRate || 0).toFixed(4),
      ];
    });

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // กรณีไม่มีธุรกรรมย่อย ส่งออกรายการสินทรัพย์คงเหลือรวมตามมาตรฐาน
  const rows = assets.map((a) => {
    const currency =
      a.currency ||
      options?.currencyMap?.[a.id] ||
      (a.asset_type === 'STOCKS' && isKnownUSSymbol(a.symbol) ? 'USD' : 'THB');
    const dpu = scheduleMap.get(a.id) ?? 0;
    const taxRate =
      a.tax_rate !== undefined
        ? Number(a.tax_rate)
        : a.asset_type === 'CASH'
        ? 0
        : currency === 'USD'
        ? 0.15
        : 0.1;

    return [
      `"${a.symbol.replace(/"/g, '""')}"`,
      a.asset_type,
      Number(a.net_shares || 0).toFixed(4),
      Number(a.weighted_average_cost || 0).toFixed(4),
      currency,
      getLocalDateString(),
      Number(dpu || 0).toFixed(6),
      Number(taxRate || 0).toFixed(4),
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
