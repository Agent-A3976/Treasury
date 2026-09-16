# ระบบตรวจสอบค่างวด — สรุปสถานะโปรเจกต์ (ส่งต่อเข้า Claude Code)

## Stack
- **Frontend**: React (ไฟล์ HTML เดี่ยว ไม่มี build step — โหลด React/ReactDOM/Babel standalone จาก CDN แล้วแปลง JSX ในเบราว์เซอร์ด้วย `Babel.transform(..., {presets:[["react",{runtime:"classic"}]]})` — **ห้ามใช้ preset แบบ default เพราะ Babel เวอร์ชันใหม่จะ auto-inject import statement ของ JSX runtime แล้วพัง**)
- **Backend**: Supabase (Postgres + Auth + REST API ผ่าน PostgREST) — ไม่ใช้ `@supabase/supabase-js` (ไม่มีให้ใช้ในบาง environment) ยิง REST ตรงด้วย `fetch()` เอง
- **Hosting ปัจจุบัน**: GitHub Pages, repo `Agent-A3976/Treasury` (ไฟล์เดิมของระบบเก่าอยู่ที่ `index.html` ในโฟลเดอร์เดียวกัน — **ห้ามทับไฟล์นี้**)
- **ไฟล์ล่าสุด**: `payment_check_v13.html` (เวอร์ชันต่อ ๆ ไปให้นับเลขต่อ อย่าทับไฟล์เก่า จะได้ rollback ได้ถ้าพัง — รูปแบบ commit ของ repo นี้คือ "rename vN เป็น vN+1" ทับของเก่าออกจาก repo ทุกครั้ง ไม่ใช่เก็บทุกเวอร์ชันไว้)

## Supabase
- Project URL: `https://cymyqbmurimvceddcvwr.supabase.co`
- Publishable key: `sb_publishable_M_RosodL3Y0NjcVeoNFnbg_VcLEWEGL` (ปลอดภัยฝังในโค้ดได้ RLS คุมสิทธิ์จริง)
- **ห้ามใช้ secret/service_role key ในโค้ดฝั่งเว็บเด็ดขาด**

### Schema (5 ตาราง + 1 storage bucket)
- `branches` (branch_id PK, branch_name, is_active) — ตอนนี้มี 3 สาขา: `surat` (มีข้อมูลลูกค้าจริง), `trang`, `maesot` (เพิ่งเพิ่ม ยังว่างเปล่า ไม่มีข้อมูลลูกค้า)
- `users` (user_id UUID = auth.users.id, username, nickname, is_admin, is_active, **phone, contact_email, avatar_url** — 3 คอลัมน์หลังเพิ่มมาพร้อมฟีเจอร์ตั้งค่าบัญชี) — สมัครใหม่ default `is_active=false` ต้องแอดมินอนุมัติ
- `user_branches` (user_id, branch_id) — กำหนดว่า user เข้าสาขาไหนได้
- `contracts` (contract_id BIGINT PK, device_code, branch_id, start_date, total_installments, amount_per_installment, status: active/returned/closed) — **มี partial unique index บังคับว่ารหัสเดียวกัน+สาขาเดียวกัน status='active' ได้แค่ 1 แถวเท่านั้น** (กันบั๊กสัญญาซ้อนที่เจอในข้อมูลเก่า)
- `payments` (payment_id PK, contract_id nullable, installment_number, payment_type, amount, fee, cumulative, slip_amount, payment_date, recorded_by, needs_review, review_reason, possible_duplicate)
- Storage bucket `avatars` (public read) — เก็บรูปโปรไฟล์ที่ path `avatars/<user_id>/avatar.<ext>`

