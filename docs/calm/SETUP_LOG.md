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

## 9. ผลการดำเนินการขั้นตอนที่ 2B (Category Cards & Section Headers)

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Section Headers (หัวข้อหมวดหมู่และปุ่มดูพอร์ตเต็ม)**:
     - หัวข้อ "สัดส่วนสินทรัพย์ตามหมวดหมู่" ปรับเป็น `<CalmText variant="bodyBold" size={17} color={colors.ink}>`
     - คำอธิบาย "3 หมวดหมู่หลัก" ปรับเป็น `<CalmText variant="monoRegular" size={12} color={colors.muted}>`
     - ปุ่ม "ดูพอร์ตเต็ม →" แปลงเป็น `<Pill kind="ink" size="md" label="ดูพอร์ตเต็ม →" onPress={() => onNavigateToPortfolio('ALL')} />`
     - ใน `StyleSheet`:
       - `styles.sectionTitle`: กำหนด `fontFamily: fonts.thaiBold`, `color: colors.ink`, ตัด `fontWeight: '700'` ออก 100% ตามกฎ Font Weight Rule เพื่อป้องกันบั๊ก faux-bold ตัวอักษรบวม/เบลอบน Android
       - `styles.sectionSubtitle`: กำหนด `fontFamily: fonts.thai`, `color: colors.muted`
  2. **Category Cards (การ์ดหมวดหมู่ 3 การ์ด: หุ้น / กองทุน / เงินฝาก)**:
     - เปลี่ยนกรอบนอกสุดจากการ์ดขาวเงาเบลอเดิม เป็น `<Card shadow="md" padding={14} onPress={...}>` (เงาแข็ง Hard Shadow สไตล์ Calm 4px)
     - **Category Icon Circle**: แมปสีพื้นหลังตามประเภทสินทรัพย์อย่างเคร่งครัด (`cat.type === 'STOCKS' ? chartColors.stocks : cat.type === 'FUNDS' ? chartColors.funds : chartColors.cash`) แทนที่เฉพาะใน style block โดยยังคงรักษาฟิลด์ `cat.bgColor` และ `cat.color` ใน data object เดิมไว้ 100% เพื่อไม่ให้กระทบ Modal ย่อย; ไอคอนด้านในใช้สี `colors.ink` พร้อมขอบเส้นหนา 1.5px
     - **Category Title & Count**: ชื่อหมวดหมู่ใช้ `<CalmText variant="bodyBold" size={13}>` และจำนวนสินทรัพย์ใช้ `<CalmText variant="monoRegular" size={11} color={colors.muted}>`
     - **P/L %**: คำนวณสีและสัญลักษณ์ผ่านฟังก์ชัน `trend(cat.unrealizedPL)` แสดงผลด้วย `<CalmText variant="mono" size={12} color={plTrend.color}>` (แสดง ▲ / ▼ ตามผลตอบแทนจริง)
     - **Allocation %**: ครอบด้วย `<Pill kind="outline" size="sm" label={`${cat.allocationPercent.toFixed(1)}%`} />` โดยครอบเฉพาะตัวเลขเปอร์เซ็นต์เดี่ยวๆ ตามข้อกำหนด
     - **Chevron Indicator**: คงลูกศร `Ionicons name="chevron-forward" size={13} color={colors.ink} />` ไว้เป็น tap indicator ด้านขวาเสมอ
     - **Market Value (มูลค่าตลาด)**: แสดงผลด้วย `<CalmText variant="display" size={26} color={colors.ink}>` รองรับ Privacy Masking จาก `formatMoney()` ครบถ้วน
     - **Inflow / Yield**: ข้อความปันผล/ดอกเบี้ยรายปี แสดงด้วย `<CalmText variant="monoRegular" size={11} color={colors.ink}>` พร้อมไอคอน wallet/leaf
     - **Progress Bar**: ปรับรางหลัง (Rail) ให้หนาขึ้นตามแบบร่าง Calm (`height: 12`, `borderWidth: 2`, `borderColor: colors.ink`, `borderRadius: 999`, `backgroundColor: colors.track`, `overflow: 'hidden'`) และแถบระบายสี (Fill) ใช้สีตาม `chartColors` ของแต่ละหมวดหมู่
  3. **การคลีน Hex Code**: ลบโค้ดสี raw hex ทั้งหมดใน style block ที่เกี่ยวข้อง (`categoryCardsContainer`, `categoryCard`, `categoryIconCircle`, `categoryAllocationText`, `categoryTitle`, `categoryValue`, `progressBarBackground`, `progressBarFill`)
  4. **ระยะห่างการ์ด**: ปรับ `categoryCardsContainer` เป็น `gap: 12` เพื่อให้เงา Hard Shadow 4px ด้านล่างมีการเว้นระยะหายใจ ไม่ทับการ์ดใบถัดไป
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 10. ผลการดำเนินการขั้นตอนที่ 2C (Payday Radar — UpcomingPaydayRadar.tsx)

