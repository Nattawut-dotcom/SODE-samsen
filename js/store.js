// ชั้นจัดการข้อมูล — มี 2 แบบ ใช้หน้าตาเดียวกัน
//   1) โหมดตัวอย่าง (localStorage)   : ใช้เมื่อยังไม่ได้ใส่ค่า Firebase ใน config.js (หรือเปิด localhost พร้อม ?demo=1)
//   2) Firebase (Auth + Firestore)   : ใช้งานจริง
import { CONFIG, PURPOSES, DEFAULT_ITEMS, BUDGET_PROJECTS } from "./config.js";
import { addDays, today, calendarEvent } from "./util.js";

const forceDemo = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]demo=1\b/.test(location.search);
export const isDemo = forceDemo || !CONFIG.firebase.apiKey || CONFIG.firebase.apiKey === "PASTE_HERE";

const MAX_BYTES = CONFIG.maxFileMB * 1024 * 1024;

// ชื่อผู้ใช้ → อีเมลภายในระบบ (Firebase ต้องการรูปแบบอีเมล ผู้ใช้ไม่ต้องเห็นส่วนนี้)
export const USER_DOMAIN = "users.sode-samsen-room.web.app";
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const toEmail = (u) => `${String(u).trim().toLowerCase()}@${USER_DOMAIN}`;
export const isUsernameEmail = (e) => String(e || "").toLowerCase().endsWith("@" + USER_DOMAIN);

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

const BANNED_MSG = "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อพนักงานโสต";
// ข้อมูลโปรไฟล์ที่ผู้ใช้แก้เองได้
const PROFILE_KEYS = ["name", "type", "classroom", "studentNo", "studentId", "department", "phone"];
const pickProfile = (p = {}) => Object.fromEntries(PROFILE_KEYS.map((k) => [k, String(p[k] ?? "").trim()]));

function toUser(id, d) {
  return {
    uid: id, name: d.name || d.username || d.email || "ผู้ใช้", email: d.email || "", username: d.username || "", photo: d.photo || "",
    role: d.role || "user", type: d.type || "", classroom: d.classroom || "", studentNo: d.studentNo || "", studentId: d.studentId || "",
    department: d.department || "", phone: d.phone || "", banned: !!d.banned,
  };
}

