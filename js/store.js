// ชั้นจัดการข้อมูล — มี 2 แบบ ใช้หน้าตาเดียวกัน
//   1) โหมดตัวอย่าง (localStorage)   : ใช้เมื่อยังไม่ได้ใส่ค่า Firebase ใน config.js
//   2) Firebase (Auth + Firestore)   : ใช้งานจริง
import { CONFIG, DEFAULT_ROOMS, DEPARTMENTS, PURPOSES, SERVICES, EQUIPMENT, BUDGET_PROJECTS } from "./config.js";
import { ymd, addDays, today, calendarEvent } from "./util.js";

export const isDemo = !CONFIG.firebase.apiKey || CONFIG.firebase.apiKey === "PASTE_HERE";

const MAX_BYTES = CONFIG.maxFileMB * 1024 * 1024;

// ย่อรูปภาพก่อนเก็บ เพื่อประหยัดพื้นที่
async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || file.size < 400 * 1024 || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
function checkSize(file) {
  if (file.size > MAX_BYTES) throw new Error(`ไฟล์ "${file.name}" ใหญ่เกิน ${CONFIG.maxFileMB} MB`);
}

// ============================================================
//  โหมดตัวอย่าง
// ============================================================
function demoStore() {
  const KEY = "sode-samsen-demo-v1";
  const memFiles = new Map(); // ไฟล์แนบในโหมดตัวอย่างเก็บในหน่วยความจำ (หายเมื่อรีเฟรช)
  let data = null;
  let listener = () => {};
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const USERS = {
    staff: { uid: "demo-staff", name: "พนักงานโสต (ตัวอย่าง)", email: "staff@example.com", photo: "", role: "staff" },
    user: { uid: "demo-teacher", name: "ครูผู้ขอใช้บริการ (ตัวอย่าง)", email: "teacher@example.com", photo: "", role: "user" },
  };

  function seed() {
    let s = 20261116;
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const some = (a, p) => a.filter(() => rnd() < p);
    const rooms = DEFAULT_ROOMS.map((r, i) => ({ id: "room" + (i + 1), ...r, active: true, order: i }));
    const titles = ["ประชุมกลุ่มสาระฯ", "สอนเสริม ม.1", "อบรมเชิงปฏิบัติการ", "ประชุมผู้ปกครอง", "วิชาเลือก ม.4", "ต้อนรับคณะศึกษาดูงาน", "ประชุมครูประจำเดือน", "ชุมนุมโสตทัศนศึกษา", "สอบเก็บคะแนน", "กิจกรรมแนะแนวศึกษาต่อ", "ประชุมคณะกรรมการนักเรียน", "ถ่ายทอดสดพิธีมอบรางวัล", "สัมมนาวิชาการ", "ซ้อมพิธีการ"];
    const slots = [["08:10", "09:50"], ["09:50", "11:30"], ["12:20", "14:00"], ["13:10", "15:00"], ["15:00", "16:30"], ["08:30", "12:00"]];
    const bookings = [], contacts = [];
    const t = today();
    for (let d = addDays(t, -110); d <= addDays(t, 24); d = addDays(d, 1)) {
      const wd = new Date(d + "T00:00").getDay();
      if (wd === 0 || wd === 6) { if (rnd() > 0.12) continue; }
      const n = 1 + Math.floor(rnd() * 4);
      const used = new Set();
      for (let i = 0; i < n; i++) {
        const room = pick(rooms), [start, end] = pick(slots), k = room.id + start;
        if (used.has(k)) continue;
        used.add(k);
        const id = uid(), mine = rnd() < 0.18;
        const future = d >= t;
        const r = rnd();
        const status = future ? (r < 0.45 ? "pending" : "approved") : r < 0.9 ? "approved" : r < 0.95 ? "rejected" : "cancelled";
        bookings.push({
          id, uid: mine ? USERS.user.uid : "demo-other", requester: mine ? USERS.user.name : pick(["ครูสมชาย", "ครูวิภา", "ครูอนันต์", "ครูพิมพ์ชนก", "ครูธนากร"]),
          title: pick(titles), roomId: room.id, roomName: room.name, date: d, start, end,
          department: pick(DEPARTMENTS), purpose: pick(PURPOSES), services: some(SERVICES, 0.3), equipment: some(EQUIPMENT, 0.45),
          attendees: 10 + Math.floor(rnd() * 120), note: "", status, reason: status === "rejected" ? "ห้องไม่ว่างในช่วงเวลาดังกล่าว" : "",
          createdAt: Date.parse(d) - 3 * 864e5,
        });
        contacts.push({ id, uid: mine ? USERS.user.uid : "demo-other", phone: "08" + Math.floor(10000000 + rnd() * 89999999), email: "", date: d });
      }
    }
    const P = BUDGET_PROJECTS;
    const mk = (o) => ({ id: uid(), fiscalYear: 2570, files: [], note: "", createdAt: Date.now(), ...o });
    const budget = [
      mk({ project: P[0].project, activity: P[0].activities[1], item: "ซื้อเครื่องปริ้นเตอร์", category: "ครุภัณฑ์", fundType: "รายได้สถานศึกษา", amount: 20000, date: "2026-10-14", recorder: "สุชาติ" }),
      mk({ project: P[1].project, activity: P[1].activities[0], item: "เปลี่ยนไส้กรองตู้กดน้ำร้อน-เย็น", category: "วัสดุ", fundType: "รายได้สถานศึกษา", amount: 3584.5, date: "2026-10-28", recorder: "สุชาติ" }),
      mk({ project: P[1].project, activity: P[1].activities[0], item: "ซ่อมบำรุงระบบจอ LED ห้องโสต (งบเหลือจ่าย)", category: "จ้าง", fundType: "รายได้เหลือจ่าย", amount: 497550, date: "2026-11-05", recorder: "สุชาติ" }),
    ];
    return { role: "staff", signedIn: false, users: Object.values(USERS), rooms, bookings, bookingContacts: contacts, budget };
  }
  const load = () => {
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
    if (!data) { data = seed(); save(); }
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
  const current = () => (data.signedIn ? { ...data.users.find((u) => u.uid === USERS[data.role].uid) } : null);

  return {
    async init() { load(); },
    onAuth(cb) { listener = cb; cb(current()); },
    async signIn() { data.signedIn = true; save(); listener(current()); },
    async signOut() { data.signedIn = false; save(); listener(null); },
    demoRole: () => data.role,
    setDemoRole(r) { data.role = r; save(); listener(current()); },
    resetDemo() { localStorage.removeItem(KEY); load(); listener(current()); },
    async get(coll, id) { const r = (data[coll] || []).find((x) => x.id === id); return r ? structuredClone(r) : null; },
    async list(coll) { return structuredClone(data[coll] || []); },
    async query(coll, { eq, range } = {}) {
      let rows = data[coll] || [];
      if (eq) rows = rows.filter((r) => r[eq[0]] === eq[1]);
      if (range) rows = rows.filter((r) => r[range[0]] >= range[1] && r[range[0]] <= range[2]);
      return structuredClone(rows);
    },
    async add(coll, obj) { const id = uid(); (data[coll] ||= []).push({ ...obj, id }); save(); return id; },
    async set(coll, id, obj) {
      const arr = (data[coll] ||= []), i = arr.findIndex((r) => r.id === id);
      if (i >= 0) arr[i] = { ...obj, id }; else arr.push({ ...obj, id });
      save();
    },
    async update(coll, id, patch) { const r = (data[coll] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); save(); },
    async remove(coll, id) { data[coll] = (data[coll] || []).filter((r) => r.id !== id); save(); },
    async saveFile(file) {
      file = await shrinkImage(file); checkSize(file);
      const id = uid(); memFiles.set(id, file);
      return { id, name: file.name, type: file.type, size: file.size };
    },
    async getFileBlob(meta) {
      const f = memFiles.get(meta.id);
      if (!f) throw new Error("โหมดตัวอย่างเก็บไฟล์แนบไว้ชั่วคราวเท่านั้น (หายเมื่อรีเฟรชหน้า) — เมื่อเชื่อม Firebase แล้วไฟล์จะถูกเก็บถาวร");
      return f;
    },
    async removeFile(meta) { memFiles.delete(meta.id); },
    // ปฏิทินจำลอง (โหมดตัวอย่างไม่ได้เขียนลง Google Calendar จริง)
    calendar: {
      enabled: true, demo: true,
      connected: () => true,
      async connect() {},
      async insert() { return "demo-" + uid(); },
      async list() { return []; },
      async remove() {},
    },
  };
}

// ============================================================
//  Firebase
// ============================================================
function firebaseStore() {
  const V = "10.12.2";
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  let A, F, auth, db;
  const CHUNK = 900 * 1024; // เอกสาร Firestore จำกัด 1 MB จึงแบ่งไฟล์เป็นชิ้น

  const rows = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));

  // ----- Google Calendar: ใช้สิทธิ์ของพนักงานโสตที่ล็อกอินอยู่ (โทเคนอายุราว 1 ชั่วโมง) -----
  const CAL_ID = CONFIG.calendar?.calendarId || "";
  const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
  const TOK_KEY = "sode-cal-token";
  let tok = null;
  try { tok = JSON.parse(sessionStorage.getItem(TOK_KEY)); } catch {}
  const tokValid = () => !!tok && tok.uid === auth?.currentUser?.uid && tok.exp > Date.now() + 60000;
  const clearTok = () => { tok = null; try { sessionStorage.removeItem(TOK_KEY); } catch {} };
  async function calConnect() {
    const p = new A.GoogleAuthProvider();
    p.addScope(CAL_SCOPE);
    p.setCustomParameters({ login_hint: auth.currentUser.email || "" });
    const res = await A.reauthenticateWithPopup(auth.currentUser, p);
    const cred = A.GoogleAuthProvider.credentialFromResult(res);
    if (!cred?.accessToken) throw new Error("ไม่ได้รับสิทธิ์เข้าถึงปฏิทิน");
    tok = { t: cred.accessToken, exp: Date.now() + 55 * 60000, uid: auth.currentUser.uid };
    try { sessionStorage.setItem(TOK_KEY, JSON.stringify(tok)); } catch {}
  }
  async function calApi(method, path, body, retry = true) {
    if (!tokValid()) await calConnect();
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events${path}`, {
      method, headers: { Authorization: `Bearer ${tok.t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && retry) { clearTok(); return calApi(method, path, body, false); }
    return r;
  }
  const calError = (status) =>
    status === 403 ? "บัญชีนี้ไม่มีสิทธิ์แก้ไขปฏิทินงานโสตฯ หรือยังไม่ได้อนุญาตสิทธิ์ปฏิทินตอนล็อกอิน (ดูคู่มือ ขั้นที่ 8)"
    : status === 404 ? "ไม่พบปฏิทิน — ตรวจสอบ calendarId ใน config.js และการแชร์ปฏิทิน"
    : `Google Calendar ตอบกลับข้อผิดพลาด ${status}`;
  const calendar = {
    enabled: !!CAL_ID, demo: false,
    connected: tokValid,
    connect: calConnect,
    async insert(b) {
      const r = await calApi("POST", "", calendarEvent(b));
      if (!r.ok) throw new Error(calError(r.status));
      return (await r.json()).id;
    },
    // อ่านนัดหมายทั้งหมดในช่วงวันที่ (เวลาเป็นเขตเวลาไทย)
    async list(from, to) {
      const out = [];
      let pageToken = "";
      do {
        const qs = new URLSearchParams({
          timeMin: `${from}T00:00:00+07:00`, timeMax: `${to}T23:59:59+07:00`, singleEvents: "true", orderBy: "startTime",
          maxResults: "250", timeZone: "Asia/Bangkok", ...(pageToken ? { pageToken } : {}),
        });
        const r = await calApi("GET", "?" + qs);
        if (!r.ok) throw new Error(calError(r.status));
        const j = await r.json();
        out.push(...(j.items || []));
        pageToken = j.nextPageToken || "";
      } while (pageToken);
      return out;
    },
    async remove(eventId) {
      const r = await calApi("DELETE", "/" + encodeURIComponent(eventId));
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(calError(r.status));
    },
  };

  return {
    calendar,
    async init() {
      const [appM, authM, fsM] = await Promise.all([
        import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
      ]);
      A = authM; F = fsM;
      const app = appM.initializeApp(CONFIG.firebase);
      auth = A.getAuth(app);
      db = F.getFirestore(app);
    },
    onAuth(cb) {
      A.onAuthStateChanged(auth, async (u) => {
        if (!u) return cb(null);
        try {
          if (CONFIG.allowedDomain && !(u.email || "").toLowerCase().endsWith("@" + CONFIG.allowedDomain.toLowerCase())) {
            await A.signOut(auth);
            return cb(null, new Error(`กรุณาใช้อีเมล @${CONFIG.allowedDomain} ในการเข้าสู่ระบบ`));
          }
          const ref = F.doc(db, "users", u.uid);
          const snap = await F.getDoc(ref);
          let role = "user";
          if (!snap.exists()) {
            await F.setDoc(ref, { name: u.displayName || "", email: u.email || "", photo: u.photoURL || "", role: "user", createdAt: Date.now() });
          } else role = snap.data().role || "user";
          cb({ uid: u.uid, name: u.displayName || u.email, email: u.email, photo: u.photoURL || "", role });
        } catch (e) { cb(null, e); }
      });
    },
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account", ...(CONFIG.allowedDomain ? { hd: CONFIG.allowedDomain } : {}) });
      await A.signInWithPopup(auth, p);
    },
    async signOut() { clearTok(); await A.signOut(auth); },
    async get(coll, id) { const s = await F.getDoc(F.doc(db, coll, id)); return s.exists() ? { ...s.data(), id: s.id } : null; },
    async list(coll) { return rows(await F.getDocs(F.collection(db, coll))); },
    async query(coll, { eq, range } = {}) {
      const c = [];
      if (eq) c.push(F.where(eq[0], "==", eq[1]));
      if (range) c.push(F.where(range[0], ">=", range[1]), F.where(range[0], "<=", range[2]));
      return rows(await F.getDocs(F.query(F.collection(db, coll), ...c)));
    },
    async add(coll, obj) { return (await F.addDoc(F.collection(db, coll), obj)).id; },
    async set(coll, id, obj) { await F.setDoc(F.doc(db, coll, id), obj); },
    async update(coll, id, patch) { await F.updateDoc(F.doc(db, coll, id), patch); },
    async remove(coll, id) { await F.deleteDoc(F.doc(db, coll, id)); },
    async saveFile(file) {
      file = await shrinkImage(file); checkSize(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
      const ref = await F.addDoc(F.collection(db, "files"), { name: file.name, type: file.type, size: file.size, chunks: n, uid: auth.currentUser.uid, createdAt: Date.now() });
      for (let i = 0; i < n; i++) {
        await F.setDoc(F.doc(db, "files", ref.id, "chunks", String(i)), { i, data: F.Bytes.fromUint8Array(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
      }
      return { id: ref.id, name: file.name, type: file.type, size: file.size };
    },
    async getFileBlob(meta) {
      const snap = await F.getDocs(F.collection(db, "files", meta.id, "chunks"));
      const parts = snap.docs.map((d) => d.data()).sort((a, b) => a.i - b.i).map((d) => d.data.toUint8Array());
      if (!parts.length) throw new Error("ไม่พบไฟล์");
      return new Blob(parts, { type: meta.type || "application/octet-stream" });
    },
    async removeFile(meta) {
      const snap = await F.getDocs(F.collection(db, "files", meta.id, "chunks"));
      await Promise.all(snap.docs.map((d) => F.deleteDoc(d.ref)));
      await F.deleteDoc(F.doc(db, "files", meta.id));
    },
  };
}

export const store = isDemo ? demoStore() : firebaseStore();
