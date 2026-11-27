import { CONFIG, DEPARTMENTS, PURPOSES, USER_TYPES, CATEGORIES, CONDITIONS, KINDS, DEFAULT_ITEMS, BUDGET_CATEGORIES, FUND_TYPES, BUDGET_PROJECTS } from "./config.js";
import { store, isDemo, USERNAME_RE } from "./store.js";
import {
  $, $$, esc, pad, ymd, parseYmd, today, addDays, daysBetween, thDate, thDateLong, thShort, money, num, fiscalYearOf, fiscalRange, fiscalLabel,
  mondayOf, typeLabel, shortType, catIcon, itemIcon, studentInfo, academicYearOf, academicRange, catOrder, LOAN_STATUS, ITEM_STATUS, isOverdue, loanState, ACTIVE, loanUnits, itemsText,
  loanOn, loanEnd, lineText, extrasText, itemStatus, holdIn, holdOn, HOLD_KINDS, availableIn, computeStats, sortedEntries, monthShort, weekLabel, inAppBrowser,
} from "./util.js";
import { aboutPage } from "./about.js";
import { manualsPage } from "./manuals.js";
import { eventsPage, loadEvents, computeEventStats, eventType, eventTime, SLOT_NOTE } from "./events.js";
import { exportEventReport, exportEventExcel, exportEventPdf, exportLoanReport, exportLoanExcel, exportLoanPdf, exportBudgetReport, exportBudgetExcel, exportBudgetPdf } from "./report.js";

const state = { user: null, items: null, pending: 0, authMsg: "" };
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
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(m)) return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  if (m.includes("email-already-in-use")) return "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น";
  if (m.includes("weak-password")) return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
  if (m.includes("operation-not-allowed")) return "ระบบยังไม่เปิดการเข้าสู่ระบบด้วยชื่อผู้ใช้ กรุณาติดต่อพนักงานโสต";
  if (m.includes("too-many-requests")) return "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (m.includes("requires-recent-login")) return "กรุณาออกจากระบบแล้วเข้าใหม่ก่อนทำรายการนี้";
  if (m.includes("popup-blocked")) return "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาตป๊อปอัปแล้วลองใหม่";
  if (m.includes("permission-denied") || m.includes("insufficient permissions")) return "ไม่มีสิทธิ์ทำรายการนี้";
  if (m.includes("popup-closed") || m.includes("cancelled-popup")) return "ยกเลิกการเข้าสู่ระบบ";
  if (m.includes("unauthorized-domain")) return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication";
  if (m.includes("disallowed_useragent") || m.includes("web-storage-unsupported")) return "เบราว์เซอร์ในแอปนี้เข้าสู่ระบบด้วย Google ไม่ได้ กรุณาเปิดใน Safari หรือ Chrome";
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

const stBadge = (l) => { const k = typeof l === "string" ? l : loanState(l); return `<span class="st ${LOAN_STATUS[k]?.cls || ""}">${LOAN_STATUS[k]?.label || k}</span>`; };
const itemBadge = (s) => `<span class="st ${ITEM_STATUS[s.key].cls}">${ITEM_STATUS[s.key].label}</span>`;
const typeBadge = (t) => `<span class="tbadge ${t === "student" ? "student" : "teacher"}">${shortType(t)}</span>`;
const opts = (arr, sel, placeholder) =>
  (placeholder ? `<option value="">${placeholder}</option>` : "") + arr.map((x) => `<option${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const isStaff = () => state.user?.role === "staff";
const isStudentOnly = () => state.user?.type === "student" && !isStaff();
const who = (l) => `${esc(l.borrowerName)} ${typeBadge(l.borrowerType)}<div class="muted">${esc(l.borrowerType === "student" ? studentInfo(l) : l.department || "")}</div>`;
const tm = (t) => (t ? ` ${t}` : "");
const dateRange = (l) => l.dueDate !== l.borrowDate
  ? `${thShort(l.borrowDate)}${tm(l.pickupTime)} – ${thShort(l.dueDate)}${tm(l.returnTime)}`
  : `${thShort(l.borrowDate)}${l.pickupTime || l.returnTime ? ` ${l.pickupTime || "?"}–${l.returnTime || "?"}` : ""}`;
// ช่องเวลารับ/คืนของ (ใช้ทั้งหน้ายืมและหน้าแก้ไข)
const timeFields = (p = {}) => `<label class="f"><span>เวลามารับของที่ห้องโสต *</span><input class="inp" type="time" name="pickupTime" required step="900" value="${esc(p.pickupTime || "")}"></label>
      <label class="f"><span>เวลานำของมาคืน *</span><input class="inp" type="time" name="returnTime" required step="900" value="${esc(p.returnTime || "")}"></label>`;
const timeError = (a, b, f) => (a === b && f.elements.returnTime.value <= f.elements.pickupTime.value ? "ยืม-คืนวันเดียวกัน เวลาคืนต้องหลังเวลามารับ" : "");
const typeChips = (name, sel) => `<div class="chips">${Object.entries(USER_TYPES).map(([k, v]) => `<label class="chip"><input type="radio" name="${name}" value="${k}"${sel === k ? " checked" : ""} required><span>${v}</span></label>`).join("")}</div>`;

async function getItems(force) {
  if (!state.items || force) {
    state.items = (await store.list("items")).sort((a, b) => catOrder(a.category) - catOrder(b.category) || (a.category || "").localeCompare(b.category || "", "th") || a.name.localeCompare(b.name, "th"));
  }
  return state.items;
}
const activeLoans = () => store.query("loans", { inq: ["status", ACTIVE] });
async function refreshPending() {
  if (!isStaff()) return;
  try { state.pending = (await store.query("loans", { eq: ["status", "pending"] })).length; } catch { state.pending = 0; }
  const c = $("#nav-links .count");
  if (c) { c.textContent = state.pending; c.hidden = !state.pending; }
}

// ============================================================
//  แถบนำทาง + Router
// ============================================================
const NAV_USER = [["", "หน้าหลัก"], ["events", "ปฏิทินงาน"], ["items", "สถานะอุปกรณ์"], ["borrow", "ยืมอุปกรณ์"], ["my", "รายการของฉัน"], ["manuals", "คู่มือ"]];
const NAV_STAFF = [["requests", "คำขอยืม-คืน"], ["stats", "สถิติ"], ["budget", "งบประมาณ"], ["settings", "ตั้งค่า"]];
const STAFF_ONLY = new Set(NAV_STAFF.map((x) => x[0]));

// เมนูก่อนเข้าสู่ระบบ (ข้อมูลภายนอก)
const NAV_PUBLIC = [["about", "เกี่ยวกับเรา"], ["about?s=staff", "บุคลากร"], ["about?s=duties", "ภาระหน้าที่"], ["about?s=contact", "ติดต่อ"]];
function renderNav(active) {
  const u = state.user;
  if (!u) {
    const cur = location.hash.replace(/^#\/?/, "");
    $("#nav-links").innerHTML = NAV_PUBLIC.map(([p, l]) => `<a href="#/${p}" class="${active === "about" && (cur === p || (p === "about" && !cur.includes("s="))) ? "active" : ""}">${l}</a>`).join("");
    $("#nav-user").innerHTML = active === "login" ? "" : `<a class="btn sm" href="#/login">เข้าสู่ระบบ</a>`;
    return;
  }
  const links = !u.type ? [] : [...NAV_USER.filter(([p]) => !(p === "manuals" && isStudentOnly())), ...(isStaff() ? NAV_STAFF : [])];
  $("#nav-links").innerHTML = links
    .map(([p, l]) => `<a href="#/${p}" class="${p === active ? "active" : ""}">${l}${p === "requests" ? `<span class="count" ${state.pending ? "" : "hidden"}>${state.pending}</span>` : ""}</a>`)
    .join("");
  $("#nav-user").innerHTML = u
    ? `<a class="nav-me" href="#/profile" title="ข้อมูลของฉัน">${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc((u.name || "?")[0])}</span>`}
       <span class="uname">${esc(u.name)}</span></a><span class="role-tag">${isStaff() ? "พนักงานโสต" : shortType(u.type)}</span>
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
  const b = (k, l) => `<button data-r="${k}" class="${r === k ? "on" : ""}">${l}</button>`;
  bar.innerHTML = `<span><b>โหมดตัวอย่าง</b> · ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น</span>
    <span>ดูในมุมมอง ${b("teacher", "ครู")} ${b("student", "นักเรียน")} ${b("staff", "พนักงานโสต")}</span>
    <button data-reset>รีเซ็ตข้อมูลตัวอย่าง</button>`;
  $$("[data-r]", bar).forEach((x) => (x.onclick = () => store.setDemoRole(x.dataset.r)));
  $("[data-reset]", bar).onclick = () => { state.items = null; store.resetDemo(); toast("รีเซ็ตข้อมูลตัวอย่างแล้ว"); };
}

const about = (el, params) => aboutPage(el, { loggedIn: !!state.user, section: params.get("s") });
const events = (el) => eventsPage(el, { fail });
const manuals = (el, params) => manualsPage(el, { params, fail, toast, openModal, user: state.user, staff: isStaff() });
const ROUTES = { "": home, about, login, events, manuals, items, borrow, my, profile, requests, stats, budget, settings };

const loadingView = () => { const d = document.createElement("div"); d.className = "loading"; d.innerHTML = `<span class="spin" aria-hidden="true"></span>กำลังโหลด…`; return d; };
async function render(instant) {
  const tk = ++renderToken;
  $("#modal-root").replaceChildren(); // ปิดหน้าต่างที่ค้างอยู่เมื่อเปลี่ยนหน้า
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(qs || "");
  let name = ROUTES[path] ? path : "";
  if (!state.user) name = path === "login" ? "login" : "about"; // ก่อนเข้าสู่ระบบเห็นเฉพาะข้อมูลภายนอก + หน้าเข้าสู่ระบบ
  else if (name === "login") { history.replaceState(null, "", "#/"); name = ""; }
  else if (name === "about") { /* ข้อมูลภายนอกดูได้เสมอ */ }
  else if (!state.user.type || (state.user.type === "student" && !state.user.studentId)) name = "profile"; // ต้องกรอกข้อมูลผู้ใช้ (และรหัสนักเรียน) ก่อน
  if (STAFF_ONLY.has(name) && !isStaff()) name = "";
  if (name === "manuals" && isStudentOnly()) name = ""; // นักเรียนไม่มีฟีเจอร์คู่มือ
  renderNav(name);
  const el = document.createElement("div");
  // ถ้าหน้าใหม่โหลดข้อมูลนาน ให้เปลี่ยนเป็น "กำลังโหลด…" ก่อน (หลังล็อกอิน/ออกจากระบบ เปลี่ยนทันที)
  const showLoading = () => { if (tk === renderToken) { view.replaceChildren(loadingView()); window.scrollTo(0, 0); } };
  const slow = instant ? (showLoading(), 0) : setTimeout(showLoading, 250);
  try {
    await ROUTES[name](el, params);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="wrap"><div class="empty"><p>โหลดข้อมูลไม่สำเร็จ</p><p class="note err" style="display:inline-block">${esc(friendly(e))}</p></div></div>`;
  }
  clearTimeout(slow);
  if (tk !== renderToken) return;
  view.replaceChildren(el);
  window.scrollTo(0, 0);
}

