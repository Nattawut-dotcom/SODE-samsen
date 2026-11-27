// ============================================================
//  ปฏิทินงาน / การใช้ห้อง — ข้อมูลดึงอัตโนมัติจาก Google Calendar ของอีเมลงานโสตฯ
//  (Apps Script ในบัญชีโรงเรียนซิงก์ลง calendarEvents ทุก 15 นาที — ดู apps-script/Calendar.gs)
// ============================================================
import { store } from "./store.js";
import { $, $$, esc, ymd, parseYmd, today, addDays, thDate, thDateLong, mondayOf, num } from "./util.js";

// จัดประเภทงานอัตโนมัติจากชื่องาน (ตามลำดับ — ข้อแรกที่ตรงจะถูกเลือก)
export const EVENT_TYPES = [
  ["ประชุม / สัมมนา", /ประชุม|สัมมนา|ชี้แจง|ปฐมนิเทศ|ปัจฉิม|meeting/i],
  ["อบรม / บรรยาย", /อบรม|บรรยาย|เวิร์กช็อป|workshop|พัฒนาครู|เสวนา/i],
  ["ซ้อม / เตรียมงาน", /ซ้อม|เตรียม|ติดตั้ง|จัดสถานที่/],
  ["ค่าย", /ค่าย|camp/i],
  ["การเรียนการสอน / สอบ", /วิชา|สอน|สอบ|เรียน|ติว|ประเมิน|สัมภาษณ์|แนะแนว/],
  ["ต้อนรับ / ศึกษาดูงาน", /ต้อนรับ|ศึกษาดูงาน|เยี่ยมชม|ดูงาน/],
  ["พิธี / มอบรางวัล", /พิธี|มอบ|ไหว้|วันสมเด็จ|เทิดพระเกียรติ|วันแม่|วันพ่อ|วันครู|วันสำคัญ|รางวัล/],
  ["กีฬา / การแสดง / กิจกรรม", /กีฬา|แสดง|ประกวด|เชียร์|ชุมนุม|กิจกรรม|กระทง|คอนเสิร์ต|นิทรรศการ|day ?camp/i],
];
export const eventType = (title) => (EVENT_TYPES.find(([, re]) => re.test(title || "")) || ["อื่น ๆ"])[0];
export const SLOT_NOTE = "เช้า ก่อน 12:00 · พักกลางวัน 12:00–13:00 · บ่าย 13:00–16:30 · หลังเลิกเรียน 16:30 ขึ้นไป";
const SLOTS = ["ทั้งวัน", "ช่วงเช้า", "พักกลางวัน", "ช่วงบ่าย", "หลังเลิกเรียน"];
const slotOf = (e) => (e.allDay ? SLOTS[0] : e.start < "12:00" ? SLOTS[1] : e.start < "13:00" ? SLOTS[2] : e.start < "16:30" ? SLOTS[3] : SLOTS[4]);
const DOW_FULL = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };
// รหัสงาน: งานทั้งวันหลายวันถูกแยกเป็นรายวัน (id_วันที่) → รวมกลับเป็นงานเดียว
export const eventKey = (e) => (e.allDay ? String(e.id).replace(/_\d{4}-\d{2}-\d{2}$/, "") : e.id);
export const eventTime = (e) => (e.allDay ? "ทั้งวัน" : `${e.start}–${e.end} น.`);
export const loadEvents = (from, to) =>
  store.query("calendarEvents", { range: ["date", from, to] })
    .then((r) => r.sort((a, b) => (a.date + (a.allDay ? "0" : "1") + a.start).localeCompare(b.date + (b.allDay ? "0" : "1") + b.start)));
export const loadSyncInfo = () => store.get("meta", "calendarSync").catch(() => null);

export function computeEventStats(rows) {
  const tally = () => new Map();
  const inc = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
  const s = {
    occurrences: rows.length, events: 0, allDayEvents: 0, timed: 0, hours: 0, days: new Set(rows.map((e) => e.date)).size,
    byType: tally(), bySlot: tally(), byWeekday: tally(), byLocation: tally(), byTitle: tally(),
    byDay: tally(), byWeek: tally(), byMonth: tally(), hoursByMonth: tally(), hasLocation: false,
  };
  const seen = new Set();
  for (const e of rows) {
    const k = eventKey(e), first = !seen.has(k);
    seen.add(k);
    inc(s.byDay, e.date); inc(s.byWeek, mondayOf(e.date)); inc(s.byMonth, e.date.slice(0, 7));
    inc(s.byWeekday, DOW_FULL[parseYmd(e.date).getDay()]);
    if (!e.allDay) {
      const h = Math.max(0, toMin(e.end) - toMin(e.start)) / 60;
      s.hours += h; s.timed++; inc(s.hoursByMonth, e.date.slice(0, 7), h);
    }
    if (!first) continue; // ด้านล่างนับต่องาน (งานหลายวันนับครั้งเดียว)
    s.events++;
    if (e.allDay) s.allDayEvents++;
    inc(s.byType, eventType(e.title));
    inc(s.bySlot, slotOf(e));
    if (e.location) { s.hasLocation = true; inc(s.byLocation, e.location.trim()); }
    inc(s.byTitle, (e.title || "").replace(/\s+/g, " ").trim());
  }
  return s;
}

