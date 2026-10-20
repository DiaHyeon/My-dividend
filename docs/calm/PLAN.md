# PLAN.md — Calm Mint Theme: Overview Screen

> **Role of this document**: Execution plan only. No code. The implementor must follow
> PROMPT-2-overview.md for rules and this file for precise element mapping.

---

## Global Constraints (ทุกข้อ)

### Files that MUST NEVER be modified
- All files under `src/services/` (logic, queries, calculations)
- All files under `src/utils/` (dateUtils, etc.)
- All files under `src/lib/` (supabase client)
- All files under `src/types/` (database types)
- `package-lock.json` (auto-generated)
- `app.json`, `eas.json`, `tsconfig.json` (ห้ามแก้ app.json เด็ดขาด)
- `supabase/` directory

### Universal File Edit Rules (กฎทุกข้อ)
1. **No Line Numbers**: ห้ามใช้เลขบรรทัดในการอ้างอิงโค้ดหรือสไตล์ (เนื่องจากเลขบรรทัดเลื่อนได้เสมอเมื่อมีการแก้ไข) ให้ค้นหาตำแหน่งองค์ประกอบและบล็อกสไตล์จากชื่อสไตล์ (`styles.<name>`) หรือ JSX element identifier เสมอ
2. **Hex Color Clean-up**: ทำเฉพาะใน style block ของ element ที่ถูกแก้ไขเท่านั้น **ห้ามแตะต้องหรือแปลงสีที่เป็นข้อมูล (data-driven)** เด็ดขาด (เช่น `cat.color`, `cat.bgColor`, สี sector, สีชิ้น PieChart/Donut) หากพบสีข้อมูลที่เป็น hex ให้คงไว้และรายงานแทน สำหรับ style block ที่ถูกแก้หากไม่มี token ที่ตรงกัน ให้รายงานสรุปอย่างชัดเจน
3. **Strict Scope**: ห้ามแตะต้อง logic, query, calculation, state flow หรือ interface เด็ดขาด ปรับแต่งเฉพาะ styling, layout tokens, และ UI component wrappers
4. **CalmText Thai Regex (`฿` Exclusion)**: ใน `CalmText.tsx` ต้องใช้ `const THAI = /[\u0E00-\u0E3E\u0E40-\u0E7F]/;` เพื่อแยกเว้นรหัส `\u0E3F` ซึ่งคือสัญลักษณ์เงินบาท `฿` ไม่ให้ถูกนับเป็นภาษาไทย ทำให้ตัวเลขยอดเงิน (เช่น `฿66,871.74`) ยังคงเรนเดอร์ด้วยฟอนต์ `display` (Bricolage Grotesque) หรือ `mono` (JetBrains Mono) ได้อย่างสมบูรณ์ ไม่ถูกสลับไปเป็นฟอนต์ไทย
5. **Privacy Masked Text Expression**: สำหรับข้อความที่ผ่านการ mask privacy (เช่น ใน 2A, 2D, 2F) ให้ส่ง label หรือ children ให้ `<Pill>` / `<CalmText>` จาก**นิพจน์เดิมที่ผ่านการ mask แล้ว** โดยเด็ดขาด ห้ามสร้างสตริงใหม่หรือเขียนตรรกะ mask ซ้ำซ้อนขึ้นมาใหม่

### Prerequisites (สิ่งที่ต้องมีก่อนเริ่ม 2A)
ก่อนเริ่มลงมือขั้นตอน 2A ต้องดำเนินการตาม `PROMPT-1-setup.md` ให้เรียบร้อย:
1. ติดตั้งฟอนต์: `@expo-google-fonts/bricolage-grotesque`, `@expo-google-fonts/jetbrains-mono`, `@expo-google-fonts/noto-sans-thai`
2. คัดลอกไฟล์จาก `calm-bundle/calm-kit/src/theme/` และ `calm-bundle/calm-kit/src/components/ui/` เข้ามาไว้ในโฟลเดอร์ `src/` ของโปรเจกต์
3. เรียกใช้งาน hook `useCalmFonts()` ใน `App.tsx` เพื่อให้ tokens (`colors`, `fonts`, `trend`, `chartColors`) และคอมโพเนนต์ (`<Card>`, `<CalmText>`, `<Pill>`, `<CapsuleButton>`, `<DashedDivider>`, `<SheetFrame>`) พร้อมนำเข้าใช้งานได้ทันทีในทุกไฟล์

### Execution Order (ลำดับขั้นตอน 2A → 2H)
ปฏิบัติตามลำดับตัวเลข 2A ถึง 2H ตามข้ออย่างเคร่งครัด (ไม่ใช้ลำดับ 12 ขั้นเดิม):
1. **2A**: `HeroNetWorthCard.tsx` + `Dashboard.tsx` (พื้นหลังหน้า `colors.bg` และข้อความทักทาย header greeting พร้อมปุ่ม logout)
2. **2B**: `Dashboard.tsx` (Category Cards & Section Headers)
3. **2C**: `UpcomingPaydayRadar.tsx` (Payday Radar แนวนอน)
4. **2D**: `Dashboard.tsx` (Chart Header, Filter Bar, Chip XD Cutoff & Modals)
5. **2E**: `Dashboard.tsx` (Bar Chart Colours & Bar Borders)
6. **2F**: `Dashboard.tsx` (Selected Month Detail Pop-out ในหน้า)
7. **2G**: `Dashboard.tsx` (2G-0 การ์ดเป้าหมาย Passive Income) + Overview Modals (`AdjustDividendModal.tsx`, `AnnualComparisonSheet.tsx`, `GoalSettingsModal.tsx`, `CategoryBreakdownModal.tsx`)
8. **2H**: `App.tsx` (Bottom Tab Bar, StatusBar & ตรวจสอบ FAB)

---

## 2A — Hero Net Worth & Header Greeting (`HeroNetWorthCard.tsx` & `Dashboard.tsx`)

### Files to edit
- `src/components/HeroNetWorthCard.tsx`
- `src/screens/Dashboard.tsx` (พื้นหลังหน้า `styles.container`, สไตล์ข้อความทักทาย greeting header, และปุ่ม logout)

### Element mapping