// ============================================================
//  เข้าสู่ระบบ / สมัครสมาชิก
// ============================================================
const G_LOGO = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7.1-10.4 7.1-17.7z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>`;

// ช่องข้อมูลเพิ่มเติมตามประเภทผู้ใช้ (ใช้ทั้งหน้าสมัคร โปรไฟล์ และพนักงานโสตสร้างบัญชี)
function typeFields(p = {}) {
  return `<div class="full type-extra" data-for="student" ${p.type === "student" ? "" : "hidden"}><div class="form" style="gap:12px 18px">
      <label class="f"><span>ชั้น / ห้อง *</span><input class="inp" name="classroom" maxlength="20" placeholder="เช่น ม.4/2" value="${esc(p.classroom || "")}"></label>
      <label class="f"><span>เลขที่</span><input class="inp" name="studentNo" maxlength="5" inputmode="numeric" value="${esc(p.studentNo || "")}"></label>
      <label class="f"><span>รหัสนักเรียน *</span><input class="inp" name="studentId" maxlength="10" inputmode="numeric" pattern="[0-9]{3,10}" title="ตัวเลข 3–10 หลัก" placeholder="เช่น 34567" value="${esc(p.studentId || "")}"></label></div></div>
    <label class="f full type-extra" data-for="teacher" ${p.type === "teacher" ? "" : "hidden"}><span>หน่วยงาน / กลุ่มสาระ *</span>
      <select class="inp" name="department">${opts(DEPARTMENTS, p.department, "เลือกหน่วยงาน")}</select></label>`;
}
function wireTypeFields(form) {
  const sync = () => {
    const t = form.querySelector("input[name=type]:checked")?.value || "";
    $$(".type-extra", form).forEach((x) => (x.hidden = x.dataset.for !== t));
    const cls = form.elements.classroom, dep = form.elements.department, sid = form.elements.studentId;
    if (cls) cls.required = t === "student";
    if (sid) sid.required = t === "student";
    if (dep) dep.required = t === "teacher";
  };
  $$("input[name=type]", form).forEach((r) => (r.onchange = sync));
  sync();
}
const readProfile = (form) => {
  const v = Object.fromEntries(new FormData(form));
  const t = v.type;
  return {
    name: (v.name || "").trim(), type: t, phone: (v.phone || "").trim(),
    classroom: t === "student" ? (v.classroom || "").trim() : "", studentNo: t === "student" ? (v.studentNo || "").trim() : "",
    studentId: t === "student" ? (v.studentId || "").replace(/\s/g, "") : "",
    department: t === "teacher" ? v.department || "" : "",
  };
};

// LINE เปิดลิงก์ที่มี ?openExternalBrowser=1 ด้วย Safari / Chrome
const externalUrl = () => `${location.origin}${location.pathname}?openExternalBrowser=1${location.hash || ""}`;
function inAppNote() {
  const app = inAppBrowser();
  if (!app) return "";
  if (app === "LINE") return `<div class="note info inapp"><b>Google ไม่อนุญาตให้เข้าสู่ระบบในแอป LINE</b><br>
    กดปุ่มด้านล่าง ระบบจะเปิดเว็บใน Safari / Chrome ให้ แล้วเข้าสู่ระบบด้วยบัญชีโรงเรียน</div>`;
  return `<div class="note warn inapp"><b>คุณกำลังเปิดเว็บนี้ในเบราว์เซอร์ของ ${esc(app)}</b><br>
    การเข้าสู่ระบบด้วย Google ใช้ในแอปนี้ไม่ได้ กรุณาเปิดเว็บใน Safari / Chrome
    <div style="margin-top:8px"><button class="btn sm" type="button" data-copy>คัดลอกลิงก์ไปเปิดใน Safari</button></div></div>`;
}

function login(el) {
  const inApp = inAppBrowser();
  el.innerHTML = `
    <section class="hero hero-login">
      <div class="eyebrow">${esc(CONFIG.unitName)} · ${esc(CONFIG.schoolName)}</div>
      <h1>เข้าสู่ระบบ<br>ยืม-คืนอุปกรณ์</h1>
      <p class="lead">สำหรับครู บุคลากร และนักเรียนโรงเรียนสามเสนวิทยาลัย</p>
      <div class="auth-card">
        <div class="school-only"><span class="so-ico" aria-hidden="true">🏫</span><div><b>ใช้อีเมลโรงเรียนเท่านั้น</b>
          <span>เข้าสู่ระบบด้วยบัญชี Google ที่ลงท้ายด้วย <b class="nw">@${esc(CONFIG.allowedDomain)}</b><br>อีเมลส่วนตัว เช่น @gmail.com ใช้ไม่ได้</span></div></div>
        ${inAppNote()}
        ${state.authMsg ? `<p class="note err">${esc(state.authMsg)}</p>` : ""}
        ${inApp === "LINE"
          ? `<a class="btn google lg full-w" href="${esc(externalUrl())}">${G_LOGO} เข้าสู่ระบบด้วย Google · เปิดใน Safari ↗</a>`
          : `<button class="btn google lg full-w" id="btn-google"${inApp ? " disabled" : ""}>${G_LOGO} เข้าสู่ระบบด้วย Google</button>`}
        <p class="hint" style="text-align:center;margin:0">เข้าสู่ระบบไม่ได้ กรุณาติดต่อพนักงานโสต</p>
      </div>
    </section>
    <section class="band"><div class="wrap" style="padding-top:56px;padding-bottom:64px">
      <div class="tiles">
        <div class="tile"><span class="ico">📦</span><h3>เห็นสถานะอุปกรณ์ทันที</h3><p>รู้ว่ากล้อง โน้ตบุ๊ก Apple TV หรือสาย HDMI ชิ้นไหนว่าง ถูกยืม หรือกำลังรออนุมัติ</p></div>
        <div class="tile"><span class="ico">📝</span><h3>ขอยืมได้ในไม่กี่ขั้นตอน</h3><p>เลือกอุปกรณ์ วันยืม วันคืน แล้วส่งคำขอ พนักงานโสตอนุมัติและแจ้งผลในระบบ</p></div>
        <div class="tile"><span class="ico">📅</span><h3>ปฏิทินงานของโสตฯ</h3><p>ดูงานและการใช้ห้องประชุมจากปฏิทินของงานโสตฯ ที่อัปเดตอัตโนมัติ</p></div>
      </div>
    </div></section>`;
  state.authMsg = "";
  const copy = $("[data-copy]", el);
  if (copy) copy.onclick = async () => {
    const url = location.origin + location.pathname;
    try { await navigator.clipboard.writeText(url); toast("คัดลอกลิงก์แล้ว นำไปวางใน Safari หรือ Chrome"); }
    catch { prompt("คัดลอกลิงก์นี้ไปเปิดใน Safari หรือ Chrome", url); }
  };
  const gBtn = $("#btn-google", el);
  if (gBtn) gBtn.onclick = () => store.signIn().catch(fail);
}

// ============================================================
//  ข้อมูลของฉัน (และกรอกข้อมูลครั้งแรก)
// ============================================================
async function profile(el) {
  const u = state.user, needSid = u.type === "student" && !u.studentId, first = !u.type || needSid;
  el.innerHTML = `<div class="wrap narrow"><div class="page-head"><h1>${first ? "กรอกข้อมูลก่อนเริ่มใช้งาน" : "ข้อมูลของฉัน"}</h1>
      <p>${needSid ? "ระบบเพิ่มช่องรหัสนักเรียนแล้ว กรุณากรอกรหัสนักเรียนของคุณหนึ่งครั้งก่อนใช้งานต่อ" : first ? "ข้อมูลนี้ใช้แสดงในคำขอยืมและสถิติ แยกครูกับนักเรียน" : "แก้ไขข้อมูลที่ใช้ในการยืมอุปกรณ์"}</p></div>
    <div class="section">
      <form id="pf" class="form" novalidate>
        <label class="f full"><span>ชื่อ-นามสกุล *</span><input class="inp" name="name" required maxlength="80" value="${esc(u.name)}"></label>
        <fieldset class="full"><legend>ประเภทผู้ใช้ *</legend>${typeChips("type", u.type)}</fieldset>
        ${typeFields(u)}
        <label class="f"><span>เบอร์โทรศัพท์</span><input class="inp" name="phone" inputmode="tel" maxlength="20" value="${esc(u.phone)}"></label>
        <label class="f"><span>บัญชี</span><input class="inp" disabled value="${esc(u.username ? "ชื่อผู้ใช้: " + u.username : u.email)}"></label>
        <div class="full form-actions">${first ? "" : `<a class="btn ghost" href="#/">ยกเลิก</a>`}<button class="btn" type="submit">${first ? "เริ่มใช้งาน" : "บันทึก"}</button></div>
      </form>
      ${u.username && !isDemo ? `<h2 style="font-size:19px;margin:40px 0 12px">เปลี่ยนรหัสผ่าน</h2>
      <form id="pw" class="form" novalidate>
        <label class="f full"><span>รหัสผ่านปัจจุบัน</span><input class="inp" name="cur" type="password" required autocomplete="current-password"></label>
        <label class="f"><span>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</span><input class="inp" name="next" type="password" required minlength="6" autocomplete="new-password"></label>
        <label class="f"><span>ยืนยันรหัสผ่านใหม่</span><input class="inp" name="confirm" type="password" required minlength="6" autocomplete="new-password"></label>
        <div class="full form-actions"><button class="btn ghost" type="submit">เปลี่ยนรหัสผ่าน</button></div>
      </form>` : ""}
    </div></div>`;
  const f = $("#pf", el);
  wireTypeFields(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const p = readProfile(f);
    if (!p.type) return toast("กรุณาเลือกประเภทผู้ใช้", true);
    try {
      await store.update("users", u.uid, p);
      Object.assign(state.user, p);
      toast("บันทึกข้อมูลแล้ว");
      location.hash = "#/";
      if (first) render();
    } catch (err) { fail(err); }
  };
  const pw = $("#pw", el);
  if (pw) pw.onsubmit = async (e) => {
    e.preventDefault();
    if (!pw.reportValidity()) return;
    if (pw.elements.next.value !== pw.elements.confirm.value) return toast("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน", true);
    try { await store.changePassword(pw.elements.cur.value, pw.elements.next.value); pw.reset(); toast("เปลี่ยนรหัสผ่านแล้ว"); } catch (err) { fail(err); }
  };
}

// ============================================================
//  หน้าหลัก: ปฏิทินสถานะการยืม + อุปกรณ์ที่ถูกยืมอยู่
// ============================================================
const homeState = { month: today().slice(0, 7), sel: today() };
async function home(el) {
  if (!state.user) return login(el);
  const t = today();
  const [itemsList, active] = await Promise.all([getItems(), activeLoans()]);
  const sts = itemsList.map((it) => itemStatus(it, active, t));
  const sum = (k) => sts.reduce((s, x) => s + x[k], 0);
  const broken = sts.filter((x) => x.broken).reduce((s, x) => s + x.qty, 0);
  const pending = active.filter((l) => l.status === "pending");
  const overdue = active.filter((l) => isOverdue(l, t));
  const outNow = active.filter((l) => l.status === "approved" && l.borrowDate <= t).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const heldNow = itemsList.map((it, i) => ({ it, s: sts[i] })).filter((x) => x.s.held > 0);
  el.innerHTML = `
    <div class="wrap"><div class="page-head head-row">
      <div><h1>สวัสดี ${esc((state.user.name || "").split(" ")[0])}</h1><p>${thDateLong(t)}</p></div>
      <div class="head-acts"><a class="btn ghost" href="#/items">ดูสถานะอุปกรณ์</a><a class="btn" href="#/borrow">ยืมอุปกรณ์</a></div>
    </div></div>
    <section class="band"><div class="wrap" style="padding-top:28px;padding-bottom:56px">
      <div class="kpis">
        <div class="kpi"><div class="k">อุปกรณ์ทั้งหมด</div><div class="v">${num(itemsList.length)}<small>รายการ</small></div><div class="n">รวม ${num(sum("qty"))} ชิ้น${broken ? ` · ชำรุด/ซ่อม ${broken} ชิ้น` : ""}</div></div>
        <div class="kpi"><div class="k">ว่างพร้อมยืม</div><div class="v">${num(sts.filter((x) => x.free > 0).length)}<small>รายการ</small></div><div class="n">${num(sum("free"))} ชิ้น</div></div>
        <div class="kpi"><div class="k">ถูกยืมอยู่</div><div class="v">${num(sts.filter((x) => x.out > 0).length)}<small>รายการ</small></div><div class="n">${num(sum("out"))} ชิ้น</div></div>
        <div class="kpi"><div class="k">กำลังขออนุญาต</div><div class="v">${pending.length}<small>คำขอ</small></div>${isStaff() && pending.length ? `<div class="n"><a href="#/requests">ตรวจสอบคำขอ ›</a></div>` : ""}</div>
        <div class="kpi${overdue.length ? " kpi-alert" : ""}"><div class="k">เกินกำหนดคืน</div><div class="v">${overdue.length}<small>รายการ</small></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>อุปกรณ์ที่ถูกยืมอยู่ขณะนี้</h2><p class="sub">${outNow.length ? `${outNow.length} รายการ เรียงตามกำหนดคืน` : "ไม่มีอุปกรณ์ที่ถูกยืมอยู่"}</p>
        ${outNow.length ? loanTable(outNow, { showStatus: true }) : ""}
        ${heldNow.length ? `<div class="held-list"><div class="held-h">อุปกรณ์ที่โสตใช้งาน / ไม่ว่าง</div>${heldNow.map(({ it, s }) => `<div class="held-item"><span>${itemIcon(it)}</span><b>${esc(it.name)}</b>${s.held < s.qty ? ` <span class="muted">${s.held}/${s.qty} ชิ้น</span>` : ""}
          <span class="st ${ITEM_STATUS[s.hold.kind].cls}">${HOLD_KINDS[s.hold.kind]}</span><span class="muted">${[s.hold.note && esc(s.hold.note), s.hold.until && "ถึง " + thShort(s.hold.until)].filter(Boolean).join(" · ")}</span></div>`).join("")}</div>` : ""}</div>
      <div class="home-grid">
        <div class="card" id="cal-card"></div>
        <div class="card" id="day-card"></div>
      </div>
    </div></section>`;
  wireLoanTable(el, outNow, () => render());
  await mountCalendar($("#cal-card", el), $("#day-card", el), active);
}

function loanTable(rows, { showStatus = true, actions = false } = {}) {
  return `<div class="table-wrap flat"><table class="t"><thead><tr><th>อุปกรณ์</th><th>ผู้ยืม</th><th>วันยืม – กำหนดคืน</th>${showStatus ? "<th>สถานะ</th>" : ""}${actions ? "<th></th>" : ""}</tr></thead><tbody>
    ${rows.map((l) => `<tr data-loan="${l.id}" class="${isOverdue(l) ? "row-alert" : ""}"><td><b>${esc(itemsText(l))}</b><div class="muted">${esc(l.purpose || "")}</div></td>
      <td>${who(l)}</td><td style="white-space:nowrap">${dateRange(l)}${isOverdue(l) ? `<div class="muted" style="color:var(--red)">เกิน ${daysBetween(l.dueDate, today())} วัน</div>` : ""}</td>
      ${showStatus ? `<td>${stBadge(l)}</td>` : ""}${actions ? `<td><div class="acts">${loanActions(l)}</div></td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}
function wireLoanTable(host, rows, onChange) {
  $$("tr[data-loan]", host).forEach((tr) => {
    const l = rows.find((x) => x.id === tr.dataset.loan);
    tr.onclick = (e) => { if (!e.target.closest("button")) showLoan(l, onChange); };
    $$("[data-act]", tr).forEach((b) => (b.onclick = async () => { if (await loanAction(l, b.dataset.act)) onChange(); }));
  });
}

// เวลาในช่องปฏิทิน: วันมารับ = เวลารับ, วันคืน = เวลาคืน, ยืม-คืนวันเดียว = ช่วงเวลา
const dayTime = (l, d) => (d === l.borrowDate ? l.pickupTime : d === l.dueDate ? l.returnTime : "") || "";
const evTime = (l, d) => {
  if (l.borrowDate === l.dueDate && d === l.borrowDate) return l.pickupTime ? `${l.pickupTime}${l.returnTime ? "–" + l.returnTime : ""}` : "";
  if (d === l.borrowDate && l.pickupTime) return `รับ ${l.pickupTime}`;
  if (d === l.dueDate && l.returnTime) return `คืน ${l.returnTime}`;
  return "";
};
async function mountCalendar(host, dayHost, active) {
  const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  let loans = [];
  async function draw() {
    const [y, m] = homeState.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const from = ymd(new Date(y, m - 1, 1 - first.getDay()));
    const cells = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7) * 7;
    const to = addDays(from, cells - 1);
    const ranged = await store.query("loans", { range: ["borrowDate", addDays(from, -60), to] });
    const map = new Map(ranged.map((l) => [l.id, l]));
    active.forEach((l) => map.set(l.id, l));
    loans = [...map.values()].filter((l) => l.status !== "rejected" && l.status !== "cancelled");
    const t = today();
    let html = `<div class="cal-head"><h2>${first.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</h2>
      <div class="cal-nav"><button class="btn ghost sm" data-today>วันนี้</button><button class="icon-btn" data-prev aria-label="เดือนก่อนหน้า">‹</button><button class="icon-btn" data-next aria-label="เดือนถัดไป">›</button></div></div>
      <div class="cal">${DOW.map((d) => `<div class="dow">${d}</div>`).join("")}`;
    for (let i = 0; i < cells; i++) {
      const d = addDays(from, i), list = loans.filter((l) => loanOn(l, d, t)).sort((x, y) => (dayTime(x, d) || "99").localeCompare(dayTime(y, d) || "99")), inMonth = parseYmd(d).getMonth() === m - 1;
      html += `<button class="day${inMonth ? "" : " out"}${d === t ? " today" : ""}${d === homeState.sel ? " sel" : ""}" data-d="${d}" aria-label="${thDate(d)} มีการยืม ${list.length} รายการ">
        <span class="dn">${parseYmd(d).getDate()}</span>
        ${list.slice(0, 2).map((l) => `<span class="ev ${loanState(l)}">${evTime(l, d) ? `<b class="ev-t">${evTime(l, d)}</b> ` : ""}${esc(itemsText(l))}</span>`).join("")}
        ${list.length > 2 ? `<span class="ev-more">อีก ${list.length - 2} รายการ</span>` : ""}</button>`;
    }
    html += `</div><div class="legend"><span><i class="lg approved"></i>อนุมัติ</span><span><i class="lg pending"></i>รออนุมัติ</span><span><i class="lg overdue"></i>เกินกำหนด</span><span><i class="lg returned"></i>คืนแล้ว</span></div>`;
    host.innerHTML = html;
    const step = (n) => { const d = new Date(y, m - 1 + n, 1); homeState.month = ymd(d).slice(0, 7); draw().catch(fail); };
    $("[data-prev]", host).onclick = () => step(-1);
    $("[data-next]", host).onclick = () => step(1);
    $("[data-today]", host).onclick = () => { homeState.month = t.slice(0, 7); homeState.sel = t; draw().catch(fail); };
    $$(".day", host).forEach((b) => (b.onclick = () => {
      homeState.sel = b.dataset.d;
      $$(".day", host).forEach((x) => x.classList.toggle("sel", x === b));
      drawDay();
    }));
    drawDay();
  }
  function drawDay() {
    const d = homeState.sel, t = today();
    const list = loans.filter((l) => loanOn(l, d, t)).sort((a, b) => (a.status === "pending") - (b.status === "pending") || a.dueDate.localeCompare(b.dueDate));
    const units = list.filter((l) => l.status !== "pending").reduce((s, l) => s + loanUnits(l), 0);
    dayHost.innerHTML = `<div class="cal-head"><div><h2>สถานะการยืม</h2><p class="sub" style="margin:2px 0 0">${thDateLong(d)}</p></div>
        <input class="inp sm" type="date" value="${d}" aria-label="เลือกวันที่" id="day-pick"></div>
      ${list.length ? `<p class="clip" style="margin:0 0 10px">ถูกยืม ${units} ชิ้น · ${list.length} รายการ</p><div class="day-list">${list.map((l) => `
        <button class="day-item" data-loan="${l.id}"><span class="di-ico">${catIcon(l.items?.[0]?.category)}</span>
          <span class="di-body"><b>${esc(itemsText(l))}</b><span>${esc(l.borrowerName)} · ${shortType(l.borrowerType)}${l.classroom ? " " + esc(l.classroom) : ""}</span>
          <span>${dateRange(l)}</span></span>${stBadge(l)}</button>`).join("")}</div>`
        : `<div class="empty" style="padding:36px 8px">ไม่มีการยืมอุปกรณ์ในวันนี้</div>`}
      <div class="form-actions" style="margin-top:14px"><a class="btn sm" href="#/borrow?date=${d >= t ? d : t}">ยืมอุปกรณ์</a></div>`;
    $$("[data-loan]", dayHost).forEach((b) => (b.onclick = () => showLoan(list.find((l) => l.id === b.dataset.loan), () => render())));
    $("#day-pick", dayHost).onchange = (e) => {
      if (!e.target.value) return;
      homeState.sel = e.target.value;
      if (homeState.sel.slice(0, 7) !== homeState.month) { homeState.month = homeState.sel.slice(0, 7); draw().catch(fail); }
      else { $$(".day", host).forEach((x) => x.classList.toggle("sel", x.dataset.d === homeState.sel)); drawDay(); }
    };
  }
  await draw();
}

