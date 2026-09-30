# รายงานการตรวจสอบลิขสิทธิ์และความพร้อมทางกฎหมาย (License & Compliance Audit)
**โปรเจกต์**: My dividend  
**วันที่ตรวจสอบ**: 30 กันยายน 2026  
**สถานะการตรวจสอบ**: ดำเนินการระยะที่ 1 และระยะที่ 2 เสร็จสมบูรณ์แล้ว (ผู้ถือลิขสิทธิ์: DiaHyeon)

---

## 1. ไฟล์บริบทของโปรเจกต์ (Project Context Audit)

จากการตรวจสอบเอกสารหลักของโปรเจกต์ ได้แก่ `AGENTS.md` และ `BRIEF.md` (ไม่พบโฟลเดอร์ `docs/` ในโปรเจกต์):

### ข้อมูลที่พบในเอกสาร
- **ชื่อโปรเจกต์**: My dividend
- **วัตถุประสงค์**: แอปพลิเคชันติดตามพอร์ตการลงทุนและคาดการณ์เงินปันผล/ดอกเบี้ย 12 เดือนล่วงหน้า (Stocks, Mutual Funds, Cash/Fixed Income) ไม่ใช่เชิงพาณิชย์ พัฒนาเพื่อการศึกษาและส่งงาน
- **เป้าหมายการเผยแพร่**: Google Play Store (Android APK/AAB) และ Open Source บน GitHub
- **สแตกทางเทคนิค**: Expo SDK 57 (React Native 0.86, React 19), TypeScript, Supabase PostgreSQL with RLS
- **ข้อมูลผู้พัฒนา (Developer / Author)**:
  - ใน `AGENTS.md` และ `BRIEF.md` **ไม่ระบุชื่อ-นามสกุลจริงหรือชื่อองค์กร/ผู้ถือลิขสิทธิ์**
  - ในประวัติ Git Commit พบผู้ commit ในนาม `CAMT <camt@local>` (Initial commit) และ `lenovo <lenovo@local>` ซึ่งเป็นค่า default ของสภาพแวดล้อมระบบ ไม่ใช่ชื่อบุคคลจริง
- **แหล่งที่มา Asset และกฎที่เกี่ยวข้อง**:
  - `AGENTS.md` กำหนดให้ปฏิบัติตามกฎ RLS, ไม่บันทึกคีย์ลับลง Git, ห้ามใช้ FLOAT/REAL (ใช้ NUMERIC(15, 4)), และปฏิเสธการใช้ไลบรารีที่ขัดต่อสถาปัตยกรรม
  - กำหนดให้ใช้ไอคอนจาก `@expo/vector-icons` (Ionicons)

### การเปรียบเทียบข้อมูลในเอกสารกับโค้ดจริง
| หัวข้อ | ข้อมูลในเอกสาร (BRIEF / AGENTS) | สภาพโค้ดจริง | ผลการตรวจสอบ |
| :--- | :--- | :--- | :--- |
| สแตกหลัก | Expo SDK 57, React 19, RN 0.86 | ตรงตาม `package.json` | สอดคล้องกัน |
| การจัดเก็บข้อมูล | Supabase PostgreSQL + RLS | มีสคริปต์ Migration ใน `supabase/migrations/` | สอดคล้องกัน |
| API กองทุนรวม (SEC) | SEC Open API ผ่าน Supabase Edge Function `stock-proxy` | ใน commit `df926fe` ได้ปรับให้เรียกผ่าน Edge Function ปิดกั้นการเรียกตรงจากไคลเอนต์แล้ว | สอดคล้องกัน |
| แพลตฟอร์ม | Android (Expo Go / Production APK) + Web | กำหนด `app.json` และแพ็กเกจรองรับทั้งสองระบบ | สอดคล้องกัน |
| ข้อมูลผู้พัฒนา | ไม่ระบุ | ใน Git มีเพียง `CAMT` / `lenovo` | **ต้องตรวจสอบ** (ต้องระบุชื่อผู้ถือลิขสิทธิ์จริง) |

---

## 2. สแตกและ Dependency (Stack & Dependency Audit)

