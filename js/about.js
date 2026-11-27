// ============================================================
//  หน้าข้อมูลภายนอก (ดูได้โดยไม่ต้องเข้าสู่ระบบ)
//  แก้ไขรายชื่อบุคลากร ภาระหน้าที่ และช่องทางติดต่อได้ที่ ABOUT ด้านล่าง
//  รูปบุคลากร: วางไฟล์ไว้ที่ img/staff/ แล้วใส่ photo: "img/staff/ชื่อไฟล์.jpg"
// ============================================================
export const ABOUT = {
  unit: "งานเทคโนโลยีการศึกษา",
  school: "โรงเรียนสามเสนวิทยาลัย",
  intro: "ดูแลสื่อ เทคโนโลยี และโสตทัศนูปกรณ์ของโรงเรียน ทั้งงานถ่ายภาพ วีดิทัศน์ ถ่ายทอดสด ห้องประชุม และเครื่องเสียง เพื่อสนับสนุนการเรียนรู้และกิจกรรมของโรงเรียน",
  head: { name: "นายสุชาติ กิจดี", role: "หัวหน้างานเทคโนโลยีการศึกษา", photo: "" },
  staff: [
    { name: "นายชาตรี อุลิศ", role: "บุคลากรงานเทคโนโลยีการศึกษา", photo: "" },
    { name: "นายณัฐวุฒิ คงดีเพียร", role: "บุคลากรงานเทคโนโลยีการศึกษา", photo: "" },
    { name: "นายชยุต ธันย์ชีว", role: "บุคลากรงานเทคโนโลยีการศึกษา", photo: "" },
  ],
  services: [
    ["📷", "ถ่ายภาพและวีดิทัศน์", "บันทึกภาพนิ่ง ภาพเคลื่อนไหว และผลิตสื่อวีดิทัศน์กิจกรรมของโรงเรียน"],
    ["📡", "ถ่ายทอดสด", "ถ่ายทอดสดกิจกรรมภายในโรงเรียนผ่านจอ LED หน้าอาคาร 3"],
    ["🎙️", "ห้องประชุมและเครื่องเสียง", "ดูแลห้องประชุม เครื่องเสียง และโสตทัศนูปกรณ์ให้พร้อมใช้งาน"],
    ["🛠️", "ซ่อมบำรุงอุปกรณ์", "ซ่อมบำรุงโสตทัศนูปกรณ์และเครื่องอิเล็กทรอนิกส์ภายในโรงเรียน"],
  ],
  // ภาระหน้าที่ (ตามคำสั่งโรงเรียน) จัดกลุ่มเพื่ออ่านง่าย เลขข้อคงตามต้นฉบับ
  duties: [
    { icon: "🗂️", title: "วางแผนและบริหารงาน", items: [
      [1, "จัดทำแผนปฏิบัติงาน/โครงการโสตทัศนศึกษาประจำปีและปฏิบัติตามแผนงาน/โครงการ พร้อมจัดทำแฟ้มสะสมงาน เพื่อเป็นแนวทางในการพัฒนางานต่อไป"],
      [9, "ดูแล และประสานงานกับหน่วยงานต่าง ๆ ด้านการควบคุมบัญชี วัสดุ ครุภัณฑ์ โสตทัศนศึกษาภายในโรงเรียนทั้งหมดให้เป็นปัจจุบัน"],
      [11, "ประสานการจัดซื้อฝ่ายพัสดุครุภัณฑ์ ทำเอกสารการเบิก – จ่ายพัสดุ ทำทะเบียนคุมพัสดุครุภัณฑ์ของงานเทคโนโลยีการศึกษา"],
      [13, "ติดตาม ประเมินผลและสรุปรายงานการปฏิบัติงานส่งฝ่ายบริหารทั่วไปและผู้อำนวยการ"],
      [14, "ปฏิบัติหน้าที่อื่น ๆ ตามที่ได้รับมอบหมาย"],
    ] },
    { icon: "🎬", title: "สื่อและการผลิต", items: [
      [2, "สนับสนุนการบริการสื่อ เทคโนโลยี วัสดุ-อุปกรณ์ในการผลิต และการใช้สื่อประกอบการจัดการเรียนรู้"],
      [3, "สนับสนุน ผลิต ตัดต่อ จัดทำสื่อวีดิทัศน์เพื่อสนับสนุนการจัดการเรียนรู้"],
      [4, "ถ่ายภาพนิ่ง บันทึกภาพเคลื่อนไหวสำหรับจัดทำวีดิทัศน์เกี่ยวกับกิจกรรมต่าง ๆ ของทางโรงเรียน"],
      [8, "ดำเนินการจัดหาสื่อเทคโนโลยี เพื่อส่งเสริมการเรียนรู้ และการศึกษาค้นคว้าด้วยตนเอง"],
    ] },
    { icon: "🎤", title: "กิจกรรมและการถ่ายทอด", items: [
      [5, "ถ่ายทอดสดกิจกรรมภายในโรงเรียนผ่านจอ LED บริเวณหน้าอาคาร 3"],
      [6, "ให้ความร่วมมือกับงานประชาสัมพันธ์ ในการจัดบอร์ดแสดงภาพ ในกิจกรรมที่เกี่ยวข้องในกิจกรรมต่าง ๆ ของทางโรงเรียน"],
      [12, "เปิด – ปิดเครื่องเสียงกิจกรรมหน้าเสาธงตอนเช้า"],
    ] },
    { icon: "🔧", title: "ห้องประชุมและซ่อมบำรุง", items: [
      [7, "บริการและดูแลการใช้ห้องประชุมต่าง ๆ รวมถึงโสตทัศนูปกรณ์ ให้เป็นปัจจุบัน และอยู่ในสภาพที่พร้อมใช้งาน"],
      [10, "ดูแลและดำเนินการซ่อมบำรุงโสตทัศนูปกรณ์ เครื่องขยายเสียง และเครื่องอิเล็กทรอนิกส์ภายในโรงเรียนให้ใช้งานได้ตลอดเวลา"],
    ] },
  ],
  contact: { place: "ห้องทวีวิชา (โสตทัศนศึกษา)", building: "อาคาร 3 ชั้น 3", map: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("โรงเรียนสามเสนวิทยาลัย") },
  socials: [
    { key: "fb", name: "Facebook", handle: "samsenphoto", url: "https://www.facebook.com/samsenphoto/?locale=th_TH" },
    { key: "ig", name: "Instagram", handle: "@samsen.photo", url: "https://www.instagram.com/samsen.photo/" },
    { key: "tt", name: "TikTok", handle: "@samsen_photo", url: "https://www.tiktok.com/@samsen_photo" },
  ],
};

