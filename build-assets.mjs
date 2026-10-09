// รันอัตโนมัติตอน deploy: ฝังฟอนต์และไฟล์สัญญาไว้ให้ฟังก์ชันสร้าง PDF ใช้ (ให้ตรงกับ public/contract.pdf เสมอ)
import { readFileSync, writeFileSync } from "node:fs";
const b = (p) => readFileSync(p).toString("base64");
writeFileSync("netlify/functions/assets.mjs", "export const FONT_B64=" + JSON.stringify(b("netlify/functions/fonts/Sarabun-Regular.ttf")) + ";\nexport const PDF_B64=" + JSON.stringify(b("public/contract.pdf")) + ";\n");
console.log("assets ok");
