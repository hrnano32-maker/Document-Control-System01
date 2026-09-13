# DCS e-Control

ระบบควบคุม DAR, Master List และ Controlled Copy สำหรับการใช้งานจริง โดยใช้ Firebase project `dar-online-form`

## Deploy

```bash
npm ci
npm run lint
npm run build
npx firebase-tools deploy --project dar-online-form --only firestore,storage,functions
```

GitHub Pages deploy เฉพาะ React client ส่วนคำสั่ง Firebase ด้านบน deploy Firestore Rules, indexes, Storage Rules และ Cloud Functions สำหรับลบไฟล์อัตโนมัติ

## ขั้นตอนการทำงาน

1. หน่วยงานสร้าง DAR พร้อมแนบไฟล์ร่างจริง และระบุหน่วยงาน/จำนวนสำเนาที่ต้องแจกจ่าย
2. DCC ตรวจ อนุมัติ และขึ้นทะเบียน Master List
3. DCC อัปโหลด Controlled Copy จริง โดยรายชื่อผู้รับถูกล็อกจาก DAR
4. ผู้รับแต่ละหน่วยงานลงชื่อและดาวน์โหลดได้ครั้งเดียวภายใน 72 ชั่วโมง
5. ใบแจกจ่ายจะพิมพ์ไม่ได้จนกว่าหน่วยงานและจำนวนสำเนาจะรับครบตาม DAR
6. เมื่อรับครบหรือพ้น 72 ชั่วโมง ระบบลบไฟล์จาก Storage แต่เก็บ Audit/ประวัติการรับใน Firestore
7. ผู้ที่หมดเวลาต้องยื่นคำขอใหม่ และ DCC ต้องอัปโหลดไฟล์ใหม่เพื่อออกเลขแจกจ่ายใหม่พร้อมเวลา 72 ชั่วโมงรอบใหม่