// ============================================================
//  โหมดตัวอย่าง
// ============================================================
function demoStore() {
  const KEY = "sode-samsen-demo-v2";
  const memFiles = new Map(); // ไฟล์แนบในโหมดตัวอย่างเก็บในหน่วยความจำ (หายเมื่อรีเฟรช)
  let data = null;
  let listener = () => {};
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const USERS = {
    staff: { id: "demo-staff", name: "พนักงานโสต (ตัวอย่าง)", email: "staff@example.com", role: "staff", type: "teacher", department: "กลุ่มบริหารทั่วไป" },
    teacher: { id: "demo-teacher", name: "ครูผู้ยืม (ตัวอย่าง)", email: "teacher@example.com", role: "user", type: "teacher", department: "กลุ่มสาระการเรียนรู้ภาษาไทย" },
    student: { id: "demo-student", name: "นักเรียน (ตัวอย่าง)", username: "student01", role: "user", type: "student", classroom: "ม.5/3", studentNo: "12", studentId: "34567" },
  };

  function seed() {
    let s = 20261125;
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const items = DEFAULT_ITEMS.map((x, i) => ({ id: "item" + (i + 1), ...x, condition: "พร้อมใช้งาน", allowStudents: true, location: "ห้องโสต อาคาร 3", note: "", createdAt: Date.now() }));
    items.push({ id: "item99", name: "โปรเจกเตอร์พกพา", category: "จอภาพและการนำเสนอ", code: "PJ-01", quantity: 1, condition: "ส่งซ่อม", allowStudents: false, location: "", note: "หลอดภาพเสีย", createdAt: Date.now() });
    const people = [
      ["ครูสมชาย", "teacher", "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี"], ["ครูวิภา", "teacher", "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ"],
      ["ครูอนันต์", "teacher", "กลุ่มบริหารกิจการนักเรียน"], ["ด.ช.ธนกร", "student", "ม.2/4"], ["น.ส.พิมพ์ชนก", "student", "ม.5/1"], ["นายภูมิ", "student", "ม.6/2"],
    ];
    const loans = [], contacts = [];
    const t = today();
    for (let d = addDays(t, -120); d <= addDays(t, 10); d = addDays(d, 1)) {
      const wd = new Date(d + "T00:00").getDay();
      if (wd === 0 || wd === 6) continue;
      const n = Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const [name, type, extra] = pick(people);
        const it = pick(items.filter((x) => x.condition === "พร้อมใช้งาน"));
        const qty = it.quantity > 2 ? 1 + Math.floor(rnd() * 2) : 1;
        const due = addDays(d, Math.floor(rnd() * 4));
        let status, returnedDate = "";
        if (d > t) status = rnd() < 0.6 ? "pending" : "approved";
        else if (due < addDays(t, -2)) { const r = rnd(); status = r < 0.9 ? "returned" : r < 0.95 ? "rejected" : "cancelled"; returnedDate = status === "returned" ? addDays(due, rnd() < 0.15 ? 2 : 0) : ""; }
        else status = rnd() < 0.25 ? "pending" : "approved";
        const id = uid();
        loans.push({
          id, uid: "demo-other", borrowerName: name, borrowerType: type,
          classroom: type === "student" ? extra : "", studentNo: type === "student" ? String(1 + Math.floor(rnd() * 40)) : "",
          department: type === "teacher" ? extra : "",
          items: [{ itemId: it.id, name: it.name, category: it.category, code: it.code, qty }], itemIds: [it.id],
          borrowDate: d, dueDate: due, purpose: pick(PURPOSES), note: "", status, returnedDate,
          reason: status === "rejected" ? "อุปกรณ์ไม่ว่างในช่วงเวลาดังกล่าว" : "", createdAt: Date.parse(d) - 864e5,
        });
        contacts.push({ id, uid: "demo-other", phone: "08" + Math.floor(10000000 + rnd() * 89999999), date: d });
      }
    }
    const P = BUDGET_PROJECTS;
    const mk = (o) => ({ id: uid(), fiscalYear: 2570, files: [], note: "", createdAt: Date.now(), date: t, recorder: "สุชาติ", ...o });
    const budget = [
      mk({ project: P[0].project, activity: P[0].activities[1], item: "ซื้อเครื่องปริ้นเตอร์", category: "ครุภัณฑ์", fundType: "รายได้สถานศึกษา", amount: 20000 }),
      mk({ project: P[1].project, activity: P[1].activities[0], item: "ซ่อมบำรุงระบบจอ LED ห้องโสต", category: "จ้าง", fundType: "อุดหนุน", amount: 497550 }),
    ];
    const users = Object.values(USERS).map((u) => ({ email: "", username: "", photo: "", classroom: "", studentNo: "", studentId: "", department: "", phone: "", banned: false, createdAt: Date.now(), ...u }));
    users.push({ id: "demo-banned", name: "บัญชีที่ถูกระงับ (ตัวอย่าง)", username: "baduser", email: "", role: "user", type: "student", classroom: "ม.3/1", banned: true, createdAt: Date.now() });
    return { role: "staff", signedIn: false, users, items, loans, loanContacts: contacts, budget };
  }
  const load = () => {
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
    if (!data) { data = seed(); save(); }
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
  const current = () => {
    if (!data.signedIn) return null;
    const u = data.users.find((x) => x.id === USERS[data.role].id);
    return u ? toUser(u.id, u) : null;
  };
  const match = (r, { eq, range, inq, contains } = {}) =>
    (!eq || r[eq[0]] === eq[1]) && (!range || (r[range[0]] >= range[1] && r[range[0]] <= range[2])) && (!inq || inq[1].includes(r[inq[0]])) &&
    (!contains || (r[contains[0]] || []).includes(contains[1]));

  return {
    async init() { load(); },
    onAuth(cb) { listener = cb; cb(current()); },
    async signIn() { data.signedIn = true; save(); listener(current()); },
    async signInUsername() { data.role = "student"; data.signedIn = true; save(); listener(current()); },
    async register({ profile }) {
      const u = data.users.find((x) => x.id === USERS.student.id);
      Object.assign(u, pickProfile(profile));
      data.role = "student"; data.signedIn = true; save(); listener(current());
    },
    async createAccount({ username, profile }) {
      if (data.users.some((x) => x.username === username)) throw Object.assign(new Error("dup"), { code: "auth/email-already-in-use" });
      data.users.push({ id: uid(), username, email: "", photo: "", role: "user", banned: false, createdAt: Date.now(), ...pickProfile(profile) });
      save();
    },
    async changePassword() {},
    async signOut() { data.signedIn = false; save(); listener(null); },
    demoRole: () => data.role,
    setDemoRole(r) { data.role = r; save(); listener(current()); },
    resetDemo() { localStorage.removeItem(KEY); load(); listener(current()); },
    async get(coll, id) { const r = (data[coll] || []).find((x) => x.id === id); return r ? structuredClone(r) : null; },
    async list(coll) { return structuredClone(data[coll] || []); },
    async query(coll, q = {}) { return structuredClone((data[coll] || []).filter((r) => match(r, q))); },
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
      if (!f) throw new Error("โหมดตัวอย่างเก็บไฟล์แนบไว้ชั่วคราวเท่านั้น (หายเมื่อรีเฟรชหน้า)");
      return f;
    },
    async removeFile(meta) { memFiles.delete(meta.id); },
    // ปฏิทินจำลอง (โหมดตัวอย่างไม่ได้เขียนลง Google Calendar จริง)
    calendar: {
      enabled: true, demo: true,
      connected: () => true,
      async connect() {},
      async insert() { return "demo-" + uid(); },
      async patch() {},
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
  let A, F, appM, auth, db;
  const CHUNK = 900 * 1024; // เอกสาร Firestore จำกัด 1 MB จึงแบ่งไฟล์เป็นชิ้น
  let pendingProfile = null; // ข้อมูลโปรไฟล์ระหว่างสมัครด้วยชื่อผู้ใช้

  const rows = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));

  // ----- Google Calendar: ใช้สิทธิ์ของพนักงานโสตที่ล็อกอินอยู่ (โทเคนอายุราว 1 ชั่วโมง) -----
  const CAL_ID = CONFIG.calendar?.calendarId || "";
  const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
  const TOK_KEY = "sode-cal-token";
  let tok = null;
  try { tok = JSON.parse(sessionStorage.getItem(TOK_KEY)); } catch {}
  const tokValid = () => !!tok && tok.uid === auth?.currentUser?.uid && tok.exp > Date.now() + 60000;
  const clearTok = () => { tok = null; try { sessionStorage.removeItem(TOK_KEY); } catch {} };
  const isGoogleUser = () => (auth?.currentUser?.providerData || []).some((p) => p.providerId === "google.com");
  async function calConnect() {
    if (!isGoogleUser()) throw new Error("การเชื่อม Google Calendar ต้องเข้าสู่ระบบด้วยบัญชี Google");
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
    status === 403 ? "บัญชีนี้ไม่มีสิทธิ์แก้ไขปฏิทินงานโสตฯ หรือยังไม่ได้อนุญาตสิทธิ์ปฏิทินตอนเชื่อมต่อ"
    : status === 404 ? "ไม่พบปฏิทิน — ตรวจสอบ calendarId ใน config.js และการแชร์ปฏิทิน"
    : `Google Calendar ตอบกลับข้อผิดพลาด ${status}`;
  const calendar = {
    enabled: !!CAL_ID, demo: false,
    connected: tokValid,
    connect: calConnect,
    async insert(l) {
      const r = await calApi("POST", "", calendarEvent(l));
      if (!r.ok) throw new Error(calError(r.status));
      return (await r.json()).id;
    },
    async patch(eventId, body) {
      const r = await calApi("PATCH", "/" + encodeURIComponent(eventId), body);
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(calError(r.status));
    },
    async remove(eventId) {
      const r = await calApi("DELETE", "/" + encodeURIComponent(eventId));
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(calError(r.status));
    },
  };

  return {
    calendar,
    async init() {
      const [am, authM, fsM] = await Promise.all([
        import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
      ]);
      appM = am; A = authM; F = fsM;
      const app = appM.initializeApp(CONFIG.firebase);
      auth = A.getAuth(app);
      db = F.getFirestore(app);
    },
    onAuth(cb) {
      A.onAuthStateChanged(auth, async (u) => {
        if (!u) return cb(null);
        try {
          const usernameUser = isUsernameEmail(u.email);
          if (!usernameUser && CONFIG.allowedDomain && !(u.email || "").toLowerCase().endsWith("@" + CONFIG.allowedDomain.toLowerCase())) {
            await A.signOut(auth);
            return cb(null, new Error(`กรุณาใช้อีเมล @${CONFIG.allowedDomain} ในการเข้าสู่ระบบ`));
          }
          const ref = F.doc(db, "users", u.uid);
          const snap = await F.getDoc(ref);
          let d;
          if (!snap.exists()) {
            const p = pendingProfile || {};
            d = {
              ...pickProfile({ name: u.displayName || "", ...p }),
              email: usernameUser ? "" : u.email || "",
              username: usernameUser ? u.email.split("@")[0] : "",
              photo: u.photoURL || "", role: "user", banned: false, createdAt: Date.now(),
            };
            await F.setDoc(ref, d);
            pendingProfile = null;
          } else d = snap.data();
          if (d.banned) {
            await A.signOut(auth);
            return cb(null, new Error(BANNED_MSG));
          }
          cb(toUser(u.uid, d));
        } catch (e) {
          // ถ้าอ่านโปรไฟล์ไม่ได้เพราะถูกลบ/ระงับ ให้ออกจากระบบ
          if (String(e?.code || e?.message).includes("permission")) { await A.signOut(auth).catch(() => {}); return cb(null, new Error(BANNED_MSG)); }
          cb(null, e);
        }
      });
    },
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account", ...(CONFIG.allowedDomain ? { hd: CONFIG.allowedDomain } : {}) });
      await A.signInWithPopup(auth, p);
    },
    async signInUsername(username, password) {
      await A.signInWithEmailAndPassword(auth, toEmail(username), password);
    },
    // สมัครสมาชิกด้วยชื่อผู้ใช้/รหัสผ่าน (ผู้ใช้สมัครเอง)
    async register({ username, password, profile }) {
      pendingProfile = pickProfile(profile);
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, toEmail(username), password);
        await A.updateProfile(cred.user, { displayName: pendingProfile?.name || profile.name || username }).catch(() => {});
      } catch (e) { pendingProfile = null; throw e; }
    },
    // พนักงานโสตสร้างบัญชีให้ผู้อื่น — ใช้แอป Firebase ชุดที่สอง จึงไม่ทำให้พนักงานโสตหลุดจากระบบ
    async createAccount({ username, password, profile }) {
      const app2 = appM.initializeApp(CONFIG.firebase, "create-" + Date.now());
      const a2 = A.getAuth(app2);
      try {
        await A.setPersistence(a2, A.inMemoryPersistence);
        const cred = await A.createUserWithEmailAndPassword(a2, toEmail(username), password);
        await A.updateProfile(cred.user, { displayName: profile.name || username }).catch(() => {});
        await F.setDoc(F.doc(db, "users", cred.user.uid), {
          ...pickProfile(profile), email: "", username: username.toLowerCase(), photo: "", role: "user", banned: false,
          createdBy: auth.currentUser.uid, createdAt: Date.now(),
        });
      } finally {
        await A.signOut(a2).catch(() => {});
        await appM.deleteApp(app2).catch(() => {});
      }
    },
    // เปลี่ยนรหัสผ่านของตัวเอง (บัญชีชื่อผู้ใช้)
    async changePassword(current, next) {
      const u = auth.currentUser;
      await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, current));
      await A.updatePassword(u, next);
    },
    async signOut() { clearTok(); await A.signOut(auth); },
    async get(coll, id) { const s = await F.getDoc(F.doc(db, coll, id)); return s.exists() ? { ...s.data(), id: s.id } : null; },
    async list(coll) { return rows(await F.getDocs(F.collection(db, coll))); },
    async query(coll, { eq, range, inq, contains } = {}) {
      const c = [];
      if (contains) c.push(F.where(contains[0], "array-contains", contains[1]));
      if (eq) c.push(F.where(eq[0], "==", eq[1]));
      if (inq) c.push(F.where(inq[0], "in", inq[1]));
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
