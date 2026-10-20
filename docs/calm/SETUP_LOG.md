# SETUP_LOG.md — บันทึกขั้นตอนการตั้งค่าธีม Calm Mint อย่างละเอียด

> **เอกสารบันทึกการทำงาน (Audit & Setup Log)**  
> สร้างขึ้นเมื่อ: 20 ตุลาคม 2026  
> Branch ทำงาน: `feat/calm-theme` (แยกออกมาจาก `main`)  
> สถานะ: ขั้นตอนที่ 0 (Setup & Theme Kit) เสร็จสมบูรณ์ 100%

---

## 1. การสร้าง Branch ทดลอง (`feat/calm-theme`)

- **คำสั่ง**: `git checkout -b feat/calm-theme`
- **เป้าหมาย**: เพื่อแยกสภาพแวดล้อมการทำงานออกมาทดลองปรับแต่งหน้าตาโดยไม่แตะต้อง branch `main`
- **ผลลัพธ์**: 
  - โค้ดใน `main` ยังคงเป็นเวอร์ชันเดิม 100% ปลอดภัย ไม่มีความเสี่ยงที่แอปเดิมจะเสียหาย
  - การแก้ไขทั้งหมดในขั้นตอนนี้และขั้นตอน 2A–2H จะเกิดขึ้นภายใน branch นี้เท่านั้น
  - สามารถสลับกลับ `main` ได้ตลอดเวลาด้วยคำสั่ง `git checkout main`

---

## 2. การติดตั้งแพ็กเกจ Google Fonts สำหรับธีม Calm

- **คำสั่ง**: `npx expo install @expo-google-fonts/bricolage-grotesque @expo-google-fonts/jetbrains-mono @expo-google-fonts/noto-sans-thai`
- **แพ็กเกจที่ติดตั้งเพิ่มใน `package.json`**:
  1. `@expo-google-fonts/bricolage-grotesque` (ฟอนต์ Display สำหรับตัวเลขอังกฤษและหัวเรื่อง)
  2. `@expo-google-fonts/jetbrains-mono` (ฟอนต์ Monospace สำหรับรหัสหุ้น, สถิติ, และตัวเลขตาราง)
  3. `@expo-google-fonts/noto-sans-thai` (ฟอนต์สำหรับภาษาไทยทั้งหมด)
- **การตรวจสอบความถูกต้องของ Export Names** ใน `node_modules`:
  - `node_modules/@expo-google-fonts/bricolage-grotesque/index.d.ts` -> พบ `BricolageGrotesque_800ExtraBold` ✅
  - `node_modules/@expo-google-fonts/jetbrains-mono/index.d.ts` -> พบ `JetBrainsMono_500Medium`, `JetBrainsMono_700Bold` ✅
  - `node_modules/@expo-google-fonts/noto-sans-thai/index.d.ts` -> พบ `NotoSansThai_500Medium`, `NotoSansThai_700Bold` ✅

---

## 3. การนำเข้าชุด Theme Kit (`src/theme/` และ `src/components/ui/`)

ทำการคัดลอกจาก `calm-bundle/calm-kit/src/` เข้ามาสู่โปรเจกต์หลักที่ `src/`:

### 3.1 `src/theme/`
- **`tokens.ts`**:
  - นิยามชุดสีหลัก Calm Mint (`colors.bg`, `colors.surface`, `colors.ink`, `colors.accent`, `colors.shadow`, `colors.track`, `colors.projected` ฯลฯ)
  - กำหนดชุดสีชาร์ต (`chartColors.stocks`, `chartColors.funds`, `chartColors.cash`)
  - กำหนดรัศมีความมน (`radii`), ความหนาขอบ (`borderWidth: 2`), เงาแบบแข็ง (`shadowOffset`)
  - ฟังก์ชัน `trend(value, isDark)` สำหรับสร้างสีและ glyph `▲`/`▼`
- **`useCalmFonts.ts`**:
  - Hook เรียกใช้งาน `useFonts` จาก `expo-font` เพื่อโหลดฟอนต์ 3 ตระกูล

### 3.2 `src/components/ui/` (8 คอมโพเนนต์ UI สำเร็จรูป)
1. **`Card.tsx`**: กรอบการ์ดพร้อมเงาแข็ง (Hard Shadow)
2. **`CalmText.tsx`**: คอมโพเนนต์ข้อความที่เลือกรองรับฟอนต์ Display/Mono/Thai อัตโนมัติ
3. **`Pill.tsx`**: ป้ายสถานะ/ชิป มี variant: `ink`, `accent`, `outline`, `outlineDark`, `lossDark`, `dashed`
4. **`CapsuleButton.tsx`**: ปุ่มกดทรงแคปซูลขอบหนา 2px มีเงา
5. **`DashedDivider.tsx`**: เส้นประคั่นรายการสไตล์ Calm
6. **`HardShadow.tsx`**: ระบบเรนเดอร์เงาเหลี่ยมแบบไม่เบลอ (Hard drop shadow)
7. **`SheetFrame.tsx`**: กรอบ Modal / Bottom Sheet พร้อมหัวข้อและปุ่มปิด
8. **`index.ts`**: Barrel export ให้เรียกใช้งานสะดวก

---

## 4. การปรับแต่งเทคนิคพิเศษใน `CalmText.tsx` (การยกเว้นเครื่องหมาย `฿`)

- **ตำแหน่ง**: `src/components/ui/CalmText.tsx` บรรทัดที่ 8
- **โค้ดที่ปรับ**:
  ```typescript
  const THAI = /[\u0E00-\u0E3E\u0E40-\u0E7F]/;
  ```
