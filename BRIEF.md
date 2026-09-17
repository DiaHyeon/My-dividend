# Project Brief: My dividend
เอกสารข้อกำหนดทางเทคนิคและสถาปัตยกรรมระบบของแอพพลิเคชัน My dividend สำหรับใช้งานเป็น Single Source of Truth ในการพัฒนาบน ANTIGRAVITY IDE

## 1. Project Overview
- **ชื่อโปรเจกต์**: My dividend
- **แพลตฟอร์มเป้าหมาย**: Android Mobile (ทดสอบและพรีวิวผ่าน Expo Go)
- **แกนหลักของระบบ (Core Stack)**: Expo (React Native), TypeScript, Supabase (PostgreSQL, Row Level Security)
- **เป้าหมายหลัก**: แอพติดตามพอร์ตการลงทุนที่เน้นความเรียบง่าย จัดกลุ่มสินทรัพย์ 3 ประเภทหลัก (หุ้น, กองทุนรวม, เงินฝาก/ตราสารหนี้) พร้อมระบบพยากรณ์เงินปันผลสุทธิหลังหักภาษี และระบบแจ้งเตือนวันขึ้นเครื่องหมาย XD บนมือถือ

## 2. Dependency Audit & Environment Status
| รายการ Library | บทบาทการทำงาน | สถานะ |
| :--- | :--- | :--- |
| `@supabase/supabase-js` | เชื่อมต่อ Database & Auth | [ ] ตรวจสอบ/ติดตั้ง |
| `@react-native-async-storage/async-storage` | บันทึก Auth Session ภายในเครื่อง | [ ] ตรวจสอบ/ติดตั้ง |
| `expo-notifications` | จัดการ Local Notification บน Android | [ ] ตรวจสอบ/ติดตั้ง |
| `react-native-gifted-charts` & `react-native-svg` | แสดงผลกราฟ Bar Chart คาดการณ์ปันผล | [ ] ตรวจสอบ/ติดตั้ง |
| `@expo/vector-icons` | ไอคอน UI และ Material FAB (Ionicons) | [ ] ตรวจสอบ/ติดตั้ง |

### ตัวแปรสภาพแวดล้อม (.env)
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Database Architecture (Supabase PostgreSQL)
### Data Types & Constraints
- ข้อมูลตัวเลขทางการเงิน จำนวนหุ้น และราคา ต้องกำหนดเป็น `NUMERIC(15, 4)` ห้ามใช้ FLOAT หรือ REAL เพื่อป้องกัน Floating-point precision error
- ตาราง `transactions` ต้องมี Constraint `CHECK (shares >= 0)` ป้องกันยอดหุ้นติดลบ
- ใช้ระบบ Soft Delete (`is_archived boolean default false`) แทนการลบข้อมูลจริง เพื่อรักษาประวัติการรับปันผลย้อนหลัง

### โครงสร้างตารางหลัก
- `assets`: จัดการรายการสินทรัพย์
  - ฟิลด์: `id` (uuid, PK), `user_id` (uuid), `symbol` (text), `asset_type` (STOCKS | FUNDS | CASH), `current_price` (numeric), `tax_rate` (numeric, default 0.10), `is_archived` (boolean), `created_at` (timestamptz)
- `transactions`: ประวัติการซื้อ/ขาย
  - ฟิลด์: `id` (uuid, PK), `asset_id` (uuid, FK), `type` (BUY | SELL), `shares` (numeric), `price_per_share` (numeric), `transaction_date` (date)
- `dividend_schedules`: ตารางปันผลและการคาดการณ์
  - ฟิลด์: `id` (uuid, PK), `asset_id` (uuid, FK), `dpu` (numeric), `xd_date` (date), `payment_date` (date, nullable), `is_projected` (boolean)
- `view_asset_summary` (SQL View): คำนวณสรุปยอดหุ้นคงเหลือสุทธิ, ต้นทุนเฉลี่ยถ่วงน้ำหนัก (Weighted Average Cost), มูลค่ารวม และ Unrealized P/L อัตโนมัติจากฝั่งฐานข้อมูล

## 4. Key Features & Technical Safeguards
- **Dashboard & Category Breakdown**:
  - การแสดงผลสรุป Net Worth รวมทั้งพอร์ต
  - การ์ดสรุปยอดเงินแยกตามหมวดหมู่: หุ้น (Stocks), กองทุนรวม (Funds), และเงินฝากดิจิทัล/ตราสารหนี้ (Cash & Savings)
- **Android Floating Action Button (FAB) & Modal**:
  - ปุ่มลอยกลม + สไตล์ Material บริเวณมุมขวาล่าง สำหรับเปิด Bottom Sheet/Modal เพิ่มสินทรัพย์
  - Android Keyboard Fix: บังคับใช้ `keyboardType="decimal-pad"` ทุกช่องตัวเลข แก้ปัญหาคีย์บอร์ดบางแบรนด์ไม่มีปุ่มจุดทศนิยม
  - Layout Collision Fix: ครอบ Modal ด้วย `KeyboardAvoidingView` (behavior: height) และ `ScrollView` ป้องกันคีย์บอร์ดบังปุ่มบันทึก
  - Dynamic Form Fields: แสดงช่องกรอก "ปันผลคาดการณ์ (DPU)" เฉพาะเมื่อเลือกประเภทสินทรัพย์เป็น STOCKS เท่านั้น
- **Dividend Forecasting Engine**:
  - สูตรคำนวณปันผลสุทธิ: $\text{Shares} \times \text{DPU} \times (1 - \text{tax\_rate})$
  - XD Cutoff Logic: คัดกรองคำนวณสิทธิปันผลเฉพาะยอดซื้อที่เกิดขึ้นก่อนวัน XD (`transaction_date < xd_date`) เท่านั้น
  - แสดงไทม์ไลน์กระแสเงินสดปันผลคาดการณ์ 12 เดือน (ม.ค. - ธ.ค.)
- **Local Notifications**:
  - ตั้งเวลาแจ้งเตือนล่วงหน้า 1 วันก่อนวันขึ้นเครื่องหมาย XD ในเวลา 08:30 น. ผ่าน Android Notification Channel