### RLS
- ทุกตารางเปิด RLS แล้ว — เข้าถึงได้เฉพาะ `authenticated` role ที่ `is_active=true`
- แอดมิน (`is_admin()` function) เห็น/แก้ได้ทุกสาขา — user ทั่วไปเห็นเฉพาะสาขาใน `user_branches`
- ฟังก์ชัน `get_email_for_username(p_username)` — SECURITY DEFINER เปิดให้ `anon` เรียกได้ (ใช้แปลงรหัสผู้ใช้เป็นอีเมลจริงตอนล็อกอิน เพราะหน้า login ใช้ username+password ไม่ใช่อีเมล)
- **ผู้ใช้ทั่วไปแก้ไขโปรไฟล์ตัวเองได้แล้ว** (policy `users_update_self`) — แก้ได้แค่ nickname/phone/contact_email/avatar_url เท่านั้น มี trigger `protect_admin_fields` กันไม่ให้แก้ `is_admin`/`is_active` ของตัวเองแม้จะพยายามส่งค่าผ่าน API ตรงๆ ก็ตาม (แอดมินยังแก้ของคนอื่นได้ตามปกติผ่าน policy เดิม)
- Storage bucket `avatars`: insert/update ได้เฉพาะโฟลเดอร์ของตัวเอง (`(storage.foldername(name))[1] = auth.uid()`), select เปิดสาธารณะ

## Login flow (สำคัญ ต้องเข้าใจก่อนแก้)
- ผู้ใช้กรอก "รหัสผู้ใช้" (ไม่ใช่อีเมล) → ระบบเรียก `get_email_for_username` แปลงเป็นอีเมลจริงก่อน → ค่อยยิง `/auth/v1/token?grant_type=password` ด้วยอีเมลนั้น
- สมัครใหม่ต้องกรอกอีเมลจริง (สำหรับ "ลืมรหัสผ่าน" ที่ใช้งานได้จริง) — username เก็บใน `raw_user_meta_data`, มี DB trigger สร้างแถว `users` อัตโนมัติตอนสมัคร

## หน้าที่ทำเสร็จแล้ว (component แยกในไฟล์เดียวกัน)
1. **ตรวจสอบ** (`CheckPage` เนื้อหาหลัก) — ตรรกะตรวจสอบพอร์ตมาจากระบบเดิมครบ (`parsePeriod`/`nestedStatus`/`computePeriodResult_`) เช็คกับ Supabase จริง, เก็บรายการที่ตรวจไว้ใน `localStorage` จนกว่าจะกดล้าง (**ข้อจำกัด: ไม่ sync ข้ามเครื่อง/ผู้ใช้ ต่างจากระบบเดิมที่ sync ผ่านเซิร์ฟเวอร์**)
2. **Dashboard** — แท็บ "วันนี้" (สรุปจากรายการที่กำลังตรวจ) + "รายงานย้อนหลัง" (สรุปช่วงลำดับที่ตรวจ ใช้งานได้จริง / สรุปตามช่วงวันที่ ยังปิดไว้เพราะไม่มีตาราง daily_reports)
3. **Working Reference** — ค้นหา/ดูข้อมูล + นำเข้าข้อมูล (วางจาก Excel, เทียบกับรายการวันนี้ก่อนบันทึก) + **"ย้ายลูกค้าคืนเครื่อง"** (ค้นหาสัญญา active → พรีวิวประวัติ/ยอดรวม/แผนผังงวด → ยืนยันเปลี่ยน `contracts.status` เป็น `returned`) — **หมายเหตุ: ยังไม่มี flow "ย้ายลูกค้าผ่อนจบ" (`closed`) แยกต่างหาก** ทำแค่กรณีคืน/ยึดเครื่องก่อนตามที่ตกลงกัน ถ้าจะทำ flow ผ่อนจบ ให้ก็อปโครงจาก `CloseContractCard` ในไฟล์ (แค่เปลี่ยน status ที่ PATCH กับข้อความ UI)
4. **Archive** — ดูสัญญาที่ปิดแล้ว อย่างเดียว (ยังแก้ไข/ย้ายอะไรไม่ได้)
5. **ตรวจ+ซ่อมงวด** — ค้นหาสัญญา ดู "แผนผังงวด" (กริดสีเขียว/เหลือง/เทา บอกว่าจ่ายถึงงวดไหน ขาดงวดไหน) + ประวัติเต็ม — ยังดูได้อย่างเดียว แก้ไขไม่ได้
6. **Admin** — อนุมัติบัญชีใหม่, toggle is_admin/is_active, มอบหมายสาขา — **ยังไม่กันเหลือแอดมิน 0 คน ไม่กันปิดสิทธิ์ตัวเอง ไม่มีปุ่มรีเซ็ตรหัสผ่านให้คนอื่น**
7. **ตั้งค่าบัญชี (self-service)** — ทุกคนแก้ nickname/เบอร์โทร/อีเมลติดต่อ/รูปโปรไฟล์ของตัวเองได้ (รูปอัปโหลดไฟล์จริงขึ้น Supabase Storage bucket `avatars`) — อีเมลติดต่อเป็นแค่ข้อมูลติดต่อ **ไม่ใช่อีเมลล็อกอินจริง** (เปลี่ยนอีเมลล็อกอินยังไม่รองรับ)
8. **Branch switcher หลัก** (dropdown มุมขวาบนของทุกหน้า) — ดึงรายชื่อสาขาจาก `branches` table จริงแล้ว (เดิม hardcode `surat/samui/langsuan` ทำให้สาขาใหม่ใช้งานไม่ได้และมี "samui"/"langsuan" ที่ไม่มีอยู่จริงปนอยู่ — แก้แล้ว) แอดมินเห็นทุกสาขา active, พนักงานเห็นเฉพาะสาขาที่ถูกมอบหมายผ่าน `user_branches`

