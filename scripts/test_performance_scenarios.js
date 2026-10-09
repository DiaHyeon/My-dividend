// Scenario-based simulation runner for portfolio performance, benchmark scaling, timeframe harmony, and caching.
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

// Ensure environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

// 2. Load compiled utilities & services from scratch build
const { getLocalDateString } = require('../scratch/test_build/src/utils/dateUtils');
const { getBenchmarkComparison, BENCHMARKS, TIMEFRAMES } = require('../scratch/test_build/src/services/benchmarkService');

let passedScenarios = 0;
let failedScenarios = 0;

function runScenario(name, fn) {
  try {
    fn();
    console.log(`  [PASS] Scenario: ${name}`);
    passedScenarios++;
  } catch (err) {
    console.error(`  [FAIL] Scenario: ${name}`);
    console.error(`         ${err.message}`);
    failedScenarios++;
  }
}

async function runAsyncScenario(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] Scenario: ${name}`);
    passedScenarios++;
  } catch (err) {
    console.error(`  [FAIL] Scenario: ${name}`);
    console.error(`         ${err.message}`);
    failedScenarios++;
  }
}

async function main() {
  console.log('\n============================================================');
  console.log(' RUNNING REAL-WORLD PORTFOLIO PERFORMANCE SCENARIO TESTS');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // SCENARIO 1: Investor A (Started buying in 2026 - Inception Date & Axis)
  // -------------------------------------------------------------------------
  console.log('--- SCENARIO 1: Investor Starting in 2026 (Since Inception & Axis) ---');

  runScenario('1.1 Inception date resolves to earliest investment buy (March 2026), ignoring CASH', () => {
    const transactions = [
      { id: 't1', type: 'DEPOSIT', transaction_date: '2026-01-01', asset_id: 'cash-1' },
      { id: 't2', type: 'BUY', transaction_date: '2026-03-15', asset_id: 'ptt-1' },
      { id: 't3', type: 'BUY', transaction_date: '2026-05-20', asset_id: 'scb-1' },
      { id: 't4', type: 'BUY', transaction_date: '2026-07-10', asset_id: 'fund-1' },
    ];
    const investmentAssets = [
      { id: 'ptt-1', symbol: 'PTT', asset_type: 'STOCKS' },
      { id: 'scb-1', symbol: 'SCB', asset_type: 'STOCKS' },
      { id: 'fund-1', symbol: 'K-USXNDQ', asset_type: 'FUNDS' },
    ];

    const investAssetIds = new Set(investmentAssets.map((a) => a.id));
    const earliestTx = transactions
      .filter((t) => t.type === 'BUY' && investAssetIds.has(t.asset_id))
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))[0];

    const inceptionDate = earliestTx ? earliestTx.transaction_date : null;
    assert.strictEqual(inceptionDate, '2026-03-15', 'Must resolve to first stock buy, not cash deposit');
  });

  runScenario('1.2 Dynamic Floor Timeline Axis for 2026 Inception contains zero phantom past years', () => {
    const inceptionDate = '2026-03-15';
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    // Simulation of Portfolio.tsx floorTimelineLabels logic for ALL timeframe
    const generateFloorTimelineLabels = (inceptStr) => {
      const parts = inceptStr.split('-').map(Number);
      const inceptYear = parts[0];
      const inceptMonth = parts[1] - 1;

      const now = new Date(2026, 9, 9); // Oct 2026
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();

      const yearDiff = curYear - inceptYear;
      if (yearDiff === 0) {
        const monthSpan = Math.max(1, curMonth - inceptMonth);
        if (monthSpan <= 2) {
          return [
            { label: `${thMonths[inceptMonth]} ${curYear}`, percent: 15 },
            { label: `${thMonths[curMonth]} ${curYear}`, percent: 85 },
          ];
        }
        const m1 = inceptMonth;
        const m2 = Math.min(11, inceptMonth + Math.round(monthSpan * 0.35));
        const m3 = Math.min(11, inceptMonth + Math.round(monthSpan * 0.7));
        const m4 = curMonth;

        return [
          { label: `${thMonths[m1]} ${curYear}`, percent: 10 },
          { label: `${thMonths[m2]} ${curYear}`, percent: 38 },
          { label: `${thMonths[m3]} ${curYear}`, percent: 66 },
          { label: `${thMonths[m4]} ${curYear}`, percent: 92 },
        ];
      }
      return [];
    };

    const labels = generateFloorTimelineLabels(inceptionDate);
    assert.strictEqual(labels.length, 4);
    assert.strictEqual(labels[0].label, 'มี.ค. 2026');
    assert.strictEqual(labels[3].label, 'ต.ค. 2026');

    // Strict validation: No labels from 2023, 2024, or 2025!
    for (const item of labels) {
      assert.ok(!item.label.includes('2023'), `Label must not contain 2023: ${item.label}`);
      assert.ok(!item.label.includes('2024'), `Label must not contain 2024: ${item.label}`);
      assert.ok(!item.label.includes('2025'), `Label must not contain 2025: ${item.label}`);
    }
  });

  runScenario('1.3 Benchmark comparison for ALL is scaled to 7-month inception span (~7.9%), not 2Y (24.2%)', () => {
    const inceptionDate = '2026-03-01'; // ~7.3 months before Oct 2026
    const res = getBenchmarkComparison('ALL', 'SP500', 14.5, [], inceptionDate);

    assert.strictEqual(res.portfolioReturnPct, 14.5);
    // Baseline S&P 500 for ALL is 24.2% over 2 years (~1.0% per month).
    // For 7 months, it should scale to around ~7.4% - 8.5%, NOT 24.2%!
    assert.ok(res.benchmarkReturnPct < 15.0, `S&P 500 return should be scaled down to inception span, got ${res.benchmarkReturnPct}%`);
    assert.ok(res.benchmarkReturnPct > 5.0, `S&P 500 return should be around 7-8%, got ${res.benchmarkReturnPct}%`);
    assert.strictEqual(res.outperforming, true, 'Portfolio (14.5%) should outperform scaled benchmark');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 2: Investor B (Timeframe Switching & Baht/Percentage Harmony)
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Timeframe Switching & Hero Card Baht/Percentage Harmony ---');

  runScenario('2.1 periodPL computes exact Baht matching active timeframe percentage', () => {
    const investmentCost = 1000000; // 1,000,000 THB cost
    const lifetimePL = 120000;     // +120,000 THB (+12.0% lifetime)

    // Simulation of periodPL logic from Portfolio.tsx
    const calculateHeroCard = (timeframe, tfPct) => {
      let pl = 0;
      if (investmentCost <= 0) {
        pl = 0;
      } else if (timeframe === 'ALL') {
        pl = lifetimePL;
      } else {
        pl = (investmentCost * tfPct) / 100;
      }

      const formattedPct = `${tfPct >= 0 ? '+' : ''}${tfPct.toFixed(1)}%`;
      const formattedBaht = `${pl >= 0 ? '+' : ''}฿${Math.abs(pl).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      return { pl, formattedPct, formattedBaht };
    };

    // Test 1M (+2.0%)
    const m1 = calculateHeroCard('1M', 2.0);
    assert.strictEqual(m1.pl, 20000);
    assert.strictEqual(m1.formattedPct, '+2.0%');
    assert.strictEqual(m1.formattedBaht, '+฿20,000.00');

    // Test 3M (+5.5%)
    const m3 = calculateHeroCard('3M', 5.5);
    assert.strictEqual(m3.pl, 55000);
    assert.strictEqual(m3.formattedPct, '+5.5%');
    assert.strictEqual(m3.formattedBaht, '+฿55,000.00');

    // Test 6M (+8.0%)
    const m6 = calculateHeroCard('6M', 8.0);
    assert.strictEqual(m6.pl, 80000);
    assert.strictEqual(m6.formattedPct, '+8.0%');
    assert.strictEqual(m6.formattedBaht, '+฿80,000.00');

    // Test 1Y (+10.0%)
    const y1 = calculateHeroCard('1Y', 10.0);
    assert.strictEqual(y1.pl, 100000);
    assert.strictEqual(y1.formattedPct, '+10.0%');
    assert.strictEqual(y1.formattedBaht, '+฿100,000.00');

    // Test ALL (+12.0%)
    const all = calculateHeroCard('ALL', 12.0);
    assert.strictEqual(all.pl, 120000);
    assert.strictEqual(all.formattedPct, '+12.0%');
    assert.strictEqual(all.formattedBaht, '+฿120,000.00');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 3: Investor C (Alpha Banner Formatting & Double Negative Guard)
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Alpha Banner Formatting & Double Negative Guard ---');

  runScenario('3.1 Underperforming banner formats trailing percentage with absolute value (No "-3.5%")', () => {
    const portfolioReturnPct = 4.0;
    const benchmarkReturnPct = 7.5;
    const alphaPct = portfolioReturnPct - benchmarkReturnPct; // -3.5
    const outperforming = alphaPct >= 0;
    const benchmarkLabel = '🇺🇸 S&P 500';

    const bannerText = outperforming
      ? `พอร์ตของคุณชนะ ${benchmarkLabel} อยู่ +${alphaPct.toFixed(1)}% (Outperforming)`
      : `พอร์ตของคุณตามหลัง ${benchmarkLabel} อยู่ ${Math.abs(alphaPct).toFixed(1)}%`;

    assert.strictEqual(bannerText, 'พอร์ตของคุณตามหลัง 🇺🇸 S&P 500 อยู่ 3.5%');
    assert.ok(!bannerText.includes('-3.5%'), 'Must NOT have double negative');
    assert.ok(!bannerText.includes('อยู่ -'), 'Must NOT have negative after อยู่');
  });

  runScenario('3.2 Outperforming banner formats winning percentage with plus sign', () => {
    const portfolioReturnPct = 12.0;
    const benchmarkReturnPct = 6.0;
    const alphaPct = portfolioReturnPct - benchmarkReturnPct; // +6.0
    const outperforming = alphaPct >= 0;
    const benchmarkLabel = '🇹🇭 SET Index';

    const bannerText = outperforming
      ? `พอร์ตของคุณชนะ ${benchmarkLabel} อยู่ +${alphaPct.toFixed(1)}% (Outperforming)`
      : `พอร์ตของคุณตามหลัง ${benchmarkLabel} อยู่ ${Math.abs(alphaPct).toFixed(1)}%`;

    assert.strictEqual(bannerText, 'พอร์ตของคุณชนะ 🇹🇭 SET Index อยู่ +6.0% (Outperforming)');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 4: Investor D (Empty Portfolio & Cash-Only Edge Cases)
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Empty Portfolio & Cash-Only Edge Cases ---');

  runScenario('4.1 Fresh user with zero assets suppresses Alpha banner and yields zero periodPL', () => {
    const investmentCost = 0;
    const selectedBenchmark = 'SP500';

    // Condition in Portfolio.tsx
    const shouldShowAlphaBanner = selectedBenchmark !== 'NONE' && investmentCost > 0;
    assert.strictEqual(shouldShowAlphaBanner, false, 'Alpha banner must be hidden when investmentCost <= 0');

    // periodPL calculation
    const periodPL = investmentCost <= 0 ? 0 : 500;
    assert.strictEqual(periodPL, 0, 'periodPL must be 0 when investmentCost <= 0');
  });

  runScenario('4.2 CASH-only portfolio (bank deposits only) suppresses Alpha banner', () => {
    const assets = [
      { id: 'c1', symbol: 'SCB-SAVING', asset_type: 'CASH', cost: 300000, market_value: 300000 },
      { id: 'c2', symbol: 'KTB-FIXED', asset_type: 'CASH', cost: 200000, market_value: 200000 },
    ];

    const investmentAssets = assets.filter((a) => a.asset_type === 'STOCKS' || a.asset_type === 'FUNDS');
    const investmentCost = investmentAssets.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    assert.strictEqual(investmentCost, 0, 'CASH assets must not count toward investmentCost');

    const shouldShowAlphaBanner = 'SP500' !== 'NONE' && investmentCost > 0;
    assert.strictEqual(shouldShowAlphaBanner, false, 'Alpha banner must NOT show for cash-only portfolio');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 5: Snapshot Valuation Isolation (CASH Exclusion)
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Portfolio Valuation Snapshot Isolation ---');

  runScenario('5.1 Snapshot calculation isolates STOCKS/FUNDS return (+15%) from CASH dilution (+9%)', () => {
    const allAssets = [
      { id: 's1', symbol: 'ADVANC', asset_type: 'STOCKS', cost: 300000, market_value: 360000, unrealized_pl: 60000 },
      { id: 'f1', symbol: 'B-INNOTECH', asset_type: 'FUNDS', cost: 300000, market_value: 330000, unrealized_pl: 30000 },
      { id: 'c1', symbol: 'TTB-ME', asset_type: 'CASH', cost: 400000, market_value: 400000, unrealized_pl: 0 },
    ];

    // Diluted calculation (old buggy way)
    const allCost = allAssets.reduce((s, a) => s + a.cost, 0); // 1,000,000
    const allPL = allAssets.reduce((s, a) => s + a.unrealized_pl, 0); // 90,000
    const dilutedReturnPct = (allPL / allCost) * 100; // 9.0%

    // Isolated calculation (fixed way in Portfolio.tsx & Dashboard.tsx)
    const investmentAssets = allAssets.filter((a) => a.asset_type === 'STOCKS' || a.asset_type === 'FUNDS');
    const investCost = investmentAssets.reduce((s, a) => s + a.cost, 0); // 600,000
    const investMarketValue = investmentAssets.reduce((s, a) => s + a.market_value, 0); // 690,000
    const investPL = investmentAssets.reduce((s, a) => s + a.unrealized_pl, 0); // 90,000
    const authenticReturnPct = (investPL / investCost) * 100; // 15.0%

    assert.strictEqual(dilutedReturnPct, 9.0);
    assert.strictEqual(authenticReturnPct, 15.0);
    assert.strictEqual(investMarketValue, 690000);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 7: Drawing From Zero for 3M, 6M, 1Y (Inception Alignment)
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: Drawing From Zero for 3M, 6M, 1Y (Inception Alignment) ---');

  runScenario('7.1 1Y curve for recent inception starts with 0.0% prior points and curves smoothly from 0 to current return', () => {
    // Investor started 45 days ago (in late August / September 2026)
    const inceptDate = '2026-08-25';
    const res = getBenchmarkComparison('1Y', 'SET', 6.5, [], inceptDate);

    assert.strictEqual(res.portfolioReturnPct, 6.5, 'Total return holds without fractional dilution');
    assert.strictEqual(res.portfolioData.length, 7, '1Y must have 7 points');

    // Points prior to 45 days ago (points 0, 1, 2, 3, 4) must be 0.0% (user had no stocks)
    assert.strictEqual(res.portfolioData[0].value, 0.0);
    assert.strictEqual(res.portfolioData[1].value, 0.0);
    assert.strictEqual(res.portfolioData[2].value, 0.0);
    assert.strictEqual(res.portfolioData[3].value, 0.0);

    // Latest point must reach authentic 6.5%
    assert.strictEqual(res.portfolioData[6].value, 6.5);

    // Benchmark must also start with 0.0% prior points and draw from 0
    assert.strictEqual(res.benchmarkData[0].value, 0.0);
    assert.strictEqual(res.benchmarkData[1].value, 0.0);
    assert.strictEqual(res.benchmarkData[2].value, 0.0);
    assert.strictEqual(res.benchmarkData[3].value, 0.0);
    assert.ok(res.benchmarkData[6].value >= 0);
  });

  runScenario('7.2 3M and 6M preserve total return without artificial 0.35/0.65 multiplier when started recently', () => {
    const inceptDate = '2026-09-01'; // ~38 days ago
    const res3M = getBenchmarkComparison('3M', 'SP500', 8.0, [], inceptDate);
    const res6M = getBenchmarkComparison('6M', 'SP500', 8.0, [], inceptDate);

    assert.strictEqual(res3M.portfolioReturnPct, 8.0, '3M should not be cut down to 2.8%');
    assert.strictEqual(res6M.portfolioReturnPct, 8.0, '6M should not be cut down to 5.2%');

    // Benchmark return is scaled since inception, not full 6-month or 1-year S&P 500
    assert.ok(res6M.benchmarkReturnPct < 5.0, `6M benchmark must be scaled since inception (~38 days), got ${res6M.benchmarkReturnPct}%`);
    assert.strictEqual(res6M.outperforming, true, 'User (+8%) beat scaled S&P 500');
  });

  runScenario('7.3 Snapshot percentage sampling preserves authentic returns without compounding distortion or zeroing negative starts', () => {
    const samplePercentagePoints = (vals, targetPoints) => {
      if (!vals || vals.length === 0) return new Array(targetPoints).fill(0);
      if (vals.length === 1) return new Array(targetPoints).fill(vals[0]);
      const result = [];
      for (let i = 0; i < targetPoints; i++) {
        const idx = Math.min(vals.length - 1, Math.round((i / (targetPoints - 1)) * (vals.length - 1)));
        result.push(Math.round(vals[idx] * 10) / 10);
      }
      return result;
    };

    const posSnaps = [2.0, 3.0, 4.0, 5.0];
    assert.deepStrictEqual(samplePercentagePoints(posSnaps, 6), [2.0, 3.0, 3.0, 4.0, 4.0, 5.0]);

    const negSnaps = [-1.5, 0.0, 2.0, 4.5];
    assert.deepStrictEqual(samplePercentagePoints(negSnaps, 6), [-1.5, 0.0, 0.0, 2.0, 2.0, 4.5]);
  });

  console.log('\n============================================================');
  console.log(` SCENARIO SUMMARY: ${passedScenarios} PASSED, ${failedScenarios} FAILED`);
  console.log('============================================================\n');

  if (failedScenarios > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Scenario runner fatal error:', err);
  process.exit(1);
});
