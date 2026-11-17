import { CONFIG, DEPARTMENTS, PURPOSES, SERVICES, EQUIPMENT, DEFAULT_ROOMS, BUDGET_CATEGORIES, FUND_TYPES, BUDGET_PROJECTS } from "./config.js";
import { store, isDemo } from "./store.js";
import {
  $, $$, esc, pad, ymd, parseYmd, today, addDays, thDate, thDateLong, money, num, fiscalYearOf, fiscalRange, fiscalLabel,
  toMin, hoursOf, overlaps, mondayOf, STATUS, computeStats, sortedEntries, monthShort, weekLabel,
} from "./util.js";
import { exportBookingReport, exportBudgetReport } from "./report.js";

const state = { user: null, rooms: null, pending: 0 };
const view = $("#view");
let renderToken = 0;

// ============================================================
//  ส่วนช่วยเหลือ UI
// ============================================================
let toastTimer;
function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), isErr ? 5200 : 2600);
}
const fail = (e) => { console.error(e); toast(friendly(e), true); };
function friendly(e) {
  const m = String(e?.code || e?.message || e);
  if (m.includes("permission-denied") || m.includes("insufficient permissions")) return "ไม่มีสิทธิ์ทำรายการนี้ (ตรวจสอบสิทธิ์ผู้ใช้หรือ Firestore Rules)";
  if (m.includes("popup-closed") || m.includes("cancelled-popup")) return "ยกเลิกการเข้าสู่ระบบ";
  if (m.includes("unauthorized-domain")) return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication (ดูคู่มือ ขั้นตอนที่ 6)";
  if (m.includes("network")) return "เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่";
  return e?.message || m;
}

