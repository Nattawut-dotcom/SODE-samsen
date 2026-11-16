import { CONFIG } from "./config.js";

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
export const thDate = (s, opt = { day: "numeric", month: "short", year: "numeric" }) =>
  s ? parseYmd(s).toLocaleDateString("th-TH", opt) : "";
export const thDateLong = (s) => thDate(s, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  return `${thDate(a, { day: "numeric", month: "short", year: "numeric" })} – ${thDate(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

// ----- เวลา -----
export const toMin = (t) => {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return h * 60 + m;
};
export const hoursOf = (b) => Math.max(0, (toMin(b.end) - toMin(b.start)) / 60);
export const overlaps = (a, b) => a.date === b.date && a.roomId === b.roomId && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

export const mondayOf = (s) => {
  const d = parseYmd(s);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return ymd(d);
};

export const STATUS = {
  pending: { label: "รอตรวจสอบ", cls: "st-pending" },
  approved: { label: "อนุมัติ", cls: "st-approved" },
  rejected: { label: "ไม่อนุมัติ", cls: "st-rejected" },
  cancelled: { label: "ยกเลิก", cls: "st-cancelled" },
  gcal: { label: "จากปฏิทิน", cls: "st-gcal" },
};

// ----- นัดหมายสำหรับ Google Calendar (ไม่ใส่เบอร์โทร เพราะปฏิทินอาจถูกแชร์) -----
export function calendarEvent(b) {
  const lines = [
    `หน่วยงาน: ${b.department}`,
    `ใช้สำหรับ: ${b.purpose}`,
    (b.services || []).length ? `ขอรับบริการ: ${b.services.join(", ")}` : null,
    (b.equipment || []).length ? `อุปกรณ์: ${b.equipment.join(", ")}` : null,
    b.attendees ? `ผู้เข้าร่วม: ${b.attendees} คน` : null,
    `ผู้ขอใช้: ${b.requester}`,
    b.note ? `รายละเอียด: ${b.note}` : null,
    "",
    "บันทึกจากระบบจองห้อง งานโสตทัศนศึกษา",
  ].filter((x) => x !== null);
  return {
    summary: b.title,
    location: b.roomName,
    description: lines.join("\n"),
    start: { dateTime: `${b.date}T${b.start}:00`, timeZone: "Asia/Bangkok" },
    end: { dateTime: `${b.date}T${b.end}:00`, timeZone: "Asia/Bangkok" },
    // ป้ายกำกับว่านัดหมายนี้สร้างจากเว็บ (ใช้ตอนดึงข้อมูลจากปฏิทิน จะได้ไม่แสดงซ้ำ)
    extendedProperties: { private: { sodeBookingId: String(b.id || "web") } },
  };
}

// ----- สถิติการใช้บริการ -----
export function computeStats(bookings) {
  const tally = () => new Map();
  const inc = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
  const s = {
    total: bookings.length, hours: 0, attendees: 0,
    byRoom: tally(), byDept: tally(), byPurpose: tally(), byService: tally(), byEquip: tally(),
    byDay: tally(), byWeek: tally(), byMonth: tally(), hoursByMonth: tally(), hoursByWeek: tally(),
  };
  for (const b of bookings) {
    const h = hoursOf(b);
    s.hours += h;
    s.attendees += Number(b.attendees || 0);
    inc(s.byRoom, b.roomName || "-");
    inc(s.byDept, b.department || "-");
    inc(s.byPurpose, b.purpose || "-");
    (b.services || []).forEach((x) => inc(s.byService, x));
    (b.equipment || []).forEach((x) => inc(s.byEquip, x));
    inc(s.byDay, b.date);
    const wk = mondayOf(b.date), mo = b.date.slice(0, 7);
    inc(s.byWeek, wk); inc(s.hoursByWeek, wk, h);
    inc(s.byMonth, mo); inc(s.hoursByMonth, mo, h);
  }
  return s;
}
export const sortedEntries = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
export const monthLabel = (ym) => parseYmd(ym + "-01").toLocaleDateString("th-TH", { month: "long", year: "numeric" });
export const monthShort = (ym) => parseYmd(ym + "-01").toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
export const weekLabel = (mon) => `${thDate(mon, { day: "numeric", month: "short" })} – ${thDate(addDays(mon, 6), { day: "numeric", month: "short", year: "2-digit" })}`;
