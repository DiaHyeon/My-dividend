# ข้อความที่ 1: ติดตั้งชุด Calm (ห้ามแก้หน้าจอ)

(วางข้อความด้านล่างให้ AI)

---
งานนี้คือ "คัดลอกไฟล์สำเร็จรูป" เข้าโปรเจกต์ ห้ามเขียนคอมโพเนนต์หรือค่าสีเองเด็ดขาด

กฎ
- ก่อนแก้หรือสร้างไฟล์ บอกฉันก่อนว่าไฟล์ไหน เพราะอะไร (ข้อ 5.7 ใน BRIEF.md)
- ห้ามแก้ไฟล์เดิมใดๆ ในงานนี้ ยกเว้น package.json (ผ่านคำสั่งติดตั้ง) และ App.tsx ซึ่งต้องรอฉันอนุมัติ diff ก่อน
- ห้ามแตะ logic, services, queries, state

ขั้นตอน
1. สร้าง branch feat/calm-theme
2. รัน: npx expo install expo-font @expo-google-fonts/bricolage-grotesque @expo-google-fonts/jetbrains-mono @expo-google-fonts/noto-sans-thai
   (react-native-svg ติดตั้งอยู่แล้ว)
3. คัดลอกไฟล์ในโฟลเดอร์ calm-kit/src/ ทั้งหมดเข้า src/ ของโปรเจกต์ โดยคงชื่อและโครงโฟลเดอร์เดิม
   - src/theme/tokens.ts
   - src/theme/useCalmFonts.ts
   - src/components/ui/*.tsx และ index.ts
   ถ้ามีชื่อไฟล์ซ้ำกับของเดิม ให้หยุดและถามฉัน ห้ามทับ
4. เปิด node_modules/@expo-google-fonts/<แต่ละแพ็กเกจ>/index.d.ts แล้วยืนยันว่ามี export เหล่านี้จริง:
   BricolageGrotesque_800ExtraBold, JetBrainsMono_500Medium, JetBrainsMono_700Bold, NotoSansThai_500Medium, NotoSansThai_700Bold
   ถ้าชื่อต่าง ให้บอกฉัน อย่าเปลี่ยนเอง
5. รัน npx tsc --noEmit และ npm test รายงานผลตามจริง
6. เสนอ diff ขั้นต่ำสำหรับ App.tsx: เรียก useCalmFonts() ต่อจาก hooks เดิม และ
   if (!fontsLoaded) return null; (ใช้ splash ที่มีอยู่ ห้ามเปลี่ยน app.json)
   แสดง diff แล้ว "หยุดรอฉันอนุมัติ" ห้ามแก้เอง
7. ยืนยันว่าไม่มีหน้าจอไหนเปลี่ยนหน้าตา แล้วหยุด
---