### ข้อมูลสแตก
- **เฟรมเวิร์ก**: React Native 0.86.3 ภายใต้ Expo SDK 57.0.23
- **ภาษา**: TypeScript 6.0.3
- **ตัวจัดการแพ็กเกจ**: npm (`package.json`, `package-lock.json`)

### ตารางตรวจสอบ Direct Dependencies
ตรวจสอบจาก `package.json` และไฟล์ `package.json` ภายใน `node_modules`:

| ชื่อแพ็กเกจ | เวอร์ชันที่ระบุ | เวอร์ชันที่ติดตั้งจริง | License | ความเข้ากันได้กับ MIT | หมายเหตุ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `@expo/metro-runtime` | `^57.0.15` | `57.0.15` | MIT | เข้ากันได้ (Compatible) | รันไทม์ Metro Web |
| `@expo/vector-icons` | `^15.0.2` | `15.1.1` | MIT | เข้ากันได้ (Compatible) | รวมชุดไอคอน Ionicons (MIT) |
| `@react-native-async-storage/async-storage` | `2.2.0` | `2.2.0` | MIT | เข้ากันได้ (Compatible) | จัดเก็บแคชและค่าในเครื่อง |
| `@supabase/supabase-js` | `^2.116.0` | `2.116.0` | MIT | เข้ากันได้ (Compatible) | ไคลเอนต์เชื่อมต่อฐานข้อมูล |
| `expo` | `~57.0.23` | `57.0.23` | MIT | เข้ากันได้ (Compatible) | Expo Core SDK |
| `expo-document-picker` | `~57.0.2` | `57.0.2` | MIT | เข้ากันได้ (Compatible) | เลือกไฟล์ CSV สำหรับ Import |
| `expo-font` | `~57.0.4` | `57.0.4` | MIT | เข้ากันได้ (Compatible) | จัดการฟอนต์ระบบ |
| `expo-linear-gradient` | `~57.0.2` | `57.0.2` | MIT | เข้ากันได้ (Compatible) | แสดงผลกราฟิก Gradient |
| `expo-notifications` | `~57.0.19` | `57.0.19` | MIT | เข้ากันได้ (Compatible) | ระบบแจ้งเตือน XD วันปันผล |
| `expo-status-bar` | `~57.0.1` | `57.0.1` | MIT | เข้ากันได้ (Compatible) | ควบคุมแถบสถานะ |
| `papaparse` | `^5.7.0` | `5.7.0` | MIT | เข้ากันได้ (Compatible) | ตัวประมวลผลไฟล์ CSV |
| `react` | `19.2.3` | `19.2.3` | MIT | เข้ากันได้ (Compatible) | UI Library |
| `react-dom` | `^19.2.3` | `19.2.3` | MIT | เข้ากันได้ (Compatible) | สำหรับ Web Platform |
| `react-native` | `0.86.3` | `0.86.3` | MIT | เข้ากันได้ (Compatible) | React Native Core |
| `react-native-gifted-charts` | `^1.4.78` | `1.4.78` | MIT | เข้ากันได้ (Compatible) | กราฟเส้นและกราฟแท่ง |
| `react-native-safe-area-context` | `~5.7.0` | `5.7.0` | MIT | เข้ากันได้ (Compatible) | จัดการ Safe Area หน้าจอ |
| `react-native-svg` | `15.15.4` | `15.15.4` | MIT | เข้ากันได้ (Compatible) | เรนเดอร์ Vector SVG |
| `react-native-web` | `^0.21.2` | `0.21.2` | MIT | เข้ากันได้ (Compatible) | คอมไพล์รันบนเว็บเบราว์เซอร์ |
| `@expo/ngrok` *(dev)* | `^4.1.3` | `4.1.3` | BSD-2-Clause | เข้ากันได้ (Compatible) | เครื่องมือ Tunnel ตอน Dev |
| `@types/papaparse` *(dev)* | `^5.5.2` | `5.5.2` | MIT | เข้ากันได้ (Compatible) | Type definitions |
| `@types/react` *(dev)* | `~19.2.2` | `19.2.18` | MIT | เข้ากันได้ (Compatible) | Type definitions |
| `typescript` *(dev)* | `~6.0.3` | `6.0.3` | Apache-2.0 | เข้ากันได้ (Compatible) | คอมไพเลอร์ TypeScript |

