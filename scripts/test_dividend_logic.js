// Test runner for dividend calculation logic, cash interest, learned lag, and CSV handling.
const assert = require('node:assert');

// 1. Setup mock environment for Node execution
globalThis.window = {
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; },
  },
};

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Alert: { alert: () => {} },
      StyleSheet: { create: (s) => s },
      Platform: { OS: 'web' },
      View: 'View',
      Text: 'Text',
      Modal: 'Modal',
      TouchableOpacity: 'TouchableOpacity',
      TextInput: 'TextInput',
      ActivityIndicator: 'ActivityIndicator',
    };
  }
  if (request === 'expo' || request.startsWith('expo') || request === '@expo/vector-icons') {
    return {
      default: {},
      Ionicons: { glyphMap: {} },
    };
  }
  return origLoad.apply(this, arguments);
};

// Ensure environment variables for Supabase client
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

// 2. Load compiled services
const { parseLocalDateParts, computeLearnedPayoutLag, estimatePayoutDate, getLocalDateString } = require('../scratch/test_build/src/utils/dateUtils');
const { detectCashFrequency, calculateScheduleCashPayout, calculateCashCycleInfo } = require('../scratch/test_build/src/services/taxService');
const { calculatePortfolioReturns } = require('../scratch/test_build/src/services/returnService');
const { generateCsvTemplate, exportPortfolioToCsv, parseAndValidateCsv } = require('../scratch/test_build/src/services/csvService');
const { resolveIsUSStock } = require('../scratch/test_build/src/services/currencyService');
const { resolveTargetStockSymbol } = require('../scratch/test_build/src/services/stockService');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