- **ไฟล์ที่แก้ไข**: `src/components/UpcomingPaydayRadar.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **โครงสร้างกรอบนอก (Outer Card & Header)**:
     - ห่อด้วย `<View style={styles.outerContainer}>` กำหนด `marginBottom: 16`
     - แทนที่ `styles.radarCard` เดิมด้วย `<Card shadow="md" padding={16}>` พร้อมเงาแข็ง Hard Shadow 4px
     - แถบป้ายหัวข้อเรดาร์ (`radarBadge`): ปรับเป็นสไตล์ Calm ด้วยพื้นหลัง `colors.bg`, ขอบหนา 1.5px `colors.ink`, รัศมี 999, ไอคอนระฆังสี `colors.ink`, และข้อความ `<CalmText variant="bodyBold" size={12}>`
     - จำนวนรายการ 30 วัน: ปรับเป็น `<CalmText variant="monoRegular" size={11} color={colors.muted}>`
  2. **การเลื่อนแนวนอนและการป้องกันเงาตัดขอบ (Horizontal Scroll Safety)**:
     - คงโครงสร้างแนวนอนเดิมไว้ 100% (`ScrollView horizontal={true}`) ตามข้อกำหนดของแอปมือถือ
     - เพิ่ม `paddingBottom: 8` และ `paddingRight: 8` ใน `styles.radarScroll` เพื่อป้องกันไม่ให้ขอบ ScrollView ตัดเงา Hard Shadow ของการ์ดรายการย่อยด้านใน
     - ไม่มีการแทรก Divider ที่ไม่จำเป็นระหว่างรายการแนวนอน
  3. **การ์ดรายการย่อยในเรดาร์ (Upcoming Item Cards)**:
     - ห่อแต่ละรายการด้วย `<HardShadow key={...} size="sm" radius={14}>` ทำให้การ์ดมีเงาเหลี่ยมคมชัดสไตล์ Calm 3px สวยงามสมบูรณ์แบบ
     - กรอบการ์ด `radarItemPill`: พื้นหลัง `colors.surface`, ขอบหนา 2px `colors.ink`, รัศมี 14px, ขนาดขั้นต่ำ 165x52
     - จุดระบุหมวดหมู่ `radarItemDot`: รัศมี 4px ขอบ `colors.ink` หนา 1.5px; สีเงินฝากใช้ `chartColors.cash`, สีหุ้น/กองทุนใช้ `chartColors.stocks`
     - สัญลักษณ์หุ้น (`radarSymbol`): ปรับเป็น `<CalmText variant="mono" size={16} color={colors.ink}>`
     - ป้ายประเภทกิจกรรม:
       - วัน XD: `<Pill kind="outline" size="sm" label="วัน XD" />`
       - วันเงินเข้า: `<Pill kind="ink" size="sm" label="เงินเข้า" />`
       - เงินปันผลพิเศษ: `<Pill kind="dashed" size="sm" label="✨ พิเศษ" />`
     - วันที่และจำนวนวัน: แสดงผลด้วย `<CalmText variant="mono" size={11}>` พร้อมไฮไลต์สี `gainOnLight` เมื่อถึงกำหนดวันนี้
     - จำนวนเงิน: แสดงผลด้วย `<CalmText variant="mono" size={13} color={colors.ink}>` พร้อมคงเงื่อนไขแปลงหน่วย USD สมบูรณ์ครบถ้วน
     - ปุ่มยืนยันเงินเข้า (`confirmPayBtn`): แปลงเป็น `<CapsuleButton variant="surface" icon={<Ionicons name="checkmark" size={12} color={colors.ink} />} label="เงินเข้าแล้ว" onPress={...} style={{ minHeight: 26, paddingHorizontal: 8, paddingVertical: 2 }} />`
  4. **สถานะว่าง (Fallback Empty Bar)**:
     - ปรับกรอบเป็นพื้น `colors.surface`, ขอบ 2px `colors.ink`, รัศมี 16px
     - ข้อความแสดงหุ้นถัดไปใช้ `<CalmText variant="monoRegular">` และ `<CalmText variant="mono">`
  5. **การคลีน Hex Code**: กำจัด raw hex colors ทั้งหมดในไฟล์ (`#059669`, `#64748B`, `#0F172A`, `#E2E8F0`, `#F8FAFC`, `#F1F5F9`, `#FFFFFF`, `#2563EB`, `#DCFCE7`, `#FEF3C7`, `#BBF7D0`, `#FED7AA`, `#FFFBEB`) แทนที่ด้วยโทเค็นชุดสี Calm Mint ครบ 100%
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 11. ผลการดำเนินการขั้นตอนที่ 2D (Chart Header, Filter Bar & Modals)

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Section Header & XD Cutoff Badge**:
     - หัวข้อปันผล 12 เดือนและคำอธิบายใต้หัวข้อ ปรับใช้ `<CalmText variant="bodyBold">` และ `<CalmText variant="monoRegular">`
     - ชิป "XD Cutoff" แปลงเป็น `<Pill kind="outline" size="sm" label="XD Cutoff" />` สไตล์ Calm ขอบ 2px ink
  2. **Unified Filter Bar (แถบตัวกรองคู่: Inflow Dropdown + Year Selector)**:
     - ปุ่มเลือกประเภทกระแสเงินสด (Inflow filter) แปลงเป็น `<Pill kind="outline" size="md" ... />`
     - แถบเลือกปี (Year selector) คงปุ่มลูกศร `[ ‹ ]` และ `[ › ]` พร้อมแปลงปุ่มแสดงปีตรงกลางเป็น `<Pill kind="outline" size="md" ... />`
     - ปลดสไตล์กรอบขาว/เงาเบลอเดิมของ `yearSelectorContainer` ออก ให้เป็น Flex row ธรรมดาที่เชื่อมองค์ประกอบด้วย Pill
  3. **โครงสร้างกรอบกราฟ (Chart Card Outer Frame)**:
     - ห่อชาร์ตด้วย `<Card shadow="md" padding={16}>` พร้อมระยะห่าง `marginBottom: 20`
     - กรณียังไม่มีข้อมูล (Empty State): ใช้ `<CalmText variant="bodyBold">` และ `<CalmText variant="monoRegular">` สี muted
  4. **Year Summary Header (สรุปยอดรวมชาร์ต)**:
     - หัวข้อปี/Rolling 12M ใช้ `<CalmText variant="bodyBold" size={13}>`
     - ป้ายกำกับปี (Year Tag) แปลงเป็น `<Pill size="sm">` (ปีนี้/Rolling = `accent`, ปีย้อนหลัง = `outline`)
     - ยอดรวมกระแสเงินสดทั้งปี: แสดงผลด้วยฟอนต์ใหญ่ `<CalmText variant="display" size={40} color={colors.ink}>`
     - ยอดเฉลี่ยต่อเดือน: แปลงเป็น `<Pill kind="ink" size="md" label={`เฉลี่ย ${formatMoney(forecastMonthlyAvg)}/ด.`} />`
     - แถบแจกแจง รับแล้ว vs รอรับ:
       - จุดรับแล้ว: สี่เหลี่ยม 10x10 พื้นหลัง `colors.ink`
       - จุดรอรับ: สี่เหลี่ยม 10x10 พื้นหลัง `colors.projected` ขอบ 1.5px `colors.ink`
       - ข้อความยอดเงินคง privacy masking ผ่าน `formatMoney()` เดิม
  5. **สัญลักษณ์ Legend (Chart Legend Row)**:
     - ปรับจุดสัญลักษณ์ Legend จากเดิมวงกลม เป็นสี่เหลี่ยมขนาด 14px:
       - ได้รับแล้ว: สี่เหลี่ยม 14x14 สี `colors.ink`
       - คาดการณ์/รอรับ: สี่เหลี่ยม 14x14 สี `colors.projected` พร้อมขอบหนา 2px `colors.ink`
       - เดือนปัจจุบัน (Now): ปรับใช้โทเค็น Calm ink
     - ป้ายกำกับข้อความ Legend ทั้งหมดใช้ `<CalmText variant="monoRegular" size={11}>`
  6. **Modal Bottom Sheets (Inflow Filter Modal & Year Picker Modal)**:
     - ห่อทั้ง 2 Modal ด้วยคอมโพเนนต์สำเร็จรูป `<SheetFrame title="..." onClose={...}>`
     - ลบ backdrop `modalOverlay`, `pickerModalContent`, และ `pickerModalHeader` เดิมออกทั้งหมด 100% ทำให้ไม่เกิดปัญหา Backdrop/Scrim ทับซ้อนกัน และได้ Grab handle + ปุ่มปิดกลม 44px ทันที
     - ตัวเลือกรายการใน Modal: ปรับใช้ `<CalmText variant="bodyBold">`, `<CalmText variant="monoRegular">`, ขอบหนา 1.5px เมื่อถูกเลือก, และไอคอนติ๊กถูกสี `colors.gainOnLight`
  7. **การคลีน Hex Code**: ลบ raw hex colors ใน style block ที่เกี่ยวข้องออกทั้งหมด
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 12. การดำเนินการขั้นตอนที่ 2E: ปรับสีแท่งชาร์ตและป้ายกำกับ (Bar Chart Colours & Bars - `Dashboard.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **โครงสร้างแท่งกราฟ (Bar Chart Architecture)**:
  - แท่งชาร์ตเรนเดอร์ด้วย Custom React Native `<View>` (ไม่ได้ใช้ react-native-gifted-charts)
  - สูตรความสูงแท่งชาร์ตเดิม: `barHeightRatio = maxMonthlyAmount > 0 ? Math.max(0.12, item.amount / maxMonthlyAmount) : 0.05`
  - **รายงาน minHeight**: โค้ดเดิมกำหนด minHeight ratio ไว้ที่ `0.12` (12% ของยอดสูงสุด) สำหรับเดือนที่มีการจ่ายเงิน และ `0.05` (5%) สำหรับเดือนที่ยอดเป็น 0 — **คงสูตรและสัดส่วนเดิมไว้ครบถ้วน 100% ตามข้อกำหนด ไม่มีการแตะต้อง logic**
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **การย้ายตำแหน่งขอบ (Border Placement)**:
     - ปลดขอบ `borderWidth: 0.5` และ `borderColor: '#E2E8F0'` ออกจากรางพื้นหลัง (`barTrack`)
     - ย้ายเส้นขอบหนา 2px `colors.ink` ไปอยู่บนตัวแท่งกราฟ (`barFill`) โดยตรง
  2. **สีและขอบของแท่งกราฟตามสถานะ (Bar Fill States)**:
     - **แท่งที่ได้รับแล้ว (Past/Received)**: `backgroundColor: colors.ink`, `borderWidth: 2`, `borderColor: colors.ink`
     - **แท่งเดือนปัจจุบัน (Current Month)**: `backgroundColor: colors.accent`, `borderWidth: 2`, `borderColor: colors.ink`
     - **แท่งคาดการณ์/รอรับ (Future/Projected)**: `backgroundColor: colors.projected`, `borderWidth: 2`, `borderColor: colors.ink`
     - **แท่งที่ไม่มีการจ่าย (0 Payout / Inactive)**: `backgroundColor: colors.track`, `borderWidth: 0` (ไม่มีขอบตามข้อกำหนด)
     - **แท่งที่ถูกเลือก (Selected Month)**: `borderColor: colors.ink`
  3. **รางพื้นหลัง (Bar Track)**:
     - ใช้สีโทนคลีน `backgroundColor: colors.track` ปลด `#F8FAFC` และ `#E2E8F0` ออก
     - รางเดือนปัจจุบัน (`barTrackCurrent`): ใช้สีรองพื้นแบบเบา `#D5E6DC` ตามแบบดีไซน์ HTML
  4. **ตัวเลขยอดเงินเหนือแท่ง (Top Amount Tooltip)**:
     - ปรับฟอนต์เป็น `fontFamily: fonts.mono`, ขนาด `fontSize: 11`, สี `colors.ink`
     - ลบ `fontWeight: '700'` และ `fontWeight: '800'` ออกทั้งหมดตามกฎความเข้ากันได้ของฟอนต์
     - คง privacy masking `••••` และการย่อหน่วย `k` เดิมไว้ครบถ้วน
  5. **ป้ายชื่อเดือน (Month Label)**:
     - ปรับฟอนต์เป็น `fontFamily: fonts.thai`, ขนาด `fontSize: 11`, สี `colors.ink`
     - เดือนปัจจุบันและเดือนที่ถูกเลือก: ใช้ `fontFamily: fonts.thaiBold` (ไม่มี `fontWeight` แทรก)
  6. **ป้ายและสัญลักษณ์ "Now" (Current Month Badge & Legend)**:
     - ตัวกล่อง `nowBadge` และ `nowBadgeLegend`: พื้นหลัง `backgroundColor: colors.ink`, `borderRadius: 4`
     - ไอคอน `caret-up`: สี `colors.accent`
     - ข้อความ "Now": `fontFamily: fonts.mono`, `fontSize: 9`, สี `colors.accent`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 13. การดำเนินการขั้นตอนที่ 2F: ปรับกล่องรายละเอียดเดือนที่ถูกเลือก (Selected Month Detail Pop-out - `Dashboard.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **รูปแบบ**: เป็น inline `<View>` pop-out ภายในหน้าจอเดิม (ไม่มีการสร้าง Modal ใหม่ตามข้อกำหนด)
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **กรอบกล่องรายละเอียด (Pop-out Container)**:
     - ใช้พื้นหลัง `backgroundColor: colors.surface`
     - ขอบหนา 2px `borderColor: colors.ink`, มนโค้ง `borderRadius: 16`, ระยะเว้นขอบ `padding: 14`
  2. **หัวข้อเดือน & ยอดรวม (Header Title & Total)**:
     - ใช้ `<CalmText variant="display" size={22} color={colors.ink}>`
     - รักษาข้อความและตัวเลขยอดรวมเดิมไว้ครบถ้วน ไม่มีการแยกยอดรวมออกจากข้อความหัวเรื่อง
     - **ไม่เพิ่มป้าย "เดือนปัจจุบัน"** ตามข้อกำหนดที่ระบุไว้
  3. **เส้นคั่นรายการสินทรัพย์ (List Divider)**:
     - คั่นระหว่างรายการสินทรัพย์ด้วย `<DashedDivider marginVertical={4} />` สี sage มาตรฐาน
  4. **ป้ายประเภทสินทรัพย์และสถานะ (Tags & Pills)**:
     - **ป้ายปันผล (Dividend)**: `<Pill kind="accent" size="sm" label="ปันผล" />`
     - **ป้ายดอกเบี้ย (Interest)**: `<Pill kind="outline" size="sm" label="ดอกเบี้ย" />`
     - **ป้ายปันผลพิเศษ (Special Dividend)**: `<Pill kind="dashed" size="sm" label="ปันผลพิเศษ" />`
     - **ป้ายได้รับแล้ว (Received)**: `<Pill kind="ink" size="sm" label="ได้รับแล้ว" />`
     - **ป้ายจำนวนวันดอกเบี้ย (Interest Days Info)**: `<Pill kind="outline" size="sm" label={...} />`
  5. **ชื่อสินทรัพย์และข้อมูลหุ้น (Symbol & Info Text)**:
     - ชื่อหุ้น: `<CalmText variant="mono" size={14} color={colors.ink}>`
     - ข้อมูลหุ้น (จำนวนหุ้น, DPU, XD date, ยอดเงินฝาก, วันที่เข้า): `<CalmText variant="monoRegular" size={11} color={colors.muted}>`
     - คง privacy masking `••••` และนิพจน์คำนวณเดิมไว้ 100%
  6. **การแสดงผลยอดเงินและแอคชัน (Amounts & Action)**:
     - ยอดเงินหลัก: ใช้ฟอนต์ `fontFamily: fonts.mono`, ขนาด 14, สี `colors.ink`
     - ยอดเงินรอง (USD dual view): `fontFamily: fonts.monoRegular`, ขนาด 11, สี `colors.muted`
     - ลิงก์ "ปรับยอด": `<CalmText variant="monoRegular" size={10} color={colors.muted}>` พร้อมไอคอนดินสอ
     - ขนาดแถวรายการมีความสูงขั้นต่ำ `minHeight: 44` เพื่อความสะดวกในการแตะเปิด `AdjustDividendModal`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 14. การดำเนินการขั้นตอนที่ 2G-0: ปรับการ์ดเป้าหมาย Passive Income บน Dashboard (`Dashboard.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **การ์ดคอนเทนเนอร์ (Goal Card Container)**:
     - ห่อหุ้มด้วย `<Card shadow="md" padding={14} style={{ marginTop: 16, marginBottom: 16 }}>` สไตล์ Calm Mint
     - ขจัดเงาและกรอบเดิมของ `styles.goalCard` ออกทั้งหมด
  2. **หัวข้อและไอคอนเป้าหมาย (Goal Header)**:
     - ไอคอนธง: วงกลมขนาด 32x32 พื้นหลัง `colors.accent`, ขอบ 1.5px `colors.ink`, ไอคอนธงสี `colors.ink`
     - หัวข้อเป้าหมาย: `<CalmText variant="bodyBold" size={14} color={colors.ink}>`
     - คำอธิบายความคืบหน้า: `<CalmText variant="monoRegular" size={12} color={colors.muted}>`
     - ปุ่มตั้งค่าเป้าหมาย (Settings Button): ไอคอนรูปฟันเฟืองสี `colors.ink` พร้อม `accessibilityLabel="ตั้งค่าเป้าหมาย"`
  3. **แถบความคืบหน้า (Progress Bar)**:
     - ปรับแถบ Progress Bar ให้หนา 12px ขอบมน 999 (`height: 12, borderRadius: 999`)
     - กรอบขอบหนา 2px `borderColor: colors.ink` พร้อมรางพื้นหลัง `backgroundColor: colors.track`
     - แถบความคืบหน้าภายใน: สี `colors.accent` ขอบมน 999 สไตล์เดียวกับหมวดหมู่ใน Step 2B
  4. **แถวสรุปด้านล่าง (Footer Row)**:
     - สถิติเปอร์เซ็นต์: `<CalmText variant="mono" size={12} color={colors.ink}>`
     - ข้อความขาดอีก/พิชิตเป้าหมายแล้ว: `<CalmText variant="monoRegular" size={12} color={colors.muted}>`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 15. การดำเนินการขั้นตอนที่ 2G-1: ปรับ Modal ปรับปรุงเงินปันผล (`src/components/AdjustDividendModal.tsx`)

- **ไฟล์ที่แก้ไข**: `src/components/AdjustDividendModal.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **โครงสร้าง SheetFrame & KeyboardAvoidingView**:
     - ปลด backdrop/scrim `styles.modalOverlay`, `styles.backdrop`, และ `styles.sheetContainer` เดิมออกทั้งหมด
     - จัดโครงสร้างตามกติกา: `<Modal><KeyboardAvoidingView ...><SheetFrame title={`ปรับยอด ${target.symbol}`} onClose={onClose}>...</SheetFrame></KeyboardAvoidingView></Modal>`
     - ทำให้ได้ Slide-up Bottom Sheet พร้อม Grab handle และปุ่มปิดกลม 44px ทันที โดยคีย์บอร์ดไม่บังช่องกรอก
  2. **แถบข้อมูลอ้างอิงและประเภทสินทรัพย์ (Info Banner)**:
     - ใช้ `<Pill kind={target.isInterest ? 'outline' : 'accent'} size="sm" label={target.isInterest ? 'ดอกเบี้ย' : 'ปันผล'} />`
     - ข้อความรายละเอียด (เงินฝาก/จำนวนหุ้น, รอบวันที่ XD, อัตราภาษี): ใช้ `<CalmText variant="monoRegular" size={11} color={colors.ink}>`
     - กรอบพื้นหลังสี `colors.track` ขอบมน 12px
  3. **ช่องกรอกข้อมูลตัวเลข (Dual-sync Input Fields)**:
     - ใช้ `inputStyle` จาก Calm tokens พร้อมระบุ `fontFamily: fonts.mono`, ขนาด 15
     - ป้ายกำกับช่องกรอกใช้ `<CalmText variant="bodyBold" size={11} color={colors.muted}>`
     - สี placeholder: `colors.muted`
     - คง keyboardType, validation, dual-sync calculation (DPU <-> Net Amount), และ handlers เดิม 100%
  4. **กล่องหมายเหตุอัตราแลกเปลี่ยน USD (USD Conversion Note)**:
     - กรอบสี `colors.track` พร้อมเส้นขอบหนา 1.5px `colors.ink`
     - แสดงผลการแปลงค่าเงินและอัตราแลกเปลี่ยนด้วย `<CalmText variant="monoRegular" size={11} color={colors.ink}>`
  5. **กล่องสลับสถานะเงินเข้าและปันผลพิเศษ (Status Toggles & Checkbox)**:
     - การ์ดตัวเลือกสถานะ: พื้นหลัง `colors.surface`, ขอบหนา 2px `colors.ink`, มนโค้ง 14px (เมื่อเลือกใช้พื้นหลัง `colors.bg`)
     - กล่อง Checkbox: ขนาด 22x22, ขอบหนา 2px `colors.ink`, เมื่อเลือกใช้พื้นหลัง `colors.ink` พร้อมไอคอนติ๊กถูก/ประกายดาวสี `colors.accent`
     - หัวข้อสถานะและคำอธิบาย: ใช้ `<CalmText>` tokens
     - ป้าย One-off: ใช้ `<Pill kind="dashed" size="sm" label="One-off" />`
  6. **ปุ่มขอบเขตการปรับ (Scope Buttons: ปรับเฉพาะงวดนี้ vs รอบอนาคต)**:
     - คอนเทนเนอร์รางพื้นหลังสี `colors.track` มีกรอบหนา 1.5px `colors.ink`
     - ปุ่มที่ Active: พื้นหลัง `colors.ink` พร้อมข้อความสี `colors.accent`
     - ปุ่มที่ Inactive: ข้อความสี `colors.ink`
  7. **ปุ่มดำเนินการ (Action Buttons)**:
     - ปุ่มยกเลิก: `<CapsuleButton variant="surface" label="ยกเลิก" onPress={onClose} disabled={isSubmitting} />`
     - ปุ่มบันทึกข้อมูล: `<CapsuleButton variant="ink" label="บันทึกข้อมูล" onPress={handleSave} disabled={isSubmitting} />` (แสดง ActivityIndicator สี mint เมื่อกำลังบันทึก)
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 16. การดำเนินการขั้นตอนที่ 2G-2: ปรับ Sheet เปรียบเทียบผลตอบแทนรายปี (`src/components/AnnualComparisonSheet.tsx`)

- **ไฟล์ที่แก้ไข**: `src/components/AnnualComparisonSheet.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **โครงสร้าง SheetFrame**:
     - ปลด backdrop `styles.backdrop`, `styles.sheetContainer`, `styles.handleBar`, และ `styles.headerRow` เดิมออกทั้งหมด
     - ใช้ `<SheetFrame title="เปรียบเทียบผลตอบแทน" onClose={onClose}>` มอบ Slide-up Sheet พร้อม Grab handle และปุ่มปิดกลม 44px
     - วางข้อความระบุปีที่เปรียบเทียบ: `<CalmText variant="monoRegular" size={12} color={colors.muted} style={{ marginBottom: 14 }}>ปี {priorYear} เทียบกับ ปี {currentYear}</CalmText>`
  2. **การ์ดยอดรวมรายปี (Comparison Metric Cards)**:
     - ใช้ `<Card shadow="md" padding={12} style={{ flex: 1 }}>` สำหรับทั้ง 2 ฝั่ง (ปีก่อน vs ปีปัจจุบัน)
     - ยอดเงิน: แสดงผลเด่นชัดด้วย `<CalmText variant="display" size={20} color={colors.ink}>`
     - ป้ายปันผลพิเศษปีก่อน: `<Pill kind="dashed" size="sm" label={`ปันผลพิเศษ ${specialCount} รายการ`} />`
     - ป้ายอัตราเติบโต YoY: `<Pill kind={isPositiveGrowth ? 'accent' : 'outline'} size="sm" label={`${isPositiveGrowth ? '▲ +' : '▼ '}${Math.abs(yoyPercent).toFixed(1)}% YoY`} />` (หรือป้าย `✦ ปีแรกที่มีข้อมูล`)
  3. **กล่องคำอธิบายความผันผวน (Insight Note Card)**:
     - ใช้พื้นหลัง `colors.track` พร้อมเส้นขอบหนา 1.5px `colors.ink` มนโค้ง 12px
     - ไอคอน `information-circle-outline` สี `colors.ink`
     - ข้อความวิเคราะห์: `<CalmText variant="monoRegular" size={11} color={colors.ink}>`
  4. **รายการแจกแจงปันผลปีก่อน (Prior Year Breakdown List)**:
     - แถบหัวข้อรายการ: `<CalmText variant="bodyBold" size={14} color={colors.ink}>` พร้อม `<Pill kind="outline" size="sm" label={`${sortedItems.length} รายการ`} />`
     - คั่นระหว่างรายการด้วย `<DashedDivider marginVertical={4} />`
     - สัญลักษณ์หุ้น: `<CalmText variant="mono" size={13} color={colors.ink}>`
     - แท็กประเภท: `<Pill size="sm">` (ปันผลพิเศษ = dashed, ดอกเบี้ย = outline, ปันผล = accent)
     - ข้อมูลย่อยและยอดเงิน: ใช้ `<CalmText>` พร้อมฟอนต์ mono
     - ความสูงแถวรายการขั้นต่ำ `minHeight: 44`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 17. การดำเนินการขั้นตอนที่ 2G-3: ปรับ Modal ตั้งเป้าหมายเงินปันผลรายเดือน (`src/components/GoalSettingsModal.tsx`)

- **ไฟล์ที่แก้ไข**: `src/components/GoalSettingsModal.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **โครงสร้าง SheetFrame & Keyboard Integration**:
     - ห่อ `<SheetFrame title="ตั้งเป้าหมายเงินปันผล" onClose={onClose}>` ภายใน `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>`
     - ปลด backdrop `styles.backdrop`, `styles.sheetContainer`, `styles.dragHandle`, และ `styles.header` เดิมออกทั้งหมด
     - ข้อความแนะนำใต้หัวข้อ: `<CalmText variant="monoRegular" size={12} color={colors.muted}>กำหนดเป้าหมายปันผล & ดอกเบี้ยเพื่อพิชิตในชีวิตจริง</CalmText>`
  2. **รายการระดับเป้าหมาย (Milestone Presets)**:
     - หัวข้อกลุ่ม: `<CalmText variant="bodyBold" size={13} color={colors.ink}>เลือกระดับเป้าหมาย (Milestone Presets)</CalmText>`
     - การ์ด Preset แต่ละระดับ: ใช้กรอบขอบ 1.5px `colors.ink`, รัศมี 12px, ความสูงขั้นต่ำ 52px
     - สถานะเลือก (Selected): พื้นหลังเปลี่ยนเป็น `colors.track` (Mint tint)
     - กล่องไอคอน: ขอบ 1px `colors.ink`, มน 8px, เมื่อเลือกจะเปลี่ยนพื้นหลังเป็น `colors.accent`
     - สัญลักษณ์วิทยุ (Radio selector): วงกลมขนาด 20px ขอบ 1.5px `colors.ink`, เมื่อเลือกจะกลายเป็นสี `colors.ink` ทึบพร้อมไอคอนเครื่องหมายถูก `checkmark` สีขาว
     - ข้อความชื่อระดับและคำอธิบาย: ใช้ `<CalmText variant="bodyBold">` และ `<CalmText variant="monoRegular">`
  3. **ตัวเลือกกำหนดเป้าหมายเอง (Custom Target)**:
     - การ์ดเลือกแบบ Custom: ได้รับการจัดรูปแบบสอดคล้องกับ Presets
     - ช่องกรอกตัวเลขแบบกำหนดเอง (`customInputBox`):
       - พื้นหลัง `colors.surface`, ขอบ 1.5px `colors.ink`, มน 12px, ความสูงขั้นต่ำ 48px
       - สัญลักษณ์สกุลเงิน `฿`: `<CalmText variant="mono" size={16} color={colors.ink}>`
       - ช่องป้อนตัวเลข: ฟอนต์ `fonts.mono`, สี `colors.ink`, ตัวยึดสี `colors.muted`
       - ข้อความกำกับ `/ เดือน`: `<CalmText variant="monoRegular" size={12} color={colors.muted}>`
  4. **ปุ่มส่วนท้าย (Action Footer)**:
     - ปุ่มยกเลิก: `<CapsuleButton variant="surface" label="ยกเลิก" onPress={onClose} />`
     - ปุ่มบันทึก: `<CapsuleButton variant="ink" label="บันทึกเป้าหมาย" icon={<Ionicons name="checkmark" size={16} color={colors.accent} />} onPress={handleConfirm} />`
  5. **การคง Logic และ Data Storage**:
     - คง AsyncStorage key `@mydividend_monthly_goal` และ `onSave(finalAmount)` 100%
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 18. การดำเนินการขั้นตอนที่ 2G-4: ปรับ Modal สัดส่วนสินทรัพย์รายหมวดหมู่ (`src/components/CategoryBreakdownModal.tsx`)

- **ไฟล์ที่แก้ไข**: `src/components/CategoryBreakdownModal.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **โครงสร้าง SheetFrame**:
     - เปลี่ยนกรอบภายนอกมาใช้ `<SheetFrame title={categoryLabel} onClose={onClose}>` พร้อม Subtitle แสดงบริบท (Sectors/Categories/บัญชีเงินฝาก) และไอคอนประจำหมวดหมู่
     - ควบคุมการเลื่อนด้วย `<ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.72 }}>` ให้ใช้งานได้ลื่นไหล ไม่ล้นจอ
  2. **กล่องสรุปภาพรวมหมวดหมู่ (Category Overview Summary Card)**:
     - ห่อด้วย `<Card shadow="md" padding={14}>`
     - มูลค่ารวม: แสดงผลด้วย `<CalmText variant="display" size={20} color={colors.ink}>` พร้อมรองรับ Privacy Masking
     - ฝั่งกำไร/ขาดทุน (P/L): แสดงผลด้วย `<Pill kind={unrealizedPL >= 0 ? 'accent' : 'outline'} size="md">` หรือจำนวนบัญชีเงินฝาก
  3. **การ์ดติดตามโควตาภาษีดอกเบี้ยเงินฝาก 20,000 บาท (กรณี CASH)**:
     - แปลงเป็นการ์ด Calm สไตล์โมเดิร์น พร้อม `<Pill kind={isExceededLimit ? 'dashed' : 'accent'}>`
     - แถบ Quota Progress Bar: พื้นหลังราง `colors.surface` ขอบ 1px `colors.ink`, ตัวแท่งใช้ `colors.accent` (ปลอดภัย) หรือ `colors.ink` (เกินเพดาน)
     - กล่องสรุปดอกเบี้ยสุทธิ: กรอบ 1px `colors.ink` พร้อมตัวเลข mono
  4. **Circular Donut Pie Chart (Gifted Charts)**:
     - การ์ดชาร์ต: พื้นหลัง `colors.ink`, ขอบ 2px `colors.ink`, มน 20px
     - **คงสีชิ้นพายตาม Sector เดิมครบถ้วน 100%**: ใช้ `color: group.definition.color` โดยไม่ลดทอนเหลือสีเดียว
     - ขอบชิ้นพายและแกนกลางวงกลม: ปรับใช้สี `colors.ink` เชื่อมโยงกับดีไซน์รวม
     - ป้าย Callout ชี้ออกภายนอก: ปรับกรอบ Rect เป็นสี `colors.ink` ขอบสีตาม Sector และข้อความ Mono
     - ตัวเลขตรงกลางโดนัท: `<CalmText variant="display" size={22} color={colors.surface}>` แสดงจำนวน Segments
  5. **รายละเอียดแต่ละ Segment & รายการสินทรัพย์**:
     - การ์ด Segment: ขอบ 1.5px `colors.ink`, รัศมี 14px, แถบสีด้านซ้ายคงสีประจำ Sector เดิม
     - ชิปสัดส่วนเปอร์เซ็นต์: `<Pill kind="ink" size="sm" label={`${group.percentage.toFixed(1)}%`} />`
     - แถวสินทรัพย์ภายใน Segment: คั่นด้วย `<DashedDivider marginVertical={2} />`
     - ปุ่มแก้ไขสินทรัพย์: เปลี่ยนเป็น `<Pill kind="outline" size="sm" label="✎ แก้ไข" />` สไตล์มินิมอล
  6. **การคลีน Hex Code**: ลบ raw hex colors ที่กระจัดกระจายในสไตล์ชีตเดิมออกทั้งหมด 100%
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 19. การดำเนินการขั้นตอนที่ 2H: ปรับ Bottom Tab Bar และตรวจสอบ StatusBar / FAB (`App.tsx`)

- **ไฟล์ที่แก้ไข**: `App.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **ขอบบนของแถบแท็บ (Tab Bar Top Divider)**:
     - ใช้คอมโพเนนต์ `<DashedDivider color={colors.ink} marginVertical={0} />` วางแนบขอบบนสุดของ Docked Bottom Bar (ปฏิบัติตามกฎห้ามใช้ `borderStyle: 'dashed'` บนเส้นขอบเดียว)
  2. **พื้นหลังและคอนเทนเนอร์ (Tab Bar Container)**:
     - ใช้พื้นหลัง `backgroundColor: colors.surface` สะอาดตา สอดรับกับโทน Calm Mint
     - คอนเทนเนอร์รวมของแอป (`styles.container`) ใช้ `backgroundColor: colors.bg`
     - หน้าโหลดการยืนยันตัวตน (`styles.authLoadingContainer`) ใช้ `backgroundColor: colors.ink`
  3. **แท็บที่กำลังเปิดใช้งาน (Active Tab Capsule)**:
     - ห่อไอคอนและข้อความแท็บด้วยแคปซูลมน `styles.tabActive`
     - พื้นหลัง `colors.ink`, ขอบ 2px `colors.ink`, รัศมี 999 (แคปซูลทรงรี)
     - ไอคอนและป้ายชื่อใช้สี `colors.accent` (Mint `#6FCDA8`)
     - เงาคม Hard shadow ขนาด 2px สี `colors.accent`: `shadowColor: colors.accent, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3`
  4. **แท็บที่ไม่ได้เลือก (Inactive Tab)**:
     - พื้นหลังโปร่งใส ขอบโปร่งใส
     - ไอคอนและป้ายชื่อใช้สี `colors.ink`
  5. **รูปแบบตัวอักษรของแท็บ (Typography)**:
     - ใช้ `<CalmText variant="mono" size={11}>` สำหรับทั้ง 3 แท็บ: "Overview", "Portfolio", "Holdings" คงชื่อและลำดับเดิม 100%
  6. **การตรวจสอบ StatusBar**:
     - คง `<StatusBar style="dark" />` บนพื้นสว่างตามข้อกำหนด ไม่มีการแตะต้อง `app.json` เด็ดขาด
  7. **การตรวจสอบปุ่มลอย `+` (FAB Check)**:
     - ตรวจสอบโครงสร้างใน `App.tsx` พบว่า FAB ไม่ได้ถูกเรนเดอร์ใน `App.tsx` แต่ถูกเรนเดอร์แยกผ่าน `<AddAssetModal onSuccess={loadData} />` ภายในแต่ละหน้าจอ (`Dashboard`, `Portfolio`, `AssetsScreen`) เพื่อให้สามารถผูก state `loadData()` ของแต่ละหน้าได้อย่างถูกต้อง ไม่มีการย้ายปุ่มมาขัดแย้งกับสถาปัตยกรรมเดิม
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 20. สรุปความสำเร็จเฟส 2 (Calm Mint Theme: Overview Screen & Modals)

🎉 **เสร็จสิ้นการปรับโฉมธีม Calm Mint บนหน้า Overview และ Modal ที่เกี่ยวข้องครบถ้วน 100%**:
1. **Step 0**: Google Fonts (`Bricolage Grotesque`, `JetBrains Mono`), Design Tokens, Thai Regex Font Resolver, `useCalmFonts` Hook
2. **Step 2A**: `HeroNetWorthCard.tsx` (บัตรสินทรัพย์สุทธิ, ทักทาย dynamic, ป้าย YoY, ปุ่มลูกตา Privacy Mask, แถบสัดส่วนพอร์ต)
3. **Step 2B**: Category Cards & Section Headers บน `Dashboard.tsx` (การ์ดหมวดหมู่ หุ้น/กองทุน/เงินฝาก ขอบ 2px ink, progress bars หนา 12px, ปุ่ม "ดูพอร์ตเต็ม →")
4. **Step 2C**: `UpcomingPaydayRadar.tsx` (การ์ด Radar แนวนอน, เงา HardShadow ไม่โดนตัด, ป้ายวัน XD/เงินเข้า, ปุ่มยืนยันเงินเข้าแล้ว)
5. **Step 2D**: Chart Header, Unified Filter Bar & Bottom Sheet Picker Modals บน `Dashboard.tsx`
6. **Step 2E**: Bar Chart Colours, 2px ink Bar Borders & Monospace Tooltips บน `Dashboard.tsx`
7. **Step 2F**: Selected Month Detail Pop-out Panel บน `Dashboard.tsx` (ป้ายกำกับ, สถิติปันผล, รายการหุ้น, ปุ่มปรับยอด)
8. **Step 2G-0**: Passive Income Goal Card บน `Dashboard.tsx` (แถบความคืบหน้าหนา 12px ขอบ 2px ink, ปุ่มตั้งเป้าหมาย)
9. **Step 2G-1**: `AdjustDividendModal.tsx` (SheetFrame, KeyboardAvoidingView, Calm inputs, Pill badges)
10. **Step 2G-2**: `AnnualComparisonSheet.tsx` (SheetFrame, YoY Cards, กล่องวิเคราะห์ความผันผวน, รายการปีก่อน)
11. **Step 2G-3**: `GoalSettingsModal.tsx` (SheetFrame, Milestone Presets, Custom target input, CapsuleButtons)
12. **Step 2G-4**: `CategoryBreakdownModal.tsx` (SheetFrame, Donut Chart คงสีตาม Sector เดิม 100%, Quota ภาษีเงินฝาก 20,000 บาท, รายการสินทรัพย์)
13. **Step 2H**: Bottom Tab Bar & Docked Navigation ใน `App.tsx` (DashedDivider ขอบบน, แท็บ Active เป็น Ink Capsule เงา Mint, แท็บ Inactive สี Ink)

---

## 21. การปรับแต่งความสวยงามเพิ่มเติมตามฟีดแบ็กผู้ใช้ (UI Polish Refinements)

- **ไฟล์ที่แก้ไข**:
  1. `src/screens/Dashboard.tsx`
  2. `src/components/HeroNetWorthCard.tsx`
  3. `src/components/AnnualComparisonSheet.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **เพิ่มระยะห่างชาร์ตกระแสเงินสดคาดการณ์ (`chartTotalRow`)**:
     - ขยาย `chartTotalRow.marginTop` จากเดิม `4` เป็น `12`
     - แก้ไขปัญหาข้อความหัวข้อ "กระแสเงินสดคาดการณ์ 12 เดือนข้างหน้า" อยู่ชิดเบียดกับตัวเลขยอดเงินตัวใหญ่ (`size={40}`) เกินไป เพิ่มพื้นที่หายใจให้ดูโปร่ง โล่ง สบายตา
  2. **ปรับแต่งป้าย "ปีแรก" (`HeroNetWorthCard.tsx` & `AnnualComparisonSheet.tsx`)**:
     - เปลี่ยนป้าย `label` ใน `HeroNetWorthCard.tsx` เป็น `'✦ ปีแรก'` (คงสัญลักษณ์ดาว `✦` ไว้ตามความต้องการของผู้ใช้ และตัดเฉพาะสัญลักษณ์ `ⓘ` ออก เพื่อความสบายตา)
     - ปรับใน `AnnualComparisonSheet.tsx` เป็น `'✦ ปีแรกที่มีข้อมูล'` ให้สอดคล้องกัน
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 22. ปรับสไตล์ปุ่มเพิ่มสินทรัพย์ (Floating Action Button - FAB) เป็น Calm Mint Theme

- **ไฟล์ที่แก้ไข**: `src/components/AddAssetModal.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. นำเข้า `colors` จาก `../theme/tokens`
  2. ปรับสไตล์ปุ่ม `styles.fab`:
     - ขนาด: `width: 60, height: 60, borderRadius: 30` (ทรงกลมรัศมี 999)
     - สีพื้นหลัง: `backgroundColor: colors.ink` (`#123D2A`)
     - ขอบ: `borderWidth: 2, borderColor: colors.ink`
     - เงาแข็ง (Hard Shadow): `shadowColor: colors.shadow` (`#A9CDB9`), `shadowOffset: { width: 4, height: 4 }`, `shadowOpacity: 1, shadowRadius: 0`
     - ตำแหน่ง: `bottom: 24, right: 24` ลอยเหนือแถบแท็บล่างอย่างลงตัว
  3. ปรับสีไอคอนเครื่องหมายบวก (`Ionicons name="add"`):
     - เปลี่ยนจากสีขาว `#FFFFFF` เดิม เป็น `colors.accent` (`#6FCDA8`) สีนวลเขียวมิ้นต์ตรงตามแบบ `01-overview.html` line 100
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 23. Step 3A — Header Bar, Privacy Eye & View Switcher ใน Portfolio Screen (`Portfolio.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. นำเข้า `colors, fonts` จาก `../theme/tokens` และ `CalmText` จาก `../components/ui/CalmText`
  2. ปรับพื้นหลัง Safe Area:
     - `styles.safeArea.backgroundColor`: เปลี่ยนเป็น `colors.bg` (`#EAF3EE`) สีนวลตาตามระบบธีม
  3. ปรับแต่ง Header Bar:
     - หัวข้อ: ใช้ `<CalmText variant="display" size={32} color={colors.ink}>` ("พอร์ตการลงทุน") ฟอนต์ Bricolage Grotesque 800
     - ป้าย Subtitle: ใช้ `<CalmText variant="monoRegular" size={11} color={colors.muted}>` แสดงมุมมอง (`ALLOCATION` / `PERFORMANCE`) และจำนวนรายการ
     - ปุ่ม Privacy Mode: ขยายขนาดเป็น 46x46px ทรงกลมรัศมี 999, พื้นหลัง `colors.surface`, ขอบ `borderWidth: 2, borderColor: colors.ink`, เงาแข็ง `colors.shadow` 3px 3px, ไอคอน `Ionicons` ขนาด 20px (เปิดโหมด = `colors.accent`, ปิดโหมด = `colors.ink`)
  4. ปรับแต่ง View Switcher (สลับ สัดส่วนพอร์ต Allocation / ผลงานพอร์ต Performance):
     - คอนเทนเนอร์แคปซูลยาว: พื้นหลัง `colors.surface`, ขอบหมึก `borderWidth: 2, borderColor: colors.ink`, รัศมี 999, padding 4, gap 4
     - แท็บ Active: พื้นหลัง `colors.ink`, ตัวหนังสือและไอคอน `colors.accent` ฟอนต์ `fonts.mono`, รัศมี 999, paddingVertical 10
     - แท็บ Inactive: พื้นหลังใส, ตัวหนังสือและไอคอน `colors.ink` ฟอนต์ `fonts.mono`, รัศมี 999
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 24. Step 3B — มุมมองสัดส่วนสินทรัพย์ (Allocation View) ใน Portfolio Screen (`Portfolio.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. นำเข้าคอมโพเนนต์ UI Kit: `Card`, `Pill`, `DashedDivider`, `trend`, และ `portfolioEvents`
  2. ปรับปรุง Category Filter Pills (`filterPillsRow`):
     - แทนที่ปุ่มแท็บเดิมด้วยคอมโพเนนต์ `<Pill kind={activeCategoryFilter === item.key ? 'ink' : 'outline'}>`
     - รองรับ 4 ตัวเลือก: `ทั้งหมด`, `หุ้น`, `กองทุน`, `เงินฝาก`
     - สลับฟิลเตอร์และกรองสัดส่วนได้อย่างราบรื่น
  3. ปรับปรุงการ์ดกราฟโดนัท Donut Chart (`chartCard`):
     - ห่อหุ้มด้วย `<Card variant="dark" shadow="lg" padding={18}>` สไตล์การ์ดมืด Ink พร้อมเงาแข็ง `shadow="lg"`
     - แถบหัวข้อกราฟ: แสดงป้ายแท็ก `<CalmText variant="mono" size={11} color={colors.accent}>` คำว่า `ASSET ALLOCATION`
     - ปรับสีแกนกลางและรอยต่อของกราฟ: `innerCircleColor={colors.ink}` และ `strokeColor={colors.ink}` เพื่อให้กลมกลืนกับพื้นหลังการ์ดมืด 100%
     - ป้ายตรงกลางวงโดนัท: ใช้ `<CalmText variant="mono" size={10} color={colors.muted}>` ("มูลค่ารวม") และ `<CalmText variant="display" size={16} color={colors.surface}>`
     - ป้ายอธิบาย (Legend): คั่นด้วย `<DashedDivider color={colors.shadow} marginVertical={10} />` และแสดงชื่อสินทรัพย์ด้วย `<CalmText variant="bodyBold" size={12} color={colors.surface}>` พร้อมสัดส่วนเปอร์เซ็นต์ด้วย `<CalmText variant="mono" size={12} color={colors.surface}>`
     - รักษากฎ Single Minor Callout Suppression และสีของชิ้นข้อมูล (Slice colors) ไว้สมบูรณ์ 100%
  4. ปรับปรุง Section Header "สินทรัพย์หลัก":
     - ใช้ `<CalmText variant="display" size={18} color={colors.ink}>` สำหรับหัวข้อ
     - ขวามือเป็นปุ่มลิงก์สไตล์ `<Pill kind="ink">` ("ดูทั้งหมด →") เพื่อนำทางไปยังแท็บ Holdings
  5. ปรับปรุงการ์ดพรีวิวสินทรัพย์ 3 อันดับแรก (Top 3 Holdings Cards):
     - ห่อหุ้มด้วย `<Card shadow="md" padding={14}>`
     - แถวบน: แสดงชื่อหุ้นด้วย `<CalmText variant="display" size={24} color={colors.ink}>`, ป้ายประเภทสินทรัพย์ (`Pill kind="ink"` หรือ `outline`), และป้ายสัดส่วนพอร์ต (`Pill kind="accent">` เช่น `28.5%`)
     - แถวกลาง: แสดงมูลค่าตลาดด้วย `<CalmText variant="display" size={16} color={colors.ink}>` ควบคู่กับกำไร/ขาดทุน (P/L) ด้วย `<CalmText variant="mono" size={12}>` พร้อมสีและสัญลักษณ์ glyph `▲`/`▼` คำนวณจาก `trend()`
     - แถวล่าง: แสดงจำนวนหุ้น/หน่วยลงทุนด้วย `<CalmText variant="monoRegular" size={11} color={colors.muted}>` พร้อมรองรับ Privacy Mode
  6. ปรับปรุงปุ่ม "ดูสินทรัพย์ทั้งหมดอีก...":
     - เปลี่ยนเป็นปุ่มแคปซูลทรงมน 999: พื้นหลัง `colors.ink`, ขอบ 2px, เงาแข็ง `colors.shadow` 3px 3px
     - ไอคอนใบเสร็จและข้อความใช้สี `colors.accent` สีนวลเขียวมิ้นต์ ฟอนต์ Mono 12px
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 25. Step 3C — มุมมองผลงานพอร์ตและเปรียบเทียบดัชนี (Performance View) ใน Portfolio Screen (`Portfolio.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. ปรับปรุงการ์ดสรุปผลงาน (Performance Hero Card):
     - ห่อหุ้มด้วย `<Card variant="dark" shadow="lg" padding={18}>` สไตล์การ์ดเขียวเข้ม Ink พร้อมเงาแข็ง 6px
     - แถบหัวข้อ: แสดง "ผลตอบแทนสะสม (หุ้น & กองทุน)" ด้วย `<CalmText variant="mono" size={11} color={colors.projected}>` พร้อมป้ายช่วงเวลา `<Pill kind="outlineDark" size="sm">`
     - ตัวเลขผลตอบแทน: แสดงตัวเลขใหญ่ 54px Bricolage Grotesque ด้วย `<CalmText variant="display" size={54} color={isProfit ? colors.accent : colors.lossOnDark}>`
     - แถวล่าง: ป้ายกำไร/ขาดทุนบาทใช้ `<Pill kind={periodPL >= 0 ? 'accent' : 'lossDark'} size="md">` ควบคู่กับยอดเงินต้นลงทุนด้วย `<CalmText variant="monoRegular" size={11} color={colors.surface}>`
  2. ปรับปรุงการ์ดกราฟเปรียบเทียบผลงาน (Performance Line Chart Card):
     - ห่อหุ้มด้วย `<Card shadow="md" padding={16}>`
     - แถบแบนเนอร์ Alpha (ชนะ/ตามหลังตลาด): ทรงแคปซูลมน 999 ขอบหมึก 2px, กรณีชนะตลาดใช้พื้นหลัง `colors.accent` ข้อความสีหมึก, กรณีตามหลังตลาดใช้พื้นหลัง `colors.track` ข้อความสีหมึก
     - ชิปเปรียบเทียบพอร์ตและดัชนี (Comparison Chips): ทรงแคปซูลมน 999 ขอบหมึก 2px พื้นหลัง `colors.surface`, จุดสีดัชนีขนาด 10px ขอบ 1.5px หมึก, ชิปพอร์ตมีสัญลักษณ์สี่เหลี่ยมสีมิ้นต์ `colors.accent`, ปุ่ม `+ เปรียบเทียบ ▾` ขอบ 2px สอดคล้องตามต้นแบบ `08-portfolio-performance.html`
     - กราฟเส้น `LineChart`: เส้นพอร์ตใช้สี `colors.accent` หนา 3px พร้อมพื้นที่ Area Fill สีมิ้นต์โปร่งแสง, เส้นดัชนีตลาดใช้สีประจำดัชนี (เช่น S&P 500 ใช้ `#C7B8F5`), เส้นประแนวนอนและแนวตั้งใช้ `colors.shadow` (`#A9CDB9`), ป้ายสเกล Y-Axis และแกนเวลา Timeline ด้านล่างใช้ฟอนต์ Mono 10px สีหมึก
     - รักษากฎการคำนวณ dynamic tight scale bounds, inception date scaling, และ vertical floor gridlines ไว้สมบูรณ์ 100%
  3. ปรับปรุงแถบเลือกช่วงเวลา (Timeframe Bar):
     - คอนเทนเนอร์แคปซูลมน 999 พื้นหลัง `colors.surface`, ขอบหมึก 2px, padding 4, gap 4
     - ปุ่ม Active: พื้นหลัง `colors.ink`, ตัวหนังสือ `colors.accent` ฟอนต์ Mono 12px
     - ปุ่ม Inactive: พื้นหลังใส, ตัวหนังสือ `colors.ink` ฟอนต์ Mono 12px
  4. ปรับปรุงรายการจัดอันดับผลตอบแทนรายสินทรัพย์ (Asset Performance Rankings):
     - หัวข้อ: `<CalmText variant="display" size={18} color={colors.ink}>`
     - แต่ละรายการห่อหุ้มด้วย `<Card shadow="md" padding={12}>`
     - ซ้าย: อันดับ `#X` ใช้ `<Pill kind="ink" size="sm">`, สัญลักษณ์หุ้น `<CalmText variant="display" size={16}>`, ป้ายประเภทสินทรัพย์ `<Pill kind="outline" size="sm">`, และมูลค่าตลาด `<CalmText variant="monoRegular" size={11} color={colors.muted}>`
     - ขวา: ผลตอบแทน % ใช้ `<Pill kind={isProfit ? 'accent' : 'lossDark'} size="md">` และกำไร/ขาดทุนบาทใช้ `<CalmText variant="mono" size={11} color={trend(plAmount).color}>`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 26. Step 3D — หน้าต่างเลือกดัชนีตลาดเปรียบเทียบ (Benchmark Picker Modal) ใน Portfolio Screen (`Portfolio.tsx`)

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. นำเข้าคอมโพเนนต์ `SheetFrame` จาก `../components/ui/SheetFrame`
  2. ปรับปรุงหน้าต่าง Modal เลือกดัชนี (`isBenchmarkPickerVisible`):
     - ห่อหุ้มโครงสร้างหน้าต่างด้วย `<SheetFrame title="เปรียบเทียบดัชนี" onClose={() => setIsBenchmarkPickerVisible(false)}>`
     - ตัด `modalOverlay`, `benchmarkModalContainer`, และ Header เดิมออก เพื่อให้ Scrim และกรอบ Bottom Sheet สไตล์ Calm Mint ทำงานอย่างเป็นหนึ่งเดียวโดยไม่มีเงาซ้อนทับ
     - แสดงคำอธิบายด้วย `<CalmText variant="monoRegular" size={11} color={colors.muted}>`
     - ปรับแต่งรายการตัวเลือกดัชนี (`benchmarkModalItem`):
       - กรอบตัวเลือก: ขอบหนา 2px, รัศมีความมน 14px, สีพื้นหลัง `colors.surface`
       - ตัวเลือกที่กำลังเปิดใช้งาน: ขอบสีหมึก `colors.ink`, พื้นหลัง `colors.track`
       - วงกลมไอคอนดัชนี: ขอบ 1.5px หมึก พร้อมสีพื้นหลังโปร่งแสงของดัชนีนั้นๆ
       - ตัวอักษรชื่อดัชนีและรายละเอียด: ใช้ `CalmText variant="bodyBold"` และ `CalmText variant="monoRegular"`
       - สัญลักษณ์เครื่องหมายถูก `Ionicons name="checkmark-circle"`: ใช้สีหมึก `colors.ink`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 27. ปรับแต่ง Portfolio Allocation ตาม Feedback & ต้นแบบ HTML 07-portfolio-allocation.html

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Portfolio View Switcher (แคปซูลสลับ สัดส่วน / ผลงานพอร์ต)**:
     - ตัดไอคอน `pie-chart`, `trending-up` และภาษาอังกฤษยาวๆ `(Allocation)` และ `(Performance)` ออก
     - ปรับข้อความเป็น `สัดส่วน` และ `ผลงานพอร์ต` สั้นกระชับตรงตาม `07-portfolio-allocation.html` line 16
     - แก้ปัญหาข้อความยาวจนทับซ้อนหรือเบียดตกขอบได้อย่างสมบูรณ์
  2. **เปลี่ยนสี PieChart (ในหมวดทั้งหมด)**:
     - นำเข้า `chartColors` และเปลี่ยนสีในหมวด `ALL` ให้ตรงตามต้นแบบ HTML:
       - หุ้น: `chartColors.stocks` (`#6FCDA8`)
       - กองทุน: `chartColors.funds` (`#C7B8F5`)
       - เงินฝาก: `chartColors.cash` (`#F2C879`)
  3. **ตัดเส้นโยง (Callout lines) ออกเฉพาะหมวดทั้งหมด**:
     - ตั้งค่า `showExternalLabels={activeCategoryFilter !== 'ALL'}`
     - เมื่อดูภาพรวมทั้งพอร์ต ("ทั้งหมด") จะแสดงเฉพาะวงโดนัทคลีนๆ ไม่มีเส้นโยงลอยเกะกะตรงตาม HTML
  4. **ขยายขนาด PieChart ให้ใหญ่ขึ้นเต็มตา**:
     - เมื่อไม่มีเส้นโยงในหมวดทั้งหมด ปรับ `radius={105}` และ `innerRadius={68}` (เส้นผ่านศูนย์กลาง 210px) สวยงามสมส่วนกับการ์ดเขียวเข้ม Dark Ink
  5. **แก้คำว่า "สินทรัพย์หลัก" เบียดกับปุ่ม "ดูทั้งหมด →"**:
     - ตัดข้อความยาวในวงเล็บ `(X จาก Y รายการ)` ออก เหลือเพียงคำว่า `สินทรัพย์หลัก` ให้มีพื้นที่ว่างกว้างขวาง สบายตา ไม่เบียดปุ่ม
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 28. ตัดเส้นโยงและป้ายนอก PieChart ออกทั้งหมดทุกหมวดตามผลโหวตของผู้ใช้

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **ตัดเส้นโยง (Callout lines) ออกทั้งหมด 100%**:
     - กำหนด `showExternalLabels={false}` สำหรับทุกหมวด (`ALL`, `STOCKS`, `FUNDS`, `CASH`)
     - แก้ไขปัญหากล่องป้ายชื่อหุ้น (เช่น หุ้นชื่อยาว) ตกขอบจอหรือถูกตัดขาดได้อย่างเด็ดขาด 100%
  2. **ขยายขนาดกราฟโดนัทให้เต็มตาทุกหมวด**:
     - กำหนด `radius={105}` และ `innerRadius={68}` คงที่สำหรับทุกหมวด กราฟมีขนาดใหญ่ ชัดเจน สวยงามสไตล์ Calm Mint
  3. **การแสดงผลชื่อและสัดส่วน**:
     - ชื่อหุ้นเต็มๆ, สัดส่วน %, และมูลค่าบาททั้งหมด แสดงผลอยู่ที่ Legend ด้านล่างและ Top 3 Cards ซึ่งมีพื้นที่กว้างขวาง ไม่มีการตัดทอนชื่อตัวอักษรใดๆ
  4. **ปรับพาเล็ตสีหมวดหมู่อย่างกลมกลืน**:
     - สไลซ์ของสินทรัพย์รายตัวใช้พาเล็ตที่ดึงมาจาก `chartColors` ผสมพาสเทล พร้อมขอบตัดหมึก `colors.ink`
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 15. ผลการดำเนินการปรับปรุงกราฟแท่งปันผลและดอกเบี้ย 12 เดือน (Overview Bar Chart) ตาม 03-chart-12m.html

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **หัวข้อและแถบฟิลเตอร์**:
     - เพิ่มหัวข้อส่วน `<CalmText variant="display" size={24} color={colors.ink}>` "กระแสเงินปันผลและดอกเบี้ย 12 เดือน" ด้านบนแถบตัวเลือก
  2. **ส่วนหัวการ์ดสรุปยอด (Header Layout)**:
     - คำระบุปี/ช่วงเวลา ("รวมทั้งปี 2026" / "กระแสเงินสดคาดการณ์ 12 เดือนข้างหน้า") ฟอนต์ `JetBrains Mono` 11px อยู่เหนือตัวเลขยอดรวมขนาดใหญ่ 40px Display
     - แคปซูลขวาบน: `<Pill kind="ink" size="md" label="เฉลี่ย ฿.../ด.">`
     - แถบสรุปยอดรับแล้วและรอรับ: กล่องสี่เหลี่ยมสีหมึกทึบ `■ รับแล้ว ฿...` และกล่องขอบประสีมิ้นต์ `■ รอรับ ฿...`
     - เส้นประคั่น `<DashedDivider color={colors.shadow} marginVertical={10} />` ก่อนเริ่มกราฟ
  3. **กราฟแท่ง 12 เดือน ด้วย SVG เวกเตอร์บริสุทธิ์ (`react-native-svg`)**:
     - **เส้นฐานกราฟ (Baseline 2px)**: เส้นทึบสีหมึก `#123D2A` ลากยาวตลอด 12 เดือนที่ระดับ `y = 190`
     - **เส้นประบอกระดับ (Horizontal Gridlines)**: เส้นประ `#A9CDB9` (`strokeDasharray="5, 5"`) 2 ระดับในพื้นหลัง
     - **เดือนที่รับแล้ว (Received)**: แท่งสีหมึกเข้มทึบ `#123D2A` ขอบมน (`rx: 6`)
     - **เดือนปัจจุบัน (Now)**: รางแคปซูลพื้นหลังสี `#D5E6DC` กว้าง 24px โอบรอบแท่ง โดยตัวแท่งเป็นสีเขียวนวลมิ้นต์ `#6FCDA8` ขอบหมึกหนา 2.5px และด้านล่างมีป้ายแคปซูลมนสีหมึกทึบพร้อมข้อความ `▲ Now` สีมิ้นต์
     - **เดือนอนาคต (Projected)**: แท่งสีมิ้นต์สว่าง `#BFE9D3` ขอบเส้นประสีหมึก (`strokeDasharray="4, 3"`)
     - **ตัวเลขบนหัวแท่ง**: ฟอนต์ `JetBrains Mono` 10px Bold สีหมึกคมชัด (รองรับ Privacy Mode)
     - **ชื่อเดือน**: ฟอนต์ `Noto Sans Thai` 11px (ตัวหนาในเดือนปัจจุบันและเดือนที่เลือก)
  4. **การสัมผัสและการเลือกเดือน (Touch Handling)**:
     - Overlay แถว `TouchableOpacity` 12 คอลัมน์ โปร่งแสงครอบบน SVG เพื่อให้รับการแตะนิ้วได้อย่างแม่นยำ 100%
     - แสดงป้ายคำแนะนำ "แตะแท่งกราฟเพื่อดูรายการปันผลรายเดือน" ด้านล่างกราฟ
     - รักษาฟังก์ชันคลี่ดูรายการและปรับยอด (Adjust Dividend Modal) ไว้อย่างสมบูรณ์ 100%
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 16. ผลการดำเนินการแปลงรายละเอียดปันผลรายเดือนเป็น Bottom Sheet Modal ตาม 04-chart-12m-modal.html

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **ย้ายการแสดงผลรายการปันผลรายเดือนออกจาก In-line Card**:
     - หน้า Overview ไม่มีการยืดหดหรือดันคอนเทนต์ลงด้านล่างเมื่อแตะแท่งกราฟ การ์ดคงรูปทรงกะทัดรัดสง่างาม
  2. **สร้าง Bottom Sheet Modal สไตล์ Calm Mint ด้วย `<SheetFrame>`**:
     - เมื่อแตะแท่งกราฟเดือนใดก็ตาม จะเปิด Bottom Sheet สไลด์ขึ้นมาจากด้านล่างพร้อมเงาดำ Scrim ด้านหลัง
     - **Header**: แสดงชื่อเดือนและปี (เช่น `ต.ค. 2026`) ฟอนต์ Display 24px พร้อมป้าย `<Pill kind="accent" size="sm" label="เดือนปัจจุบัน">` และปุ่มกากบาททรงกลม 44px ขอบหมึกหนา 2px
     - **Subheader**: แสดงยอดรวมเดือนขนาดใหญ่ 36px (`฿...`) คู่กับสรุปยอด `รับแล้ว ฿... · รอรับ ฿...` (ฟอนต์ `JetBrains Mono` 11px)
     - **Dashed Divider**: เส้นประคั่นสีเงา `#A9CDB9`
     - **Items List**: รายชื่อหุ้น/กองทุน/เงินฝาก แสดงด้วย `JetBrains Mono` 16px พร้อมชุดป้ายสถานะ `Dividend` / `Interest`, `Received` / `รอรับ`, `Special`, ยอดเงินสุทธิ (บาท และ USD) และไอคอนลูกศร `chevron-forward`
     - **Interaction**: แตะที่แต่ละรายการเพื่อเปิด `AdjustDividendModal` ปรับแก้ DPU / ทำเครื่องหมายพิเศษได้ตามเดิม 100%
     - **Footer**: ข้อความแนะนำ "แตะรายการเพื่อปรับยอดหรือทำเครื่องหมายพิเศษ" กึ่งกลางล่าง
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error ผ่านสมบูรณ์
  - `npm test`: 83/83 unit, security, performance scenarios ผ่านทั้งหมด 100%

---

## 17. ผลการดำเนินการปรับโฉมหน้า Portfolio Screen (Phase 3) ตาม Calm Mint Theme

- **ไฟล์ที่แก้ไข**: `src/screens/Portfolio.tsx`
- **Commits**: `9e2e6f4`, `10f4d5f`, `47f000a`, `e1c8325`, `e0eead6`, `f5b35e2`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Step 3A — ส่วนหัวหน้าจอและ Mode Switcher**:
     - พื้นหลัง `#EAF3EE`, หัวข้อ `พอร์ตการลงทุน` (32px Bricolage Grotesque)
     - แถบสลับโหมดแคปซูล 44px: `สัดส่วน` vs `ผลตอบแทน`
  2. **Step 3B — โหมดสัดส่วนสินทรัพย์ (Portfolio Allocation View)**:
     - Donut Chart สไตล์ Calm Mint ปรับขนาดรัศมี 140px ชัดเจน ตัดเส้นโยง (callout lines) ออกทั้งหมดเพื่อป้องกันปัญหาข้อความทับซ้อนในจอแคบ
     - กล่อง Legend กะทัดรัด พร้อมการ์ดรายการสินทรัพย์ในพอร์ตห่อด้วย `<Card>`
  3. **Step 3C — โหมดผลตอบแทนพอร์ต (Portfolio Performance View)**:
     - การ์ดผลตอบแทนเทียบ Benchmark ห่อด้วย `<Card variant="dark">`
     - แถบเลือก Timeframe แคปซูล (`1M`, `3M`, `6M`, `1Y`, `ALL`)
     - กราฟเปรียบเทียบตลาด (Benchmark Curve) แสดงผลร่วมกับดัชนี (SET, S&P 500 ฯลฯ)
  4. **Step 3D — Benchmark Selector Bottom Sheet Modal**:
     - ปรับมาใช้ `<SheetFrame title="เลือกดัชนีเปรียบเทียบ">` พร้อมตัวเลือกและวงกลมเช็คถูกสีมิ้นต์
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error
  - `npm test`: 83/83 ผ่านทั้งหมด

---

## 18. ผลการแก้ไขปัญหา Layout ชนกันและการแสดงผลในหน้า Overview & Portfolio (Bug Fixes)

- **ไฟล์ที่แก้ไข**: `src/screens/Dashboard.tsx`, `src/screens/Portfolio.tsx`, `src/components/CategoryBreakdownModal.tsx`
- **Commits**: `21fbb7a`, `5ce381a`, `f36305d`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Commit `21fbb7a` — ป้องกันตัวเลขยอดเงินใน Hero Net Worth และ Category Cards ชนกันเมื่อมียอดเงินพอร์ตสูง**:
     - เพิ่ม `adjustsFontSizeToFit` และ `minimumFontScale={0.75}`
     - ปรับเลย์เอาต์ส่วนหัวกระแสเงินสดรายปี (Annual Inflow Header) เป็นแบบซ้อน (Stacked) แทนแนวนอน เพื่อป้องกันไม่ให้ตัวเลขเงินและเปอร์เซ็นต์ทับกับป้ายกำกับ
  2. **Commit `5ce381a` — มาตรฐานการแสดงผล Privacy Mode ในหน้า Portfolio และจัดระเบียบ Legend**:
     - ปรับแก้รายการสินทรัพย์ใต้กราฟ Donut ในหน้า Portfolio เมื่อเปิด Privacy Mode ให้แสดงเป็น `฿•••••• (▲ X.X%)` เหมือนกันทุกหน้า
     - จัดกลุ่มสินทรัพย์ย่อยที่สัดส่วนน้อยเป็น `อื่นๆ (X รายการ)` เพื่อความสะอาดตา
  3. **Commit `f36305d` — แก้ปัญหากล่องสรุปกำไร/ขาดทุนเบี้ยวใน CategoryBreakdownModal**:
     - จัดคอลัมน์ฝั่งซ้าย (ต้นทุนรวม) และฝั่งขวา (มูลค่าตลาดปัจจุบัน) ให้สมมาตรกันด้วย `flex: 1`
     - เพิ่มยอดกำไร/ขาดทุนที่เป็นจำนวนเงินบาทคู่กับเปอร์เซ็นต์
     - ยืดเส้นประคั่น `DashedDivider` ให้เต็มความกว้างกล่อง ไม่เบี้ยวหรือขาดช่วง

---

## 19. ผลการดำเนินการปรับโฉมหน้า Holdings & Transactions Screen (Phase 4)

- **ไฟล์ที่แก้ไข**: `src/screens/AssetsScreen.tsx`, `src/components/AssetSparklineCard.tsx`, `docs/calm/PLAN-HOLDINGS.md`, `docs/calm/PLAN.md`
- **Commits**: `3cf5049`, `e9aba52`, `47df638`, `0e1eb4f`, `8f9d37e`, `2ae3dbf`, `d8144d3`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Step 4A — Header Bar & Mode Switcher (`AssetsScreen.tsx`) [Commit `3cf5049`]**:
     - พื้นหลัง `#EAF3EE`, หัวเรื่อง `สินทรัพย์\n& ธุรกรรม` (32px Bricolage Grotesque / Noto Sans Thai)
     - ปุ่ม Actions ขอบเข้ม: ปุ่มปิดตา (Eye Privacy), ปุ่ม `ส่งออก`, และปุ่ม `นำเข้า CSV` (พื้นเข้ม `#123D2A` ข้อความ `#6FCDA8`)
     - Mode Switcher: รางแคปซูลมน 44px สลับระหว่าง `คงเหลือ (X)` และ `ประวัติ (X)`
  2. **Step 4B — Search Bar, Category Filter Pills & Sort Bottom Sheet Modal (`AssetsScreen.tsx`) [Commit `e9aba52`]**:
     - ช่องค้นหาแคปซูล 44px ขอบเข้ม 2px วางแนวนอนคู่กับปุ่มเรียงลำดับ `มูลค่า ▼`
     - Bottom Sheet เรียงลำดับสไตล์ Calm Mint ด้วย `<SheetFrame>` (มูลค่าสูงสุด, กำไรสูงสุด, ขาดทุนมากสุด, A-Z) ไฮไลต์ `#EAF3EE` พร้อมวงกลมเช็คถูกสีมิ้นต์
     - แถบตัวกรองหมวดหมู่แคปซูลด้วย `<Pill>`: `ทั้งหมด`, `หุ้น`, `กองทุน`, `เงินฝาก`
  3. **Step 4C — Holdings Summary Banner (`AssetsScreen.tsx`) [Commit `47df638`]**:
     - การ์ดสรุปยอดพอร์ตคงเหลือ `<Card variant="surface">` ขอบ 2px `#123D2A` เงา 4px `#A9CDB9`
     - ฝั่งซ้าย: ป้าย `มูลค่ารวม (X รายการ)` 10px JetBrains Mono + ยอดเงิน 28px Bricolage
     - ฝั่งขวา: แคปซูลสีเข้ม `#123D2A` แสดงตัวเลขกำไร/ขาดทุน `+฿190 (0.3%)` สี `#6FCDA8` (หรือ `#F5A593`)
  4. **Step 4D — Asset Holdings Cards & Sparklines (`AssetSparklineCard.tsx`) [Commit `0e1eb4f`]**:
     - การ์ดสินทรัพย์ห่อด้วย `<HardShadow size="md" radius={26}>` พื้นขาว `#FBFFFD` ขอบ 2px `#123D2A`
     - แถวบน: ชื่อหุ้น 24px Bricolage + ป้าย `USD $` (หุ้นสหรัฐฯ) + ปุ่มแคปซูล `แก้ไข`
     - แถวสอง: มูลค่าตลาด 28px Bricolage + กำไร/ขาดทุน 12px mono (`colors.gainOnLight` / `colors.lossOnLight`)
     - เส้นประคั่น `DashedDivider`
     - ตารางสถิติ 3 ช่อง: `จำนวนที่ถือ` | `ต้นทุน` | `ราคาตลาด`
     - แถบ Total Return เมื่อมีเงินปันผลสะสม
     - กราฟ Sparkline 7 วัน: แถบหัวเรื่อง `7 DAYS` พร้อมเปอร์เซ็นต์, เส้นกราฟขอบหมึก `#123D2A` หนา 2px, พื้นที่ใต้กราฟสี `#6FCDA8`/`#F5A593` โปร่งแสง 45%
  5. **Step 4E — Transaction History View & Filter Modals (`AssetsScreen.tsx`) [Commit `8f9d37e`]**:
     - แถบตัวกรองแคปซูล 44px: `ทุกปี ▼` | `ทุกเดือน ▼` | `ทุกประเภท ▼` พร้อมปุ่ม `ล้าง`
     - การ์ดสรุปยอดธุรกรรมรวม 28px Bricolage พร้อมป้ายแคปซูล `X รายการ`
     - การ์ดประวัติรายการธุรกรรมแต่ละไม้: แถวบนแสดงวันที่ทำรายการและป้าย `ซื้อ (BUY)` / `ขาย (SELL)` พร้อมปุ่มกลมแก้ไข 34px, เส้นประคั่น `DashedDivider`, แถวล่างแสดงชื่อหุ้น, จำนวนหุ้น @ ราคา และยอดเงินธุรกรรม
     - แปลง Bottom Sheet ตัวกรองปี/เดือน/ประเภท เป็น `<SheetFrame>` ทั้งหมด
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error
  - `npm test`: 83/83 ผ่านทั้งหมด 100%

---

## 20. ผลการดำเนินการปรับโฉม Add Asset & Cash Deposit Modals (Phase 5)

- **ไฟล์ที่แก้ไข**: `src/components/AddAssetModal.tsx`, `src/components/CashAssetForm.tsx`, `docs/calm/PLAN-ADD-ASSET.md`, `docs/calm/SETUP_LOG.md`
- **ต้นแบบ HTML**:
  - `calm-bundle/add,holding/Calm – เพิ่มสินทรัพย์ (หุ้น)-html/CalmAddStock.dc.html`
  - `calm-bundle/add,holding/Calm – เพิ่มสินทรัพย์ (เงินฝาก)-html/CalmAddCash.dc.html`
- **Commits**: `e23fce5`, `eeee0be`, `2354977`, `932548d`, `00b6d69`, `47a4f8d`
- **รายละเอียดการเปลี่ยนแปลง**:
  1. **Step 5A — FAB Button & Sheet Frame Container (`AddAssetModal.tsx`) [Commit `e23fce5`]**:
     - ปุ่ม FAB กลม 60×60px พื้นเข้ม `#123D2A` ไอคอนเครื่องหมายบวก `#6FCDA8` เงา 4px `#A9CDB9`
     - Scrim สี `rgba(18, 61, 42, 0.45)`
     - Sheet Frame มนบน 30px พื้น `#FBFFFD` ขอบบน 2px `#123D2A` พร้อม Grab handle 44×5px `#A9CDB9`
     - ส่วนหัว: ชื่อหัวเรื่อง `เพิ่มสินทรัพย์ใหม่` (24px) คำบรรยาย 13px สี `#4F6B5C` พร้อมปุ่มปิดกลม 44px ขอบ 2px `#123D2A`
     - เส้นประคั่น `<DashedDivider>`
     - รางแคปซูลเลือกประเภทสินทรัพย์ 3 ตัวเลือก (`หุ้น`, `กองทุน`, `เงินฝาก`)
  2. **Step 5B — Stocks & Mutual Funds Input Form (`AddAssetModal.tsx`) [Commits `eeee0be`, `2354977`, `932548d`, `00b6d69`]**:
     - ช่องค้นหาและพิมพ์ Symbol สไตล์ Calm Mint สูง 48px ขอบ 2px `#123D2A` มน 16px พร้อมปุ่มล้างและผลลัพธ์ Autocomplete
     - ปุ่มเลือก Sector/หมวดหมู่ สไตล์ Calm Mint เงา 3px `#A9CDB9`
     - ปุ่มสลับสกุลเงินย่อข้อความเป็น `🇹🇭 บาทไทย (THB)` และ `🇺🇸 ดอลลาร์ (USD)` ป้องกันข้อความล้น
     - กล่องอัตราแลกเปลี่ยน USD แบบเรียลไทม์ (พื้นหลัง `#EAF3EE`, ขอบ 2px `#123D2A`)
     - ตารางอินพุต 2 คอลัมน์ (จำนวนหุ้น, ราคาต้นทุน, ราคาปัจจุบัน, วันที่ซื้อ, เงินปันผลต่อหุ้น DPU, วันขึ้นเครื่องหมาย XD) ด้วยฟอนต์ JetBrains Mono
     - ป้าย XD Badge สีเข้ม `#1F7A52`
     - การ์ดภาษีหัก ณ ที่จ่าย (Withholding Tax) สไตล์ Calm Mint พร้อมพิลล์ลัด 10% / 15% / 0%
     - ปุ่มบันทึกสินทรัพย์แบบเต็มกว้าง (สูง 54px, พื้นเข้ม `#123D2A`, ตัวอักษร `#6FCDA8`, ขอบ 2px, เงา 4px `#A9CDB9`)
     - Review Confirmation Modal สไตล์ Calm Mint
  3. **Step 5C — Cash Deposit Asset Form (`CashAssetForm.tsx`) [Commit `47a4f8d`]**:
     - ช่องชื่อบัญชี/สถาบันการเงิน สูง 48px ขอบ 2px `#123D2A` มน 16px พื้นหลัง `#FBFFFD`
     - ชิปประเภทเงินฝาก (Segment) 4 ตัวเลือก มนแคปซูล 999px ขอบ 2px ไฮไลต์เข้ม `#123D2A` และอักษรสีมิ้นต์ `#6FCDA8`
     - ช่องจำนวนเงินฝาก และอัตราดอกเบี้ยต่อปี (% p.a.) เป็นตัวเลข JetBrains Mono 15px
     - ช่องวันที่เริ่มฝาก พร้อมป้ายกำกับ `คำนวณดอกเบี้ยตามวันจริง` สี `#1F7A52` และไอคอนปฏิทิน
     - ปุ่มรอบการจ่ายดอกเบี้ย 3 ตัวเลือก (ทุกเดือน, ทุก 6 เดือน, ปีละครั้ง) สูง 56px มน 22px ขอบ 2px
     - การ์ดภาษีดอกเบี้ยหัก ณ ที่จ่าย 20,000 บาท (พื้นหลัง `#EAF3EE`, ขอบ 2px `#123D2A`, มน 22px, ป้ายคำนวณอัตโนมัติ `#6FCDA8`) พร้อมพิลล์สลับ `0% ยกเว้น` / `15% หัก ณ ที่จ่าย`
     - การ์ดพรีวิวดอกเบี้ยสุทธิ (พื้นหลัง `#FBFFFD`, ขอบ 2px `#123D2A`, เงา 3px `#A9CDB9`, ตัวเลข Net Inflow เด่น 18px JetBrains Mono สี `#1F7A52`)
- **การทดสอบความถูกต้อง**:
  - `npx tsc --noEmit`: 0 error
  - `npm test`: 83/83 ผ่านทั้งหมด 100% (39 unit + 27 security + 17 performance scenarios)






















