/**
 * taxService.ts
 * บริการคำนวณและประเมินภาษีดอกเบี้ยเงินฝากธนาคารตามเกณฑ์ของกรมสรรพากร (เกณฑ์ยกเว้น 20,000 บาท/ปี)
 */

import { getLocalDateString } from '../utils/dateUtils';

export const THAI_SAVINGS_TAX_FREE_LIMIT = 20000; // เกณฑ์ยกเว้นภาษีดอกเบี้ยเงินฝากออมทรัพย์ 20,000 บาทต่อปี
export const THAI_WITHHOLDING_TAX_RATE = 0.15; // อัตราภาษีหัก ณ ที่จ่าย 15%

export interface CashTaxEvaluation {
  depositAmount: number;
  interestRate: number;
  annualGrossInterest: number;
  isExceededLimit: boolean;
  suggestedTaxRatePercent: number; // 0 หรือ 15
  annualTaxAmount: number;
  annualNetInterest: number;
  remainingLimit: number;
  isFixedDeposit: boolean;
  explanation: string;
}

/**
 * คำนวณดอกเบี้ยรายปีจากเงินต้นและอัตราดอกเบี้ย
 */
export const calculateAnnualGrossInterest = (
  depositAmount: number,
  interestRatePercent: number
): number => {
  if (isNaN(depositAmount) || depositAmount <= 0 || isNaN(interestRatePercent) || interestRatePercent <= 0) {
    return 0;
  }
  return (depositAmount * interestRatePercent) / 100;
};

/**
 * ประเมินสถานะภาษีดอกเบี้ยเงินฝากสำหรับบัญชีเดียว
 */
export const evaluateCashTax = (
  depositAmount: number,
  interestRatePercent: number,
  segmentId: string = 'DigitalSavings',
  existingPortfolioInterest: number = 0
): CashTaxEvaluation => {
  const gross = calculateAnnualGrossInterest(depositAmount, interestRatePercent);
  const isFixedDeposit = segmentId === 'FixedDeposit';

  // กรณีเงินฝากประจำ: ปกติถูกหัก 15% ตั้งแต่บาทแรก เว้นแต่เป็นเงินฝากประจำปลอดภาษี 24/36 เดือน
  if (isFixedDeposit) {
    const taxAmount = gross * THAI_WITHHOLDING_TAX_RATE;
    return {
      depositAmount,
      interestRate: interestRatePercent,
      annualGrossInterest: gross,
      isExceededLimit: true,
      suggestedTaxRatePercent: 15,
      annualTaxAmount: taxAmount,
      annualNetInterest: gross - taxAmount,
      remainingLimit: 0,
      isFixedDeposit: true,
      explanation: 'เงินฝากประจำทั่วไปถูกหักภาษี 15% ตั้งแต่บาทแรก (เว้นแต่เป็นบัญชีเงินฝากประจำปลอดภาษี 24-36 เดือน)',
    };
  }

  // กรณีเงินฝากออมทรัพย์ทั่วไป และเงินฝากดิจิทัล (Digital Savings & Regular Savings)
  const totalCombinedInterest = gross + existingPortfolioInterest;
  const isExceeded = totalCombinedInterest > THAI_SAVINGS_TAX_FREE_LIMIT;

  if (isExceeded) {
    const taxAmount = gross * THAI_WITHHOLDING_TAX_RATE;
    const explanation = existingPortfolioInterest > 0 && gross <= THAI_SAVINGS_TAX_FREE_LIMIT
      ? `ดอกเบี้ยบัญชีนี้ ฿${gross.toLocaleString('th-TH', { maximumFractionDigits: 2 })} เมื่อรวมกับบัญชีอื่นในพอร์ต (รวม ฿${totalCombinedInterest.toLocaleString('th-TH', { maximumFractionDigits: 2 })}/ปี) เกินเพดาน 20,000 บาท จึงต้องเสียภาษี 15%`
      : `ดอกเบี้ยรายปี ฿${gross.toLocaleString('th-TH', { maximumFractionDigits: 2 })} เกินเกณฑ์ยกเว้น 20,000 บาท/ปี กรมสรรพากรกำหนดให้หักภาษี 15% จากดอกเบี้ยทั้งหมด`;

    return {
      depositAmount,
      interestRate: interestRatePercent,
      annualGrossInterest: gross,
      isExceededLimit: true,
      suggestedTaxRatePercent: 15,
      annualTaxAmount: taxAmount,
      annualNetInterest: gross - taxAmount,
      remainingLimit: 0,
      isFixedDeposit: false,
      explanation,
    };
  }

  // ไม่เกิน 20,000 บาท -> ได้รับยกเว้นภาษี (0%)
  const remaining = Math.max(0, THAI_SAVINGS_TAX_FREE_LIMIT - totalCombinedInterest);
  return {
    depositAmount,
    interestRate: interestRatePercent,
    annualGrossInterest: gross,
    isExceededLimit: false,
    suggestedTaxRatePercent: 0,
    annualTaxAmount: 0,
    annualNetInterest: gross,
    remainingLimit: remaining,
    isFixedDeposit: false,
    explanation: `ดอกเบี้ยรายปี ฿${gross.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ไม่เกิน 20,000 บาท/ปี ได้รับการยกเว้นภาษีเงินได้บุคคลธรรมดา (ภาษี 0%)`,
  };
};

