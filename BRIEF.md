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
EXPO_PUBLIC_SEC_API_KEY=your-sec-api-key # SEC Open API subscription key
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

### 4.3.1 ระบบค้นหากองทุนรวมไทยและดึง NAV อัตโนมัติ (Thai Mutual Funds - SEC Open API)
- ไฟล์จัดการ: `src/services/fundService.ts`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`
- **การเชื่อมต่อ**: เชื่อมต่อกับสำนักงานคณะกรรมการกำกับหลักทรัพย์และตลาดหลักทรัพย์ (ก.ล.ต. / SEC Thailand) ผ่าน API v2
- **ระบบ Autocomplete & แคตตาล็อกในตัว**:
  - มีแคตตาล็อกกองทุนยอดนิยมในตัว ตอบสนองทันที 0ms ครอบคลุม บลจ. ชั้นนำในไทย (เช่น KAsset, SCBAM, BBLAM, KSAM, UOBAM, TISCOAM, ONEAM, KTAM, Principal ฯลฯ)
  - รองรับการค้นหาด้วยชื่อย่อกองทุน (เช่น `K-USA`, `SCBDV`, `B-INNOTECH`, `KF-GTECH`), ชื่อภาษาไทย, หรือชื่อ บลจ.
  - แสดงป้ายระบุชื่อ บลจ. อย่างชัดเจน เช่น `[KAsset]`, `[SCBAM]`, `[BBLAM]`, `[KSAM]`
- **ดึง NAV ล่าสุดอัตโนมัติ (Auto NAV Fetching)**:
  - เมื่อเลือกกองทุน ระบบจะดึงมูลค่าหน่วยลงทุนล่าสุด (NAV) จาก ก.ล.ต. มากรอกในช่อง "NAV ล่าสุดต่อหน่วย" ให้อัตโนมัติ
  - ปรับป้ายกำกับในฟอร์มเป็นภาษาเฉพาะของกองทุน: *"จำนวนหน่วยลงทุน (Units)"*, *"NAV ต้นทุนต่อหน่วย"*, และ *"NAV ล่าสุดต่อหน่วย"*
  - คำนวณมูลค่าตลาดรวม (Market Value) และ กำไร/ขาดทุนสุทธิ (Unrealized P/L) ผ่าน SQL View `view_asset_summary` อัตโนมัติ
- **ประวัติการจ่ายปันผลกองทุน (Fund Dividends)**:
  - ดึงข้อมูลประวัติการจ่ายเงินปันผลต่อหน่วย (DPU) และวันปิดสมุดทะเบียน (XD) จาก ก.ล.ต. เพื่อสร้างรอบคาดการณ์ปันผล 12 เดือนใน `dividend_schedules` อัตโนมัติ พร้อมระบบกรอง Exact Symbol Matching ป้องกันการดึงคลาสย่อยอื่น
- **จำแนกประเภทกองทุนอัตโนมัติ (Fund Category Auto-Detection)**:
  - วิเคราะห์นโยบายการลงทุน (`policy_desc`) จาก ก.ล.ต. เพื่อเลือกกลุ่ม Sector (ตราสารทุน, ตราสารหนี้, FIF ฯลฯ) ให้โดยอัตโนมัติทันทีที่เลือกกองทุน
- **ระบบล้างฟอร์มเมื่อเปลี่ยนสินทรัพย์ (Clean State Switcher)**:
  - เมื่อสลับระหว่าง หุ้น (STOCKS), กองทุน (FUNDS) และเงินฝาก (CASH) ระบบจะเคลียร์ค่าที่กรอกค้างไว้ทั้งหมด ป้องกันข้อมูลปนกันอย่างเด็ดขาด

### 4.4 รองรับการซื้อด้วยสกุลเงินดอลลาร์ (USD Currency Support สำหรับหุ้น)
- มีปุ่มสวิตช์เลือกสกุลเงิน **THB / USD** ใน Modal เพิ่มและแก้ไขสินทรัพย์ (แสดงผลเฉพาะเมื่อเลือกประเภทสินทรัพย์เป็น **หุ้น (STOCKS)** เท่านั้น สำหรับกองทุนรวมไทย [FUNDS] จะล็อกสกุลเงินเป็น **THB (฿)** โดยอัตโนมัติ เนื่องจากซื้อขายผ่าน บลจ. ไทยในรูปเงินบาท)
- เมื่อเลือกเป็น **USD** สำหรับหุ้น:
  - ระบบจะดึงอัตราแลกเปลี่ยน USD/THB แบบ Real-time อัตโนมัติผ่าน Edge Function (เช่น 1 USD = 34.xx บาท)
  - ผู้ใช้กรอกต้นทุนเป็นเงิน USD ระบบจะคำนวณและแสดงยอดเงินบาทไทย (THB) ให้เห็นแบบ Real-time ทันที
  - บันทึกลงฐานข้อมูลในสกุลเงินบาท (Base Currency) เพื่อให้คำนวณรวมในพอร์ตได้อย่างแม่นยำ

### 4.5 Supabase Edge Function (`stock-proxy`)
- แก้ปัญหา Browser CORS และทำหน้าที่ Proxy สำหรับ Yahoo Finance และ SEC Open API จากอุปกรณ์มือถือ
- Deploy อยู่บน Supabase Project: `ycflookcrilaujmeillt`
- Endpoint: `/functions/v1/stock-proxy`
- รองรับ Actions:
  1. `action: "search"`: ค้นหาหุ้น US & Thai จาก Yahoo Finance
  2. `action: "quote"`: ดึงราคาหุ้น และอัตราแลกเปลี่ยน (เช่น `USDTHB=X`)
  3. `action: "dividends"`: ดึงประวัติเงินปันผลหุ้น
  4. `action: "fund-nav"`: ดึงค่า NAV ล่าสุดของกองทุนรวมไทยจาก SEC API (`/v2/fund/daily-info/nav`)
  5. `action: "fund-dividends"`: ดึงประวัติเงินปันผลกองทุนรวมไทยจาก SEC API (`/v2/fund/daily-info/dividend-history`)

### 4.6 Local Notifications (แจ้งเตือนวัน XD)
- ไฟล์จัดการ: `src/services/notificationService.ts`
  - `services/assetConsolidationService.ts`: บริการรวมข้อมูลสินทรัพย์คงเหลือที่ซื้อซ้ำ จัดระเบียบพอร์ต และโอนย้ายประวัติธุรกรรม
  - `services/benchmarkService.ts`: บริการคำนวณและประมวลผลจุดพล็อตเปรียบเทียบผลตอบแทนกับดัชนีตลาด (SET, S&P 500, NASDAQ) และค่า Alpha
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

### 4.8 ระบบจำแนก Segment และ Pie Chart แสดงสัดส่วนหมวดหมู่ & พอร์ตโฟลิโอ (Category Breakdown & Portfolio Allocation)
- ไฟล์จัดการ: `src/components/CategoryBreakdownModal.tsx`, `src/screens/Portfolio.tsx`, `src/services/sectorService.ts`
- **การเปิดใช้งาน**: แตะที่การ์ดหมวดหมู่บนหน้า Dashboard หรือแตะ "เปิดดู Pie Chart" เพื่อเข้าสู่หน้าพอร์ตโฟลิโอ
- **การแสดงผล & เส้น Callout สีขาว (White Callout Lines)**:
  - Donut / Pie Chart แสดงผลบนการ์ดสีเข้มพรีเมียม (`#0F172A`)
  - **White Callout Lines**: มีเส้นสีขาวชี้ออกจากแต่ละชิ้นพายไปยังป้ายตัวเลขเปอร์เซ็นต์ (%) และชื่อสินทรัพย์/หมวดหมู่ อย่างคมชัดสวยงาม ป้องกันป้ายทับกัน
  - **ระบบรวมกลุ่มสัดส่วนย่อย Option A (Minor Items Grouping - "อื่นๆ / Others")**:
    - สินทรัพย์หรือ Segment ที่มีสัดส่วน $\ge 6\%$ (หรือ Top Holdings หลัก) จะได้ชิ้นพายตัวเองพร้อมเส้นสีขาวชี้ระบุชื่อและ % ชัดเจน
    - สินทรัพย์หรือ Segment ย่อยที่มีสัดส่วน $< 6\%$ จะถูกรวบเป็นชิ้นพายก้อนเดียวสีเทาสลレート (`#64748B`) ในชื่อ **"อื่นๆ (Others)"** พร้อมเส้นชี้อันเดียว เพื่อแก้ปัญหาป้ายและเส้นทับซ้อนกันบนจอมือถือ
    - ในตาราง Legend และรายการสินทรัพย์ด้านล่างยังคงแสดงข้อมูลรายตัวครบ 100%
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

