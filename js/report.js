// ส่งออกรายงาน: Word (.docx ด้วย docx), Excel (.xlsx ด้วย ExcelJS) และ PDF (pdfmake) — ไลบรารีโหลดจาก CDN
import { CONFIG, BUDGET_CATEGORIES, FUND_TYPES } from "./config.js";
import { thDate, money, num, sortedEntries, monthLabel, weekLabel, fiscalLabel, lineText, extrasText } from "./util.js";

const FONT = "TH Sarabun New";
const lib = () => {
  if (!window.docx) throw new Error("โหลดตัวสร้างไฟล์ Word ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า");
  return window.docx;
};

function kit(font = FONT) {
  const d = lib();
  const run = (text, o = {}) => new d.TextRun({ text: String(text ?? ""), bold: o.bold, size: o.size || 32, font });
  const P = (text, o = {}) =>
    new d.Paragraph({
      alignment: o.align === "center" ? d.AlignmentType.CENTER : o.align === "right" ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
      spacing: { before: o.before || 0, after: o.after || 0 },
      indent: o.indent ? { firstLine: 720 } : undefined,
      children: [run(text, o)],
    });
  const cell = (text, o = {}) =>
    new d.TableCell({
      children: String(text ?? "").split("\n").map((line) => P(line, { size: 28, ...o })),
      columnSpan: o.span, rowSpan: o.rows,
      verticalAlign: d.VerticalAlign.CENTER,
      width: o.w ? { size: o.w, type: d.WidthType.PERCENTAGE } : undefined,
      shading: o.shade ? { fill: o.shade, type: d.ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 30, bottom: 30, left: 90, right: 90 },
    });
  const row = (cells, header) => new d.TableRow({ children: cells, tableHeader: !!header, cantSplit: true });
  const table = (rows) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows });
  const doc = (children, landscape) =>
    new d.Document({
      styles: { default: { document: { run: { font, size: 32 } } } },
      sections: [{
        properties: { page: { size: landscape ? { orientation: d.PageOrientation.LANDSCAPE } : {}, margin: { top: 1000, bottom: 900, left: 1100, right: 900 } } },
        children,
      }],
    });
  return { d, P, cell, row, table, doc };
}

// ------------------------------------------------------------
//  ฝังฟอนต์ TH Sarabun New (ปกติ + หนา) ลงในไฟล์ Word
//  เพื่อให้เปิดบนเครื่องที่ไม่ได้ติดตั้งฟอนต์นี้แล้วยังแสดงผลถูกต้อง
// ------------------------------------------------------------
const NEW = { name: FONT, files: ["fonts/THSarabunNew.ttf", "fonts/THSarabunNew-Bold.ttf"] };
const fontCache = {};
const loadFonts = (spec = NEW) =>
  (fontCache[spec.name] ||= Promise.all(spec.files.map(async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error("โหลดฟอนต์ไม่สำเร็จ: " + u);
    return new Uint8Array(await r.arrayBuffer());
  })).catch((e) => { delete fontCache[spec.name]; throw e; }));
