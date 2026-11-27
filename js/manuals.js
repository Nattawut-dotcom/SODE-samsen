// ============================================================
//  คู่มือการใช้งาน — เปิดอ่านเป็นสไลด์ 16:9 เลื่อนทีละหน้า (ผู้ใช้ที่เข้าสู่ระบบแล้ว)
//  เนื้อหาเก็บใน Firestore "manuals" (ห้ามใส่ไว้ในโค้ด เพราะ repo เป็นสาธารณะ และบางคู่มือมีรหัสผ่าน)
//
//  audience: "teacher" = เฉพาะครู/บุคลากร (และพนักงานโสต) · "all" = ทุกคนที่เข้าสู่ระบบ
//  kind "slides": pages[] ที่ออกแบบไว้ (cover / step / image / end)
//  kind "pdf"   : file (ไฟล์ PDF ที่พนักงานโสตอัปโหลด เก็บแยกใน manualFiles) — 1 หน้า PDF = 1 สไลด์
//  ข้อความรองรับ **ตัวหนา** และ `โค้ด`
// ============================================================
import { store } from "./store.js";
import { $, $$, esc } from "./util.js";

const md = (t) => esc(t || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\n/g, "<br>");
const AUD = { teacher: "ครูและบุคลากร", all: "ทุกคน" };
const PDF_MAX_MB = 30;
const WIN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 2.2 6.5 1.3v6.2H0zM7.3 1.2 16 0v7.5H7.3zM0 8.3h6.5v6.3L0 13.7zM7.3 8.3H16V16l-8.7-1.2z"/></svg>`;
const FOLDER = `<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M1 3a2 2 0 0 1 2-2h6l2 2.5h10a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#f5c451"/><path d="M1 7h22v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#fbd86d"/></svg>`;
const CURSOR = `<svg class="vz-cursor" viewBox="0 0 16 22" aria-hidden="true"><path d="M1 1v17l4.5-4 3 7 3-1.3-3-6.8H14z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

// ---------- ภาพจำลองหน้าจอ Windows ----------
function visual(v = {}) {
  if (v.kind === "start-menu") return `<div class="vz vz-desk">
      <div class="vz-menu">${["Device Manager", "Task Manager", "Settings", "File Explorer", "Search"].map((x) => `<span>${x}</span>`).join("")}
        <span class="hl">Run ${CURSOR}</span><span>Shut down or sign out</span><span>Desktop</span></div>
      <div class="vz-taskbar"><span class="vz-win hl-ring">${WIN}</span><i></i><i></i><i></i></div>
      <div class="vz-label">คลิกขวา</div></div>`;
  if (v.kind === "run") return `<div class="vz vz-dialog">
      <div class="vz-title"><span class="vz-ico">↗</span>Run<span class="vz-x">✕</span></div>
      <p>Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.</p>
      <label class="vz-field"><span>Open:</span><b class="vz-input hl-ring">${esc(v.value || "")}<i class="caret"></i></b></label>
      <div class="vz-btns"><span class="vz-btn pri hl-ring">OK ${CURSOR}</span><span class="vz-btn">Cancel</span><span class="vz-btn">Browse…</span></div></div>`;
  if (v.kind === "login") return `<div class="vz vz-dialog">
      <div class="vz-title"><span class="vz-ico">🛡</span>Windows Security<span class="vz-x">✕</span></div>
      <h5>Enter network credentials</h5>
      <b class="vz-input hl-ring">${esc(v.user || "")}</b>
      <b class="vz-input hl-ring">${esc(v.pass || "")}</b>
      <div class="vz-btns wide"><span class="vz-btn pri hl-ring">OK ${CURSOR}</span><span class="vz-btn">Cancel</span></div></div>`;
  if (v.kind === "folders") return `<div class="vz vz-explorer">
      <div class="vz-addr">📁 ${esc(v.path || "")}</div>
      <div class="vz-grid">${(v.items || []).map((x) => `<span class="vz-folder${x === v.pick ? " hl" : ""}">${FOLDER}<em>${esc(x)}</em>${x === v.pick ? CURSOR : ""}</span>`).join("")}</div>
      <div class="vz-label">ดับเบิลคลิก</div></div>`;
  if (v.kind === "copy") return `<div class="vz vz-copy">
      <div class="vz-explorer mini"><div class="vz-addr">📁 ${esc(v.path || "…")}</div>
        <span class="vz-folder hl">${FOLDER}<em>${esc(v.folder || "โฟลเดอร์กิจกรรม")}</em></span>
        <div class="vz-menu ctx"><span>Open</span><span class="hl">Copy ${CURSOR}</span><span>Rename</span></div></div>
      <div class="vz-arrow">→</div>
      <div class="vz-explorer mini"><div class="vz-addr">🖥 Desktop</div>
        <span class="vz-folder hl">${FOLDER}<em>${esc(v.folder || "โฟลเดอร์กิจกรรม")}</em></span>
        <div class="vz-menu ctx"><span class="hl">Paste</span><span>New</span></div></div></div>`;
  return "";
}

// ---------- สไลด์ 16:9 (สไตล์เดียวกับสไลด์สอนของครูณัฐวุฒิ) ----------
const pad2 = (n) => String(n).padStart(2, "0");
const BLOB = (cls) => `<span class="sl-blob ${cls}" aria-hidden="true"><i></i></span>`;
function slideHtml(p, i, total, m) {
  const by = esc(m.byline || "งานเทคโนโลยีการศึกษา");
  const num = `<span class="sl-pno">${pad2(i + 1)}</span>`;
  const head = (title, n) => `<div class="sl-head">${n ? `<span class="sl-ring">${esc(n)}</span>` : ""}<h3>${md(title)}</h3><span class="sl-by">${by}</span></div>`;
  if (p.type === "cover") return `<div class="sl sl-cover">
      ${BLOB("b1")}${BLOB("b2")}${BLOB("b3")}
      <span class="sl-corner tl">${by}</span>
      <div class="sl-cover-mid"><h2>${md(p.title)}</h2>${p.pill ? `<span class="sl-pill">${md(p.pill)}</span>` : ""}</div>
      ${p.left ? `<span class="sl-corner bl">${md(p.left)}</span>` : ""}${p.right ? `<span class="sl-corner br">${md(p.right)}</span>` : ""}${num}</div>`;
  if (p.type === "overview") return `<div class="sl sl-over">${head(p.title)}
      <div class="sl-over-body"><ol class="sl-olist">${(p.items || []).map((x, k) => `<li><span class="sl-ring">${k + 1}</span><div><b>${md(x.t)}</b><span>${md(x.d)}</span></div></li>`).join("")}</ol>
        ${BLOB("b4")}</div>
      ${p.pills?.length ? `<div class="sl-pills">${p.pills.map((x, k) => `<span class="sl-tag ${k % 2 ? "red" : ""}">${md(x)}</span>`).join("")}</div>` : ""}${num}</div>`;
  if (p.type === "step") return `<div class="sl sl-step">${head(p.title, p.n)}
      <div class="sl-cols">
        <div class="sl-shot"><div class="sl-visual">${visual(p.visual)}</div></div>
        <div class="sl-text"><p class="sl-say">${md(p.text)}</p>
          ${p.fields?.length ? `<div class="sl-fields">${p.fields.map((f) => { const [k, v] = Array.isArray(f) ? f : [f.label, f.value]; return `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`; }).join("")}</div>` : ""}
          ${p.tip ? `<p class="sl-callout"><span aria-hidden="true">💡</span><span><b>เคล็ดลับ:</b> ${md(p.tip)}</span></p>` : ""}</div>
      </div>${num}</div>`;
  if (p.type === "image") return `<div class="sl sl-image">${p.title ? head(p.title) : ""}
      <div class="sl-img"><img src="${esc(p.src)}" alt="${esc(p.caption || p.title || "")}" loading="lazy"></div>
      ${p.caption ? `<p class="sl-cap">${md(p.caption)}</p>` : ""}${num}</div>`;
  if (p.type === "end") {
    const groups = p.groups || [{ title: "", items: p.checklist || [] }];
    let k = 0;
    return `<div class="sl sl-end">${head(p.title || "สรุปขั้นตอน")}
      <div class="sl-cards">${groups.map((g, gi) => `<div class="sl-card"><div class="sl-card-h"><span class="sl-badge ${gi % 2 ? "red" : ""}">${esc(g.icon || "✓")}</span><b>${md(g.title)}</b></div>
        <ol class="sl-dots">${(g.items || []).map((x) => `<li><span class="sl-dot">${++k}</span><span>${md(x)}</span></li>`).join("")}</ol></div>`).join("")}</div>
      ${p.help ? `<p class="sl-callout"><span aria-hidden="true">🙋</span><span>${md(p.help)}</span></p>` : ""}${num}</div>`;
  }
  if (p.type === "pdf") return `<div class="sl sl-pdf" data-pdf="${p.n}"><div class="sl-pdf-load"><span class="spin"></span></div></div>`;
  return `<div class="sl">${num}</div>`;
}
// ฟอนต์หัวข้อแบบสไลด์ต้นฉบับ (Prompt) โหลดเมื่อเปิดหน้าคู่มือ
function loadSlideFont() {
  if (document.getElementById("font-prompt")) return;
  const l = document.createElement("link");
  l.id = "font-prompt"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700;800&display=swap";
  document.head.append(l);
}

// ---------- PDF: โหลด pdf.js เมื่อเปิดใช้งาน ----------
let pdfjs = null;
async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
  }
  return pdfjs;
}
async function renderPdfPage(doc, n, box) {
  if (!box || box.dataset.done) return;
  box.dataset.done = "1";
  const page = await doc.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const W = box.clientWidth || 960, H = box.clientHeight || 540;
  const fit = Math.min(W / vp1.width, H / vp1.height); // ย่อทั้งหน้าให้พอดีสไลด์ (หน้า A4 แนวตั้งจะมีขอบเทาสองข้าง)
  const vp = page.getViewport({ scale: fit * Math.min(2, window.devicePixelRatio || 1) });
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  // ขนาดแสดงผลตามกรอบสไลด์เสมอ (หมุนจอ/ย่อหน้าต่างแล้วยังพอดี) — object-fit กันภาพเพี้ยนถ้าหน้า PDF ขนาดไม่เท่ากัน
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  box.replaceChildren(c);
}

// ---------- ตัวเปิดอ่าน ----------
async function openBook(host, m, onClose) {
  let pages = m.pages || [], pdfDoc = null, ratio = 16 / 9; // สไลด์ที่ออกแบบไว้ = 16:9 · PDF = ตามขนาดหน้าของไฟล์ (เช่น A4 แนวตั้ง)
  if (m.kind === "pdf") {
    host.innerHTML = `<div class="loading"><span class="spin"></span>กำลังเปิดไฟล์ PDF…</div>`;
    const [lib, blob] = await Promise.all([loadPdfJs(), store.getFileBlob(m.file)]);
    pdfDoc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    pages = Array.from({ length: pdfDoc.numPages }, (_, k) => ({ type: "pdf", n: k + 1 }));
    const v1 = (await pdfDoc.getPage(1)).getViewport({ scale: 1 });
    ratio = v1.width / v1.height;
  }
  let cur = 0;
  host.innerHTML = `<div class="book">
      <div class="book-bar"><button class="btn ghost sm" data-close>← คู่มือทั้งหมด</button>
        <b class="book-title">${esc(m.title)}</b><span class="book-count"></span>
        <button class="icon-btn" data-full title="เต็มจอ" aria-label="เต็มจอ">⛶</button></div>
      <div class="book-stage">
        <button class="book-nav prev" data-prev aria-label="สไลด์ก่อนหน้า">‹</button>
        <div class="book-viewport"><div class="book-track">${pages.map((p, i) => `<section class="book-page" aria-label="สไลด์ ${i + 1}">${slideHtml(p, i, pages.length, m)}</section>`).join("")}</div></div>
        <button class="book-nav next" data-next aria-label="สไลด์ถัดไป">›</button>
      </div>
      <p class="book-hint">📱 หมุนโทรศัพท์เป็นแนวนอน หรือกด ⛶ เพื่ออ่านแบบเต็มจอ</p>
      <div class="book-thumbs">${pages.map((p, i) => `<button class="thumb" data-go="${i}" aria-label="ไปสไลด์ ${i + 1}">${p.type === "pdf" ? `<span class="thumb-n">${i + 1}</span>` : `<span class="thumb-in">${slideHtml(p, i, pages.length, m)}</span>`}</button>`).join("")}</div>
    </div>`;
  const book = $(".book", host), track = $(".book-track", host), count = $(".book-count", host);
  book.style.setProperty("--ar", ratio);
  book.classList.toggle("portrait", ratio < 1);
  const go = (i) => {
    cur = Math.max(0, Math.min(pages.length - 1, i));
    track.style.transform = `translateX(${-cur * 100}%)`;
    count.textContent = `${cur + 1} / ${pages.length}`;
    $$("[data-go]", host).forEach((b, k) => b.classList.toggle("on", k === cur));
    const t = $(".thumb.on", host), strip = $(".book-thumbs", host);
    if (t && strip) strip.scrollTo({ left: t.offsetLeft - strip.clientWidth / 2 + t.clientWidth / 2, behavior: "smooth" });
    $("[data-prev]", host).disabled = cur === 0;
    $("[data-next]", host).disabled = cur === pages.length - 1;
    if (pdfDoc) for (const k of [cur, cur + 1, cur - 1]) {
      if (k >= 0 && k < pages.length) renderPdfPage(pdfDoc, k + 1, $(`[data-pdf="${k + 1}"]`, host)).catch(console.error);
    }
  };
  $("[data-prev]", host).onclick = () => go(cur - 1);
  $("[data-next]", host).onclick = () => go(cur + 1);
  $$("[data-go]", host).forEach((b) => (b.onclick = () => go(+b.dataset.go)));
  $("[data-close]", host).onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); onClose(); };
  $("[data-full]", host).onclick = () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (book.requestFullscreen) book.requestFullscreen().catch(() => book.classList.toggle("pseudo-full"));
    else book.classList.toggle("pseudo-full"); // iPhone ไม่รองรับเต็มจอ ใช้การขยายเต็มหน้าแทน
  };
  // ปัดซ้าย/ขวา (มือถือ/ทัชแพด)
  const vp = $(".book-viewport", host);
  let x0 = null, y0 = 0;
  vp.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; });
  vp.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1));
  });
  const onKey = (e) => {
    if (!document.body.contains(book)) return document.removeEventListener("keydown", onKey);
    if (e.target.closest?.("input, textarea, select")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(cur + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(cur - 1); }
  };
  document.addEventListener("keydown", onKey);
  go(0);
}

// ---------- พนักงานโสต: เพิ่มคู่มือจากไฟล์ PDF ----------
function pdfForm({ openModal, toast, fail, done }) {
  const m = openModal("เพิ่มคู่มือ (PDF)", `<form class="form" id="mf" novalidate style="grid-template-columns:1fr">
      <label class="f"><span>ชื่อคู่มือ *</span><input class="inp" name="title" required maxlength="120"></label>
      <label class="f"><span>คำอธิบายสั้น ๆ</span><input class="inp" name="subtitle" maxlength="160"></label>
      <label class="f"><span>ผู้ที่เห็นคู่มือนี้ *</span><select class="inp" name="audience">
        <option value="teacher">เฉพาะครูและบุคลากร</option><option value="all">ทุกคน (รวมนักเรียน)</option></select></label>
      <label class="f"><span>ไฟล์ PDF * <small>(ไม่เกิน ${PDF_MAX_MB} MB · 1 หน้า = 1 สไลด์)</small></span><input class="inp" type="file" name="file" accept="application/pdf,.pdf" required></label>
      <div class="form-actions"><button type="button" class="btn ghost" data-x>ยกเลิก</button><button class="btn" type="submit">อัปโหลด</button></div></form>`);
  const f = $("#mf", m.el);
  $("[data-x]", m.el).onclick = m.dismiss;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const file = f.elements.file.files[0];
    if (!file || !/pdf$/i.test(file.type || file.name)) return toast("กรุณาเลือกไฟล์ PDF", true);
    const btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "กำลังอัปโหลด…";
    try {
      const audience = f.elements.audience.value;
      const meta = await store.saveFile(file, { coll: "manualFiles", extra: { audience }, maxMB: PDF_MAX_MB });
      await store.add("manuals", { kind: "pdf", title: f.elements.title.value.trim(), subtitle: f.elements.subtitle.value.trim(), audience, icon: "📄", order: 50, file: meta, createdAt: Date.now() });
      m.close(); toast("เพิ่มคู่มือแล้ว"); done();
    } catch (err) { btn.disabled = false; btn.textContent = "อัปโหลด"; fail(err); }
  };
}

export async function manualsPage(el, { params, fail, toast, openModal, user, staff }) {
  loadSlideFont();
  el.innerHTML = `<div class="wrap"><div class="page-head head-row"><div><h1>คู่มือการใช้งาน</h1><p>คู่มือและเอกสารจากงานเทคโนโลยีการศึกษา เปิดอ่านเป็นสไลด์ทีละหน้า ทั้งบนคอมและมือถือ</p></div>
      ${staff ? `<button class="btn" id="m-add">＋ เพิ่มคู่มือ (PDF)</button>` : ""}</div></div>
    <section class="band"><div class="wrap" style="padding-top:24px;padding-bottom:56px"><div id="mn"></div></div></section>`;
  const host = $("#mn", el);
  let list = [];
  // ต้องกรองตาม audience ตั้งแต่ตอนค้นหา (กฎฐานข้อมูลไม่ให้อ่านรายการที่ไม่มีสิทธิ์)
  const load = async () => {
    const rows = staff ? await store.list("manuals")
      : user?.type === "teacher" ? await store.query("manuals", { inq: ["audience", ["all", "teacher"]] })
      : await store.query("manuals", { eq: ["audience", "all"] });
    list = rows.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || (b.createdAt || 0) - (a.createdAt || 0));
  };
  const showList = () => {
    el.classList.remove("reading");
    host.innerHTML = list.length ? `<div class="mn-grid">${list.map((m) => `<div class="mn-card" data-id="${esc(m.id)}" role="button" tabindex="0">
        <span class="mn-cover${m.kind === "pdf" ? " pdf" : ""}"><span class="mn-ico">${esc(m.icon || "📘")}</span><span class="mn-pages">${m.kind === "pdf" ? "PDF" : `${(m.pages || []).length} สไลด์`}</span></span>
        <span class="mn-body"><b>${esc(m.title)}</b>${m.subtitle ? `<span>${esc(m.subtitle)}</span>` : ""}<em>สำหรับ${esc(AUD[m.audience] || AUD.teacher)}</em></span>
        <span class="mn-foot"><span class="mn-open">เปิดอ่าน →</span>${staff && m.kind === "pdf" ? `<button class="linkbtn danger" data-del="${esc(m.id)}">ลบ</button>` : ""}</span></div>`).join("")}</div>`
      : `<div class="empty">ยังไม่มีคู่มือ</div>`;
    $$("[data-id]", host).forEach((c) => {
      const openIt = (e) => { if (e.target.closest("[data-del]")) return; history.replaceState(null, "", `#/manuals?id=${encodeURIComponent(c.dataset.id)}`); open(c.dataset.id); };
      c.onclick = openIt; c.onkeydown = (e) => e.key === "Enter" && openIt(e);
    });
    $$("[data-del]", host).forEach((b) => (b.onclick = async () => {
      const m = list.find((x) => x.id === b.dataset.del);
      if (!m || !confirm(`ลบคู่มือ "${m.title}" ?\nไฟล์ PDF จะถูกลบด้วย และกู้คืนไม่ได้`)) return;
      try { if (m.file) await store.removeFile(m.file); await store.remove("manuals", m.id); toast("ลบคู่มือแล้ว"); await load(); showList(); } catch (e) { fail(e); }
    }));
  };
  const open = (id) => {
    const m = list.find((x) => x.id === id);
    if (!m) return showList();
    el.classList.add("reading");
    window.scrollTo(0, 0);
    openBook(host, m, () => { history.replaceState(null, "", "#/manuals"); showList(); }).catch((e) => { fail(e); showList(); });
  };
  if (staff) $("#m-add", el).onclick = () => pdfForm({ openModal, toast, fail, done: async () => { await load(); showList(); } });
  await load();
  const id = params?.get("id");
  if (id && list.some((x) => x.id === id)) open(id); else showList();
}