### 4.12 ระบบจัดการกองทุนรวมไทย และเชื่อมต่อ SEC Open API (Mutual Funds & SEC Open Data Engine)
- ไฟล์จัดการ: `src/services/fundService.ts`, `src/services/sectorService.ts`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`, `supabase/functions/stock-proxy/index.ts`
- **การเชื่อมต่อ SEC Open API (ก.ล.ต.)**:
  - ใช้ API Key ของสำนักงาน ก.ล.ต. จัดเก็บใน `.env` (`EXPO_PUBLIC_SEC_API_KEY`)
  - เชื่อมต่อผ่าน Supabase Edge Function (`stock-proxy`) พร้อม Fallback ตรงไปยัง SEC Open API
  - รองรับการดึง NAV ล่าสุด (`daily-info/nav`) และประวัติเงินปันผล (`daily-info/dividend-history`) ด้วย `class_abbr_name` หรือ `proj_id`
- **ระบบวิเคราะห์และคาดการณ์ปันผลกองทุนอัตโนมัติ**:
  - คำนวณความถี่การจ่ายเงินปันผล (ไตรมาส, ปีละ 2 ครั้ง, ปีละครั้ง)
  - คำนวณคาดการณ์ปันผลต่อหน่วยทั้งปี (Annual Projected DPU)
  - กรอกตัวเลข DPU รอบล่าสุด และวัน XD รอบถัดไปลงในฟอร์มให้อัตโนมัติ พร้อมการ์ดไฮไลต์สีเขียวสรุปสถิติ
- **ระบบจำแนกประเภทกองทุนอัตโนมัติ (Auto Category / Segment Detection)**:
  - ดึงนโยบายการลงทุน (`policy_desc`) จากฐานข้อมูล ก.ล.ต. เพื่อจัดหมวดหมู่กองทุนทันที:
    - **ตราสารทุน (หุ้น)**: กองทุนหุ้นไทย เช่น `SCBDV`, `K-VALUE`, `TISCOHD`
    - **ตราสารหนี้ & พันธบัตร**: กองทุนตราสารหนี้ เช่น `K-FIXED`, `K-SFPLUS`
    - **กองทุนต่างประเทศ (FIF)**: กองทุนที่ลงทุนต่างประเทศ เช่น `K-USA-A(D)`, `SCBBLN`, `UGIS`
    - **กองทุนรวมผสม (Mixed)**, **อสังหาฯ & โครงสร้างพื้นฐาน (Property)**, **สินค้าโภคภัณฑ์ (Commodity)**, **ตลาดเงิน (Money Market)**
  - แสดงป้ายประเภทกองทุน (Category Badge) ในรายการแนะนำค้นหา (Dropdown), ข้อความสรุปใต้ชื่อสินทรัพย์, และป้าย `[ตรวจพบอัตโนมัติ]` เหนือตัวเลือก Segment
  - รองรับการปรับเปลี่ยน Segment ด้วยตนเอง (Manual Override) ได้อย่างอิสระ

### 4.13 ระบบจัดการสินทรัพย์คงเหลือและประวัติธุรกรรม (Assets & Transaction History Engine)
- ไฟล์จัดการ: `src/screens/AssetsScreen.tsx`, `src/components/AssetSparklineCard.tsx`, `src/services/historyService.ts`, `App.tsx`
- **การเข้าใช้งาน**: แตะที่แท็บที่ 3 บน Bottom Navigation Bar (`สินทรัพย์ & ธุรกรรม`), หรือแตะปุ่ม "ดูทั้งหมด" จากหน้า Dashboard หรือหน้า Portfolio
- **การสลับมุมมอง 2 รูปแบบ (Dual View Switcher)**:
  1. **[ 📦 สินทรัพย์คงเหลือ (Holdings View) ]**:
     - รวบรวมสินทรัพย์ทุกตัวที่มีอยู่ในพอร์ต ย้ายออกจากหน้ากราฟเพื่อแก้ปัญหาจอยาวเลื่อนไม่รู้จบ (Endless Scrolling)
     - **Search Bar**: ค้นหาตามชื่อย่อสินทรัพย์หรือบัญชีเงินฝากทันที
     - **Category Filter Pills**: สลับกรองเฉพาะ หุ้น (STOCKS), กองทุน (FUNDS), เงินฝาก (CASH) หรือ ทั้งหมด
     - **Sort Options**: จัดเรียงตาม มูลค่าสูงสุด (Market Value), กำไรสูงสุด (% Gain), ขาดทุนมากสุด (% Loss), หรือตามตัวอักษร A-Z
     - **Live Stats Banner**: สรุปมูลค่ารวมของรายการที่กำลังแสดงผล และผลรวมกำไร/ขาดทุน
     - **FinTech Sparkline Area Chart Cards (AssetSparklineCard.tsx & historyService.ts)**: แสดงผลการ์ดสินทรัพย์สไตล์ FinTech สุดพรีเมียม พร้อมกราฟพื้นที่มินิมอล (Sparkline Area Chart) แสดงแนวโน้มราคาปิดจริง 7 วันล่าสุด วาดด้วย `react-native-svg` แบบ Monotone Spline และไล่ระดับสี Gradient ใต้เส้นกราฟ พร้อมระบบ **Once-a-Day EOD Cache (แคชรอบวันตามเวลาปิดตลาด 16-24 ชม.)** ร่วมกับ In-Memory Cache (0ms) และระบบ On-Demand Refresh (ยิง API ใหม่เฉพาะเมื่อดึงรูดรีเฟรชหน้าจอเท่านั้น) ช่วยลดจำนวนครั้งการยิง API ภายนอกลงได้มากกว่า 95%
   2. **[ 📜 ประวัติรายการ (Transaction History View) ]**:
      - แสดงไทม์ไลน์ประวัติการซื้อและฝากเงินย้อนหลัง เรียงจากวันที่ล่าสุด
      - **Minimal Dropdown Filter Bar (แถบตัวกรองแถวเดียวสไตล์มินิมอล)**: รวม 3 ตัวกรองไว้ในแถวเดียว แทนที่แถบเลื่อนแนวนอนแบบเดิม ประหยัดพื้นที่หน้าจอ เพิ่มพื้นที่แสดงข้อมูลธุรกรรม
        - **Dropdown ปี (Year Chip)**: แตะเพื่อเปิด Bottom Sheet Modal เลือกปีจริงจากฐานข้อมูล (เช่น `ทุกปี`, `2026 (2569)`, `2025 (2568)` ฯลฯ)
        - **Dropdown เดือน (Month Chip)**: แตะเพื่อเปิด Modal แบบ Grid ตาราง 12 เดือน (ม.ค. - ธ.ค.) หรือปุ่ม "ทุกเดือน (ตลอดทั้งปี)"
        - **Dropdown ประเภท (Type Chip)**: กรองระหว่าง `ทุกประเภท (ทั้งหมด)`, `ซื้อหุ้น / กองทุน (BUY)`, และ `เงินฝากธนาคาร (DEPOSIT)` (ตัดตัวเลือก SELL ออกเพื่อความชัดเจน เนื่องจากแอปยังไม่มีระบบขายสินทรัพย์)
        - **ปุ่มรีเซ็ต (Reset Chip)**: แสดงปุ่มกากบาท/ล้างตัวกรองสีแดงอัตโนมัติเมื่อมีการเลือกตัวกรองใดตัวกรองหนึ่งอยู่
      - **Search Bar**: ค้นหาตามชื่อสินทรัพย์ในประวัติรายการ
      - **Transaction Volume Banner**: สรุปยอดเงินรวมของธุรกรรมที่เกิดขึ้นในช่วงเวลาที่เลือก พร้อมจำนวนรายการ

---

### 4.14 ระบบรวมสินทรัพย์ที่ซื้อซ้ำ และการซื้อเพิ่มแบบ DCA (Position Accumulation & Duplicate Consolidation Engine)
- ไฟล์จัดการ: `src/services/assetConsolidationService.ts`, `src/components/AddAssetModal.tsx`, `src/screens/AssetsScreen.tsx`, `src/screens/Portfolio.tsx`, `src/screens/Dashboard.tsx`
- **หลักการออกแบบพอร์ตการลงทุน (Portfolio Model Rule)**:
  - **หน้าสินทรัพย์คงเหลือ (Holdings View)**: สินทรัพย์แต่ละตัว (Symbol เดียวกัน และ Asset Type เดียวกัน) จะต้องแสดงผลเพียง **1 รายการ / 1 การ์ดเท่านั้น** โดยระบบจะรวมจำนวนหุ้นคงเหลือทั้งหมด (`net_shares`) และคำนวณราคาต้นทุนเฉลี่ยถ่วงน้ำหนัก (`weighted_average_cost`) ให้อัตโนมัติผ่าน SQL View `view_asset_summary`
  - **หน้าประวัติรายการ (Transaction History View)**: เป็นที่สำหรับจัดเก็บและแสดงผลประวัติการซื้อแต่ละครั้งแยกกันตามจริง (เช่น ซื้อรอบที่ 1 วันที่ X, ซื้อรอบที่ 2 วันที่ Y)
- **Live Detection & DCA Hint Banner ใน AddAssetModal**:
  - เมื่อผู้ใช้งานพิมพ์หรือเลือกหุ้น/กองทุน/บัญชีเงินฝาก ระบบจะตรวจเช็คพอร์ตแบบ Real-time
  - หากพบว่ามีสินทรัพย์นี้อยู่ในพอร์ตแล้ว จะแสดงกล่องข้อความสีฟ้าแจ้งเตือนชัดเจน: `💡 มีสินทรัพย์นี้ในพอร์ตแล้ว (X หุ้น @ ฿Y) — การบันทึกครั้งนี้จะถือเป็นการซื้อเพิ่ม (DCA) ระบบจะรวมจำนวนหุ้นและเฉลี่ยต้นทุนให้อัตโนมัติ`
  - เมื่อกดยืนยัน ระบบจะไม่สร้าง Asset แถวใหม่ แต่จะนำ `asset_id` เดิมมาใช้ในการบันทึก Transaction ซื้อเพิ่ม
- **Auto Duplicate Consolidation (การรวมรายการซ้ำเดิมอัตโนมัติ)**:
  - ฟังก์ชัน `consolidateDuplicateAssets()` ใน `assetConsolidationService.ts` จะสแกนค้นหา Asset ที่ซ้ำกันในฐานข้อมูล
  - ย้าย Transactions และ Dividend Schedules ทั้งหมดของรายการซ้ำมาผูกกับ Asset หลัก แล้วทำการ Soft-delete (Archive) รายการที่ซ้ำ
  - เรียกทำงานอัตโนมัติเมื่อโหลดหน้า Dashboard, Portfolio, และ AssetsScreen

---

### 4.15 ระบบวัดผลตอบแทนพอร์ต และเปรียบเทียบดัชนีตลาด (Portfolio Performance & Benchmark Comparison Engine)
- ไฟล์จัดการ: `src/services/benchmarkService.ts`, `src/screens/Portfolio.tsx`
- **การสลับมุมมองพอร์ตแบบ Dual Tab Switcher**:
  1. **[ 🥧 สัดส่วนพอร์ต (Allocation) ]**:
     - ตัดกล่อง Hero Card ด้านบนออก เพื่อขจัดความซ้ำซ้อนกับตัวเลขรวมตรงกลางรูกลมของ Donut Pie Chart (`฿xxxk`)
     - ชู Donut Pie Chart ขึ้นมาเด่นสง่าทันที พร้อมปุ่มตัวกรองหมวดหมู่ (หุ้น/กองทุน/เงินฝาก) และพรีวิว 3 สินทรัพย์หลักที่มีมูลค่าสูงสุดในพอร์ต
  2. **[ 📈 ผลงานพอร์ต (Performance) ]**:
     - **Performance Hero Card**: แสดง **% ผลตอบแทนสะสม (Cumulative Return)** เช่น `+14.8%` พร้อมยอดกำไร/ขาดทุนสุทธิ (฿) และเงินต้นสะสมเพื่อความโปร่งใส
     - **Timeframe Selector Bar**: กรองช่วงเวลา `[ 1M | 3M | 6M | 1Y | ทั้งหมด ]`
      - **Benchmark Selector Dropdown (กล่องเลือกดัชนีตลาดแบบ Dropdown)**:
        - ออกแบบเป็นการ์ด Dropdown สไตล์มินิมอล แสดงไอคอน/ธง, ชื่อดัชนีที่เลือก, และลูกศร `chevron-down`
        - แตะเพื่อเปิด **Bottom Sheet Modal Picker**: เลือกดัชนีได้อย่างรวดเร็ว ไม่เกะกะหน้าจอ
          - `พอร์ตเดี่ยว (ไม่เปรียบเทียบ)`: แสดงกราฟเส้นเดี่ยวแบบ Area Fill
          - `🇹🇭 SET Index`: เปรียบเทียบกับดัชนีตลาดหลักทรัพย์แห่งประเทศไทย (SET)
          - `🇺🇸 S&P 500`: เปรียบเทียบกับดัชนี 500 บริษัทชั้นนำสหรัฐฯ
          - `🇺🇸 NASDAQ`: เปรียบเทียบกับดัชนีหุ้นกลุ่มเทคโนโลยีสหรัฐฯ
      - **Dual-Line Comparison Chart พร้อม Dynamic Safe Scale Bounds**:
        - กราฟเส้นคู่แบบ Interactive จาก `react-native-gifted-charts`
        - **ระบบคำนวณสเกลป้องกันกราฟทะลุขอบ (Overflow Prevention Engine)**:
          - คำนวณ `maxValue`, `stepValue`, และ `noOfSections` แบบ Real-time ครอบคลุมทั้งข้อมูลพอร์ตและดัชนีอ้างอิง
          - เพิ่ม Headroom เผื่อส่วนโค้ง Bezier อย่างน้อย 25% ป้องกันไม่ให้กราฟพุ่งทะลุขอบบนแม้ในดัชนีที่ผลตอบแทนสูงมาก (เช่น NASDAQ +31.5%)
          - รองรับค่าติดลบด้านล่าง (`mostNegativeValue`, `noOfSectionsBelowXAxis`) อย่างแม่นยำ
        - เส้นที่ 1: พอร์ตของคุณ (สีเขียว `#10B981`)
        - เส้นที่ 2: ดัชนีอ้างอิงที่เลือก (สีส้ม/ม่วง/ชมพู)
     - **Alpha / Outperformance Banner**: กล่องสรุปผลเปรียบเทียบ เช่น `🎉 พอร์ตของคุณชนะ S&P 500 อยู่ +3.5% (Outperforming)` หรือ `📊 ตามหลังดัชนี -1.2%`
     - **Asset Return Ranking (จัดอันดับผลงานรายสินทรัพย์)**: แสดงรายชื่อหุ้น/กองทุนทั้งหมดในพอร์ต เรียงลำดับจาก % กำไรสูงสุดไปหาน้อยสุด