| Current element (code location) | New Calm component / token | Notes |
|---|---|---|
| `styles.container` ใน Dashboard (`backgroundColor: '#F8FAFC'`) | `backgroundColor: colors.bg` (`#EAF3EE`) | ทำในข้อ 2A |
| `styles.screenTitle` ("My Dividend") | `<CalmText variant="display" size={36}>` | คงข้อความเดิม |
| `styles.screenSubtitle` ("Good afternoon, ...") | `<CalmText variant="monoRegular" size={12} color={colors.muted}>` | คงข้อความเดิม |
| ปุ่ม logout ใน Dashboard (`styles.logoutBtn`) | พื้นหลัง `colors.surface`, ขอบ `borderWidth: 2, borderColor: colors.ink`, รัศมี `borderRadius: 999`, ขนาด 46 (`width: 46, height: 46, alignItems: 'center', justifyContent: 'center'`) | ไอคอน `Ionicons name="log-out-outline"` สี `colors.lossOnLight`, ขนาด 22 |
| `styles.heroCard` (`backgroundColor: '#0F172A'`, `borderRadius: 20`) | `<Card variant="dark" shadow="lg" padding={18}>` | Card จาก `ui/Card.tsx` |
| `styles.heroLabel` (`Text`, `fontSize: 12`, `color: '#94A3B8'`) — "มูลค่าพอร์ตรวม (Total Net Worth)" | `<CalmText variant="mono" size={11} color={colors.surface}>` | |
| ไอคอนตา (`Ionicons`) | สองสถานะ: privacy เปิด (`isPrivateMode === true`) = `colors.accent`, ปิด (`false`) = `colors.surface` | คง `onPress={onTogglePrivateMode}`, `hitSlop`, `activeOpacity` |
| `styles.heroValue` (`Text`, `fontSize: 28`, `fontWeight: '800'`, `color: '#FFFFFF'`) — net worth number | `<CalmText variant="display" size={36} color={colors.surface}>` | **เริ่มที่ size 36**; คง `numberOfLines={1}`; ปรับแก้ `styles.heroValueRow.minHeight` ได้เฉพาะถ้าจำเป็น; ทดสอบกับ `฿12,345,678.90` และโหมด privacy (`฿••••••`) |
| `styles.plBadge` + `plBadgeProfit` / `plBadgeLoss` — unrealized P/L % badge | `<Pill size="md" kind="accent">` สำหรับกำไร (ใส่ glyph `▲`), `<Pill size="md" kind="lossDark">` สำหรับขาดทุน (ใส่ glyph `▼`), และ `<Pill size="md" kind="accent">` สำหรับค่า 0 (ไม่มี glyph) | แทนที่ `plBadge` View + `plBadgeText` Text ด้วย `<Pill size="md">` ตัวเดียว |
| `styles.yoyBadge` — "ปีแรก ⓘ" / YoY % tappable badge | `<Pill kind="outlineDark" onPress={onOpenAnnualComparison}>` | คง `hitSlop` และ handler |
| `styles.dividendHighlightBox` (`backgroundColor: '#1E293B'`, `borderColor: '#334155'`) | คงโครงสร้าง JSX เดิม ปรับ `borderColor: colors.shadow`, `borderWidth: 2`, `backgroundColor: 'transparent'` | |
| ไอคอน cash/wallet ในกล่อง highlight | สี `colors.accent` | |
| ป้ายกำกับในกล่อง yield (`dualYieldCurrentLabel`, `dualYieldYoCLabel`) และ "กระแสเงินสดรับคาดการณ์/ปี" (`dividendHighlightLabel`) | สี `colors.projected` | คงข้อความเดิม |
| `styles.dividendHighlightValue` (`fontSize: 15`, `color: '#34D399'`) — annual cashflow number | `color: colors.accent`, `fontFamily: fonts.display` | |
| `styles.dualYieldYoCVal` / current yield val | `color: colors.accent` | |
| `styles.heroBottomRow` `borderTopColor: '#1E293B'` — horizontal divider | แทนที่ `borderTopWidth` ด้วย `<DashedDivider color={colors.accent} />` | |
| `styles.heroStatLabel` (`fontSize: 10`, `color: '#94A3B8'`) — "ต้นทุนรวม", "P/L", "ผลตอบแทนรวม" | `<CalmText variant="monoRegular" size={11} color={colors.projected}>` | |
| `styles.heroStatValue` + `profitTextLight` / `lossTextLight` — P/L and total return numbers | สีและ glyph จาก `trend(value, true)` — ต้องแสดง ▲ / ▼ | |

### Must preserve (DO NOT TOUCH)
- `React.memo` wrapper
- All props interface, destructured props, all calculation logic
- `onTogglePrivateMode`, `onOpenAnnualComparison` handlers
- `numberOfLines={1}` บน `<Text>` ทุกตัว
- `formatMoney()` calls
- `isPrivateMode` conditional masking text

### Discrepancies and Sizing Adjustments
- ขนาดตัวเลข Net worth: เริ่มต้นที่ `size={36}` (ไม่เริ่มที่ 40) เพื่อลดความเสี่ยงข้อความล้น
- `styles.heroValueRow.minHeight`: แก้ไขเฉพาะถ้าเกิดการตัดข้อความ (clipping) เท่านั้น ทดสอบทั้งกรณีตัวเลขยาว `฿12,345,678.90` และข้อความ privacy masking `฿••••••`

### Risks
1. **`<Card>` shadow offset**: `HardShadow` เรนเดอร์เป็น sibling ด้านหลัง ตรวจสอบ parent `View` ใน Dashboard ให้มี `marginBottom` เพียงพอไม่ให้เงาทับการ์ดล่าง
2. **Pill แทนที่ View+Text**: `<Pill>` รับ label string ค่า glyph ให้ผสานใน string ส่วนกรณีค่าเป็น 0 ให้ใช้ `kind="accent"` และไม่ต้องใส่ glyph

### Acceptance criteria
- เปิดแอป → Overview → การ์ด Hero มีพื้นหลังเขียวเข้ม ink, ตัวเลขสีเขียวมิ้นต์ accent
- พื้นหลังหน้าจอเป็น `colors.bg` (`#EAF3EE`), ข้อความทักทายปรับสไตล์เรียบร้อย
- ปุ่ม logout เป็นพื้น `colors.surface`, ขอบ ink 2, ไอคอนสี `colors.lossOnLight`, รัศมี 999, ขนาด 46
- กดสลับ Privacy Mode → ไอคอนตาแสดงสี `colors.accent` เมื่อเปิดโหมด และ `colors.surface` เมื่อปิดโหมด; ข้อความถูก mask และ layout ไม่ขยับ/jitter พร้อมรองรับตัวเลขยาว `฿12,345,678.90` ด้วย `size={36}`
- พอร์ตกำไร → `<Pill size="md" kind="accent">` พร้อม glyph `▲`
- พอร์ตขาดทุน → `<Pill size="md" kind="lossDark">` พร้อม glyph `▼`
- พอร์ตเท่าทุน (ค่า 0) → `<Pill size="md" kind="accent">` ไม่มี glyph
- ป้ายกำกับในกล่อง yield และ "กระแสเงินสดรับคาดการณ์/ปี" แสดงสี `colors.projected`
- แตะป้าย YoY → เปิด `AnnualComparisonSheet` ได้ตามปกติ

---

## 2B — Category Cards & Section Headers (`Dashboard.tsx`)

### Files to edit
- `src/screens/Dashboard.tsx` (หมวด Category cards, Section headers, ปุ่ม "ดูพอร์ตเต็ม →", และสไตล์ที่เกี่ยวข้อง)

