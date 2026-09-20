# Project Brief: My dividend
เอกสารข้อกำหนดทางเทคนิคและสถาปัตยกรรมระบบของแอพพลิเคชัน My dividend สำหรับใช้งานเป็น Single Source of Truth ในการพัฒนาบน ANTIGRAVITY IDE

---

## 1. Project Overview
- **ชื่อโปรเจกต์**: My dividend
- **แพลตฟอร์มเป้าหมาย**: Android Mobile (ทดสอบและพรีวิวผ่าน Expo Go) และ Web Preview
- **แกนหลักของระบบ (Core Stack)**: Expo SDK 57 (React Native 0.86, React 19), TypeScript, Supabase (PostgreSQL, Row Level Security)
- **เป้าหมายหลัก**: แอพติดตามพอร์ตการลงทุนที่เรียบง่าย จัดกลุ่มสินทรัพย์ 3 ประเภทหลัก (หุ้น, กองทุนรวม, เงินฝาก/ตราสารหนี้) พร้อมระบบพยากรณ์เงินปันผลสุทธิหลังหักภาษี 12 เดือน, แจ้งเตือนวัน XD ล่วงหน้า, ค้นหาหุ้นตลาดสหรัฐฯ และไทย (SET) อัตโนมัติ พร้อมดึงราคาปิดล่าสุด และรองรับการบันทึกซื้อสินทรัพย์ด้วยสกุลเงิน USD พร้อมแปลงค่าเป็น THB แบบ Real-time

---

## 2. Dependency Audit & Environment Status
| รายการ Library | บทบาทการทำงาน | สถานะ |
| :--- | :--- | :--- |
| `@supabase/supabase-js` | เชื่อมต่อ Database, Auth และ Edge Functions | [x] ติดตั้งและใช้งานแล้ว |
| `@react-native-async-storage/async-storage` | บันทึก Auth Session ภายในเครื่อง | [x] ติดตั้งและใช้งานแล้ว |
| `expo-notifications` | จัดการ Local Notification บน Android (แจ้งเตือนวัน XD) | [x] ติดตั้งและใช้งานแล้ว (มี patch สำหรับ Expo Go) |
| `react-native-gifted-charts`, `react-native-svg` & `expo-linear-gradient` | แสดงผลกราฟ Bar Chart และ Donut Pie Chart | [x] ติดตั้งและใช้งานแล้ว |
| `react-native-safe-area-context` | จัดการ Safe Area / ขอบจอ Notch สำหรับ Android & iOS | [x] ติดตั้งและใช้งานแล้ว |
| `@expo/vector-icons` | ไอคอน UI และ Material FAB (Ionicons) | [x] ติดตั้งและใช้งานแล้ว |
| `@expo/ngrok` | ระบบ Expo Tunnel สำหรับพรีวิวผ่าน WiFi ในสถาบัน/ออฟฟิศ | [x] ติดตั้งและใช้งานแล้ว |