const ICONS = {
  fb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21h3z"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="3.9" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.1" cy="6.9" r="1.15" fill="currentColor"/></svg>`,
  tt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.6 3c.3 2.3 1.6 3.8 3.9 4v2.7c-1.4.1-2.6-.3-3.9-1.1v5.6c0 3.6-2.7 6-6 6-3.2 0-5.6-2.5-5.6-5.6 0-3.4 3-6 6.6-5.5v2.9c-1.7-.4-3.6.6-3.6 2.6 0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.9-1 2.9-3.2V3h3z"/></svg>`,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// อักษรย่อจากชื่อจริง (ตัดคำนำหน้า)
const initial = (n) => (String(n).replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, "").trim()[0] || "?");

function person(p, lead) {
  const pic = p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : `<span aria-hidden="true">${esc(initial(p.name))}</span>`;
  return `<figure class="ab-person${lead ? " lead" : ""}"><div class="ab-pic">${pic}</div>
    <figcaption><b>${esc(p.name)}</b><span>${esc(p.role)}</span></figcaption></figure>`;
}

export function aboutPage(el, { loggedIn, section } = {}) {
  const A = ABOUT;
  el.innerHTML = `
  <section class="ab-hero">
    <div class="wrap">
      <img class="ab-logo" src="img/logo.png" alt="ตราโรงเรียนสามเสนวิทยาลัย" width="290" height="341">
      <div class="eyebrow">${esc(A.school)}</div>
      <h1>${esc(A.unit)}</h1>
      <p class="lead">${esc(A.intro)}</p>
      <div class="hero-actions">
        ${loggedIn ? `<a class="btn lg" href="#/">ไปที่ระบบยืม-คืนอุปกรณ์</a>` : `<a class="btn lg" href="#/login">เข้าสู่ระบบ</a>`}
        <a class="btn lg ghost" href="#/?s=contact" data-jump="contact">ติดต่อเรา</a>
      </div>
      <div class="ab-social-row">${A.socials.map((s) => `<a class="ab-sbtn ${s.key}" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.name)} ${esc(s.handle)}">${ICONS[s.key]}</a>`).join("")}</div>
    </div>
  </section>

  <section class="band"><div class="wrap ab-sec">
    <div class="ab-services">${A.services.map(([i, t, d]) => `<div class="ab-svc"><span class="ico">${i}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
  </div></section>

  <section id="ab-staff"><div class="wrap ab-sec">
    <div class="ab-head"><span class="ab-kicker">บุคลากร</span><h2>บุคลากร${esc(A.unit)}</h2></div>
    <div class="ab-org">
      ${person(A.head, true)}
      <div class="ab-team">${A.staff.map((p) => person(p)).join("")}</div>
    </div>
  </div></section>

  <section id="ab-duties" class="band"><div class="wrap ab-sec">
    <div class="ab-head"><span class="ab-kicker">ภาระหน้าที่</span><h2>หน้าที่และภาระงาน</h2></div>
    <div class="ab-duties">${A.duties.map((g) => `<div class="ab-dgroup"><h3><span>${g.icon}</span>${esc(g.title)}</h3>
      <ol>${g.items.map(([n, t]) => `<li><b>${n}</b><span>${esc(t)}</span></li>`).join("")}</ol></div>`).join("")}</div>
  </div></section>

  <section id="ab-contact"><div class="wrap ab-sec">
    <div class="ab-head"><span class="ab-kicker">ติดต่อ</span><h2>ติดต่อเรา</h2></div>
    <div class="ab-contact">
      <div class="ab-place">
        <span class="ico" aria-hidden="true">📍</span>
        <div><b>${esc(A.contact.place)}</b><p>${esc(A.contact.building)}<br>${esc(A.school)}</p>
        <a class="btn ghost sm" href="${esc(A.contact.map)}" target="_blank" rel="noopener">เปิดแผนที่ ↗</a></div>
      </div>
      <div class="ab-socials">${A.socials.map((s) => `<a class="ab-social ${s.key}" href="${esc(s.url)}" target="_blank" rel="noopener">
        <span class="ab-sico">${ICONS[s.key]}</span><span><b>${esc(s.name)}</b><small>${esc(s.handle)}</small></span><i aria-hidden="true">↗</i></a>`).join("")}</div>
    </div>
  </div></section>`;

  const jump = (id) => { const t = el.querySelector("#ab-" + id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); };
  el.querySelectorAll("[data-jump]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); jump(a.dataset.jump); }));
  if (section) setTimeout(() => jump(section), 60);
}