function openModal(title, html) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="ปิด">✕</button></div>
    <div class="modal-body">${html}</div></div>`;
  const m = { el: back, onClose: null, close() { back.remove(); document.removeEventListener("keydown", onKey); } };
  const dismiss = () => { m.onClose?.(); m.close(); };
  const onKey = (e) => e.key === "Escape" && dismiss();
  back.addEventListener("mousedown", (e) => e.target === back && dismiss());
  $("[data-close]", back).onclick = dismiss;
  document.addEventListener("keydown", onKey);
  $("#modal-root").append(back);
  m.dismiss = dismiss;
  return m;
}

function askText(title, label, okLabel) {
  return new Promise((res) => {
    const m = openModal(title, `<label class="f"><span>${esc(label)}</span><textarea class="inp" rows="3"></textarea></label>
      <div class="form-actions" style="margin-top:16px"><button class="btn ghost" data-x>ยกเลิก</button><button class="btn" data-ok>${esc(okLabel)}</button></div>`);
    m.onClose = () => res(null);
    $("[data-x]", m.el).onclick = m.dismiss;
    $("[data-ok]", m.el).onclick = () => { const v = $("textarea", m.el).value.trim(); m.close(); res(v); };
    $("textarea", m.el).focus();
  });
}

// tooltip ของกราฟ
const tip = document.createElement("div");
tip.className = "tip"; tip.hidden = true;
document.body.append(tip);
document.addEventListener("mousemove", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (!el) return (tip.hidden = true);
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  tip.style.left = Math.min(window.innerWidth - 140, Math.max(140, e.clientX)) + "px";
  tip.style.top = e.clientY + "px";
});

const stBadge = (s) => `<span class="st ${STATUS[s]?.cls || ""}">${STATUS[s]?.label || s}</span>`;
const opts = (arr, sel, placeholder) =>
  (placeholder ? `<option value="">${placeholder}</option>` : "") + arr.map((x) => `<option${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
const chips = (name, arr, sel = []) =>
  `<div class="chips">${arr.map((x) => `<label class="chip"><input type="checkbox" name="${name}" value="${esc(x)}"${sel.includes(x) ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>`;
const tagsOf = (b) =>
  `<div class="tags">${(b.services || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}${(b.equipment || []).map((x) => `<span class="tag eq">${esc(x)}</span>`).join("")}</div>`;
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const isStaff = () => state.user?.role === "staff";

async function getRooms(force) {
  if (!state.rooms || force) state.rooms = (await store.list("rooms")).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "th"));
  return state.rooms;
}
async function refreshPending() {
  if (!isStaff()) return;
  try { state.pending = (await store.query("bookings", { eq: ["status", "pending"] })).length; } catch { state.pending = 0; }
  const c = $("#nav-links .count");
  if (c) { c.textContent = state.pending; c.hidden = !state.pending; }
}

// ----- Google Calendar -----
const cal = store.calendar;
// เปิดหน้าต่างขอสิทธิ์ปฏิทิน (ต้องเรียกทันทีหลังการคลิก ไม่เช่นนั้นเบราว์เซอร์อาจบล็อกป๊อปอัป)
async function calReady() {
  if (!cal.enabled || cal.connected()) return;
  try { await cal.connect(); } catch (e) { console.warn(e); }
}
async function calAdd(b) {
  if (!cal.enabled || b.calendarEventId) return null;
  try {
    const id = await cal.insert(b);
    await store.update("bookings", b.id, { calendarEventId: id });
    b.calendarEventId = id;
    return true;
  } catch (e) { console.error(e); toast("บันทึกแล้ว แต่ลงปฏิทินไม่สำเร็จ: " + friendly(e), true); return false; }
}
async function calRemove(b) {
  if (!cal.enabled || !b.calendarEventId) return null;
  try {
    await cal.remove(b.calendarEventId);
    await store.update("bookings", b.id, { calendarEventId: "" });
    b.calendarEventId = "";
    return true;
  } catch (e) { console.error(e); toast("ลบออกจากปฏิทินไม่สำเร็จ: " + friendly(e), true); return false; }
}
// ลบนัดหมายของรายการที่ผู้ขอยกเลิกเอง (ผู้ขอไม่มีสิทธิ์แก้ปฏิทิน จึงให้ฝั่งพนักงานโสตเก็บกวาด)
async function calSweep() {
  if (!cal.enabled || !cal.connected()) return;
  try {
    const rows = await store.query("bookings", { range: ["date", today(), "9999-12-31"] });
    for (const b of rows) if (b.calendarEventId && b.status !== "approved") await calRemove(b);
  } catch (e) { console.warn(e); }
}

// ดึงนัดหมายจาก Google Calendar มาเก็บในฐานข้อมูล เพื่อให้ทุกคนเห็นในปฏิทินของเว็บ
// (ทำงานเมื่อพนักงานโสตเชื่อมต่อปฏิทินอยู่ — ครูทั่วไปไม่ต้องขอสิทธิ์ปฏิทิน)
const SYNC_KEY = "sode-cal-sync";
async function calSync(force) {
  if (!isStaff() || !cal.enabled || cal.demo || !cal.connected()) return null;
  const last = +(sessionStorage.getItem(SYNC_KEY) || 0);
  if (!force && Date.now() - last < 5 * 60000) return null;
  sessionStorage.setItem(SYNC_KEY, String(Date.now()));
  const from = addDays(today(), -7), to = addDays(today(), 120);
  const want = new Map();
  for (const e of await cal.list(from, to)) {
    if (e.status === "cancelled") continue;
    if (e.extendedProperties?.private?.sodeBookingId) continue; // สร้างจากเว็บอยู่แล้ว
    if (e.visibility === "private" || e.visibility === "confidential") continue; // ไม่นำนัดหมายส่วนตัวมาแสดง
    const title = (e.summary || "(ไม่มีชื่อ)").slice(0, 200), location = (e.location || "").slice(0, 200);
    if (e.start?.date) {
      const endD = e.end?.date || addDays(e.start.date, 1);
      for (let d = e.start.date, n = 0; d < endD && n < 31; d = addDays(d, 1), n++)
        if (d >= from && d <= to) want.set(`${e.id}_${d}`, { title, location, date: d, start: "00:00", end: "23:59", allDay: true });
    } else if (e.start?.dateTime) {
      const d = e.start.dateTime.slice(0, 10);
      const sameDay = e.end?.dateTime?.slice(0, 10) === d;
      want.set(e.id, { title, location, date: d, start: e.start.dateTime.slice(11, 16), end: sameDay ? e.end.dateTime.slice(11, 16) : "23:59", allDay: false });
    }
  }
  const have = await store.query("calendarEvents", { range: ["date", from, to] });
  const haveMap = new Map(have.map((x) => [x.id, x]));
  let changed = 0;
  for (const [id, v] of want) {
    const h = haveMap.get(id);
    if (!h || ["title", "location", "date", "start", "end"].some((k) => h[k] !== v[k])) { await store.set("calendarEvents", id, v); changed++; }
  }
  for (const h of have) if (!want.has(h.id)) { await store.remove("calendarEvents", h.id); changed++; }
  return changed;
}

// ============================================================
//  แถบนำทาง + Router
// ============================================================
const NAV_USER = [["", "หน้าหลัก"], ["book", "จองห้อง / ขอใช้บริการ"], ["my", "รายการของฉัน"]];
const NAV_STAFF = [["requests", "คำขอใช้บริการ"], ["stats", "สถิติ"], ["budget", "งบประมาณ"], ["settings", "ตั้งค่า"]];
const STAFF_ONLY = new Set(NAV_STAFF.map((x) => x[0]));

function renderNav(active) {
  const u = state.user;
  const links = !u ? [] : [...NAV_USER, ...(isStaff() ? NAV_STAFF : [])];
  $("#nav-links").innerHTML = links
    .map(([p, l]) => `<a href="#/${p}" class="${p === active ? "active" : ""}">${l}${p === "requests" ? `<span class="count" ${state.pending ? "" : "hidden"}>${state.pending}</span>` : ""}</a>`)
    .join("");
  $("#nav-user").innerHTML = u
    ? `${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc((u.name || "?")[0])}</span>`}
       <span class="uname">${esc(u.name)}</span><span class="role-tag">${isStaff() ? "พนักงานโสต" : "ผู้ขอใช้บริการ"}</span>
       <button class="linkbtn" id="btn-out">ออกจากระบบ</button>`
    : "";
  const out = $("#btn-out");
  if (out) out.onclick = () => store.signOut().catch(fail);
}

function renderDemoBar() {
  const bar = $("#demo-bar");
  if (!isDemo) return;
  bar.hidden = false;
  const r = store.demoRole();
  bar.innerHTML = `<span><b>โหมดตัวอย่าง</b> · ยังไม่ได้เชื่อมต่อ Firebase ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น</span>
    <span>ดูในมุมมอง <button data-r="user" class="${r === "user" ? "on" : ""}">ครู / ผู้ขอใช้บริการ</button> <button data-r="staff" class="${r === "staff" ? "on" : ""}">พนักงานโสต</button></span>
    <button data-reset>รีเซ็ตข้อมูลตัวอย่าง</button>`;
  $$("[data-r]", bar).forEach((b) => (b.onclick = () => store.setDemoRole(b.dataset.r)));
  $("[data-reset]", bar).onclick = () => { state.rooms = null; store.resetDemo(); toast("รีเซ็ตข้อมูลตัวอย่างแล้ว"); };
}

const ROUTES = { "": home, book, my, requests, stats, budget, settings };

async function render() {
  const tk = ++renderToken;
  $("#modal-root").replaceChildren(); // ปิดหน้าต่างที่ค้างอยู่เมื่อเปลี่ยนหน้า
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(qs || "");
  let name = ROUTES[path] ? path : "";
  if (!state.user) name = "";
  if (STAFF_ONLY.has(name) && !isStaff()) name = "";
  renderNav(name);
  const el = document.createElement("div");
  try {
    await ROUTES[name](el, params);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="wrap"><div class="empty"><p>โหลดข้อมูลไม่สำเร็จ</p><p class="note err" style="display:inline-block">${esc(friendly(e))}</p></div></div>`;
  }
  if (tk !== renderToken) return;
  view.replaceChildren(el);
  window.scrollTo(0, 0);
}

// ============================================================
//  หน้าหลัก
// ============================================================
const G_LOGO = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.700 6c4.500-4.200 7.100-10.400 7.100-17.700z"/><path fill="#FBBC05" d="M10.500 28.600A14.500 14.500 0 0 1 9.700 24c0-1.600.3-3.200.800-4.600l-7.900-6.200A24 24 0 0 0 0 24c0 3.900.9 7.500 2.600 10.800l7.900-6.200z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.100 1.400-4.900 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z"/></svg>`;

async function home(el) {
  if (!state.user) {
    el.innerHTML = `
      <section class="hero">
        <div class="eyebrow">${esc(CONFIG.unitName)} · ${esc(CONFIG.schoolName)}</div>
        <h1>จองห้อง ขอใช้บริการ<br>ครบ จบในที่เดียว</h1>
        <p class="lead">จองห้องประชุม ขอบริการถ่ายภาพ วิดีโอ เครื่องเสียง และจอภาพ พร้อมติดตามสถานะได้ทุกขั้นตอน</p>
        <div class="hero-actions"><button class="btn google lg" id="btn-in">${G_LOGO} เข้าสู่ระบบด้วย Google</button></div>
      </section>
      <section class="band"><div class="wrap" style="padding-top:56px;padding-bottom:64px">
        <div class="tiles">
          <div class="tile"><span class="ico">🗓️</span><h3>จองง่าย เห็นคิวว่างทันที</h3><p>ดูปฏิทินการใช้ห้องทั้งเดือน เลือกห้อง วัน เวลา แล้วส่งคำขอได้ในไม่กี่ขั้นตอน</p></div>
          <div class="tile"><span class="ico">🎥</span><h3>ขอบริการโสตฯ ในฟอร์มเดียว</h3><p>ระบุบริการและอุปกรณ์ที่ต้องการ ทั้งถ่ายภาพ วิดีโอ ถ่ายทอดสด เครื่องเสียง และจอ LED</p></div>
          <div class="tile"><span class="ico">📊</span><h3>สถิติและรายงานอัตโนมัติ</h3><p>สรุปการใช้บริการรายสัปดาห์ รายเดือน รายปีงบประมาณ และส่งออกเป็นไฟล์ Word ได้ทันที</p></div>
        </div>
      </div></section>`;
    $("#btn-in", el).onclick = () => store.signIn().catch(fail);
    return;
  }
  const t = today();
  const [rooms, todays] = await Promise.all([getRooms(), store.query("bookings", { range: ["date", t, t] })]);
  const todayOk = todays.filter((b) => b.status === "approved").sort((a, b) => a.start.localeCompare(b.start));
  el.innerHTML = `
    <div class="wrap"><div class="page-head head-row">
      <div><h1>สวัสดี ${esc((state.user.name || "").split(" ")[0])}</h1><p>${thDateLong(t)}</p></div>
      <a class="btn lg" href="#/book">จองห้อง / ขอใช้บริการ</a>
    </div></div>
    <section class="band"><div class="wrap" style="padding-top:28px;padding-bottom:56px">
      <div class="kpis">
        <div class="kpi"><div class="k">การใช้ห้องวันนี้</div><div class="v">${todayOk.length}<small>รายการ</small></div></div>
        <div class="kpi"><div class="k">ห้องที่เปิดให้จอง</div><div class="v">${rooms.filter((r) => r.active !== false).length}<small>ห้อง</small></div></div>
        ${isStaff() ? `<div class="kpi"><div class="k">คำขอรอตรวจสอบ</div><div class="v">${state.pending}<small>รายการ</small></div><div class="n"><a href="#/requests">ตรวจสอบคำขอ ›</a></div></div>` : ""}
      </div>
      <div class="card" id="cal-card"></div>
    </div></section>`;
  await calSync().catch((e) => console.warn(e));
  await mountCalendar($("#cal-card", el));
}

async function mountCalendar(host) {
  const cur = new Date();
  cur.setDate(1);
  let mode = "month", day = today();
  try { mode = localStorage.getItem("sode-cal-mode") === "day" ? "day" : "month"; } catch {}
  const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  const HOUR_PX = 56;

  async function load(from, to) {
    const [bk, ext] = await Promise.all([
      store.query("bookings", { range: ["date", from, to] }),
      store.query("calendarEvents", { range: ["date", from, to] }).catch(() => []),
    ]);
    const rows = bk.filter((b) => b.status === "approved" || b.status === "pending")
      .concat(ext.map((e) => ({ ...e, status: "gcal", roomName: e.location || "ไม่ระบุสถานที่", department: "Google Calendar" })));
    rows.sort((p, q) => p.start.localeCompare(q.start));
    return { rows, hasExt: ext.length > 0 };
  }
  const head = (title) => `<div class="cal-head"><h2>${title}</h2>
    <div class="cal-nav"><div class="seg"><button data-mode="month" class="${mode === "month" ? "on" : ""}">เดือน</button><button data-mode="day" class="${mode === "day" ? "on" : ""}">วัน</button></div>
      <button class="btn ghost sm" data-today>วันนี้</button><button class="icon-btn" data-prev aria-label="ก่อนหน้า">‹</button><button class="icon-btn" data-next aria-label="ถัดไป">›</button></div></div>`;
  const legend = (hasExt, hint) => `<div class="legend"><span><i style="background:#e8f1fc;border:1px solid #b9d5f5"></i>อนุมัติแล้ว</span><span><i style="background:var(--amber-bg);border:1px solid #ecd79a"></i>รอตรวจสอบ</span>${hasExt ? `<span><i style="background:#efeaf8;border:1px solid #d3c7ee"></i>จาก Google Calendar</span>` : ""}<span>${hint}</span></div>`;
  const draw = () => (mode === "day" ? drawDay() : drawMonth());
  const redraw = () => draw().catch(fail);
  function setMode(m) { mode = m; try { localStorage.setItem("sode-cal-mode", m); } catch {} }
  function wire() {
    $$("[data-mode]", host).forEach((b) => (b.onclick = () => { if (b.dataset.mode !== mode) { setMode(b.dataset.mode); redraw(); } }));
    const step = (n) => { if (mode === "day") day = addDays(day, n); else cur.setMonth(cur.getMonth() + n); redraw(); };
    $("[data-prev]", host).onclick = () => step(-1);
    $("[data-next]", host).onclick = () => step(1);
    $("[data-today]", host).onclick = () => { const n = new Date(); cur.setFullYear(n.getFullYear(), n.getMonth(), 1); day = today(); redraw(); };
  }

  // ----- มุมมองเดือน -----
  async function drawMonth() {
    const y = cur.getFullYear(), m = cur.getMonth();
    const first = new Date(y, m, 1);
    const from = ymd(new Date(y, m, 1 - first.getDay()));
    const cells = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7;
    const { rows, hasExt } = await load(from, addDays(from, cells - 1));
    const by = {};
    rows.forEach((b) => (by[b.date] ||= []).push(b));
    const t = today();
    let html = head(first.toLocaleDateString("th-TH", { month: "long", year: "numeric" })) + `<div class="cal">${DOW.map((d) => `<div class="dow">${d}</div>`).join("")}`;
    for (let i = 0; i < cells; i++) {
      const d = addDays(from, i), list = by[d] || [], inMonth = parseYmd(d).getMonth() === m;
      html += `<button class="day${inMonth ? "" : " out"}${d === t ? " today" : ""}" data-d="${d}" aria-label="${thDate(d)} ${list.length} รายการ">
        <span class="dn">${parseYmd(d).getDate()}</span>
        ${list.slice(0, 3).map((b) => `<span class="ev ${b.status}">${b.allDay ? "" : b.start + " "}${esc(b.title)}</span>`).join("")}
        ${list.length > 3 ? `<span class="ev-more">อีก ${list.length - 3} รายการ</span>` : ""}</button>`;
    }
    host.innerHTML = html + `</div>` + legend(hasExt, "แตะที่วันเพื่อดูตารางรายชั่วโมง");
    wire();
    $$(".day", host).forEach((b) => (b.onclick = () => { day = b.dataset.d; setMode("day"); redraw(); }));
  }

  // ----- มุมมองวัน: แสดงกิจกรรมเป็นรายชั่วโมง -----
  async function drawDay() {
    const { rows, hasExt } = await load(day, day);
    const allDay = rows.filter((b) => b.allDay), timed = rows.filter((b) => !b.allDay);
    const h0 = Math.min(7, ...timed.map((b) => Math.floor(toMin(b.start) / 60)));
    const h1 = Math.max(18, ...timed.map((b) => Math.ceil(toMin(b.end) / 60)));
    // จัดกิจกรรมที่เวลาซ้อนกันให้อยู่คนละคอลัมน์
    const colEnd = [];
    const placed = timed.map((b) => {
      const s = toMin(b.start), e = Math.max(toMin(b.end), s + 25);
      let c = colEnd.findIndex((x) => x <= s);
      if (c < 0) { c = colEnd.length; colEnd.push(e); } else colEnd[c] = e;
      return { b, s, e, c };
    });
    const n = Math.max(1, colEnd.length);
    const px = (min) => ((min - h0 * 60) / 60) * HOUR_PX;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
    host.innerHTML = head(thDateLong(day)) + `
      <div class="dayv">
        ${allDay.length ? `<div class="dayv-all"><span class="dayv-lb">ทั้งวัน</span><div>${allDay.map((b) => `<button class="ev ${b.status}" data-i="${rows.indexOf(b)}">${esc(b.title)}</button>`).join("")}</div></div>` : ""}
        <div class="dayv-grid" style="height:${(h1 - h0) * HOUR_PX}px">
          ${hours.map((h) => `<div class="dayv-hour" style="top:${(h - h0) * HOUR_PX}px"><span>${pad(h)}:00</span></div>`).join("")}
          ${day === today() && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? `<div class="dayv-now" style="top:${px(nowMin)}px" title="เวลาปัจจุบัน"></div>` : ""}
          <div class="dayv-events">${placed.map((p) => `<button class="dayv-ev ${p.b.status}" data-i="${rows.indexOf(p.b)}"
            style="top:${px(p.s)}px;height:${Math.max(24, px(p.e) - px(p.s) - 2)}px;left:calc(${(p.c / n) * 100}% + 2px);width:calc(${100 / n}% - 4px)"
            aria-label="${p.b.start} ถึง ${p.b.end} ${esc(p.b.title)} ${esc(p.b.roomName)}"><div><b>${p.b.start}–${p.b.end}</b> ${esc(p.b.title)}</div><span>${esc(p.b.roomName)}</span></button>`).join("")}</div>
        </div>
      </div>
      <div class="dayv-foot"><span class="clip">${rows.length ? `${rows.length} กิจกรรม` : "ไม่มีกิจกรรมในวันนี้"}</span>${day >= today() || isStaff() ? `<a class="btn sm" href="#/book?date=${day}">จองวันนี้</a>` : ""}</div>`
      + legend(hasExt, "แตะที่กิจกรรมเพื่อดูรายละเอียด");
    wire();
    $$("[data-i]", host).forEach((el) => (el.onclick = () => {
      const b = rows[+el.dataset.i];
      if (b.status === "gcal") dayModal(day, [b]); else showBooking(b, redraw);
    }));
  }

  await draw();
}

function dayModal(d, list) {
  const m = openModal(thDateLong(d), list.length
    ? `<div class="list">${list.map((b) => `<div class="file" style="align-items:flex-start;padding:12px 14px"><div style="min-width:92px;font-variant-numeric:tabular-nums">${b.allDay ? "ทั้งวัน" : `${b.start}–${b.end}`}</div>
        <div style="flex:1"><b>${esc(b.title)}</b><div class="muted" style="color:var(--ink-2);font-size:13px">${esc(b.roomName)} · ${esc(b.department)}</div></div>${stBadge(b.status)}</div>`).join("")}</div>`
    : `<p class="empty" style="padding:24px 0">ยังไม่มีการจองในวันนี้</p>`);
  if (d >= today() || isStaff()) {
    $(".modal-body", m.el).insertAdjacentHTML("beforeend", `<div class="form-actions" style="margin-top:18px"><a class="btn" href="#/book?date=${d}">จองวันนี้</a></div>`);
    $(".modal-body a.btn", m.el).onclick = () => m.close();
  }
}

// ============================================================
//  จองห้อง / ขอใช้บริการ
// ============================================================
async function book(el, params) {
  const rooms = (await getRooms()).filter((r) => r.active !== false);
  const u = state.user;
  el.innerHTML = `
    <div class="wrap narrow"><div class="page-head"><h1>จองห้อง / ขอใช้บริการ</h1><p>กรอกรายละเอียดให้ครบถ้วน ${isStaff() ? "รายการที่พนักงานโสตบันทึกจะได้รับการอนุมัติทันที" : "พนักงานโสตจะตรวจสอบและแจ้งผลในหน้า “รายการของฉัน”"}</p></div>
    <div class="section">
    ${rooms.length ? "" : `<p class="note warn">ยังไม่มีห้องในระบบ ${isStaff() ? `<a href="#/settings">ไปที่ตั้งค่าเพื่อเพิ่มห้อง</a>` : "กรุณาติดต่อพนักงานโสต"}</p>`}
    <form id="bk" class="form" novalidate>
      <label class="f full"><span>หัวข้อ / ชื่องาน *</span><input class="inp" name="title" required maxlength="120" placeholder="เช่น ประชุมกลุ่มสาระฯ ครั้งที่ 3"></label>
      <label class="f full"><span>สถานที่ขอรับบริการ *</span><select class="inp" name="roomId" required>
        <option value="">เลือกห้อง</option>${rooms.map((r) => `<option value="${r.id}">${esc(r.name)}${r.capacity ? ` · ${r.capacity} ที่นั่ง` : ""}</option>`).join("")}</select></label>
      <label class="f full"><span>วันที่ขอรับบริการ *</span><input class="inp" type="date" name="date" required value="${esc(params.get("date") || "")}" ${isStaff() ? "" : `min="${today()}"`}></label>
      <label class="f"><span>เวลาเริ่ม *</span><input class="inp" type="time" name="start" required value="08:30"></label>
      <label class="f"><span>เวลาสิ้นสุด *</span><input class="inp" type="time" name="end" required value="10:00"></label>
      <div class="full" id="conflict"></div>
      <label class="f"><span>หน่วยงานที่ขอใช้ *</span><select class="inp" name="department" required>${opts(DEPARTMENTS, "", "เลือกหน่วยงาน")}</select></label>
      <label class="f"><span>ใช้สำหรับ *</span><select class="inp" name="purpose" required>${opts(PURPOSES, "", "เลือกลักษณะการใช้")}</select></label>
      <fieldset class="full"><legend>ขอรับบริการ (เลือกได้หลายข้อ)</legend>${chips("services", SERVICES)}</fieldset>
      <fieldset class="full"><legend>อุปกรณ์ที่ต้องการใช้ (เลือกได้หลายข้อ)</legend>${chips("equipment", EQUIPMENT)}</fieldset>
      <label class="f"><span>ชื่อผู้ขอใช้ *</span><input class="inp" name="requester" required value="${esc(u.name)}"></label>
      <label class="f"><span>โทรศัพท์ *</span><input class="inp" name="phone" required inputmode="tel" maxlength="20" placeholder="08x-xxx-xxxx"></label>
      <label class="f"><span>จำนวนผู้เข้าร่วม (คน)</span><input class="inp" type="number" name="attendees" min="0" max="5000" inputmode="numeric"></label>
      <label class="f full"><span>รายละเอียดเพิ่มเติม</span><textarea class="inp" name="note" rows="3" maxlength="600" placeholder="เช่น ต้องการไมค์ลอย 4 ตัว, ขอไฟล์ภาพหลังงาน"></textarea></label>
      <div class="full form-actions"><a class="btn ghost" href="#/">ยกเลิก</a><button class="btn" type="submit">ส่งคำขอ</button></div>
    </form></div></div>`;
  const f = $("#bk", el), box = $("#conflict", el);
  let clash = [];
  async function check() {
    const v = Object.fromEntries(new FormData(f));
    box.innerHTML = ""; clash = [];
    if (!v.roomId || !v.date || !v.start || !v.end) return;
    if (toMin(v.end) <= toMin(v.start)) return (box.innerHTML = `<p class="note err">เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม</p>`);
    const same = await store.query("bookings", { range: ["date", v.date, v.date] });
    clash = same.filter((b) => (b.status === "approved" || b.status === "pending") && overlaps(b, v));
    box.innerHTML = clash.length
      ? `<p class="note warn"><b>ช่วงเวลานี้มีการจองแล้ว</b><br>${clash.map((b) => `${b.start}–${b.end} ${esc(b.title)} (${STATUS[b.status].label})`).join("<br>")}</p>`
      : `<p class="note good">ห้องว่างในช่วงเวลานี้</p>`;
  }
  ["roomId", "date", "start", "end"].forEach((n) => f.elements[n].addEventListener("change", () => check().catch(fail)));
  if (params.get("date")) check().catch(() => {});
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const fd = new FormData(f), v = Object.fromEntries(fd);
    if (toMin(v.end) <= toMin(v.start)) return toast("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม", true);
    const btn = $("button[type=submit]", f);
    btn.disabled = true;
    try {
      if (isStaff()) await calReady();
      await check();
      if (clash.length) { btn.disabled = false; return toast("ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกเวลาหรือห้องอื่น", true); }
      const room = rooms.find((r) => r.id === v.roomId);
      const b = {
        uid: u.uid, requester: v.requester.trim(), title: v.title.trim(), roomId: room.id, roomName: room.name,
        date: v.date, start: v.start, end: v.end, department: v.department, purpose: v.purpose,
        services: fd.getAll("services"), equipment: fd.getAll("equipment"), attendees: Number(v.attendees || 0),
        note: v.note.trim(), status: isStaff() ? "approved" : "pending", reason: "", createdAt: Date.now(),
      };
      const id = await store.add("bookings", b);
      await store.set("bookingContacts", id, { uid: u.uid, phone: v.phone.trim(), email: u.email || "", date: v.date });
      const added = isStaff() ? await calAdd({ ...b, id }) : null;
      if (added !== false) toast(isStaff() ? (added ? "บันทึกการจองและลงปฏิทินแล้ว" : "บันทึกการจองแล้ว") : "ส่งคำขอแล้ว รอการตรวจสอบ");
      refreshPending();
      location.hash = "#/my";
    } catch (err) { btn.disabled = false; fail(err); }
  };
}

// ============================================================
//  รายการของฉัน
// ============================================================
async function my(el) {
  const rows = (await store.query("bookings", { eq: ["uid", state.user.uid] })).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const t = today();
  const up = rows.filter((b) => b.date >= t).reverse(), past = rows.filter((b) => b.date < t);
  const card = (b) => `<div class="item" data-id="${b.id}">
      <div class="when"><b>${parseYmd(b.date).getDate()}</b><span>${thDate(b.date, { month: "short", year: "2-digit" })}</span></div>
      <div><h3>${esc(b.title)}</h3><div class="meta">${b.start}–${b.end} · ${esc(b.roomName)}</div>${tagsOf(b)}
        ${b.reason ? `<div class="meta" style="margin-top:4px">หมายเหตุจากพนักงานโสต: ${esc(b.reason)}</div>` : ""}</div>
      <div class="side">${stBadge(b.status)}<span><button class="linkbtn" data-view>รายละเอียด</button>${
        b.date >= t && (b.status === "pending" || b.status === "approved") ? ` · <button class="linkbtn" data-cancel style="color:var(--red)">ยกเลิก</button>` : ""}</span></div></div>`;
  el.innerHTML = `<div class="wrap narrow"><div class="page-head head-row"><div><h1>รายการของฉัน</h1><p>ติดตามสถานะคำขอทั้งหมดของคุณ</p></div><a class="btn" href="#/book">จองเพิ่ม</a></div>
    <div class="section">
      ${rows.length ? "" : `<div class="empty">ยังไม่มีรายการจอง</div>`}
      ${up.length ? `<h2 style="font-size:19px;margin:0 0 12px">กำลังจะถึง</h2><div class="list">${up.map(card).join("")}</div>` : ""}
      ${past.length ? `<h2 style="font-size:19px;margin:32px 0 12px">ที่ผ่านมา</h2><div class="list">${past.map(card).join("")}</div>` : ""}
    </div></div>`;
  $$(".item", el).forEach((it) => {
    const b = rows.find((x) => x.id === it.dataset.id);
    $("[data-view]", it).onclick = () => showBooking(b);
    const c = $("[data-cancel]", it);
    if (c) c.onclick = async () => {
      if (!confirm(`ยกเลิกการจอง “${b.title}” ?`)) return;
      try { await store.update("bookings", b.id, { status: "cancelled", updatedAt: Date.now() }); toast("ยกเลิกแล้ว"); refreshPending(); render(); } catch (e) { fail(e); }
    };
  });
}

async function showBooking(b, onChange) {
  let contact = null;
  if (isStaff() || b.uid === state.user.uid) { try { contact = await store.get("bookingContacts", b.id); } catch {} }
  const m = openModal(b.title, `<dl class="dl">
      <dt>สถานะ</dt><dd>${stBadge(b.status)}${b.reason ? ` <span style="color:var(--ink-2)">${esc(b.reason)}</span>` : ""}</dd>
      <dt>วันที่</dt><dd>${thDateLong(b.date)}</dd><dt>เวลา</dt><dd>${b.start}–${b.end} น.</dd>
      <dt>สถานที่</dt><dd>${esc(b.roomName)}</dd><dt>หน่วยงาน</dt><dd>${esc(b.department)}</dd><dt>ใช้สำหรับ</dt><dd>${esc(b.purpose)}</dd>
      <dt>ขอรับบริการ</dt><dd>${(b.services || []).map(esc).join(", ") || "–"}</dd><dt>อุปกรณ์</dt><dd>${(b.equipment || []).map(esc).join(", ") || "–"}</dd>
      <dt>ผู้เข้าร่วม</dt><dd>${b.attendees ? num(b.attendees) + " คน" : "–"}</dd>
      <dt>ผู้ขอใช้</dt><dd>${esc(b.requester)}${contact?.phone ? ` · <a href="tel:${esc(contact.phone)}">${esc(contact.phone)}</a>` : ""}</dd>
      <dt>รายละเอียด</dt><dd>${esc(b.note) || "–"}</dd>
      ${isStaff() && cal.enabled && b.status === "approved" ? `<dt>ปฏิทิน</dt><dd>${b.calendarEventId ? "📅 ลงปฏิทินแล้ว" : `ยังไม่ได้ลงปฏิทิน · <button class="linkbtn" data-cal>ลงปฏิทิน</button>`}</dd>` : ""}</dl>
    ${isStaff() ? `<div class="form-actions" style="margin-top:20px">
      <button class="btn danger sm" data-del>ลบรายการ</button>
      ${b.status !== "rejected" ? `<button class="btn ghost sm" data-s="rejected">ไม่อนุมัติ</button>` : ""}
      ${b.status !== "approved" ? `<button class="btn ok sm" data-s="approved">อนุมัติ</button>` : ""}</div>` : ""}`);
  $$("[data-s]", m.el).forEach((btn) => (btn.onclick = async () => { if (await decide(b, btn.dataset.s)) { m.close(); onChange?.(); } }));
  const calBtn = $("[data-cal]", m.el);
  if (calBtn) calBtn.onclick = async () => {
    await calReady();
    if (await calAdd(b)) { toast("ลงปฏิทินแล้ว"); m.close(); onChange?.(); }
  };
  const del = $("[data-del]", m.el);
  if (del) del.onclick = async () => {
    if (!confirm("ลบรายการนี้ถาวร? (จะไม่ถูกนับในสถิติอีก)")) return;
    try { if (b.calendarEventId) { await calReady(); await calRemove(b); }
      await store.remove("bookings", b.id); await store.remove("bookingContacts", b.id).catch(() => {}); m.close(); toast("ลบแล้ว"); refreshPending(); onChange?.(); } catch (e) { fail(e); }
  };
}

async function decide(b, status) {
  try {
    let reason = "";
    if (status === "approved" || b.calendarEventId) await calReady();
    if (status === "rejected") {
      reason = await askText("ไม่อนุมัติคำขอ", "เหตุผล (ผู้ขอจะเห็นข้อความนี้)", "ยืนยันไม่อนุมัติ");
      if (reason === null) return false;
    } else {
      const same = await store.query("bookings", { range: ["date", b.date, b.date] });
      const clash = same.filter((x) => x.id !== b.id && x.status === "approved" && overlaps(x, b));
      if (clash.length && !confirm(`ช่วงเวลานี้มีรายการที่อนุมัติแล้ว:\n${clash.map((x) => `${x.start}–${x.end} ${x.title}`).join("\n")}\n\nอนุมัติซ้อนหรือไม่?`)) return false;
    }
    await store.update("bookings", b.id, { status, reason, decidedBy: state.user.name, updatedAt: Date.now() });
    b.status = status;
    const synced = status === "approved" ? await calAdd(b) : await calRemove(b);
    if (synced !== false) toast(status === "approved" ? (synced ? "อนุมัติและลงปฏิทินแล้ว" : "อนุมัติแล้ว") : "บันทึกไม่อนุมัติแล้ว");
    refreshPending();
    return true;
  } catch (e) { fail(e); return false; }
}

// ============================================================
//  คำขอใช้บริการ (พนักงานโสต)
// ============================================================
const reqState = { tab: "pending", month: today().slice(0, 7) };
async function requests(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head head-row"><div><h1>คำขอใช้บริการ</h1><p>ตรวจสอบ อนุมัติ และจัดการรายการจองทั้งหมด</p></div><a class="btn" href="#/book">บันทึกการจองแทนผู้ขอ</a></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="req"></div></div></section>`;
  const host = $("#req", el);
  const TABS = [["pending", "รอตรวจสอบ"], ["approved", "อนุมัติ"], ["rejected", "ไม่อนุมัติ"], ["cancelled", "ยกเลิก"], ["all", "ทั้งหมด"]];
  if (!cal.demo) calSweep();
  async function draw() {
    const { tab, month } = reqState;
    let rows;
    if (tab === "pending") rows = await store.query("bookings", { eq: ["status", "pending"] });
    else {
      const from = month + "-01", to = ymd(new Date(+month.slice(0, 4), +month.slice(5), 0));
      rows = (await store.query("bookings", { range: ["date", from, to] })).filter((b) => tab === "all" || b.status === tab);
    }
    rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    host.innerHTML = `<div class="toolbar"><div class="seg">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span>${!cal.enabled ? "" : cal.connected()
          ? `<span class="clip">📅 ${cal.demo ? "ปฏิทินจำลอง (โหมดตัวอย่าง)" : "เชื่อมต่อ Google Calendar แล้ว"}</span>${cal.demo ? "" : `<button class="btn ghost sm" id="rq-sync">ดึงข้อมูลจากปฏิทิน</button>`}`
          : `<button class="btn ghost sm" id="rq-cal">📅 เชื่อมต่อ Google Calendar</button>`}
        ${tab === "pending" ? "" : `<label class="clip">เดือน <input class="inp sm" type="month" value="${month}" id="rq-month"></label>`}</div>
      ${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>วัน / เวลา</th><th>รายการ</th><th>สถานที่</th><th>หน่วยงาน / ผู้ขอ</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${rows.map((b) => `<tr data-id="${b.id}"><td style="white-space:nowrap">${thDate(b.date)}<div class="muted">${b.start}–${b.end}</div></td>
          <td><b>${esc(b.title)}</b><div class="muted">${esc(b.purpose)}</div>${tagsOf(b)}</td><td>${esc(b.roomName)}</td>
          <td>${esc(b.department)}<div class="muted">${esc(b.requester)}</div></td><td>${stBadge(b.status)}${b.calendarEventId ? `<div class="muted" style="margin-top:4px">📅 ลงปฏิทินแล้ว</div>` : ""}</td>
          <td><div class="acts">${b.status === "pending" ? `<button class="btn ok sm" data-s="approved">อนุมัติ</button><button class="btn ghost sm" data-s="rejected">ไม่อนุมัติ</button>` : ""}<button class="btn ghost sm" data-view>ดู</button></div></td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">${tab === "pending" ? "ไม่มีคำขอที่รอตรวจสอบ 🎉" : "ไม่มีรายการในเดือนนี้"}</div>`}`;
    $$("[data-tab]", host).forEach((b) => (b.onclick = () => { reqState.tab = b.dataset.tab; draw().catch(fail); }));
    const cb = $("#rq-cal", host);
    if (cb) cb.onclick = async () => {
      try { await cal.connect(); toast("เชื่อมต่อ Google Calendar แล้ว"); await calSweep(); await calSync(true); draw().catch(fail); } catch (e) { fail(e); }
    };
    const sb = $("#rq-sync", host);
    if (sb) sb.onclick = async () => {
      sb.disabled = true;
      try { const n = await calSync(true); await calSweep(); toast(n ? `อัปเดตจากปฏิทิน ${n} รายการ` : "ข้อมูลตรงกับปฏิทินแล้ว"); } catch (e) { fail(e); }
      sb.disabled = false;
    };
    const mi = $("#rq-month", host);
    if (mi) mi.onchange = () => { if (mi.value) { reqState.month = mi.value; draw().catch(fail); } };
    $$("tr[data-id]", host).forEach((tr) => {
      const b = rows.find((x) => x.id === tr.dataset.id);
      $("[data-view]", tr).onclick = () => showBooking(b, () => draw().catch(fail));
      $$("[data-s]", tr).forEach((btn) => (btn.onclick = async () => { if (await decide(b, btn.dataset.s)) draw().catch(fail); }));
    });
  }
  await draw();
}

// ============================================================
//  สถิติ (พนักงานโสต)
// ============================================================
const statState = { preset: "month", from: "", to: "" };
function presetRange(p) {
  const t = today();
  if (p === "week") { const m = mondayOf(t); return [m, addDays(m, 6)]; }
  if (p === "month") { const d = parseYmd(t); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
  if (p === "fy") return fiscalRange(fiscalYearOf(t));
  return [statState.from || t, statState.to || t];
}
function trendBuckets(stats, from, to) {
  const days = Math.round((parseYmd(to) - parseYmd(from)) / 864e5) + 1;
  const out = [];
  if (days <= 31) {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ label: String(parseYmd(d).getDate()), full: thDate(d, { weekday: "short", day: "numeric", month: "short" }), v: stats.byDay.get(d) || 0 });
    return { unit: "รายวัน", out };
  }
  if (days <= 124) {
    for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push({ label: thDate(d, { day: "numeric", month: "short" }), full: "สัปดาห์ " + weekLabel(d), v: stats.byWeek.get(d) || 0 });
    return { unit: "รายสัปดาห์", out };
  }
  const c = parseYmd(from.slice(0, 7) + "-01");
  while (ymd(c) <= to) { const k = ymd(c).slice(0, 7); out.push({ label: monthShort(k), full: monthShort(k), v: stats.byMonth.get(k) || 0 }); c.setMonth(c.getMonth() + 1); }
  return { unit: "รายเดือน", out };
}
function barList(map, unit = "ครั้ง") {
  const e = sortedEntries(map);
  if (!e.length) return `<p class="muted" style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`;
  const max = e[0][1];
  return `<div class="bars">${e.map(([k, v]) => `<div class="bar-row" data-tip="<b>${esc(k)}</b><br>${num(v)} ${unit}"><span class="lb">${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span class="val">${num(v)}</span></div>`).join("")}</div>`;
}

async function stats(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head"><h1>สถิติการใช้บริการ</h1><p>นับจากรายการที่ได้รับอนุมัติ เลือกช่วงเวลาแล้วส่งออกเป็นรายงาน Word ได้</p></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="st"></div></div></section>`;
  const host = $("#st", el);
  const PRESETS = [["week", "สัปดาห์นี้"], ["month", "เดือนนี้"], ["fy", "ปีงบประมาณนี้"], ["custom", "กำหนดเอง"]];
  async function draw() {
    const [from, to] = presetRange(statState.preset);
    statState.from = from; statState.to = to;
    const rows = (await store.query("bookings", { range: ["date", from, to] })).filter((b) => b.status === "approved").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const s = computeStats(rows);
    const tr = trendBuckets(s, from, to);
    const max = Math.max(1, ...tr.out.map((x) => x.v));
    const step = Math.ceil(tr.out.length / 16);
    host.innerHTML = `
      <div class="toolbar"><div class="seg">${PRESETS.map(([k, l]) => `<button data-p="${k}" class="${k === statState.preset ? "on" : ""}">${l}</button>`).join("")}</div>
        <input class="inp sm" type="date" id="s-from" value="${from}" aria-label="ตั้งแต่วันที่"><span class="clip">ถึง</span><input class="inp sm" type="date" id="s-to" value="${to}" aria-label="ถึงวันที่">
        <span class="spacer"></span><button class="btn ghost" id="s-print">พิมพ์</button><button class="btn" id="s-word">ดาวน์โหลดรายงาน Word</button></div>
      <div class="kpis">
        <div class="kpi"><div class="k">จำนวนครั้งที่ให้บริการ</div><div class="v">${num(s.total)}<small>ครั้ง</small></div></div>
        <div class="kpi"><div class="k">ชั่วโมงใช้งานรวม</div><div class="v">${s.hours.toLocaleString("th-TH", { maximumFractionDigits: 1 })}<small>ชม.</small></div></div>
        <div class="kpi"><div class="k">ผู้เข้าร่วมรวม</div><div class="v">${num(s.attendees)}<small>คน</small></div></div>
        <div class="kpi"><div class="k">หน่วยงานที่ใช้บริการ</div><div class="v">${s.byDept.size}<small>หน่วยงาน</small></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>จำนวนครั้งที่ให้บริการ ${tr.unit}</h2><p class="sub">${thDate(from)} – ${thDate(to)}</p>
        <div class="trend"><div class="trend-plot">${tr.out.map((x) => `<div class="trend-col" data-tip="<b>${esc(x.full)}</b><br>${x.v} ครั้ง">${x.v && tr.out.length <= 16 ? `<span class="tv">${x.v}</span>` : ""}<div class="b" style="height:${(x.v / max) * 100}%"></div></div>`).join("")}</div>
        <div class="trend-x">${tr.out.map((x, i) => `<span>${i % step === 0 ? esc(x.label) : ""}</span>`).join("")}</div></div></div>
      <div class="grid2">
        <div class="card"><h2>สถานที่ขอรับบริการ</h2><p class="sub">จำนวนครั้งแยกตามห้อง</p>${barList(s.byRoom)}</div>
        <div class="card"><h2>หน่วยงานที่ขอใช้</h2><p class="sub">จำนวนครั้งแยกตามหน่วยงาน</p>${barList(s.byDept)}</div>
        <div class="card"><h2>บริการที่ขอรับ</h2><p class="sub">หนึ่งรายการอาจขอได้หลายบริการ</p>${barList(s.byService)}</div>
        <div class="card"><h2>อุปกรณ์ที่ใช้</h2><p class="sub">หนึ่งรายการอาจใช้ได้หลายอุปกรณ์</p>${barList(s.byEquip)}</div>
        <div class="card"><h2>ลักษณะการใช้</h2><p class="sub">จำนวนครั้งแยกตามวัตถุประสงค์</p>${barList(s.byPurpose)}</div>
        <div class="card"><h2>สรุปรายเดือน</h2><p class="sub">จำนวนครั้งและชั่วโมงใช้งาน</p>
          ${s.byMonth.size ? `<table class="t"><thead><tr><th>เดือน</th><th class="num">ครั้ง</th><th class="num">ชั่วโมง</th></tr></thead><tbody>${[...s.byMonth.keys()].sort().map((k) => `<tr><td>${parseYmd(k + "-01").toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</td><td class="num">${num(s.byMonth.get(k))}</td><td class="num">${s.hoursByMonth.get(k).toLocaleString("th-TH", { maximumFractionDigits: 1 })}</td></tr>`).join("")}</tbody></table>` : `<p style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`}</div>
      </div>`;
    $$("[data-p]", host).forEach((b) => (b.onclick = () => { statState.preset = b.dataset.p; draw().catch(fail); }));
    const custom = () => {
      const a = $("#s-from", host).value, b = $("#s-to", host).value;
      if (!a || !b) return;
      if (a > b) return toast("วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด", true);
      statState.preset = "custom"; statState.from = a; statState.to = b; draw().catch(fail);
    };
    $("#s-from", host).onchange = custom; $("#s-to", host).onchange = custom;
    $("#s-print", host).onclick = () => window.print();
    $("#s-word", host).onclick = () => exportBookingReport({ from, to, rows, stats: s }).then(() => toast("ดาวน์โหลดรายงานแล้ว")).catch(fail);
  }
  await draw();
}

// ============================================================
//  งบประมาณ (พนักงานโสต)
// ============================================================
const budState = { fy: fiscalYearOf(today()) };
async function budget(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head"><h1>บันทึกการใช้งบประมาณ</h1><p>บันทึกรายการใช้จ่าย แนบหลักฐาน และสรุปตามปีงบประมาณ</p></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="bd"></div></div></section>`;
  const host = $("#bd", el);
  const nowFy = fiscalYearOf(today());
  async function draw() {
    const fy = budState.fy;
    const rows = (await store.query("budget", { eq: ["fiscalYear", fy] })).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const sum = (key, list) => new Map(list.map((k) => [k, rows.filter((r) => r[key] === k).reduce((s, r) => s + Number(r.amount || 0), 0)]).filter((x) => x[1] > 0));
    const groups = groupBudget(rows);
    let n = 0;
    host.innerHTML = `
      <div class="toolbar"><label class="clip">ปีงบประมาณ <select class="inp sm" id="b-fy">${Array.from({ length: 6 }, (_, i) => nowFy + 1 - i).map((y) => `<option${y === fy ? " selected" : ""}>${y}</option>`).join("")}</select></label>
        <span class="clip">${fiscalLabel(fy)}</span><span class="spacer"></span>
        <button class="btn ghost" id="b-word">ดาวน์โหลดแบบบันทึก Word</button><button class="btn" id="b-add">เพิ่มรายการ</button></div>
      <div class="kpis">
        <div class="kpi" style="grid-column:span 2"><div class="k">ยอดใช้จ่ายรวม ปีงบประมาณ ${fy}</div><div class="v">${money(total)}<small>บาท</small></div><div class="n">${rows.length} รายการ · หลักฐานแนบ ${rows.reduce((s, r) => s + (r.files?.length || 0), 0)} ไฟล์</div></div>
        ${FUND_TYPES.map((f) => `<div class="kpi"><div class="k">${f}</div><div class="v" style="font-size:22px;margin-top:10px">${money(sum("fundType", FUND_TYPES).get(f) || 0)}</div></div>`).join("")}
      </div>
      <div class="grid2" style="margin-bottom:16px">
        <div class="card"><h2>แยกตามหมวดรายจ่าย</h2><p class="sub">บาท</p>${barListMoney(sum("category", BUDGET_CATEGORIES))}</div>
        <div class="card"><h2>แยกตามกิจกรรม</h2><p class="sub">บาท</p>${barListMoney(new Map(groups.flatMap((g) => g.acts.map((a) => [a.activity, a.items.reduce((s, r) => s + Number(r.amount || 0), 0)]))))}</div>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>ที่</th><th>รายการ</th><th>หมวด</th><th>ประเภทเงิน</th><th class="num">จำนวนเงิน (บาท)</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>
        ${groups.map((g) => `<tr class="group"><td colspan="7">${esc(g.project)}</td></tr>${g.acts.map((a) => `<tr class="subgroup"><td colspan="7">${esc(a.activity)}</td></tr>${a.items.map((r) => `<tr data-id="${r.id}"><td>${++n}</td>
          <td><b>${esc(r.item)}</b><div class="muted">${thDate(r.date)}${r.files?.length ? ` · 📎 ${r.files.length} ไฟล์` : ""}${r.note ? ` · ${esc(r.note)}` : ""}</div></td>
          <td>${esc(r.category)}</td><td>${esc(r.fundType)}</td><td class="num">${money(r.amount)}</td><td>${esc(r.recorder)}</td>
          <td><div class="acts"><button class="btn ghost sm" data-edit>เปิด</button></div></td></tr>`).join("")}`).join("")}`).join("")}
        <tr class="total"><td colspan="4">รวมทั้งสิ้น</td><td class="num">${money(total)}</td><td colspan="2"></td></tr></tbody></table></div>`
        : `<div class="empty">ยังไม่มีรายการในปีงบประมาณ ${fy}</div>`}`;
    $("#b-fy", host).onchange = (e) => { budState.fy = +e.target.value; draw().catch(fail); };
    $("#b-add", host).onclick = () => budgetForm(null, fy, rows, () => draw().catch(fail));
    $("#b-word", host).onclick = () => exportBudgetReport({ fy, rows, groups }).then(() => toast("ดาวน์โหลดแบบบันทึกแล้ว")).catch(fail);
    $$("tr[data-id]", host).forEach((tr) => ($("[data-edit]", tr).onclick = () => budgetForm(rows.find((r) => r.id === tr.dataset.id), fy, rows, () => draw().catch(fail))));
  }
  await draw();
}
function barListMoney(map) {
  const e = sortedEntries(map);
  if (!e.length) return `<p style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`;
  const max = e[0][1];
  return `<div class="bars">${e.map(([k, v]) => `<div class="bar-row" style="grid-template-columns:minmax(90px,38%) 1fr 104px" data-tip="<b>${esc(k)}</b><br>${money(v)} บาท"><span class="lb">${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span class="val">${money(v)}</span></div>`).join("")}</div>`;
}
export function groupBudget(rows) {
  const order = BUDGET_PROJECTS.map((p) => p.project);
  const actOrder = BUDGET_PROJECTS.flatMap((p) => p.activities);
  const idx = (arr, v) => (arr.indexOf(v) < 0 ? 999 : arr.indexOf(v));
  const g = new Map();
  for (const r of rows) {
    const p = r.project || "ไม่ระบุโครงการ", a = r.activity || "ไม่ระบุกิจกรรม";
    if (!g.has(p)) g.set(p, new Map());
    if (!g.get(p).has(a)) g.get(p).set(a, []);
    g.get(p).get(a).push(r);
  }
  return [...g.entries()].sort((x, y) => idx(order, x[0]) - idx(order, y[0]))
    .map(([project, m]) => ({ project, acts: [...m.entries()].sort((x, y) => idx(actOrder, x[0]) - idx(actOrder, y[0])).map(([activity, items]) => ({ activity, items })) }));
}

function budgetForm(rec, fy, all, done) {
  const isNew = !rec;
  const [fa, fb] = fiscalRange(fy);
  const t = today();
  const r = rec || { date: t >= fa && t <= fb ? t : fa, project: "", activity: "", item: "", category: "", fundType: "", amount: "", recorder: state.user.name, note: "", files: [] };
  const projects = [...new Set([...BUDGET_PROJECTS.map((p) => p.project), ...all.map((x) => x.project)])].filter(Boolean);
  const acts = [...new Set([...BUDGET_PROJECTS.flatMap((p) => p.activities), ...all.map((x) => x.activity)])].filter(Boolean);
  let files = [...(r.files || [])];
  const added = [], removed = [];
  const m = openModal(isNew ? "เพิ่มรายการใช้งบประมาณ" : "รายการใช้งบประมาณ", `<form class="form" id="bf" novalidate>
      <label class="f full"><span>รายการ *</span><input class="inp" name="item" required maxlength="200" value="${esc(r.item)}" placeholder="เช่น ซื้อเครื่องปริ้นเตอร์"></label>
      <label class="f full"><span>โครงการ *</span><input class="inp" name="project" required list="dl-proj" value="${esc(r.project)}" placeholder="เลือกหรือพิมพ์ชื่อโครงการ"><datalist id="dl-proj">${projects.map((p) => `<option value="${esc(p)}">`).join("")}</datalist></label>
      <label class="f full"><span>กิจกรรม *</span><input class="inp" name="activity" required list="dl-act" value="${esc(r.activity)}" placeholder="เลือกหรือพิมพ์ชื่อกิจกรรม"><datalist id="dl-act">${acts.map((p) => `<option value="${esc(p)}">`).join("")}</datalist></label>
      <label class="f"><span>หมวดรายจ่าย *</span><select class="inp" name="category" required>${opts(BUDGET_CATEGORIES, r.category, "เลือกหมวด")}</select></label>
      <label class="f"><span>ประเภทเงิน *</span><select class="inp" name="fundType" required>${opts(FUND_TYPES, r.fundType, "เลือกประเภทเงิน")}</select></label>
      <label class="f"><span>จำนวนเงิน (บาท) *</span><input class="inp" name="amount" type="number" step="0.01" min="0" required inputmode="decimal" value="${esc(r.amount)}"></label>
      <label class="f"><span>วันที่ใช้จ่าย *</span><input class="inp" name="date" type="date" required value="${esc(r.date)}"></label>
      <div class="full note info" id="bf-fy"></div>
      <label class="f"><span>ผู้บันทึกข้อมูล *</span><input class="inp" name="recorder" required value="${esc(r.recorder)}"></label>
      <label class="f"><span>หมายเหตุ</span><input class="inp" name="note" maxlength="200" value="${esc(r.note)}"></label>
      <div class="full"><legend>หลักฐาน / ไฟล์แนบ (ใบเสร็จ ใบส่งของ รูปถ่าย ฯลฯ ไม่เกิน ${CONFIG.maxFileMB} MB ต่อไฟล์)</legend>
        <label class="drop"><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx">＋ เลือกไฟล์เพื่อแนบ</label><div class="files" id="bf-files"></div></div>
      <div class="full form-actions">${isNew ? "" : `<button type="button" class="btn danger" data-del style="margin-right:auto">ลบรายการ</button>`}<button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div>
    </form>`);
  const f = $("#bf", m.el), fl = $("#bf-files", m.el);
  const showFy = () => { const d = f.elements.date.value; $("#bf-fy", m.el).textContent = d ? `รายการนี้จะถูกบันทึกในปีงบประมาณ ${fiscalYearOf(d)} (${fiscalLabel(fiscalYearOf(d))})` : ""; };
  showFy(); f.elements.date.onchange = showFy;
  const drawFiles = () => {
    fl.innerHTML = files.map((x, i) => `<div class="file"><span>📎</span><span class="nm">${esc(x.name)}</span><span class="sz">${fmtSize(x.size)}</span><button type="button" class="linkbtn" data-open="${i}">เปิด</button><button type="button" class="linkbtn" data-rm="${i}" style="color:var(--red)">ลบ</button></div>`).join("");
    $$("[data-open]", fl).forEach((b) => (b.onclick = () => openFile(files[+b.dataset.open])));
    $$("[data-rm]", fl).forEach((b) => (b.onclick = () => { removed.push(files.splice(+b.dataset.rm, 1)[0]); drawFiles(); }));
  };
  drawFiles();
  $("input[type=file]", m.el).onchange = async (e) => {
    const lab = e.target.closest(".drop");
    for (const file of [...e.target.files]) {
      lab.lastChild.textContent = `กำลังอัปโหลด ${file.name}…`;
      try { const meta = await store.saveFile(file); files.push(meta); added.push(meta); drawFiles(); } catch (err) { fail(err); }
    }
    lab.lastChild.textContent = "＋ เลือกไฟล์เพื่อแนบ";
    e.target.value = "";
  };
  const cancel = () => added.forEach((x) => store.removeFile(x).catch(() => {}));
  m.onClose = cancel;
  $("[data-x]", m.el).onclick = m.dismiss;
  const del = $("[data-del]", m.el);
  if (del) del.onclick = async () => {
    if (!confirm(`ลบรายการ “${r.item}” พร้อมไฟล์แนบทั้งหมด?`)) return;
    try {
      await store.remove("budget", r.id);
      [...(r.files || []), ...added].forEach((x) => store.removeFile(x).catch(() => {}));
      m.close(); toast("ลบแล้ว"); done();
    } catch (e) { fail(e); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const data = {
      item: v.item.trim(), project: v.project.trim(), activity: v.activity.trim(), category: v.category, fundType: v.fundType,
      amount: Math.round(Number(v.amount) * 100) / 100, date: v.date, fiscalYear: fiscalYearOf(v.date), recorder: v.recorder.trim(), note: v.note.trim(),
      files, updatedAt: Date.now(), updatedBy: state.user.uid,
    };
    const btn = $("button[type=submit]", f);
    btn.disabled = true;
    try {
      if (isNew) await store.add("budget", { ...data, createdAt: Date.now() });
      else await store.update("budget", r.id, data);
      removed.forEach((x) => store.removeFile(x).catch(() => {}));
      m.close(); toast("บันทึกแล้ว");
      if (data.fiscalYear !== budState.fy) budState.fy = data.fiscalYear;
      done();
    } catch (err) { btn.disabled = false; fail(err); }
  };
}

async function openFile(meta) {
  const w = window.open("", "_blank");
  try {
    const blob = await store.getFileBlob(meta);
    const url = URL.createObjectURL(blob);
    const viewable = /^(image\/|application\/pdf)/.test(blob.type);
    if (w && viewable) w.location = url;
    else { w?.close(); const a = document.createElement("a"); a.href = url; a.download = meta.name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { w?.close(); fail(e); }
}

// ============================================================
//  ตั้งค่า (พนักงานโสต)
// ============================================================
async function settings(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head"><h1>ตั้งค่า</h1><p>จัดการห้องที่เปิดให้จอง และสิทธิ์ผู้ใช้งาน</p></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="set"></div></div></section>`;
  const host = $("#set", el);
  async function draw() {
    const [rooms, users] = await Promise.all([getRooms(true), store.list("users")]);
    users.sort((a, b) => (a.role === "staff" ? 0 : 1) - (b.role === "staff" ? 0 : 1) || (a.name || "").localeCompare(b.name || "", "th"));
    host.innerHTML = `
      <div class="toolbar"><h2 style="font-size:21px">ห้อง / สถานที่</h2><span class="spacer"></span>
        ${rooms.length ? "" : `<button class="btn ghost" id="r-seed">เพิ่มห้องเริ่มต้น ${DEFAULT_ROOMS.length} ห้อง</button>`}<button class="btn" id="r-add">เพิ่มห้อง</button></div>
      ${rooms.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>ชื่อห้อง</th><th>อาคาร / สถานที่</th><th class="num">ที่นั่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${rooms.map((r) => `<tr data-id="${r.id}"><td><b>${esc(r.name)}</b>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ""}</td><td>${esc(r.building)}</td><td class="num">${r.capacity || "–"}</td>
          <td>${r.active !== false ? `<span class="st st-approved">เปิดให้จอง</span>` : `<span class="st st-cancelled">ปิดชั่วคราว</span>`}</td><td><div class="acts"><button class="btn ghost sm" data-edit>แก้ไข</button></div></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">ยังไม่มีห้องในระบบ</div>`}
      <div class="toolbar" style="margin-top:40px"><h2 style="font-size:21px">ผู้ใช้งาน</h2></div>
      <p class="note info" style="margin:0 0 12px">ผู้ใช้จะปรากฏในรายการนี้หลังจากเข้าสู่ระบบด้วย Google ครั้งแรก จากนั้นจึงกำหนดให้เป็น “พนักงานโสต” ได้</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><select class="inp sm" data-role="${u.id || u.uid}" ${(u.id || u.uid) === state.user.uid ? "disabled title='เปลี่ยนสิทธิ์ของตัวเองไม่ได้'" : ""}>
          <option value="user"${u.role !== "staff" ? " selected" : ""}>ผู้ขอใช้บริการ</option><option value="staff"${u.role === "staff" ? " selected" : ""}>พนักงานโสต</option></select></td></tr>`).join("")}</tbody></table></div>`;
    const seed = $("#r-seed", host);
    if (seed) seed.onclick = async () => {
      try { for (const [i, r] of DEFAULT_ROOMS.entries()) await store.add("rooms", { ...r, active: true, order: i }); toast("เพิ่มห้องเริ่มต้นแล้ว"); draw().catch(fail); } catch (e) { fail(e); }
    };
    $("#r-add", host).onclick = () => roomForm(null, rooms.length, () => draw().catch(fail));
    $$("tr[data-id]", host).forEach((tr) => ($("[data-edit]", tr).onclick = () => roomForm(rooms.find((r) => r.id === tr.dataset.id), 0, () => draw().catch(fail))));
    $$("[data-role]", host).forEach((s) => (s.onchange = async () => {
      try { await store.update("users", s.dataset.role, { role: s.value }); toast("อัปเดตสิทธิ์แล้ว"); } catch (e) { fail(e); draw().catch(() => {}); }
    }));
  }
  await draw();
}

function roomForm(rec, order, done) {
  const r = rec || { name: "", building: "", capacity: "", note: "", active: true, order };
  const m = openModal(rec ? "แก้ไขห้อง" : "เพิ่มห้อง", `<form class="form" id="rf" novalidate>
      <label class="f full"><span>ชื่อห้อง *</span><input class="inp" name="name" required maxlength="120" value="${esc(r.name)}"></label>
      <label class="f"><span>อาคาร / สถานที่</span><input class="inp" name="building" maxlength="80" value="${esc(r.building)}"></label>
      <label class="f"><span>จำนวนที่นั่ง</span><input class="inp" name="capacity" type="number" min="0" value="${esc(r.capacity || "")}"></label>
      <label class="f full"><span>รายละเอียด</span><input class="inp" name="note" maxlength="200" value="${esc(r.note)}"></label>
      <label class="f full"><span>สถานะ</span><select class="inp" name="active"><option value="1"${r.active !== false ? " selected" : ""}>เปิดให้จอง</option><option value="0"${r.active === false ? " selected" : ""}>ปิดชั่วคราว</option></select></label>
      <div class="full form-actions">${rec ? `<button type="button" class="btn danger" data-del style="margin-right:auto">ลบห้อง</button>` : ""}<button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form>`);
  const f = $("#rf", m.el);
  $("[data-x]", m.el).onclick = m.dismiss;
  const del = $("[data-del]", m.el);
  if (del) del.onclick = async () => {
    if (!confirm(`ลบห้อง “${r.name}”? (รายการจองเดิมยังอยู่ในสถิติ)`)) return;
    try { await store.remove("rooms", r.id); m.close(); toast("ลบแล้ว"); done(); } catch (e) { fail(e); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const data = { name: v.name.trim(), building: v.building.trim(), capacity: Number(v.capacity || 0), note: v.note.trim(), active: v.active === "1", order: r.order ?? 0 };
    try { if (rec) await store.update("rooms", r.id, data); else await store.add("rooms", data); m.close(); toast("บันทึกแล้ว"); done(); } catch (err) { fail(err); }
  };
}

// ============================================================
//  เริ่มทำงาน
// ============================================================
(async function start() {
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="wrap"><div class="empty"><p class="note err" style="display:inline-block">เชื่อมต่อ Firebase ไม่สำเร็จ: ${esc(friendly(e))}</p></div></div>`;
    return;
  }
  window.addEventListener("hashchange", render);
  store.onAuth(async (user, err) => {
    if (err) fail(err);
    state.user = user; state.rooms = null; state.pending = 0;
    renderDemoBar();
    if (user) await refreshPending();
    render();
  });
})();
