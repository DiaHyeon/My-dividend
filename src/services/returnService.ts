// บริการคำนวณเงินปันผลและดอกเบี้ยรับสะสม พร้อมวิเคราะห์ผลตอบแทนรวมแท้จริง (Total Return = Capital Gain + Dividends)
import { AssetSummary, Transaction, DividendSchedule } from '../types/database';
import { resolveIsUSStock } from './currencyService';
import { calculateScheduleCashPayout, detectCashFrequency } from './taxService';
import { estimatePayoutDate, computeLearnedPayoutLag } from '../utils/dateUtils';

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
  exchangeRate: number = 34.0,
  archivedAssets: (AssetSummary | { id: string; symbol: string; asset_type: any; currency?: string; tax_rate?: number })[] = [],
  currencyMap: Record<string, 'THB' | 'USD'> = {}
): PortfolioReturnMetrics {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assetMetrics: Record<string, AssetReturnMetrics> = {};
  let totalCumulativeDividends = 0;

  // Helper ฟังก์ชันคำนวณเงินปันผล/ดอกเบี้ยรับสะสมของแต่ละสินทรัพย์
  const computeAssetDividends = (asset: any): number => {
    const isCashAsset = asset.asset_type === 'CASH';
    const isUS = resolveIsUSStock(asset, currencyMap);
    const taxRate =
      asset.tax_rate !== undefined && asset.tax_rate !== null
        ? Number(asset.tax_rate)
        : isCashAsset
        ? 0
        : isUS
        ? 0.1500
        : 0.1000;

    const assetSchedules = schedules.filter((s) => s.asset_id === asset.id);
    const learnedLag = isCashAsset ? null : computeLearnedPayoutLag(assetSchedules);
    let assetReceivedDividends = 0;

    assetSchedules.forEach((schedule) => {
      const payoutDateObj = estimatePayoutDate(schedule.xd_date, schedule.payment_date, {
        isCash: isCashAsset,
        isUS,
        learnedLagDays: learnedLag,
      });
      if (!payoutDateObj) return;

      payoutDateObj.setHours(0, 0, 0, 0);

      // ถือว่าได้รับเงินแล้วถ้า:
      // 1. ผู้ใช้กดยืนยันว่าเงินเข้าแล้ว (is_projected === false)
      // 2. หรือวันที่จ่ายเงินจริง/ประมาณการผ่านไปแล้ว (payoutDateObj <= today)
      const isReceived = schedule.is_projected === false || payoutDateObj.getTime() <= today.getTime();
      if (!isReceived) return;

      // กรองเฉพาะธุรกรรมที่ซื้อก่อนวัน Cutoff
      const eligibleTxs = transactions.filter((t) => {
        if (t.asset_id !== asset.id) return false;
        return isCashAsset
          ? t.transaction_date <= schedule.xd_date
          : t.transaction_date < schedule.xd_date;
      });

      let eligibleShares = eligibleTxs.reduce(
        (sum, t) => sum + (t.type === 'BUY' ? Number(t.shares) : -Number(t.shares)),
        0
      );

      // Fallback สำหรับเงินปันผล/ดอกเบี้ยที่ยืนยันว่าได้รับแล้ว (is_projected === false)
      // ป้องกันยอดเงินปันผลที่ได้รับจริงหายไป หากผู้ใช้บันทึกวันที่ซื้อคาบเกี่ยวกับวัน XD
      let effectiveTxs = eligibleTxs;
      if (eligibleShares <= 0 && schedule.is_projected === false) {
        const cutoff = schedule.payment_date || schedule.xd_date;
        const fallbackTxs = transactions.filter((t) => {
          if (t.asset_id !== asset.id) return false;
          return t.transaction_date <= cutoff;
        });
        const fallbackShares = fallbackTxs.reduce(
          (sum, t) => sum + (t.type === 'BUY' ? Number(t.shares) : -Number(t.shares)),
          0
        );
        if (fallbackShares > 0) {
          eligibleShares = fallbackShares;
          effectiveTxs = fallbackTxs;
        } else if (Number(asset.net_shares) > 0) {
          eligibleShares = Number(asset.net_shares);
        }
      }

      if (eligibleShares <= 0) return;

      const dpu = Number(schedule.dpu) || 0;
      let payoutNet = 0;

      if (isCashAsset) {
        const freq = detectCashFrequency(assetSchedules.map((s) => s.xd_date));
        const divisor = freq === 'MONTHLY' ? 12 : freq === 'SEMI_ANNUAL' ? 2 : 1;
        const annualRatePct = dpu * divisor * 100;

        const hasWithdrawals = effectiveTxs.some((t) => t.type === 'SELL');
        if (hasWithdrawals) {
          const firstDepDate = effectiveTxs.find((t) => t.type === 'BUY')?.transaction_date || schedule.xd_date;
          const res = calculateScheduleCashPayout(
            eligibleShares,
            annualRatePct,
            taxRate,
            firstDepDate,
            schedule.xd_date,
            freq
          );
          payoutNet = res.netInterest;
        } else {
          effectiveTxs.forEach((t) => {
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
        }
      } else {
        const isConfirmed = schedule.is_projected === false;
        const effectiveRate = isUS
          ? isConfirmed && Number(schedule.received_fx_rate) > 0
            ? Number(schedule.received_fx_rate)
            : exchangeRate > 0
            ? exchangeRate
            : 1.0
          : 1.0;
        payoutNet = eligibleShares * dpu * effectiveRate * (1 - taxRate);
      }

      if (payoutNet > 0) {
        assetReceivedDividends += payoutNet;
      }
    });

    return assetReceivedDividends;
  };

  // 1. คำนวณเงินปันผลรับสะสมแยกตามแต่ละสินทรัพย์ที่ยังถือครองอยู่ (Active Assets)
  assets.forEach((asset) => {
    const assetReceivedDividends = computeAssetDividends(asset);

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

  // 1.1 คำนวณเงินปันผลที่เคยได้รับจริงจากสินทรัพย์ที่ขายหมดแล้ว (Archived Assets)
  // เพื่อให้ตัวเลข Lifetime Cumulative Dividends และ Total Return ของพอร์ตไม่ลดฮวบลงเมื่อขายสินทรัพย์ออก
  archivedAssets.forEach((archived) => {
    if (assets.some((a) => a.id === archived.id)) return;
    const archivedReceivedDividends = computeAssetDividends(archived);
    totalCumulativeDividends += archivedReceivedDividends;
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