// ============================================================
//  สถานะอุปกรณ์ (แยกหมวดหมู่) + จัดการอุปกรณ์ (พนักงานโสต)
// ============================================================
const itemState = { q: "", cat: "", st: "" };
async function items(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head head-row"><div><h1>สถานะอุปกรณ์</h1><p>ดูว่าอุปกรณ์ไหนว่าง ถูกยืม หรือกำลังรออนุมัติ แยกตามหมวดหมู่</p></div>
      ${isStaff() ? `<label class="add-menu"><span class="sr">เพิ่มอุปกรณ์</span><select class="btn" id="it-add">
        <option value="">＋ เพิ่มอุปกรณ์ ▾</option>
        <optgroup label="📷 กล้องและอุปกรณ์ถ่ายภาพ"><option value="camera">📷 กล้อง</option><option value="lens">🔭 เลนส์</option><option value="flash">⚡️ แฟลช</option><option value="battery">🔋 แบตเตอรี่</option><option value="memory">💾 การ์ดหน่วยความจำ</option><option value="cat:อุปกรณ์ถ่ายภาพ">🔭 อุปกรณ์ถ่ายภาพอื่น ๆ</option></optgroup>
        <optgroup label="หมวดอื่น ๆ">${CATEGORIES.filter((c) => c.name !== "กล้อง" && c.name !== "อุปกรณ์ถ่ายภาพ").map((c) => `<option value="cat:${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join("")}</optgroup></select></label>` : `<a class="btn" href="#/borrow">ยืมอุปกรณ์</a>`}</div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="it"></div></div></section>`;
  const host = $("#it", el);
  if (isStaff()) $("#it-add", el).onchange = (e) => {
    const k = e.target.value; e.target.value = "";
    if (!k) return;
    const preset = k.startsWith("cat:") ? { category: k.slice(4) } : { kind: k, category: k === "camera" ? "กล้อง" : "อุปกรณ์ถ่ายภาพ" };
    itemForm(null, () => draw().catch(fail), preset);
  };
  async function draw() {
    const [list, active] = await Promise.all([getItems(true), activeLoans()]);
    const t = today();
    const rows = list.map((it) => ({ it, s: itemStatus(it, active, t) }));
    const cats = [...new Set([...CATEGORIES.map((c) => c.name), ...list.map((x) => x.category)])].filter((c) => list.some((x) => x.category === c));
    const match = (s, k) => (k === "pend" ? s.pend > 0 : k === "hold" ? s.held > 0 : k === "out" ? s.out > 0 : s.key === k);
    const count = (k) => rows.filter((r) => match(r.s, k)).length;
    const FILTERS = [["", "ทั้งหมด", rows.length], ["free", "ว่าง", count("free")], ["out", "ถูกยืม", count("out")], ["pend", "รออนุมัติ", count("pend")], ["hold", "โสตใช้/ไม่ว่าง", count("hold")], ["broken", "ชำรุด/ซ่อม", count("broken")]];
    host.innerHTML = list.length ? `
      <div class="toolbar">
        <input class="inp sm" type="search" id="it-q" placeholder="ค้นหาชื่อหรือรหัสอุปกรณ์" value="${esc(itemState.q)}" style="width:min(260px,100%)" aria-label="ค้นหาอุปกรณ์">
        <select class="inp sm" id="it-cat" aria-label="หมวดหมู่"><option value="">ทุกหมวดหมู่</option>${cats.map((c) => `<option${c === itemState.cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <div class="seg">${FILTERS.map(([k, l, n]) => `<button data-st="${k}" class="${itemState.st === k ? "on" : ""}">${l} <small>${n}</small></button>`).join("")}</div>
      </div>
      <div id="it-groups"></div>`
      : `<div class="empty"><p>ยังไม่มีอุปกรณ์ในระบบ</p>${isStaff() ? `<button class="btn ghost" id="it-seed">เพิ่มอุปกรณ์ตัวอย่าง ${DEFAULT_ITEMS.length} รายการ</button>` : ""}</div>`;
    const seed = $("#it-seed", host);
    if (seed) seed.onclick = async () => {
      seed.disabled = true;
      try { for (const x of DEFAULT_ITEMS) await store.add("items", { ...x, condition: "พร้อมใช้งาน", allowStudents: true, location: "", note: "", createdAt: Date.now() }); toast("เพิ่มอุปกรณ์ตัวอย่างแล้ว แก้ไขชื่อและจำนวนได้ภายหลัง"); draw().catch(fail); }
      catch (e) { seed.disabled = false; fail(e); }
    };
    if (!list.length) return;
    const groups = $("#it-groups", host);
    const paint = () => {
      const q = itemState.q.trim().toLowerCase();
      const shown = rows.filter(({ it, s }) =>
        (!q || `${it.name} ${it.code || ""} ${it.location || ""}`.toLowerCase().includes(q)) && (!itemState.cat || it.category === itemState.cat) &&
        (!itemState.st || match(s, itemState.st)));
      const byCat = new Map();
      shown.forEach((r) => { const c = r.it.category || "อื่น ๆ"; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(r); });
      groups.innerHTML = shown.length ? [...byCat.entries()].map(([c, rs]) => `
        <section class="igroup"><h2><span>${catIcon(c)}</span>${esc(c)} <small>${rs.length} รายการ</small></h2>${catBar(rs)}
          <div class="igrid">${rs.map(({ it, s }) => itemCard(it, s)).join("")}</div></section>`).join("")
        : `<div class="empty">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข</div>`;
      $$(".icard", groups).forEach((card) => {
        const r = rows.find((x) => x.it.id === card.dataset.id);
        card.onclick = (e) => {
          const b = e.target.closest("[data-a]");
          if (!b) return itemDetail(r.it, r.s, () => draw().catch(fail));
          if (b.dataset.a === "borrow") location.hash = `#/borrow?item=${r.it.id}`;
          if (b.dataset.a === "edit") itemForm(r.it, () => draw().catch(fail));
          if (b.dataset.a === "hold") holdForm(r.it, () => draw().catch(fail));
        };
      });
    };
    $("#it-q", host).oninput = (e) => { itemState.q = e.target.value; paint(); };
    $("#it-cat", host).onchange = (e) => { itemState.cat = e.target.value; paint(); };
    $$("[data-st]", host).forEach((b) => (b.onclick = () => { itemState.st = b.dataset.st; $$("[data-st]", host).forEach((x) => x.classList.toggle("on", x === b)); paint(); }));
    paint();
  }
  await draw();
}
const canBorrow = (it) => isStaff() || state.user.type !== "student" || it.allowStudents !== false;
const kindOf = (it) => it.kind || "";
const nosOf = (it) => (Array.isArray(it.nos) ? it.nos : []);
const thumbHtml = (it, cls = "thumb") => it.thumb ? `<img class="${cls}" src="${it.thumb}" alt="" loading="lazy">` : "";

// แปลงข้อความหมายเลขชิ้น เช่น "1-6" หรือ "B1-B4, B7" เป็นรายการ
function parseNos(text) {
  const out = [];
  for (const tok of String(text || "").split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)) {
    const m = tok.match(/^([^\d-–]*)(\d+)[-–]\1?(\d+)$/);
    if (m && +m[3] >= +m[2] && +m[3] - +m[2] < 200) for (let i = +m[2]; i <= +m[3]; i++) out.push(m[1] + i);
    else out.push(tok.replace(/^#/, ""));
  }
  return [...new Set(out)].slice(0, 200);
}
// ย่อรูปเป็น JPEG (data URL) ตามขนาดด้านยาวสุด
async function imageData(file, max, quality) {
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("เปิดไฟล์รูปนี้ไม่ได้ กรุณาใช้ไฟล์ JPG หรือ PNG")); i.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  let q = quality, url = c.toDataURL("image/jpeg", q);
  while (url.length > 900 * 1024 && q > 0.4) { q -= 0.1; url = c.toDataURL("image/jpeg", q); }
  return url;
}

