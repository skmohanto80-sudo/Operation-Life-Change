const STORAGE_KEY = "operation-life-change-data-v2";
const RATING_KEYS = ["Mood", "Exercise", "Spiritual", "Study", "Tracker"];
const WATER_TARGET = 2000;

const defaultData = {
  affirmation: "",
  dailyRecords: {},
  weeklyPlans: [],
  timetable: []
};

let appData = loadData();
let supabaseClient = null;
let currentUser = null;

const forms = {
  auth: document.getElementById("authForm"),
  affirmation: document.getElementById("affirmationForm"),
  goal: document.getElementById("goalForm"),
  task: document.getElementById("taskForm"),
  study: document.getElementById("studyForm"),
  fitness: document.getElementById("fitnessForm"),
  religion: document.getElementById("religionForm"),
  water: document.getElementById("waterForm"),
  screenTime: document.getElementById("screenTimeForm"),
  weeklyPlan: document.getElementById("weeklyPlanForm"),
  timetable: document.getElementById("timetableForm"),
  reflection: document.getElementById("reflectionForm")
};

const navButtons = document.querySelectorAll(".nav-btn");
const jumpButtons = document.querySelectorAll(".jump-btn");
const views = document.querySelectorAll(".view");
const pageShell = document.querySelector(".page-shell");
let activeView = "dashboard";
const authStatus = document.getElementById("authStatus");
const signUpBtn = document.getElementById("signUpBtn");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const installAppBtn = document.getElementById("installAppBtn");
const installStatus = document.getElementById("installStatus");
const openingScreen = document.getElementById("openingScreen");
const openingProgressBar = document.getElementById("openingProgressBar");
let viewTransitionLock = false;
let deferredInstallPrompt = null;

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function createDailyRecord() {
  return {
    goals: [],
    tasks: [],
    studySessions: [],
    fitnessRecords: [],
    religionHabits: [],
    waterEntries: [],
    screenTimeEntries: [],
    reflection: { goal: "", result: "", text: "" },
    ratings: Object.fromEntries(RATING_KEYS.map((key) => [key, 0]))
  };
}

function normalizeStudySession(session) {
  return {
    id: session.id || createId(),
    subject: session.subject || "",
    hours: Number(session.hours) || 0,
    score: session.score ?? "",
    note: session.note || "",
    completed: Boolean(session.completed),
    starred: Boolean(session.starred),
    createdAt: session.createdAt || new Date().toISOString()
  };
}

function normalizeHabit(item) {
  return {
    id: item.id || createId(),
    title: item.title || "",
    goal: item.goal || "",
    completed: Boolean(item.completed),
    createdAt: item.createdAt || new Date().toISOString(),
    height: item.height ?? "",
    weight: item.weight ?? ""
  };
}

function normalizeDailyRecord(record) {
  const safe = record || {};
  const ratings = { ...createDailyRecord().ratings, ...(safe.ratings || {}) };
  return {
    goals: Array.isArray(safe.goals) ? safe.goals : [],
    tasks: Array.isArray(safe.tasks) ? safe.tasks.map((task) => ({
      id: task.id || createId(),
      name: task.name || "",
      points: Number(task.points) || 0,
      completed: Boolean(task.completed),
      createdAt: task.createdAt || new Date().toISOString()
    })) : [],
    studySessions: Array.isArray(safe.studySessions) ? safe.studySessions.map(normalizeStudySession) : [],
    fitnessRecords: Array.isArray(safe.fitnessRecords) ? safe.fitnessRecords.map(normalizeHabit) : [],
    religionHabits: Array.isArray(safe.religionHabits) ? safe.religionHabits.map(normalizeHabit) : [],
    waterEntries: Array.isArray(safe.waterEntries) ? safe.waterEntries : [],
    screenTimeEntries: Array.isArray(safe.screenTimeEntries) ? safe.screenTimeEntries : [],
    reflection: {
      goal: safe.reflection?.goal || "",
      result: safe.reflection?.result || "",
      text: safe.reflection?.text || ""
    },
    ratings
  };
}

