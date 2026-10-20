# เริ่มที่นี่ (แตก zip นี้ที่ root ของโปรเจกต์ My dividend)

อย่าทิ้งเป็นไฟล์ .zip ให้ AI: แตกออกเป็นโฟลเดอร์ก่อน (AI ใน IDE อ่านไฟล์ในโฟลเดอร์ได้ แต่ไม่ควรให้เปิดไฟล์ zip เอง)
ไฟล์นี้ไม่มี BRIEF.md ให้ใช้ BRIEF.md เดิมของโปรเจกต์ (ต้องอยู่ที่ root)

## ก่อนทำอะไรทั้งหมด (ทำเอง)
    npm test                        # จดจำนวนเทสต์ที่ผ่านไว้
    git status                      # ควรสะอาด ถ้าไม่ ให้ commit WIP
    git add -A && git commit -m "chore: baseline before Calm theme"
    git switch -c feat/calm-theme
แล้วจึงแตก zip นี้ลงโปรเจกต์ และ commit อีกครั้ง: git add -A && git commit -m "docs: add calm design kit"

## ลำดับ
1. วางสกรีนช็อตหน้า Overview ปัจจุบันใน design/current/
2. แชตใหม่: ส่ง docs/calm/PLAN-PROMPT.md  -> ได้ docs/calm/PLAN.md  -> ตรวจ (หรือเอาให้ Claude ตรวจ)
3. แชตใหม่: ส่ง docs/calm/PROMPT-1-setup.md -> ตรวจ -> อนุมัติ diff ของ App.tsx
4. แชตใหม่ทุกข้อ: ส่วนหัวกฎใน docs/calm/PROMPT-2-overview.md + "ทำเฉพาะข้อ 2A ตาม docs/calm/PLAN.md"
   แล้ว 2B ... 2H ทีละข้อ รันแอพตรวจ + npm test + commit ทุกข้อ
5. หน้าอื่น: docs/calm/PLAYBOOK-unseen-pages.md