### Element mapping

| Current element | New Calm component / token |
|---|---|
| `styles.categoryCard` (`backgroundColor: '#FFFFFF'`, `borderRadius: 18`) | `<Card shadow="md" padding={14} onPress={handler}>` |
| `styles.categoryPL` — P/L % text per category | `<CalmText variant="mono" size={12} color={trend(v).color}>{trend(v).glyph} text</CalmText>` |
| Allocation % text (`styles.categoryHeaderRight`) | `<Pill kind="outline" label={`${pct}%`}>` — **ใช้ Pill เฉพาะกับข้อความ % ตัวเดียวเท่านั้น ไม่ใช่ทั้งกลุ่ม** |
| `Ionicons name="chevron-forward"` | **คงลูกศร `›`** เป็น tap indicator ไว้ด้านขวา |
| Category icon badge | แมป `chartColors` ตามชนิดสินทรัพย์ (`cat.type === 'STOCKS' ? chartColors.stocks : cat.type === 'FUNDS' ? chartColors.funds : chartColors.cash`) **ไม่ใช่ตามลำดับ index**; **แทนเฉพาะสีพื้นไอคอนใน style block ไม่ลบหรือแก้ไข `cat.bgColor` ในข้อมูล**; ตัวไอคอนใช้สี `colors.ink` |
| `styles.categoryValue` — market value number | `<CalmText variant="display" size={26}>` |
| `styles.categoryInflowText` — dividend/interest per year (YoC) | `<CalmText variant="monoRegular" size={11}>` |
| `styles.progressBarBackground` (`height: 3`, `backgroundColor: '#F1F5F9'`) | `View` กำหนด `height: 12`, `borderWidth: 2`, `borderColor: colors.ink`, `borderRadius: 999`, `backgroundColor: colors.track`, `overflow: 'hidden'` |
| `styles.progressBarFill` — colored fill | `backgroundColor: chartColors.stocks / chartColors.funds / chartColors.cash` per category |
| `styles.seeAllBtnText` "ดูพอร์ตเต็ม →" | `<Pill kind="ink" size="md" onPress={handler}>` |
| `styles.sectionTitle` — หัวข้อ section ภาษาไทย | ใช้ `<CalmText variant="bodyBold">` หรือกำหนด `fontFamily: fonts.thaiBold` อย่างเดียว (**ห้ามตั้ง `fontWeight` คู่กับ `fonts.thaiBold` เด็ดขาด**) |

### Must preserve
- Loop `categories.map((cat) => ...)` และโครงสร้างข้อมูลหมวดหมู่ทั้งหมด
- Handler `onPress` ในการนำทาง
- `cat.icon`, `cat.color`, `cat.bgColor` (คงไว้ใน data object ห้ามลบ `cat.bgColor`), `cat.count`
- `Ionicons name="chevron-forward"` tap indicator (คงลูกศร `›` ไว้เสมอ)
- `formatMoney()` calls, `numberOfLines`, `ellipsizeMode`

### Acceptance criteria
- การ์ดหมวดหมู่ 3 การ์ดมี Hard shadow และแถบ progress bar หนาขึ้น (height 12, border 2 ink)
- Allocation % ใช้ Pill ครอบเฉพาะตัวเลข % เดี่ยวๆ และยังคงลูกศร `›` อยู่
- ไอคอนหมวดหมู่แมปสีพื้นหลังจาก `chartColors` ตามชนิดสินทรัพย์ STOCKS/FUNDS/CASH อย่างถูกต้อง โดยแทนเฉพาะใน style และคง `cat.bgColor` เดิมไว้
- หัวข้อภาษาไทยใช้ CalmText หรือ `fontFamily: fonts.thaiBold` โดยไม่ตั้ง fontWeight คู่กัน
- ปุ่ม "ดูพอร์ตเต็ม →" เรนเดอร์เป็น ink Pill

---

## 2C — Payday Radar (`UpcomingPaydayRadar.tsx`)

### Files to edit
- `src/components/UpcomingPaydayRadar.tsx`

### Element mapping

| Current element | New Calm component / token |
|---|---|
| เลย์เอาต์การเลื่อน | **คงแนวนอนไว้ตามเดิม** (`ScrollView horizontal={true}`) — ห้ามเปลี่ยนเป็นแนวตั้ง |
| `ScrollView` contentContainerStyle | **เพิ่ม `paddingBottom: 8` และ `paddingRight: 8` (หรือ `>= 8`)** เพื่อป้องกันเงา HardShadow โดนขอบตัด |
| ตัวคั่น (Divider) | **ไม่เพิ่ม divider** ระหว่างรายการแนวนอน |
| `styles.radarCard` | `<Card shadow="md" padding={16}>` |
| `styles.radarSymbol` | `<CalmText variant="mono" size={16}>` |
| `styles.radarTypeTagXd` "วัน XD" | `<Pill kind="outline" label="วัน XD">` |
| `styles.radarTypeTagPay` "เงินเข้า" | `<Pill kind="ink" label="เงินเข้า">` |
| `styles.confirmPayBtn` "เงินเข้าแล้ว" | `<CapsuleButton variant="surface" label="เงินเข้าแล้ว" onPress={handler}>` |
| Amount and date text | `<CalmText variant="mono">` |

### Must preserve
- `React.memo`, props ทั้งหมด, handlers ทั้งหมด, ตรรกะ `canConfirmPayment`
- การเรนเดอร์เงื่อนไข `item.currency === 'USD'`
- `fallbackClosest` empty state, `ScrollView horizontal`
- `key` props

### Acceptance criteria
- การ์ด Radar มี Hard shadow, ฟอนต์ mono สำหรับชื่อหุ้น/ยอดเงิน, และ Pill badges
- เลื่อนแนวนอนได้อย่างราบรื่น เงาการ์ดไม่ถูกขอบ ScrollView ตัดขาดทั้งด้านล่างและด้านขวา
- ไม่มีการแทรก Divider ที่ไม่จำเป็น

---

## 2D — Chart Header, Filter Bar & Modals (`Dashboard.tsx`)

### Files to edit
- `src/screens/Dashboard.tsx` (chart header, filter bar, chip XD cutoff, และ modal ตัวกรอง)

### Element mapping