function migrateLegacy(parsed) {
  const migrated = cloneDefaultData();
  const records = {};

  function place(dateString, key, value) {
    const dateKey = (dateString || new Date().toISOString()).slice(0, 10);
    if (!records[dateKey]) records[dateKey] = createDailyRecord();
    records[dateKey][key].push(value);
  }

  (parsed.tasks || []).forEach((task) => place(task.createdAt, "tasks", {
    id: task.id || createId(),
    name: task.name || "",
    points: Number(task.points) || 0,
    completed: Boolean(task.completed),
    createdAt: task.createdAt || new Date().toISOString()
  }));

  (parsed.studySessions || []).forEach((session) => place(session.createdAt, "studySessions", normalizeStudySession(session)));
  (parsed.fitnessHabits || []).forEach((item) => place(item.createdAt, "fitnessRecords", normalizeHabit(item)));
  (parsed.religionHabits || []).forEach((item) => place(item.createdAt, "religionHabits", normalizeHabit(item)));

  const legacyDate = Object.keys(records)[0] || todayKey();
  if (!records[legacyDate]) records[legacyDate] = createDailyRecord();
  records[legacyDate].reflection = {
    goal: parsed.reflection?.goal || "",
    result: "",
    text: parsed.reflection?.text || ""
  };

  migrated.affirmation = parsed.affirmation || "";
  migrated.dailyRecords = records;
  migrated.weeklyPlans = Array.isArray(parsed.weeklyPlans) ? parsed.weeklyPlans : [];
  migrated.timetable = Array.isArray(parsed.timetable) ? parsed.timetable : [];
  return migrated;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("operation-life-change-data");
  if (!raw) return cloneDefaultData();

  try {
    const parsed = JSON.parse(raw);
    if (parsed.dailyRecords) {
      return {
        affirmation: parsed.affirmation || "",
        dailyRecords: Object.fromEntries(Object.entries(parsed.dailyRecords).map(([key, value]) => [key, normalizeDailyRecord(value)])),
        weeklyPlans: Array.isArray(parsed.weeklyPlans) ? parsed.weeklyPlans : [],
        timetable: Array.isArray(parsed.timetable) ? parsed.timetable : []
      };
    }
    return migrateLegacy(parsed);
  } catch {
    return cloneDefaultData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function isSupabaseConfigured() {
  return Boolean(
    window.SUPABASE_CONFIG &&
    window.SUPABASE_CONFIG.url &&
    window.SUPABASE_CONFIG.anonKey &&
    window.supabase
  );
}

function initSupabase() {
  if (!isSupabaseConfigured()) {
    authStatus.textContent = "Local mode active. Add free Supabase keys to enable cross-device sync.";
    return;
  }

  supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );
}

function setAuthStatus(message) {
  authStatus.textContent = message;
}

function setInstallStatus(message) {
  if (installStatus) {
    installStatus.textContent = message;
  }
}

async function loadCloudData() {
  if (!supabaseClient || !currentUser) return;

  const { data, error } = await supabaseClient
    .from("life_change_profiles")
    .select("app_data")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    setAuthStatus(`Logged in, but cloud load failed: ${error.message}`);
    return;
  }

  if (data?.app_data) {
    appData = {
      affirmation: data.app_data.affirmation || "",
      dailyRecords: Object.fromEntries(
        Object.entries(data.app_data.dailyRecords || {}).map(([key, value]) => [key, normalizeDailyRecord(value)])
      ),
      weeklyPlans: Array.isArray(data.app_data.weeklyPlans) ? data.app_data.weeklyPlans : [],
      timetable: Array.isArray(data.app_data.timetable) ? data.app_data.timetable : []
    };
    saveData();
  }

  setAuthStatus(`Logged in as ${currentUser.email}. Cloud sync is active.`);
}

async function syncToCloud() {
  if (!supabaseClient || !currentUser) return;

  const { error } = await supabaseClient.from("life_change_profiles").upsert({
    user_id: currentUser.id,
    email: currentUser.email,
    app_data: appData,
    updated_at: new Date().toISOString()
  });

  if (error) {
    setAuthStatus(`Logged in, but cloud sync failed: ${error.message}`);
    return;
  }

  setAuthStatus(`Logged in as ${currentUser.email}. Synced to free cloud database.`);
}

function getTodayRecord() {
  const key = todayKey();
  if (!appData.dailyRecords[key]) appData.dailyRecords[key] = createDailyRecord();
  return appData.dailyRecords[key];
}