/**
 * คำนวณสรุปโควตาดอกเบี้ยรวมทั้งพอร์ตสำหรับแสดงผลใน Category Breakdown Modal
 */
export interface PortfolioCashTaxSummary {
  totalDepositAmount: number;
  totalAnnualGrossInterest: number;
  totalAnnualTax: number;
  totalAnnualNetInterest: number;
  limitAmount: number;
  quotaUsedPercent: number;
  remainingQuota: number;
  isExceededLimit: boolean;
  savingsCount: number;
  fixedCount: number;
}

export const calculatePortfolioCashTaxSummary = (
  cashAssets: { depositAmount: number; interestRate: number; segmentId: string; taxRate: number }[]
): PortfolioCashTaxSummary => {
  let totalDepositAmount = 0;
  let totalAnnualGrossInterest = 0;
  let totalAnnualTax = 0;
  let totalAnnualNetInterest = 0;
  let savingsGrossInterest = 0;
  let savingsCount = 0;
  let fixedCount = 0;

  cashAssets.forEach((item) => {
    totalDepositAmount += item.depositAmount;
    const gross = (item.depositAmount * item.interestRate) / 100;
    totalAnnualGrossInterest += gross;

    if (item.segmentId === 'FixedDeposit') {
      fixedCount += 1;
    } else {
      savingsCount += 1;
      savingsGrossInterest += gross;
    }

    const tax = gross * (item.taxRate || 0);
    totalAnnualTax += tax;
    totalAnnualNetInterest += gross - tax;
  });

  const isExceededLimit = savingsGrossInterest > THAI_SAVINGS_TAX_FREE_LIMIT;
  const quotaUsedPercent = Math.min(
    100,
    THAI_SAVINGS_TAX_FREE_LIMIT > 0 ? (savingsGrossInterest / THAI_SAVINGS_TAX_FREE_LIMIT) * 100 : 0
  );
  const remainingQuota = Math.max(0, THAI_SAVINGS_TAX_FREE_LIMIT - savingsGrossInterest);

  return {
    totalDepositAmount,
    totalAnnualGrossInterest,
    totalAnnualTax,
    totalAnnualNetInterest,
    limitAmount: THAI_SAVINGS_TAX_FREE_LIMIT,
    quotaUsedPercent,
    remainingQuota,
    isExceededLimit,
    savingsCount,
    fixedCount,
  };
};

/**
 * โครงสร้างข้อมูลรายละเอียดรอบการจ่ายดอกเบี้ยและจำนวนวันคำนวณจริง (Daily Accrual / Pro-Rata)
 */
export interface CashPayoutCycleInfo {
  cycleStartDate: string;
  cycleEndDate: string;
  daysInCycle: number;
  daysHeld: number;
  isPartialCycle: boolean;
  daysLabel: string;
}

/**
 * คำนวณช่วงรอบการจ่ายดอกเบี้ย (Cycle Period) และจำนวนวันจริงที่ฝาก
 */