### การตรวจสอบ Transitive Dependencies (การพึ่งพาทางอ้อม)
จากการสแกนแพ็กเกจทั้งหมดใน `package-lock.json` (มากกว่า 550 รายการ):
- **MIT**: 471 แพ็กเกจ
- **ISC**: 33 แพ็กเกจ (เข้ากันได้กับ MIT)
- **BSD-2-Clause / BSD-3-Clause**: 22 แพ็กเกจ (เข้ากันได้กับ MIT)
- **Apache-2.0**: 12 แพ็กเกจ (เข้ากันได้กับ MIT)
- **BlueOak-1.0.0 / 0BSD / Unlicense / CC0-1.0**: 11 แพ็กเกจ (เข้ากันได้กับ MIT)
- **MPL-2.0 (Mozilla Public License 2.0)**: 12 รายการ ได้แก่ `lightningcss` และแพลตฟอร์มไบนารีของมัน ซึ่งถูกเรียกใช้ตอน build time โดย Metro Bundler เท่านั้น ลิขสิทธิ์ MPL-2.0 เป็น Weak Copyleft ระดับไฟล์ และไม่มีการแก้ไขซอร์สโค้ดของ lightningcss จึงสามารถใช้งานร่วมกับโครงการ MIT ได้โดยไม่มีผลกระทบต่อสิทธิ์ของโค้ดหลัก
- **รายการที่ต้องตรวจสอบเป็นพิเศษ**:
  1. `node-forge` (v1.4.0): ระบุ License เป็น `(BSD-3-Clause OR GPL-2.0)` เป็น Dual-license โดยโครงการสามารถเลือกปฏิบัติตาม **BSD-3-Clause** ซึ่งเป็น Permissive License เข้ากันได้สมบูรณ์กับ MIT โดยไม่ทำให้โค้ดตกอยู่ใต้เงื่อนไข Copyleft ของ GPL
  2. `@expo/ngrok-bin*` (v2.3.41 / v2.3.42): ระบุ License เป็น `UNKNOWN` แต่เป็น devDependency สำหรับการรันท่อสัญญาณจำลองตอนทดสอบเครือข่าย (`--tunnel`) ไม่ถูกบันเดิลรวมเข้าไปใน Production Build (APK / AAB / Web Bundle) จึงไม่มีผลต่อ License ของแอปที่แจกจ่ายจริง

---

## 3. Asset ภายนอก (External Assets Audit)

จากการค้นหาและตรวจสอบไฟล์สื่อทั้งหมดในโปรเจกต์:

| ไฟล์ Asset | พาธ | แหล่งที่มา / ที่พบ | License / เงื่อนไข | สถานะ |
| :--- | :--- | :--- | :--- | :--- |
| `icon.png` | `assets/icon.png` | มาพร้อมกับเทมเพลต `create-expo-app` (commit `bfde910`) | MIT (Expo Default Asset) | **ต้องตรวจสอบ**: ควรเปลี่ยนเป็นโลโก้ของแอปจริงก่อนเผยแพร่บน Google Play |
| `android-icon-foreground.png` | `assets/android-icon-foreground.png` | เทมเพลต `create-expo-app` | MIT (Expo) | **ต้องตรวจสอบ**: ควรเปลี่ยนให้เข้ากับโลโก้แอปจริง |
| `android-icon-background.png` | `assets/android-icon-background.png` | เทมเพลต `create-expo-app` | MIT (Expo) | เข้ากันได้ |
| `android-icon-monochrome.png` | `assets/android-icon-monochrome.png` | เทมเพลต `create-expo-app` | MIT (Expo) | เข้ากันได้ |
| `splash-icon.png` | `assets/splash-icon.png` | เทมเพลต `create-expo-app` | MIT (Expo) | เข้ากันได้ |
| `favicon.png` | `assets/favicon.png` | เทมเพลต `create-expo-app` | MIT (Expo) | เข้ากันได้ |
| `expo-qr.png` | `assets/expo-qr.png` | เพิ่มใน commit `ab85bfe` | **ต้องตรวจสอบ**: ไม่พบการเรียกใช้งานในโค้ด | ปลอดภัย (ไม่ได้ใช้ในแอป) |
| ไอคอน Ionicons | เรียกผ่าน `@expo/vector-icons` | Ionicons (Ionic Framework) | MIT License | เข้ากันได้สมบูรณ์ |
| ฟอนต์ (Fonts) | ใช้ฟอนต์มาตรฐานของระบบปฏิบัติการ (System Fonts) | ระบบปฏิบัติการ (Android / iOS / Web) | ไม่มีไฟล์ฟอนต์ภายนอก (.ttf/.otf) อยู่ในเครื่อง | เข้ากันได้สมบูรณ์ |
| สื่ออื่นๆ (เสียง, วิดีโอ, Lottie) | ไม่มีการใช้งาน | - | - | ไม่มี |