### ตัวแปรสภาพแวดล้อม (.env)
```bash
EXPO_PUBLIC_SUPABASE_URL=https://ycflookcrilaujmeillt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 3. Database Architecture (Supabase PostgreSQL)
### Data Types & Constraints
- ข้อมูลตัวเลขทางการเงิน จำนวนหุ้น และราคา ต้องกำหนดเป็น `NUMERIC(15, 4)` ห้ามใช้ FLOAT หรือ REAL เพื่อป้องกัน Floating-point precision error
- ตาราง `transactions` ต้องมี Constraint `CHECK (shares >= 0)` ป้องกันยอดหุ้นติดลบ
- ใช้ระบบ Soft Delete (`is_archived boolean default false`) แทนการลบข้อมูลจริง เพื่อรักษาประวัติการรับปันผลย้อนหลัง
- ทุกตารางเปิดใช้งาน Row Level Security (RLS) โดยมี Policy รองรับทั้ง Authenticated User และ Demo Session (`demo@mydividend.app`)

### โครงสร้างตารางหลัก
- `assets`: จัดการรายการสินทรัพย์
  - ฟิลด์: `id` (uuid, PK), `user_id` (uuid), `symbol` (text), `asset_type` (STOCKS | FUNDS | CASH), `current_price` (numeric(15,4)), `tax_rate` (numeric(15,4), default 0.1000), `is_archived` (boolean), `created_at` (timestamptz)
- `transactions`: ประวัติการซื้อ/ขาย
  - ฟิลด์: `id` (uuid, PK), `asset_id` (uuid, FK), `type` (BUY | SELL), `shares` (numeric(15,4)), `price_per_share` (numeric(15,4)), `transaction_date` (date)
- `dividend_schedules`: ตารางปันผลและการคาดการณ์
  - ฟิลด์: `id` (uuid, PK), `asset_id` (uuid, FK), `dpu` (numeric(15,4)), `xd_date` (date), `payment_date` (date, nullable), `is_projected` (boolean)
- `view_asset_summary` (SQL View): คำนวณสรุปยอดหุ้นคงเหลือสุทธิ (`net_shares`), ต้นทุนเฉลี่ยถ่วงน้ำหนัก (`weighted_average_cost`), มูลค่ารวม (`market_value`), ต้นทุนรวม (`total_cost`) และ Unrealized P/L อัตโนมัติจากฝั่งฐานข้อมูล

---

## 4. Key Features & Implementation Details

### 4.1 Dashboard & Category Breakdown
- **Hero Card**: สรุปยอด Net Worth ทั้งพอร์ต, ผลรวมกำไร/ขาดทุนสุทธิ (Unrealized P/L ทั้งจำนวนเงินและเปอร์เซ็นต์), ต้นทุนรวม และยอดเงินปันผลสุทธิคาดการณ์ทั้งปี (Annual Net Dividend)
- **Category Cards**: แบ่ง 3 หมวดหมู่หลัก:
  - หุ้น (STOCKS - สีน้ำเงิน)
  - กองทุน (FUNDS - สีม่วง)
  - เงินฝากดิจิทัล/ตราสารหนี้ (CASH - สีเขียว)
  - แสดงสัดส่วนเปอร์เซ็นต์ (Allocation %), มูลค่ารวม, จำนวนรายการ, Unrealized P/L และ Progress Bar สัดส่วน

### 4.2 Dividend Forecasting Engine (12-Month Bar Chart)
- แสดงกราฟแท่งปันผลรายเดือน 12 เดือน (ม.ค. - ธ.ค.)
- **สูตรคำนวณปันผลสุทธิ**: $\text{Shares} \times \text{DPU} \times (1 - \text{tax\_rate})$ โดยหักภาษี ณ ที่จ่ายตามที่บันทึกไว้ในแต่ละสินทรัพย์ (หุ้นไทยเริ่มต้น 10% [0.1000], หุ้นสหรัฐฯ เริ่มต้น 15% [0.1500] ตามอนุสัญญา W-8BEN, หรือปรับแต่งเองได้ เช่น 0% ยกเว้นภาษี)
- **Strict XD Cutoff Logic**: กรองเฉพาะยอดหุ้นที่เกิดจากธุรกรรมการซื้อขายที่เกิดขึ้นก่อนวัน XD (`transaction_date < xd_date`) เท่านั้น
- สามารถแตะที่แท่งกราฟเพื่อดูรายละเอียดหุ้นที่จ่ายปันผลในเดือนนั้น ๆ ได้

### 4.2.1 Automated Dividend Forecasting & Non-Dividend Handling
- **การวิเคราะห์อัตโนมัติ**: เมื่อเลือกหุ้นใน Modal เพิ่มสินทรัพย์ ระบบจะดึงข้อมูล `events.dividends` ย้อนหลังผ่าน `stockService.ts` และ Edge Function มาคำนวณ:
  - **รอบล่าสุด (Latest DPU)**: กรอกเป็นค่าเริ่มต้น (Default DPU) ให้อัตโนมัติ
  - **ความถี่ในการจ่าย (Frequency)**: วิเคราะห์ว่าเป็นแบบ ทุกไตรมาส (Quarterly), ปีละ 2 ครั้ง (Semi-annual), หรือ รายเดือน (Monthly)
  - **คาดการณ์ทั้งปี (Annual Projected DPU)**: คำนวณจาก $\text{Latest DPU} \times \text{Frequency}$ พร้อมแสดงผลในการ์ดไฮไลต์
  - **สร้างตารางปันผลอัตโนมัติ (Multi-Cycle Schedules)**: คำนวณวันขึ้นเครื่องหมาย XD รอบถัดไปล่วงหน้า 12 เดือน และบันทึกลงตาราง `dividend_schedules` อัตโนมัติ เพื่อให้ Bar Chart 12 เดือนแสดงผลได้ทันที
- **กรณีหุ้นที่ไม่จ่ายปันผล (Non-Dividend Paying Stocks)**:
  - กำหนดค่าเริ่มต้น DPU เป็น `0`
  - แสดงการ์ดแจ้งเตือนสีเทา: `ℹ️ หุ้นนี้ไม่มีประวัติจ่ายปันผล (Growth/Non-dividend)`
  - บันทึกสินทรัพย์เข้าพอร์ตเพื่อติดตามมูลค่า ต้นทุน และกำไร/ขาดทุนตามปกติ โดยไม่สร้างตารางปันผลล่วงหน้า

### 4.3 ระบบค้นหาหุ้นและดึงราคาอัตโนมัติ (US & Thai Stocks)
- ไฟล์จัดการ: `src/services/stockService.ts`
- **ตลาดที่รองรับ**: ตลาดหุ้นอเมริกา (NYSE, NASDAQ, AMEX) และตลาดหุ้นไทย (SET / BKK)
- **ระบบ Autocomplete**:
  - แคตตาล็อกหุ้นยอดนิยมในตัว ตอบสนองทันที 0ms (เช่น PTT, CPALL, BDMS, SCB, KBANK, AOT, ADVANC, DELTA, GULF, TSM, MCD, AAPL, MSFT, NVDA, GOOGL, META, TSLA, SCHD, SPY ฯลฯ)
  - ค้นหาแบบ Real-time เพิ่มเติมผ่าน Supabase Edge Function `stock-proxy`
  - แสดงชื่อย่อหุ้น, ชื่อบริษัท, และป้ายระบุตลาดด้านหลังอย่างชัดเจน เช่น `[SET]`, `[NYSE]`, `[NASDAQ]`
- **ดึงราคาปิดล่าสุดอัตโนมัติ (Auto Closing Price)**: เมื่อเลือกหุ้นจาก Dropdown ระบบจะดึงราคาปิดล่าสุด (Regular Market Price / Previous Close) มากรอกในช่อง "ราคาปัจจุบันต่อหน่วย" ให้อัตโนมัติ
- **รองรับหุ้นนอกตลาด**: ผู้ใช้สามารถพิมพ์ชื่อย่อหุ้นหรือสินทรัพย์อื่น ๆ นอกตลาดหลักทรัพย์ และกรอกราคาเองได้ตามต้องการ

### 4.4 รองรับการซื้อด้วยสกุลเงินดอลลาร์ (USD Currency Support)
- มีปุ่มสวิตช์เลือกสกุลเงิน **THB / USD** ใน Modal เพิ่มสินทรัพย์
- เมื่อเลือกเป็น **USD**:
  - ระบบจะดึงอัตราแลกเปลี่ยน USD/THB แบบ Real-time อัตโนมัติผ่าน Edge Function (เช่น 1 USD = 34.xx บาท)
  - ผู้ใช้กรอกต้นทุนเป็นเงิน USD ระบบจะคำนวณและแสดงยอดเงินบาทไทย (THB) ให้เห็นแบบ Real-time ทันที
  - บันทึกลงฐานข้อมูลในสกุลเงินบาท (Base Currency) เพื่อให้คำนวณรวมในพอร์ตได้อย่างแม่นยำ

### 4.5 Supabase Edge Function (`stock-proxy`)
- แก้ปัญหา Browser CORS และข้อจำกัดการเรียก Yahoo Finance API จากอุปกรณ์มือถือ
- Deploy อยู่บน Supabase Project: `ycflookcrilaujmeillt`
- Endpoint: `/functions/v1/stock-proxy`
- รองรับ 2 Action:
  1. `action: "search"`: ค้นหาหุ้นจาก Yahoo Finance Query API
  2. `action: "quote"`: ดึงราคาหุ้น และอัตราแลกเปลี่ยน (เช่น `USDTHB=X`)

### 4.6 Local Notifications (แจ้งเตือนวัน XD)
- ไฟล์จัดการ: `src/services/notificationService.ts`
- ตั้งเวลาแจ้งเตือนล่วงหน้า 1 วันก่อนวันขึ้นเครื่องหมาย XD ในเวลา 08:30 น.
- สร้าง Android Notification Channel: `xd-reminders` (High Importance, เสียง และการสั่น)
- ข้อความแจ้งเตือน: `🔔 [Symbol] ขึ้นเครื่องหมาย XD พรุ่งนี้! ถือหุ้นไว้เพื่อรับสิทธิเงินปันผล`

### 4.7 ระบบแก้ไขและลบสินทรัพย์ (Asset Edit & Deletion)
- ไฟล์จัดการ: `src/components/EditAssetModal.tsx`
- **การเปิดใช้งาน**: ผู้ใช้สามารถแตะที่การ์ดสินทรัพย์ใน Asset List บนหน้า Dashboard เพื่อเปิด Bottom Sheet Modal สำหรับแก้ไข
- **สิ่งที่สามารถแก้ไขได้**:
  - สัญลักษณ์ (Symbol) และหมวดหมู่สินทรัพย์ (STOCKS, FUNDS, CASH)
  - ราคาปัจจุบันต่อหน่วย (Current Price) พร้อมปุ่มดึงราคาตลาดล่าสุด (Auto Refresh Price)
  - จำนวนหุ้น/หน่วยที่ถือ (Shares) และราคาต้นทุนเฉลี่ย (Cost Price) โดยระบบจะปรับปรุงประวัติธุรกรรมเพื่อให้อัปเดตยอดคำนวณใน `view_asset_summary` อัตโนมัติ
  - อัตราภาษีหัก ณ ที่จ่าย (Withholding Tax Rate)
  - เงินปันผลคาดการณ์ (Projected DPU) และวันขึ้นเครื่องหมาย XD รอบถัดไป
- **การลบสินทรัพย์ (Soft Delete)**:
  - มีปุ่มสีแดงเด่นชัด (Red Button) พร้อมไอคอนถังขยะ: "ลบสินทรัพย์ออกจากพอร์ต"
  - มีกล่องข้อความ Alert ยืนยันก่อนทำรายการลบ เพื่อป้องกันความผิดพลาด
  - ทำการปรับสถานะ `is_archived = true` ในตาราง `assets` ซึ่งทำให้สินทรัพย์นั้นถูกคัดออกจาก Dashboard และกราฟ 12 เดือนทันที

### 4.8 ระบบจำแนก Segment และ Pie Chart แสดงสัดส่วนหมวดหมู่ (Category Breakdown)
- ไฟล์จัดการ: `src/components/CategoryBreakdownModal.tsx`, `src/services/sectorService.ts`
- **การเปิดใช้งาน**: แตะที่การ์ดหมวดหมู่ (หุ้น STOCKS, กองทุน FUNDS, เงินฝาก CASH) บนหน้า Dashboard
- **การแสดงผล**:
  - Donut / Pie Chart วงกลมแบ่งตามกลุ่มอุตสาหกรรม/ประเภท (Segments)
  - **White Callout Lines**: มีเส้นสีขาวชี้ออกจากแต่ละชิ้นพายไปยังป้ายตัวเลขเปอร์เซ็นต์ (%) อย่างคมชัดสวยงามบนพื้นหลังการ์ดสีเข้ม
  - รายละเอียดแต่ละ Segment พร้อมมูลค่าเงินรวม และรายชื่อสินทรัพย์ในกลุ่ม แตะเพื่อเปิดแก้ไขได้ทันที
- **การจำแนก Segment**:
  - **STOCKS (10 กลุ่ม GICS)**: Technology, Energy, Financials, Healthcare, Consumer Staples, Consumer Discretionary, Industrials, Materials, Real Estate, Telecom, Other
  - **FUNDS (7 กลุ่ม AIMC)**: Fixed Income Fund (ตราสารหนี้/พันธบัตร), Equity Fund, Mixed Fund, Property & Infra, Commodity (ทอง/น้ำมัน), Foreign (FIF), Money Market, Other
  - **CASH (4 กลุ่มเงินฝาก)**: Digital Savings (เงินฝากดิจิทัลดอกเบี้ยสูง เช่น Dime!, Kept), Fixed Deposit (ฝากประจำ), Savings (ออมทรัพย์ทั่วไป), Other Bank Accounts

### 4.9 ระบบจัดการบัญชีเงินฝากและดอกเบี้ย (Cash & Interest Engine)
- ไฟล์จัดการ: `src/components/CashAssetForm.tsx`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`
- **การแยกคอมโพเนนต์ย่อย (Modular Sub-component)**:
  - แยกฟอร์มจัดการเงินฝากออกมาเป็น `src/components/CashAssetForm.tsx` เพื่อให้คอมโพเนนต์มีขนาดกะทัดรัด แยกการทำงานเด็ดขาดจากฟอร์มหุ้น และสามารถนำไปใช้ร่วมกันได้ทันทีทั้งในหน้าเพิ่ม (`AddAssetModal`) และหน้าแก้ไข (`EditAssetModal`)