function createId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function getTodayStats() {
  const today = getTodayRecord();
  const points = today.tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.points, 0);
  const studyHours = today.studySessions.reduce((sum, session) => sum + Number(session.hours), 0);
  const screenMinutes = today.screenTimeEntries.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const water = today.waterEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const completedGoals = today.goals.filter((goal) => goal.completed).length;
  const scoreValues = today.studySessions.map((item) => Number(item.score)).filter((value) => Number.isFinite(value) && value > 0);
  const studyScore = scoreValues.length ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;
  return { points, studyHours, screenMinutes, water, completedGoals, studyScore, totalGoals: today.goals.length };
}

function updateHeader() {
  const now = new Date();
  document.getElementById("todayDate").textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("todayYear").textContent = now.getFullYear();
  const stats = getTodayStats();
  const totalDone = stats.completedGoals + getTodayRecord().tasks.filter((task) => task.completed).length + getTodayRecord().studySessions.filter((item) => item.completed).length;
  const message = document.getElementById("dailyMessage");
  if (totalDone >= 8) message.textContent = "You are building real discipline today. Keep the momentum.";
  else if (totalDone >= 4) message.textContent = "Solid progress. A few more actions will make today a big win.";
  else message.textContent = "Small consistent steps will turn this mission into your lifestyle.";
}

