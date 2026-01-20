/* =========================================
   Global State & Constants
   ========================================= */
const REPO_DATA_URL = './data.json'; // 実運用時はGitHub上のRaw URL等を指定
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

let adminData = {
    // デフォルト（読み込み失敗時用）
    timeSettings: [],
    timetables: {},
    tests: []
};

let userSettings = {
    classId: localStorage.getItem('userClass') || '21HR',
    icalUrl: localStorage.getItem('userIcal') || '',
    todos: JSON.parse(localStorage.getItem('userTodos')) || []
};

// Pomodoro State
let pomoInterval = null;
let pomoTime = 25 * 60;
let isPomoRunning = false;

/* =========================================
   Initialization
   ========================================= */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Admin Data
    try {
        const res = await fetch(REPO_DATA_URL);
        if(res.ok) adminData = await res.json();
    } catch (e) {
        console.error('Data load failed, using empty default', e);
    }

    // 2. Init UI Components
    initNavigation();
    initClock();
    renderDashboard();
    initTodo();
    initPomodoro();
    
    // Admin Init
    initAdmin();
    
    // Initial Render
    updateUI();
});

/* =========================================
   Navigation & Routing
   ========================================= */
function initNavigation() {
    const navs = {
        'btnHome': 'page-home',
        'btnSettings': 'page-settings',
        'btnAdmin': 'page-admin-login' // Default to login
    };

    // Class Select in Nav
    const classSelect = document.getElementById('userClassSelect');
    generateClassOptions(classSelect);
    classSelect.value = userSettings.classId;
    classSelect.addEventListener('change', (e) => {
        userSettings.classId = e.target.value;
        localStorage.setItem('userClass', userSettings.classId);
        updateUI();
    });

    // Page Switching
    Object.keys(navs).forEach(btnId => {
        document.getElementById(btnId).addEventListener('click', () => {
            // Remove active from all btns
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(btnId).classList.add('active');

            // Hide all pages
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // Show target
            let targetId = navs[btnId];
            if (btnId === 'btnAdmin' && isAdminLoggedIn) {
                targetId = 'page-admin-dashboard';
            }
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Settings Page Logic
    const settingSelect = document.getElementById('settingClassSelect');
    generateClassOptions(settingSelect);
    settingSelect.value = userSettings.classId;
    document.getElementById('icalUrlInput').value = userSettings.icalUrl;

    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        userSettings.classId = settingSelect.value;
        userSettings.icalUrl = document.getElementById('icalUrlInput').value;
        localStorage.setItem('userClass', userSettings.classId);
        localStorage.setItem('userIcal', userSettings.icalUrl);
        classSelect.value = userSettings.classId; // Sync Nav
        alert('設定を保存しました');
        updateUI();
    });
}

function generateClassOptions(selectElement) {
    selectElement.innerHTML = '';
    for(let i=21; i<=28; i++) {
        const opt = document.createElement('option');
        opt.value = `${i}HR`;
        opt.textContent = `${i}HR`;
        selectElement.appendChild(opt);
    }
}

/* =========================================
   Dashboard Logic
   ========================================= */
function initClock() {
    const updateTime = () => {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleTimeString('ja-JP', {hour12:false});
        document.getElementById('currentDate').textContent = 
            `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 (${DAYS_JP[now.getDay()]})`;
        
        checkPeriod(now);
    };
    setInterval(updateTime, 1000);
    updateTime();
}

function checkPeriod(now) {
    // Current time in minutes from midnight
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const todayStr = DAYS[now.getDay()];

    // Reset UI
    let statusText = "授業外";
    let nextText = "本日は終了、または授業がありません";
    let badgeText = "--";
    let timeDiff = "";

    // Get Schedule for today
    const classId = userSettings.classId;
    const daySchedule = adminData.timetables[classId]?.[todayStr] || {};

    if (Object.keys(daySchedule).length === 0) {
        document.getElementById('nextSubject').textContent = "本日は授業がありません";
        return;
    }

    // Find next class
    let foundNext = false;
    for (let i = 0; i < adminData.timeSettings.length; i++) {
        const period = adminData.timeSettings[i];
        const pStart = timeToMins(period.start);
        const pEnd = timeToMins(period.end);
        const periodNum = i + 1;
        const subject = daySchedule[periodNum] || "空き";

        if (currentMins < pStart) {
            // Before this period
            nextText = subject;
            badgeText = `${periodNum}限`;
            timeDiff = `${pStart - currentMins}分後`;
            foundNext = true;
            break;
        } else if (currentMins >= pStart && currentMins <= pEnd) {
            // During this period
            nextText = `現在: ${subject}`;
            badgeText = `${periodNum}限中`;
            timeDiff = `残り${pEnd - currentMins}分`;
            foundNext = true;
            break;
        }
    }

    if (!foundNext) {
        nextText = "本日の授業は全て終了しました";
    }

    document.getElementById('nextSubject').textContent = nextText;
    document.getElementById('nextPeriodBadge').textContent = badgeText;
    document.getElementById('timeUntilNext').textContent = timeDiff;
}

function updateUI() {
    renderSchedule();
    renderCountdown();
    renderCalendarStub();
}

function renderSchedule() {
    const list = document.getElementById('dailyScheduleList');
    list.innerHTML = '';
    const now = new Date();
    const todayStr = DAYS[now.getDay()];
    const classId = userSettings.classId;
    
    document.getElementById('scheduleDay').textContent = `${DAYS_JP[now.getDay()]}曜日`;

    const daySchedule = adminData.timetables[classId]?.[todayStr] || {};
    const currentMins = now.getHours() * 60 + now.getMinutes();

    adminData.timeSettings.forEach((setting, idx) => {
        const pNum = idx + 1;
        const li = document.createElement('li');
        const subject = daySchedule[pNum] || "-";
        
        // Highlight logic
        const pStart = timeToMins(setting.start);
        const pEnd = timeToMins(setting.end);
        if (currentMins >= pStart && currentMins <= pEnd) li.classList.add('current');

        li.innerHTML = `
            <span><span class="badge" style="margin-right:8px;">${pNum}</span> ${subject}</span>
            <span style="color:var(--text-sub); font-size:0.8rem;">${setting.start} - ${setting.end}</span>
        `;
        list.appendChild(li);
    });
}

function renderCountdown() {
    const container = document.getElementById('testCountdownContainer');
    // Find next test
    const now = new Date();
    const nextTest = adminData.tests
        .map(t => ({...t, dateObj: new Date(t.date)}))
        .filter(t => t.dateObj > now)
        .sort((a,b) => a.dateObj - b.dateObj)[0];

    if (!nextTest) {
        document.getElementById('targetTestName').textContent = "予定されているテストはありません";
        document.getElementById('testTimer').style.display = 'none';
        return;
    }

    document.getElementById('testTimer').style.display = 'flex';
    document.getElementById('targetTestName').textContent = nextTest.name;
    
    const diff = nextTest.dateObj - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    document.getElementById('cdDays').textContent = days;
    document.getElementById('cdHours').textContent = hours;
    document.getElementById('cdMins').textContent = mins;
}

/* =========================================
   ToDo List
   ========================================= */
function initTodo() {
    const input = document.getElementById('newTodoInput');
    const btn = document.getElementById('addTodoBtn');

    btn.addEventListener('click', () => {
        if(input.value.trim()) {
            userSettings.todos.push({ text: input.value, done: false });
            saveTodos();
            input.value = '';
        }
    });

    renderTodos();
}

function saveTodos() {
    localStorage.setItem('userTodos', JSON.stringify(userSettings.todos));
    renderTodos();
}

function renderTodos() {
    const list = document.getElementById('todoList');
    list.innerHTML = '';
    let doneCount = 0;

    userSettings.todos.forEach((todo, idx) => {
        if(todo.done) doneCount++;
        const li = document.createElement('li');
        li.className = todo.done ? 'done' : '';
        li.innerHTML = `
            <input type="checkbox" ${todo.done ? 'checked' : ''}>
            <span>${todo.text}</span>
            <button style="margin-left:auto; background:none; border:none; color:#aaa; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
        `;
        
        // Checkbox event
        li.querySelector('input').addEventListener('change', () => {
            userSettings.todos[idx].done = !userSettings.todos[idx].done;
            saveTodos();
        });

        // Delete event
        li.querySelector('button').addEventListener('click', () => {
            userSettings.todos.splice(idx, 1);
            saveTodos();
        });

        list.appendChild(li);
    });

    // Progress
    const total = userSettings.todos.length;
    document.getElementById('todoCount').textContent = `${doneCount}/${total} 完了`;
    const pct = total === 0 ? 0 : (doneCount / total) * 100;
    document.getElementById('todoProgress').style.width = `${pct}%`;
}

/* =========================================
   Pomodoro
   ========================================= */
function initPomodoro() {
    const timerDisplay = document.getElementById('pomoTimer');
    const startBtn = document.getElementById('pomoStartBtn');
    const resetBtn = document.getElementById('pomoResetBtn');

    const formatTime = (s) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    startBtn.addEventListener('click', () => {
        if (isPomoRunning) {
            clearInterval(pomoInterval);
            startBtn.textContent = '再開';
            isPomoRunning = false;
        } else {
            startBtn.textContent = '一時停止';
            isPomoRunning = true;
            pomoInterval = setInterval(() => {
                if (pomoTime > 0) {
                    pomoTime--;
                    timerDisplay.textContent = formatTime(pomoTime);
                } else {
                    clearInterval(pomoInterval);
                    alert('ポモドーロ終了！休憩しましょう。');
                    isPomoRunning = false;
                    startBtn.textContent = '開始';
                }
            }, 1000);
        }
    });

    resetBtn.addEventListener('click', () => {
        clearInterval(pomoInterval);
        pomoTime = 25 * 60;
        timerDisplay.textContent = "25:00";
        startBtn.textContent = '開始';
        isPomoRunning = false;
    });
}

/* =========================================
   Admin Logic
   ========================================= */
let isAdminLoggedIn = false;

function initAdmin() {
    // Login
    document.getElementById('adminLoginBtn').addEventListener('click', () => {
        const pass = document.getElementById('adminPasswordInput').value;
        if (pass === '1234') {
            isAdminLoggedIn = true;
            document.getElementById('page-admin-login').classList.remove('active');
            document.getElementById('page-admin-dashboard').classList.add('active');
            renderAdminDashboard();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Class/Day Selectors for Schedule Edit
    const adminClassSelect = document.getElementById('adminClassSelect');
    generateClassOptions(adminClassSelect);
    
    // Add Event Listeners for Dynamic Form Generation
    adminClassSelect.addEventListener('change', renderAdminScheduleEditor);
    document.getElementById('adminDaySelect').addEventListener('change', renderAdminScheduleEditor);

    // Save/Download
    document.getElementById('downloadJsonBtn').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(adminData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "data.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });
    
    // Test Add
    document.getElementById('addTestBtn').addEventListener('click', () => {
        const name = document.getElementById('newTestName').value;
        const date = document.getElementById('newTestDate').value;
        if(name && date) {
            adminData.tests.push({name, date});
            renderAdminTests();
            document.getElementById('newTestName').value = '';
        }
    });
}

function renderAdminDashboard() {
    renderAdminTimings();
    renderAdminScheduleEditor();
    renderAdminTests();
}

function renderAdminTimings() {
    const container = document.getElementById('timingsEditor');
    container.innerHTML = '';
    // Ensure 7 periods
    if (adminData.timeSettings.length < 7) {
        for(let i=0; i<7; i++) adminData.timeSettings[i] = {start: "00:00", end: "00:00"};
    }

    adminData.timeSettings.forEach((setting, idx) => {
        const div = document.createElement('div');
        div.className = 'schedule-row';
        div.innerHTML = `
            <label>${idx+1}限</label>
            <input type="time" value="${setting.start}" data-idx="${idx}" data-key="start">
            <span>~</span>
            <input type="time" value="${setting.end}" data-idx="${idx}" data-key="end">
        `;
        // Live binding
        div.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                adminData.timeSettings[e.target.dataset.idx][e.target.dataset.key] = e.target.value;
            });
        });
        container.appendChild(div);
    });
}

function renderAdminScheduleEditor() {
    const container = document.getElementById('scheduleEditor');
    const classId = document.getElementById('adminClassSelect').value || '21HR';
    const day = document.getElementById('adminDaySelect').value;

    container.innerHTML = '';
    
    // Init path if undefined
    if (!adminData.timetables[classId]) adminData.timetables[classId] = {};
    if (!adminData.timetables[classId][day]) adminData.timetables[classId][day] = {};

    for (let i = 1; i <= 7; i++) {
        const div = document.createElement('div');
        div.className = 'schedule-row';
        const currentVal = adminData.timetables[classId][day][i] || "";
        div.innerHTML = `
            <label>${i}限</label>
            <input type="text" value="${currentVal}" placeholder="科目名" data-period="${i}">
        `;
        div.querySelector('input').addEventListener('input', (e) => {
            adminData.timetables[classId][day][i] = e.target.value;
        });
        container.appendChild(div);
    }
}

function renderAdminTests() {
    const list = document.getElementById('adminTestList');
    list.innerHTML = '';
    adminData.tests.forEach((test, idx) => {
        const li = document.createElement('li');
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.padding = "5px";
        li.innerHTML = `
            <span>${test.name} (${test.date})</span>
            <button data-idx="${idx}" style="color:red; background:none; border:none; cursor:pointer;">削除</button>
        `;
        li.querySelector('button').addEventListener('click', (e) => {
            adminData.tests.splice(e.target.dataset.idx, 1);
            renderAdminTests();
        });
        list.appendChild(li);
    });
}

/* =========================================
   Helpers
   ========================================= */
function timeToMins(timeStr) {
    if(!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function renderCalendarStub() {
    // 実際の実装ではここでiCal URLをfetchしますが、
    // CORS問題があるため、このデモではリンクかダミーを表示します。
    // Userが入力をした場合のUI状態を反映
    const preview = document.getElementById('calendarPreview');
    if(userSettings.icalUrl) {
        preview.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--text-sub);">
                <i class="fa-solid fa-check-circle" style="color:var(--c-green-t); font-size:2rem; margin-bottom:10px;"></i>
                <p>Googleカレンダー連携済み</p>
                <small style="display:block; margin-top:5px; word-break:break-all;">${userSettings.icalUrl.substring(0,30)}...</small>
                <a href="${userSettings.icalUrl.replace('ical/', 'embed/').replace('.ics','')}" target="_blank" style="display:inline-block; margin-top:10px; color:var(--primary);">カレンダーを開く</a>
            </div>
        `;
    } else {
        preview.innerHTML = `
            <div class="calendar-placeholder">
                <p>設定画面でiCal URLを登録すると<br>ここに予定が表示されます</p>
            </div>
        `;
    }
}