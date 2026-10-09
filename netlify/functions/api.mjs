import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";
import { fillContract } from "./fill-pdf.mjs";
import { PDF_B64 } from "./assets.mjs";
export const config = { path: "/api/*" };
const REQ = ["first","last","nick","idno","phone","addrId","addrNow","refName","refRel","refPhone","job","pos","tenure","work","workAddr","workTel","incType","payDay","income","dueDay","userName","userTel","oldPhone","tradeIn","source"];
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const h = (s) => createHash("sha256").update(s).digest("hex");
export default async (req, ctx) => {
  const st = getStore("contracts");
  const url = new URL(req.url), act = url.pathname.replace("/api/", "");
  const admin = !!process.env.ADMIN_PASSWORD && req.headers.get("x-admin") === process.env.ADMIN_PASSWORD;
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const get = (t) => (/^[a-f0-9]{32}$/.test(t || "") ? st.get(t, { type: "json" }) : null);
  const chk = async (c, pin) => {
    if (!c || c.status !== "new" || Date.now() > c.expires) return [410, "ลิงก์นี้ใช้ไม่ได้ (ถูกใช้แล้วหรือหมดอายุ)"];
    if (c.attempts >= 5) return [429, "ใส่ PIN ผิดเกินกำหนด กรุณาติดต่อร้าน"];
    if (h(String(pin) + c.token) !== c.pinHash) { c.attempts++; await st.setJSON(c.token, c); return [403, "PIN ไม่ถูกต้อง"]; }
    return null;
  };
  if (act === "create" && admin) {
    const token = randomBytes(16).toString("hex"), pin = String(100000 + (randomBytes(4).readUInt32BE() % 900000));
    await st.setJSON(token, { token, name: String(body.name || "").slice(0, 100), terms: body.terms || {}, pinHash: h(pin + token), attempts: 0, status: "new", created: Date.now(), expires: Date.now() + (+body.hours || 48) * 36e5 });
    return J({ token, pin });
  }
  if (act === "list" && admin) {
    const { blobs } = await st.list(), out = [];
    for (const b of blobs) { const c = await st.get(b.key, { type: "json" }); if (c) out.push({ token: c.token, name: c.name, status: c.status, created: c.created, submitted: c.submitted, expires: c.expires }); }
    return J(out.sort((a, b) => b.created - a.created));
  }
  if (act === "view" && admin) { const c = await get(url.searchParams.get("t")); if (!c) return J({ error: "ไม่พบข้อมูล" }, 404); delete c.pinHash; return J(c); }
  if (act === "review" && admin) { const c = await get(body.t); if (!c) return J({ error: "ไม่พบข้อมูล" }, 404); c.status = body.ok ? "approved" : "rejected"; await st.setJSON(c.token, c); return J({ ok: 1 }); }
  if (act === "delete" && admin) { if (/^[a-f0-9]{32}$/.test(body.t || "")) await st.delete(body.t); return J({ ok: 1 }); }
  if (act === "pdf" && admin) {
    const c = await get(url.searchParams.get("t"));
    if (!c || !c.data) return J({ error: "ยังไม่มีข้อมูลที่ลูกค้าส่งมา" }, 404);
    const iso = new Date((c.submitted || Date.now()) + 7 * 36e5).toISOString().slice(0, 10);
    const { bytes, cut } = await fillContract(Buffer.from(PDF_B64, "base64"), { ...c.data.form, sig: c.data.sig }, c.terms || {}, iso);
    return new Response(bytes, { headers: { "content-type": "application/pdf", "cache-control": "no-store", "x-truncated": cut.join(",") } });
  }
  if (act === "open") {
    const c = await get(body.t), bad = await chk(c, body.pin);
    return bad ? J({ error: bad[1] }, bad[0]) : J({ terms: c.terms, name: c.name });
  }
  if (act === "submit") {
    const c = await get(body.t), bad = await chk(c, body.pin);
    if (bad) return J({ error: bad[1] }, bad[0]);
    const f = {};
    for (const [k, v] of Object.entries(body.form || {})) if (typeof v === "string") f[k.slice(0, 20)] = v.trim().slice(0, 300);
    const ok = (s) => typeof s === "string" && s.length < 2e6 && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(s);
    const g = body.geo || {}, D = 864e5, day = (s) => Date.parse((s || "") + "T00:00:00Z");
    const base = /^\d{4}-\d\d-\d\d$/.test(c.terms?.start || "") ? day(c.terms.start) : Math.floor((Date.now() + 7 * 36e5) / D) * D;
    const due = day(f.dueDay);
    if (!ok(body.sig) || !ok(body.idImg) || !ok(body.selfie) || f.c1 !== "on" || f.c2 !== "on" || f.c3 !== "on" || REQ.some((k) => !f[k]) || !/^\d{13}$/.test(f.idno) || !["phone", "refPhone", "userTel"].every((k) => /^\d{10}$/.test(f[k])) || !(due >= base - D && due <= base + 36 * D) || !Number.isFinite(g.lat) || !Number.isFinite(g.lng))
      return J({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบแล้วส่งใหม่" }, 400);
    c.data = { form: f, sig: body.sig, idImg: body.idImg, selfie: body.selfie, geo: { lat: g.lat, lng: g.lng, acc: +g.acc || 0 }, ip: ctx.ip, ua: (req.headers.get("user-agent") || "").slice(0, 200) };
    c.status = "submitted"; c.submitted = Date.now();
    await st.setJSON(c.token, c);
    return J({ ok: 1 });
  }
  return J({ error: "ไม่พบเส้นทางนี้" }, 404);
};