function startClock() {
  function tick() {
    document.getElementById("liveClock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tick();
  setInterval(tick, 1000);
}

function updateStats() {
  const stats = getTodayStats();
  document.getElementById("totalPoints").textContent = stats.points;
  document.getElementById("studyHours").textContent = stats.studyHours.toFixed(1);
  document.getElementById("studyScoreStat").textContent = stats.studyScore;
  document.getElementById("screenTimeStat").textContent = formatMinutes(stats.screenMinutes);
  document.getElementById("waterStat").textContent = `${stats.water} ml`;
  document.getElementById("completedGoalsStat").textContent = stats.completedGoals;
  document.getElementById("waterProgressText").textContent = `${stats.water} of ${WATER_TARGET} ml`;
  document.getElementById("waterProgressBar").style.width = `${Math.min(100, (stats.water / WATER_TARGET) * 100)}%`;
  const goalPercent = stats.totalGoals ? Math.round((stats.completedGoals / stats.totalGoals) * 100) : 0;
  document.getElementById("goalProgressText").textContent = `${goalPercent}% complete`;
  document.getElementById("goalProgressBar").style.width = `${goalPercent}%`;
}

function renderEmptyState(container, message) {
  container.classList.add("empty-state");
  container.innerHTML = `<p class="empty-message">${message}</p>`;
}

function renderTasks() {
  const list = document.getElementById("taskList");
  const tasks = getTodayRecord().tasks;
  if (!tasks.length) return renderEmptyState(list, "No household tasks yet. Add your first point-based work.");
  list.classList.remove("empty-state");
  list.innerHTML = tasks.map((task) => `
    <article class="item-card">
      <div class="item-card-top">
        <div><h3>${escapeHtml(task.name)}</h3><p>Added ${formatDate(task.createdAt)}</p></div>
        <span class="pill ${task.completed ? "status-done" : ""}">${task.completed ? "Completed" : `${task.points} points`}</span>
      </div>
      <div class="item-card-bottom">
        <p>${task.completed ? "This task is counted in today's points." : "Finish this work to earn points today."}</p>
        <div class="action-group">
          <button class="secondary-btn" onclick="toggleItem('tasks','${task.id}')">${task.completed ? "Mark Pending" : "Mark Done"}</button>
          <button class="secondary-btn" onclick="deleteDailyItem('tasks','${task.id}')">Delete</button>
        </div>
      </div>
    </article>`).join("");
}

function renderStudySessions() {
  const list = document.getElementById("studyList");
  const sessions = getTodayRecord().studySessions;
  if (!sessions.length) return renderEmptyState(list, "No study session saved yet.");
  list.classList.remove("empty-state");
  list.innerHTML = sessions.map((session) => `
    <article class="item-card">
      <div class="item-card-top">
        <div><h3>${escapeHtml(session.subject)}</h3><p>${escapeHtml(session.note || "No note added.")}</p></div>
        <div class="meta-row">
          <span class="pill score-pill">${session.hours} hrs</span>
          ${session.score !== "" ? `<span class="pill score-pill">Score ${escapeHtml(session.score)}</span>` : ""}
          <span class="pill ${session.completed ? "status-done" : ""}">${session.completed ? "Done" : "Pending"}</span>
          ${session.starred ? '<span class="pill status-starred">Starred</span>' : ""}
        </div>
      </div>
      <div class="item-card-bottom">
        <p>Saved ${formatDate(session.createdAt)}</p>
        <div class="action-group">
          <button class="secondary-btn" onclick="toggleStudyCompleted('${session.id}')">${session.completed ? "Mark Pending" : "Mark Done"}</button>
          <button class="icon-btn ${session.starred ? "active" : ""}" onclick="toggleStudyStar('${session.id}')" aria-label="Toggle star">Star</button>
          <button class="secondary-btn" onclick="deleteDailyItem('studySessions','${session.id}')">Delete</button>
        </div>
      </div>
    </article>`).join("");
}

function renderHabitList(containerId, key, typeLabel) {
  const container = document.getElementById(containerId);
  const items = getTodayRecord()[key];
  if (!items.length) return renderEmptyState(container, `No ${typeLabel} record added yet.`);
  container.classList.remove("empty-state");
  container.innerHTML = items.map((item) => `
    <article class="item-card">
      <div class="item-card-top">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.goal)}</p>
          ${item.height || item.weight ? `<p>Height: ${escapeHtml(item.height || "-")} cm | Weight: ${escapeHtml(item.weight || "-")} kg</p>` : ""}
        </div>
        <span class="pill ${item.completed ? "status-done" : ""}">${item.completed ? "Done" : "In Progress"}</span>
      </div>
      <div class="item-card-bottom">
        <p>Saved ${formatDate(item.createdAt)}</p>
        <div class="action-group">
          <button class="secondary-btn" onclick="toggleItem('${key}','${item.id}')">${item.completed ? "Mark Pending" : "Mark Done"}</button>
          <button class="secondary-btn" onclick="deleteDailyItem('${key}','${item.id}')">Delete</button>
        </div>
      </div>
    </article>`).join("");
}

function renderGoals() {
  const list = document.getElementById("dailyGoalList");
  const goals = getTodayRecord().goals;
  if (!goals.length) return renderEmptyState(list, "No daily goals yet. Add your first goal for today.");
  list.classList.remove("empty-state");
  list.innerHTML = goals.map((goal) => `
    <article class="item-card goal-item">
      <div class="item-card-top">
        <div><h3>${escapeHtml(goal.text)}</h3><p>Added ${formatDate(goal.createdAt)}</p></div>
        <span class="pill ${goal.completed ? "status-done" : ""}">${goal.completed ? "Done" : "Pending"}</span>
      </div>
      <div class="action-group">
        <button class="secondary-btn" onclick="toggleItem('goals','${goal.id}')">${goal.completed ? "Mark Pending" : "Mark Done"}</button>
        <button class="secondary-btn" onclick="deleteDailyItem('goals','${goal.id}')">Delete</button>
      </div>
    </article>`).join("");
}

function renderWater() {
  const list = document.getElementById("waterList");
  const entries = getTodayRecord().waterEntries;
  if (!entries.length) return renderEmptyState(list, "No water intake recorded yet.");
  list.classList.remove("empty-state");
  list.innerHTML = entries.map((item) => `
    <article class="item-card">
      <div class="item-card-top"><div><h3>${item.amount} ml</h3><p>${escapeHtml(item.note || "No note added.")}</p></div><span class="pill score-pill">Hydration</span></div>
      <div class="item-card-bottom"><p>Saved ${formatDate(item.createdAt)}</p><button class="secondary-btn" onclick="deleteDailyItem('waterEntries','${item.id}')">Delete</button></div>
    </article>`).join("");
}

function renderScreenTime() {
  const list = document.getElementById("screenTimeList");
  const entries = getTodayRecord().screenTimeEntries;
  if (!entries.length) return renderEmptyState(list, "No screen time recorded yet.");
  list.classList.remove("empty-state");
  list.innerHTML = entries.map((item) => `
    <article class="item-card">
      <div class="item-card-top"><div><h3>${escapeHtml(item.app)} on ${escapeHtml(item.device)}</h3><p>${escapeHtml(item.purpose)}</p></div><span class="pill score-pill">${formatMinutes(item.minutes)}</span></div>
      <div class="item-card-bottom"><p>Saved ${formatDate(item.createdAt)}</p><button class="secondary-btn" onclick="deleteDailyItem('screenTimeEntries','${item.id}')">Delete</button></div>
    </article>`).join("");
}

function renderReflection() {
  const reflection = getTodayRecord().reflection;
  document.getElementById("savedGoal").textContent = reflection.goal || "No target saved yet.";
  document.getElementById("savedResult").textContent = reflection.result || "No result saved yet.";
  document.getElementById("savedReflection").textContent = reflection.text || "No reflection saved yet.";
  document.getElementById("mainGoal").value = reflection.goal;
  document.getElementById("resultText").value = reflection.result;
  document.getElementById("reflectionText").value = reflection.text;
}

function renderAffirmation() {
  document.getElementById("affirmationText").value = appData.affirmation || "";
  document.getElementById("dashboardAffirmation").textContent = appData.affirmation || "No affirmation saved yet.";
}

function renderRatings() {
  const board = document.getElementById("ratingBoard");
  const summary = document.getElementById("ratingsOverview");
  const ratings = getTodayRecord().ratings;
  board.innerHTML = RATING_KEYS.map((key) => `
    <div class="rating-row">
      <div><h3>${key}</h3><p>${ratings[key]}/5</p></div>
      <div class="star-group">${[1,2,3,4,5].map((value) => `<button class="star-btn ${ratings[key] >= value ? "active" : ""}" onclick="setRating('${key}', ${value})">${value}</button>`).join("")}</div>
    </div>`).join("");
  summary.innerHTML = RATING_KEYS.map((key) => `<div class="rating-chip"><strong>${key}</strong><p>${ratings[key]}/5</p></div>`).join("");
}

function renderWeeklyPlanner() {
  const weeklyList = document.getElementById("weeklyPlanList");
  const timetableList = document.getElementById("timetableList");
  if (!appData.weeklyPlans.length) renderEmptyState(weeklyList, "No weekly plans yet.");
  else {
    weeklyList.classList.remove("empty-state");
    weeklyList.innerHTML = appData.weeklyPlans.map((item) => `
      <article class="item-card"><div class="item-card-top"><div><h3>${escapeHtml(item.day)}</h3><p>${escapeHtml(item.task)}</p></div></div><div class="item-card-bottom"><p>Saved ${formatDate(item.createdAt)}</p><button class="secondary-btn" onclick="deleteGlobalItem('weeklyPlans','${item.id}')">Delete</button></div></article>`).join("");
  }
  if (!appData.timetable.length) renderEmptyState(timetableList, "No timetable items yet.");
  else {
    timetableList.classList.remove("empty-state");
    timetableList.innerHTML = appData.timetable.map((item) => `
      <article class="item-card"><div class="item-card-top"><div><h3>${escapeHtml(item.time)}</h3><p>${escapeHtml(item.task)}</p></div></div><div class="item-card-bottom"><p>Saved ${formatDate(item.createdAt)}</p><button class="secondary-btn" onclick="deleteGlobalItem('timetable','${item.id}')">Delete</button></div></article>`).join("");
  }
}

function getLastSevenDayStats() {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const record = normalizeDailyRecord(appData.dailyRecords[key]);
    days.push({
      label: date.toLocaleDateString([], { weekday: "short" }),
      points: record.tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.points, 0),
      water: record.waterEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    });
  }
  return days;
}