## บั๊กที่เจอและแก้ไปแล้วระหว่างทำรอบนี้ (คุ้มค่าจำไว้)
- **`supabaseRest` ไม่ส่ง `Prefer` header ตอน PATCH** — ทำให้ Supabase ตอบ 204 (body ว่าง) แล้ว `res.json()` throw ก่อนเช็ค `res.ok` ด้วยซ้ำ กระทบทุกปุ่มที่ใช้ PATCH ในระบบ (toggle is_admin/is_active ในหน้า Admin, ย้ายลูกค้าคืนเครื่อง, บันทึกตั้งค่าบัญชี) เข้าใจว่าพังแบบเงียบๆ มานานแล้วก่อนหน้านี้ — แก้โดยเพิ่ม `Prefer: return=representation` ให้ PATCH ด้วย และเปลี่ยนมาอ่าน response เป็น text ก่อนค่อย parse JSON เผื่อ body ว่าง

## Backlog ที่คุยไว้ล่าสุด
ทั้ง 3 ข้อเดิม (ย้ายลูกค้า/เพิ่มสาขา/ตั้งค่าบัญชี) ทำเสร็จแล้วในเวอร์ชันนี้ (ดูหัวข้อ "หน้าที่ทำเสร็จแล้ว" ข้อ 3, 7, 8) — ยังไม่มีรายการใหม่ที่คุยกันไว้ รอสั่งงานรอบถัดไป

## ช่องว่างที่เทียบกับระบบเดิมแล้วยังไม่ได้ทำ (จากการเทียบฟังก์ชันล่าสุด)
- ActivityLog ทั้งระบบ (ไม่มีการบันทึกว่าใครทำอะไร)
- คนแรกที่สมัคร = Admin อัตโนมัติ (ตอนนี้ต้องรัน SQL มือ)
- สร้าง/แก้ไขสัญญาใหม่ผ่าน UI (ตอนนี้ดูได้อย่างเดียว ต้องเพิ่มผ่าน SQL)
- Daily Reports ถาวร + รายงานย้อนหลังแบบเต็ม
- archiveClosedCustomers_/archiveReturnedByAmount_ แบบสแกนอัตโนมัติทั้งชีท (ตัดใจไม่ทำแล้วได้ ถ้าจะให้ทำทีละคนผ่านฟีเจอร์ "ย้ายลูกค้าคืนเครื่อง" ที่มีแล้วแทน)
- flow "ย้ายลูกค้าผ่อนจบ" (`closed`) แบบเดี่ยวใน Working Reference — ยังไม่มี (ดูหมายเหตุในข้อ 3 ของ "หน้าที่ทำเสร็จแล้ว")

## ไฟล์ SQL ที่เคยรันไปแล้ว (ต้องรันตามลำดับถ้าตั้งฐานข้อมูลใหม่)
`schema.sql` → `fix_identity.sql` → `rls_policies.sql` → `fix_username_trigger.sql` → `username_lookup.sql` → `account_settings.sql`

นอกจากไฟล์ข้างต้น ยังมี insert สาขาตรัง/แม่สอดที่รันตรงใน SQL Editor แบบ ad-hoc (ไม่ได้เก็บเป็นไฟล์ เพราะเป็นแค่ INSERT ข้อมูล 2 แถว):
```sql
INSERT INTO branches (branch_id, branch_name) VALUES
  ('trang', 'ตรัง'),
  ('maesot', 'แม่สอด');
```
