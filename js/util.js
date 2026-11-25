import { CONFIG, CATEGORIES, USER_TYPES } from "./config.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => ymd(new Date());
export const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const thDate = (s, opt = { day: "numeric", month: "short", year: "numeric" }) =>
  s ? parseYmd(s).toLocaleDateString("th-TH", opt) : "";
export const thDateLong = (s) => thDate(s, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const thShort = (s) => thDate(s, { day: "numeric", month: "short" });
export const money = (n) =>
  Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n) => Number(n || 0).toLocaleString("th-TH");

// ----- ปีงบประมาณ (พ.ศ.) -----
export function fiscalYearOf(dateStr) {
  const d = parseYmd(dateStr);
  const be = d.getFullYear() + 543;
  const sm = CONFIG.fiscalStartMonth;
  if (sm === 1) return be;
  return d.getMonth() + 1 >= sm ? be + 1 : be;
}
export function fiscalRange(fy) {
  const sm = CONFIG.fiscalStartMonth;
  const startYear = fy - 543 - (sm === 1 ? 0 : 1);
  const from = new Date(startYear, sm - 1, 1);
  const to = new Date(startYear + 1, sm - 1, 0);
  return [ymd(from), ymd(to)];
}
// ----- ปีการศึกษา (พ.ศ.) -----
const acStart = () => CONFIG.academicStart || { month: 5, day: 16 };
export function academicYearOf(dateStr) {
  const d = parseYmd(dateStr), { month, day } = acStart();
  const be = d.getFullYear() + 543;
  return d.getMonth() + 1 > month || (d.getMonth() + 1 === month && d.getDate() >= day) ? be : be - 1;
}
export function academicRange(ay) {
  const { month, day } = acStart(), y = ay - 543;
  return [ymd(new Date(y, month - 1, day)), ymd(new Date(y + 1, month - 1, day - 1))];
}
// ชั้น/ห้อง · เลขที่ · รหัสนักเรียน
export const studentInfo = (x = {}) => [x.classroom, x.studentNo && "เลขที่ " + x.studentNo, x.studentId && "รหัส " + x.studentId].filter(Boolean).join(" ");
export function fiscalLabel(fy) {
  const [a, b] = fiscalRange(fy);
  return `${thDate(a)} – ${thDate(b)}`;
}

export const mondayOf = (s) => {
  const d = parseYmd(s);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return ymd(d);
};

// ----- ผู้ใช้งาน -----
export const typeLabel = (t) => USER_TYPES[t] || "ไม่ระบุ";
export const shortType = (t) => (t === "student" ? "นักเรียน" : t === "teacher" ? "ครู" : "–");
export const catIcon = (name) => (CATEGORIES.find((c) => c.name === name) || { icon: name === "กล้องและอุปกรณ์ถ่ายภาพ" ? "📷" : "📦" }).icon;
// ไอคอนตามประเภทอุปกรณ์ (ถ้ามี) ไม่งั้นใช้ไอคอนของหมวด
const KIND_ICONS = { flash: "⚡️" };
export const itemIcon = (it) => KIND_ICONS[it?.kind] || catIcon(it?.category);
export const catOrder = (name) => {
  const i = CATEGORIES.findIndex((c) => c.name === name);
  return i < 0 ? 999 : i;
};

// ----- การยืม -----
//  pending   = กำลังขออนุญาต (รออนุมัติ)
//  approved  = อนุมัติแล้ว / กำลังยืม (ยังไม่คืน)
//  returned  = คืนแล้ว
//  rejected  = ไม่อนุมัติ
//  cancelled = ผู้ยืมยกเลิก
export const LOAN_STATUS = {
  pending: { label: "รออนุมัติ", cls: "st-pending" },
  approved: { label: "กำลังยืม", cls: "st-approved" },
  overdue: { label: "เกินกำหนดคืน", cls: "st-rejected" },
  returned: { label: "คืนแล้ว", cls: "st-cancelled" },
  rejected: { label: "ไม่อนุมัติ", cls: "st-rejected" },
  cancelled: { label: "ยกเลิก", cls: "st-cancelled" },
};
export const isOverdue = (l, t = today()) => l.status === "approved" && l.dueDate < t;
export const loanState = (l) => (isOverdue(l) ? "overdue" : l.status);
export const ACTIVE = ["pending", "approved"];
export const loanUnits = (l) => (l.items || []).reduce((s, x) => s + Number(x.qty || 0), 0);
export const lineText = (x) => `${x.name}${x.nos?.length ? ` #${x.nos.join(", #")}` : x.qty > 1 ? ` ×${x.qty}` : ""}`;
export const extrasText = (l) => [l.extras?.battery && `แบตเตอรี่ เบอร์ ${l.extras.battery}`, l.extras?.memory && `การ์ดหน่วยความจำ เบอร์ ${l.extras.memory}`].filter(Boolean).join(", ");
export const itemsText = (l) => [...(l.items || []).map(lineText), extrasText(l)].filter(Boolean).join(", ");

// วันสุดท้ายที่รายการยืมนี้ "ครอบครอง" อุปกรณ์
export function loanEnd(l, t = today()) {
  if (l.status === "returned") return l.returnedDate || l.dueDate;
  if (l.status === "approved") return l.dueDate < t ? t : l.dueDate;
  return l.dueDate;
}
export const loanOn = (l, d, t = today()) =>
  (l.status === "approved" || l.status === "pending" || l.status === "returned") && l.borrowDate <= d && loanEnd(l, t) >= d;
const overlapsRange = (l, from, to, t) => l.borrowDate <= to && loanEnd(l, t) >= from;