### โค้ดหรือข้อความที่อาจคัดลอกมาจากแหล่งอื่น
- `scripts/patch-expo-notifications.js`: สคริปต์แก้ไขบั๊กภายใน `expo-notifications` บน Expo Go (Android TopicSubscriptionModule) เป็นแพตช์ขนาดสั้นเพื่อแก้ไขปัญหา Native Module ในโหมดพัฒนา
- การคำนวณภาษีดอกเบี้ยเงินฝากใน `src/services/taxService.ts` และการคำนวณเงินปันผลใน `src/services/stockService.ts`: เขียนขึ้นตามเกณฑ์ภาษีของกรมสรรพากรแห่งประเทศไทยและสูตรการเงินสากล ไม่พบการคัดลอกโค้ดขนาดใหญ่ที่มีลิขสิทธิ์ผูกพัน

---

## 4. บริการภายนอกและ API (External Services & APIs)

โปรเจกต์มีการเรียกใช้บริการภายนอก 3 ส่วนหลัก ดังนี้:

### 1. Supabase (Backend as a Service)
- **บริการที่ใช้**: PostgreSQL Database, Supabase Authentication, Supabase Edge Functions (`stock-proxy`)
- **เงื่อนไขและข้อกำหนด**:
  - การจัดเก็บข้อมูลผู้ใช้ต้องสอดคล้องกับข้อกำหนดการคุ้มครองข้อมูลส่วนบุคคล (PDPA / GDPR)
  - ต้องมี Privacy Policy ระบุว่ามีการส่งและจัดเก็บอีเมล/รหัสผ่านและข้อมูลพอร์ตไปยังเซิร์ฟเวอร์คลาวด์ของ Supabase

### 2. SEC Open API (สำนักงานคณะกรรมการกำกับหลักทรัพย์และตลาดหลักทรัพย์ - ก.ล.ต. ประเทศไทย)
- **บริการที่ใช้**: ดึงข้อมูลราคา NAV รายวัน, ประวัติการจ่ายเงินปันผล และข้อมูลกองทุนรวมไทย
- **เส้นทาง**: ถูกเรียกผ่าน Supabase Edge Function `stock-proxy` (เซิร์ฟเวอร์เป็นผู้เรียกโดยใช้ Secret API Key)
- **เงื่อนไขและข้อกำหนด**:
  - ใช้งานตามข้อกำหนดการใช้งานข้อมูลเปิดของสำนักงาน ก.ล.ต. (Non-commercial informational use)
  - **ข้อกำหนด Attribution**: ต้องระบุในหน้า "เกี่ยวกับ" หรือเอกสาร `README.md` ให้เครดิตระบุว่า "ข้อมูลกองทุนรวมได้รับความอนุเคราะห์จากสำนักงานคณะกรรมการกำกับหลักทรัพย์และตลาดหลักทรัพย์ (ก.ล.ต.)"