function renderCharts() {
  const chart = document.getElementById("chartBars");
  const days = getLastSevenDayStats();
  const maxPoints = Math.max(1, ...days.map((day) => day.points));
  chart.innerHTML = days.map((day) => `
    <div class="chart-row">
      <div class="chart-meta"><span>${day.label}</span><span>${day.points} pts | ${day.water} ml</span></div>
      <div class="chart-track"><div class="chart-fill" style="width:${(day.points / maxPoints) * 100}%"></div></div>
    </div>`).join("");
}

function renderHistory() {
  const history = document.getElementById("historyList");
  const keys = Object.keys(appData.dailyRecords).sort().reverse().slice(0, 7);
  if (!keys.length) return renderEmptyState(history, "No daily record history yet.");
  history.classList.remove("empty-state");
  history.innerHTML = keys.map((key) => {
    const record = normalizeDailyRecord(appData.dailyRecords[key]);
    const points = record.tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.points, 0);
    const water = record.waterEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const screen = record.screenTimeEntries.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    return `<div class="history-item"><h3>${key}</h3><p>Points: ${points} | Water: ${water} ml | Screen: ${formatMinutes(screen)} | Goals: ${record.goals.filter((goal) => goal.completed).length}/${record.goals.length}</p></div>`;
  }).join("");
}