- **การปรับเปลี่ยนฟอร์มเฉพาะสำหรับ CASH**:
  - เปลี่ยนชื่อย่อหุ้นเป็น **"ชื่อบัญชี / สถาบันการเงิน"**
  - ซ่อนช่องหุ้นและราคาต้นทุน โดยแทนที่ด้วย **"จำนวนเงินฝาก (฿)"** และ **"อัตราดอกเบี้ยต่อปี (% p.a.)"**
  - **รอบการจ่ายดอกเบี้ย**: เลือกได้ 3 รูปแบบ:
    1. ทุกเดือน (Monthly - บัญชีดิจิทัล เช่น Dime!, Kept)
    2. ทุก 6 เดือน (มิ.ย. และ ธ.ค. - มาตรฐานธนาคารไทย)
    3. ปีละครั้ง (สิ้นปี / ธ.ค.)
  - **วันที่เริ่มฝาก (Deposit Date)**: ระบุวันที่เริ่มต้นฝากเงิน (ค่าเริ่มต้นเป็นวันปัจจุบัน) เพื่อใช้คำนวณดอกเบี้ยตามวันจริง
  - **ระบบคำนวณดอกเบี้ยตามวันจริง (Daily Accrual / Pro-Rata Engine)**:
    - **งวดแรกที่เพิ่งฝาก**: คำนวณดอกเบี้ยรายวันสะสมตามเกณฑ์ธนาคารจริง: $(\text{เงินต้น} \times \text{ดอกเบี้ย\%} \times \text{จำนวนวันจริง}) / 365$ และแสดงจำนวนวันกำกับ เช่น `฿421.92 (77 วัน)`
    - **งวดถัดไปในปีถัดมา**: ปรับเข้าสู่รอบปกติเต็มงวดอัตโนมัติ (เช่น 6 เดือน หรือ 1 เดือน) พร้อมป้าย `[เต็มงวด]`
  - **ภาษีดอกเบี้ยหัก ณ ที่จ่าย**: ตัวเลือก 0% (บุคคลธรรมดาไม่เกินเกณฑ์) หรือ 15% พร้อมระบบ Auto-Calculate ตามเกณฑ์ 20,000 บาท/ปี