| Current element | New Calm component / token |
|---|---|
| `styles.filterDropdownBtn` | `<Pill kind="outline" size="md" onPress={handler}>` |
| `styles.yearSelectorContainer` | คงปุ่มลูกศรไว้; แสดงปีด้วย `<Pill kind="outline" size="md">` |
| Chip "XD Cutoff" (`styles.cutoffPill` หรือเทียบเท่า) | `<Pill kind="outline" size="md" onPress={handler}>` (แมปเป็น Pill outline โดยคงพฤติกรรมการ toggle เดิมไว้ครบถ้วน) |
| `styles.chartCard` | `<Card shadow="md" padding={16}>` |
| `styles.chartTotalAmount` | `<CalmText variant="display" size={40}>` |
| `styles.chartAvgText` | `<Pill kind="ink" size="md" label={...}>` |
| จุด Legend (เดิมวงกลม) | สี่เหลี่ยมขนาด 14px: ได้รับแล้ว = `colors.ink`, คาดการณ์ = `colors.projected` พร้อม `borderWidth: 2` + `borderColor: colors.ink` |
| Inflow filter modal & Year picker modal | ห่อด้วย `<SheetFrame>`. **สำคัญ**: ลบ backdrop/overlay `View` เดิมของ modal ออกก่อน เพื่อป้องกัน scrim ซ้อนกัน และสำหรับ modal ที่มีช่องกรอก (input fields) **`KeyboardAvoidingView` ต้องห่อ `SheetFrame` เป็นชั้นนอกสุดภายใน `<Modal>`** พร้อมคง `ScrollView` เดิมไว้ |
| ข้อความที่ผ่านการ mask privacy | ส่ง label หรือ children ให้ `<Pill>` / `<CalmText>` จาก**นิพจน์เดิมที่ mask แล้ว** โดยเด็ดขาด ห้ามสร้างสตริงใหม่ |

### Must preserve
- State ของตัวกรองทั้งหมด, การเลื่อนปี, handler เปิด/ปิด modal, พฤติกรรมการ toggle cutoff
- `KeyboardAvoidingView` และ `ScrollView` เดิมภายใน modal
- นิพจน์ privacy masking เดิม

### Acceptance criteria
- แถบฟิลเตอร์ใช้ outline Pills, ยอดรวมชาร์ตใช้ฟอนต์ display
- ชิป "XD Cutoff" แสดงเป็น Pill outline และกดสลับสถานะได้ตามปกติ
- สัญลักษณ์ Legend เป็นสี่เหลี่ยม 14px ตามข้อกำหนด
- Modal ตัวกรองถูกห่อด้วย SheetFrame โดยไม่มีปัญหา scrim ซ้อนทับกัน และมี KeyboardAvoidingView ห่อ SheetFrame ชั้นนอกสุดเมื่อมี input
- ข้อความ privacy mask ใช้ค่าจากนิพจน์เดิม

---

## 2E — Bar Chart Colours & Bars (`Dashboard.tsx`)

### Files to edit
- `src/screens/Dashboard.tsx` (สไตล์แท่งชาร์ตและการแสดงผล)

### Note: Bars are custom `<View>` elements, NOT react-native-gifted-charts

| Bar state | New colour & border rules |
|---|---|
| ตำแหน่งขอบ (Border) | **ขอบอยู่ที่ตัวแท่ง (`borderWidth: 2, borderColor: colors.ink`) ไม่ใช่อยู่ที่ track** |
| แท่งที่ได้รับแล้ว (Received) | `backgroundColor: colors.ink`, `borderWidth: 2`, `borderColor: colors.ink` บนตัวแท่ง |
| แท่งเดือนปัจจุบัน (Current) | `backgroundColor: colors.accent`, `borderWidth: 2`, `borderColor: colors.ink` บนตัวแท่ง |
| แท่งคาดการณ์ (Projected) | `backgroundColor: colors.projected`, `borderWidth: 2`, `borderColor: colors.ink` บนตัวแท่ง |
| แท่งค่า 0 | **ไม่ใส่ขอบ (`borderWidth: 0`) และห้ามแก้สูตรความสูงเดิม (ถ้าโค้ดเดิมมี `minHeight` ให้คงไว้ตามเดิมและรายงาน ห้ามบังคับเปลี่ยนเป็น height: 0)** |
| รางหลังแท่งเดือนปัจจุบัน | **ทำเฉพาะถ้าง่ายและไม่ซับซ้อน ไม่งั้นให้ข้าม** |
| รางพื้นหลังปกติ (Empty track) | `backgroundColor: colors.track` |
| ตัวเลขเหนือแท่ง | `fontFamily: fonts.mono`, `color: colors.ink`, `fontSize: 11` |
| ป้ายชื่อเดือน | `fontFamily: fonts.thai`, `fontSize: 11` |
| ป้าย "Now" | `backgroundColor: colors.ink`, `color: colors.accent` |

### Must preserve
- Loop คำนวณความสูงแท่ง, สูตรความสูงเดิมและ minHeight (ถ้ามี), ตรรกะการเลือกเดือน, และการซ่อนยอดใน privacy mode

### Acceptance criteria
- สีแท่งชาร์ตถูกต้องตามสถานะ (เข้ม/มิ้นต์/โปรเจกต์)
- ขอบแสดงอยู่บนตัวแท่งกราฟ แท่งที่ค่าเป็น 0 ไม่มีขอบ (`borderWidth: 0`) และสูตรความสูงเดิมคงไว้ครบถ้วน (รายงาน minHeight ถ้ามี)
- ฟอนต์ตัวเลขและชื่อเดือนเป็นไปตาม Calm theme token โดยมีขนาดขั้นต่ำ 11

---

## 2F — Selected Month Detail Pop-out (`Dashboard.tsx`)

### Note: เป็น inline `<View>` pop-out ภายในหน้าจอเดิม — ห้ามสร้าง Modal โดยเด็ดขาด

| Current element | New Calm component / token | Notes |
|---|---|---|
| กรอบกล่อง Detail | `backgroundColor: colors.surface`, `borderWidth: 2`, `borderColor: colors.ink` | คง pop-out ในหน้า ห้ามทำเป็น modal |
| หัวข้อเดือน & ยอดรวม | ปรับสไตล์เป็น `<CalmText variant="display" size={22}>` | **ไม่แยกยอดรวมออกจากข้อความหัวเรื่อง ปรับสไตล์อย่างเดียว** |
| ป้าย "เดือนปัจจุบัน" | **ไม่เพิ่มป้าย "เดือนปัจจุบัน"** | ตามคำสั่งผู้ใช้ |
| เส้นคั่นรายการ | `<DashedDivider />` | |
| แท็ก "ปันผล" | `<Pill kind="accent">` | |
| แท็ก "ดอกเบี้ย" | `<Pill kind="outline">` | |
| แท็ก "ได้รับแล้ว" | `<Pill kind="ink">` | |
| แท็ก "ปันผลพิเศษ" | `<Pill kind="dashed">` | |
| ข้อความจำนวนเงิน | `fontFamily: fonts.mono` | |
| ข้อความที่ผ่านการ mask privacy | ส่ง label หรือ children ให้ `<Pill>` หรือ `<CalmText>` จาก**นิพจน์เดิมที่ mask แล้ว** โดยเด็ดขาด ห้ามสร้างสตริงใหม่ | |

### Must preserve
- โครงสร้าง inline pop-out ในหน้า (ไม่ใช้ modal)
- การแสดงรายการหุ้น, handler เปิด modal ปรับปรุงเงินปันผล, นิพจน์ privacy masking เดิม, การแสดงผล USD แบบคู่