export const calculateCashCycleInfo = (
  depositDateStr: string,
  scheduleDateStr: string,
  frequency: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' = 'SEMI_ANNUAL'
): CashPayoutCycleInfo => {
  const [sY, sM, sD] = (scheduleDateStr || '').split('T')[0].split('-').map(Number);
  const schedDate = new Date(sY, (sM || 1) - 1, sD || 1);
  const [dY, dM, dD] = (depositDateStr || '').split('T')[0].split('-').map(Number);
  const depDate = new Date(dY, (dM || 1) - 1, dD || 1);
  const schedYear = schedDate.getFullYear();
  const schedMonth = schedDate.getMonth(); // 0-indexed: 0=Jan, 5=Jun, 11=Dec

  let cycleStart: Date;

  if (frequency === 'SEMI_ANNUAL') {
    // June payout (schedMonth <= 5): cycle runs Jan 1 - Jun 30
    // Dec payout (schedMonth > 5): cycle runs Jul 1 - Dec 31
    if (schedMonth <= 5) {
      cycleStart = new Date(schedYear, 0, 1);
    } else {
      cycleStart = new Date(schedYear, 6, 1);
    }
  } else if (frequency === 'MONTHLY') {
    // Monthly cycle: begins after previous month's payout date (28th)
    if (schedMonth === 0) {
      cycleStart = new Date(schedYear - 1, 11, 28);
    } else {
      cycleStart = new Date(schedYear, schedMonth - 1, 28);
    }
  } else {
    // Annual cycle: Jan 1 of that year
    cycleStart = new Date(schedYear, 0, 1);
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const cycleDays = Math.max(1, Math.round((schedDate.getTime() - cycleStart.getTime()) / msPerDay));

  // If deposit happened after cycleStart, it is a partial first cycle!
  if (depDate > cycleStart) {
    // Number of days from deposit date to payout date
    const diffTime = schedDate.getTime() - depDate.getTime();
    const daysHeld = Math.max(1, Math.round(diffTime / msPerDay));
    return {
      cycleStartDate: getLocalDateString(cycleStart),
      cycleEndDate: scheduleDateStr,
      daysInCycle: cycleDays,
      daysHeld,
      isPartialCycle: true,
      daysLabel: `${daysHeld} วัน`,
    };
  }

  // Full standard cycle
  return {
    cycleStartDate: getLocalDateString(cycleStart),
    cycleEndDate: scheduleDateStr,
    daysInCycle: cycleDays,
    daysHeld: cycleDays,
    isPartialCycle: false,
    daysLabel: 'เต็มงวด',
  };
};

/**
 * คำนวณดอกเบี้ยรับสำหรับงวดนั้น ๆ รองรับทั้งรอบเต็มและรอบเฉลี่ยตามวันจริง (Pro-Rata / Daily Accrual)
 */
export interface ScheduleCashPayoutResult {
  grossInterest: number;
  taxAmount: number;
  netInterest: number;
  daysHeld: number;
  isPartialCycle: boolean;
  daysLabel: string;
}

export const calculateScheduleCashPayout = (
  depositAmount: number,
  annualInterestRatePercent: number,
  taxRate: number,
  depositDateStr: string,
  scheduleDateStr: string,
  frequency: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' = 'SEMI_ANNUAL'
): ScheduleCashPayoutResult => {
  if (isNaN(depositAmount) || depositAmount <= 0 || isNaN(annualInterestRatePercent) || annualInterestRatePercent <= 0) {
    return {
      grossInterest: 0,
      taxAmount: 0,
      netInterest: 0,
      daysHeld: 0,
      isPartialCycle: false,
      daysLabel: '-',
    };
  }

  const cycleInfo = calculateCashCycleInfo(depositDateStr, scheduleDateStr, frequency);

  let grossInterest = 0;
  if (cycleInfo.isPartialCycle) {
    // Formula ธนาคารไทย: (เงินต้น * ดอกเบี้ย% * จำนวนวัน) / 365
    grossInterest = (depositAmount * (annualInterestRatePercent / 100) * cycleInfo.daysHeld) / 365;
  } else {
    // Standard full period divisor
    const divisor = frequency === 'MONTHLY' ? 12 : frequency === 'SEMI_ANNUAL' ? 2 : 1;
    grossInterest = (depositAmount * (annualInterestRatePercent / 100)) / divisor;
  }

  const taxAmount = grossInterest * (taxRate || 0);
  const netInterest = Math.max(0, grossInterest - taxAmount);

  return {
    grossInterest,
    taxAmount,
    netInterest,
    daysHeld: cycleInfo.daysHeld,
    isPartialCycle: cycleInfo.isPartialCycle,
    daysLabel: cycleInfo.daysLabel,
  };
};

/**
 * วิเคราะห์ความถี่ในการจ่ายดอกเบี้ยเงินฝาก (Frequency) จากระยะห่างของวันที่ (xd_date)
 * เพื่อป้องกันปัญหาตัวหารคำนวณดอกเบี้ยผิดพลาดจากจำนวนแถวสะสมข้ามปี
 */
export const detectCashFrequency = (
  xdDates: (string | undefined | null)[]
): 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' => {
  const validDates = xdDates
    .filter((d): d is string => typeof d === 'string' && d.length >= 10)
    .map((d) => d.split('T')[0]);

  const uniqueSorted = Array.from(new Set(validDates)).sort();
  if (uniqueSorted.length < 2) {
    // หากมีแค่งวดเดียว ตรวจสอบว่าลงท้ายด้วยวันที่ 28 หรือไม่ (แพทเทิร์นเงินฝากดิจิทัลรายเดือน)
    if (uniqueSorted.length === 1 && uniqueSorted[0].endsWith('-28')) {
      return 'MONTHLY';
    }
    return 'SEMI_ANNUAL'; // ค่ามาตรฐานทั่วไปของเงินฝากธนาคารไทย (มิ.ย. / ธ.ค.)
  }

  const gapsInMonths: number[] = [];
  for (let i = 1; i < uniqueSorted.length; i++) {
    const [y1, m1] = uniqueSorted[i - 1].split('-').map(Number);
    const [y2, m2] = uniqueSorted[i].split('-').map(Number);
    const diff = (y2 - y1) * 12 + (m2 - m1);
    if (diff > 0) {
      gapsInMonths.push(diff);
    }
  }

  if (gapsInMonths.length === 0) return 'SEMI_ANNUAL';

  gapsInMonths.sort((a, b) => a - b);
  const median = gapsInMonths[Math.floor(gapsInMonths.length / 2)];

  if (median <= 1) return 'MONTHLY';
  if (median <= 6) return 'SEMI_ANNUAL';
  return 'ANNUAL';
};