function renderAll() {
  updateHeader();
  renderAffirmation();
  updateStats();
  renderGoals();
  renderTasks();
  renderStudySessions();
  renderHabitList("fitnessList", "fitnessRecords", "fitness");
  renderHabitList("religionList", "religionHabits", "religion");
  renderWater();
  renderScreenTime();
  renderReflection();
  renderRatings();
  renderWeeklyPlanner();
  renderCharts();
  renderHistory();
}

function setActiveView(viewName) {
  if (viewTransitionLock || viewName === activeView) {
    if (viewName === activeView) {
      pageShell.classList.toggle("focus-mode", viewName !== "dashboard");
    }
    return;
  }

  viewTransitionLock = true;
  const currentView = document.getElementById(`view-${activeView}`);
  if (currentView) {
    currentView.classList.remove("active");
  }

  setTimeout(() => {
  views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  activeView = viewName;
  pageShell.classList.toggle("focus-mode", viewName !== "dashboard");
    viewTransitionLock = false;
  }, 140);
}

function saveAndRender() {
  saveData();
  renderAll();
  setActiveView(activeView);
  syncToCloud();
}

function bindForms() {
  signUpBtn.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Add your free Supabase project URL and anon key in supabase-config.js first.");
      return;
    }

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      setAuthStatus(`Sign up failed: ${error.message}`);
      return;
    }
    setAuthStatus("Sign up sent. Check your email if confirmation is required, then log in.");
  });

  signInBtn.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Add your free Supabase project URL and anon key in supabase-config.js first.");
      return;
    }

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthStatus(`Login failed: ${error.message}`);
      return;
    }
    currentUser = data.user;
    await loadCloudData();
    renderAll();
  });

  signOutBtn.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("You are in local mode.");
      return;
    }
    await supabaseClient.auth.signOut();
    currentUser = null;
    setAuthStatus("Logged out. Local data is still available on this device.");
  });

  forms.affirmation.addEventListener("submit", (event) => {
    event.preventDefault();
    appData.affirmation = document.getElementById("affirmationText").value.trim();
    saveAndRender();
  });

  forms.goal.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().goals.unshift({ id: createId(), text: document.getElementById("goalText").value.trim(), completed: false, createdAt: new Date().toISOString() });
    forms.goal.reset();
    saveAndRender();
  });

  forms.task.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().tasks.unshift({ id: createId(), name: document.getElementById("taskName").value.trim(), points: Number(document.getElementById("taskPoints").value), completed: false, createdAt: new Date().toISOString() });
    forms.task.reset();
    saveAndRender();
  });

  forms.study.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().studySessions.unshift({ id: createId(), subject: document.getElementById("studySubject").value.trim(), hours: Number(document.getElementById("studyTime").value), score: document.getElementById("studyScore").value.trim(), note: document.getElementById("studyNote").value.trim(), completed: false, starred: false, createdAt: new Date().toISOString() });
    forms.study.reset();
    saveAndRender();
  });

  forms.fitness.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().fitnessRecords.unshift({ id: createId(), title: document.getElementById("fitnessActivity").value.trim(), goal: document.getElementById("fitnessGoal").value.trim(), height: document.getElementById("fitnessHeight").value.trim(), weight: document.getElementById("fitnessWeight").value.trim(), completed: false, createdAt: new Date().toISOString() });
    forms.fitness.reset();
    saveAndRender();
  });

  forms.religion.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().religionHabits.unshift({ id: createId(), title: document.getElementById("religionPractice").value.trim(), goal: document.getElementById("religionGoal").value.trim(), completed: false, createdAt: new Date().toISOString() });
    forms.religion.reset();
    saveAndRender();
  });

  forms.water.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().waterEntries.unshift({ id: createId(), amount: Number(document.getElementById("waterAmount").value), note: document.getElementById("waterNote").value.trim(), createdAt: new Date().toISOString() });
    forms.water.reset();
    saveAndRender();
  });

  forms.screenTime.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().screenTimeEntries.unshift({ id: createId(), device: document.getElementById("screenDevice").value.trim(), app: document.getElementById("screenApp").value.trim(), purpose: document.getElementById("screenPurpose").value.trim(), minutes: Number(document.getElementById("screenMinutes").value), createdAt: new Date().toISOString() });
    forms.screenTime.reset();
    saveAndRender();
  });

  forms.weeklyPlan.addEventListener("submit", (event) => {
    event.preventDefault();
    appData.weeklyPlans.unshift({ id: createId(), day: document.getElementById("weeklyDay").value, task: document.getElementById("weeklyTask").value.trim(), createdAt: new Date().toISOString() });
    forms.weeklyPlan.reset();
    saveAndRender();
  });

  forms.timetable.addEventListener("submit", (event) => {
    event.preventDefault();
    appData.timetable.unshift({ id: createId(), time: document.getElementById("timetableTime").value.trim(), task: document.getElementById("timetableTask").value.trim(), createdAt: new Date().toISOString() });
    forms.timetable.reset();
    saveAndRender();
  });

  forms.reflection.addEventListener("submit", (event) => {
    event.preventDefault();
    getTodayRecord().reflection = {
      goal: document.getElementById("mainGoal").value.trim(),
      result: document.getElementById("resultText").value.trim(),
      text: document.getElementById("reflectionText").value.trim()
    };
    saveAndRender();
  });
}

