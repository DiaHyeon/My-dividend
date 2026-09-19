/**
 * taxService.ts
 * บริการคำนวณและประเมินภาษีดอกเบี้ยเงินฝากธนาคารตามเกณฑ์ของกรมสรรพากร (เกณฑ์ยกเว้น 20,000 บาท/ปี)
 */

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