// ---------- หน้าปฏิทินงาน (ผู้ใช้ที่เข้าสู่ระบบแล้ว) ----------
const evState = { month: "", sel: "" };
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "เมื่อสักครู่" : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชั่วโมงที่แล้ว` : `${Math.round(m / 1440)} วันที่แล้ว`;
};
export async function eventsPage(el, { fail }) {
  const t = today();
  if (!evState.month) { evState.month = t.slice(0, 7); evState.sel = t; }
  el.innerHTML = `<div class="wrap"><div class="page-head"><h1>ปฏิทินงาน</h1>
      <p>งานและการใช้ห้องจากปฏิทินของงานโสตฯ อัปเดตอัตโนมัติทุก 15 นาที <span class="clip" id="ev-sync"></span></p></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px">
      <div class="home-grid"><div class="card" id="ev-cal"></div><div class="card" id="ev-day"></div></div>
    </div></section>`;
  const host = $("#ev-cal", el), dayHost = $("#ev-day", el);
  loadSyncInfo().then((m) => { if (m?.at) $("#ev-sync", el).textContent = `· ซิงก์ล่าสุด ${ago(m.at)}`; });
  const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  let rows = [];
  async function draw() {
    const [y, m] = evState.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const from = ymd(new Date(y, m - 1, 1 - first.getDay()));
    const cells = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7) * 7;
    rows = await loadEvents(from, addDays(from, cells - 1));
    const by = {};
    rows.forEach((e) => (by[e.date] ||= []).push(e));
    let html = `<div class="cal-head"><h2>${first.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</h2>
      <div class="cal-nav"><button class="btn ghost sm" data-today>วันนี้</button><button class="icon-btn" data-prev aria-label="เดือนก่อนหน้า">‹</button><button class="icon-btn" data-next aria-label="เดือนถัดไป">›</button></div></div>
      <div class="cal">${DOW.map((d) => `<div class="dow">${d}</div>`).join("")}`;
    for (let i = 0; i < cells; i++) {
      const d = addDays(from, i), list = by[d] || [], inMonth = parseYmd(d).getMonth() === m - 1;
      html += `<button class="day${inMonth ? "" : " out"}${d === t ? " today" : ""}${d === evState.sel ? " sel" : ""}" data-d="${d}" aria-label="${thDate(d)} มีงาน ${list.length} รายการ">
        <span class="dn">${parseYmd(d).getDate()}</span>
        ${list.slice(0, 3).map((e) => `<span class="ev gcal${e.allDay ? " allday" : ""}">${e.allDay ? "" : `<b class="ev-t">${e.start}</b> `}${esc(e.title)}</span>`).join("")}
        ${list.length > 3 ? `<span class="ev-more">อีก ${list.length - 3} รายการ</span>` : ""}</button>`;
    }
    host.innerHTML = html + `</div><div class="legend"><span><i class="lg gcal"></i>งานที่มีเวลา</span><span><i class="lg gcal-all"></i>งานทั้งวัน</span><span>แตะที่วันเพื่อดูรายละเอียด</span></div>`;
    const step = (n) => { const x = new Date(y, m - 1 + n, 1); evState.month = ymd(x).slice(0, 7); draw().catch(fail); };
    $("[data-prev]", host).onclick = () => step(-1);
    $("[data-next]", host).onclick = () => step(1);
    $("[data-today]", host).onclick = () => { evState.month = t.slice(0, 7); evState.sel = t; draw().catch(fail); };
    $$(".day", host).forEach((b) => (b.onclick = () => {
      evState.sel = b.dataset.d;
      $$(".day", host).forEach((x) => x.classList.toggle("sel", x === b));
      drawDay();
    }));
    drawDay();
  }
  function drawDay() {
    const d = evState.sel, list = rows.filter((e) => e.date === d);
    dayHost.innerHTML = `<div class="cal-head"><div><h2>งานประจำวัน</h2><p class="sub" style="margin:2px 0 0">${thDateLong(d)}</p></div>
        <input class="inp sm" type="date" value="${d}" aria-label="เลือกวันที่" id="ev-pick"></div>
      ${list.length ? `<p class="clip" style="margin:0 0 10px">${list.length} รายการ</p><div class="day-list">${list.map((e) => `
        <div class="day-item static ev-item"><span class="ev-when${e.allDay ? " all" : ""}">${e.allDay ? "ทั้งวัน" : `${e.start}<small>${e.end}</small>`}</span>
          <span class="di-body"><b>${esc(e.title)}</b>
            ${e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}
            ${e.description ? `<span class="ev-desc">${esc(e.description)}</span>` : ""}
            <span class="ev-type">${esc(eventType(e.title))}</span></span></div>`).join("")}</div>`
        : `<div class="empty" style="padding:36px 8px">ไม่มีงานในวันนี้</div>`}`;
    $("#ev-pick", dayHost).onchange = (e) => {
      if (!e.target.value) return;
      evState.sel = e.target.value;
      if (evState.sel.slice(0, 7) !== evState.month) { evState.month = evState.sel.slice(0, 7); draw().catch(fail); }
      else { $$(".day", host).forEach((x) => x.classList.toggle("sel", x.dataset.d === evState.sel)); drawDay(); }
    };
  }
  await draw();
}