// แถบสรุปความว่างของทั้งหมวด (แทนแถบในแต่ละการ์ด)
function catBar(rs) {
  const sum = (f) => rs.reduce((n, r) => n + f(r.s), 0);
  const qty = sum((s) => s.qty);
  const parts = [
    ["free", "ว่าง", sum((s) => s.free)],
    ["out", "ถูกยืม", sum((s) => (s.broken ? 0 : Math.min(s.out, s.qty - s.held)))],
    ["av", "โสตใช้/ไม่ว่าง", sum((s) => s.held)],
    ["broken", "ชำรุด/ซ่อม", sum((s) => (s.broken ? s.qty : 0))],
  ].filter(([, , n]) => n > 0);
  if (!qty) return "";
  return `<div class="catbar"><div class="catbar-track" role="img" aria-label="${parts.map(([, l, n]) => `${l} ${n}`).join(", ")} จาก ${qty} ชิ้น">${parts.map(([k, , n]) => `<span class="cb-${k}" style="width:${(n / qty) * 100}%"></span>`).join("")}</div>
    <div class="catbar-legend"><span class="catbar-total">ว่าง <b>${sum((s) => s.free)}</b> / ${qty} ชิ้น</span>${parts.filter(([k]) => k !== "free").map(([k, l, n]) => `<span><i class="cb-${k}"></i>${l} ${n}</span>`).join("")}</div></div>`;
}
function itemCard(it, s) {
  const h = s.holders[0];
  return `<div class="icard ${s.key}" data-id="${it.id}" tabindex="0" role="button" aria-label="${esc(it.name)} ${ITEM_STATUS[s.key].label}">
    ${it.thumb ? `<div class="icard-photo"><img src="${it.thumb}" alt="" loading="lazy"></div>` : ""}
    <div class="icard-top"><span class="icard-ico">${itemIcon(it)}</span>${itemBadge(s)}</div>
    <h3>${esc(it.name)}</h3>
    <div class="muted">${[it.model, it.code, it.location].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div>
    <div class="icard-row"><span>ว่าง <b>${s.free}</b> / ${s.qty} ${nosOf(it).length ? "ชิ้น (มีหมายเลข)" : "ชิ้น"}</span>${s.pend ? `<span class="st st-pending">รออนุมัติ ${s.pend}</span>` : ""}</div>
    ${h ? `<div class="icard-who">ยืมโดย ${esc(h.borrowerName)} · คืน ${thShort(h.dueDate)}${s.holders.length > 1 ? ` และอีก ${s.holders.length - 1}` : ""}</div>` : ""}
    ${s.hold ? `<div class="icard-hold">${s.hold.kind === "av" ? "🎬" : "⛔"} ${HOLD_KINDS[s.hold.kind]}${s.held < s.qty ? ` ${s.held} ชิ้น` : ""}${s.hold.note ? ` · ${esc(s.hold.note)}` : ""}${s.hold.until ? ` · ถึง ${thShort(s.hold.until)}` : ""}</div>` : ""}
    ${it.allowStudents === false ? `<div class="tags"><span class="tag">เฉพาะครู / บุคลากร</span></div>` : ""}
    <div class="icard-acts">${!s.broken && canBorrow(it) ? `<button class="btn sm" data-a="borrow">ยืม</button>` : ""}${isStaff() ? `<button class="btn ghost sm" data-a="hold">สถานะ</button><button class="btn ghost sm" data-a="edit">แก้ไข</button>` : ""}</div>
  </div>`;
}
async function itemDetail(it, s, onChange) {
  let history = [], photo = null;
  const [h, p] = await Promise.allSettled([store.query("loans", { contains: ["itemIds", it.id] }), it.hasPhoto ? store.get("itemPhotos", it.id) : null]);
  if (h.status === "fulfilled") history = h.value.sort((a, b) => b.borrowDate.localeCompare(a.borrowDate));
  if (p.status === "fulfilled") photo = p.value?.data || null;
  const current = history.filter((l) => ACTIVE.includes(l.status));
  const past = history.filter((l) => !ACTIVE.includes(l.status)).slice(0, 8);
  const lineOf = (l) => (l.items || []).find((x) => x.itemId === it.id) || { qty: 0 };
  const qtyTxt = (x) => (x.nos?.length ? `#${x.nos.join(", #")}` : `${x.qty} ชิ้น`);
  const line = (l) => `<div class="day-item static" data-loan="${l.id}"><span class="di-body"><b>${esc(l.borrowerName)} ${typeBadge(l.borrowerType)}</b><span>${dateRange(l)} · ${qtyTxt(lineOf(l))}</span></span>${stBadge(l)}</div>`;
  const nos = nosOf(it);
  const busy = new Set(current.filter((l) => l.status === "approved").flatMap((l) => lineOf(l).nos || []));
  const m = openModal(it.name, `
    ${photo || it.thumb ? `<div class="detail-photo"><img src="${photo || it.thumb}" alt="รูป ${esc(it.name)}"></div>` : ""}
    <div class="detail-top"><span class="icard-ico">${itemIcon(it)}</span>${itemBadge(s)} <span class="clip">ว่าง ${s.free}/${s.qty} ชิ้น${s.pend ? ` · รออนุมัติ ${s.pend}` : ""}</span></div>
    <dl class="dl"><dt>ชื่อรุ่น</dt><dd>${esc(it.model) || "–"}</dd><dt>หมวดหมู่</dt><dd>${esc(it.category)}${KINDS[kindOf(it)] && kindOf(it) ? ` · ${KINDS[kindOf(it)]}` : ""}</dd>
      <dt>รหัส</dt><dd>${esc(it.code) || "–"}</dd>
      ${nos.length ? `<dt>หมายเลขชิ้น</dt><dd><div class="nos static">${nos.map((n) => `<span class="no${busy.has(n) ? " busy" : ""}" title="${busy.has(n) ? "ถูกยืมอยู่" : "ว่าง"}">#${esc(n)}</span>`).join("")}</div></dd>` : ""}
      <dt>ที่เก็บ</dt><dd>${esc(it.location) || "–"}</dd><dt>สภาพ</dt><dd>${esc(it.condition || "พร้อมใช้งาน")}</dd>
      <dt>ผู้ยืมได้</dt><dd>${it.allowStudents === false ? "เฉพาะครู / บุคลากร" : "ครูและนักเรียน"}</dd><dt>รายละเอียด</dt><dd>${esc(it.note) || "–"}</dd></dl>
    <h3 class="mh">อนุมัติ / รออนุมัติ</h3>${current.length ? `<div class="day-list">${current.map(line).join("")}</div>` : `<p class="muted-p">ไม่มี</p>`}
    <h3 class="mh">ประวัติล่าสุด</h3>${past.length ? `<div class="day-list">${past.map(line).join("")}</div>` : `<p class="muted-p">ยังไม่มีประวัติการยืม</p>`}
    ${s.hold ? `<p class="note warn" style="margin-top:14px">${HOLD_KINDS[s.hold.kind]}${s.held < s.qty ? ` ${s.held} ชิ้น` : ""}${s.hold.note ? ` — ${esc(s.hold.note)}` : ""}${s.hold.until ? ` (ถึง ${thDate(s.hold.until)})` : ""}${s.hold.by ? ` · ตั้งโดย ${esc(s.hold.by)}` : ""}</p>` : ""}
    <div class="form-actions" style="margin-top:18px">${isStaff() ? `<button class="btn ghost" data-hold>ตั้งสถานะ</button><button class="btn ghost" data-edit>แก้ไขอุปกรณ์</button>` : ""}${!s.broken && canBorrow(it) ? `<a class="btn" href="#/borrow?item=${it.id}">ยืมอุปกรณ์นี้</a>` : ""}</div>`);
  $$("[data-loan]", m.el).forEach((x) => (x.onclick = () => { m.close(); showLoan(history.find((l) => l.id === x.dataset.loan), onChange); }));
  const ed = $("[data-edit]", m.el);
  if (ed) ed.onclick = () => { m.close(); itemForm(it, onChange); };
  const hb = $("[data-hold]", m.el);
  if (hb) hb.onclick = () => { m.close(); holdForm(it, onChange); };
}
// พนักงานโสตตั้งสถานะอุปกรณ์เอง: ว่าง / ไม่ว่าง / โสตใช้อุปกรณ์
function holdForm(it, done) {
  const h = it.hold || {}, cur = HOLD_KINDS[h.kind] ? h.kind : "";
  const numbered = nosOf(it).length > 0, multi = !numbered && Number(it.quantity) > 1;
  const m = openModal(`ตั้งสถานะ: ${it.name}`, `<form class="form" id="hf" novalidate style="grid-template-columns:1fr 1fr">
      <fieldset class="full"><legend>สถานะ</legend><div class="chips">
        ${[["", "ว่าง (ให้ยืมได้ตามปกติ)"], ["av", "🎬 โสตใช้อุปกรณ์"], ["busy", "⛔ ไม่ว่าง"]].map(([k, l]) => `<label class="chip"><input type="radio" name="kind" value="${k}"${cur === k ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
      <div class="full hold-extra" ${cur ? "" : "hidden"}><div class="form" style="gap:12px 18px">
        ${multi ? `<label class="f"><span>จำนวนที่ใช้ (จาก ${it.quantity} ชิ้น)</span><input class="inp" type="number" name="qty" min="1" max="${it.quantity}" value="${esc(h.qty || it.quantity)}"></label>` : ""}
        ${numbered ? `<p class="note info full" style="margin:0">อุปกรณ์ที่มีหมายเลข จะไม่ว่างทุกเบอร์</p>` : ""}
        <label class="f"><span>ตั้งแต่วันที่ <small>(เว้นว่าง = วันนี้)</small></span><input class="inp" type="date" name="from" value="${esc(h.from || "")}"></label>
        <label class="f"><span>ถึงวันที่ <small>(เว้นว่าง = จนกว่าจะเปลี่ยนเป็น “ว่าง”)</small></span><input class="inp" type="date" name="until" value="${esc(h.until || "")}"></label>
        <label class="f full"><span>หมายเหตุ</span><input class="inp" name="note" maxlength="120" value="${esc(h.note || "")}" placeholder="เช่น ออกงานกีฬาสี, ถ่ายงานวันครู"></label>
      </div></div>
      <p class="hint full" style="text-align:left">ระหว่างนี้ผู้อื่นจะยืมอุปกรณ์ส่วนที่กันไว้ไม่ได้ เมื่อเลยวันที่ “ถึงวันที่” ระบบจะกลับเป็นว่างเอง</p>
      <div class="full form-actions"><button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn" type="submit">บันทึกสถานะ</button></div></form>`);
  const f = $("#hf", m.el);
  $("[data-x]", m.el).onclick = m.dismiss;
  $$("input[name=kind]", f).forEach((r) => (r.onchange = () => { $(".hold-extra", f).hidden = !f.querySelector("input[name=kind]:checked").value; }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    if (v.kind && v.from && v.until && v.until < v.from) return toast("“ถึงวันที่” ต้องไม่ก่อน “ตั้งแต่วันที่”", true);
    const hold = v.kind ? { kind: v.kind, note: (v.note || "").trim(), from: v.from || "", until: v.until || "", qty: multi ? Math.min(Number(it.quantity), Math.max(1, parseInt(v.qty, 10) || Number(it.quantity))) : Number(it.quantity), by: state.user.name, at: Date.now() } : null;
    try {
      if (hold) {
        const t = today(), a = hold.from || t, b = hold.until || addDays(t, 365);
        const clash = (await activeLoans()).filter((l) => l.status === "approved" && (l.itemIds || []).includes(it.id) && l.borrowDate <= b && loanEnd(l, t) >= a);
        if (clash.length && !confirm(`ช่วงเวลานี้มีผู้ยืม “${it.name}” อยู่แล้ว ${clash.length} รายการ\n${clash.map((l) => `${l.borrowerName} (${dateRange(l)})`).join("\n")}\n\nตั้งสถานะต่อหรือไม่? (รายการยืมเดิมไม่ถูกยกเลิก)`)) return;
      }
      await store.update("items", it.id, { hold, updatedAt: Date.now() });
      state.items = null; m.close(); toast(hold ? `ตั้งเป็น “${HOLD_KINDS[hold.kind]}” แล้ว` : "ตั้งเป็น “ว่าง” แล้ว"); done();
    } catch (err) { fail(err); }
  };
}
const KIND_HINT = { camera: "กล้อง", lens: "เลนส์", flash: "แฟลช", battery: "แบตเตอรี่", memory: "การ์ดหน่วยความจำ" };
function itemForm(rec, done, preset = {}) {
  const r = rec || { name: KIND_HINT[preset.kind] || "", model: "", category: preset.category || "", kind: preset.kind || "", code: "", nos: [], quantity: 1, condition: "พร้อมใช้งาน", location: "", allowStudents: true, note: "", thumb: "" };
  const cats = [...new Set([...CATEGORIES.map((c) => c.name), ...(state.items || []).map((x) => x.category)])].filter(Boolean);
  let photoFile = null, removePhoto = false;
  const m = openModal(rec ? "แก้ไขอุปกรณ์" : `เพิ่ม${KIND_HINT[preset.kind] || (preset.category ? `อุปกรณ์ · ${preset.category}` : "อุปกรณ์")}`, `<form class="form" id="itf" novalidate>
      ${!rec && (preset.kind === "battery" || preset.kind === "memory") ? `<p class="note info full" style="margin:0">ถ้าแต่ละก้อน/แต่ละใบเขียนเบอร์ไว้ ใส่ในช่อง “หมายเลขชิ้น” เช่น 1-6 ผู้ยืมจะเลือกเบอร์ได้ตอนยืม</p>` : ""}
      ${!rec && preset.kind === "lens" ? `<p class="note info full" style="margin:0">แนะนำให้ใส่เมาท์และระยะในชื่อรุ่น เช่น “Canon EF 50mm f/1.8” เพื่อให้ผู้ยืมเลือกเลนส์ที่ใช้กับกล้องได้ถูก</p>` : ""}
      <div class="full photo-field">
        <div class="photo-prev" id="ph-prev">${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span>${catIcon(r.category)}</span>`}</div>
        <div><b>รูปอุปกรณ์</b><p class="hint" style="text-align:left">แสดงในการ์ดและหน้ารายละเอียด (ระบบย่อรูปให้อัตโนมัติ)</p>
          <label class="btn ghost sm file-btn">เลือกรูป<input type="file" accept="image/*" id="ph-file" hidden></label>
          <button type="button" class="btn danger sm" id="ph-del" ${r.thumb ? "" : "hidden"}>ลบรูป</button></div>
      </div>
      <label class="f full"><span>ชื่ออุปกรณ์ *</span><input class="inp" name="name" required maxlength="100" value="${esc(r.name)}" placeholder="เช่น กล้อง DSLR, เลนส์ 50mm, แบตเตอรี่กล้อง"></label>
      <label class="f"><span>ชื่อรุ่น</span><input class="inp" name="model" maxlength="100" value="${esc(r.model)}" placeholder="เช่น Canon EOS 90D"></label>
      <label class="f"><span>รหัส / เลขครุภัณฑ์</span><input class="inp" name="code" maxlength="40" value="${esc(r.code)}"></label>
      <label class="f"><span>หมวดหมู่ * <small>(เลือก หรือพิมพ์หมวดใหม่)</small></span><input class="inp" name="category" required list="dl-cat" maxlength="60" value="${esc(r.category)}"><datalist id="dl-cat">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="f"><span>ใช้กับชุดกล้อง</span><select class="inp" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${kindOf(r) === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="f full"><span>หมายเลขชิ้น <small>(ถ้ามี เช่น แบต/เมม ที่เขียนเบอร์ไว้ — พิมพ์ "1-6" หรือ "B1, B2, B5" ระบบจะนับจำนวนให้)</small></span><input class="inp" name="nos" maxlength="400" value="${esc(nosOf(r).join(", "))}" placeholder="เว้นว่างถ้าไม่ได้ติดเบอร์"></label>
      <label class="f"><span>จำนวน (ชิ้น) *</span><input class="inp" name="quantity" type="number" min="1" max="999" required inputmode="numeric" value="${esc(nosOf(r).length || r.quantity)}"></label>
      <label class="f"><span>สภาพ</span><select class="inp" name="condition">${opts(CONDITIONS, r.condition || "พร้อมใช้งาน")}</select></label>
      <label class="f"><span>ที่เก็บ</span><input class="inp" name="location" maxlength="80" value="${esc(r.location)}" placeholder="เช่น ตู้ A ห้องโสต"></label>
      <label class="f check" style="align-self:end"><input type="checkbox" name="allowStudents"${r.allowStudents !== false ? " checked" : ""}> นักเรียนยืมได้</label>
      <label class="f full"><span>รายละเอียด / หมายเหตุ</span><textarea class="inp" name="note" rows="2" maxlength="400" placeholder="เช่น เมาท์ EF, ความจุ 64GB, ใช้คู่กับกล้อง CAM-01">${esc(r.note)}</textarea></label>
      <div class="full form-actions">${rec ? `<button type="button" class="btn danger" data-del style="margin-right:auto">ลบอุปกรณ์</button>` : ""}<button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form>`);
  const f = $("#itf", m.el), prev = $("#ph-prev", m.el);
  $("[data-x]", m.el).onclick = m.dismiss;
  const syncQty = () => { const n = parseNos(f.elements.nos.value).length; f.elements.quantity.readOnly = n > 0; if (n) f.elements.quantity.value = n; };
  f.elements.nos.oninput = syncQty; syncQty();
  $("#ph-file", m.el).onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    photoFile = file; removePhoto = false;
    prev.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
    $("#ph-del", m.el).hidden = false;
  };
  $("#ph-del", m.el).onclick = () => { photoFile = null; removePhoto = true; prev.innerHTML = `<span>${catIcon(f.elements.category.value)}</span>`; $("#ph-del", m.el).hidden = true; };
  const del = $("[data-del]", m.el);
  if (del) del.onclick = async () => {
    try {
      const act = (await store.query("loans", { contains: ["itemIds", r.id] })).filter((l) => ACTIVE.includes(l.status));
      if (act.length) return toast(`ลบไม่ได้: ยังมีรายการยืม/คำขอที่ค้างอยู่ ${act.length} รายการ (ตั้งสภาพเป็น "ส่งซ่อม" แทนได้)`, true);
      if (!confirm(`ลบ "${r.name}" ออกจากระบบ? ประวัติการยืมเดิมยังอยู่ในสถิติ`)) return;
      await store.remove("items", r.id); await store.remove("itemPhotos", r.id).catch(() => {});
      state.items = null; m.close(); toast("ลบแล้ว"); done();
    } catch (e) { fail(e); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const nos = parseNos(v.nos);
    const data = {
      name: v.name.trim(), model: v.model.trim(), category: v.category.trim(), kind: v.kind || "", code: v.code.trim(), nos,
      quantity: nos.length || Math.max(1, parseInt(v.quantity, 10) || 1), condition: v.condition, location: v.location.trim(),
      allowStudents: !!f.elements.allowStudents.checked, note: v.note.trim(), updatedAt: Date.now(),
    };
    const btn = $("button[type=submit]", f); btn.disabled = true;
    try {
      let full = null;
      if (photoFile) { data.thumb = await imageData(photoFile, 480, 0.72); full = await imageData(photoFile, 1400, 0.82); data.hasPhoto = true; }
      else if (removePhoto) { data.thumb = ""; data.hasPhoto = false; }
      let id = r.id;
      if (rec) await store.update("items", id, data); else id = await store.add("items", { ...data, thumb: data.thumb || "", hasPhoto: !!data.hasPhoto, createdAt: Date.now() });
      if (full) await store.set("itemPhotos", id, { data: full, updatedAt: Date.now() });
      else if (removePhoto) await store.remove("itemPhotos", id).catch(() => {});
      state.items = null; m.close(); toast("บันทึกแล้ว"); done();
    } catch (err) { btn.disabled = false; fail(err); }
  };
}

// ============================================================
//  ยืมอุปกรณ์
// ============================================================
// หมายเลขชิ้นที่ถูกใช้ในช่วงวันที่ (จากรายการยืมที่ยังไม่ปิด)
function usedNos(itemId, loans, from, to, excludeId) {
  const t = today(), used = new Set();
  for (const l of loans) {
    if (l.id === excludeId || !ACTIVE.includes(l.status) || !(l.borrowDate <= to && loanEnd(l, t) >= from)) continue;
    for (const x of l.items || []) if (x.itemId === itemId) (x.nos || []).forEach((n) => used.add(n));
  }
  return used;
}
async function borrow(el, params) {
  const u = state.user, staff = isStaff(), t = today();
  const [list, active] = await Promise.all([getItems(true), activeLoans()]);
  const usable = list.filter((it) => it.condition === "พร้อมใช้งาน" || !it.condition);
  const byId = new Map(usable.map((it) => [it.id, it]));
  const sel = new Map(); // itemId -> { qty, nos:Set }
  const d0 = params.get("date") && params.get("date") >= t ? params.get("date") : t;
  el.innerHTML = `
    <div class="wrap narrow"><div class="page-head"><h1>ยืมอุปกรณ์</h1><p>${staff ? "บันทึกการยืมแทนผู้ยืม รายการที่พนักงานโสตบันทึกจะอนุมัติทันที" : "เลือกอุปกรณ์และวันที่ แล้วส่งคำขอ พนักงานโสตจะอนุมัติและแจ้งผลในหน้า “รายการของฉัน”"}</p></div>
    <div class="section">
    ${usable.length ? "" : `<p class="note warn">ยังไม่มีอุปกรณ์ที่พร้อมให้ยืม${staff ? ` <a href="#/items">เพิ่มอุปกรณ์</a>` : ""}</p>`}
    <form id="bf" class="form" novalidate>
      <h2 class="full fh">1. อุปกรณ์ <small id="sel-sum"></small></h2>
      <div class="full" id="sel"></div>
      <div class="full" id="kit"></div>
      <label class="f full add-item"><span class="sr">เพิ่มอุปกรณ์</span><select class="inp" id="add-item"></select></label>
      <h2 class="full fh">2. วันและเวลา</h2>
      <label class="f"><span>วันที่ยืม *</span><input class="inp" type="date" name="borrowDate" required value="${d0}" ${staff ? "" : `min="${t}"`}></label>
      <label class="f"><span>กำหนดคืน *</span><input class="inp" type="date" name="dueDate" required value="${d0}" min="${d0}"></label>
      ${timeFields()}
      <h2 class="full fh">3. ผู้ยืม</h2>
      ${staff ? `
        <label class="f full"><span>ชื่อผู้ยืม *</span><input class="inp" name="borrowerName" required maxlength="80" value="${esc(u.name)}"></label>
        <fieldset class="full"><legend>ประเภทผู้ยืม *</legend>${typeChips("type", u.type || "teacher")}</fieldset>
        ${typeFields(u)}`
      : `<div class="full who-card">${esc(u.name)} ${typeBadge(u.type)}<span class="muted">${esc(u.type === "student" ? studentInfo(u) : u.department)}</span> <a href="#/profile" class="linkbtn">แก้ไขข้อมูล</a></div>`}
      <label class="f"><span>เบอร์โทรศัพท์ *</span><input class="inp" name="phone" required inputmode="tel" maxlength="20" value="${esc(u.phone)}" placeholder="08x-xxx-xxxx"></label>
      <label class="f"><span>ใช้สำหรับ *</span><select class="inp" name="purpose" required>${opts(PURPOSES, "", "เลือกวัตถุประสงค์")}</select></label>
      <label class="f full"><span>รายละเอียดเพิ่มเติม</span><textarea class="inp" name="note" rows="3" maxlength="600" placeholder="เช่น ใช้ถ่ายงานกีฬาสี"></textarea></label>
      <div class="full form-actions"><a class="btn ghost" href="#/items">ยกเลิก</a><button class="btn" type="submit">${staff ? "บันทึกการยืม" : "ส่งคำขอยืม"}</button></div>
    </form></div></div>`;
  const f = $("#bf", el), selEl = $("#sel", el), kitEl = $("#kit", el), addEl = $("#add-item", el);
  if (staff) wireTypeFields(f);
  const range = () => [f.elements.borrowDate.value || t, f.elements.dueDate.value || f.elements.borrowDate.value || t];
  const avail = (it) => { const [a, b] = range(); return availableIn(it, active, a, b); };
  const freeNos = (it) => { const [a, b] = range(); if (holdIn(it, a, b)) return []; const used = usedNos(it.id, active, a, b); return nosOf(it).filter((n) => !used.has(n)); };
  // เพิ่มอุปกรณ์ลงรายการ (ชิ้นที่มีหมายเลข เลือกเบอร์ว่างเบอร์แรกให้)
  function addItem(id) {
    const it = byId.get(id);
    if (!it || sel.has(id) || !canBorrow(it)) return false;
    if (nosOf(it).length) { const fn = freeNos(it); if (!fn.length) return false; sel.set(id, { qty: 1, nos: new Set([fn[0]]) }); }
    else { if (!avail(it)) return false; sel.set(id, { qty: 1, nos: new Set() }); }
    return true;
  }
  const pre = params.get("item");
  if (pre && !addItem(pre) && byId.has(pre)) setTimeout(() => toast(canBorrow(byId.get(pre)) ? "อุปกรณ์นี้ไม่ว่างในวันที่เลือก ลองเปลี่ยนวันที่" : "อุปกรณ์นี้ให้ยืมเฉพาะครู / บุคลากร", true), 300);

  const KIT_KINDS = ["lens", "flash", "battery", "memory"];
  const kitOn = { battery: false, memory: false };   // ติ๊ก "ยืมแบตเตอรี่" / "ยืมการ์ดหน่วยความจำ"
  const extras = { battery: "", memory: "" };         // เบอร์ที่พิมพ์เอง (ใช้เมื่อยังไม่มีแบต/เมมในระบบ)
  const ofKind = (k) => usable.filter((it) => kindOf(it) === k && canBorrow(it));
  const availOf = (it) => (nosOf(it).length ? freeNos(it).length : avail(it));

  // แถวของอุปกรณ์ที่เลือกแล้ว (ใช้ทั้งรายการหลัก และเลนส์/แฟลชในส่วนอุปกรณ์เสริม)
  function rowHtml(it) {
    const s = sel.get(it.id), av = avail(it), nos = nosOf(it);
    const fn = nos.length ? new Set(freeNos(it)) : null;
    return `<div class="sel-row${s.qty ? "" : " warn"}" data-id="${it.id}">
      <div class="sel-media">${it.thumb ? `<img src="${it.thumb}" alt="">` : `<span>${itemIcon(it)}</span>`}</div>
      <div class="pick-body"><b>${esc(it.name)}</b><span>${[it.model, it.code].filter(Boolean).map(esc).join(" · ")}${it.model || it.code ? " · " : ""}<span class="pick-av${av ? "" : " none"}">${av ? `ว่าง ${av}` : "ไม่ว่างในวันที่เลือก"}</span></span></div>
      ${nos.length ? "" : `<div class="stepper"><button type="button" data-d="-1" aria-label="ลดจำนวน" ${s.qty > 1 ? "" : "disabled"}>−</button><span>${s.qty}</span><button type="button" data-d="1" aria-label="เพิ่มจำนวน" ${s.qty < av ? "" : "disabled"}>+</button></div>`}
      <button type="button" class="icon-btn" data-rm aria-label="นำ ${esc(it.name)} ออก">✕</button>
      ${nos.length ? `<div class="nos"><span class="nos-lb">เลือกหมายเลข:</span>${nos.map((n) => `<button type="button" class="no${s.nos.has(n) ? " on" : ""}" data-no="${esc(n)}" ${fn.has(n) ? "" : "disabled title='ถูกยืมในช่วงนี้'"}>#${esc(n)}</button>`).join("")}</div>` : ""}
    </div>`;
  }
  // ตัวเลือก "＋ เพิ่ม…" สำหรับอุปกรณ์ชนิดหนึ่ง
  const addSelect = (k, label) => {
    const items = ofKind(k).filter((it) => !sel.has(it.id));
    if (!ofKind(k).length) return `<p class="kit-none">ยังไม่มี${label}ในระบบ${isStaff() ? ` — เพิ่มได้ที่ <a href="#/items">สถานะอุปกรณ์ → เพิ่มอุปกรณ์ → ${label}</a>` : ""}</p>`;
    if (!items.length) return "";
    return `<select class="inp kit-add" data-add="${k}"><option value="">＋ เพิ่ม${label}…</option>${items.map((it) => { const av = availOf(it);
      return `<option value="${it.id}" ${av ? "" : "disabled"}>${esc(it.name)}${it.model ? ` — ${esc(it.model)}` : ""} · ${av ? `ว่าง ${av}` : "ไม่ว่าง"}</option>`; }).join("")}</select>`;
  };
  // แบต / เมม: ติ๊กเพื่อยืม แล้วเลือกเบอร์ (หรือพิมพ์เบอร์ถ้ายังไม่มีในระบบ)
  function packHtml(k, label) {
    const items = ofKind(k);
    const body = !kitOn[k] ? "" : items.length ? items.map((it) => {
      const nos = nosOf(it), s = sel.get(it.id), fn = new Set(freeNos(it)), av = avail(it);
      return `<div class="pack" data-pack="${it.id}"><div class="pack-h">${esc(it.name)}${it.model ? ` <span class="muted">${esc(it.model)}</span>` : ""} <span class="pick-av${availOf(it) ? "" : " none"}">ว่าง ${availOf(it)}</span></div>
        ${nos.length ? `<div class="nos"><span class="nos-lb">เบอร์:</span>${nos.map((n) => `<button type="button" class="no${s?.nos.has(n) ? " on" : ""}" data-pno="${esc(n)}" ${fn.has(n) ? "" : "disabled title='ถูกยืมในช่วงนี้'"}>#${esc(n)}</button>`).join("")}</div>`
          : `<div class="stepper"><button type="button" data-pd="-1" aria-label="ลดจำนวน" ${s?.qty ? "" : "disabled"}>−</button><span>${s?.qty || 0}</span><button type="button" data-pd="1" aria-label="เพิ่มจำนวน" ${(s?.qty || 0) < av ? "" : "disabled"}>+</button></div>`}</div>`;
    }).join("") : `<label class="f"><span>เบอร์${label}ที่ยืม</span><input class="inp" data-extra="${k}" maxlength="60" placeholder="เช่น 2, 5" value="${esc(extras[k])}"></label>`;
    return `<div class="kit-sec"><label class="f check kit-check"><input type="checkbox" data-on="${k}"${kitOn[k] ? " checked" : ""}> ยืม${label}</label>${body}</div>`;
  }

  function paint() {
    // ปรับรายการที่เลือกให้สอดคล้องกับวันที่ (ตัดเบอร์/จำนวนที่ไม่ว่างออก)
    for (const [id, s] of sel) {
      const it = byId.get(id);
      if (nosOf(it).length) { const fn = new Set(freeNos(it)); [...s.nos].forEach((n) => !fn.has(n) && s.nos.delete(n)); s.qty = s.nos.size; }
      else s.qty = Math.min(s.qty, avail(it));
    }
    const all = [...sel.keys()].map((id) => byId.get(id));
    const hasCamera = all.some((it) => kindOf(it) === "camera");
    // เมื่อยืมกล้อง: เลนส์ แฟลช แบต เมม ไปอยู่ในส่วนอุปกรณ์เสริม
    const mainRows = all.filter((it) => !(hasCamera && KIT_KINDS.includes(kindOf(it))))
      .sort((a, b) => (kindOf(a) === "camera" ? -1 : 0) - (kindOf(b) === "camera" ? -1 : 0));
    selEl.innerHTML = mainRows.length ? mainRows.map(rowHtml).join("")
      : `<div class="sel-empty">ยังไม่ได้เลือกอุปกรณ์ — เลือกจากรายการด้านล่าง หรือกด “ยืม” จากหน้า <a href="#/items">สถานะอุปกรณ์</a></div>`;

    if (hasCamera) {
      ["battery", "memory"].forEach((k) => { if (all.some((it) => kindOf(it) === k)) kitOn[k] = true; });
      const chosen = (k) => all.filter((it) => kindOf(it) === k);
      kitEl.innerHTML = `<div class="kit"><div class="kit-h">📷 อุปกรณ์เสริมสำหรับกล้อง</div>
        <div class="kit-sec"><div class="kit-title">🔭 เลนส์</div>${chosen("lens").map(rowHtml).join("")}${addSelect("lens", "เลนส์")}</div>
        <div class="kit-sec"><div class="kit-title">⚡ แฟลช</div>${chosen("flash").map(rowHtml).join("") || (ofKind("flash").length ? `<p class="kit-none">ไม่ใช้แฟลช</p>` : "")}${addSelect("flash", "แฟลช")}</div>
        <div class="kit-pair">${packHtml("battery", "แบตเตอรี่")}${packHtml("memory", "การ์ดหน่วยความจำ")}</div></div>`;
    } else kitEl.innerHTML = "";

    // ปุ่ม/ตัวเลือกในแถวอุปกรณ์ (รายการหลัก + เลนส์/แฟลช)
    [selEl, kitEl].forEach((host) => $$(".sel-row", host).forEach((row) => {
      const id = row.dataset.id, s = sel.get(id);
      $("[data-rm]", row).onclick = () => { sel.delete(id); paint(); };
      $$("[data-d]", row).forEach((b) => (b.onclick = () => { s.qty = Math.max(1, s.qty + Number(b.dataset.d)); paint(); }));
      $$("[data-no]", row).forEach((b) => (b.onclick = () => { const n = b.dataset.no; s.nos.has(n) ? s.nos.delete(n) : s.nos.add(n); s.qty = s.nos.size; paint(); }));
    }));
    $$("[data-add]", kitEl).forEach((x) => (x.onchange = () => { if (x.value && !addItem(x.value)) toast("อุปกรณ์นี้ไม่ว่างในวันที่เลือก", true); paint(); }));
    $$("[data-on]", kitEl).forEach((c) => (c.onchange = () => {
      const k = c.dataset.on; kitOn[k] = c.checked;
      if (!c.checked) { ofKind(k).forEach((it) => sel.delete(it.id)); extras[k] = ""; }
      paint();
    }));
    $$("[data-extra]", kitEl).forEach((i) => (i.oninput = () => { extras[i.dataset.extra] = i.value; }));
    $$("[data-pack]", kitEl).forEach((p) => {
      const id = p.dataset.pack;
      const get = () => { if (!sel.has(id)) sel.set(id, { qty: 0, nos: new Set() }); return sel.get(id); };
      const tidy = () => { const s = sel.get(id); if (s && !s.qty) sel.delete(id); paint(); };
      $$("[data-pno]", p).forEach((b) => (b.onclick = () => { const s = get(), n = b.dataset.pno; s.nos.has(n) ? s.nos.delete(n) : s.nos.add(n); s.qty = s.nos.size; tidy(); }));
      $$("[data-pd]", p).forEach((b) => (b.onclick = () => { const s = get(); s.qty = Math.max(0, s.qty + Number(b.dataset.pd)); tidy(); }));
    });

    // dropdown เพิ่มอุปกรณ์อื่น (ถ้าเลือกกล้องแล้ว อุปกรณ์เสริมกล้องเลือกในกล่องอุปกรณ์เสริมแทน)
    const groups = new Map();
    usable.filter((it) => !sel.has(it.id) && !(hasCamera && KIT_KINDS.includes(kindOf(it))))
      .forEach((it) => { const c = it.category || "อื่น ๆ"; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(it); });
    addEl.innerHTML = `<option value="">＋ ${mainRows.length ? "เพิ่มอุปกรณ์อื่น" : "เลือกอุปกรณ์ที่ต้องการยืม"}…</option>` + [...groups.entries()].map(([c, its]) =>
      `<optgroup label="${catIcon(c)} ${esc(c)}">${its.map((it) => { const ok = canBorrow(it), av = availOf(it);
        return `<option value="${it.id}" ${ok && av ? "" : "disabled"}>${esc(it.name)}${it.model ? ` — ${esc(it.model)}` : ""} · ${!ok ? "เฉพาะครู" : av ? `ว่าง ${av}` : "ไม่ว่าง"}</option>`; }).join("")}</optgroup>`).join("");
    addEl.disabled = !groups.size;

    const units = [...sel.values()].reduce((s, x) => s + x.qty, 0);
    $("#sel-sum", el).textContent = units ? `เลือกแล้ว ${sel.size} รายการ ${units} ชิ้น` : "";
  }
  addEl.onchange = () => { if (addEl.value && !addItem(addEl.value)) toast("อุปกรณ์นี้ไม่ว่างในวันที่เลือก", true); paint(); };
  f.elements.borrowDate.onchange = () => {
    const a = f.elements.borrowDate.value;
    f.elements.dueDate.min = a;
    if (f.elements.dueDate.value < a) f.elements.dueDate.value = a;
    paint();
  };
  f.elements.dueDate.onchange = paint;
  paint();

  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const [a, b] = range();
    if (b < a) return toast("กำหนดคืนต้องไม่ก่อนวันที่ยืม", true);
    if (timeError(a, b, f)) return toast(timeError(a, b, f), true);
    const chosen = [...sel].filter(([, s]) => s.qty > 0);
    if (!chosen.length) return toast("กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ", true);
    for (const [k, label] of [["battery", "แบตเตอรี่"], ["memory", "การ์ดหน่วยความจำ"]]) {
      if (!kitOn[k] || !kitEl.innerHTML) continue;
      const picked = ofKind(k).some((it) => sel.get(it.id)?.qty);
      if (ofKind(k).length ? !picked : !extras[k].trim()) return toast(`ติ๊ก “ยืม${label}” ไว้ กรุณาเลือกเบอร์${label} (หรือเอาติ๊กออก)`, true);
    }
    const empty = [...sel].find(([, s]) => !s.qty);
    if (empty) return toast(`"${byId.get(empty[0]).name}" ยังไม่ได้เลือกหมายเลข/จำนวน (หรือกด ✕ เพื่อนำออก)`, true);
    const btn = $("button[type=submit]", f);
    btn.disabled = true;
    try {
      const fresh = await activeLoans();
      for (const [id, s] of chosen) {
        const it = byId.get(id);
        if (!canBorrow(it)) { btn.disabled = false; return toast(`"${it.name}" ให้ยืมเฉพาะครู / บุคลากร`, true); }
        const used = usedNos(id, fresh, a, b), clash = [...s.nos].filter((n) => used.has(n));
        const av = availableIn(it, fresh, a, b);
        if (clash.length || s.qty > av) {
          btn.disabled = false; active.splice(0, active.length, ...fresh); paint();
          return toast(clash.length ? `"${it.name}" หมายเลข #${clash.join(", #")} เพิ่งถูกยืมไป กรุณาเลือกใหม่` : `"${it.name}" ว่างเพียง ${av} ชิ้นในช่วงวันที่เลือก`, true);
        }
      }
      const v = Object.fromEntries(new FormData(f));
      const p = staff ? readProfile(f) : u;
      const lineItems = chosen.map(([id, s]) => { const it = byId.get(id); return { itemId: id, name: it.name, model: it.model || "", category: it.category || "อื่น ๆ", kind: kindOf(it), code: it.code || "", qty: s.qty, nos: [...s.nos] }; });
      const loan = {
        uid: u.uid, borrowerName: staff ? v.borrowerName.trim() : u.name, borrowerType: p.type || "teacher",
        classroom: p.classroom || "", studentNo: p.studentNo || "", studentId: p.studentId || "", department: p.department || "",
        items: lineItems, itemIds: lineItems.map((x) => x.itemId),
        extras: kitEl.innerHTML ? Object.fromEntries(["battery", "memory"].filter((k) => kitOn[k] && !ofKind(k).length && extras[k].trim()).map((k) => [k, extras[k].trim()])) : {},
        borrowDate: a, dueDate: b, pickupTime: v.pickupTime, returnTime: v.returnTime, purpose: v.purpose, note: v.note.trim(),
        status: staff ? "approved" : "pending", reason: "", createdAt: Date.now(), ...(staff ? { approvedBy: u.name, onBehalf: true } : {}),
      };
      const id = await store.add("loans", loan);
      await store.set("loanContacts", id, { uid: u.uid, phone: v.phone.trim(), date: a });
      if (!staff && !u.phone) { store.update("users", u.uid, { phone: v.phone.trim() }).catch(() => {}); u.phone = v.phone.trim(); }
      toast(staff ? "บันทึกการยืมแล้ว" : "ส่งคำขอยืมแล้ว รอการอนุมัติ");
      refreshPending();
      location.hash = staff ? "#/requests" : "#/my";
    } catch (err) { btn.disabled = false; fail(err); }
  };
}

// ============================================================
//  รายการของฉัน
// ============================================================
async function my(el) {
  const rows = (await store.query("loans", { eq: ["uid", state.user.uid] })).sort((a, b) => (b.borrowDate + b.createdAt).localeCompare(a.borrowDate + a.createdAt));
  const open = rows.filter((l) => ACTIVE.includes(l.status)), done = rows.filter((l) => !ACTIVE.includes(l.status));
  const card = (l) => `<div class="item" data-id="${l.id}">
      <div class="when"><b>${parseYmd(l.borrowDate).getDate()}</b><span>${thDate(l.borrowDate, { month: "short", year: "2-digit" })}</span></div>
      <div><h3>${esc(itemsText(l))}</h3><div class="meta">${dateRange(l)} · ${esc(l.purpose || "")}${l.onBehalf ? ` · ผู้ยืม ${esc(l.borrowerName)}` : ""}</div>
        ${l.reason ? `<div class="meta" style="margin-top:4px">หมายเหตุจากพนักงานโสต: ${esc(l.reason)}</div>` : ""}
        ${l.status === "returned" ? `<div class="meta">คืนเมื่อ ${thDate(l.returnedDate)}</div>` : ""}</div>
      <div class="side">${stBadge(l)}<span><button class="linkbtn" data-view>รายละเอียด</button>${l.status === "pending" ? ` · <button class="linkbtn" data-cancel style="color:var(--red)">ยกเลิก</button>` : ""}</span></div></div>`;
  el.innerHTML = `<div class="wrap narrow"><div class="page-head head-row"><div><h1>รายการของฉัน</h1><p>ติดตามสถานะคำขอยืมและประวัติการยืมของคุณ</p></div><a class="btn" href="#/borrow">ยืมอุปกรณ์</a></div>
    <div class="section">
      ${rows.length ? "" : `<div class="empty">ยังไม่มีรายการยืม</div>`}
      ${open.length ? `<h2 style="font-size:19px;margin:0 0 12px">กำลังดำเนินการ</h2><div class="list">${open.map(card).join("")}</div>` : ""}
      ${done.length ? `<h2 style="font-size:19px;margin:32px 0 12px">ประวัติ</h2><div class="list">${done.map(card).join("")}</div>` : ""}
    </div></div>`;
  $$(".item", el).forEach((it) => {
    const l = rows.find((x) => x.id === it.dataset.id);
    $("[data-view]", it).onclick = () => showLoan(l, () => render());
    const c = $("[data-cancel]", it);
    if (c) c.onclick = async () => {
      if (!confirm(`ยกเลิกคำขอยืม “${itemsText(l)}” ?`)) return;
      try { await store.update("loans", l.id, { status: "cancelled", updatedAt: Date.now() }); toast("ยกเลิกแล้ว"); refreshPending(); render(); } catch (e) { fail(e); }
    };
  });
}

// ============================================================
//  รายละเอียด / อนุมัติ / รับคืน
// ============================================================
function loanActions(l) {
  if (!isStaff()) return "";
  if (l.status === "pending") return `<button class="btn ok sm" data-act="approve">อนุมัติ</button><button class="btn ghost sm" data-act="reject">ไม่อนุมัติ</button>`;
  if (l.status === "approved") return `<button class="btn sm" data-act="return">รับคืน</button>`;
  return "";
}
async function loanAction(l, act) {
  if (act === "approve") return decide(l, "approved");
  if (act === "reject") return decide(l, "rejected");
  if (act === "return") return receiveReturn(l);
  return false;
}
async function showLoan(l, onChange) {
  if (!l) return;
  let contact = null;
  if (isStaff() || l.uid === state.user.uid) { try { contact = await store.get("loanContacts", l.id); } catch {} }
  const m = openModal("รายละเอียดการยืม", `<dl class="dl">
      <dt>สถานะ</dt><dd>${stBadge(l)}${l.reason ? ` <span style="color:var(--ink-2)">${esc(l.reason)}</span>` : ""}</dd>
      <dt>ผู้ยืม</dt><dd>${who(l)}${contact?.phone ? `<div><a href="tel:${esc(contact.phone)}">${esc(contact.phone)}</a></div>` : ""}</dd>
      <dt>อุปกรณ์</dt><dd>${(l.items || []).map((x) => `${itemIcon(x)} ${esc(x.name)}${x.model ? ` <span class="muted">${esc(x.model)}</span>` : ""}${x.code ? ` <span class="muted">(${esc(x.code)})</span>` : ""} ${x.nos?.length ? `· หมายเลข #${x.nos.map(esc).join(", #")}` : `× ${x.qty}`}`).join("<br>")}</dd>
      ${extrasText(l) ? `<dt>อุปกรณ์เสริม</dt><dd>${esc(extrasText(l))}</dd>` : ""}
      <dt>มารับของ</dt><dd>${thDateLong(l.borrowDate)}${l.pickupTime ? ` · <b>${esc(l.pickupTime)} น.</b>` : ""}</dd><dt>กำหนดคืน</dt><dd>${thDateLong(l.dueDate)}${l.returnTime ? ` · <b>${esc(l.returnTime)} น.</b>` : ""}${isOverdue(l) ? ` <b style="color:var(--red)">(เกิน ${daysBetween(l.dueDate, today())} วัน)</b>` : ""}</dd>
      ${l.status === "returned" ? `<dt>คืนเมื่อ</dt><dd>${thDateLong(l.returnedDate)}${l.returnNote ? `<div class="muted">${esc(l.returnNote)}</div>` : ""}</dd>` : ""}
      <dt>ใช้สำหรับ</dt><dd>${esc(l.purpose) || "–"}</dd><dt>รายละเอียด</dt><dd>${esc(l.note) || "–"}</dd>
      ${l.approvedBy ? `<dt>ผู้อนุมัติ</dt><dd>${esc(l.approvedBy)}</dd>` : ""}</dl>
    ${l.editedBy ? `<p class="muted-p" style="margin-top:8px">แก้ไขล่าสุดโดย ${esc(l.editedBy)}</p>` : ""}
    ${isStaff() ? `<div class="form-actions" style="margin-top:20px"><button class="btn danger sm" data-del style="margin-right:auto">ลบรายการ</button>${ACTIVE.includes(l.status) ? `<button class="btn ghost sm" data-edit>แก้ไข</button>` : ""}${loanActions(l)}</div>` : ""}`);
  $$("[data-act]", m.el).forEach((b) => (b.onclick = async () => { if (await loanAction(l, b.dataset.act)) { m.close(); onChange?.(); } }));
  const ed = $("[data-edit]", m.el);
  if (ed) ed.onclick = async () => { m.close(); if (await editLoan(l)) onChange?.(); };
  const del = $("[data-del]", m.el);
  if (del) del.onclick = async () => {
    if (!confirm("ลบรายการนี้ถาวร? (จะไม่ถูกนับในสถิติอีก)")) return;
    try {
      await store.remove("loans", l.id); await store.remove("loanContacts", l.id).catch(() => {});
      m.close(); toast("ลบแล้ว"); refreshPending(); onChange?.();
    } catch (e) { fail(e); }
  };
}
// แก้ไขคำขอที่รออนุมัติ/อนุมัติแล้ว (เฉพาะพนักงานโสต): วันที่ จำนวน/หมายเลข วัตถุประสงค์ รายละเอียด
async function editLoan(l) {
  const [list, active] = await Promise.all([getItems(true), activeLoans()]);
  const byId = new Map(list.map((it) => [it.id, it]));
  const others = active.filter((o) => o.status === "approved" && o.id !== l.id);
  const lines = (l.items || []).map((x) => ({ ...x, nos: new Set(x.nos || []), qty: Number(x.qty) || 0 }));
  const ex = { battery: l.extras?.battery || "", memory: l.extras?.memory || "" };
  return new Promise((res) => {
    const m = openModal("แก้ไขรายการยืม", `<form class="form" id="elf" novalidate>
        <div class="full who-card">${who(l)}</div>
        <label class="f"><span>วันที่ยืม *</span><input class="inp" type="date" name="borrowDate" required value="${esc(l.borrowDate)}"></label>
        <label class="f"><span>กำหนดคืน *</span><input class="inp" type="date" name="dueDate" required value="${esc(l.dueDate)}"></label>
        ${timeFields(l)}
        <div class="full"><div class="el-h">อุปกรณ์</div><div id="el-lines"></div></div>
        ${ex.battery || ex.memory ? `<label class="f"><span>เบอร์แบตเตอรี่ (พิมพ์เอง)</span><input class="inp" name="exBattery" maxlength="40" value="${esc(ex.battery)}"></label>
        <label class="f"><span>เบอร์การ์ดหน่วยความจำ (พิมพ์เอง)</span><input class="inp" name="exMemory" maxlength="40" value="${esc(ex.memory)}"></label>` : ""}
        <label class="f"><span>ใช้สำหรับ *</span><select class="inp" name="purpose" required>${opts([...new Set([...PURPOSES, ...(l.purpose ? [l.purpose] : [])])], l.purpose, "เลือกวัตถุประสงค์")}</select></label>
        <label class="f full"><span>รายละเอียดเพิ่มเติม</span><textarea class="inp" name="note" rows="3" maxlength="600">${esc(l.note || "")}</textarea></label>
        <div class="full form-actions"><button class="btn ghost" type="button" data-x>ยกเลิก</button><button class="btn" type="submit">บันทึกการแก้ไข</button></div>
      </form>`);
    m.onClose = () => res(false);
    const f = $("#elf", m.el), host = $("#el-lines", m.el);
    const range = () => { const a = f.elements.borrowDate.value || l.borrowDate; return [a, f.elements.dueDate.value || a]; };
    const paint = () => {
      const [a, b] = range();
      host.innerHTML = lines.map((x, i) => {
        const it = byId.get(x.itemId), nos = it ? nosOf(it) : [];
        const head = `<div class="el-name"><b>${itemIcon(x)} ${esc(x.name)}</b>${x.code ? ` <span class="muted">(${esc(x.code)})</span>` : ""}${it ? "" : ` <span class="muted">· ถูกลบออกจากระบบแล้ว</span>`}</div>`;
        const rm = `<button type="button" class="btn ghost sm" data-rm>เอาออก</button>`;
        if (!it) return `<div class="el-row" data-i="${i}">${head}<span class="muted">× ${x.qty}</span>${rm}</div>`;
        if (nos.length) {
          const held = holdIn(it, a, b) > 0, used = usedNos(it.id, others, a, b);
          return `<div class="el-row" data-i="${i}">${head}${rm}
            <div class="nos"><span class="nos-lb">หมายเลข:</span>${nos.map((n) => { const busy = held || used.has(n); return `<button type="button" class="no${x.nos.has(n) ? " on" : ""}" data-no="${esc(n)}" ${busy && !x.nos.has(n) ? "disabled title='ถูกยืมหรือไม่ว่างในช่วงนี้'" : ""}>#${esc(n)}${busy && x.nos.has(n) ? " ⚠️" : ""}</button>`; }).join("")}</div></div>`;
        }
        const av = availableIn(it, others, a, b, l.id);
        return `<div class="el-row" data-i="${i}">${head}<label class="el-qty">จำนวน <input class="inp sm" type="number" min="1" max="${Math.max(av, x.qty)}" value="${x.qty}" data-qty></label>
          <span class="muted">ว่าง ${av}</span>${rm}</div>`;
      }).join("") || `<p class="muted-p">ไม่มีอุปกรณ์ในรายการ</p>`;
      $$(".el-row", host).forEach((row) => {
        const x = lines[Number(row.dataset.i)];
        $("[data-rm]", row).onclick = () => { lines.splice(Number(row.dataset.i), 1); paint(); };
        const q = $("[data-qty]", row); if (q) q.oninput = () => { x.qty = Math.max(0, Number(q.value) || 0); };
        $$("[data-no]", row).forEach((bn) => (bn.onclick = () => { const n = bn.dataset.no; x.nos.has(n) ? x.nos.delete(n) : x.nos.add(n); x.qty = x.nos.size; paint(); }));
      });
    };
    f.elements.borrowDate.onchange = () => { if (f.elements.dueDate.value < f.elements.borrowDate.value) f.elements.dueDate.value = f.elements.borrowDate.value; paint(); };
    f.elements.dueDate.onchange = paint;
    $("[data-x]", m.el).onclick = () => m.dismiss();
    paint();
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const [a, b] = range();
      if (b < a) return toast("วันกำหนดคืนต้องไม่ก่อนวันที่ยืม", true);
      if (timeError(a, b, f)) return toast(timeError(a, b, f), true);
      const keep = lines.filter((x) => (x.nos.size || x.qty) > 0);
      if (!keep.length) return toast("ต้องมีอุปกรณ์อย่างน้อย 1 รายการ (ถ้าไม่ยืมแล้วให้ลบรายการแทน)", true);
      for (const x of keep) {
        const it = byId.get(x.itemId);
        if (!it) continue;
        if (nosOf(it).length) {
          const used = usedNos(it.id, others, a, b);
          const clash = holdIn(it, a, b) ? [...x.nos] : [...x.nos].filter((n) => used.has(n));
          if (clash.length) return toast(`"${it.name}" หมายเลข #${clash.join(", #")} ไม่ว่างในช่วงวันที่เลือก`, true);
        } else {
          const av = availableIn(it, others, a, b, l.id);
          if (x.qty > av) return toast(`"${it.name}" ว่างเพียง ${av} ชิ้นในช่วงวันที่เลือก`, true);
        }
      }
      const items = keep.map((x) => ({ itemId: x.itemId, name: x.name, model: x.model || "", category: x.category || "อื่น ๆ", kind: x.kind || "", code: x.code || "", qty: x.nos.size || x.qty, nos: [...x.nos] }));
      const v = Object.fromEntries(new FormData(f));
      const extras = {};
      if ((v.exBattery || "").trim()) extras.battery = v.exBattery.trim();
      if ((v.exMemory || "").trim()) extras.memory = v.exMemory.trim();
      const patch = { borrowDate: a, dueDate: b, pickupTime: f.elements.pickupTime.value, returnTime: f.elements.returnTime.value, items, itemIds: items.map((x) => x.itemId), purpose: v.purpose, note: (v.note || "").trim(), extras, updatedAt: Date.now(), editedBy: state.user.name, editedAt: Date.now() };
      try {
        await store.update("loans", l.id, patch);
        Object.assign(l, patch);
        m.close(); toast("บันทึกการแก้ไขแล้ว"); res(true);
      } catch (err) { fail(err); }
    };
  });
}
async function decide(l, status) {
  try {
    let reason = "";
    if (status === "rejected") {
      reason = await askText("ไม่อนุมัติคำขอยืม", "เหตุผล (ผู้ยืมจะเห็นข้อความนี้)", "ยืนยันไม่อนุมัติ");
      if (reason === null) return false;
    } else {
      const [fresh, list] = await Promise.all([activeLoans(), getItems(true)]);
      const short = (l.items || []).map((x) => {
        const it = list.find((i) => i.id === x.itemId);
        const approved = fresh.filter((o) => o.status === "approved");
        const av = it ? availableIn(it, approved, l.borrowDate, l.dueDate, l.id) : 0;
        const used = usedNos(x.itemId, approved, l.borrowDate, l.dueDate, l.id), clash = (x.nos || []).filter((n) => used.has(n));
        if (clash.length) return `${x.name}: หมายเลข #${clash.join(", #")} ถูกยืมอยู่`;
        return av < x.qty ? `${x.name}: ว่าง ${av} ต้องการ ${x.qty}` : null;
      }).filter(Boolean);
      if (short.length && !confirm(`อุปกรณ์ไม่พอในช่วงวันที่นี้\n${short.join("\n")}\n\nอนุมัติต่อหรือไม่?`)) return false;
    }
    const patch = { status, reason, updatedAt: Date.now(), ...(status === "approved" ? { approvedBy: state.user.name, approvedAt: Date.now() } : {}) };
    await store.update("loans", l.id, patch);
    Object.assign(l, patch);
    toast(status === "approved" ? "อนุมัติแล้ว" : "บันทึกไม่อนุมัติแล้ว");
    refreshPending();
    return true;
  } catch (e) { fail(e); return false; }
}
function receiveReturn(l) {
  return new Promise((res) => {
    const m = openModal("รับคืนอุปกรณ์", `<form class="form" id="rf" novalidate style="grid-template-columns:1fr">
        <p class="note info" style="margin:0">${esc(l.borrowerName)} · ${esc(itemsText(l))}</p>
        <label class="f"><span>วันที่คืน *</span><input class="inp" type="date" name="returnedDate" required value="${today() < l.borrowDate ? l.borrowDate : today()}" min="${l.borrowDate}"></label>
        <fieldset><legend>อุปกรณ์ที่ชำรุด / มีปัญหา (ถ้ามี ระบบจะเปลี่ยนสภาพเป็น "ชำรุด")</legend>
          ${(l.items || []).map((x) => `<label class="f check"><input type="checkbox" name="damaged" value="${x.itemId}"> ${esc(lineText(x))}</label>`).join("")}</fieldset>
        <label class="f"><span>บันทึกการคืน</span><input class="inp" name="returnNote" maxlength="200" placeholder="เช่น คืนครบ สภาพดี"></label>
        <div class="form-actions"><button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn ok" type="submit">ยืนยันรับคืน</button></div></form>`);
    m.onClose = () => res(false);
    $("[data-x]", m.el).onclick = m.dismiss;
    const f = $("#rf", m.el);
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const fd = new FormData(f), damaged = fd.getAll("damaged");
      const patch = { status: "returned", returnedDate: fd.get("returnedDate"), returnNote: String(fd.get("returnNote") || "").trim(), returnedBy: state.user.name, damaged, updatedAt: Date.now() };
      try {
        await store.update("loans", l.id, patch);
        Object.assign(l, patch);
        for (const id of damaged) await store.update("items", id, { condition: "ชำรุด", note: `แจ้งชำรุดเมื่อคืน ${thDate(patch.returnedDate)}${patch.returnNote ? ": " + patch.returnNote : ""}`, updatedAt: Date.now() }).catch(() => {});
        state.items = null;
        m.close(); toast("บันทึกการคืนแล้ว"); res(true);
      } catch (err) { fail(err); }
    };
  });
}