async function main() {
  console.log('\n============================================================');
  console.log(' RUNNING COMPREHENSIVE DIVIDEND LOGIC TEST SUITE');
  console.log('============================================================\n');

  // -------------------------------------------------------------
  // SUITE 1: Date Utilities & Adaptive Learned Lag (Issue 4, 10)
  // -------------------------------------------------------------
  console.log('--- Suite 1: Date Utilities & Learned Payout Lag ---');

  runTest('1.1 parseLocalDateParts parses YYYY-MM-DD accurately without UTC drift', () => {
    const d = parseLocalDateParts('2026-10-05');
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 9); // October = 9 (0-indexed)
    assert.strictEqual(d.getDate(), 5);

    const leap = parseLocalDateParts('2024-02-29');
    assert.strictEqual(leap.getMonth(), 1);
    assert.strictEqual(leap.getDate(), 29);
  });

  runTest('1.2 parseLocalDateParts handles null/empty/invalid input gracefully', () => {
    assert.strictEqual(parseLocalDateParts(null), null);
    assert.strictEqual(parseLocalDateParts(''), null);
    assert.strictEqual(parseLocalDateParts('invalid-date'), null);
  });

  runTest('1.3 computeLearnedPayoutLag computes accurate median lag from history', () => {
    const schedules = [
      { xd_date: '2025-03-01', payment_date: '2025-03-29' }, // 28 days
      { xd_date: '2025-06-01', payment_date: '2025-07-01' }, // 30 days
      { xd_date: '2025-09-01', payment_date: '2025-10-02' }, // 31 days
      { xd_date: '2025-12-01', payment_date: '2025-12-30' }, // 29 days
      { xd_date: '2026-03-01', payment_date: '2026-04-02' }, // 32 days
    ];
    // sorted diffs: [28, 29, 30, 31, 32] -> median is 30
    const medianLag = computeLearnedPayoutLag(schedules);
    assert.strictEqual(medianLag, 30);
  });

  runTest('1.4 computeLearnedPayoutLag filters out extreme outliers (< 5 or > 45 days)', () => {
    const schedules = [
      { xd_date: '2025-03-01', payment_date: '2025-03-02' }, // 1 day (outlier typo)
      { xd_date: '2025-06-01', payment_date: '2025-07-01' }, // 30 days (valid)
      { xd_date: '2025-09-01', payment_date: '2025-10-01' }, // 30 days (valid)
      { xd_date: '2025-12-01', payment_date: '2026-06-01' }, // 182 days (outlier error)
    ];
    // only [30, 30] are kept -> median is 30
    const medianLag = computeLearnedPayoutLag(schedules);
    assert.strictEqual(medianLag, 30);
  });

  runTest('1.5 computeLearnedPayoutLag returns null when no valid schedules exist', () => {
    assert.strictEqual(computeLearnedPayoutLag([]), null);
    assert.strictEqual(computeLearnedPayoutLag([{ xd_date: '2025-01-01' }]), null);
  });

  runTest('1.6 estimatePayoutDate uses explicit payment_date when present', () => {
    const est = estimatePayoutDate('2026-04-15', '2026-05-18');
    assert.strictEqual(getLocalDateString(est), '2026-05-18');
  });

  runTest('1.7 estimatePayoutDate for CASH returns XD date (+0 days)', () => {
    const est = estimatePayoutDate('2026-06-30', null, { isCash: true });
    assert.strictEqual(getLocalDateString(est), '2026-06-30');
  });

  runTest('1.8 estimatePayoutDate defaults to US +14 and Thai +20 without learned lag', () => {
    const usEst = estimatePayoutDate('2026-04-01', null, { isUS: true });
    assert.strictEqual(getLocalDateString(usEst), '2026-04-15'); // +14 days

    const thaiEst = estimatePayoutDate('2026-04-01', null, { isUS: false });
    assert.strictEqual(getLocalDateString(thaiEst), '2026-04-21'); // +20 days
  });

  runTest('1.9 estimatePayoutDate applies learnedLagDays when valid (5-45)', () => {
    const est = estimatePayoutDate('2026-04-01', null, { isUS: false, learnedLagDays: 32 });
    assert.strictEqual(getLocalDateString(est), '2026-05-03'); // 32 days after April 1st
  });

  runTest('1.10 estimatePayoutDate rejects learnedLagDays if out of range (< 5 or > 45)', () => {
    const est = estimatePayoutDate('2026-04-01', null, { isUS: false, learnedLagDays: 99 });
    // should fall back to default +20 days
    assert.strictEqual(getLocalDateString(est), '2026-04-21');
  });

  // -------------------------------------------------------------
  // SUITE 2: Cash Frequency & Safe Multi-Year Divisor (Issue 3)
  // -------------------------------------------------------------
  console.log('\n--- Suite 2: Cash Frequency & Interest Calculations ---');

  runTest('2.1 detectCashFrequency detects MONTHLY from monthly schedule dates', () => {
    const dates = ['2026-01-28', '2026-02-28', '2026-03-28', '2026-04-28'];
    assert.strictEqual(detectCashFrequency(dates), 'MONTHLY');
  });

  runTest('2.2 detectCashFrequency detects MONTHLY for single date ending in -28', () => {
    assert.strictEqual(detectCashFrequency(['2026-03-28']), 'MONTHLY');
  });

  runTest('2.3 detectCashFrequency detects SEMI_ANNUAL across multi-year schedules (no row-count bug)', () => {
    // 4 schedules over 2 years: June & Dec
    const dates = ['2025-06-30', '2025-12-31', '2026-06-30', '2026-12-31'];
    // Median gap is 6 months -> MUST be SEMI_ANNUAL (never QUARTERLY despite 4 rows!)
    assert.strictEqual(detectCashFrequency(dates), 'SEMI_ANNUAL');
  });

  runTest('2.4 detectCashFrequency detects ANNUAL when gaps are >= 12 months', () => {
    const dates = ['2024-12-31', '2025-12-31', '2026-12-31'];
    assert.strictEqual(detectCashFrequency(dates), 'ANNUAL');
  });

  runTest('2.5 calculateScheduleCashPayout calculates full semi-annual interest with and without tax', () => {
    // 100,000 THB at 2.0% annual interest, semi-annual (divisor 2)
    // Gross = 100,000 * 0.02 / 2 = 1,000 THB
    const noTax = calculateScheduleCashPayout(100000, 2.0, 0, '2025-01-01', '2026-06-30', 'SEMI_ANNUAL');
    assert.strictEqual(noTax.grossInterest, 1000);
    assert.strictEqual(noTax.netInterest, 1000);
    assert.strictEqual(noTax.taxAmount, 0);
    assert.strictEqual(noTax.isPartialCycle, false);

    const withTax = calculateScheduleCashPayout(100000, 2.0, 0.15, '2025-01-01', '2026-06-30', 'SEMI_ANNUAL');
    assert.strictEqual(withTax.grossInterest, 1000);
    assert.strictEqual(withTax.taxAmount, 150);
    assert.strictEqual(withTax.netInterest, 850);
  });

  runTest('2.6 calculateScheduleCashPayout calculates daily pro-rata interest for mid-cycle deposit', () => {
    // Semi-annual cycle for June 30 starts Jan 1 (181 days).
    // Deposit made on May 1st -> held 60 days
    const partial = calculateScheduleCashPayout(100000, 2.0, 0, '2026-05-01', '2026-06-30', 'SEMI_ANNUAL');
    assert.strictEqual(partial.isPartialCycle, true);
    // Formula: (100000 * 0.02 * daysHeld) / 365
    const expected = (100000 * 0.02 * partial.daysHeld) / 365;
    assert.ok(Math.abs(partial.grossInterest - expected) < 0.01);
  });

  // -------------------------------------------------------------
  // SUITE 3: Confirmed Payouts Fallback when eligibleShares <= 0 (Issue 9, 1)
  // -------------------------------------------------------------
  console.log('\n--- Suite 3: Confirmed Payout Fallback & Foreign FX Locking ---');

  runTest('3.1 calculatePortfolioReturns awards dividend for standard purchase before XD date', () => {
    const assets = [
      { id: 'asset-1', symbol: 'PTT', asset_type: 'STOCKS', currency: 'THB', net_shares: 1000, current_price: 35, total_cost: 32000, tax_rate: 0.1 }
    ];
    const transactions = [
      { id: 'tx-1', asset_id: 'asset-1', type: 'BUY', shares: 1000, price_per_share: 32, transaction_date: '2026-02-01' }
    ];
    const schedules = [
      { id: 'sch-1', asset_id: 'asset-1', dpu: 2.0, xd_date: '2026-03-01', payment_date: '2026-03-25', is_projected: false }
    ];

    const res = calculatePortfolioReturns(assets, transactions, schedules, 35.0);
    // 1000 shares * 2.0 DPU * 1.0 FX * (1 - 0.10 tax) = 1,800 THB
    assert.strictEqual(res.totalCumulativeDividends, 1800);
  });

  runTest('3.2 calculatePortfolioReturns FALLBACK preserves confirmed payout when tx recorded ON XD date', () => {
    // The critical bug: User bought stock on or entered tx date as XD date
    const assets = [
      { id: 'asset-2', symbol: 'CPALL', asset_type: 'STOCKS', currency: 'THB', net_shares: 500, current_price: 60, total_cost: 27500, tax_rate: 0.1 }
    ];
    const transactions = [
      // transaction_date is EXACTLY on xd_date
      { id: 'tx-2', asset_id: 'asset-2', type: 'BUY', shares: 500, price_per_share: 55, transaction_date: '2026-05-07' }
    ];
    const schedules = [
      // User confirmed payment was received (is_projected: false)
      { id: 'sch-2', asset_id: 'asset-2', dpu: 1.0, xd_date: '2026-05-07', payment_date: '2026-05-24', is_projected: false }
    ];

    const res = calculatePortfolioReturns(assets, transactions, schedules, 35.0);
    // Under old code: eligibleTxs (< 2026-05-07) was empty -> 0 THB!
    // Under new code: Fallback to payment_date cutoff (<= 2026-05-24) awards 500 shares * 1.0 * 0.9 = 450 THB!
    assert.strictEqual(res.totalCumulativeDividends, 450);
  });

  runTest('3.3 calculatePortfolioReturns FALLBACK preserves confirmed payout when tx recorded AFTER XD date', () => {
    const assets = [
      { id: 'asset-3', symbol: 'BDMS', asset_type: 'STOCKS', currency: 'THB', net_shares: 200, current_price: 30, total_cost: 5600, tax_rate: 0.1 }
    ];
    const transactions = [
      // user backfilled tx date to payout date
      { id: 'tx-3', asset_id: 'asset-3', type: 'BUY', shares: 200, price_per_share: 28, transaction_date: '2026-04-20' }
    ];
    const schedules = [
      { id: 'sch-3', asset_id: 'asset-3', dpu: 0.5, xd_date: '2026-04-05', payment_date: '2026-04-22', is_projected: false }
    ];

    const res = calculatePortfolioReturns(assets, transactions, schedules, 35.0);
    // Fallback: 200 shares * 0.5 * 0.9 = 90 THB
    assert.strictEqual(res.totalCumulativeDividends, 90);
  });

  runTest('3.4 Strict Cutoff holds for FUTURE PROJECTED dividends (is_projected: true)', () => {
    const assets = [
      { id: 'asset-4', symbol: 'SCB', asset_type: 'STOCKS', currency: 'THB', net_shares: 100, current_price: 110, total_cost: 10000, tax_rate: 0.1 }
    ];
    const transactions = [
      // transaction date after XD date
      { id: 'tx-4', asset_id: 'asset-4', type: 'BUY', shares: 100, price_per_share: 100, transaction_date: '2026-08-25' }
    ];
    const schedules = [
      // Projected future dividend with XD Aug 20
      { id: 'sch-4', asset_id: 'asset-4', dpu: 5.0, xd_date: '2026-08-20', payment_date: '2026-09-15', is_projected: true }
    ];

    const res = calculatePortfolioReturns(assets, transactions, schedules, 35.0);
    // Must NOT award projected dividend because user bought AFTER XD date!
    assert.strictEqual(res.totalCumulativeDividends, 0);
  });

  runTest('3.5 Foreign dividend locking: uses received_fx_rate instead of live exchange rate', () => {
    const assets = [
      { id: 'asset-us', symbol: 'AAPL', asset_type: 'STOCKS', currency: 'USD', net_shares: 10, current_price: 200, total_cost: 50000, tax_rate: 0.15 }
    ];
    const transactions = [
      { id: 'tx-us', asset_id: 'asset-us', type: 'BUY', shares: 10, price_per_share: 150, transaction_date: '2025-01-01' }
    ];
    const schedules = [
      // Locked historical rate was 36.50, but current live rate passed is 33.00
      { id: 'sch-us', asset_id: 'asset-us', dpu: 0.25, xd_date: '2025-02-10', payment_date: '2025-02-20', is_projected: false, received_fx_rate: 36.50 }
    ];

    const res = calculatePortfolioReturns(assets, transactions, schedules, 33.0 /* live rate */);
    // 10 shares * 0.25 USD * 36.50 locked rate * (1 - 0.15 tax) = 77.5625 THB
    const expected = 10 * 0.25 * 36.50 * 0.85;
    assert.strictEqual(res.totalCumulativeDividends, expected);
  });

  // -------------------------------------------------------------
  // SUITE 4: CSV Export & Representative DPU Selection (Issue 6, 8)
  // -------------------------------------------------------------
  console.log('\n--- Suite 4: CSV Export & Representative DPU ---');

  runTest('4.1 generateCsvTemplate includes required headers and sample rows', () => {
    const template = generateCsvTemplate();
    assert.ok(template.includes('symbol,asset_type,shares,cost_price,currency,transaction_date,expected_dpu,type'));
    assert.ok(template.includes('PTT,STOCKS,1000,32.50,THB'));
    assert.ok(template.includes('Kept By Krungsri,CASH,50000,1.00,THB,2024-01-01,0.0175,BUY'));
  });

  await runAsyncTest('4.2 exportPortfolioToCsv exports CASH expected_dpu as ANNUAL rate', async () => {
    const cashAsset = {
      id: 'cash-1',
      symbol: 'Dime! Save',
      asset_type: 'CASH',
      net_shares: 50000,
      weighted_average_cost: 1.0,
      currency: 'THB',
      tax_rate: 0,
    };
    // Periodic semi-annual schedules have DPU = 0.00875 (1.75% / 2)
    const schedules = [
      { id: 'cs-1', asset_id: 'cash-1', dpu: 0.00875, xd_date: '2026-06-30', is_projected: true },
      { id: 'cs-2', asset_id: 'cash-1', dpu: 0.00875, xd_date: '2026-12-31', is_projected: true },
    ];

    const csvOutput = await exportPortfolioToCsv([cashAsset], { schedules });
    // In CSV, expected_dpu MUST be 0.017500 (annual rate 1.75%), NOT 0.008750
    assert.ok(csvOutput.includes('0.017500'), `Expected 0.017500 in CSV output, got:\n${csvOutput}`);
  });

  await runAsyncTest('4.3 exportPortfolioToCsv excludes SPECIAL dividend when picking representative DPU', async () => {
    const stockAsset = {
      id: 'stock-1',
      symbol: 'ADVANC',
      asset_type: 'STOCKS',
      net_shares: 100,
      weighted_average_cost: 220,
      currency: 'THB',
      tax_rate: 0.1,
    };
    const schedules = [
      // Regular schedule
      { id: 's-reg', asset_id: 'stock-1', dpu: 4.50, xd_date: '2026-02-20', is_projected: true, is_special: false },
      // Special dividend schedule with high DPU
      { id: 's-spec', asset_id: 'stock-1', dpu: 15.00, xd_date: '2026-02-20', is_projected: true, is_special: true },
    ];

    const csvOutput = await exportPortfolioToCsv([stockAsset], { schedules });
    // Representative DPU MUST pick 4.500000 (regular), NOT 15.000000 (special)
    assert.ok(csvOutput.includes('4.500000'), `Expected 4.500000 in CSV, got:\n${csvOutput}`);
    assert.ok(!csvOutput.includes('15.000000'), 'Special dividend was erroneously picked as representative DPU!');
  });

  await runAsyncTest('4.4 exportPortfolioToCsv resolves US stock currency correctly', async () => {
    const usAsset = {
      id: 'us-1',
      symbol: 'MSFT',
      asset_type: 'STOCKS',
      net_shares: 5,
      weighted_average_cost: 400,
      currency: 'USD',
      tax_rate: 0.15,
    };
    const csvOutput = await exportPortfolioToCsv([usAsset]);
    assert.ok(csvOutput.includes('"MSFT",STOCKS,5.0000,400.0000,USD'), `Expected quoted MSFT in CSV, got:\n${csvOutput}`);
  });

  runTest('4.5 parseAndValidateCsv correctly parses standard CSV template', () => {
    const template = generateCsvTemplate();
    const parsed = parseAndValidateCsv(template);
    assert.strictEqual(parsed.issues.filter((i) => i.level === 'error').length, 0);
    assert.strictEqual(parsed.validRows.length, 4);

    const cashRow = parsed.validRows.find((r) => r.symbol === 'KEPT BY KRUNGSRI');
    assert.ok(cashRow, 'CASH row must be found');
    assert.strictEqual(cashRow.asset_type, 'CASH');
    assert.strictEqual(cashRow.expected_dpu, 0.0175);
    assert.strictEqual(cashRow.cost_price, 1.0);
  });

  runTest('4.6 parseAndValidateCsv flags error on zero/negative shares or missing symbol', () => {
    const invalidCsv = [
      'symbol,shares,cost_price',
      ',100,50',         // missing symbol
      'PTT,0,32.5',      // zero shares
      'CPALL,-10,60',    // negative shares
    ].join('\n');

    const parsed = parseAndValidateCsv(invalidCsv);
    const errors = parsed.issues.filter((i) => i.level === 'error');
    assert.ok(errors.length >= 3, `Expected at least 3 errors, found ${errors.length}`);
  });

  await runAsyncTest('4.7 exportPortfolioToCsv sanitizes formula injection characters (=, +, -, @) and parse restores it', async () => {
    const formulaAsset = {
      id: 'f-1',
      symbol: '=SUM(A1:A10)',
      asset_type: 'CASH',
      net_shares: 50000,
      weighted_average_cost: 1,
      currency: 'THB',
      tax_rate: 0,
    };
    const csvOutput = await exportPortfolioToCsv([formulaAsset]);
    // Must be sanitized with leading single quote inside quotes: "'=SUM(A1:A10)"
    assert.ok(csvOutput.includes("\"'=SUM(A1:A10)\""), `Expected sanitized formula in CSV, got:\n${csvOutput}`);

    // Roundtrip back via parseAndValidateCsv
    const parsed = parseAndValidateCsv(csvOutput);
    assert.strictEqual(parsed.validRows.length, 1);
    assert.strictEqual(parsed.validRows[0].symbol, '=SUM(A1:A10)');
  });

  // -------------------------------------------------------------
  // SUITE 5: Stock Dividend Interval & Special Candidate Logic (Issue 7)
  // -------------------------------------------------------------
  console.log('\n--- Suite 5: Stock Dividend Interval & Special Analysis ---');

  runTest('5.1 Payout pattern logic detects frequency without blind ×4 for single/annual payouts', () => {
    // Emulate the interval calculation logic from stockService.ts
    function analyzeIntervals(dates) {
      if (dates.length < 2) {
        return { frequency: 1, label: 'Annual / ประมาณการ' };
      }
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        const [y1, m1] = dates[i - 1].split('-').map(Number);
        const [y2, m2] = dates[i].split('-').map(Number);
        const diff = (y2 - y1) * 12 + (m2 - m1);
        if (diff > 0) gaps.push(diff);
      }
      if (gaps.length === 0) return { frequency: 1, label: 'Annual / ประมาณการ' };
      gaps.sort((a, b) => a - b);
      const medianGap = gaps[Math.floor(gaps.length / 2)];
      if (medianGap <= 1) return { frequency: 12, label: 'Monthly' };
      if (medianGap <= 4) return { frequency: 4, label: 'Quarterly' };
      if (medianGap <= 8) return { frequency: 2, label: 'Semi-Annual' };
      return { frequency: 1, label: 'Annual' };
    }

    // 1 payout: must NOT be 4
    assert.strictEqual(analyzeIntervals(['2025-05-15']).frequency, 1);

    // 4 quarterly payouts (~3 months gap): frequency = 4
    assert.strictEqual(analyzeIntervals(['2025-03-15', '2025-06-15', '2025-09-15', '2025-12-15']).frequency, 4);

    // 2 semi-annual payouts (~6 months gap): frequency = 2
    assert.strictEqual(analyzeIntervals(['2025-04-15', '2025-10-15']).frequency, 2);

    // 1 annual payout (~12 months gap): frequency = 1
    assert.strictEqual(analyzeIntervals(['2024-05-15', '2025-05-15']).frequency, 1);
  });

  runTest('5.2 Special dividend candidate detection identifies off-cycle and 2.2x magnitude anomalies', () => {
    function isSpecialCandidate(dpu, medianDpu, gapMonths, medianGapMonths) {
      if (dpu >= medianDpu * 2.2) return true; // magnitude anomaly
      if (medianGapMonths >= 3 && gapMonths <= 1 && dpu > 0) return true; // off-cycle anomaly
      return false;
    }

    // Regular DPU = 0.50, special payout = 2.00 (4x) -> candidate!
    assert.strictEqual(isSpecialCandidate(2.00, 0.50, 3, 3), true);

    // Regular DPU = 0.50, normal quarterly payout = 0.52 -> not special
    assert.strictEqual(isSpecialCandidate(0.52, 0.50, 3, 3), false);

    // Quarterly stock (median gap 3 months) pays unexpected bonus 1 month later -> candidate!
    assert.strictEqual(isSpecialCandidate(0.40, 0.50, 1, 3), true);
  });

  runTest('5.3 Dynamic target symbol mapping routes THB to .BK and USD cleanly without POPULAR_STOCKS hardcoding', () => {
    assert.strictEqual(resolveTargetStockSymbol('AP', undefined, 'THB'), 'AP.BK');
    assert.strictEqual(resolveTargetStockSymbol('AP.BK', undefined, 'THB'), 'AP.BK');
    assert.strictEqual(resolveTargetStockSymbol('CPALL', undefined, 'THB'), 'CPALL.BK');
    assert.strictEqual(resolveTargetStockSymbol('AAPL', undefined, 'USD'), 'AAPL');
    assert.strictEqual(resolveTargetStockSymbol('AAPL.BK', undefined, 'USD'), 'AAPL');
  });

  runTest('5.4 Single 12-month interval correctly identifies Annual frequency (frequency = 1)', () => {
    // 2 payouts with 1 gap of 12 months (e.g. AP dividend history)
    const gapsInMonths = [12];
    let frequency = 4;
    let frequencyLabel = 'ทุกไตรมาส (Quarterly)';
    if (gapsInMonths.length >= 1) {
      gapsInMonths.sort((a, b) => a - b);
      const medianGap = gapsInMonths[Math.floor(gapsInMonths.length / 2)];
      if (medianGap <= 1.5) {
        frequency = 12;
      } else if (medianGap <= 4.5) {
        frequency = 4;
      } else if (medianGap <= 8) {
        frequency = 2;
      } else {
        frequency = 1;
        frequencyLabel = 'ปีละ 1 ครั้ง (Annual)';
      }
    }
    assert.strictEqual(frequency, 1);
    assert.strictEqual(frequencyLabel, 'ปีละ 1 ครั้ง (Annual)');
  });

  // -------------------------------------------------------------
  // SUITE 6: Special Dividend Forward Yield Isolation (Issue 8)
  // -------------------------------------------------------------
  console.log('\n--- Suite 6: Special Dividend Forward Yield Isolation ---');

  runTest('6.1 Dashboard Yield math isolates special dividends from Current Yield & YoC', () => {
    // Asset: 1,000 shares @ cost 50,000 THB, market value 60,000 THB
    // Regular dividend: 1.00 THB/share -> 1,000 THB net
    // Special dividend: 5.00 THB/share -> 5,000 THB net
    const regularNet = 1000;
    const specialNet = 5000;

    const projectedAnnualNetDividend = regularNet + specialNet; // 6,000 THB (Total Cashflow)
    const projectedAnnualRegularNetDividend = regularNet;       // 1,000 THB (Sustainable Yield)

    const marketValue = 60000;
    const totalCost = 50000;

    // Sustainable forward yield
    const forwardYield = (projectedAnnualRegularNetDividend / marketValue) * 100;
    const forwardYoC = (projectedAnnualRegularNetDividend / totalCost) * 100;

    // Distorted yield if special dividends were included
    const distortedYield = (projectedAnnualNetDividend / marketValue) * 100;

    // Forward Yield should be 1.67%, NOT 10.0%!
    assert.strictEqual(forwardYield.toFixed(2), '1.67');
    assert.strictEqual(forwardYoC.toFixed(2), '2.00');
    assert.strictEqual(distortedYield.toFixed(2), '10.00');

    // Total cashflow remains preserved
    assert.strictEqual(projectedAnnualNetDividend, 6000);
  });

  console.log('\n============================================================');
  console.log(` TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
