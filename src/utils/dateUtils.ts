// บริการและฟังก์ชันช่วยเหลือด้านวันที่ตามเวลาท้องถิ่น (Local Timezone) ป้องกันปัญหา Timezone Drift (วันที่ถอยหลัง 1 วัน)
/**
 * คืนค่าสตริงวันที่ในรูปแบบ 'YYYY-MM-DD' ตามโซนเวลาจริงของเครื่องผู้ใช้ (Local Timezone)
 * ป้องกันปัญหาจากการใช้ toISOString().split('T')[0] ซึ่งจะแปลงเป็น UTC ทำให้เวลาช่วง 00:00 - 06:59 น. ในไทย (UTC+7) ถอยหลังไป 1 วัน
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * บวกหรือลบเดือนโดยรักษาความถูกต้องของวันและเวลาท้องถิ่น
 */
export function addMonthsToLocalDate(d: Date, months: number): string {
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return getLocalDateString(result);
}

/**
 * แปลงสตริง 'YYYY-MM-DD' เป็น Date object ตาม Local Time โดยไม่เกิดปัญหา UTC timezone skew
 */
export function parseLocalDateParts(dStr?: string | null): Date | null {
  if (!dStr) return null;
  const p = dStr.split('T')[0].split('-').map(Number);
  if (p.length < 3 || isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2])) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

/**
 * คำนวณค่ามัธยฐานระยะห่างวันจ่ายเงิน (Lag Days) จากประวัติการจ่ายจริงในอดีต (5 - 45 วัน)
 * เพื่อใช้ประมาณการวันจ่ายเงินรอบถัดไปให้สอดคล้องกับพฤติกรรมจริงของสินทรัพย์นั้นๆ
 */
export function computeLearnedPayoutLag(
  schedules: { xd_date?: string | null; payment_date?: string | null }[]
): number | null {
  const diffs: number[] = [];
  const msPerDay = 1000 * 60 * 60 * 24;

  for (const s of schedules) {
    if (!s.xd_date || !s.payment_date) continue;
    const xd = parseLocalDateParts(s.xd_date);
    const pay = parseLocalDateParts(s.payment_date);
    if (!xd || !pay) continue;

    const diff = Math.round((pay.getTime() - xd.getTime()) / msPerDay);
    // กรองเฉพาะช่วงปกติที่สมเหตุสมผล (5 - 45 วัน) เพื่อตัด outliers/data entry errors
    if (diff >= 5 && diff <= 45) {
      diffs.push(diff);
    }
  }

  if (diffs.length === 0) return null;

  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 === 0 ? Math.round((diffs[mid - 1] + diffs[mid]) / 2) : diffs[mid];
}

/**
 * คำนวณวันจ่ายเงินปันผล/ดอกเบี้ยจริงหรือประมาณการอย่างแม่นยำ
 * - ถ้ามี paymentDate ให้ใช้วันนั้น
 * - ถ้าไม่มี paymentDate ให้ประมาณการจาก XD date:
 *   - ถ้ามี learnedLagDays (5-45 วัน) ให้ใช้ค่านั้น
 *   - ถ้าไม่มี ให้ใช้ค่ามาตรฐาน: CASH +0 วัน, หุ้น US +14 วัน, หุ้นไทย/กองทุน +20 วัน
 */
export function estimatePayoutDate(
  xdDateStr?: string | null,
  paymentDateStr?: string | null,
  opts?: { isCash?: boolean; isUS?: boolean; learnedLagDays?: number | null }
): Date | null {
  const payObj = parseLocalDateParts(paymentDateStr);
  if (payObj) return payObj;

  const xdObj = parseLocalDateParts(xdDateStr);
  if (!xdObj) return null;

  if (opts?.isCash) {
    return xdObj;
  }

  let daysToAdd = opts?.isUS ? 14 : 20;
  if (
    opts?.learnedLagDays !== undefined &&
    opts?.learnedLagDays !== null &&
    !isNaN(opts.learnedLagDays) &&
    opts.learnedLagDays >= 5 &&
    opts.learnedLagDays <= 45
  ) {
    daysToAdd = Math.round(opts.learnedLagDays);
  }

  xdObj.setDate(xdObj.getDate() + daysToAdd);
  return xdObj;
}