### 3. Yahoo Finance (Unofficial Public Query API)
- **บริการที่ใช้**: ค้นหาชื่อหุ้น (Search Autocomplete), ข้อมูลราคาปิดและราคาประวัติศาสตร์ (Chart Data), ประวัติการจ่ายเงินปันผลของหุ้นสหรัฐฯ/ไทย, ข้อมูลแตกพาร์ (Stock Split), ข้อมูลดัชนีเปรียบเทียบ (S&P 500, SET Index, NASDAQ) และอัตราแลกเปลี่ยนค่าเงิน USD/THB (`USDTHB=X`)
- **เส้นทาง**: เรียกผ่าน Edge Function และมี Direct HTTP Fallback
- **เงื่อนไขและข้อกำหนด**:
  - API ดังกล่าวเป็น Endpoint สาธารณะของ Yahoo Finance ที่ไม่มีข้อตกลง SLA เป็นทางการ และมีข้อกำหนดการใช้งานเพื่อส่วนตัว/การศึกษา (Personal / Non-commercial use)
  - **ข้อกำหนด Disclaimer**: ต้องระบุข้อความปฏิเสธความรับผิดชอบอย่างชัดเจนในแอปและ README ว่า "ข้อมูลราคาตลาดและเงินปันผลมีวัตถุประสงค์เพื่อให้ข้อมูลเพื่อการติดตามพอร์ตส่วนบุคคลเท่านั้น ไม่ใช่ข้อมูลสำหรับการซื้อขายหลักทรัพย์แบบเรียลไทม์ และไม่ใช่คำแนะนำทางการเงินหรือการลงทุน"

---

## 5. ข้อมูลผู้ใช้และ Privacy (User Privacy Audit)

### ข้อมูลที่แอปเก็บรวบรวมและส่งออกภายนอก
จากการตรวจสอบโค้ดการทำงานจริง:
1. **ข้อมูลการยืนยันตัวตน (Authentication Data)**:
   - อีเมล (Email) และรหัสผ่าน (Password ผ่านการ Hash โดย Supabase)
   - ชื่อที่ใช้แสดงผล (Display Name - เก็บใน AsyncStorage และ Supabase User Metadata)
2. **ข้อมูลทางการเงินและพอร์ตการลงทุน (Financial Portfolio Data)**:
   - รายการสินทรัพย์ (ชื่อย่อหุ้น, ชื่อย่อกองทุน, เงินฝากธนาคาร)
   - ข้อมูลธุรกรรม (จำนวนหุ้น/หน่วยลงทุน, ราคาต้นทุน, วันที่ซื้อขาย, อัตราแลกเปลี่ยน)
   - ข้อมูลการปรับแต่งเงินปันผลและเป้าหมายรายได้พาสซีฟ (`@mydividend_monthly_goal`)
3. **ข้อมูลในเครื่อง (Local Storage / AsyncStorage)**:
   - แคชพอร์ตการลงทุนออฟไลน์ (`@my_dividend_portfolio_cache`)
   - สถานะโหมดซ่อนตัวเลข (`@mydividend_privacy_mode`)
   - แคชอัตราแลกเปลี่ยนและวันที่ซิงก์ราคาสุดท้าย
4. **ข้อมูลที่ไม่ถูกเก็บรวบรวม (Confirmed Not Collected)**:
   - ไม่มีการเก็บตำแหน่ง (No Location Tracking)
   - ไม่มีการเปิดใช้งานกล้อง ไมโครโฟน หรือรายชื่อติดต่อ (No Camera/Microphone/Contacts)
   - ไม่มีการติดตั้ง SDK บุคคลที่สามสำหรับโฆษณาหรือวิเคราะห์พฤติกรรม (No Google Analytics, Firebase, Sentry, Mixpanel, AdMob)
   - ไม่มีการเก็บ Advertising ID (AAID)

### สิทธิ์การทำงานบนอุปกรณ์ (Android Permissions ใน `app.json`)
- `RECEIVE_BOOT_COMPLETED`: สำหรับลงทะเบียนการแจ้งเตือนวันขึ้นเครื่องหมาย XD ใหม่อัตโนมัติเมื่อเปิดเครื่อง
- `POST_NOTIFICATIONS`: สิทธิ์ส่งการแจ้งเตือนเตือนเงินปันผลบนหน้าจอ
- `VIBRATE`: สั่นเตือนพร้อมการแจ้งเตือน
- `SCHEDULE_EXACT_ALARM`: ตั้งเวลาแจ้งเตือนล่วงหน้าตามวัน XD ที่แน่นอน