// สถานะของอุปกรณ์แต่ละรายการ จากรายการยืมที่ยังไม่ปิด (pending/approved)
// สถานะที่พนักงานโสตตั้งเอง (item.hold): kind = "av" (โสตใช้อุปกรณ์) | "busy" (ไม่ว่าง)
//   from/until = ช่วงวันที่ (เว้นว่าง = ตั้งแต่วันนี้ / จนกว่าจะเปลี่ยนเป็น "ว่าง"), qty = จำนวนชิ้นที่กันไว้
export const HOLD_KINDS = { av: "โสตใช้อุปกรณ์", busy: "ไม่ว่าง" };
export function holdIn(item, from, to) {
  const h = item.hold;
  if (!h || !HOLD_KINDS[h.kind]) return 0;
  const a = h.from || "0000-00-00", b = h.until || "9999-12-31";
  if (a > to || b < from) return 0;
  const qty = Number(item.quantity || 0);
  return (Array.isArray(item.nos) && item.nos.length) ? qty : Math.min(qty, Number(h.qty) || qty);
}
export const holdOn = (item, t = today()) => (holdIn(item, t, t) ? item.hold : null);

export function itemStatus(item, activeLoans, t = today()) {
  let out = 0, pend = 0, reserved = 0;
  const holders = [];
  for (const l of activeLoans) {
    for (const x of l.items || []) {
      if (x.itemId !== item.id) continue;
      if (l.status === "approved" && l.borrowDate <= t) { out += x.qty; holders.push(l); }
      else if (l.status === "approved") reserved += x.qty;
      else if (l.status === "pending") pend += x.qty;
    }
  }
  const qty = Number(item.quantity || 0);
  const broken = item.condition && item.condition !== "พร้อมใช้งาน";
  const held = broken ? 0 : holdIn(item, t, t);
  const hold = held ? item.hold : null;
  const free = broken ? 0 : Math.max(0, qty - out - held);
  let key = "free";
  if (broken) key = "broken";
  else if (free === 0 && held) key = hold.kind;
  else if (free === 0) key = "out";
  else if (out > 0 || held > 0) key = "partial";
  return { qty, out, pend, reserved, free, key, holders, broken, held, hold };
}
export const ITEM_STATUS = {
  free: { label: "ว่าง", cls: "st-approved" },
  partial: { label: "ว่างบางส่วน", cls: "st-partial" },
  out: { label: "ถูกยืมทั้งหมด", cls: "st-rejected" },
  broken: { label: "ชำรุด / ส่งซ่อม", cls: "st-cancelled" },
  av: { label: "โสตใช้อุปกรณ์", cls: "st-av" },
  busy: { label: "ไม่ว่าง", cls: "st-rejected" },
};

// จำนวนที่ยังยืมได้ในช่วงวันที่ (นับทั้งรายการที่อนุมัติแล้วและที่กำลังขออนุญาต)
export function availableIn(item, loans, from, to, excludeId, t = today()) {
  if (item.condition && item.condition !== "พร้อมใช้งาน") return 0;
  let used = 0;
  for (const l of loans) {
    if (l.id === excludeId || !ACTIVE.includes(l.status) || !overlapsRange(l, from, to, t)) continue;
    for (const x of l.items || []) if (x.itemId === item.id) used += x.qty;
  }
  return Math.max(0, Number(item.quantity || 0) - used - holdIn(item, from, to));
}

// ----- สถิติการยืม -----
export function computeStats(loans, t = today()) {
  const tally = () => new Map();
  const inc = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
  const s = {
    total: loans.length, units: 0, teacher: 0, student: 0, overdueNow: 0, lateReturns: 0, days: 0, closed: 0,
    byType: tally(), byCategory: tally(), byItem: tally(), byDept: tally(), byClass: tally(), byPurpose: tally(),
    byDay: tally(), byWeek: tally(), byMonth: tally(), unitsByMonth: tally(), unitsByWeek: tally(),
  };
  for (const l of loans) {
    const u = loanUnits(l);
    s.units += u;
    if (l.borrowerType === "student") s.student++; else s.teacher++;
    inc(s.byType, shortType(l.borrowerType));
    for (const x of l.items || []) { inc(s.byCategory, x.category || "อื่น ๆ", x.qty); inc(s.byItem, x.name, x.qty); }
    if (l.borrowerType === "student") inc(s.byClass, l.classroom || "ไม่ระบุ");
    else inc(s.byDept, l.department || "ไม่ระบุ");
    inc(s.byPurpose, l.purpose || "ไม่ระบุ");
    if (isOverdue(l, t)) s.overdueNow++;
    if (l.status === "returned") {
      s.closed++;
      s.days += Math.max(1, daysBetween(l.borrowDate, l.returnedDate || l.dueDate) + 1);
      if ((l.returnedDate || "") > l.dueDate) s.lateReturns++;
    }
    inc(s.byDay, l.borrowDate);
    const wk = mondayOf(l.borrowDate), mo = l.borrowDate.slice(0, 7);
    inc(s.byWeek, wk); inc(s.unitsByWeek, wk, u);
    inc(s.byMonth, mo); inc(s.unitsByMonth, mo, u);
  }
  s.avgDays = s.closed ? s.days / s.closed : 0;
  return s;
}
export const sortedEntries = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
export const monthLabel = (ym) => parseYmd(ym + "-01").toLocaleDateString("th-TH", { month: "long", year: "numeric" });
export const monthShort = (ym) => parseYmd(ym + "-01").toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
export const weekLabel = (mon) => `${thShort(mon)} – ${thDate(addDays(mon, 6), { day: "numeric", month: "short", year: "2-digit" })}`;

// ----- เปิดในเบราว์เซอร์ในแอป (LINE, Facebook ฯลฯ) -----
export const inAppBrowser = () => {
  const ua = navigator.userAgent || "";
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "TikTok";
  if (/; wv\)/.test(ua)) return "แอป";
  return "";
};
