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

## 16. ขั้นตอนต่อไป

พร้อมเข้าสู่ **ขั้นตอนที่ 2G-2**:
- ปรับ Sheet เปรียบเทียบผลตอบแทนรายปี `src/components/AnnualComparisonSheet.tsx`
  - ใช้ `<SheetFrame title="เปรียบเทียบผลตอบแทน" onClose={onClose}>`
  - การ์ดและแถบสถิติ: ใช้ `<Card shadow="md">`, `<Pill>`, และ `<CalmText>` tokens
  - ตารางประวัติและรายการสินทรัพย์: เส้นคั่น `<DashedDivider />`