---

### 4.16 ระบบ Minimal Hybrid Dashboard & Cashflow Engine (Dual Yield, Privacy Mode, Payday Radar, Goal Card)
- ไฟล์จัดการ: `src/screens/Dashboard.tsx`, `src/components/GoalSettingsModal.tsx`
- **Dual Yield & เฉลี่ยต่อเดือนใน Hero Card**:
  - **Current Dividend Yield**: $\frac{\text{Projected Annual Net Inflow}}{\text{Total Market Value}} \times 100$
  - **Yield on Cost (YoC)**: $\frac{\text{Projected Annual Net Inflow}}{\text{Total Cost Basis}} \times 100$ (ชี้วัดความคุ้มค่าของเงินต้นที่ลงทุนจริง)
  - **เฉลี่ยต่อเดือน**: แสดงตัวเลขกระแสเงินสดรับต่อเดือนโดยประมาณ (`~฿X/ด.`)
- **Privacy Mode (ปุ่มดวงตา 👁️)**:
  - ปุ่มสลับที่มุมบนขวาของ Header ซ่อนตัวเลขเงินบาททั้งหมดในหน้า Dashboard เป็น `฿••••••` เพื่อความปลอดภัยในที่สาธารณะ โดยยังคงแสดงสัดส่วน (%) และเปอร์เซ็นต์ผลตอบแทน (Yield, YoC)