// ============================================================
//  คำขอยืม-คืน (พนักงานโสต)
// ============================================================
const reqState = { tab: "pending", month: today().slice(0, 7), type: "", q: "" };
async function requests(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head head-row"><div><h1>คำขอยืม-คืน</h1><p>อนุมัติคำขอ รับคืนอุปกรณ์ และติดตามรายการที่เกินกำหนด</p></div><a class="btn" href="#/borrow">บันทึกการยืมแทนผู้ยืม</a></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="req"></div></div></section>`;
  const host = $("#req", el);
  async function draw() {
    const t = today(), { tab, month } = reqState;
    const active = await activeLoans();
    const pend = active.filter((l) => l.status === "pending"), out = active.filter((l) => l.status === "approved"), over = out.filter((l) => isOverdue(l, t));
    let rows;
    if (tab === "pending") rows = pend;
    else if (tab === "out") rows = out;
    else if (tab === "overdue") rows = over;
    else {
      const from = month + "-01", to = ymd(new Date(+month.slice(0, 4), +month.slice(5), 0));
      rows = (await store.query("loans", { range: ["borrowDate", from, to] }))
        .filter((l) => tab === "all" || (tab === "returned" ? l.status === "returned" : l.status === "rejected" || l.status === "cancelled"));
    }
    const TABS = [["pending", "รออนุมัติ", pend.length], ["out", "อนุมัติ", out.length], ["overdue", "เกินกำหนด", over.length], ["returned", "คืนแล้ว"], ["closed", "ไม่อนุมัติ/ยกเลิก"], ["all", "ทั้งหมด"]];
    host.innerHTML = `<div class="toolbar"><div class="seg">${TABS.map(([k, l, n]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l}${n !== undefined ? ` <small>${n}</small>` : ""}</button>`).join("")}</div>
        <span class="spacer"></span></div>
      <div class="toolbar">
        <div class="seg">${[["", "ทุกคน"], ["teacher", "ครู"], ["student", "นักเรียน"]].map(([k, l]) => `<button data-type="${k}" class="${reqState.type === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <input class="inp sm" type="search" id="rq-q" placeholder="ค้นหาผู้ยืมหรืออุปกรณ์" value="${esc(reqState.q)}" style="width:min(240px,100%)" aria-label="ค้นหา">
        <span class="spacer"></span>${["pending", "out", "overdue"].includes(tab) ? "" : `<label class="clip">เดือน <input class="inp sm" type="month" value="${month}" id="rq-month"></label>`}</div>
      <div id="rq-list"></div>`;
    const listEl = $("#rq-list", host);
    const paint = () => {
      const q = reqState.q.trim().toLowerCase();
      const shown = rows.filter((l) => (!reqState.type || l.borrowerType === reqState.type) &&
        (!q || `${l.borrowerName} ${l.classroom} ${l.studentId || ""} ${l.department} ${itemsText(l)}`.toLowerCase().includes(q)))
        .sort((a, b) => (tab === "pending" ? a.createdAt - b.createdAt : tab === "out" || tab === "overdue" ? a.dueDate.localeCompare(b.dueDate) : b.borrowDate.localeCompare(a.borrowDate)));
      listEl.innerHTML = shown.length ? loanTable(shown, { showStatus: true, actions: true })
        : `<div class="empty">${tab === "pending" ? "ไม่มีคำขอที่รออนุมัติ 🎉" : tab === "overdue" ? "ไม่มีรายการเกินกำหนด 🎉" : "ไม่มีรายการ"}</div>`;
      wireLoanTable(listEl, shown, () => draw().catch(fail));
    };
    $$("[data-tab]", host).forEach((b) => (b.onclick = () => { reqState.tab = b.dataset.tab; draw().catch(fail); }));
    $$("[data-type]", host).forEach((b) => (b.onclick = () => { reqState.type = b.dataset.type; $$("[data-type]", host).forEach((x) => x.classList.toggle("on", x === b)); paint(); }));
    $("#rq-q", host).oninput = (e) => { reqState.q = e.target.value; paint(); };
    const mi = $("#rq-month", host);
    if (mi) mi.onchange = () => { if (mi.value) { reqState.month = mi.value; draw().catch(fail); } };
    paint();
  }
  await draw();
}