- **การบันทึกฐานข้อมูล**:
  - เงินต้น: บันทึก `current_price = 1.0000`, `shares = เงินต้น`, `price_per_share = 1.0000`, `transaction_date = วันที่เริ่มฝาก` ใน `transactions` (Unrealized P/L = 0%)
  - ดอกเบี้ย: สร้าง `dividend_schedules` อัตโนมัติตามรอบที่เลือก เพื่อให้แสดงผลในกราฟ 12 เดือน

### 4.10 ระบบตัวกรองกระแสเงินสด 3 มุมมองบนกราฟ 12 เดือน (Multi-View Inflow Toggle)
- เพิ่มแถบสวิตช์ฟิลเตอร์ 3 โหมดเหนือแท่งกราฟคาดการณ์กระแสเงินสด 12 เดือนใน Dashboard:
  1. **[ทั้งหมด]**: แสดงกระแสเงินสดรับรวม (เงินปันผลหุ้น/กองทุน + ดอกเบี้ยเงินฝาก)
  2. **[เฉพาะปันผล]**: แสดงเฉพาะเงินปันผลจากหุ้นและกองทุน
  3. **[เฉพาะดอกเบี้ย]**: แสดงเฉพาะดอกเบี้ยเงินฝากธนาคาร
- ในกล่องรายละเอียดรายเดือนมีป้ายระบุประเภทชัดเจน: สีเขียว `[ปันผล]` และสีฟ้า `[ดอกเบี้ย]`