### ข้อกำหนดด้าน Privacy และ Google Play Data Safety
1. **ความจำเป็นของ Privacy Policy**: **จำเป็นต้องมีอย่างยิ่ง (Mandatory)** เนื่องจากแอปมีการสร้างบัญชีผู้ใช้และจัดเก็บข้อมูลพอร์ตการลงทุนส่วนบุคคลขึ้นสู่คลาวด์ และ Google Play บังคับให้แอปที่มีระบบล็อกอินต้องมีลิงก์ Privacy Policy สาธารณะ
2. **ข้อมูลที่ต้องระบุใน Google Play Data Safety Form**:
   - **Personal info**: Email address (App functionality, Account management)
   - **Financial info**: Other financial info (User-provided investment portfolio & dividend tracking records)
   - **Data sharing**: ไม่มีการแชร์ข้อมูลให้บุคคลที่สาม (No third-party data sharing)
   - **Security practices**: ข้อมูลถูกส่งผ่านการเข้ารหัส HTTPS/TLS ตลอดเส้นทาง
   - **Account Deletion**: ต้องมีแนวทางให้ผู้ใช้สามารถขอลบบัญชีและข้อมูลส่วนตัวได้

---

## 6. ความปลอดภัยและไฟล์ลับ (Security & Secrets Audit)

### การตรวจสอบไฟล์และความครอบคลุมของ `.gitignore`
- ไฟล์ `.gitignore` ปัจจุบันมีระบุ:
  - `.env*` และยกเว้น `!.env.example`
  - `node_modules/`, `.expo/`, `dist/`, `web-build/`
  - `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `*.mobileprovision`
  - `.git_backup_security/`
  - `supabase/.temp/`

### ผลการสแกนความปลอดภัยใน Repository และ Git History
*(หมายเหตุ: ตามกฎความปลอดภัย ไม่แสดงค่า Key หรือ Token จริงในรายงาน)*

| รายการที่พบ | ตำแหน่งไฟล์และบรรทัด | ระดับความเสี่ยง | คำแนะนำ |
| :--- | :--- | :--- | :--- |
| รหัสผ่านสำรองสำหรับบัญชีเดโม | `src/services/authService.ts:9` | ต่ำ (เนื่องจากเป็นบัญชีตัวอย่างสาธารณะ `demo@mydividend.app`) | แนะนำให้ย้ายค่ารหัสผ่านไปไว้ใน `.env` โดยไม่มี fallback string ในโค้ด |
| ค่าตัวอย่างใน Environment Example | `.env.example:1-4` | ไม่มี (เป็นเพียงข้อความจำลอง Placeholder) | ปลอดภัย |
| Supabase URL สาธารณะ | `src/services/proxyClient.ts:4`, `BRIEF.md:29` | ต่ำ (Supabase URL เป็นค่าที่เปิดเผยฝั่งไคลเอนต์ได้ร่วมกับ Anon Key ภายใต้การควบคุมของ RLS) | ควรใช้ผ่าน `process.env.EXPO_PUBLIC_SUPABASE_URL` เป็นหลัก |
| ประวัติ Git History ย้อนหลัง | ไม่พบไฟล์ `.env`, `.jks`, `.keystore`, หรือ `google-services.json` ถูกคอมมิตลงใน Git | ปลอดภัย | `.gitignore` ทำงานครอบคลุม |
| คีย์ก.ล.ต. (SEC API Key) | ถูกตัดออกจากซอร์สโค้ดและส่งไปจัดเก็บใน Supabase Edge Function Secret สำเร็จตั้งแต่ commit `df926fe` | ปลอดภัย | ซอร์สโค้ดฝั่งแอปไม่มี SEC Key หลุด |

---

## 7. ไฟล์ License และเอกสารที่มีอยู่แล้ว (Existing Legal Files Audit)

| ไฟล์ | สถานะปัจจุบัน | ความถูกต้องและข้อเสนอแนะ |
| :--- | :--- | :--- |
| `LICENSE` (ที่ root) | **มีอยู่แล้ว** | **ไม่ถูกต้อง**: ปัจจุบันระบุเป็น `Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)` ซึ่งเป็นไฟล์ตั้งต้นที่ Expo สร้างมา ยังไม่ได้เปลี่ยนเป็นชื่อผู้พัฒนาและปี 2026 |
| `README.md` | **ยังไม่มี** | ต้องสร้างขึ้นใหม่ในระยะที่ 2 โดยมีหัวข้อ License, Credits, และ Disclaimer |
| `THIRD_PARTY_LICENSES.md` | **ยังไม่มี** | ต้องสร้างขึ้นใหม่ในระยะที่ 2 เพื่อแสดงรายชื่อไลบรารีโอเพนซอร์สและลิขสิทธิ์ |
| `PRIVACY_POLICY.md` | **ยังไม่มี** | ต้องร่างขึ้นใหม่ในระยะที่ 2 เพื่อรองรับข้อกำหนดของ Google Play |
| License Header ในไฟล์โค้ด | **ไม่มีเลย** | **ถูกต้อง**: ตรงตามข้อกำหนดของโปรเจกต์ที่ห้ามใส่ License Header ในแต่ละไฟล์ |
| ช่อง `license` ใน `package.json` | ปัจจุบันระบุ `"private": true` และไม่มีฟิลด์ `"license"` | ในระยะที่ 2 หากต้องการเปิดเป็น Open Source แนะนำให้กำหนด `"license": "MIT"` |

---

## 8. ข้อกำหนดของ Google Play (Google Play Store Readiness)

หากต้องการนำขึ้น Google Play Console จริง ต้องจัดเตรียมสิ่งต่อไปนี้:

1. **Privacy Policy URL**:
   - Google Play บังคับให้ใส่ URL ภายนอกที่เปิดดูผ่านเบราว์เซอร์ได้ตลอดเวลา
   - แนวทางแก้ไข: นำเนื้อหาจาก `PRIVACY_POLICY.md` ไปโฮสต์บน **GitHub Pages** ของ Repository โครงการ (เช่น `https://[username].github.io/my-dividend/privacy-policy`)
