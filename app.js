const LOGO = "assets/adivyne-arc-logo.png";
const TABLES = {
  oxygen: "oxygen_readings",
  bp: "blood_pressure_readings",
  watch: "watch_summary_uploads",
  weight: "weight_logs",
  medications: "medications",
  medLogs: "medication_logs",
  refillReminders: "refill_reminders",
  appointments: "appointments",
  questions: "provider_questions",
  caregivers: "caregivers",
  reminders: "reminders",
  profile: "user_profiles",
};
const BUCKETS = {
  oxygen: "oxygen-photos",
  bp: "blood-pressure-photos",
  watch: "watch-summary-photos",
  medications: "medication-photos",
};
const state = {
  view: "splash",
  session: null,
  user: null,
  profile: {},
  data: {},
  supabase: null,
  config: JSON.parse(localStorage.getItem("arccare:supabase") || "{}"),
};
const app = document.querySelector("#app");
const fileInput = document.querySelector("#hidden-file-input");

function initSupabase() {
  if (state.config.url && state.config.anonKey && window.supabase) {
    state.supabase = window.supabase.createClient(state.config.url, state.config.anonKey);
  }
}
function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusNote() {
  if (!state.supabase) return `<div class="note">Connect Supabase in Profile to enable login, secure photo uploads, and saved history. The app will not pretend to save private health data until Supabase is configured.</div>`;
  if (!state.session) return `<div class="note">Log in or create an account to save private care history securely.</div>`;
  return "";
}
function brand() {
  return `<div class="brand"><img src="${LOGO}" alt="Adivyne Arc logo" /><div><h1 class="brand-title">ArcCare</h1><p class="brand-subtitle">by Adivyne Arc</p></div></div>`;
}
function nav() {
  const items = [["dashboard","Dashboard"],["oxygen","Oxygen"],["bp","Blood Pressure"],["watch","Watch"],["weight","Weight"],["meds","Meds"],["appointments","Appointments"],["questions","Questions"],["reminders","Reminders"],["reports","Reports"],["caregiver","Caregiver"],["profile","Profile"]];
  return `<nav class="nav">${items.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("")}</nav>`;
}
function shell(content) {
  app.innerHTML = `${content}${state.session ? nav() : ""}`;
  bindCommon();
}
function bindCommon() {
  document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  document.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", () => actions[btn.dataset.action]?.(btn)));
}
function setView(view) {
  state.view = view;
  render();
}
async function boot() {
  initSupabase();
  if (state.supabase) {
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.user = data.session?.user || null;
    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      state.user = session?.user || null;
      await loadData();
      state.view = state.session ? "dashboard" : "splash";
      render();
    });
    await loadData();
  }
  render();
}
async function loadData() {
  state.data = {};
  state.profile = {};
  if (!state.supabase || !state.user) return;
  const tableList = Object.values(TABLES);
  await Promise.all(tableList.map(async (table) => {
    const { data, error } = await state.supabase.from(table).select("*").order("created_at", { ascending: false }).limit(100);
    if (!error) state.data[table] = data || [];
  }));
  await hydratePrivatePhotoUrls();
  state.profile = state.data[TABLES.profile]?.[0] || {};
}
async function hydratePrivatePhotoUrls() {
  const photoTables = [TABLES.oxygen, TABLES.bp, TABLES.watch, TABLES.medications];
  await Promise.all(photoTables.flatMap((table) => (state.data[table] || []).map(async (row) => {
    if (!row.photo_url || !row.photo_url.includes("/")) return;
    const [bucket, ...parts] = row.photo_url.split("/");
    const path = parts.join("/");
    const { data } = await state.supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    row.photo_signed_url = data?.signedUrl || "";
  })));
}
function latest(table) {
  return state.data[table]?.[0];
}
function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "--" : value;
}
function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function toDateTimeLocal(value) {
  if (!value) return new Date().toISOString().slice(0, 16);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function tableForKind(kind) {
  if (kind === "oxygen") return TABLES.oxygen;
  if (kind === "bp") return TABLES.bp;
  if (kind === "watch") return TABLES.watch;
  return TABLES.medications;
}
function viewForKind(kind) {
  if (kind === "bp") return "bp";
  if (kind === "medications") return "meds";
  return kind;
}
function recordTitle(kind, record) {
  if (kind === "oxygen") return `${valueOrDash(record.oxygen_level)}% oxygen, ${valueOrDash(record.pulse_rate)} pulse`;
  if (kind === "bp") return `${valueOrDash(record.systolic)}/${valueOrDash(record.diastolic)}${record.pulse_rate ? `, ${record.pulse_rate} pulse` : ""}`;
  if (kind === "watch") return record.source_app || "Watch Summary";
  return record.medication_name || "Medication";
}
function render() {
  if (!state.session && !["login","signup","profile"].includes(state.view)) return renderSplash();
  const routes = { login: renderAuth, signup: renderAuth, dashboard: renderDashboard, oxygen: () => renderReadings("oxygen"), bp: () => renderReadings("bp"), watch: renderWatch, weight: renderWeight, meds: renderMeds, appointments: renderAppointments, questions: renderQuestions, reminders: renderReminders, reports: renderReports, caregiver: renderCaregiver, profile: renderProfile };
  (routes[state.view] || renderDashboard)();
}
function renderSplash() {
  shell(`<main class="splash">
    <div class="stack"><img class="splash-logo" src="${LOGO}" alt="Adivyne Arc logo" /><div><h1>ArcCare</h1><p class="tagline">Daily care made simple.</p><p class="lead">Track oxygen, pulse, blood pressure, watch summaries, weight, medications, refills, appointments, and provider questions in one simple place.</p></div></div>
    ${statusNote()}
    <div class="actions"><button class="primary" data-view="signup">Get Started</button><button class="ghost" data-view="login">Log In</button><button class="ghost" data-view="profile">Configure Supabase</button></div>
    <p class="note safety">This app helps you track health information but does not provide medical advice. Always contact your healthcare provider for medical concerns. If this feels urgent, call your healthcare provider or emergency services.</p>
  </main>`);
}
function renderAuth() {
  const mode = state.view;
  shell(`<main class="stack"><div class="topbar">${brand()}<button class="ghost" data-view="splash">Back</button></div>${statusNote()}
    <form class="panel stack" id="auth-form">
      <h2>${mode === "signup" ? "Create Account" : "Log In"}</h2>
      <label>Email<input name="email" type="email" autocomplete="email" required /></label>
      <label>Password<input name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required /></label>
      ${mode === "signup" ? `<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" required /></label>` : ""}
      <div class="actions"><button class="primary" type="submit">${mode === "signup" ? "Create Account" : "Log In"}</button><button class="ghost" type="button" data-action="resetPassword">Reset Password</button></div>
    </form></main>`);
  document.querySelector("#auth-form").addEventListener("submit", handleAuth);
}
async function handleAuth(event) {
  event.preventDefault();
  if (!state.supabase) return alert("Add Supabase URL and anon key in Profile first.");
  const form = Object.fromEntries(new FormData(event.currentTarget));
  if (state.view === "signup" && form.password !== form.confirm) return alert("Passwords do not match.");
  const request = state.view === "signup"
    ? state.supabase.auth.signUp({ email: form.email, password: form.password })
    : state.supabase.auth.signInWithPassword({ email: form.email, password: form.password });
  const { error } = await request;
  if (error) return alert(error.message);
  await loadData();
  setView("dashboard");
}
function renderDashboard() {
  const ox = latest(TABLES.oxygen), bp = latest(TABLES.bp), watch = latest(TABLES.watch), weight = latest(TABLES.weight);
  shell(`<main class="stack">
    <header class="topbar">${brand()}<div class="actions"><button class="ghost" data-action="logout">Log Out</button></div></header>
    ${statusNote()}
    <section><p class="date-line">${todayLabel()}</p><h2 class="today-title">Today’s Care</h2><p class="lead">Hello${state.profile.first_name ? `, ${esc(state.profile.first_name)}` : ""}. Present When It Matters Most™</p></section>
    <section class="summary-grid">
      ${metric("Last Oxygen", ox ? `${ox.oxygen_level || "--"}% / ${ox.pulse_rate || "--"} pulse` : "No reading")}
      ${metric("Last Blood Pressure", bp ? `${bp.systolic || "--"}/${bp.diastolic || "--"}` : "No reading")}
      ${metric("Last Watch Summary", watch ? esc(watch.source_app || "Uploaded") : "No upload")}
      ${metric("Last Weight", weight ? `${weight.weight} lb` : "No weight")}
    </section>
    <section class="grid">
      <button class="gold hero-action" data-action="captureOxygen">Take Oxygen Photo</button>
      <button class="primary" data-action="captureBp">Take Blood Pressure Photo</button>
      <button class="ghost" data-action="captureWatch">Upload Watch Summary</button>
      <button class="ghost" data-view="weight">Record Weight</button>
      <button class="ghost" data-view="meds">Take Meds</button>
      <button class="ghost" data-view="questions">Add Note</button>
      <button class="ghost" data-view="reports">Create Report</button>
    </section>
    <section class="grid two">${dashboardCard("Today’s Medications", medSummary())}${dashboardCard("Refills", refillSummary())}${dashboardCard("Appointments", appointmentSummary())}</section>
    <p class="note safety">ArcCare does not diagnose, interpret readings as safe or dangerous, or recommend medication changes.</p>
  </main>`);
}
function metric(label, value) { return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`; }
function dashboardCard(title, body) { return `<div class="card"><h3>${title}</h3><div class="muted">${body}</div></div>`; }
function medSummary() {
  const meds = state.data[TABLES.medications] || [];
  return meds.length ? meds.slice(0, 3).map((m) => esc(m.medication_name)).join(", ") : "No medications added yet.";
}
function refillSummary() {
  const meds = (state.data[TABLES.medications] || []).filter((m) => m.refill_date);
  return meds.length ? meds.slice(0, 3).map((m) => `${esc(m.medication_name)}: ${esc(m.refill_date)}`).join("<br>") : "No refill dates yet.";
}
function appointmentSummary() {
  const appts = state.data[TABLES.appointments] || [];
  return appts.length ? appts.slice(0, 3).map((a) => `${esc(a.provider_name || "Provider")} on ${esc(a.appointment_date || "")}`).join("<br>") : "No appointments added yet.";
}
function renderReadings(kind) {
  const title = kind === "oxygen" ? "Oxygen Readings" : "Blood Pressure Readings";
  const action = kind === "oxygen" ? "captureOxygen" : "captureBp";
  const rows = state.data[kind === "oxygen" ? TABLES.oxygen : TABLES.bp] || [];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <div class="section-title"><h2>${title}</h2><button class="primary" data-action="${action}">${kind === "oxygen" ? "Take Oxygen Photo" : "Take Blood Pressure Photo"}</button></div>
    <div class="list">${rows.length ? rows.map((r) => readingCard(kind, r)).join("") : `<div class="panel muted">No saved readings yet.</div>`}</div>
  </main>`);
}
function readingCard(kind, r) {
  return `<article class="card row"><div class="row-main">${r.photo_signed_url ? `<img class="thumb" src="${esc(r.photo_signed_url)}" alt="Photo of reading" />` : ""}<div><h3>${recordTitle(kind, r)}</h3><p class="muted">${formatDateTime(r.recorded_at || r.created_at)}<br>${esc(r.source || "Captured from photo")}</p>${r.notes ? `<p>${esc(r.notes)}</p>` : ""}</div></div><div class="actions"><button class="ghost" data-action="viewRecord:${kind}:${r.id}">View</button><button class="ghost" data-action="replacePhoto:${kind}:${r.id}">Retake Photo</button><button class="danger" data-action="delete:${kind}:${r.id}">Delete</button></div></article>`;
}
function renderWatch() {
  const rows = state.data[TABLES.watch] || [];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <div class="section-title"><h2>Watch Summaries</h2><button class="primary" data-action="captureWatch">Upload Watch Summary</button></div>
    <div class="list">${rows.length ? rows.map(watchCard).join("") : `<div class="panel muted">No watch summaries uploaded yet.</div>`}</div>
  </main>`);
}
function watchCard(r) {
  const values = ["resting_heart_rate","average_heart_rate","steps","sleep_duration","sleep_score","weight","spo2","breathing_rate"].filter((k) => r[k]).map((k) => `${k.replaceAll("_"," ")}: ${esc(r[k])}`).join("<br>");
  return `<article class="card row"><div class="row-main">${r.photo_signed_url ? `<img class="thumb" src="${esc(r.photo_signed_url)}" alt="Watch summary screenshot" />` : ""}<div><h3>${esc(r.source_app || "Watch Summary")}</h3><p class="muted">${formatDateTime(r.created_at)}<br>Captured from watch summary</p><p>${values || "Saved image for reference."}</p></div></div><div class="actions"><button class="ghost" data-action="viewRecord:watch:${r.id}">View</button><button class="ghost" data-action="replacePhoto:watch:${r.id}">Replace Image</button><button class="danger" data-action="delete:watch:${r.id}">Delete</button></div></article>`;
}
function renderWeight() {
  const rows = state.data[TABLES.weight] || [];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack"><h2>Record Weight</h2><form id="weight-form" class="grid two"><label>Weight<input name="weight" type="number" step="0.1" required /></label><label>Date recorded<input name="recorded_at" type="datetime-local" /></label><label class="grid-span">Notes<textarea name="notes"></textarea></label><button class="primary">Save Weight</button></form></section>
    <section class="list">${rows.map((r) => `<article class="card"><h3>${esc(r.weight)} lb</h3><p class="muted">${new Date(r.recorded_at || r.created_at).toLocaleString()}</p><p>${esc(r.notes || "")}</p></article>`).join("") || `<div class="panel muted">No weight history yet.</div>`}</section>
  </main>`);
  document.querySelector("#weight-form").addEventListener("submit", (e) => saveSimple(e, TABLES.weight, { source: "Manual entry" }));
}
function renderMeds() {
  const meds = state.data[TABLES.medications] || [];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack"><h2>Medication Tracker</h2><form id="med-form" class="grid two">${fields(["medication_name:Medication name","dosage:Dosage","frequency:Frequency","time_of_day:Time of day","reason:Reason","prescribing_doctor:Prescribing doctor","pharmacy_name:Pharmacy name","pharmacy_phone:Pharmacy phone","refill_date:Refill date:date","pills_remaining:Pills remaining:number"])}<label>Taken with food?<select name="taken_with_food"><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></select></label><label>Notes<textarea name="notes"></textarea></label><button class="primary">Add Medication</button><button type="button" class="ghost" data-action="medPhoto">Medication Bottle Photo</button></form><p class="muted">Medication bottle photos are for reference only. ArcCare does not provide medication advice.</p></section>
    <section class="list">${meds.map(medCard).join("") || `<div class="panel muted">No medications added yet.</div>`}</section>
  </main>`);
  document.querySelector("#med-form").addEventListener("submit", (e) => saveSimple(e, TABLES.medications));
}
function medCard(m) {
  return `<article class="card"><div class="row-main">${m.photo_signed_url ? `<img class="thumb" src="${esc(m.photo_signed_url)}" alt="Medication bottle photo" />` : ""}<div><h3>${esc(m.medication_name)}</h3><p>${esc(m.dosage || "")} ${esc(m.frequency || "")}</p><p class="muted">Refill: ${esc(m.refill_date || "Not set")} ${m.pills_remaining ? `· ${esc(m.pills_remaining)} pills` : ""}</p></div></div><div class="actions"><button class="ghost" data-action="medLog:taken:${m.id}">Taken</button><button class="ghost" data-action="medLog:missed:${m.id}">Missed</button><button class="ghost" data-action="markRefill:${m.id}">Mark Refilled</button><button class="danger" data-action="delete:medications:${m.id}">Delete</button></div></article>`;
}
function renderAppointments() {
  const rows = state.data[TABLES.appointments] || [];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack"><h2>Appointments</h2><form id="appt-form" class="grid two">${fields(["provider_name:Provider name","appointment_type:Appointment type","appointment_date:Date:date","appointment_time:Time:time","location:Location","provider_phone:Provider phone","provider_email:Provider email"])}<label>Questions to ask<textarea name="questions"></textarea></label><label>Notes<textarea name="notes"></textarea></label><label>Follow-up needed?<select name="follow_up_needed"><option value="false">No</option><option value="true">Yes</option></select></label><button class="primary">Add Appointment</button></form></section>
    <section class="list">${rows.map((r) => `<article class="card"><h3>${esc(r.provider_name || "Provider")}</h3><p>${esc(r.appointment_type || "")}</p><p class="muted">${esc(r.appointment_date || "")} ${esc(r.appointment_time || "")}</p><p>${esc(r.questions || r.notes || "")}</p></article>`).join("") || `<div class="panel muted">No appointments added yet.</div>`}</section>
  </main>`);
  document.querySelector("#appt-form").addEventListener("submit", (e) => saveSimple(e, TABLES.appointments));
}
function renderQuestions() {
  const rows = state.data[TABLES.questions] || [];
  const suggested = ["Should I keep taking this medication?","Is this blood pressure number okay?","Can this medication cause dizziness?","Should I change the time I take this?","Do any of my medications interact?","Should I be concerned about my weight change?","Should I track anything else daily?","Should I be concerned about my oxygen readings?"];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack"><h2>Questions for Provider</h2><div class="actions">${suggested.map((q) => `<button class="ghost" data-action="quickQuestion:${esc(q)}">${esc(q)}</button>`).join("")}</div><form id="question-form" class="stack"><label>Question<textarea name="question" required></textarea></label><label>Answer notes<textarea name="answer_notes"></textarea></label><button class="primary">Save Question</button></form></section>
    <section class="list">${rows.map((r) => `<article class="card"><h3>${esc(r.question)}</h3><p class="muted">${r.answered ? "Answered" : "Open"}</p><p>${esc(r.answer_notes || "")}</p></article>`).join("") || `<div class="panel muted">No provider questions yet.</div>`}</section>
  </main>`);
  document.querySelector("#question-form").addEventListener("submit", (e) => saveSimple(e, TABLES.questions, { answered: false }));
}
function renderCaregiver() {
  const rows = state.data[TABLES.caregivers] || [];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack"><h2>Caregiver Access</h2><form id="care-form" class="grid two"><label>Caregiver name<input name="caregiver_name" /></label><label>Caregiver email<input name="caregiver_email" type="email" required /></label><label>Permission level<select name="permission_level"><option>View only</option><option>View and edit</option><option>Full support access</option></select></label><button class="primary">Invite Caregiver</button></form><p class="muted">Caregiver access is enforced by the Supabase RLS policies in the setup script.</p></section>
    <section class="list">${rows.map((r) => `<article class="card"><h3>${esc(r.caregiver_email)}</h3><p>${esc(r.permission_level)}</p><p class="muted">${r.active ? "Active" : "Invited"}</p></article>`).join("") || `<div class="panel muted">No caregivers invited yet.</div>`}</section>
  </main>`);
  document.querySelector("#care-form").addEventListener("submit", (e) => saveSimple(e, TABLES.caregivers, { active: true, invited_at: new Date().toISOString() }));
}
function renderReminders() {
  const rows = state.data[TABLES.reminders] || [];
  const presets = [
    ["oxygen", "Remember to take your oxygen photo."],
    ["blood_pressure", "Remember to take your blood pressure photo."],
    ["watch_summary", "Remember to upload your watch summary."],
    ["weight", "Remember to record your weight."],
    ["medication", "It is time to take your medication."],
    ["refill", "Your refill may be due soon."],
    ["appointment", "You have an upcoming appointment."],
    ["questions", "Take a moment to add questions for your provider."],
  ];
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack">
      <h2>Reminder Center</h2>
      <p class="lead">Set simple in-app reminders for care tasks. ArcCare shows these reminders here when you open the app.</p>
      <div class="actions">${presets.map(([type, message]) => `<button class="ghost" data-action="presetReminder:${type}:${esc(message)}">${esc(message)}</button>`).join("")}</div>
      <form id="reminder-form" class="grid two">
        <label>Reminder type
          <select name="reminder_type">
            <option value="oxygen">Oxygen reading</option>
            <option value="blood_pressure">Blood pressure reading</option>
            <option value="watch_summary">Watch summary upload</option>
            <option value="weight">Weight check</option>
            <option value="medication">Medication time</option>
            <option value="refill">Refill date</option>
            <option value="appointment">Upcoming appointment</option>
            <option value="questions">Prepare questions before appointment</option>
          </select>
        </label>
        <label>Title<input name="title" value="Care reminder" required /></label>
        <label>Reminder date<input name="reminder_date" type="date" required /></label>
        <label>Reminder time<input name="reminder_time" type="time" /></label>
        <label>Message<textarea name="message" required>Remember to take your oxygen photo.</textarea></label>
        <button class="primary">Save Reminder</button>
      </form>
    </section>
    <section class="list">${rows.length ? rows.map(reminderCard).join("") : `<div class="panel muted">No reminders yet.</div>`}</section>
  </main>`);
  document.querySelector("#reminder-form").addEventListener("submit", (e) => saveSimple(e, TABLES.reminders, { completed: false }));
}
function reminderCard(r) {
  const date = [r.reminder_date, r.reminder_time].filter(Boolean).join(" ");
  return `<article class="card row"><div><h3>${esc(r.title || "Care reminder")}</h3><p>${esc(r.message || "")}</p><p class="muted">${esc(r.reminder_type || "Reminder")}${date ? ` · ${esc(date)}` : ""}<br>${r.completed ? "Completed" : "Open"}</p></div><div class="actions">${r.completed ? "" : `<button class="ghost" data-action="completeReminder:${r.id}">Mark Complete</button>`}<button class="danger" data-action="delete:reminders:${r.id}">Delete</button></div></article>`;
}
function renderReports() {
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="dashboard">Back</button></header>${statusNote()}
    <section class="panel stack"><h2>Provider Report</h2><p class="lead">Create a clean report for your provider with readings, watch summaries, weight, medications, refills, appointments, and questions.</p><div class="grid two"><label>Start date<input id="report-start" type="date" /></label><label>End date<input id="report-end" type="date" /></label><label>Provider email<input id="report-email" type="email" value="${esc(state.profile.provider_email || "")}" /></label></div><div class="actions"><button class="primary" data-action="downloadReport">Download PDF</button><button class="ghost" data-action="printReport">Print Report</button><button class="gold" data-action="emailReport">Email Provider</button></div><div id="report-preview" class="panel">${reportHtml()}</div></section>
  </main>`);
}
function reportHtml() {
  const name = [state.profile.first_name, state.profile.last_name].filter(Boolean).join(" ") || "Patient";
  return `<div class="stack"><div class="brand"><img src="${LOGO}" alt="Adivyne Arc logo" /><div><h2>ArcCare by Adivyne Arc</h2><p class="muted">Health Tracking Report for ${esc(name)}</p></div></div>${reportSection("Oxygen Readings", TABLES.oxygen, (r) => `${valueOrDash(r.oxygen_level)}% oxygen · ${formatDateTime(r.recorded_at || r.created_at)} · ${r.source || "Captured from photo"}`)}${reportSection("Pulse Readings", TABLES.oxygen, (r) => `${valueOrDash(r.pulse_rate)} pulse · ${formatDateTime(r.recorded_at || r.created_at)} · pulse oximeter`)}${reportSection("Blood Pressure Readings", TABLES.bp, (r) => `${valueOrDash(r.systolic)}/${valueOrDash(r.diastolic)}${r.pulse_rate ? ` · pulse ${r.pulse_rate}` : ""} · ${formatDateTime(r.recorded_at || r.created_at)}`)}${reportSection("Watch Summary Uploads", TABLES.watch, watchReportLine)}${reportSection("Weight History", TABLES.weight, (r) => `${valueOrDash(r.weight)} lb · ${formatDateTime(r.recorded_at || r.created_at)}${r.notes ? ` · ${r.notes}` : ""}`)}${reportSection("Medications", TABLES.medications, (r) => `${r.medication_name || "Medication"} · ${valueOrDash(r.dosage)} · ${valueOrDash(r.frequency)} · refill ${valueOrDash(r.refill_date)}`)}${reportSection("Medication Logs", TABLES.medLogs, (r) => `${valueOrDash(r.status)} · ${formatDateTime(r.taken_at || r.created_at)}${r.notes ? ` · ${r.notes}` : ""}`)}${reportSection("Refills", TABLES.refillReminders, (r) => `Refill ${valueOrDash(r.refill_date)} · ${valueOrDash(r.reminder_status)}${r.marked_refilled_at ? ` · marked refilled ${formatDateTime(r.marked_refilled_at)}` : ""}`)}${reportSection("Appointments", TABLES.appointments, (r) => `${r.provider_name || "Provider"} · ${valueOrDash(r.appointment_type)} · ${valueOrDash(r.appointment_date)} ${valueOrDash(r.appointment_time)}${r.questions ? ` · Questions: ${r.questions}` : ""}`)}${reportSection("Questions and Notes", TABLES.questions, (r) => `${r.question || ""}${r.answer_notes ? ` · ${r.answer_notes}` : ""}`)}<p class="note safety">This report is for tracking only and is not medical advice.</p></div>`;
}
function watchReportLine(r) {
  const values = [
    r.resting_heart_rate ? `resting heart rate ${r.resting_heart_rate}` : "",
    r.average_heart_rate ? `average heart rate ${r.average_heart_rate}` : "",
    r.steps ? `steps ${r.steps}` : "",
    r.sleep_duration ? `sleep ${r.sleep_duration}` : "",
    r.sleep_score ? `sleep score ${r.sleep_score}` : "",
    r.weight ? `weight ${r.weight}` : "",
    r.spo2 ? `oxygen ${r.spo2}` : "",
    r.breathing_rate ? `breathing rate ${r.breathing_rate}` : "",
  ].filter(Boolean).join(" · ");
  return `${r.source_app || "Watch Summary"} · ${values || "image saved for reference"} · ${formatDateTime(r.summary_date || r.created_at)}`;
}
function reportSection(title, table, map) {
  const rows = state.data[table] || [];
  return `<section><h3>${title}</h3>${rows.length ? `<ul>${rows.map((r) => `<li>${esc(map(r))} <span class="muted">${new Date(r.recorded_at || r.created_at || Date.now()).toLocaleDateString()}</span></li>`).join("")}</ul>` : `<p class="muted">No records yet.</p>`}</section>`;
}
function reportTextLines() {
  const name = [state.profile.first_name, state.profile.last_name].filter(Boolean).join(" ") || "Patient";
  const start = document.querySelector("#report-start")?.value || "All";
  const end = document.querySelector("#report-end")?.value || "Today";
  return [
    "ArcCare by Adivyne Arc",
    `Health Tracking Report for ${name}`,
    `Date range: ${start} to ${end}`,
    "",
    ...sectionTextLines("Oxygen Readings", TABLES.oxygen, (r) => `${valueOrDash(r.oxygen_level)}% oxygen, ${formatDateTime(r.recorded_at || r.created_at)}, ${r.source || "Captured from photo"}`),
    ...sectionTextLines("Pulse Readings", TABLES.oxygen, (r) => `${valueOrDash(r.pulse_rate)} pulse, ${formatDateTime(r.recorded_at || r.created_at)}, pulse oximeter`),
    ...sectionTextLines("Blood Pressure Readings", TABLES.bp, (r) => `${valueOrDash(r.systolic)}/${valueOrDash(r.diastolic)}${r.pulse_rate ? `, pulse ${r.pulse_rate}` : ""}, ${formatDateTime(r.recorded_at || r.created_at)}`),
    ...sectionTextLines("Watch Summary Uploads", TABLES.watch, watchReportLine),
    ...sectionTextLines("Weight History", TABLES.weight, (r) => `${valueOrDash(r.weight)} lb, ${formatDateTime(r.recorded_at || r.created_at)}${r.notes ? `, ${r.notes}` : ""}`),
    ...sectionTextLines("Medications", TABLES.medications, (r) => `${r.medication_name || "Medication"}, ${valueOrDash(r.dosage)}, ${valueOrDash(r.frequency)}, refill ${valueOrDash(r.refill_date)}`),
    ...sectionTextLines("Medication Logs", TABLES.medLogs, (r) => `${valueOrDash(r.status)}, ${formatDateTime(r.taken_at || r.created_at)}${r.notes ? `, ${r.notes}` : ""}`),
    ...sectionTextLines("Refills", TABLES.refillReminders, (r) => `Refill ${valueOrDash(r.refill_date)}, ${valueOrDash(r.reminder_status)}${r.marked_refilled_at ? `, marked refilled ${formatDateTime(r.marked_refilled_at)}` : ""}`),
    ...sectionTextLines("Appointments", TABLES.appointments, (r) => `${r.provider_name || "Provider"}, ${valueOrDash(r.appointment_type)}, ${valueOrDash(r.appointment_date)} ${valueOrDash(r.appointment_time)}${r.questions ? `, Questions: ${r.questions}` : ""}`),
    ...sectionTextLines("Questions and Notes", TABLES.questions, (r) => `${r.question || ""}${r.answer_notes ? `, ${r.answer_notes}` : ""}`),
    "",
    "This report is for tracking only and is not medical advice.",
  ];
}
function sectionTextLines(title, table, map) {
  const rows = state.data[table] || [];
  return [`${title}:`, ...(rows.length ? rows.map((r) => `- ${map(r)}`) : ["- No records yet."]), ""];
}
function renderProfile() {
  shell(`<main class="stack"><header class="topbar">${brand()}<button class="ghost" data-view="${state.session ? "dashboard" : "splash"}">Back</button></header>
    <section class="panel stack"><h2>Supabase Connection</h2><form id="config-form" class="stack"><label>Supabase URL<input name="url" value="${esc(state.config.url || "")}" placeholder="https://project.supabase.co" /></label><label>Supabase anon key<input name="anonKey" value="${esc(state.config.anonKey || "")}" /></label><button class="primary">Save Connection</button></form></section>
    ${state.session ? `<section class="panel stack"><h2>Profile</h2><form id="profile-form" class="grid two">${fields(["first_name:First name","last_name:Last name","age:Age:number","date_of_birth:Date of birth:date","phone:Phone","emergency_contact_name:Emergency contact name","emergency_contact_phone:Emergency contact phone","provider_name:Provider name","provider_email:Provider email:email","provider_phone:Provider phone","pharmacy_name:Pharmacy name","pharmacy_phone:Pharmacy phone","preferred_reminder_time:Preferred reminder time:time"])}<label>Caregiver access preference<select name="caregiver_access_preference"><option value="">Not set</option><option>Do not share</option><option>Invite caregiver</option></select></label><button class="primary">Save Profile</button></form></section>` : ""}</main>`);
  document.querySelector("#config-form").addEventListener("submit", saveConfig);
  const profileForm = document.querySelector("#profile-form");
  if (profileForm) {
    Object.entries(state.profile).forEach(([key, value]) => { const input = profileForm.elements[key]; if (input && value != null) input.value = value; });
    profileForm.addEventListener("submit", saveProfile);
  }
}
function fields(defs) {
  return defs.map((d) => {
    const [name, label, type = "text"] = d.split(":");
    return `<label>${label}<input name="${name}" type="${type}" /></label>`;
  }).join("");
}
async function saveConfig(event) {
  event.preventDefault();
  state.config = Object.fromEntries(new FormData(event.currentTarget));
  localStorage.setItem("arccare:supabase", JSON.stringify(state.config));
  initSupabase();
  alert("Supabase connection saved. Run supabase-schema.sql in Supabase before signing in.");
  setView("login");
}
async function saveProfile(event) {
  event.preventDefault();
  await upsert(TABLES.profile, Object.fromEntries(new FormData(event.currentTarget)));
  await loadData();
  render();
}
async function saveSimple(event, table, extra = {}) {
  event.preventDefault();
  await insert(table, { ...Object.fromEntries(new FormData(event.currentTarget)), ...extra });
  event.currentTarget.reset();
  await loadData();
  render();
}
async function insert(table, row) {
  if (!state.supabase || !state.user) return alert("Please configure Supabase and log in before saving.");
  const clean = normalizeBooleans({ ...row, user_id: state.user.id });
  const { error } = await state.supabase.from(table).insert(clean);
  if (error) alert(error.message);
}
async function upsert(table, row) {
  if (!state.supabase || !state.user) return alert("Please configure Supabase and log in before saving.");
  const clean = normalizeBooleans({ ...row, user_id: state.user.id, id: state.profile.id });
  if (!clean.id) delete clean.id;
  const { error } = await state.supabase.from(table).upsert(clean);
  if (error) alert(error.message);
}
async function updateRecord(table, id, row) {
  if (!state.supabase || !state.user) return alert("Please configure Supabase and log in before saving.");
  const { error } = await state.supabase.from(table).update(normalizeBooleans(row)).eq("id", id);
  if (error) alert(error.message);
}
async function deleteRecord(table, id) {
  if (!state.supabase || !state.user) return alert("Please configure Supabase and log in before deleting.");
  const { error } = await state.supabase.from(table).delete().eq("id", id);
  if (error) alert(error.message);
}
function normalizeBooleans(row) {
  Object.keys(row).forEach((k) => {
    if (row[k] === "") row[k] = null;
    if (row[k] === "true") row[k] = true;
    if (row[k] === "false") row[k] = false;
  });
  return row;
}
function askImage(kind, options = {}) {
  return new Promise((resolve) => {
    fileInput.value = "";
    if (kind === "watch") {
      fileInput.removeAttribute("capture");
    } else {
      fileInput.setAttribute("capture", "environment");
    }
    fileInput.onchange = () => resolve(fileInput.files[0]);
    fileInput.click();
  }).then((file) => file && openCaptureModal(kind, file, options));
}
async function openCaptureModal(kind, file, options = {}) {
  const url = URL.createObjectURL(file);
  const dialog = document.createElement("dialog");
  const title = kind === "oxygen" ? "Confirm Reading" : kind === "bp" ? "Confirm Reading" : kind === "watch" ? "Confirm Summary" : "Medication Bottle Photo";
  const saveLabel = options.record ? (kind === "watch" ? "Save Summary" : "Save Reading") : (kind === "watch" ? "Save Summary" : kind === "medications" ? "Save Photo" : "Save Reading");
  dialog.innerHTML = `<div class="modal-content stack"><h2>${title}</h2><img class="preview" src="${url}" alt="Photo preview" /><div id="ocr-status" class="note">Preparing OCR attempt...</div>${captureFields(kind, options.record)}<div class="actions"><button class="ghost" id="retake">${options.record ? "Choose Different Photo" : "Retake Photo"}</button><button class="primary" id="save-capture">${saveLabel}</button><button class="ghost" id="close-modal">Cancel</button></div></div>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  fillFormFromRecord(dialog.querySelector("form"), options.record);
  dialog.querySelector("#close-modal").onclick = () => { dialog.close(); dialog.remove(); };
  dialog.querySelector("#retake").onclick = () => { dialog.close(); dialog.remove(); askImage(kind, options); };
  runOcr(file, kind, dialog);
  dialog.querySelector("#save-capture").onclick = async () => {
    const form = Object.fromEntries(new FormData(dialog.querySelector("form")));
    const photo_url = await uploadPhoto(kind, file);
    const row = { ...form, photo_url, captured_from_photo: kind !== "watch", source: kind === "watch" ? "Captured from watch summary" : "Captured from photo", extraction_confidence: form.extracted_text ? 0.5 : null };
    if (kind !== "watch") row.recorded_at = form.recorded_at || new Date().toISOString();
    if (options.record?.id) {
      await updateRecord(captureTable(kind), options.record.id, row);
    } else {
      await insert(captureTable(kind), row);
    }
    dialog.close();
    dialog.remove();
    await loadData();
    setView(viewForKind(kind));
  };
}
function captureFields(kind, record = {}) {
  const recordedAt = toDateTimeLocal(record?.recorded_at);
  if (kind === "oxygen") return `<form class="stack"><div class="confirm-numbers"><label>Oxygen Level<input name="oxygen_level" type="number" min="0" max="100" value="${esc(record?.oxygen_level || "")}" /></label><label>Pulse<input name="pulse_rate" type="number" value="${esc(record?.pulse_rate || "")}" /></label></div><label>Date and time<input name="recorded_at" type="datetime-local" value="${recordedAt}" /></label><label>Notes<textarea name="notes">${esc(record?.notes || "")}</textarea></label></form>`;
  if (kind === "bp") return `<form class="stack"><div class="confirm-numbers"><label>Systolic<input name="systolic" type="number" value="${esc(record?.systolic || "")}" /></label><label>Diastolic<input name="diastolic" type="number" value="${esc(record?.diastolic || "")}" /></label><label>Pulse<input name="pulse_rate" type="number" value="${esc(record?.pulse_rate || "")}" /></label></div><label>Date and time<input name="recorded_at" type="datetime-local" value="${recordedAt}" /></label><label>Notes<textarea name="notes">${esc(record?.notes || "")}</textarea></label></form>`;
  if (kind === "watch") return `<form class="stack"><label>Where is this from?<select name="source_app">${["Fitbit","Apple Watch","Apple Health","Google Health","Other"].map((source) => `<option ${record?.source_app === source ? "selected" : ""}>${source}</option>`).join("")}</select></label><div class="grid two">${fields(["summary_date:Summary date:date","summary_date_range_start:Start date:date","summary_date_range_end:End date:date","resting_heart_rate:Resting heart rate:number","average_heart_rate:Average heart rate:number","heart_rate_range:Heart rate range","steps:Steps:number","sleep_duration:Sleep","sleep_score:Sleep score:number","weight:Weight:number","spo2:Oxygen:number","breathing_rate:Breathing rate:number"])}</div><label>Extracted text<textarea name="extracted_text">${esc(record?.extracted_text || "")}</textarea></label><label>Notes<textarea name="notes">${esc(record?.notes || "")}</textarea></label></form>`;
  return `<form class="stack"><label>Medication name<input name="medication_name" value="${esc(record?.medication_name || "")}" /></label><label>Notes<textarea name="notes">${esc(record?.notes || "")}</textarea></label></form>`;
}
function fillFormFromRecord(form, record = {}) {
  if (!form || !record) return;
  Object.entries(record).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field || value === null || value === undefined) return;
    if (field.type === "datetime-local") {
      field.value = toDateTimeLocal(value);
    } else if (field.type === "date") {
      field.value = String(value).slice(0, 10);
    } else {
      field.value = value;
    }
  });
}
function captureTable(kind) {
  return tableForKind(kind);
}
function findRecord(kind, id) {
  return (state.data[tableForKind(kind)] || []).find((item) => item.id === id);
}
function openRecordModal(kind, id) {
  const record = findRecord(kind, id);
  if (!record) return alert("We could not find this record.");
  const dialog = document.createElement("dialog");
  const image = record.photo_signed_url ? `<img class="preview" src="${esc(record.photo_signed_url)}" alt="${kind === "watch" ? "Watch summary image" : "Photo of reading"}" />` : `<div class="note">No image is attached to this record.</div>`;
  dialog.innerHTML = `<div class="modal-content stack"><h2>${esc(recordTitle(kind, record))}</h2>${image}<p class="muted">${esc(record.source || (kind === "watch" ? "Captured from watch summary" : "Captured from photo"))}</p>${captureFields(kind, record)}<div class="actions"><button class="primary" id="save-record">Save Changes</button><button class="ghost" id="replace-record">${kind === "watch" ? "Replace Image" : "Retake Photo"}</button><button class="danger" id="delete-record">Delete</button><button class="ghost" id="close-record">Close</button></div></div>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  fillFormFromRecord(dialog.querySelector("form"), record);
  dialog.querySelector("#close-record").onclick = () => { dialog.close(); dialog.remove(); };
  dialog.querySelector("#replace-record").onclick = () => { dialog.close(); dialog.remove(); askImage(kind, { record }); };
  dialog.querySelector("#delete-record").onclick = async () => {
    if (!confirm("Delete this record?")) return;
    await deleteRecord(tableForKind(kind), id);
    dialog.close();
    dialog.remove();
    await loadData();
    setView(viewForKind(kind));
  };
  dialog.querySelector("#save-record").onclick = async () => {
    const form = Object.fromEntries(new FormData(dialog.querySelector("form")));
    await updateRecord(tableForKind(kind), id, form);
    dialog.close();
    dialog.remove();
    await loadData();
    setView(viewForKind(kind));
  };
}
async function runOcr(file, kind, dialog) {
  const status = dialog.querySelector("#ocr-status");
  try {
    if (!window.Tesseract) throw new Error("OCR library unavailable.");
    status.textContent = "Reading the photo. You will confirm or correct the numbers before saving.";
    const result = await Tesseract.recognize(file, "eng");
    const text = result.data.text || "";
    status.textContent = text.trim() ? "OCR attempt complete. Please confirm or correct the values." : "We could not clearly read this photo. You can retake it or enter the numbers.";
    applyOcr(kind, text, dialog);
  } catch (error) {
    status.textContent = "We could not clearly read this photo. You can retake it or enter the numbers.";
  }
}
function applyOcr(kind, text, dialog) {
  const nums = (text.match(/\d{2,4}/g) || []).map(Number);
  const form = dialog.querySelector("form");
  if (kind === "oxygen") {
    const oxygen = nums.find((n) => n >= 70 && n <= 100);
    const pulse = nums.find((n) => n >= 35 && n <= 220 && n !== oxygen);
    if (oxygen) form.oxygen_level.value = oxygen;
    if (pulse) form.pulse_rate.value = pulse;
  } else if (kind === "bp") {
    const sys = nums.find((n) => n >= 80 && n <= 230);
    const dia = nums.find((n) => n >= 40 && n <= 140 && n !== sys);
    const pulse = nums.find((n) => n >= 35 && n <= 220 && n !== sys && n !== dia);
    if (sys) form.systolic.value = sys;
    if (dia) form.diastolic.value = dia;
    if (pulse) form.pulse_rate.value = pulse;
  } else if (kind === "watch") {
    form.extracted_text.value = text.trim();
    const steps = nums.find((n) => n > 500 && n < 100000);
    const hr = nums.find((n) => n >= 35 && n <= 220);
    const spo2 = nums.find((n) => n >= 70 && n <= 100);
    if (steps) form.steps.value = steps;
    if (hr) form.resting_heart_rate.value = hr;
    if (spo2) form.spo2.value = spo2;
  }
}
async function uploadPhoto(kind, file) {
  if (!state.supabase || !state.user) {
    alert("Please configure Supabase and log in before uploading photos.");
    throw new Error("Supabase not configured");
  }
  const bucket = BUCKETS[kind] || BUCKETS.medications;
  const path = `${state.user.id}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await state.supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return `${bucket}/${path}`;
}
const actions = {
  captureOxygen: () => askImage("oxygen"),
  captureBp: () => askImage("bp"),
  captureWatch: () => askImage("watch"),
  medPhoto: () => askImage("medications"),
  logout: async () => { await state.supabase?.auth.signOut(); state.session = null; state.user = null; setView("splash"); },
  resetPassword: async () => {
    if (!state.supabase) return alert("Add Supabase connection first.");
    const email = prompt("Email for password reset");
    if (!email) return;
    const { error } = await state.supabase.auth.resetPasswordForEmail(email);
    alert(error ? error.message : "Password reset email sent.");
  },
  downloadReport: () => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) return alert("PDF library is unavailable.");
    const doc = new jsPDF();
    const logo = document.querySelector(".brand img");
    try {
      if (logo) doc.addImage(logo, "PNG", 12, 10, 18, 18);
    } catch (error) {
      console.warn("Logo could not be added to PDF", error);
    }
    doc.setFontSize(16);
    doc.text("ArcCare by Adivyne Arc", 34, 20);
    doc.setFontSize(10);
    let y = 38;
    reportTextLines().forEach((line) => {
      const wrapped = doc.splitTextToSize(line, 180);
      if (y + wrapped.length * 6 > 282) {
        doc.addPage();
        y = 16;
      }
      doc.text(wrapped, 12, y);
      y += Math.max(6, wrapped.length * 6);
    });
    doc.save("ArcCare-Provider-Report.pdf");
  },
  printReport: () => window.print(),
  emailReport: () => {
    const email = document.querySelector("#report-email")?.value || state.profile.provider_email || "";
    const name = [state.profile.first_name, state.profile.last_name].filter(Boolean).join(" ") || "Patient";
    const body = "Hello, I am sharing my recent oxygen, pulse, blood pressure, watch summary, weight, medication, refill, and appointment history for review. Please see the attached report.";
    location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Health Tracking Report for ${name}`)}&body=${encodeURIComponent(body + "\n\nPlease attach the downloaded ArcCare PDF report before sending.")}`;
  },
};
document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action || actions[action]) return;
  const [verb, type, id] = action.split(":");
  if (verb === "delete") {
    const table = TABLES[type] || type;
    if (confirm("Delete this record?")) {
      await deleteRecord(table, id);
      await loadData();
      render();
    }
  }
  if (verb === "viewRecord") {
    openRecordModal(type, id);
  }
  if (verb === "replacePhoto") {
    const record = findRecord(type, id);
    if (!record) return alert("We could not find this record.");
    askImage(type, { record });
  }
  if (verb === "edit") {
    const table = type === "oxygen" ? TABLES.oxygen : TABLES.bp;
    const row = (state.data[table] || []).find((item) => item.id === id);
    if (!row) return;
    const updates = type === "oxygen"
      ? {
          oxygen_level: prompt("Oxygen Level", row.oxygen_level ?? ""),
          pulse_rate: prompt("Pulse", row.pulse_rate ?? ""),
          notes: prompt("Notes", row.notes ?? ""),
        }
      : {
          systolic: prompt("Systolic", row.systolic ?? ""),
          diastolic: prompt("Diastolic", row.diastolic ?? ""),
          pulse_rate: prompt("Pulse", row.pulse_rate ?? ""),
          notes: prompt("Notes", row.notes ?? ""),
        };
    if (Object.values(updates).some((value) => value === null)) return;
    await updateRecord(table, id, updates);
    await loadData();
    render();
  }
  if (verb === "quickQuestion") {
    document.querySelector("[name=question]").value = action.replace("quickQuestion:", "");
  }
  if (verb === "presetReminder") {
    const form = document.querySelector("#reminder-form");
    if (!form) return;
    form.elements.reminder_type.value = type;
    form.elements.message.value = action.split(":").slice(2).join(":");
    form.elements.title.value = "Care reminder";
  }
  if (verb === "completeReminder") {
    await updateRecord(TABLES.reminders, type, { completed: true });
    await loadData();
    render();
  }
  if (verb === "medLog") {
    await insert(TABLES.medLogs, { medication_id: id, status: type, taken_at: new Date().toISOString() });
    await loadData();
    render();
  }
  if (verb === "markRefill") {
    await insert("refill_reminders", { medication_id: type, refill_date: new Date().toISOString().slice(0, 10), reminder_status: "Marked refilled", marked_refilled_at: new Date().toISOString() });
    await loadData();
    render();
  }
});
boot();