### 4.11 ระบบคำนวณภาษีดอกเบี้ยเงินฝากอัตโนมัติ (Thai Bank Interest Tax Engine - เกณฑ์ 20,000 บาท/ปี)
- ไฟล์จัดการ: `src/services/taxService.ts`, `src/components/CashAssetForm.tsx`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`, `src/components/CategoryBreakdownModal.tsx`
- **หลักเกณฑ์ตามประมวลรัษฎากร (กรมสรรพากร)**:
  - **เงินฝากออมทรัพย์ทั่วไป และเงินฝากดิจิทัล (Digital Savings & Savings)**:
    - ดอกเบี้ยรับรวมจากทุกธนาคารตลอดปีภาษี $\le$ 20,000 บาท $\rightarrow$ **ยกเว้นภาษี (0%)**
    - ดอกเบี้ยรับรวมจากทุกธนาคารตลอดปีภาษี $> 20,000$ บาท $\rightarrow$ **ถูกหักภาษี ณ ที่จ่าย 15% จากยอดดอกเบี้ยทั้งหมดตั้งแต่บาทแรก**
  - **เงินฝากประจำ (Fixed Deposit)**: ถูกหักภาษี 15% ทันที เว้นแต่เป็นบัญชีเงินฝากประจำปลอดภาษี 24-36 เดือน (0%)
- **ฟีเจอร์ที่พัฒนา**:
  1. **Smart Auto-Tax Calculation ในหน้าเพิ่ม/แก้ไขสินทรัพย์**:
     - คำนวณดอกเบี้ยรายปีทันทีเมื่อพิมพ์เงินต้นและอัตราดอกเบี้ย
     - หากดอกเบี้ย $\le$ 20,000 บาท เลือกลดหย่อนภาษี 0% พร้อมแสดงโควตาที่เหลือ
     - หากดอกเบี้ย $> 20,000$ บาท ปรับภาษีเป็น 15% อัตโนมัติ พร้อมแสดงแถบเตือนสีส้มและยอดภาษีที่ต้องถูกหัก
     - ผู้ใช้สามารถกดสลับปุ่ม "กำหนดเอง (Manual)" เพื่อ Override อัตราภาษีได้ตามต้องการ
     - กล่องสรุป Live Preview แสดงแจกแจงละเอียด 3 ยอด: ดอกเบี้ยรวมก่อนภาษี (Gross), ภาษีหัก ณ ที่จ่าย 15%, และดอกเบี้ยรับสุทธิ (Net Inflow) ทั้งรายปีและต่องวด
  2. **Thai Tax-Free Interest Quota Meter ใน Category Breakdown Modal**:
     - เมื่อแตะการ์ดหมวดหมู่ "เงินฝาก (CASH)" จะแสดงการ์ดติดตามโควตาดอกเบี้ย 20,000 บาท/ปี
     - มีแถบ Progress Bar แสดงยอดดอกเบี้ยออมทรัพย์สะสมทั้งพอร์ตเทียบกับเพดาน 20,000 บาท
     - แสดงสถานะชัดเจนว่ายังได้รับสิทธิปลอดภาษี (0%) หรือเกินเกณฑ์ที่ต้องเสียภาษี 15%
      - มี Donut Pie Chart สัดส่วน Segment พร้อมขีดชี้สีขาว (Callout Line) แสดงประเภทสินทรัพย์และเปอร์เซ็นต์ (%) โดยสีกรอบและสีข้อความปรับตามสีของแต่ละ Segment

---

## 5. Mobile & Network Operational Guidelines

### 5.1 การแก้ปัญหา Expo Go Android Runtime Crash
- **สาเหตุ**:
  1. ไลบรารี `expo-notifications` มีการ `throw new Error` ภายในฟังก์ชัน `warnOfExpoGoPushUsage` เมื่อรันบน Android Expo Go (เนื่องจาก Expo SDK 53+ ยกเลิก Remote Push ใน Expo Go)
  2. `TopicSubscriptionModule.android.js` เรียกใช้ `requireNativeModule('ExpoTopicSubscriptionModule')` โดยตรง ซึ่งโมดูล Native นี้ถูกตัดออกจาก Expo Go บน Android ทำให้เกิด Runtime Error `Cannot find native module 'ExpoTopicSubscriptionModule'`
- **การแก้ไขที่ทำไว้**:
  - สคริปต์ [scripts/patch-expo-notifications.js](file:///c:/Users/lenovo/Documents/My%20dividend/scripts/patch-expo-notifications.js) จะปรับ `warnOfExpoGoPushUsage` ให้เป็น `console.warn` และปรับ `TopicSubscriptionModule.android.js` ให้ใช้ `requireOptionalNativeModule` พร้อม Fallback Dummy Module
  - ผูกเข้ากับคำสั่ง `"postinstall": "node ./scripts/patch-expo-notifications.js"` ใน `package.json`
  - ติดตั้ง [RootErrorBoundary](file:///c:/Users/lenovo/Documents/My%20dividend/App.tsx) ใน `App.tsx` เพื่อดักจับข้อผิดพลาดและแสดงปุ่มลองใหม่อย่างสวยงาม

### 5.2 Safe Area & Native UI Graphics Standards
- **Safe Area**: เปลี่ยนจาก SafeAreaView ดั้งเดิมของ react-native ที่ถูก Deprecated มาใช้ react-native-safe-area-context ครอบทั้งใน App.tsx และ Dashboard.tsx
- **Linear Gradient**: ติดตั้ง expo-linear-gradient สำหรับ react-native-gifted-charts
- **Expo Go Warning Cleanup**: ตั้งค่า LogBox.ignoreLogs ใน App.tsx ปิด Warning เรื่อง Push Notifications ของ Expo Go

### 5.3 สภาพแวดล้อมเครือข่ายและการรันแอพ (Expo Tunnel Mode)
- **ข้อจำกัดเครือข่าย**: เครือข่ายสถาบัน/สำนักงาน (เช่น WiFi `CAMT`) มีการเปิดใช้งาน AP/Client Isolation ทำให้มือถือไม่สามารถเชื่อมต่อ IP Local (LAN) ของเครื่องคอมพิวเตอร์ได้โดยตรง (เกิดอาการหมุนค้าง)
- **คำสั่งที่ต้องใช้รันเซิร์ฟเวอร์เสมอ**:
  ```bash
  node ./node_modules/expo/bin/cli start --tunnel --go --web
  ```
  *(หรือ `npx expo start --tunnel --go --web`)*
- การเชื่อมต่อผ่าน `--tunnel` (โดยใช้ `@expo/ngrok`) จะสร้าง URL โดเมน `.exp.direct` ทำให้มือถือสามารถสแกน QR Code และโหลด Bundle ได้จากทุกเครือข่าย

---

## 6. โครงสร้างไฟล์โปรเจกต์ (File Structure)
- `App.tsx`: Root Component พร้อม `RootErrorBoundary`
- `index.ts`: Entry point ลงทะเบียน Root Component กับ Expo
- `app.json`: การตั้งค่า Expo, Permissions Android, และ Plugins
- `src/`
  - `types/database.ts`: TypeScript Database Definitions สำหรับ Supabase
  - `lib/supabase.ts`: Supabase Client Config พร้อม AsyncStorage
  - `screens/Dashboard.tsx`: หน้าจอหลัก Dashboard พอร์ต, การ์ดหมวดหมู่, ตัวกรอง 3 มุมมอง, และ Bar Chart คาดการณ์ปันผล/ดอกเบี้ย
  - `components/AddAssetModal.tsx`: Bottom Sheet เพิ่มสินทรัพย์, Autocomplete หุ้น, Toggle USD/THB, FAB Button
  - `components/EditAssetModal.tsx`: Bottom Sheet สำหรับแก้ไขและลบสินทรัพย์เดิมในพอร์ต
  - `components/CashAssetForm.tsx`: ฟอร์มจัดการบัญชีเงินฝาก, ดอกเบี้ย และระบบคำนวณภาษีหัก ณ ที่จ่าย 20,000 บาท/ปี (Modular Component ที่ใช้ร่วมกันทั้งหน้าเพิ่มและแก้ไข)
  - `components/CategoryBreakdownModal.tsx`: Bottom Sheet แสดง Pie Chart วงกลมสัดส่วน Segment และมิเตอร์ติดตามโควตาดอกเบี้ยปลอดภาษี 20,000 บาท/ปี
  - `services/taxService.ts`: ระบบคำนวณและประเมินภาษีดอกเบี้ยเงินฝากธนาคารตามเกณฑ์ยกเว้น 20,000 บาท/ปี ของกรมสรรพากร
  - `services/sectorService.ts`: ระบบจำแนกและจัดการ Segment มาตรฐานของหุ้น, กองทุน, และเงินฝาก
  - `services/stockService.ts`: ระบบค้นหาหุ้น US/TH, ดึงราคาปิด และอัตราแลกเปลี่ยน
  - `services/notificationService.ts`: ระบบตั้งเวลาแจ้งเตือนวัน XD บน Android
- `scripts/`
  - `patch-expo-notifications.js`: สคริปต์แก้ไขปัญหา Expo Go Crash บน Android
- `supabase/functions/stock-proxy/`: Source code ของ Supabase Edge Function

