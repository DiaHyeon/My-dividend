# calm-kit

ชุดโค้ดสำเร็จรูปของธีม Calm Mint สำหรับ My dividend (ตรวจ tsc ผ่านแล้วกับ react-native types และยืนยันชื่อ export ของฟอนต์แล้ว
แต่ยังไม่ได้รันในแอพจริง)

## ในชุดมีอะไร
- src/theme/tokens.ts            สี ฟอนต์ รัศมี ขอบ เงา + ฟังก์ชัน trend() สำหรับตัวเลขกำไร/ขาดทุน
- src/theme/useCalmFonts.ts      โหลดฟอนต์ 3 ตระกูล
- src/components/ui/             HardShadow, CalmText, Card, Pill, CapsuleButton, DashedDivider, SheetFrame

## วิธีใช้ (ตามลำดับ)
1. วางโฟลเดอร์ src/ ของชุดนี้ลงในโปรเจกต์ (ไม่มีไฟล์ไหนทับของเดิม)
2. ส่ง docs/PROMPT-1-setup.md ให้ AI -> ตรวจ -> ฉันอนุมัติ
3. ส่ง docs/PROMPT-2-overview.md ทีละข้อความ (2A ถึง 2H) ตรวจทีละข้อ
4. หน้าอื่นๆ ใช้ docs/PLAYBOOK-unseen-pages.md