### Acceptance criteria
- แตะแท่งเดือนแล้วกล่อง detail ขยายแสดงในหน้าพร้อมขอบสี ink และเส้นคั่นประ
- ไม่มีการสร้าง Modal ใหม่, ไม่มีการเพิ่มป้ายเดือนปัจจุบัน, ข้อความหัวเรื่องและยอดยังคงรูปแบบเดิม
- ข้อความและยอดเงินที่ถูก mask ดึงจากนิพจน์เดิม ไม่มีการสร้างสตริงใหม่

---

## 2G — Overview Modals & Dashboard Goal Card

### Sub-steps
1. **2G-0 — การ์ดเป้าหมาย Passive Income บน Dashboard (`Dashboard.tsx`)**:
   - การ์ดคอนเทนเนอร์: `<Card shadow="md" padding={14}>`
   - แถบ Progress Bar: ใช้แถบ progress หนาขอบมนตามสไตล์ 2B (`height: 12`, `borderWidth: 2`, `borderColor: colors.ink`, `borderRadius: 999`, `backgroundColor: colors.track`, `overflow: 'hidden'`) โดยมี fill สี `colors.accent`
   - ข้อความเป้าหมายและสถิติ: ใช้ `<CalmText>` tokens
2. **2G-1 — `AdjustDividendModal.tsx`**
3. **2G-2 — `AnnualComparisonSheet.tsx`**
4. **2G-3 — `GoalSettingsModal.tsx`**
5. **2G-4 — `CategoryBreakdownModal.tsx`**:
   - **สำคัญ**: คงสีชิ้นโดนัทตามหมวด sector เดิม (คงสีเดิมของ Pie/Donut Chart ไม่เปลี่ยนเป็นสีเดียว)

### Common modal pattern
- ห่อเนื้อหาด้วย `<SheetFrame title="..." onClose={handler}>`
- **Modal ที่มีช่องกรอก (Input fields เช่น GoalSettingsModal, AdjustDividendModal)**: `KeyboardAvoidingView` ต้องห่อ `<SheetFrame>` เป็นชั้นนอกสุดภายใน `<Modal>` เสมอ (โครงสร้าง: `<Modal><KeyboardAvoidingView ...><SheetFrame ...>...</SheetFrame></KeyboardAvoidingView></Modal>`)
- Input fields → ใช้ `inputStyle` จาก Calm tokens (คง props คีย์บอร์ดและ validation เดิม)
- ปุ่มหลัก → `<CapsuleButton variant="ink">`, ปุ่มรอง → `variant="surface"`
- Progress bars ภายใน modal → สไตล์หนามีขอบ 2B
- Overlay → ตัด backdrop เก่าออกเพื่อไม่ให้ซ้อนทับกับ scrim ของ SheetFrame

### Must preserve
- Handler, mutations, calculations, PieChart data & sector colors, AsyncStorage, และ privacy hook ในทุกไฟล์

### Acceptance criteria
- การ์ดเป้าหมาย 2G-0 บน Dashboard ใช้แถบ progress สไตล์ 2B และกรอบ Card ที่เข้าชุดกัน
- CategoryBreakdownModal แสดงชิ้นกราฟโดนัทด้วยสีตาม sector เดิม ไม่ผิดเพี้ยน
- ทุก Modal เปิดผ่าน SheetFrame พร้อมสไตล์ปุ่มและอินพุตตาม Calm theme
- Modal ที่มี input มี KeyboardAvoidingView ห่อ SheetFrame ชั้นนอกสุดอย่างถูกต้อง

---

## 2H — Bottom Tab Bar, StatusBar & FAB (`App.tsx`)

### Files to edit
- `App.tsx`

| Current element | New Calm component / token |
|---|---|
| พื้นหลัง Tab bar | `colors.surface`, เส้นขอบบน → `<DashedDivider />` |
| Active tab wrapper | `backgroundColor: colors.ink`, `borderRadius: 999`, `paddingHorizontal: 18` |
| Active icon/text colour | `colors.accent` |
| Inactive icon/text colour | `colors.ink` |
| Tab labels | `<CalmText variant="mono" size={11}>` |
| FAB (+) Check | **ค้นหา FAB ใน App.tsx หากไม่เจอให้ข้ามและรายงานสรุป** |
| `<StatusBar>` Check | **ตรวจสอบ `<StatusBar>` ใน App.tsx หากมีและอยู่บนพื้นสว่าง ให้กำหนด `style="dark"` (หรือ `barStyle="dark-content"`) โดยห้ามแก้ไข `app.json` เด็ดขาด** |

### Must preserve
- State การนำทางทั้งหมด, BackHandler, auth logic, error boundary, screen mounting strategy
- **ห้ามแก้ไข `app.json`**

### Acceptance criteria
- Tab bar มีพื้นหลัง surface สีขาวนวล และเส้นขอบประด้านบน
- แท็บที่เลือกมีลักษณะเป็น Pill สี ink พร้อมไอคอนและข้อความสี accent
- แท็บที่ไม่ได้เลือกเป็นสี ink
- StatusBar แสดงไอคอนสีเข้มบนพื้นสว่างโดยไม่มีการแตะต้อง app.json
- ตรวจสอบ FAB ใน App.tsx และรายงานผลอย่างชัดเจน

---

## Item Clarifications & Resolutions (สรุปจุดที่ได้รับการยืนยัน)

| Item | Resolution / User Decision |
|---|---|
| หัวข้อภาษาไทย 2B | **ห้ามตั้ง `fontWeight` คู่กับ `fonts.thaiBold`** ให้ใช้ `<CalmText>` หรือ `fontFamily: fonts.thaiBold` อย่างเดียว |
| กฎ Hex Clean-up | **ทำเฉพาะใน style block ของ element ที่ถูกแก้ไข**; ห้ามแตะต้องสีที่เป็นข้อมูล (`cat.color`, `cat.bgColor`, สี sector, สีชิ้น PieChart) ให้รายงานแทน |
| แท่งค่า 0 ใน 2E | **ไม่ใส่ขอบ (`borderWidth: 0`) และห้ามแก้สูตรความสูงเดิม** (ถ้าโค้ดเดิมมี `minHeight` ให้คงไว้ตามเดิมและรายงาน ห้ามแก้เป็น height: 0) |
| สีหมวดหมู่ 2B | **แมป `chartColors` ตามชนิดสินทรัพย์ `STOCKS`/`FUNDS`/`CASH`** ไม่ใช่ตามลำดับ index; แทนเฉพาะสีพื้นไอคอนใน style block และ**ไม่ลบ `cat.bgColor`** |
| Modal ที่มีช่องกรอก (2D/2G) | **`KeyboardAvoidingView` ต้องห่อ `<SheetFrame>` เป็นชั้นนอกสุดภายใน `<Modal>`** |
| ข้อความ Privacy Mask (2D/2F) | ส่ง label หรือ children ให้ Pill/CalmText จาก**นิพจน์เดิมที่ mask แล้ว** โดยเด็ดขาด ห้ามสร้างสตริงใหม่ |
| ป้าย "เดือนปัจจุบัน" ใน Month Detail | **ไม่เพิ่มป้าย "เดือนปัจจุบัน"** |
| การแยกยอดรวมออกจากหัวเรื่อง Month Detail | **ไม่แยกยอดรวมออกจากข้อความหัวเรื่อง** ปรับเฉพาะสไตล์ |
| ตำแหน่งของ FAB (+) | ตรวจสอบใน `App.tsx` หากไม่พบ ให้ข้ามและรายงาน |
| เลย์เอาต์ Payday Radar | **คงแนวนอนไว้** เพิ่ม `paddingBottom/paddingRight >= 8` ใน contentContainerStyle กันเงาขาด และ**ไม่เพิ่ม divider** |
| สีชิ้นกราฟโดนัทใน CategoryBreakdownModal | **คงสีชิ้นโดนัทตามหมวด sector เดิม** |
| ขนาดตัวเลข Net worth | เริ่มต้นที่ **size 36** ทดสอบกับ `฿12,345,678.90` และ privacy mode |
| ลำดับขั้นตอนการทำงาน | เรียงลำดับ 2A → 2H ตามหมายเลขข้อ โดยพื้นหลังหน้าและข้อความทักทายทำใน 2A |

