import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import MAP from "./pdf-map.mjs";
import { FONT_B64 } from "./assets.mjs";
const FONT = Buffer.from(FONT_B64, "base64");
const TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const fmtDate = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ""); return m ? +m[3] + " " + TH[+m[2] - 1] + " " + (+m[1] + 543) : s || ""; };
const fmtId = (s) => (/^\d{13}$/.test(s || "") ? s.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, "$1-$2-$3-$4-$5") : s || "");
const fmtTel = (s) => (/^\d{10}$/.test(s || "") ? s.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : s || "");
const num = (s) => (/^\d+$/.test(s || "") ? (+s).toLocaleString("en-US") : s || "");
const INK = rgb(0.05, 0.1, 0.4);
export async function fillContract(pdfBytes, d, t, submittedISO) {
  const doc = await PDFDocument.load(pdfBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(FONT, { subset: true });
  const pages = doc.getPages(), pg = pages[0], H = pg.getHeight(), cut = [];
  const F = (k) => MAP.fields.find((f) => f.k === k);
  const put = (k, text, size = 11, min = 7) => {
    const f = F(k); text = String(text ?? "").trim(); if (!f || !text) return;
    const w = f.x1 - f.x0 - 4; while (size > min && font.widthOfTextAtSize(text, size) > w) size -= 0.5;
    let s = text; while (s.length > 1 && font.widthOfTextAtSize(s, size) > w) s = s.slice(0, -1);
    if (s.length < text.length) cut.push(k);
    pages[f.p || 0].drawText(s, { x: f.c ? f.x0 + (f.x1 - f.x0 - font.widthOfTextAtSize(s, size)) / 2 : f.x0 + 2, y: H - f.y + 4.5, size, font, color: INK });
  };
  const mark = (key, val) => { const b = MAP.boxes[key]?.[val]; if (!b) return; const cx = (b[0] + b[1]) / 2, cy = H - b[2] + 4;
    for (const [a, c] of [[-2.3, -2.3], [-2.3, 2.3]]) pg.drawLine({ start: { x: cx + a, y: cy + c }, end: { x: cx - a, y: cy - c }, thickness: 1.2, color: INK }); };
  const wrap = (text, w, size) => { const out = []; let cur = ""; for (const ch of text) { if (font.widthOfTextAtSize(cur + ch, size) > w && !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch)) { out.push(cur); cur = ""; } cur += ch; } return out.concat(cur); };
  put("purchaseDate", fmtDate(t.start || submittedISO)); put("custCode", t.custCode);
  for (const k of ["first", "last", "nick", "line", "refRel", "refName", "job", "pos", "tenure", "work", "workAddr", "incType", "payDay", "income2", "userName"]) put(k, d[k]);
  put("idno", fmtId(d.idno)); for (const k of ["phone", "refPhone", "userTel"]) put(k, fmtTel(d[k]));
  put("workTel", d.workTel); put("income", num(d.income));
  put("dueDay", /^\d{4}-\d\d-(\d\d)$/.test(d.dueDay || "") ? +d.dueDay.slice(8) + " ของเดือน" : d.dueDay);
  put("model", t.model); put("imei", t.imei); put("serial", t.serial);
  put("down", num(t.down)); put("monthly", num(t.monthly)); put("months", t.months);
  mark("oldPhone", d.oldPhone); mark("tradeIn", d.tradeIn); mark("source", d.source);
  const hn = /1|หนึ่ง/.test(t.hand || "") ? "1" : /2|สอง/.test(t.hand || "") ? "2" : null;
  if (hn && MAP.hand[hn]) { const [x, y] = MAP.hand[hn]; pg.drawEllipse({ x, y: H - y + 5, xScale: 4.2, yScale: 5.6, borderColor: INK, borderWidth: 1 }); }
  if (t.note) { const a = F("note1"), b = F("note2"), L = wrap(String(t.note), a.x1 - a.x0 - 4, 11);
    [a, b].forEach((f, i) => L[i] && pg.drawText(L[i], { x: f.x0 + 2, y: H - f.y + 4.5, size: 11, font, color: INK }));
    if (L.length > 2) cut.push("note"); }
  const two = (k1, k2, text, size = 11) => {
    const a = F(k1), b = F(k2); text = String(text ?? "").trim(); if (!a || !b || !text) return;
    const w1 = a.x1 - a.x0 - 4, w2 = b.x1 - b.x0 - 4, W = (x, z) => font.widthOfTextAtSize(x, z); let i = 0, cur = "";
    for (; i < text.length; i++) { if (W(cur + text[i], size) > w1 && !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(text[i])) break; cur += text[i]; }
    let rest = text.slice(i).trim();
    if (rest) { const sp = cur.lastIndexOf(" "); if (sp > cur.length * 0.5) { rest = (cur.slice(sp + 1) + rest).trim(); cur = cur.slice(0, sp); } }
    pages[a.p].drawText(cur, { x: a.x0 + 2, y: H - a.y + 4.5, size, font, color: INK });
    if (rest) { let z = size; while (z > 8 && W(rest, z) > w2) z -= 0.5; let r = rest; while (r.length > 1 && W(r, z) > w2) r = r.slice(0, -1);
      if (r.length < rest.length) cut.push(k2); pages[b.p].drawText(r, { x: b.x0 + 2, y: H - b.y + 4.5, size: z, font, color: INK }); }
  };
  const nm = ((d.first || "") + " " + (d.last || "")).trim();
  put("p2name", nm); put("p2tel", fmtTel(d.phone)); put("p2model", t.model); put("p2date", fmtDate(t.start || submittedISO));
  put("p3date", fmtDate(t.start || submittedISO)); put("p3name", nm); put("p3id", fmtId(d.idno)); put("p3addrId", d.addrId);
  two("p3addrNow", "p3addrNow2", d.addrNow === "ตรงกับที่อยู่ตามบัตร" ? d.addrId : d.addrNow);
  put("p2imei", t.imei); put("p2kin", fmtTel(d.refPhone)); put("p2signName", nm);
  if (/^data:image\/png;base64,/.test(d.sig || "")) {
    const S = MAP.sig, png = await doc.embedPng(Buffer.from(d.sig.split(",")[1], "base64")), bw = S.x1 - S.x0, bh = S.y1 - S.y0, sc = Math.min(bw / png.width, bh / png.height), w = png.width * sc, h = png.height * sc;
    pages[S.p].drawImage(png, { x: S.x0 + (bw - w) / 2, y: H - S.y1, width: w, height: h });
  }
  return { bytes: await doc.save(), cut };
}
