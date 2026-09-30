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