---

# Phase 3 — Calm Mint Theme: Portfolio Screen (`Portfolio.tsx`)

> **Role of this document**: Execution plan for Portfolio Screen.
> Based on `PLAYBOOK-unseen-pages.md` and design templates `07-portfolio-allocation.html` and `08-portfolio-performance.html`.

---

## Global Constraints for Phase 3

### Files that MUST NEVER be modified
- All files under `src/services/` (`benchmarkService.ts`, `currencyService.ts`, `priceSyncService.ts`, etc.)
- All files under `src/utils/`
- All files under `src/lib/`
- All files under `src/types/`
- `package-lock.json`, `app.json`, `eas.json`, `tsconfig.json`
- `supabase/` directory

### Universal Rules for Phase 3
1. **No Line Numbers**: อ้างอิงโค้ดและสไตล์ด้วยชื่อ element และ style identifier เท่านั้น
2. **Hex Color Clean-up**: ทำเฉพาะใน style block ที่แก้ไข ห้ามแตะ data colors (สี sector, สี pie data, สีดัชนี benchmark)
3. **Strict Scope**: ห้ามแตะ calculation math, inception date logic, snapshot recorder, timeframe slice math
4. **Preserve Gifted Charts scale bounds**: คงค่า `chartScale` (`maxValue`, `stepValue`, `noOfSections`, `mostNegativeValue`, `floorTimelineLabels`) ไว้ 100%

### Execution Order (3A → 3D)
1. **3A**: Header Bar, Privacy Eye & View Switcher (สลับ Allocation / Performance)
2. **3B**: Allocation View (Donut Chart Dark Card, Category Filter Pills, Center Label & Legends, Holdings Preview)
3. **3C**: Performance View (Performance Hero Dark Card, Alpha Banner, Comparison Chips, Timeframe Selector Pills, Ranking List)
4. **3D**: Benchmark Picker Modal (SheetFrame, Benchmark List, Scrim Clean-up)

---

## 3A — Header Bar, Privacy Eye & View Switcher (`Portfolio.tsx`)

### Files to edit
- `src/screens/Portfolio.tsx` (ส่วน Safe Area, Header Bar, ปุ่ม Privacy Mode, และ View Switcher)

### Element mapping

| Current element | New Calm component / token |
|---|---|
| `styles.container` / `styles.safeArea` | `backgroundColor: colors.bg` (`#EAF3EE`) |
| `styles.headerTitle` ("พอร์ตการลงทุน (Portfolio)") | `<CalmText variant="display" size={32} color={colors.ink}>พอร์ตการลงทุน</CalmText>` |
| `styles.headerSubtitle` | `<CalmText variant="monoRegular" size={11} color={colors.muted}>` (แสดงมุมมองปัจจุบัน `ALLOCATION` / `PERFORMANCE` และจำนวนรายการ) |
| ปุ่มตา Privacy (`styles.headerActionBtn`) | ขนาด 46x46, รัศมี 999, ขอบ `borderWidth: 2, borderColor: colors.ink`, พื้น `colors.surface`, เงา `colors.shadow` 3px 3px, ไอคอน `Ionicons` ขนาด 20: เปิดโหมด = `colors.accent`, ปิดโหมด = `colors.ink` |
| แถบสลับมุมมอง (`styles.portfolioViewSwitcher`) | กรอบนอก: รัศมี 999, ขอบ `borderWidth: 2, borderColor: colors.ink`, พื้น `colors.surface`, padding 4, gap 4 |
| แท็บที่เลือก (Active Tab) | พื้นหลัง `colors.ink`, ตัวหนังสือและไอคอน `colors.accent`, รัศมี 999, paddingVertical 10, ฟอนต์ mono |
| แท็บที่ไม่ได้เลือก (Inactive Tab) | พื้นหลังใส, ตัวหนังสือและไอคอน `colors.ink`, รัศมี 999, paddingVertical 10, ฟอนต์ mono |

### Must preserve
- Props `onNavigateToDashboard`, `onNavigateToAssets`, `initialCategoryFilter`
- State `portfolioView`, `isPrivateMode`, `assets.length`
- Handlers `togglePrivateMode()`, `setPortfolioView()`
- `RefreshControl`

### Acceptance criteria
- เปิดแท็บ Portfolio แล้วพื้นหลังเป็นสีนวล `#EAF3EE`
- ส่วนหัวแสดงฟอนต์ Bricolage Grotesque ขนาด 32px คมชัด
- ปุ่มตามีขอบหมึก 2px พร้อมเงา 3px 3px และแสดงสีถูกต้องตามสถานะ Privacy
- แถบสลับมุมมองเป็นแคปซูลคู่ สลับระหว่าง "สัดส่วนพอร์ต (Allocation)" และ "ผลงานพอร์ต (Performance)" ได้อย่างแม่นยำ

---

## 3B — Allocation View: Donut Chart & Holdings Preview (`Portfolio.tsx`)

### Files to edit
- `src/screens/Portfolio.tsx` (ส่วน Donut Chart, Filter Pills, Legends, และ Top 3 Preview)

### Element mapping