- **เหตุผลความจำเป็น**:
  - รหัส Unicode ภาษาไทยคือช่วง `\u0E00` ถึง `\u0E7F`
  - โดยตัว `\u0E3F` คือสัญลักษณ์เงินบาท **`฿`**
  - หากใช้ regex เดิม `[\u0E00-\u0E7F]` ตัว `฿` จะทำให้ฟังก์ชัน `hasThai()` ตรวจพบว่าเป็นภาษาไทย ส่งผลให้ตัวเลขยอดเงินทั้งหมด (เช่น `฿12,345,678.90`) ถูกลดทอนไปใช้ฟอนต์ Noto Sans Thai แทนที่จะเป็นฟอนต์ Bricolage Grotesque หรือ JetBrains Mono
  - การเปลี่ยนเป็น `[\u0E00-\u0E3E\u0E40-\u0E7F]` คือการ **เว้นข้าม `\u0E3F` (฿)** ทำให้ตัวเลขทางการเงินยังคงใช้ฟอนต์ Display สวยงามตามดีไซน์ ในขณะที่ข้อความภาษาไทยจริงยังคงสลับฟอนต์ได้อย่างแม่นยำ

---

## 5. การปรับปรุง App.tsx

- ทำการต่อสาย Hook `useCalmFonts()` เพื่อโหลดฟอนต์ทั้ง 3 ตระกูลก่อนเรนเดอร์ UI
- เพิ่ม `if (!fontsLoaded) return null;` เพื่อให้หน้าจอคง Splash Screen ไว้จนกว่าฟอนต์จะโหลดเสร็จสมบูรณ์
- **ไม่มีการเปลี่ยนแปลงโครงสร้าง UI เดิมหรือสไตล์ของหน้าจอในขั้นตอนนี้**

---

## 6. ผลการทดสอบและตรวจสอบความปลอดภัย (Verification & Tests)

1. **TypeScript Typecheck**:
   - คำสั่ง: `npx tsc --noEmit`
   - ผลลัพธ์: **0 errors** (ผ่านฉลุย 100%)
2. **ชุดทดสอบระบบ (Full Test Suite)**:
   - คำสั่ง: `npm test`
   - ผลลัพธ์: **ผ่านครบทุกชุด 83/83 เคส (0 FAILED)**
     - Unit Tests: 39/39 ผ่าน
     - Security & Penetration Tests: 27/27 ผ่าน
     - Real-World Performance Scenarios: 17/17 ผ่าน

---

## 7. ข้อมูลการเชื่อมต่อ Expo Go (Live Development Server)

- **สถานะ**: ทำงานอยู่ (Tunnel Mode Online)
- **URL สำหรับ Expo Go**:
  ```text
  exp://ig6fuj8-dia0-8081.exp.direct
  ```
- **วิธีเปิดบนมือถือ**:
  1. เปิดแอป **Expo Go** บนมือถือ
  2. เลือก **Enter URL manually**
  3. ใส่ URL: `exp://ig6fuj8-dia0-8081.exp.direct` แล้วกด **Connect**
  *(หรือในบางรุ่นจะพบโปรเจกต์ขึ้นในแถบ Recently in Development โดยอัตโนมัติ)*

---

## 8. ผลการดำเนินการขั้นตอนที่ 2A (Hero Net Worth & Header Greeting)

- **ไฟล์ที่แก้ไข**:
  1. `src/components/HeroNetWorthCard.tsx`:
     - ปรับกรอบเป็น `<Card variant="dark" shadow="lg" padding={18}>`
     - ปรับตัวเลข Net Worth เป็น `<CalmText variant="display" size={36}>`
     - ป้าย P/L เป็น `<Pill size="md">` (กำไร = accent glyph, ขาดทุน = lossDark glyph, เท่าทุน 0 = accent ไม่มี glyph)
     - ไอคอนตา 2 สถานะ: เปิด privacy = `colors.accent`, ปิด = `colors.surface`
     - กล่อง yield และกระแสเงินสดรับคาดการณ์/ปี ใช้ `colors.projected`
     - ไอคอน cash ใช้ `colors.accent`
     - เส้นคั่นแนวนอนใช้ `<DashedDivider color={colors.accent} />`
     - สถิติด้านล่าง (ต้นทุนรวม, P/L, ผลตอบแทนรวม) ใช้ Calm typography และสีจาก `trend()`
     - คลีน hex code ใน style block ของ HeroNetWorthCard ออกทั้งหมด 100%
  2. `src/screens/Dashboard.tsx`:
     - พื้นหลังหน้าจอเปลี่ยนเป็น `colors.bg` (`#EAF3EE`)
     - ข้อความหัวเรื่องและคำทักทายใช้ `<CalmText>`
     - ปุ่ม Logout: พื้นหลัง `colors.surface`, ขอบ `colors.ink` หนา 2, รัศมี 999, ขนาด 46x46, ไอคอนสี `colors.lossOnLight`
- **การทดสอบความปลอดภัย**:
  - `npx tsc --noEmit`: 0 error
  - `npm test`: 83/83 ผ่านทั้งหมด

---

## 9. ขั้นตอนต่อไป

พร้อมเข้าสู่ **ขั้นตอนที่ 2B** ตาม [PLAN.md](file:///c:/Users/lenovo/Documents/My%20dividend/docs/calm/PLAN.md):
- ปรับแต่งการ์ดสัดส่วนหมวดหมู่ (Category Cards หุ้น / กองทุน / เงินฝาก)
- ปรับแถบ Progress Bar ให้หนา 12 ขอบ ink 2
- ปรับป้าย % เป็น Pill เดี่ยว และคงลูกศร `›`
- ปรับหัวข้อภาษาไทยด้วย Noto Sans Thai Bold


