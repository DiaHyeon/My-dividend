// บริการคำนวณเงินปันผลและดอกเบี้ยรับสะสม พร้อมวิเคราะห์ผลตอบแทนรวมแท้จริง (Total Return = Capital Gain + Dividends)
import { AssetSummary, Transaction, DividendSchedule } from '../types/database';
import { isKnownUSSymbol } from './currencyService';
import { calculateScheduleCashPayout } from './taxService';

export interface AssetReturnMetrics {
  capitalGain: number;          // ส่วนต่างราคา (บาท)
  capitalGainPercent: number;   // % ส่วนต่างราคา
  cumulativeDividends: number;  // เงินปันผล/ดอกเบี้ยรับสะสม (บาท)
  totalReturn: number;          // ผลตอบแทนรวมแท้จริง (Capital Gain + Dividends) (บาท)
  totalReturnPercent: number;   // % ผลตอบแทนรวมแท้จริงเทียบกับต้นทุน
}

export interface PortfolioReturnMetrics {
  totalCost: number;
  totalMarketValue: number;
  totalCapitalGain: number;
  totalCapitalGainPercent: number;
  totalCumulativeDividends: number;
  totalReturn: number;
  totalReturnPercent: number;
  assetMetrics: Record<string, AssetReturnMetrics>;
}

/**
 * คำนวณเงินปันผล/ดอกเบี้ยที่ได้รับจริงสะสม และผลตอบแทนรวม (Total Return)
 * โดยรองรับความแม่นยำระดับ NUMERIC(15, 4), อัตราแลกเปลี่ยนลอยตัว USD/THB และเกณฑ์วันขึ้นเครื่องหมาย XD Cutoff
 */
export function calculatePortfolioReturns(
  assets: AssetSummary[],
  transactions: Transaction[],
  schedules: DividendSchedule[],
  exchangeRate: number = 34.0
): PortfolioReturnMetrics {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assetMetrics: Record<string, AssetReturnMetrics> = {};
  let totalCumulativeDividends = 0;

  // 1. คำนวณเงินปันผลรับสะสมแยกตามแต่ละสินทรัพย์
  assets.forEach((asset) => {
    const isCashAsset = asset.asset_type === 'CASH';
    const isUS =
      asset.asset_type === 'STOCKS' &&
      (isKnownUSSymbol(asset.symbol) || Math.abs(Number(asset.tax_rate) - 0.15) < 0.005);
    const taxRate =
      asset.tax_rate !== undefined && asset.tax_rate !== null
        ? Number(asset.tax_rate)
        : isCashAsset
        ? 0
        : isUS
        ? 0.1500
        : 0.1000;

    const assetSchedules = schedules.filter((s) => s.asset_id === asset.id);
    let assetReceivedDividends = 0;

    assetSchedules.forEach((schedule) => {
      const dateToUse = schedule.payment_date || schedule.xd_date;
      if (!dateToUse) return;

      const eventDate = new Date(dateToUse);
      eventDate.setHours(0, 0, 0, 0);

      // ถือว่าได้รับเงินแล้วถ้า:
      // 1. วันที่จ่าย/วัน XD ผ่านมาแล้ว (eventDate <= today)
      // 2. หรือผู้ใช้กดยืนยันว่าเงินเข้าแล้ว (is_projected === false)
      const isReceived = schedule.is_projected === false || eventDate.getTime() <= today.getTime();
      if (!isReceived) return;

      // กรองเฉพาะธุรกรรมที่ซื้อก่อนวัน Cutoff
      const eligibleTxs = transactions.filter((t) => {
        if (t.asset_id !== asset.id) return false;
        return isCashAsset
          ? t.transaction_date <= schedule.xd_date
          : t.transaction_date < schedule.xd_date;
      });

      const eligibleShares = eligibleTxs.reduce(
        (sum, t) => sum + (t.type === 'BUY' ? Number(t.shares) : -Number(t.shares)),
        0
      );

      if (eligibleShares <= 0) return;

      const dpu = Number(schedule.dpu) || 0;
      let payoutNet = 0;

      if (isCashAsset) {
        const freq: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' =
          assetSchedules.length >= 12
            ? 'MONTHLY'
            : assetSchedules.length >= 2
            ? 'SEMI_ANNUAL'
            : 'ANNUAL';
        const divisor = freq === 'MONTHLY' ? 12 : freq === 'SEMI_ANNUAL' ? 2 : 1;
        const annualRatePct = dpu * divisor * 100;

        eligibleTxs.forEach((t) => {
          if (t.type !== 'BUY') return;
          const txAmount = Number(t.shares) || 0;
          if (txAmount <= 0) return;
          const res = calculateScheduleCashPayout(
            txAmount,
            annualRatePct,
            taxRate,
            t.transaction_date,
            schedule.xd_date,
            freq
          );
          payoutNet += res.netInterest;
        });
      } else {
        const effectiveRate = isUS && exchangeRate > 0 ? exchangeRate : 1.0;
        payoutNet = eligibleShares * dpu * effectiveRate * (1 - taxRate);
      }

      if (payoutNet > 0) {
        assetReceivedDividends += payoutNet;
      }
    });

    const cost = Number(asset.total_cost) || 0;
    const marketVal = Number(asset.market_value) || 0;
    const capitalGain = marketVal - cost;
    const capitalGainPercent = cost > 0 ? (capitalGain / cost) * 100 : 0;
    const totalReturn = capitalGain + assetReceivedDividends;
    const totalReturnPercent = cost > 0 ? (totalReturn / cost) * 100 : 0;

    assetMetrics[asset.id] = {
      capitalGain,
      capitalGainPercent,
      cumulativeDividends: assetReceivedDividends,
      totalReturn,
      totalReturnPercent,
    };

    totalCumulativeDividends += assetReceivedDividends;
  });

  // 2. คำนวณภาพรวมพอร์ต (Portfolio Totals)
  const totalCost = assets.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0);
  const totalMarketValue = assets.reduce((sum, a) => sum + (Number(a.market_value) || 0), 0);
  const totalCapitalGain = totalMarketValue - totalCost;
  const totalCapitalGainPercent = totalCost > 0 ? (totalCapitalGain / totalCost) * 100 : 0;
  const totalReturn = totalCapitalGain + totalCumulativeDividends;
  const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  return {
    totalCost,
    totalMarketValue,
    totalCapitalGain,
    totalCapitalGainPercent,
    totalCumulativeDividends,
    totalReturn,
    totalReturnPercent,
    assetMetrics,
  };
}
