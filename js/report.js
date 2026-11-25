// ส่งออกรายงานเป็นไฟล์ Word (.docx) ด้วยไลบรารี docx (โหลดจาก CDN ใน index.html)
import { CONFIG, BUDGET_CATEGORIES, FUND_TYPES } from "./config.js";
import { thDate, money, num, sortedEntries, monthLabel, weekLabel, fiscalLabel } from "./util.js";

const FONT = "TH Sarabun New";
const lib = () => {
  if (!window.docx) throw new Error("โหลดตัวสร้างไฟล์ Word ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า");
  return window.docx;
};

function kit() {
  const d = lib();
  const run = (text, o = {}) => new d.TextRun({ text: String(text ?? ""), bold: o.bold, size: o.size || 32, font: FONT });
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
      styles: { default: { document: { run: { font: FONT, size: 32 } } } },
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
const FONT_FILES = ["fonts/THSarabunNew.ttf", "fonts/THSarabunNew-Bold.ttf"];
let fontCache = null;
const loadFonts = () =>
  (fontCache ||= Promise.all(FONT_FILES.map(async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error("โหลดฟอนต์ไม่สำเร็จ: " + u);
    return new Uint8Array(await r.arrayBuffer());
  })));
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
async function embedFonts(blob) {
  if (!window.JSZip) return blob;
  let fonts;
  try { fonts = await loadFonts(); } catch (e) { console.warn(e); fontCache = null; return blob; }
  const zip = await window.JSZip.loadAsync(blob);
  const ft = zip.file("word/fontTable.xml"), ct = zip.file("[Content_Types].xml");
  if (!ft || !ct) return blob;
  const guids = fonts.map(newGuid);
  fonts.forEach((f, i) => zip.file(`word/fonts/font${i + 1}.odttf`, obfuscate(f, guids[i])));
  const fontXml = `<w:font w:name="${FONT}"><w:charset w:val="DE"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>` +
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

async function download(doc, filename) {
  const blob = await embedFonts(await lib().Packer.toBlob(doc));
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
//  รายงานสถิติการยืม-คืนอุปกรณ์
// ------------------------------------------------------------
export async function exportLoanReport({ from, to, rows, stats, typeLabel = "ทุกคน" }) {
  const { P, cell, row, table, doc } = kit();
  const dec = (n) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });
  const longD = (d) => thDate(d, { day: "numeric", month: "long", year: "numeric" });
  const out = [
    P(`รายงานสถิติการยืม-คืนอุปกรณ์ ${CONFIG.unitName}`, { bold: true, size: 36, align: "center" }),
    P(CONFIG.schoolName, { bold: true, size: 36, align: "center" }),
    P(`ระหว่างวันที่ ${longD(from)} ถึง ${longD(to)}${typeLabel !== "ทุกคน" ? ` (เฉพาะ${typeLabel})` : ""}`, { align: "center", after: 200 }),
    P(`ในช่วงเวลาดังกล่าว มีการยืมอุปกรณ์รวมทั้งสิ้น ${num(stats.total)} ครั้ง จำนวนอุปกรณ์ ${num(stats.units)} ชิ้น แบ่งเป็นครู/บุคลากร ${num(stats.teacher)} ครั้ง และนักเรียน ${num(stats.student)} ครั้ง ระยะเวลายืมเฉลี่ย ${dec(stats.avgDays)} วัน คืนล่าช้า ${num(stats.lateReturns)} รายการ และยังไม่คืนเกินกำหนด ${num(stats.overdueNow)} รายการ รายละเอียดดังนี้`, { indent: true, after: 160 }),
  ];
  let no = 0;
  const hc = (t, w) => cell(t, { bold: true, align: "center", shade: H, w });
  const countTable = (title, entries, head, unit, base) => {
    out.push(P(`ตารางที่ ${++no} ${title}`, { bold: true, before: 200, after: 80 }));
    const pct = (v) => (base ? ((v / base) * 100).toFixed(1) : "0.0");
    const body = entries.length
      ? entries.map(([k, v], i) => row([cell(i + 1, { align: "center" }), cell(k), cell(num(v), { align: "center" }), cell(pct(v), { align: "center" })]))
      : [row([cell("ไม่มีข้อมูล", { span: 4, align: "center" })])];
    out.push(table([row([hc("ที่", 8), hc(head, 60), hc(`จำนวน (${unit})`, 16), hc("ร้อยละ", 16)], true), ...body]));
  };
  const periodTable = (title, head, keys, label, cnt, units) => {
    out.push(P(`ตารางที่ ${++no} ${title}`, { bold: true, before: 200, after: 80 }));
    out.push(table([
      row([hc(head, 56), hc("จำนวน (ครั้ง)", 22), hc("อุปกรณ์ (ชิ้น)", 22)], true),
      ...(keys.length ? keys.map((k) => row([cell(label(k)), cell(num(cnt.get(k)), { align: "center" }), cell(num(units.get(k)), { align: "center" })])) : [row([cell("ไม่มีข้อมูล", { span: 3, align: "center" })])]),
      row([cell("รวม", { bold: true, align: "center" }), cell(num(stats.total), { bold: true, align: "center" }), cell(num(stats.units), { bold: true, align: "center" })]),
    ]));
  };
  periodTable("จำนวนการยืมรายเดือน", "เดือน", [...stats.byMonth.keys()].sort(), monthLabel, stats.byMonth, stats.unitsByMonth);
  periodTable("จำนวนการยืมรายสัปดาห์", "สัปดาห์", [...stats.byWeek.keys()].sort(), weekLabel, stats.byWeek, stats.unitsByWeek);
  countTable("จำนวนการยืมจำแนกตามประเภทผู้ยืม", sortedEntries(stats.byType), "ประเภทผู้ยืม", "ครั้ง", stats.total);
  countTable("จำนวนอุปกรณ์ที่ถูกยืมจำแนกตามหมวดหมู่", sortedEntries(stats.byCategory), "หมวดหมู่", "ชิ้น", stats.units);
  countTable("จำนวนอุปกรณ์ที่ถูกยืมจำแนกตามรายการ", sortedEntries(stats.byItem), "อุปกรณ์", "ชิ้น", stats.units);
  if (stats.teacher) countTable("การยืมของครู/บุคลากร จำแนกตามหน่วยงาน", sortedEntries(stats.byDept), "หน่วยงาน", "ครั้ง", stats.teacher);
  if (stats.student) countTable("การยืมของนักเรียน จำแนกตามชั้น/ห้อง", sortedEntries(stats.byClass), "ชั้น / ห้อง", "ครั้ง", stats.student);
  countTable("จำนวนการยืมจำแนกตามวัตถุประสงค์", sortedEntries(stats.byPurpose), "วัตถุประสงค์", "ครั้ง", stats.total);

  out.push(P(`ตารางที่ ${++no} รายละเอียดการยืม`, { bold: true, before: 200, after: 80 }));
  const hs = (t, w) => cell(t, { bold: true, align: "center", shade: H, w, size: 26 });
  const sd = (d) => thDate(d, { day: "numeric", month: "short", year: "2-digit" });
  const stTxt = (l) => (l.status === "returned" ? `คืน ${sd(l.returnedDate)}` : l.dueDate < new Date().toISOString().slice(0, 10) ? "ยังไม่คืน (เกินกำหนด)" : "กำลังยืม");
  out.push(table([
    row([hs("ที่", 6), hs("วันที่ยืม – กำหนดคืน", 17), hs("ผู้ยืม", 22), hs("อุปกรณ์", 33), hs("สถานะ", 22)], true),
    ...(rows.length ? rows.map((l, i) => row([
      cell(i + 1, { align: "center", size: 24 }), cell(`${sd(l.borrowDate)}\n– ${sd(l.dueDate)}`, { size: 24 }),
      cell(`${l.borrowerName}\n${l.borrowerType === "student" ? `นักเรียน ${l.classroom || ""}` : l.department || "ครู/บุคลากร"}`, { size: 24 }),
      cell((l.items || []).map((x) => `${x.name} ×${x.qty}`).join("\n"), { size: 24 }), cell(stTxt(l), { size: 24 }),
    ])) : [row([cell("ไม่มีข้อมูล", { span: 5, align: "center" })])]),
  ]));

  out.push(P("", { before: 500 }), P("ลงชื่อ ............................................................ ผู้รายงาน", { align: "right" }), P("(............................................................)          ", { align: "right" }),
    P(`${CONFIG.unitName}          `, { align: "right" }), P(`ข้อมูล ณ วันที่ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`, { size: 26, before: 200 }));

  return download(doc(out), `รายงานการยืมอุปกรณ์_${from}_ถึง_${to}.docx`);
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