// ============================================================
//  สถิติการยืม (พนักงานโสต)
// ============================================================
const statState = { preset: "month", from: "", to: "", type: "", ay: 0, kind: "loan" };
function presetRange(p) {
  const t = today();
  if (p === "week") { const m = mondayOf(t); return [m, addDays(m, 6)]; }
  if (p === "month") { const d = parseYmd(t); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
  if (p === "fy") return fiscalRange(fiscalYearOf(t));
  if (p === "ay") return academicRange(statState.ay || academicYearOf(t));
  return [statState.from || t, statState.to || t];
}
function trendBuckets(stats, from, to) {
  const days = daysBetween(from, to) + 1;
  const out = [];
  if (days <= 31) {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ label: String(parseYmd(d).getDate()), full: thDate(d, { weekday: "short", day: "numeric", month: "short" }), v: stats.byDay.get(d) || 0 });
    return { unit: "รายวัน", out };
  }
  if (days <= 124) {
    for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push({ label: thShort(d), full: "สัปดาห์ " + weekLabel(d), v: stats.byWeek.get(d) || 0 });
    return { unit: "รายสัปดาห์", out };
  }
  const c = parseYmd(from.slice(0, 7) + "-01");
  while (ymd(c) <= to) { const k = ymd(c).slice(0, 7); out.push({ label: monthShort(k), full: monthShort(k), v: stats.byMonth.get(k) || 0 }); c.setMonth(c.getMonth() + 1); }
  return { unit: "รายเดือน", out };
}
function barList(map, unit = "ครั้ง", limit = 12) {
  const e = sortedEntries(map).slice(0, limit);
  if (!e.length) return `<p style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`;
  const max = e[0][1];
  return `<div class="bars">${e.map(([k, v]) => `<div class="bar-row" data-tip="<b>${esc(k)}</b><br>${num(v)} ${unit}"><span class="lb">${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span class="val">${num(v)}</span></div>`).join("")}</div>`;
}
async function stats(el) {
  const KINDS = [["loan", "การยืมอุปกรณ์"], ["events", "งานและการใช้ห้อง"]];
  const HEADS = {
    loan: ["สถิติการยืมอุปกรณ์", "นับจากรายการที่อนุมัติแล้ว (อนุมัติและคืนแล้ว) ตามวันที่ยืม แยกครูและนักเรียน ส่งออกเป็นรายงาน Word, Excel และ PDF ได้"],
    events: ["สถิติงานและการใช้ห้อง", "จากปฏิทินงานโสตฯ ที่ดึงเข้าระบบอัตโนมัติทุก 15 นาที ส่งออกเป็นรายงาน Word, Excel และ PDF ได้"],
  };
  el.innerHTML = `<div class="wrap"><div class="page-head head-row"><div><h1 id="st-h"></h1><p id="st-p"></p></div>
      <div class="seg" id="st-kind">${KINDS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join("")}</div></div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="st"></div></div></section>`;
  const host = $("#st", el);
  const PRESETS = [["week", "สัปดาห์นี้"], ["month", "เดือนนี้"], ["ay", "ปีการศึกษา"], ["fy", "ปีงบประมาณนี้"], ["custom", "กำหนดเอง"]];
  const curAy = academicYearOf(today());
  if (!statState.ay) statState.ay = curAy;
  const AYS = []; for (let y = curAy; y >= Math.min(2568, curAy - 1); y--) AYS.push(y); // ปีปัจจุบันย้อนไปถึง 2568
  const TYPES = [["", "ทุกคน"], ["teacher", "ครู"], ["student", "นักเรียน"]];
  const setHead = () => {
    $("#st-h", el).textContent = HEADS[statState.kind][0]; $("#st-p", el).textContent = HEADS[statState.kind][1];
    $$("#st-kind [data-k]", el).forEach((b) => b.classList.toggle("on", b.dataset.k === statState.kind));
  };
  $$("#st-kind [data-k]", el).forEach((b) => (b.onclick = () => { statState.kind = b.dataset.k; draw().catch(fail); }));
  async function draw() {
    setHead();
    if (statState.kind === "events") return drawEvents();
    const [from, to] = presetRange(statState.preset);
    statState.from = from; statState.to = to;
    const all = (await store.query("loans", { range: ["borrowDate", from, to] })).filter((l) => l.status === "approved" || l.status === "returned");
    const rows = all.filter((l) => !statState.type || (statState.type === "student") === (l.borrowerType === "student")).sort((a, b) => a.borrowDate.localeCompare(b.borrowDate));
    const s = computeStats(rows);
    const tr = trendBuckets(s, from, to);
    const max = Math.max(1, ...tr.out.map((x) => x.v));
    const step = Math.ceil(tr.out.length / 16);
    const typeTxt = TYPES.find((x) => x[0] === statState.type)[1];
    host.innerHTML = `
      <div class="toolbar"><div class="seg">${PRESETS.map(([k, l]) => `<button data-p="${k}" class="${k === statState.preset ? "on" : ""}">${l}</button>`).join("")}</div>
        ${statState.preset === "ay" ? `<select class="inp sm" id="s-ay" aria-label="เลือกปีการศึกษา">${AYS.map((y) => `<option value="${y}"${y === statState.ay ? " selected" : ""}>ปีการศึกษา ${y}</option>`).join("")}</select>` : ""}
        <input class="inp sm" type="date" id="s-from" value="${from}" aria-label="ตั้งแต่วันที่"><span class="clip">ถึง</span><input class="inp sm" type="date" id="s-to" value="${to}" aria-label="ถึงวันที่">
        <div class="seg">${TYPES.map(([k, l]) => `<button data-t="${k}" class="${k === statState.type ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span><button class="btn ghost" id="s-print">พิมพ์</button><div class="export-btns"><span class="clip">ดาวน์โหลดรายงาน</span><button class="btn sm" data-exp="word">Word</button><button class="btn sm" data-exp="excel">Excel</button><button class="btn sm" data-exp="pdf">PDF</button></div></div>
      <div class="kpis">
        <div class="kpi"><div class="k">จำนวนครั้งที่ยืม</div><div class="v">${num(s.total)}<small>ครั้ง</small></div><div class="n">ครู ${num(s.teacher)} · นักเรียน ${num(s.student)}</div></div>
        <div class="kpi"><div class="k">จำนวนอุปกรณ์ที่ยืม</div><div class="v">${num(s.units)}<small>ชิ้น</small></div></div>
        <div class="kpi"><div class="k">ระยะเวลายืมเฉลี่ย</div><div class="v">${s.avgDays.toLocaleString("th-TH", { maximumFractionDigits: 1 })}<small>วัน</small></div><div class="n">จากรายการที่คืนแล้ว ${num(s.closed)} รายการ</div></div>
        <div class="kpi${s.overdueNow ? " kpi-alert" : ""}"><div class="k">คืนช้า / เกินกำหนด</div><div class="v">${num(s.lateReturns + s.overdueNow)}<small>รายการ</small></div><div class="n">คืนช้า ${s.lateReturns} · ยังไม่คืน ${s.overdueNow}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>จำนวนครั้งที่ยืม ${tr.unit}</h2><p class="sub">${statState.preset === "ay" ? `ปีการศึกษา ${statState.ay} · ` : ""}${thDate(from)} – ${thDate(to)} · ${typeTxt}</p>
        <div class="trend"><div class="trend-plot">${tr.out.map((x) => `<div class="trend-col" data-tip="<b>${esc(x.full)}</b><br>${x.v} ครั้ง">${x.v && tr.out.length <= 16 ? `<span class="tv">${x.v}</span>` : ""}<div class="b" style="height:${(x.v / max) * 100}%"></div></div>`).join("")}</div>
        <div class="trend-x">${tr.out.map((x, i) => `<span>${i % step === 0 ? esc(x.label) : ""}</span>`).join("")}</div></div></div>
      <div class="grid2">
        <div class="card"><h2>หมวดหมู่อุปกรณ์</h2><p class="sub">จำนวนชิ้นที่ถูกยืม</p>${barList(s.byCategory, "ชิ้น")}</div>
        <div class="card"><h2>อุปกรณ์ที่ถูกยืมมากที่สุด</h2><p class="sub">จำนวนชิ้น (10 อันดับแรก)</p>${barList(s.byItem, "ชิ้น", 10)}</div>
        ${statState.type ? "" : `<div class="card"><h2>ผู้ยืมแยกตามประเภท</h2><p class="sub">จำนวนครั้ง</p>${barList(s.byType)}</div>`}
        ${statState.type === "student" ? "" : `<div class="card"><h2>ครู: หน่วยงาน</h2><p class="sub">จำนวนครั้งแยกตามหน่วยงาน</p>${barList(s.byDept)}</div>`}
        ${statState.type === "teacher" ? "" : `<div class="card"><h2>นักเรียน: ชั้น / ห้อง</h2><p class="sub">จำนวนครั้งแยกตามห้องเรียน</p>${barList(s.byClass)}</div>`}
        <div class="card"><h2>วัตถุประสงค์</h2><p class="sub">จำนวนครั้ง</p>${barList(s.byPurpose)}</div>
        <div class="card"><h2>สรุปรายเดือน</h2><p class="sub">จำนวนครั้งและจำนวนชิ้น</p>
          ${s.byMonth.size ? `<table class="t"><thead><tr><th>เดือน</th><th class="num">ครั้ง</th><th class="num">ชิ้น</th></tr></thead><tbody>${[...s.byMonth.keys()].sort().map((k) => `<tr><td>${parseYmd(k + "-01").toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</td><td class="num">${num(s.byMonth.get(k))}</td><td class="num">${num(s.unitsByMonth.get(k))}</td></tr>`).join("")}</tbody></table>` : `<p style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`}</div>
      </div>`;
    $$("[data-p]", host).forEach((b) => (b.onclick = () => { statState.preset = b.dataset.p; draw().catch(fail); }));
    $$("[data-t]", host).forEach((b) => (b.onclick = () => { statState.type = b.dataset.t; draw().catch(fail); }));
    const custom = () => {
      const a = $("#s-from", host).value, b = $("#s-to", host).value;
      if (!a || !b) return;
      if (a > b) return toast("วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด", true);
      statState.preset = "custom"; statState.from = a; statState.to = b; draw().catch(fail);
    };
    if ($("#s-ay", host)) $("#s-ay", host).onchange = (e) => { statState.ay = Number(e.target.value); draw().catch(fail); };
    $("#s-from", host).onchange = custom; $("#s-to", host).onchange = custom;
    $("#s-print", host).onclick = () => window.print();
    const exp = { word: exportLoanReport, excel: exportLoanExcel, pdf: exportLoanPdf };
    $$("[data-exp]", host).forEach((b) => (b.onclick = async () => {
      b.disabled = true; const t = b.textContent; b.textContent = "กำลังสร้าง…";
      try { await exp[b.dataset.exp]({ from, to, rows, stats: s, typeLabel: typeTxt, periodLabel: statState.preset === "ay" ? `ปีการศึกษา ${statState.ay}` : "" }); toast(`ดาวน์โหลดรายงาน ${t} แล้ว`); }
      catch (e) { fail(e); } finally { b.disabled = false; b.textContent = t; }
    }));
  }
  // ----- สถิติงานและการใช้ห้อง (จากปฏิทินงานโสตฯ) -----
  async function drawEvents() {
    const [from, to] = presetRange(statState.preset);
    statState.from = from; statState.to = to;
    const rows = await loadEvents(from, to);
    const s = computeEventStats(rows);
    const tr = trendBuckets(s, from, to);
    const max = Math.max(1, ...tr.out.map((x) => x.v));
    const step = Math.ceil(tr.out.length / 16);
    const hrs = (h) => h.toLocaleString("th-TH", { maximumFractionDigits: 1 });
    const periodLabel = statState.preset === "ay" ? `ปีการศึกษา ${statState.ay}` : "";
    host.innerHTML = `
      <div class="toolbar"><div class="seg">${PRESETS.map(([k, l]) => `<button data-p="${k}" class="${k === statState.preset ? "on" : ""}">${l}</button>`).join("")}</div>
        ${statState.preset === "ay" ? `<select class="inp sm" id="s-ay" aria-label="เลือกปีการศึกษา">${AYS.map((y) => `<option value="${y}"${y === statState.ay ? " selected" : ""}>ปีการศึกษา ${y}</option>`).join("")}</select>` : ""}
        <input class="inp sm" type="date" id="s-from" value="${from}" aria-label="ตั้งแต่วันที่"><span class="clip">ถึง</span><input class="inp sm" type="date" id="s-to" value="${to}" aria-label="ถึงวันที่">
        <span class="spacer"></span><button class="btn ghost" id="s-print">พิมพ์</button><div class="export-btns"><span class="clip">ดาวน์โหลดรายงาน</span><button class="btn sm" data-exp="word">Word</button><button class="btn sm" data-exp="excel">Excel</button><button class="btn sm" data-exp="pdf">PDF</button></div></div>
      <div class="kpis">
        <div class="kpi"><div class="k">จำนวนงาน</div><div class="v">${num(s.events)}<small>งาน</small></div><div class="n">ใน ${num(s.days)} วัน</div></div>
        <div class="kpi"><div class="k">ชั่วโมงให้บริการ</div><div class="v">${hrs(s.hours)}<small>ชม.</small></div><div class="n">จากงานที่ระบุเวลา ${num(s.events - s.allDayEvents)} งาน</div></div>
        <div class="kpi"><div class="k">งานตลอดวัน</div><div class="v">${num(s.allDayEvents)}<small>งาน</small></div><div class="n">รวม ${num(s.occurrences - s.timed)} วัน-งาน</div></div>
        <div class="kpi"><div class="k">เฉลี่ยต่อวันที่มีงาน</div><div class="v">${s.days ? hrs(s.occurrences / s.days) : 0}<small>งาน</small></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>จำนวนงาน ${tr.unit}</h2><p class="sub">${periodLabel ? periodLabel + " · " : ""}${thDate(from)} – ${thDate(to)}</p>
        <div class="trend"><div class="trend-plot">${tr.out.map((x) => `<div class="trend-col" data-tip="<b>${esc(x.full)}</b><br>${x.v} งาน">${x.v && tr.out.length <= 16 ? `<span class="tv">${x.v}</span>` : ""}<div class="b" style="height:${(x.v / max) * 100}%"></div></div>`).join("")}</div>
        <div class="trend-x">${tr.out.map((x, i) => `<span>${i % step === 0 ? esc(x.label) : ""}</span>`).join("")}</div></div></div>
      <div class="grid2">
        <div class="card"><h2>ประเภทงาน</h2><p class="sub">จัดกลุ่มอัตโนมัติจากชื่องาน</p>${barList(s.byType, "งาน")}</div>
        <div class="card"><h2>ช่วงเวลา</h2><p class="sub">ตามเวลาเริ่มงาน · ${SLOT_NOTE}</p>${barList(s.bySlot, "งาน")}</div>
        <div class="card"><h2>สถานที่ / ห้อง</h2><p class="sub">จากช่อง "สถานที่" ในปฏิทิน</p>${s.hasLocation ? barList(s.byLocation, "งาน") : `<p class="muted-p" style="margin:0">ยังไม่มีงานที่ระบุสถานที่ — ใส่ชื่อห้องในช่อง "เพิ่มสถานที่" ของนัดหมายใน Google Calendar แล้วสถิติแยกตามห้องจะขึ้นที่นี่อัตโนมัติ</p>`}</div>
        <div class="card"><h2>วันในสัปดาห์</h2><p class="sub">จำนวนวัน-งาน</p>${barList(s.byWeekday, "งาน", 7)}</div>
        <div class="card"><h2>งานที่จัดบ่อย</h2><p class="sub">10 อันดับแรก</p>${barList(s.byTitle, "งาน", 10)}</div>
        <div class="card"><h2>สรุปรายเดือน</h2><p class="sub">จำนวนวัน-งานและชั่วโมง</p>
          ${s.byMonth.size ? `<table class="t"><thead><tr><th>เดือน</th><th class="num">งาน</th><th class="num">ชั่วโมง</th></tr></thead><tbody>${[...s.byMonth.keys()].sort().map((k) => `<tr><td>${parseYmd(k + "-01").toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</td><td class="num">${num(s.byMonth.get(k))}</td><td class="num">${hrs(s.hoursByMonth.get(k) || 0)}</td></tr>`).join("")}</tbody></table>` : `<p style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`}</div>
      </div>
      <div class="card" style="margin-top:16px"><h2>รายการงาน</h2><p class="sub">${num(rows.length)} รายการ</p>
        ${rows.length ? `<div class="table-wrap flat"><table class="t"><thead><tr><th>วันที่</th><th>เวลา</th><th>ชื่องาน</th><th>ประเภท</th></tr></thead><tbody>
          ${rows.map((e) => `<tr><td style="white-space:nowrap">${thDate(e.date)}</td><td style="white-space:nowrap">${eventTime(e)}</td><td><b>${esc(e.title)}</b>${e.location ? `<div class="muted">📍 ${esc(e.location)}</div>` : ""}</td><td class="muted">${esc(eventType(e.title))}</td></tr>`).join("")}
        </tbody></table></div>` : `<p style="color:var(--ink-3);font-size:14px;margin:0">ไม่มีข้อมูล</p>`}</div>`;
    $$("[data-p]", host).forEach((b) => (b.onclick = () => { statState.preset = b.dataset.p; draw().catch(fail); }));
    const custom = () => {
      const a = $("#s-from", host).value, b = $("#s-to", host).value;
      if (!a || !b) return;
      if (a > b) return toast("วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด", true);
      statState.preset = "custom"; statState.from = a; statState.to = b; draw().catch(fail);
    };
    if ($("#s-ay", host)) $("#s-ay", host).onchange = (e) => { statState.ay = Number(e.target.value); draw().catch(fail); };
    $("#s-from", host).onchange = custom; $("#s-to", host).onchange = custom;
    $("#s-print", host).onclick = () => window.print();
    const exp = { word: exportEventReport, excel: exportEventExcel, pdf: exportEventPdf };
    $$("[data-exp]", host).forEach((b) => (b.onclick = async () => {
      b.disabled = true; const t = b.textContent; b.textContent = "กำลังสร้าง…";
      try { await exp[b.dataset.exp]({ from, to, rows, stats: s, periodLabel, typeOf: eventType }); toast(`ดาวน์โหลดรายงาน ${t} แล้ว`); }
      catch (e) { fail(e); } finally { b.disabled = false; b.textContent = t; }
    }));
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
        <div class="export-btns"><span class="clip">ดาวน์โหลดแบบบันทึก</span><button class="btn sm" data-bexp="word">Word</button><button class="btn sm" data-bexp="excel">Excel</button><button class="btn sm" data-bexp="pdf">PDF</button></div><button class="btn" id="b-add">เพิ่มรายการ</button></div>
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
    const bexp = { word: exportBudgetReport, excel: exportBudgetExcel, pdf: exportBudgetPdf };
    $$("[data-bexp]", host).forEach((b) => (b.onclick = async () => {
      b.disabled = true; const t = b.textContent; b.textContent = "กำลังสร้าง…";
      try { await bexp[b.dataset.bexp]({ fy, rows, groups }); toast(`ดาวน์โหลดแบบบันทึก ${t} แล้ว`); }
      catch (e) { fail(e); } finally { b.disabled = false; b.textContent = t; }
    }));
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
//  ตั้งค่า: ผู้ใช้งาน (พนักงานโสต)
// ============================================================
const userState = { q: "", role: "", type: "", st: "" };
async function settings(el) {
  el.innerHTML = `<div class="wrap"><div class="page-head head-row"><div><h1>ตั้งค่า</h1><p>จัดการบัญชีผู้ใช้งาน สิทธิ์ การระงับ และการลบบัญชี · เข้าสู่ระบบได้เฉพาะบัญชี Google ของโรงเรียน</p></div>
</div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="set"></div></div></section>`;
  const host = $("#set", el);
  async function draw() {
    const users = (await store.list("users")).sort((a, b) => (a.role === "staff" ? 0 : 1) - (b.role === "staff" ? 0 : 1) || (a.name || "").localeCompare(b.name || "", "th"));
    const me = state.user.uid;
    host.innerHTML = `
      <div class="toolbar"><h2 style="font-size:21px">ผู้ใช้งาน</h2><span class="clip" id="u-count"></span><span class="spacer"></span>
        <input class="inp sm" type="search" id="u-q" placeholder="ค้นหาชื่อ อีเมล ชื่อผู้ใช้ ห้อง หรือรหัสนักเรียน" aria-label="ค้นหาผู้ใช้งาน" style="width:min(260px,100%)" value="${esc(userState.q)}">
        <select class="inp sm" id="u-type" aria-label="กรองตามประเภท"><option value="">ทุกประเภท</option><option value="teacher">ครู / บุคลากร</option><option value="student">นักเรียน</option><option value="none">ยังไม่ระบุ</option></select>
        <select class="inp sm" id="u-role" aria-label="กรองตามสิทธิ์"><option value="">ทุกสิทธิ์</option><option value="staff">พนักงานโสต</option><option value="user">ผู้ใช้ทั่วไป</option></select>
        <select class="inp sm" id="u-st" aria-label="กรองตามสถานะ"><option value="">ทุกสถานะ</option><option value="active">ใช้งานได้</option><option value="banned">ถูกระงับ</option></select></div>
      <p class="note info" style="margin:0 0 12px">ผู้ใช้ Google จะปรากฏหลังเข้าสู่ระบบครั้งแรก ส่วนบัญชีชื่อผู้ใช้ สมัครเองได้ที่หน้าแรกหรือพนักงานโสตสร้างให้ · <b>ระงับ</b> = เข้าใช้ไม่ได้จนกว่าจะยกเลิก · <b>ลบ</b> = ลบข้อมูลบัญชีออกจากระบบ</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>ชื่อ</th><th>บัญชี</th><th>ประเภท</th><th>สิทธิ์</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${users.map((u) => { const id = u.id, self = id === me; return `<tr data-id="${id}" data-u="${esc(`${u.name || ""} ${u.email || ""} ${u.username || ""} ${u.classroom || ""} ${u.studentId || ""} ${u.department || ""}`.toLowerCase())}" data-ur="${u.role === "staff" ? "staff" : "user"}" data-ut="${u.type || "none"}" data-us="${u.banned ? "banned" : "active"}" class="${u.banned ? "row-muted" : ""}">
          <td><b>${esc(u.name) || "–"}</b><div class="muted">${esc(u.type === "student" ? studentInfo(u) : u.department || "")}</div></td>
          <td>${u.username ? `<span class="tag">ชื่อผู้ใช้</span> ${esc(u.username)}` : esc(u.email)}</td>
          <td><select class="inp sm" data-type aria-label="ประเภท"><option value=""${u.type ? "" : " selected"}>ยังไม่ระบุ</option><option value="teacher"${u.type === "teacher" ? " selected" : ""}>ครู / บุคลากร</option><option value="student"${u.type === "student" ? " selected" : ""}>นักเรียน</option></select></td>
          <td><select class="inp sm" data-role aria-label="สิทธิ์" ${self ? "disabled title='เปลี่ยนสิทธิ์ของตัวเองไม่ได้'" : ""}><option value="user"${u.role !== "staff" ? " selected" : ""}>ผู้ใช้ทั่วไป</option><option value="staff"${u.role === "staff" ? " selected" : ""}>พนักงานโสต</option></select></td>
          <td>${u.banned ? `<span class="st st-rejected">ถูกระงับ</span>` : `<span class="st st-approved">ใช้งานได้</span>`}</td>
          <td><div class="acts">${self ? `<span class="clip">บัญชีของคุณ</span>` : `<button class="btn ghost sm" data-ban>${u.banned ? "ยกเลิกระงับ" : "ระงับ"}</button><button class="btn danger sm" data-del>ลบ</button>`}</div></td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="empty" id="u-empty" hidden style="padding:28px 16px">ไม่พบผู้ใช้งานที่ตรงกับคำค้น</div>`;
    const uq = $("#u-q", host), ur = $("#u-role", host), ut = $("#u-type", host), us = $("#u-st", host);
    ur.value = userState.role; ut.value = userState.type; us.value = userState.st;
    const filterUsers = () => {
      Object.assign(userState, { q: uq.value, role: ur.value, type: ut.value, st: us.value });
      const q = uq.value.trim().toLowerCase();
      let shown = 0;
      $$("tr[data-u]", host).forEach((tr) => {
        const ok = (!q || tr.dataset.u.includes(q)) && (!ur.value || tr.dataset.ur === ur.value) && (!ut.value || tr.dataset.ut === ut.value) && (!us.value || tr.dataset.us === us.value);
        tr.hidden = !ok;
        if (ok) shown++;
      });
      $("#u-count", host).textContent = q || ur.value || ut.value || us.value ? `พบ ${shown} จาก ${users.length} คน` : `${users.length} คน`;
      $("#u-empty", host).hidden = shown > 0;
    };
    [uq, ur, ut, us].forEach((x) => (x.oninput = x.onchange = filterUsers));
    filterUsers();
    $$("tr[data-id]", host).forEach((tr) => {
      const u = users.find((x) => x.id === tr.dataset.id);
      $("[data-role]", tr).onchange = async (e) => {
        try { await store.update("users", u.id, { role: e.target.value }); tr.dataset.ur = e.target.value; toast("อัปเดตสิทธิ์แล้ว"); } catch (err) { fail(err); draw().catch(() => {}); }
      };
      $("[data-type]", tr).onchange = async (e) => {
        try { await store.update("users", u.id, { type: e.target.value }); tr.dataset.ut = e.target.value || "none"; toast("อัปเดตประเภทแล้ว"); } catch (err) { fail(err); draw().catch(() => {}); }
      };
      const ban = $("[data-ban]", tr);
      if (ban) ban.onclick = async () => {
        const next = !u.banned;
        if (next && !confirm(`ระงับบัญชี “${u.name}”? ผู้ใช้จะเข้าสู่ระบบไม่ได้จนกว่าจะยกเลิกการระงับ และคำขอที่รออนุมัติจะถูกยกเลิก`)) return;
        try {
          await store.update("users", u.id, { banned: next, bannedAt: next ? Date.now() : null });
          if (next) for (const l of await store.query("loans", { eq: ["uid", u.id] })) if (l.status === "pending") await store.update("loans", l.id, { status: "cancelled", reason: "บัญชีถูกระงับ", updatedAt: Date.now() });
          toast(next ? "ระงับบัญชีแล้ว" : "ยกเลิกการระงับแล้ว"); refreshPending(); draw().catch(fail);
        } catch (err) { fail(err); }
      };
      const del = $("[data-del]", tr);
      if (del) del.onclick = () => deleteAccount(u, () => draw().catch(fail));
    });
  }
  await draw();
}
async function deleteAccount(u, done) {
  let loans = [];
  try { loans = await store.query("loans", { eq: ["uid", u.id] }); } catch (e) { return fail(e); }
  const out = loans.filter((l) => l.status === "approved");
  const m = openModal("ลบบัญชี", `<p style="margin-top:0">ลบบัญชี <b>${esc(u.name)}</b> (${esc(u.username || u.email)}) ออกจากระบบ</p>
    ${out.length ? `<p class="note warn">บัญชีนี้ยังยืมอุปกรณ์อยู่ ${out.length} รายการ ควรรับคืนให้เรียบร้อยก่อนลบ</p>` : ""}
    <label class="f check"><input type="checkbox" id="del-hist"> ลบประวัติการยืมทั้งหมดของบัญชีนี้ด้วย (${loans.length} รายการ — สถิติย้อนหลังจะลดลง)</label>
    <p class="note info">ถ้าไม่ลบประวัติ รายการยืมเดิมยังอยู่ในสถิติ และคำขอที่รออนุมัติจะถูกยกเลิก<br>
      หากผู้ใช้เข้าสู่ระบบอีกครั้ง จะกลับมาเป็นผู้ใช้ใหม่ — <b>ถ้าไม่ต้องการให้เข้าใช้อีก ให้กด “ระงับ” แทนการลบ</b></p>
    <div class="form-actions"><button class="btn ghost" data-x>ยกเลิก</button><button class="btn danger" data-ok>ลบบัญชี</button></div>`);
  $("[data-x]", m.el).onclick = m.dismiss;
  $("[data-ok]", m.el).onclick = async (e) => {
    const hist = $("#del-hist", m.el).checked;
    e.target.disabled = true;
    try {
      for (const l of loans) {
        if (hist) { await store.remove("loans", l.id); await store.remove("loanContacts", l.id).catch(() => {}); }
        else if (l.status === "pending") await store.update("loans", l.id, { status: "cancelled", reason: "บัญชีถูกลบ", updatedAt: Date.now() });
      }
      await store.remove("users", u.id);
      m.close(); toast(hist ? "ลบบัญชีและประวัติแล้ว" : "ลบบัญชีแล้ว"); refreshPending(); done();
    } catch (err) { e.target.disabled = false; fail(err); }
  };
}
function accountForm(done) {
  const m = openModal("สร้างบัญชีชื่อผู้ใช้", `<form class="form" id="af" novalidate>
      <p class="note info full" style="margin:0">สำหรับนักเรียนหรือบุคลากรที่ไม่มีอีเมล สร้างแล้วแจ้งชื่อผู้ใช้และรหัสผ่านให้เจ้าของบัญชี</p>
      <label class="f full"><span>ชื่อ-นามสกุล *</span><input class="inp" name="name" required maxlength="80"></label>
      <fieldset class="full"><legend>ประเภท *</legend>${typeChips("type", "student")}</fieldset>
      ${typeFields({ type: "student" })}
      <label class="f"><span>ชื่อผู้ใช้ * <small>(a–z 0–9 . _ -)</small></span><input class="inp" name="username" required maxlength="30" autocapitalize="none" spellcheck="false" autocomplete="off"></label>
      <label class="f"><span>รหัสผ่าน * <small>(อย่างน้อย 6 ตัว)</small></span><input class="inp" name="password" required minlength="6" autocomplete="new-password"></label>
      <div class="full form-actions"><button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn" type="submit">สร้างบัญชี</button></div></form>`);
  const f = $("#af", m.el);
  wireTypeFields(f);
  $("[data-x]", m.el).onclick = m.dismiss;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const username = f.elements.username.value.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return toast("ชื่อผู้ใช้ใช้ได้เฉพาะ a–z, 0–9, จุด และขีด ยาว 3–30 ตัว", true);
    const btn = $("button[type=submit]", f); btn.disabled = true;
    try { await store.createAccount({ username, password: f.elements.password.value, profile: readProfile(f) }); m.close(); toast(`สร้างบัญชี “${username}” แล้ว`); done(); }
    catch (err) { btn.disabled = false; fail(err); }
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
    view.innerHTML = `<div class="wrap"><div class="empty"><p class="note err" style="display:inline-block">เชื่อมต่อระบบไม่สำเร็จ: ${esc(friendly(e))}</p></div></div>`;
    return;
  }
  window.addEventListener("hashchange", () => render());
  store.onAuth(async (user, err) => {
    if (err) state.authMsg = friendly(err);
    state.user = user; state.items = null; state.pending = 0;
    renderDemoBar();
    render(true); // เปลี่ยนหน้าทันที ไม่ต้องรอข้อมูล
    if (user) refreshPending().catch(() => {});
  });
})();