window.toggleItem = function toggleItem(key, id) {
  const today = getTodayRecord();
  today[key] = today[key].map((item) => item.id === id ? { ...item, completed: !item.completed } : item);
  saveAndRender();
};

window.deleteDailyItem = function deleteDailyItem(key, id) {
  const today = getTodayRecord();
  today[key] = today[key].filter((item) => item.id !== id);
  saveAndRender();
};

window.deleteGlobalItem = function deleteGlobalItem(key, id) {
  appData[key] = appData[key].filter((item) => item.id !== id);
  saveAndRender();
};

window.toggleStudyCompleted = function toggleStudyCompleted(id) {
  const today = getTodayRecord();
  today.studySessions = today.studySessions.map((session) => session.id === id ? { ...session, completed: !session.completed } : session);
  saveAndRender();
};

window.toggleStudyStar = function toggleStudyStar(id) {
  const today = getTodayRecord();
  today.studySessions = today.studySessions.map((session) => session.id === id ? { ...session, starred: !session.starred } : session);
  saveAndRender();
};

window.setRating = function setRating(key, value) {
  getTodayRecord().ratings[key] = value;
  saveAndRender();
};

navButtons.forEach((button) => button.addEventListener("click", () => setActiveView(button.dataset.view)));
jumpButtons.forEach((button) => button.addEventListener("click", () => setActiveView(button.dataset.view)));

async function bootstrapAuth() {
  initSupabase();
  if (!supabaseClient) return;

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) {
    await loadCloudData();
  } else {
    setAuthStatus("Free cloud auth is ready. Sign up or log in to sync across devices.");
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) {
      await loadCloudData();
      renderAll();
    } else {
      setAuthStatus("Logged out. Local data is still available on this device.");
    }
  });
}

function playOpeningSequence() {
  if (!openingScreen || !openingProgressBar) return;

  const steps = [18, 36, 58, 82, 100];
  steps.forEach((value, index) => {
    setTimeout(() => {
      openingProgressBar.style.width = `${value}%`;
    }, index * 180);
  });

  setTimeout(() => {
    openingScreen.classList.add("hidden");
  }, 1150);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Keep the app usable even if service worker registration fails.
    });
  });
}

function setupInstallPrompt() {
  if (!installAppBtn) return;

  installAppBtn.disabled = true;
  installAppBtn.textContent = "Install Available After Hosting";

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppBtn.disabled = false;
    installAppBtn.textContent = "Install App";
    setInstallStatus("Install is ready. Tap the button to add the app to your home screen.");
  });

  installAppBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installAppBtn.disabled = true;
      installAppBtn.textContent = "Installed or Waiting";
      setInstallStatus("If the install prompt was accepted, the app is now available from your home screen.");
      return;
    }

    setInstallStatus("If the button is not active yet, open the hosted site on Chrome/Edge and use Add to Home screen.");
  });

  window.addEventListener("appinstalled", () => {
    installAppBtn.disabled = true;
    installAppBtn.textContent = "Installed";
    setInstallStatus("Operation Life Change is installed on this device.");
  });
}

bindForms();
renderAll();
pageShell.classList.toggle("focus-mode", false);
startClock();
bootstrapAuth();
registerServiceWorker();
playOpeningSequence();
setupInstallPrompt();
