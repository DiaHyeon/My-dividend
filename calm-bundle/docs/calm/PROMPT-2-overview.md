# ข้อความที่ 2A–2H: ปรับหน้า Overview ทีละส่วน

วิธีใช้: ส่ง "ส่วนหัว" ด้านล่างนำหน้าทุกข้อความ แล้วตามด้วยข้อความย่อยหนึ่งข้อต่อหนึ่งรอบ
ตรวจในแอพจริง (Expo Go) ให้ผ่านก่อนส่งข้อถัดไป และถ้า AI ทำเกิน ให้ git checkout ไฟล์นั้นกลับ

## ส่วนหัว (วางนำหน้าทุกข้อความ)
---
กฎเหล็ก
1. ก่อนแก้ไฟล์ บอกฉันก่อนว่าจะแก้ไฟล์ไหนและเพราะอะไร (ข้อ 5.7 ใน BRIEF.md)
2. แก้เฉพาะไฟล์ที่ระบุในข้อความนี้ ห้ามแก้ logic, services, queries, state, การคำนวณ
3. ห้ามลบ ห้ามย้าย ห้ามเพิ่มองค์ประกอบหรือฟังก์ชัน: คงทุก handler, props, testID, numberOfLines, minHeight เดิม
4. ห้ามเขียนสี/ฟอนต์/รัศมีเอง ใช้เฉพาะ src/theme/tokens.ts และ src/components/ui/*
5. ถ้าต้องเปลี่ยนโครง JSX มากกว่า "ห่อด้วยคอมโพเนนต์" หรือ "เปลี่ยน style" ให้หยุดและถาม
6. ถ้าหาองค์ประกอบในตารางไม่เจอ หรือชื่อไม่ตรง ให้บอกฉัน ห้ามเดา
7. เมื่อเสร็จ: รัน npx tsc --noEmit และ npm test, commit, รายงานไฟล์ที่แก้ แล้วหยุดรอ
ภาพอ้างอิงอยู่ที่ design/calm/ (ใช้ดูหน้าตาเท่านั้น ข้อมูลเป็นตัวอย่าง และภาพละองค์ประกอบของแอพจริงบางอย่าง)
---

## 2A Hero net worth (HeroNetWorthCard.tsx)
อ้างอิง: design/calm/01-overview.html และ 02-overview-loss.html

| องค์ประกอบเดิม | เปลี่ยนเป็น |
|---|---|
| กล่องนอกสุดของ hero | <Card variant="dark" shadow="lg" padding={18}> |
| ข้อความ "มูลค่าพอร์ตรวม (Total Net Worth)" | <CalmText variant="mono" size={11} color={colors.surface}> |
| ไอคอนตา privacy | คงไว้ทุกอย่าง เปลี่ยนแค่สีไอคอนเป็น colors.surface |
| ตัวเลข Net Worth (เช่น ฿66,871.74) | <CalmText variant="display" size={40} color={colors.surface}> (คง numberOfLines=1 และ minHeight เดิม) |
| ป้าย +0.47% (กำไร) | <Pill kind="accent" label={`${glyph} ${text}`}> glyph มาจาก trend(value).glyph |
| ป้าย -0.10% (ขาดทุน) | <Pill kind="lossDark" label=...> |
| ป้าย "ปีแรก ⓘ" / YoY (กดได้) | <Pill kind="outlineDark" onPress={handler เดิม}> |
| กล่องใน (กระแสเงินสดต่อปี + แถว Yield) | คงโครง เปลี่ยน borderColor เป็น colors.shadow, borderWidth 2, พื้นโปร่งใส |
| ตัวเลขกระแสเงินสดต่อปี | สี colors.accent, ฟอนต์ display |
| Yield on Cost | สี colors.accent |
| เส้นคั่นแนวนอนใน hero | <DashedDivider color={colors.accent} /> |
| ป้ายกำกับเล็ก (ต้นทุนรวม, P/L, ผลตอบแทนรวม) | <CalmText variant="monoRegular" size={11} color={colors.projected}> |
| ตัวเลข P/L และผลตอบแทนรวม | สีและ glyph จาก trend(value, true) ต้องมี ▲/▼ |
| ฉากหลังหน้า Dashboard | backgroundColor: colors.bg |
| หัวเรื่อง "My Dividend" | <CalmText variant="display" size={36}> ข้อความเดิม |
| ข้อความ "Good afternoon, ..." | <CalmText variant="monoRegular" size={12} color={colors.muted}> ข้อความเดิม |

จบข้อนี้ ตรวจ 3 สถานะ: ปกติ, ขาดทุน, privacy เปิด (ตัวเลขต้องไม่ทำให้เลย์เอาต์ขยับ)

## 2B การ์ดสัดส่วนหมวดและหัวข้อ (Dashboard.tsx)
อ้างอิง: 01-overview.html (ส่วนสัดส่วนสินทรัพย์)

| องค์ประกอบเดิม | เปลี่ยนเป็น |
|---|---|
| การ์ดหมวด หุ้น/กองทุน/เงินฝาก | <Card shadow="md" padding={14} onPress={handler เดิม}> |
| ไอคอนหมวด, จำนวน (X), ลูกศร › | คงไว้ ไม่ลบ |
| ป้าย P/L ของหมวด | <CalmText variant="mono" size={12} color={trend(v).color}>{glyph} ข้อความเดิม |
| ป้าย % สัดส่วน | <Pill kind="outline" label=...> |
| ยอดมูลค่าหมวด | <CalmText variant="display" size={26}> |
| ข้อความปันผล/ปี (YoC) | <CalmText variant="monoRegular" size={11}> |
| แถบ progress (ราง) | View สูง 12 borderWidth 2 borderColor colors.ink borderRadius 999 พื้น colors.track overflow hidden |
| แถบ progress (ส่วนเติม) | พื้นเป็น chartColors.stocks / chartColors.funds / chartColors.cash ตามหมวด |
| ปุ่ม "ดูพอร์ตเต็ม →" | <Pill kind="ink" size="md" onPress={handler เดิม}> |
| หัวข้อส่วน (สัดส่วนสินทรัพย์ตามหมวดหมู่, กระแสเงินปันผลและดอกเบี้ย 12 เดือน) | <CalmText variant="display" size={22}> ข้อความเดิม |

## 2C Payday Radar (UpcomingPaydayRadar.tsx)
อ้างอิง: 01-overview.html (การ์ด Payday Radar)

| องค์ประกอบเดิม | เปลี่ยนเป็น |
|---|---|
| กล่อง radar | <Card shadow="md" padding={16}> (ห้ามหมุน/เอียง เพราะพื้นที่กดจะเลื่อน) |
| เส้นคั่นแถว | <DashedDivider /> |
| ชื่อสินทรัพย์ | <CalmText variant="mono" size={16}> |
| ป้าย "วัน XD" | <Pill kind="outline" label=...> |
| ป้าย "เงินเข้า" / Paid | <Pill kind="ink" label=...> |
| ปุ่ม "เงินเข้าแล้ว" (1 คลิก) | <CapsuleButton variant="surface" label=... onPress={handler เดิม}> |
| ข้อความ $USD (~฿THB) และวันที่ ~D MMM | คงข้อความและ logic เดิม เปลี่ยนเฉพาะฟอนต์เป็น CalmText mono |

## 2D หัวกราฟ 12 เดือนและแถบกรอง (Dashboard.tsx)
อ้างอิง: design/calm/03-chart-12m.html

| องค์ประกอบเดิม | เปลี่ยนเป็น |
|---|---|
| ปุ่ม dropdown "ทั้งหมด ▾" และตัวเลือกปี ‹ ปี 2026 (ปีนี้) › | <Pill kind="outline" size="md" onPress={handler เดิม}> (คงตัวเลือก Rolling 12M) |
| กล่องกราฟทั้งหมด | <Card shadow="md" padding={16}> |
| ยอดรวมทั้งปี | <CalmText variant="display" size={40}> |
| ป้าย "เฉลี่ย ฿xxx/ด." | <Pill kind="ink" size="md" label=...> |
| คำอธิบาย รับแล้ว / รอรับ | ช่องสี่เหลี่ยม 14px: รับแล้ว = พื้น colors.ink ; รอรับ = พื้น colors.projected ขอบ colors.ink 2px |
| bottom sheet ตัวเลือกกรอง/ปี | ห่อด้วย <SheetFrame> (ดูข้อ 2F) |

## 2E แท่งกราฟ (เฉพาะสี ห้ามเปลี่ยนข้อมูล)
ก่อนแก้ ให้หาว่ากราฟแท่งเรนเดอร์จากที่ไหน (น่าจะ react-native-gifted-charts) และรายงานฉัน
ห้ามเปลี่ยนไลบรารี ห้ามแก้การคำนวณข้อมูลแท่ง (payoutMonthKey, XD cutoff, rolling 12M, special)

| สถานะแท่งเดิม | สีใหม่ |
|---|---|
| รับแล้ว | พื้น colors.ink |
| เดือนปัจจุบัน | พื้น colors.accent ขอบ colors.ink กว้าง 2 ; ป้าย "▲ Now" เดิมเปลี่ยนเป็นพื้น colors.ink ตัวอักษร colors.accent |
| รอรับ/คาดการณ์ | พื้น colors.projected ขอบ colors.ink กว้าง 2 |

- ถ้าไลบรารีทำขอบเส้นประหรือรางหลังแท่งไม่ได้ ใช้ขอบทึบและข้ามราง แล้วแจ้งฉัน ห้ามสร้างกราฟใหม่
- ตัวเลขเหนือแท่งใช้ฟอนต์ fonts.mono ขนาดไม่ต่ำกว่า 11 ; ชื่อเดือนไทยใช้ fonts.thai ขนาด 11
- ตรวจบนจอเล็ก ถ้าชื่อเดือนชนกันให้รายงาน อย่าลดขนาดต่ำกว่า 11 เอง

## 2F Modal รายละเอียดเดือน (กดแท่ง)
อ้างอิง: design/calm/04-chart-12m-modal.html
ใช้ modal เดิม ห้ามสร้างใหม่

| องค์ประกอบเดิม | เปลี่ยนเป็น |
|---|---|
| ตัวห่อ/พื้นหลังของ modal | ภายใน <Modal> เดิม ใช้ <SheetFrame title="ชื่อเดือนเดิม" onClose={handler ปิดเดิม}> ห่อเนื้อหาเดิม |
| ป้าย "เดือนปัจจุบัน" | <Pill kind="accent" label=...> |
| ยอดรวมเดือน | <CalmText variant="display" size={36}> |
| แถวสินทรัพย์ | คงโครงและ onPress เดิม (เปิด AdjustDividendModal) สูงอย่างน้อย 44 ; เส้นคั่นเป็น <DashedDivider /> |
| ป้าย [Dividend] | <Pill kind="accent"> |
| ป้าย [Interest] | <Pill kind="outline"> |
| ป้าย [Received] | <Pill kind="ink"> |
| ป้าย [Special] | <Pill kind="dashed"> |
| ยอด $USD (~฿THB) | คงข้อความเดิม เปลี่ยนเฉพาะฟอนต์ |

## 2G Modal อื่นของหน้า Overview (เฉพาะเปลือก)
ไฟล์: AdjustDividendModal.tsx, AnnualComparisonSheet.tsx, GoalSettingsModal.tsx, CategoryBreakdownModal.tsx
ไม่มีภาพอ้างอิงเฉพาะ ใช้กติกา: ห่อด้วย <SheetFrame> แล้วทำตาม docs/PLAYBOOK-unseen-pages.md ข้อ 3 และ 4
- ช่องกรอกทุกช่อง: ใช้ inputStyle จาก tokens (ห้ามเปลี่ยน keyboardType, validation, onChangeText)
- ปุ่มหลัก: <CapsuleButton variant="ink"> ; ปุ่มรอง: variant="surface"
- แถบ progress (เป้าหมาย passive income, มิเตอร์ดอกเบี้ย 20,000 บาท): สไตล์เดียวกับข้อ 2B
- ทำทีละไฟล์ commit ทีละไฟล์ และหยุดรอหลังทุกไฟล์

## 2H แท็บล่างและปุ่ม + (App.tsx)
อ้างอิง: design/calm/01-overview.html

| องค์ประกอบเดิม | เปลี่ยนเป็น |
|---|---|
| แถบแท็บทั้งแถบ | พื้น colors.surface ; ขอบบนใช้ <DashedDivider /> วางแนบขอบบน (ห้ามใช้ borderStyle dashed ที่ขอบเดียว) |
| แท็บที่ active | View พื้น colors.ink borderRadius 999 paddingHorizontal 18 ; ไอคอนและข้อความสี colors.accent |
| แท็บที่ไม่ active | ไอคอน/ข้อความสี colors.ink |
| ข้อความแท็บ | <CalmText variant="mono" size={11}> ชื่อเดิม (Overview, Portfolio, Holdings) |
| ปุ่ม + ลอย | <CapsuleButton round height={60} variant="ink" hardShadow icon=ไอคอนเดิมสี colors.accent onPress={handler เดิม} accessibilityLabel="เพิ่มสินทรัพย์"> |

ห้ามเปลี่ยนตำแหน่งปุ่ม + ลำดับแท็บ การนำทาง หรือ props ของ navigator
