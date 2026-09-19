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
| `react-native-gifted-charts` & `react-native-svg` | แสดงผลกราฟ Bar Chart คาดการณ์ปันผล | [x] ติดตั้งแล้ว (UI ออกแบบ Interactive Custom Bar Chart) |
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
- **สูตรคำนวณปันผลสุทธิ**: $\text{Shares} \times \text{DPU} \times (1 - \text{tax\_rate})$ โดยหักภาษี ณ ที่จ่าย 10% ตามค่าเริ่มต้น
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

### 5.2 สภาพแวดล้อมเครือข่ายและการรันแอพ (Expo Tunnel Mode)
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
  - `screens/Dashboard.tsx`: หน้าจอหลัก Dashboard พอร์ต, การ์ดหมวดหมู่, และ Bar Chart คาดการณ์ปันผล
  - `components/AddAssetModal.tsx`: Bottom Sheet เพิ่มสินทรัพย์, Autocomplete หุ้น, Toggle USD/THB, FAB Button
  - `services/stockService.ts`: ระบบค้นหาหุ้น US/TH, ดึงราคาปิด และอัตราแลกเปลี่ยน
  - `services/notificationService.ts`: ระบบตั้งเวลาแจ้งเตือนวัน XD บน Android
- `scripts/`
  - `patch-expo-notifications.js`: สคริปต์แก้ไขปัญหา Expo Go Crash บน Android
- `supabase/functions/stock-proxy/`: Source code ของ Supabase Edge Function