| Current element | New Calm component / token |
|---|---|
| แถบฟิลเตอร์หมวดหมู่ (`styles.filterPillsRow`) | แท็บที่เลือก: `<Pill kind="ink" size="md">` <br> แท็บที่ไม่ได้เลือก: `<Pill kind="outline" size="md">` |
| การ์ดกราฟโดนัท (`styles.chartCard`) | `<Card variant="dark" shadow="lg" padding={18}>` |
| หัวข้อในการ์ด | `<CalmText variant="mono" size={11} color={colors.projected}>ASSET ALLOCATION</CalmText>` |
| กราฟโดนัท `PieChart` | คง data เดิม, `innerCircleColor={colors.ink}`, `strokeColor={colors.ink}` (ห้ามแตะต้องสีชิ้นเค้ก) |
| ตรงกลางโดนัท (`centerLabelComponent`) | ข้อความ: `<CalmText variant="mono" size={10} color={colors.shadow}>ทั้งพอร์ต</CalmText>` <br> ยอดเงิน: `<CalmText variant="display" size={28} color={colors.surface}>` |
| เส้นคั่นประ | `<DashedDivider color={colors.shadow} marginVertical={10} />` |
| รายการสัดส่วนด้านล่าง (`styles.legendContainer`) | จุดสีประจำหมวด, ชื่อหมวดหมู่ `<CalmText variant="bodyBold">`, ยอดเงิน `<CalmText variant="mono">` |
| หัวข้อ Section "สินทรัพย์หลัก" | `<CalmText variant="display" size={22} color={colors.ink}>` |
| ปุ่ม "ดูทั้งหมด →" | `<Pill kind="ink" size="md" onPress={...}>` |
| การ์ดสินทรัพย์ Top 3 (`styles.assetCard`) | `<Card shadow="md" padding={14}>` |
| สัญลักษณ์หุ้น, ป้าย USD, ป้ายหมวด | ชื่อหุ้น: `<CalmText variant="display" size={22}>`, USD: `<Pill kind="outline" size="sm">`, หมวด: `<Pill kind="ink" size="sm">` |
| ตัวเลขมูลค่าและ P/L | มูลค่า: `<CalmText variant="display" size={24}>`, P/L: แสดง glyph ▲/▼ สีตาม `trend(v)` |

### Must preserve
- Single Minor Callout Suppression logic
- Pie data mapping & Sector colors
- Navigation handler to AssetsScreen
- Privacy mode masking expressions

### Acceptance criteria
- กราฟโดนัทอยู่ภายในการ์ดเขียวเข้ม Dark Card พร้อมเงา HardShadow 6px
- ชิ้นกราฟโดนัทยังคงสีเดิมทุกชิ้น
- การ์ดสินทรัพย์หลัก 3 รายการใช้ดีไซน์ Card สีขาวขอบหมึก

---

## 3C — Performance View: Benchmark Chart & Rankings (`Portfolio.tsx`)

### Files to edit
- `src/screens/Portfolio.tsx` (Performance Hero Card, Benchmark Chart Card, Timeframe bar, Ranking list)

### Element mapping

| Current element | New Calm component / token |
|---|---|
| การ์ดสรุปผลงาน (`styles.perfHeroCard`) | `<Card variant="dark" shadow="lg" padding={18}>` |
| ป้ายหัวข้อและช่วงเวลา | หัวข้อ: `<CalmText variant="mono" size={11} color={colors.projected}>`, ป้ายช่วงเวลา: `<Pill kind="outlineDark" size="sm">` |
| ตัวเลข % ผลตอบแทนใหญ่ (`styles.perfHeroReturn`) | `<CalmText variant="display" size={54} color={isProfit ? colors.accent : colors.lossDark}>` |
| ยอดกำไรบาท (`periodPL`) | `<Pill kind={isProfit ? 'accent' : 'lossDark'} size="md" label={...}>` |
| การ์ดกราฟเปรียบเทียบ (`styles.perfChartCard`) | `<Card shadow="md" padding={16}>` |
| แบนเนอร์ Alpha (`styles.perfAlphaBanner`) | ชนะตลาด: พื้น `colors.accent`, ขอบ 2px ink, ตัวหนังสือสี ink <br> ตามหลังตลาด: พื้น `colors.track`, ขอบ 2px ink, ตัวหนังสือสี ink |
| ป้าย Legend เหนือกราฟ (`perfChartLegends`) | พอร์ต: `<Pill kind="outline" label="พอร์ตของคุณ (+X.X%)">` <br> ดัชนี: `<Pill kind="outline" label="ดัชนี ▾ ✕">` หรือปุ่ม `เปรียบเทียบ ▾` |
| กราฟเส้น `LineChart` | เส้นพอร์ต: `colors.accent`, เส้นดัชนี: สีประจำดัชนี, เส้นกริด: `colors.shadow` |
| แถบเลือกช่วงเวลา (`styles.timeframeBar`) | กรอบแคปซูลมน 999 พื้น surface ขอบ ink 2px, ปุ่ม Active พื้น ink ตัวหนังสือ accent, Inactive พื้นใส ตัวหนังสือ ink |
| รายการจัดอันดับสินทรัพย์ (`styles.rankingCard`) | `<Card shadow="md" padding={12}>`, อันดับ `#X` เป็น Pill, % ผลตอบแทนใช้ Pill accent/lossDark |

### Must preserve
- `getBenchmarkComparison` data flow & inception date scaling
- Dynamic scale calculations (`chartScale`)
- Floor timeline vertical gridlines & labels
- Benchmark selection state & toggle

### Acceptance criteria
- Performance Hero Card แสดงตัวเลขใหญ่ 54px สีมิ้นต์ชัดเจน
- เส้นกราฟผลตอบแทนแสดงผลราบรื่นโดยที่สเกลและแกนเวลาด้านล่างยังทำงานถูกต้องสมบูรณ์
- แถบ Timeframe `1M`, `3M`, `6M`, `1Y`, `ALL` กดสลับช่วงเวลาได้แม่นยำ

---

## 3D — Benchmark Picker Modal (`Portfolio.tsx`)

### Files to edit
- `src/screens/Portfolio.tsx` (Modal เลือกดัชนีตลาด)

### Element mapping

| Current element | New Calm component / token |
|---|---|
| กรอบ Modal เดิม | ห่อด้วย `<SheetFrame title="เลือกดัชนีตลาดเปรียบเทียบ" onClose={...}>` |
| Backdrop เก่า | ตัด backdrop View เก่าออก เพื่อไม่ให้ซ้อนทับกับ scrim ของ SheetFrame |
| รายการตัวเลือกดัชนี | กรอบมน 14px, ตัวเลือกที่ถูกเลือกมีขอบ `colors.ink` 2px และไอคอนเครื่องหมายถูก |

### Must preserve
- List of benchmarks (`BENCHMARKS`)
- Selection handler `setSelectedBenchmark`
- Dismiss handler

### Acceptance criteria
- Modal เปิดผ่าน SheetFrame พร้อมหัวข้อและปุ่มปิดสไตล์ Calm
- ไม่มีปัญหา scrim ซ้อนทับกัน

---

# Phase 4 — Holdings & Transactions Screen (`AssetsScreen.tsx` & `AssetSparklineCard.tsx`) — ✅ 100% COMPLETE

