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
export const catIcon = (name) => (CATEGORIES.find((c) => c.name === name) || { icon: "📦" }).icon;
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
export const itemsText = (l) => (l.items || []).map(lineText).join(", ");

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
  const free = broken ? 0 : Math.max(0, qty - out);
  let key = "free";
  if (broken) key = "broken";
  else if (free === 0) key = "out";
  else if (out > 0) key = "partial";
  return { qty, out, pend, reserved, free, key, holders, broken };
}
export const ITEM_STATUS = {
  free: { label: "ว่าง", cls: "st-approved" },
  partial: { label: "ว่างบางส่วน", cls: "st-partial" },
  out: { label: "ถูกยืมทั้งหมด", cls: "st-rejected" },
  broken: { label: "ชำรุด / ส่งซ่อม", cls: "st-cancelled" },
};

// จำนวนที่ยังยืมได้ในช่วงวันที่ (นับทั้งรายการที่อนุมัติแล้วและที่กำลังขออนุญาต)
export function availableIn(item, loans, from, to, excludeId, t = today()) {
  if (item.condition && item.condition !== "พร้อมใช้งาน") return 0;
  let used = 0;
  for (const l of loans) {
    if (l.id === excludeId || !ACTIVE.includes(l.status) || !overlapsRange(l, from, to, t)) continue;
    for (const x of l.items || []) if (x.itemId === item.id) used += x.qty;
  }
  return Math.max(0, Number(item.quantity || 0) - used);
}

// ----- นัดหมายสำหรับ Google Calendar (นัดหมายทั้งวัน ตั้งแต่วันยืมถึงวันกำหนดคืน) -----
export function calendarEvent(l) {
  const who = `${l.borrowerName}${l.borrowerType === "student" ? ` (นักเรียน${l.classroom ? " " + l.classroom : ""})` : ""}`;
  const lines = [
    `ผู้ยืม: ${who}`,
    l.department ? `หน่วยงาน: ${l.department}` : null,
    `อุปกรณ์: ${itemsText(l)}`,
    `ใช้สำหรับ: ${l.purpose || "-"}`,
    `กำหนดคืน: ${thDate(l.dueDate)}`,
    l.note ? `หมายเหตุ: ${l.note}` : null,
    "",
    "บันทึกจากระบบยืม-คืนอุปกรณ์ งานโสตทัศนศึกษา",
  ].filter((x) => x !== null);
  return {
    summary: `ยืม: ${itemsText(l)} — ${l.borrowerName}`.slice(0, 250),
    description: lines.join("\n"),
    start: { date: l.borrowDate },
    end: { date: addDays(l.dueDate, 1) },
    extendedProperties: { private: { sodeLoanId: String(l.id || "web") } },
  };
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