const newGuid = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
// Word กำหนดให้ XOR 32 ไบต์แรกของฟอนต์ด้วย GUID (กลับลำดับไบต์)
function obfuscate(bytes, guid) {
  const key = guid.replace(/-/g, "").match(/../g).map((h) => parseInt(h, 16)).reverse();
  const out = bytes.slice();
  for (let i = 0; i < 32; i++) out[i] ^= key[i % 16];
  return out;
}
async function embedFonts(blob, spec = NEW) {
  if (!window.JSZip) return blob;
  let fonts;
  try { fonts = await loadFonts(spec); } catch (e) { console.warn(e); return blob; }
  const zip = await window.JSZip.loadAsync(blob);
  const ft = zip.file("word/fontTable.xml"), ct = zip.file("[Content_Types].xml");
  if (!ft || !ct) return blob;
  const guids = fonts.map(newGuid);
  fonts.forEach((f, i) => zip.file(`word/fonts/font${i + 1}.odttf`, obfuscate(f, guids[i])));
  const fontXml = `<w:font w:name="${spec.name}"><w:charset w:val="DE"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>` +
    `<w:embedRegular r:id="rIdF1" w:fontKey="{${guids[0]}}"/><w:embedBold r:id="rIdF2" w:fontKey="{${guids[1]}}"/></w:font>`;
  let x = await ft.async("string");
  if (!/xmlns:r=/.test(x)) x = x.replace("<w:fonts", '<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  x = x.includes("</w:fonts>") ? x.replace("</w:fonts>", fontXml + "</w:fonts>") : x.replace(/<w:fonts([^>]*)\/>/, `<w:fonts$1>${fontXml}</w:fonts>`);
  zip.file("word/fontTable.xml", x);
  const relType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";
  zip.file("word/_rels/fontTable.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    fonts.map((_, i) => `<Relationship Id="rIdF${i + 1}" Type="${relType}" Target="fonts/font${i + 1}.odttf"/>`).join("") + `</Relationships>`);
  let c = await ct.async("string");
  if (!c.includes('Extension="odttf"')) {
    c = c.replace(/(<Types[^>]*>)/, `$1<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>`);
    zip.file("[Content_Types].xml", c);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

async function download(doc, filename, spec = NEW) {
  const blob = await embedFonts(await lib().Packer.toBlob(doc), spec);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return blob;
}

const H = "EDEDED";

// ------------------------------------------------------------
//  รายงานสถิติการยืม-คืนอุปกรณ์ (Word / Excel / PDF ใช้ข้อมูลชุดเดียวกัน ฟอนต์ TH SarabunPSK)
// ------------------------------------------------------------
const PSK = { name: "TH SarabunPSK", files: ["fonts/THSarabunPSK.ttf", "fonts/THSarabunPSK-Bold.ttf"] };

function loanModel({ from, to, rows, stats, typeLabel = "ทุกคน", periodLabel = "" }) {
  const dec = (n) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });
  const longD = (d) => thDate(d, { day: "numeric", month: "long", year: "numeric" });
  const head = [
    { text: `รายงานสถิติการยืม-คืนอุปกรณ์ ${CONFIG.unitName}`, bold: true, size: 18, align: "center" },
    { text: CONFIG.schoolName, bold: true, size: 18, align: "center" },
    ...(periodLabel ? [{ text: periodLabel, bold: true, align: "center" }] : []),
    { text: `ระหว่างวันที่ ${longD(from)} ถึง ${longD(to)}${typeLabel !== "ทุกคน" ? ` (เฉพาะ${typeLabel})` : ""}`, align: "center", after: 10 },
    { text: `ในช่วงเวลาดังกล่าว มีการยืมอุปกรณ์รวมทั้งสิ้น ${num(stats.total)} ครั้ง จำนวนอุปกรณ์ ${num(stats.units)} ชิ้น แบ่งเป็นครู/บุคลากร ${num(stats.teacher)} ครั้ง และนักเรียน ${num(stats.student)} ครั้ง ระยะเวลายืมเฉลี่ย ${dec(stats.avgDays)} วัน คืนล่าช้า ${num(stats.lateReturns)} รายการ และยังไม่คืนเกินกำหนด ${num(stats.overdueNow)} รายการ รายละเอียดดังนี้`, indent: true, after: 8 },
  ];
  const tables = [];
  let no = 0;
  const countTable = (title, entries, label, unit, base) => {
    const pct = (v) => (base ? ((v / base) * 100).toFixed(1) : "0.0");
    tables.push({ title: `ตารางที่ ${++no} ${title}`, cols: [["ที่", 8, "center"], [label, 60], [`จำนวน (${unit})`, 16, "center"], ["ร้อยละ", 16, "center"]],
      rows: entries.map(([k, v], i) => [i + 1, k, num(v), pct(v)]) });
  };
  const periodTable = (title, label, keys, fmt, cnt, units) => tables.push({ title: `ตารางที่ ${++no} ${title}`,
    cols: [[label, 56], ["จำนวน (ครั้ง)", 22, "center"], ["อุปกรณ์ (ชิ้น)", 22, "center"]],
    rows: keys.map((k) => [fmt(k), num(cnt.get(k)), num(units.get(k))]), foot: ["รวม", num(stats.total), num(stats.units)] });
  periodTable("จำนวนการยืมรายเดือน", "เดือน", [...stats.byMonth.keys()].sort(), monthLabel, stats.byMonth, stats.unitsByMonth);
  periodTable("จำนวนการยืมรายสัปดาห์", "สัปดาห์", [...stats.byWeek.keys()].sort(), weekLabel, stats.byWeek, stats.unitsByWeek);
  countTable("จำนวนการยืมจำแนกตามประเภทผู้ยืม", sortedEntries(stats.byType), "ประเภทผู้ยืม", "ครั้ง", stats.total);
  countTable("จำนวนอุปกรณ์ที่ถูกยืมจำแนกตามหมวดหมู่", sortedEntries(stats.byCategory), "หมวดหมู่", "ชิ้น", stats.units);
  countTable("จำนวนอุปกรณ์ที่ถูกยืมจำแนกตามรายการ", sortedEntries(stats.byItem), "อุปกรณ์", "ชิ้น", stats.units);
  if (stats.teacher) countTable("การยืมของครู/บุคลากร จำแนกตามหน่วยงาน", sortedEntries(stats.byDept), "หน่วยงาน", "ครั้ง", stats.teacher);
  if (stats.student) countTable("การยืมของนักเรียน จำแนกตามชั้น/ห้อง", sortedEntries(stats.byClass), "ชั้น / ห้อง", "ครั้ง", stats.student);
  countTable("จำนวนการยืมจำแนกตามวัตถุประสงค์", sortedEntries(stats.byPurpose), "วัตถุประสงค์", "ครั้ง", stats.total);

  const sd = (d) => thDate(d, { day: "numeric", month: "short", year: "2-digit" });
  const today = new Date().toISOString().slice(0, 10);
  const stTxt = (l) => (l.status === "returned" ? `คืน ${sd(l.returnedDate)}` : l.dueDate < today ? "ยังไม่คืน (เกินกำหนด)" : "อนุมัติ (ยังไม่คืน)");
  tables.push({ title: `ตารางที่ ${++no} รายละเอียดการยืม`, small: true, detail: true,
    cols: [["ที่", 6, "center"], ["วันที่ยืม – กำหนดคืน", 17], ["ผู้ยืม", 22], ["อุปกรณ์", 33], ["สถานะ", 22]],
    rows: rows.map((l, i) => [i + 1,
      `${sd(l.borrowDate)}${l.pickupTime ? " " + l.pickupTime : ""}\n– ${sd(l.dueDate)}${l.returnTime ? " " + l.returnTime : ""}`,
      `${l.borrowerName}\n${l.borrowerType === "student" ? `นักเรียน ${l.classroom || ""}${l.studentId ? `\nรหัส ${l.studentId}` : ""}` : l.department || "ครู/บุคลากร"}`,
      [...(l.items || []).map(lineText), extrasText(l)].filter(Boolean).join("\n"), stTxt(l)]) });

  const sign = [
    { text: "ลงชื่อ ............................................................ ผู้รายงาน", align: "right", before: 24 },
    { text: "(............................................................)          ", align: "right" },
    { text: `${CONFIG.unitName}          `, align: "right" },
    { text: `ข้อมูล ณ วันที่ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`, size: 13, before: 10 },
  ];
  return { head, tables, sign, file: `รายงานการยืมอุปกรณ์_${from}_ถึง_${to}` };
}

// ---------- Word ----------
export async function exportLoanReport(args) {
  const m = loanModel(args);
  const { P, cell, row, table, doc } = kit(PSK.name);
  const pt = (s) => (s ? s * 2 : undefined); // ขนาดฟอนต์ docx เป็นครึ่งพอยต์
  const para = (x) => P(x.text, { bold: x.bold, size: pt(x.size), align: x.align, indent: x.indent, before: (x.before || 0) * 20, after: (x.after || 0) * 20 });
  const out = m.head.map(para);
  for (const t of m.tables) {
    const sz = t.small ? 24 : 28, hs = t.small ? 26 : 28;
    out.push(P(t.title, { bold: true, before: 200, after: 80 }));
    const hrow = row(t.cols.map(([h, w]) => cell(h, { bold: true, align: "center", shade: H, w, size: hs })), true);
    const body = t.rows.length
      ? t.rows.map((r) => row(r.map((v, i) => cell(v, { align: t.cols[i][2], size: sz }))))
      : [row([cell("ไม่มีข้อมูล", { span: t.cols.length, align: "center" })])];
    const foot = t.foot ? [row(t.foot.map((v) => cell(v, { bold: true, align: "center" })))] : [];
    out.push(table([hrow, ...body, ...foot]));
  }
  out.push(...m.sign.map(para));
  return download(doc(out), `${m.file}.docx`, PSK);
}

// ---------- โหลดไลบรารีเมื่อกดใช้งานครั้งแรก ----------
const scriptCache = {};
const loadScript = (src, ok) => (scriptCache[src] ||= new Promise((res, rej) => {
  if (ok()) return res();
  const s = document.createElement("script");
  s.src = src; s.onload = () => (ok() ? res() : rej(new Error("โหลดไลบรารีไม่สำเร็จ")));
  s.onerror = () => { delete scriptCache[src]; rej(new Error("โหลดไลบรารีไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")); };
  document.head.append(s);
}));
const saveBlob = (blob, filename) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return blob;
};

// ---------- Excel ----------
export async function exportLoanExcel(args) {
  await loadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js", () => !!window.ExcelJS);
  const m = loanModel(args);
  const wb = new window.ExcelJS.Workbook();
  wb.creator = CONFIG.unitName;
  const F = (o = {}) => ({ name: PSK.name, size: o.size || 16, bold: !!o.bold });
  const thin = { style: "thin", color: { argb: "FF999999" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
  const sheet = (name, landscape) => wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const NC = 5;
  const line = (ws, x) => {
    const r = ws.addRow([x.text]);
    ws.mergeCells(r.number, 1, r.number, NC);
    r.getCell(1).font = F({ bold: x.bold, size: x.size ? x.size - 2 : 16 });
    r.getCell(1).alignment = { horizontal: x.align || "left", vertical: "middle", wrapText: true, indent: x.indent ? 2 : 0 };
    if (x.indent) r.height = 64;
  };
  const putTable = (ws, t) => {
    ws.addRow([]);
    const tr = ws.addRow([t.title]); tr.getCell(1).font = F({ bold: true });
    const n = t.cols.length;
    const hr = ws.addRow(t.cols.map(([h]) => h));
    hr.eachCell((c) => { c.font = F({ bold: true }); c.fill = fill; c.border = border; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
    const body = t.rows.length ? t.rows : [["ไม่มีข้อมูล"]];
    for (const r of body) {
      const er = ws.addRow(r.map((v) => (typeof v === "string" && /^[\d,]+(\.\d+)?$/.test(v) ? Number(v.replace(/,/g, "")) : v)));
      for (let i = 1; i <= n; i++) {
        const c = er.getCell(i);
        c.font = F({ size: t.small ? 15 : 16 }); c.border = border;
        c.alignment = { horizontal: t.cols[i - 1][2] || "left", vertical: "top", wrapText: true };
      }
      const lines = Math.max(...r.map((v) => String(v ?? "").split("\n").length));
      if (lines > 1) er.height = lines * 21;
      if (!t.rows.length) ws.mergeCells(er.number, 1, er.number, n);
    }
    if (t.foot) {
      const fr = ws.addRow(t.foot.map((v) => (/^[\d,]+$/.test(v) ? Number(v.replace(/,/g, "")) : v)));
      fr.eachCell((c) => { c.font = F({ bold: true }); c.border = border; c.alignment = { horizontal: "center" }; });
    }
  };
  // ชีต 1: สรุป
  const ws = sheet("สรุปสถิติ");
  ws.columns = [{ width: 8 }, { width: 46 }, { width: 16 }, { width: 14 }, { width: 6 }];
  m.head.forEach((x) => line(ws, x));
  m.tables.filter((t) => !t.detail).forEach((t) => putTable(ws, t));
  ws.addRow([]); m.sign.forEach((x) => line(ws, x));
  // ชีต 2: รายละเอียด
  const wd = sheet("รายละเอียดการยืม", true);
  wd.columns = [{ width: 6 }, { width: 22 }, { width: 30 }, { width: 46 }, { width: 24 }];
  line(wd, m.head[0]); line(wd, m.head[m.head.length - 2]);
  putTable(wd, m.tables.find((t) => t.detail));
  wd.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  return saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${m.file}.xlsx`);
}

// ---------- PDF (ฝังฟอนต์ TH SarabunPSK ในไฟล์) ----------
// หมายเหตุ: ไม่แทรก zero-width space ตัดคำไทย เพราะฟอนต์ TH SarabunPSK ไม่มีตัวอักษรนี้ (จะแสดงเป็นกล่อง)
const wrapTh = (t) => String(t);
const toB64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
export async function exportLoanPdf(args) {
  await loadScript("https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js", () => !!window.pdfMake);
  const [reg, bold] = await loadFonts(PSK);
  const vfs = { "psk.ttf": toB64(reg), "psk-b.ttf": toB64(bold) };
  const fonts = { PSK: { normal: "psk.ttf", bold: "psk-b.ttf", italics: "psk.ttf", bolditalics: "psk-b.ttf" } };
  const m = loanModel(args);
  const para = (x) => ({ text: wrapTh(x.indent ? " ".repeat(10) + x.text : x.text), bold: !!x.bold, fontSize: x.size || 16, alignment: x.align || "left", margin: [0, x.before || 0, 0, x.after || 0] });
  const content = m.head.map(para);
  for (const t of m.tables) {
    const fs = t.small ? 13 : 15;
    const widths = t.cols.map(([, w]) => `${w}%`);
    const hrow = t.cols.map(([h]) => ({ text: wrapTh(h), bold: true, alignment: "center", fillColor: "#EDEDED", fontSize: fs }));
    const body = t.rows.length
      ? t.rows.map((r) => r.map((v, i) => ({ text: wrapTh(v ?? ""), alignment: t.cols[i][2] || "left", fontSize: fs })))
      : [[{ text: "ไม่มีข้อมูล", colSpan: t.cols.length, alignment: "center", fontSize: fs }, ...Array(t.cols.length - 1).fill({})]];
    const foot = t.foot ? [t.foot.map((v) => ({ text: v, bold: true, alignment: "center", fontSize: fs }))] : [];
    content.push({ text: t.title, bold: true, fontSize: 16, margin: [0, 12, 0, 4], ...(t.detail ? { pageBreak: "before" } : {}) });
    content.push({ table: { headerRows: 1, widths, dontBreakRows: true, body: [hrow, ...body, ...foot] },
      layout: { hLineColor: () => "#999", vLineColor: () => "#999", hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 1, paddingBottom: () => 1 } });
  }
  content.push(...m.sign.map((x) => ({ ...para(x), margin: [0, x.before || 0, 0, 0] })));
  const dd = { pageSize: "A4", pageMargins: [50, 40, 40, 40], defaultStyle: { font: "PSK", fontSize: 16, lineHeight: 1.05 }, content,
    footer: (p, n) => ({ text: `หน้า ${p} / ${n}`, alignment: "right", fontSize: 12, margin: [0, 10, 40, 0] }),
    info: { title: m.file, author: CONFIG.unitName } };
  const blob = await new Promise((res) => window.pdfMake.createPdf(dd, null, fonts, vfs).getBlob(res));
  return saveBlob(blob, `${m.file}.pdf`);
}

// ------------------------------------------------------------
//  แบบบันทึกการใช้งบประมาณ (ตามแบบฟอร์มของงาน)
// ------------------------------------------------------------
export async function exportBudgetReport({ fy, rows, groups }) {
  const { P, cell, row, table, doc } = kit();
  const S = 24;
  const hc = (t, o = {}) => cell(t, { bold: true, align: "center", shade: H, size: S, ...o });
  const head = [
    row([
      hc("ที่", { rows: 2, w: 5 }), hc("รายการ\n(โครงการ/กิจกรรม)", { rows: 2, w: 31 }),
      ...BUDGET_CATEGORIES.map((c) => hc(c, { rows: 2, w: 6 })),
      hc("ประเภทเงิน (ระบุราคา)", { span: FUND_TYPES.length }), hc("ลงชื่อ\nผู้บันทึก\nข้อมูล", { rows: 2, w: 10 }),
    ], true),
    row(FUND_TYPES.map((f) => hc(f === "รายได้สถานศึกษา" ? "รายได้\nสถานศึกษา" : f === "รายได้เหลือจ่าย" ? "รายได้\nเหลือจ่าย" : f, { w: 9 })), true),
  ];
  const cols = 2 + BUDGET_CATEGORIES.length + FUND_TYPES.length + 1;
  const body = [];
  for (const g of groups) {
    body.push(row([cell(g.project, { span: cols, bold: true, size: S, shade: "F7F7F7" })]));
    for (const a of g.acts) {
      body.push(row([cell("", { size: S }), cell(a.activity, { span: cols - 1, bold: true, size: S })]));
      a.items.forEach((r, i) => body.push(row([
        cell(i + 1, { align: "center", size: S }), cell(r.item, { size: S }),
        ...BUDGET_CATEGORIES.map((c) => cell(r.category === c ? "✓" : "", { align: "center", size: S })),
        ...FUND_TYPES.map((f) => cell(r.fundType === f ? money(r.amount) : "", { align: "right", size: S })),
        cell(r.recorder, { align: "center", size: S }),
      ])));
    }
  }
  if (!rows.length) body.push(row([cell("ยังไม่มีรายการ", { span: cols, align: "center", size: S })]));
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const sumFund = (f) => rows.filter((r) => r.fundType === f).reduce((s, r) => s + Number(r.amount || 0), 0);
  body.push(row([
    cell("รวม", { span: 2 + BUDGET_CATEGORIES.length, bold: true, align: "center", size: S }),
    ...FUND_TYPES.map((f) => cell(sumFund(f) ? money(sumFund(f)) : "-", { bold: true, align: "right", size: S })), cell("", { size: S }),
  ]));

  const out = [
    P(`บันทึกการใช้งบประมาณ ${CONFIG.budgetUnitName} ปีงบประมาณ ${fy}`, { bold: true, size: 36, align: "center" }),
    P(`${CONFIG.schoolName} (${fiscalLabel(fy)})`, { align: "center", size: 28, after: 160 }),
    table([...head, ...body]),
    P(`รวมใช้จ่ายทั้งสิ้น ${money(total)} บาท จำนวน ${rows.length} รายการ`, { bold: true, before: 200 }),
    P(`ข้อมูล ณ วันที่ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`, { size: 26 }),
  ];
  return download(doc(out), `บันทึกการใช้งบประมาณ_ปีงบ${fy}.docx`);
}