> **ไฟล์ต้นแบบ**:
> 1. `calm-bundle/design/calm/05-holdings.html` (หน้าถือครองหลัก Tab คงเหลือ)
> 2. `calm-bundle/design/calm/06-holdings-sort-sheet.html` (Bottom Sheet เรียงลำดับ)
> 3. `calm-bundle/add,holding/Calm – Holdings (ประวัติรายการ)-html/CalmHistory.dc.html` (หน้าประวัติธุรกรรม Tab ประวัติ)

## Execution Steps (4A → 4E) — ✅ ALL COMPLETED

### ✅ 4A — Header & Mode Switcher (`AssetsScreen.tsx`) [Commit `3cf5049`]
- พื้นหลังหน้าจอเปลี่ยนเป็น `colors.bg` (`#EAF3EE`)
- หัวข้อหน้า: `สินทรัพย์\n& ธุรกรรม` ฟอนต์ Bricolage Grotesque / Noto Sans Thai ขนาด 34px หนา 800 ชิดซ้าย
- ปุ่ม Actions ด้านขวา:
  - ปุ่มปิดตา (Eye Privacy): แคปซูลขอบเข้ม
  - ปุ่ม `ส่งออก`: แคปซูลขอบเข้ม พื้นขาว `#FBFFFD` ข้อความเข้ม 12px mono
  - ปุ่ม `นำเข้า CSV`: แคปซูลขอบเข้ม พื้นเขียวเข้ม `#123D2A` ข้อความเขียวมิ้นต์ `#6FCDA8`
- แท็บสลับโหมดหลัก (Mode Switcher):
  - แคปซูลรางยาวขอบเข้ม บรรจุ 2 แท็บ: `คงเหลือ (X)` และ `ประวัติ (X)`
  - แท็บที่เลือกมีพื้นหลัง `#123D2A` ข้อความ `#6FCDA8` มุมโค้งมน 999px

### ✅ 4B — Search, Sort & Filter Bar (`AssetsScreen.tsx`) [Commit `e9aba52`]
- แถบค้นหา & ปุ่มเรียงลำดับ (แนวนอนคู่กันตาม `05-holdings.html#L26-L32`):
  - ฝั่งซ้าย: ช่องค้นหาแคปซูลขอบเข้ม 2px ไอคอนแว่นขยาย placeholder
  - ฝั่งขวา: ปุ่มเรียงลำดับแคปซูลสีพื้นผิว `#FBFFFD` ขอบเข้ม `#123D2A` ข้อความ `มูลค่า ▼`
- Bottom Sheet เรียงลำดับ (`06-holdings-sort-sheet.html`):
  - ใช้ `SheetFrame` แสดงรายการ: `มูลค่าสูงสุด`, `กำไรสูงสุด`, `ขาดทุนมากสุด`, `A-Z`
  - ตัวเลือกที่ถูกเลือกมีพื้นหลังไฮไลต์ `#EAF3EE` ขอบเข้ม พร้อมวงกลมเช็คถูกสีเขียวมิ้นต์
- ตัวกรองหมวดหมู่แคปซูล: `ทั้งหมด`, `หุ้น`, `กองทุน`, `เงินฝาก`

### ✅ 4C — Holdings Summary Banner (`AssetsScreen.tsx`) [Commit `47df638`]
- การ์ดสรุปมูลค่ารวมตาม `05-holdings.html#L41-L47`:
  - การ์ด `<Card variant="surface">` พื้นขาว `#FBFFFD` ขอบเข้ม 2px เงาเขียวมิ้นต์ 4px `#A9CDB9` รัศมี 26px
  - ฝั่งซ้าย: ป้ายกำกับ `มูลค่ารวม (X รายการ)` (10px JetBrains Mono) + ยอดเงินรวม 28px Bricolage Grotesque
  - ฝั่งขวา: ป้ายแคปซูลกำไร/ขาดทุน `#123D2A` ข้อความ `#6FCDA8` (หรือ `#F5A593`) แสดง `+฿190 (0.3%)`

### ✅ 4D — Asset Holdings Cards (`AssetSparklineCard.tsx`) [Commit `0e1eb4f`]
- การ์ดห่อด้วย `<HardShadow size="md" radius={26}>` พื้นขาว `#FBFFFD` ขอบเข้ม 2px เงาเขียวมิ้นต์ 4px `#A9CDB9` ตาม `05-holdings.html#L49-L74`:
  - แถวที่ 1: ชื่อหุ้น Symbol 24px Bricolage + ป้าย `USD $` ทางซ้าย, ป้ายแคปซูล `แก้ไข` ทางขวา
  - แถวที่ 2: มูลค่าตลาด 28px Bricolage ทางซ้าย, กำไร/ขาดทุน `+฿151.20 (+1.4%)` 12px mono ทางขวา
  - เส้นคั่น: เส้นประ `DashedDivider` (`#A9CDB9`)
  - แถวที่ 3 (สถิติ 3 ช่อง): `จำนวนที่ถือ` | `ต้นทุน` | `ราคาตลาด` ฟอนต์ mono
  - เส้นคั่น: เส้นประ `DashedDivider` (`#A9CDB9`)
  - แถวที่ 4 (กราฟ 7 วัน): แถบข้อความ `7 DAYS` พร้อม % เปลี่ยนแปลง + กราฟพื้นที่ Sparkline สไตล์ Calm Mint

### ✅ 4E — Transaction History View (`AssetsScreen.tsx`) [Commit `8f9d37e`]
- ปรับเลย์เอาต์ตาม `CalmHistory.dc.html`:
  - แถบตัวกรองแคปซูล 44px: `ทุกปี ▼` | `ทุกเดือน ▼` | `ทุกประเภท ▼` (พื้นผิว `#FBFFFD` ขอบ 2px `#123D2A`)
  - การ์ดสรุปธุรกรรม: `ยอดเงินธุรกรรมรวม (ทุกปี / ทุกเดือน)` ขนาด 28px Bricolage พร้อมป้ายแคปซูลสีเข้ม `X รายการ`
  - การ์ดประวัติแต่ละไม้:
    - แถวบน: วันที่ทำรายการ (เช่น `20 ต.ค. 2569`) ทางซ้าย, ป้ายประเภท `ซื้อ (BUY)` สีมิ้นต์ หรือ `ขาย (SELL)` สีส้ม ทางขวา พร้อมปุ่มกลมแก้ไข 34x34px
    - เส้นประคั่น `DashedDivider`
    - แถวล่าง: ชื่อหุ้น Symbol ขนาด 22px Bricolage + จำนวนหุ้น @ ต้นทุน ทางซ้าย, `มูลค่ารายการ` + ยอดเงิน 22px Bricolage ชิดขวา
  - ตัวเลือกตัวกรองปี/เดือน/ประเภท: ปรับมาใช้ `<SheetFrame>` ทั้งหมดเพื่อความกลมกลืนแบบ Calm Mint 100%


