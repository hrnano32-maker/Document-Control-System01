# DCC e-Control Project Rules & Conventions

## 1. Zero Mock Personal Names (Strict Rule)
- **STRICTLY FORBIDDEN**: Never introduce or display mock/sample personal names (such as "สมหญิง วงศ์สว่าง", "นายสมศักดิ์ ชัยชนะ", "ดร. ธีรเดช", "นายสมชาย", etc.) anywhere in the codebase.
- **Role/Department Titles Only**: User accounts, signatures, and profile titles must only use official department and role names (e.g., "ผู้ควบคุมเอกสาร DCC", "เจ้าหน้าที่ควบคุมเอกสาร / DCC Admin", "ตัวแทนฝ่าย QA", "ตัวแทนฝ่ายบริหาร (QMR)").
- **Empty Real-Name Fields**: When creating a DAR request, downloading a controlled copy, or signing, form inputs for real recipient/requester names must always start empty with a generic placeholder (e.g., "ระบุชื่อ-นามสกุลจริงผู้ยื่นคำขอ") for the actual user to enter.

## 2. No Password Reveals or Cheatsheets (Strict Rule)
- **STRICTLY FORBIDDEN**: Never render password hints, cheatsheets, default password lists, or "ดูรายชื่อบัญชี & รหัสผ่านเริ่มต้น" components anywhere on the login page or within the UI.
- The login page must remain a standard, secure production login form requiring username and password input.

## 3. Clear, High-Legibility Typography & Sizing
- **Comfortable Font Sizes**: Ensure text across Master List tables, DAR cards, distribution lists, and modals is clearly readable and comfortably sized (13px–15px for body/table cells, 16px–24px for section titles). Avoid cramped or tiny micro-text (<11px).
- **Fonts**: Maintain IBM Plex Sans Thai and Plus Jakarta Sans with proper font smoothing and contrast.