- **Mini Payday Radar (เรดาร์เตือนเงินเข้าสัปดาห์นี้)**:
  - แถบเตือนมินิมอล 1 บรรทัดเหนือแท่งกราฟ 12 เดือน กรองเฉพาะรายการ XD หรือวันจ่ายเงินปันผล/ดอกเบี้ยที่จะเข้าภายใน 14 วันข้างหน้า
  - หากไม่มีรายการ จะแสดงรายการถัดไปที่ใกล้ที่สุดให้อัตโนมัติ
- **Minimal Passive Income Goal Card (การ์ดเป้าหมายกระแสเงินสด)**:
  - แสดงสถานะความคืบหน้าสู่เป้าหมายรายได้ปันผล/ดอกเบี้ยต่อเดือน (เช่น Level 1: ค่ากาแฟ ฿1,000, Level 2: ค่าน้ำค่าไฟ ฿3,000, Level 3: ค่ากินอยู่ ฿10,000, Level 4: Lean FIRE ฿30,000 หรือกำหนดเอง)
  - แถบ Progress Bar สไตล์เรียบหรู พร้อมคำนวณยอดที่ยังขาดอีกต่องวด
  - ปรับแต่งผ่าน [GoalSettingsModal.tsx](file:///c:/Users/lenovo/Documents/My%20dividend/src/components/GoalSettingsModal.tsx) และบันทึกลง AsyncStorage

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
  - `screens/Portfolio.tsx`: หน้าจอพอร์ตโฟลิโอรวม, Pie Chart สัดส่วนสินทรัพย์พร้อมเส้น Callout สีขาว และระบบรวมกลุ่มสัดส่วนย่อย (Option A)
  - `screens/AssetsScreen.tsx`: หน้าจอจัดการสินทรัพย์คงเหลือและประวัติธุรกรรม (Holdings & Transactions) พร้อมระบบค้นหาและ Filter ปี/เดือน
  - `components/AddAssetModal.tsx`: Bottom Sheet เพิ่มสินทรัพย์, Autocomplete หุ้น, Toggle USD/THB, FAB Button
  - `components/EditAssetModal.tsx`: Bottom Sheet สำหรับแก้ไขและลบสินทรัพย์เดิมในพอร์ต
  - `components/AssetSparklineCard.tsx`: การ์ดแสดงผลสินทรัพย์คงเหลือสไตล์ FinTech พร้อมกราฟเส้นพื้นที่มินิมอล (Sparkline Area Chart) แสดงแนวโน้มผลตอบแทนและข้อมูลการถือครอง
  - `components/CashAssetForm.tsx`: ฟอร์มจัดการบัญชีเงินฝาก, ดอกเบี้ย และระบบคำนวณภาษีหัก ณ ที่จ่าย 20,000 บาท/ปี (Modular Component ที่ใช้ร่วมกันทั้งหน้าเพิ่มและแก้ไข)
  - `components/CategoryBreakdownModal.tsx`: Bottom Sheet แสดง Pie Chart วงกลมสัดส่วน Segment และมิเตอร์ติดตามโควตาดอกเบี้ยปลอดภาษี 20,000 บาท/ปี
  - `components/GoalSettingsModal.tsx`: Bottom Sheet Modal มินิมอล สำหรับตั้งค่าเป้าหมายกระแสเงินสดรายเดือน (Level Presets & Custom Target)
  - `services/taxService.ts`: ระบบคำนวณและประเมินภาษีดอกเบี้ยเงินฝากธนาคารตามเกณฑ์ยกเว้น 20,000 บาท/ปี ของกรมสรรพากร
  - `services/sectorService.ts`: ระบบจำแนกและจัดการ Segment มาตรฐานของหุ้น, กองทุน, และเงินฝาก
  - `services/stockService.ts`: ระบบค้นหาหุ้น US/TH, ดึงราคาปิด และอัตราแลกเปลี่ยน
  - `services/fundService.ts`: ระบบค้นหากองทุนรวมไทย, ดึง NAV ล่าสุด และประวัติเงินปันผลผ่าน SEC Open API
  - `services/notificationService.ts`: ระบบตั้งเวลาแจ้งเตือนวัน XD บน Android
  - `services/assetConsolidationService.ts`: บริการรวมข้อมูลสินทรัพย์คงเหลือที่ซื้อซ้ำ จัดระเบียบพอร์ต และโอนย้ายประวัติธุรกรรม
  - `services/benchmarkService.ts`: บริการคำนวณและประมวลผลจุดพล็อตเปรียบเทียบผลตอบแทนกับดัชนีตลาด (SET, S&P 500, NASDAQ) และค่า Alpha
  - `services/historyService.ts`: บริการดึงและจัดเก็บแคชข้อมูลราคาปิดย้อนหลัง 7 วัน (Historical 7-Day Prices) ของหุ้นและกองทุน เพื่อแสดงผลกราฟแนวโน้มจริงในหน้าสินทรัพย์
- `scripts/`
  - `patch-expo-notifications.js`: สคริปต์แก้ไขปัญหา Expo Go Crash บน Android
- `supabase/functions/stock-proxy/`: Source code ของ Supabase Edge Function