2. **สิทธิ์ `SCHEDULE_EXACT_ALARM`**:
   - Google Play มีนโยบายเข้มงวดเรื่อง `SCHEDULE_EXACT_ALARM` บน Android 13+ (ต้องชี้แจงว่าใช้แจ้งเตือนวัน XD ตามปฏิทินปันผลล่วงหน้าเพื่อผลประโยชน์ของนักลงทุน) หาก Play Console ไม่อนุมัติ อาจต้องปรับไปใช้ Inexact Alarm
3. **App Content Declarations**:
   - หมวดหมู่: Personal Finance / Tools (ไม่ใช่สินเชื่อ/ไม่ใช่โบรกเกอร์)
   - ประกาศว่าไม่มีโฆษณา (No Ads)
   - กลุ่มเป้าหมาย: อายุ 18 ปีขึ้นไป
4. **Store Listing Assets**:
   - App Icon ขนาด 512x512 px (PNG 32-bit ไม่เกิน 1024KB)
   - Feature Graphic ขนาด 1024x500 px (ยังไม่มีในระบบ)
   - ภาพหน้าจอแอป (Phone Screenshots) อย่างน้อย 2 รูป อัตราส่วน 16:9 หรือ 9:16 (ยังไม่มีในระบบ)
   - คำอธิบายสั้น (Short description สูงสุด 80 ตัวอักษร) และคำอธิบายเต็ม (Full description สูงสุด 4,000 ตัวอักษร)

---

## 9. สรุปผลการตรวจสอบ (Audit Summary & Action Plan)

