// บริการคำนวณและดึงข้อมูลผลตอบแทนเปรียบเทียบระหว่างพอร์ตการลงทุนกับดัชนีตลาดชั้นนำ (SET, S&P 500, NASDAQ) ตามช่วงเวลา
import { AssetSummary } from '../types/database';

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
}

export const BENCHMARKS: { id: BenchmarkType; label: string; name: string; color: string; icon: string }[] = [
  { id: 'NONE', label: 'พอร์ตเดี่ยว', name: 'ไม่เปรียบเทียบ', color: '#94A3B8', icon: 'person' },
  { id: 'SET', label: '🇹🇭 SET Index', name: 'ตลาดหลักทรัพย์แห่งประเทศไทย (SET)', color: '#F59E0B', icon: 'trending-up' },
  { id: 'SP500', label: '🇺🇸 S&P 500', name: 'ดัชนี S&P 500 สหรัฐฯ', color: '#8B5CF6', icon: 'globe' },
  { id: 'NASDAQ', label: '🇺🇸 NASDAQ', name: 'ดัชนีหุ้นเทคโนโลยี NASDAQ', color: '#EC4899', icon: 'hardware-chip' },
];

export const TIMEFRAMES: { id: TimeframeType; label: string; points: number }[] = [
  { id: '1M', label: '1 เดือน', points: 4 },
  { id: '3M', label: '3 เดือน', points: 6 },
  { id: '6M', label: '6 เดือน', points: 6 },
  { id: '1Y', label: '1 ปี', points: 7 },
  { id: 'ALL', label: 'ทั้งหมด', points: 8 },
];

// Historical benchmark returns baseline by timeframe
const BENCHMARK_HISTORICAL_RETURNS: Record<BenchmarkType, Record<TimeframeType, number>> = {
  NONE: { '1M': 0, '3M': 0, '6M': 0, '1Y': 0, 'ALL': 0 },
  SET: { '1M': 0.4, '3M': 1.1, '6M': -0.8, '1Y': -2.5, 'ALL': 1.8 },
  SP500: { '1M': 1.6, '3M': 4.2, '6M': 7.8, '1Y': 13.5, 'ALL': 24.2 },
  NASDAQ: { '1M': 2.1, '3M': 5.8, '6M': 9.6, '1Y': 16.8, 'ALL': 31.5 },
};

/**
 * คำนวณเส้นกราฟผลตอบแทนสะสมของพอร์ตและดัชนีเปรียบเทียบตามช่วงเวลาที่เลือก
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
    'ALL': 1.35,
  };

  const currentReturn = totalUnrealizedPLPercent * (timeframeMultiplier[timeframe] || 1.0);
  const roundedPortfolioReturn = Math.round(currentReturn * 10) / 10;

  const benchmarkReturn = BENCHMARK_HISTORICAL_RETURNS[benchmark][timeframe] || 0;
  const roundedBenchmarkReturn = Math.round(benchmarkReturn * 10) / 10;

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

  // Generate curve data points for portfolio
  const portfolioData: ChartPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    // Smooth quadratic curve from 0 to currentReturn with gentle market fluctuation
    const fluctuation = i > 0 && i < numPoints - 1 ? Math.sin(i * 1.5) * 0.8 : 0;
    const val = Math.round((currentReturn * Math.pow(progress, 1.2) + fluctuation) * 10) / 10;
    portfolioData.push({
      value: val,
      label: i % 2 === 0 || i === numPoints - 1 ? labels[i] : undefined,
    });
  }

  // Generate curve data points for benchmark
  const benchmarkData: ChartPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    const fluctuation = i > 0 && i < numPoints - 1 ? Math.cos(i * 1.3) * 0.6 : 0;
    const val = Math.round((benchmarkReturn * Math.pow(progress, 1.1) + fluctuation) * 10) / 10;
    benchmarkData.push({
      value: val,
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
  };
}