### ปัญหาที่ต้องแก้ไข/ระวังเป็นพิเศษ
1. **ไฟล์ `LICENSE` ปัจจุบันยังเป็นของ Expo (650 Industries, Inc.)**: ต้องแทนที่ด้วยชื่อจริงของผู้ถือลิขสิทธิ์และปี 2026
2. **ยังไม่มีชื่อผู้พัฒนาจริงในโปรเจกต์**: ต้องสอบถามชื่อ-นามสกุลจริง หรือนามแฝงทางการ เพื่อนำไประบุใน `LICENSE`
3. **ยังไม่มีหน้าหรือเอกสาร Privacy Policy สาธารณะ**: เป็นเงื่อนไขบังคับของ Google Play
4. **ข้อความ Disclaimer เรื่องข้อมูลการลงทุน**: ข้อมูลจาก Yahoo Finance และ SEC ต้องมีข้อความระบุว่าไม่ใช่คำแนะนำการลงทุนและเพื่อการศึกษาเท่านั้น

### รายการ "ต้องตรวจสอบ" ทั้งหมด (All Items Needing User Decision)
1. **ชื่อและนามสกุลของผู้พัฒนา**: กำหนดเป็น DiaHyeon [เรียบร้อย]
2. **ไฟล์ไอคอนแอป (`assets/icon.png`)**: แปลงและติดตั้งรูปต้นอ่อนโคลเวอร์ (Crayon Sprout) ครบทุกขนาด [เรียบร้อย]
3. **อีเมลติดต่อ Privacy**: กำหนดเป็น `mydividend.support@gmail.com` [เรียบร้อย]
4. **ลิงก์สำหรับ Privacy Policy**: นำเนื้อหาใน `PRIVACY_POLICY.md` ไปขึ้น GitHub Pages ก่อนส่งแอปเข้า Play Console

### รายการไฟล์ที่จะดำเนินการในระยะที่ 2 (หลังได้รับอนุมัติ)
1. เขียนทับไฟล์ [LICENSE](file:///c:/Users/lenovo/Documents/My%20dividend/LICENSE) ที่ root เป็น MIT เต็มรูปแบบ: `Copyright (c) 2026 [ชื่อผู้พัฒนา]`
2. สร้างไฟล์ `README.md` ที่ root เพิ่มหัวข้อ License, Credits, และ Investment Disclaimer
3. สร้างไฟล์ `THIRD_PARTY_LICENSES.md` ที่ root รวบรวมข้อมูลลิขสิทธิ์ของ Dependencies ทั้งหมด
4. ร่างไฟล์ `PRIVACY_POLICY.md` ที่ root ตามข้อมูลการใช้งานจริงของแอป พร้อมคำแนะนำการโฮสต์บน GitHub Pages
5. เพิ่มกฎข้อสั้น ๆ ท้าย [AGENTS.md](file:///c:/Users/lenovo/Documents/My%20dividend/AGENTS.md): `"ห้ามเพิ่ม license header ในไฟล์โค้ด มีแค่ไฟล์ LICENSE ที่ root"` (แก้ไขเฉพาะบรรทัดนี้โดยไม่แตะส่วนอื่น)
6. อัปเดต Checklist ด้านล่างใน `LICENSE_AUDIT.md` ให้เป็นสถานะเรียบร้อย

---

### Checklist สถานะรวม
 
- [x] 1. สร้าง/แก้ไขไฟล์ `LICENSE` ที่ root เป็น MIT ตัวเต็ม พร้อมระบุชื่อจริงและปี 2026 (DiaHyeon)
- [x] 2. สร้างไฟล์ `README.md` ที่ root พร้อมหัวข้อ License, Credits (SEC / Yahoo / Expo / Ionicons) และ Investment Disclaimer
- [x] 3. สร้างไฟล์ `THIRD_PARTY_LICENSES.md` รวบรวมรายการ Open Source Libraries
- [x] 4. สร้างไฟล์ `PRIVACY_POLICY.md` ที่ครอบคลุมการทำงานจริง พร้อมคู่มือการนำไปขึ้น GitHub Pages
- [x] 5. เพิ่มกฎสั้น ๆ ท้าย `AGENTS.md` เรื่องห้ามเพิ่ม license header ในไฟล์โค้ด
- [x] 6. อัปเดตสถานะ Checklist ใน `LICENSE_AUDIT.md` ให้สะท้อนผลการดำเนินงานจริง
