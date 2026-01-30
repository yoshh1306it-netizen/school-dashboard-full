document.addEventListener('DOMContentLoaded', () => {
    
    // --- データ管理 ---
    let appData = {
        timings: [],
        schedule: {},
        tests: []
    };
    
    let userSettings = {
        classId: '21HR',
        icalUrl: ''
    };

    // 初期化処理
    loadData();
    loadUserSettings();
    loadTodos();
    setupEventListeners();
    
    // 1秒ごとの更新
    setInterval(() => {
        updateClock();
        updateNextClass();
    }, 1000);


    /* === データ取得 === */
    async function loadData() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) throw new Error("JSON読み込み失敗");
            appData = await response.json();
            
            initDashboard();
            initAdmin();
        } catch (error) {
            console.error(error);
            document.getElementById('dynamicGreeting').textContent = "データ読み込みエラー";
        }
    }

    function loadUserSettings() {
        const saved = localStorage.getItem('userSettings');
        if (saved) userSettings = JSON.parse(saved);
        
        // UI反映
        document.getElementById('headerClassDisplay').textContent = userSettings.classId;
    }

    function initDashboard() {
        renderSchedule();
        updateNextClass();
        updateTestCountdown();
        updateGreeting();
    }


    /* === 1. 時計 & 挨拶 === */
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ja-JP', { hour12: false });
        document.getElementById('currentTime').textContent = timeStr;

        const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
        document.getElementById('currentDate').textContent = dateStr;
    }

    function updateGreeting() {
        const h = new Date().getHours();
        let msg = "今日も頑張りましょう！";
        if (h < 10) msg = "おはようございます！";
        else if (h > 18) msg = "お疲れ様です。";
        document.getElementById('dynamicGreeting').textContent = msg;
    }


    /* === 2. 次の授業 & 3. 時間割 === */
    function renderSchedule() {
        const today = new Date().getDay(); // 0:Sun, 1:Mon...
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayKey = days[today];
        const dayMap = ["日", "月", "火", "水", "木", "金", "土"];
        
        document.getElementById('scheduleDay').textContent = dayMap[today] + "曜日";

        const list = document.getElementById('dailyScheduleList');
        list.innerHTML = '';

        const subjects = appData.schedule[userSettings.classId]?.[dayKey] || {};
        
        // 1限〜7限を表示
        for (let i = 1; i <= 7; i++) {
            const subject = subjects[i] || '----';
            const li = document.createElement('li');
            li.innerHTML = `<span class="period">${i}</span> <span class="subj">${subject}</span>`;
            
            // 現在の授業ハイライト用クラス（簡易判定）
            if (isCurrentPeriod(i)) li.classList.add('active');
            
            list.appendChild(li);
        }
    }

    function isCurrentPeriod(period) {
        // 現在時刻がperiodの範囲内か判定するロジック（簡易実装）
        // 実際はappData.timingsと比較する
        return false; 
    }

    function updateNextClass() {
        // 次の授業ロジック（簡略化：実際はtimingsと比較して算出）
        // デモ用表示
        const nextSubj = document.getElementById('nextSubject');
        if(nextSubj.textContent === '読み込み中...') {
           nextSubj.textContent = '計算中...';
        }
    }


    /* === 4. ToDoリスト === */
    const todoList = document.getElementById('todoList');
    const newTodoInput = document.getElementById('newTodoInput');
    const addTodoBtn = document.getElementById('addTodoBtn');
    const todoProgress = document.getElementById('todoProgress');
    const todoCount = document.getElementById('todoCount');

    function loadTodos() {
        const todos = JSON.parse(localStorage.getItem('todos')) || [];
        renderTodos(todos);
    }

    function saveTodos(todos) {
        localStorage.setItem('todos', JSON.stringify(todos));
        renderTodos(todos);
    }

    function renderTodos(todos) {
        todoList.innerHTML = '';
        let doneCount = 0;

        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            if (todo.done) {
                li.classList.add('done');
                doneCount++;
            }
            li.innerHTML = `
                <span onclick="toggleTodo(${index})">${todo.text}</span>
                <button class="nav-btn" onclick="deleteTodo(${index})"><i class="fa-solid fa-trash"></i></button>
            `;
            todoList.appendChild(li);
        });

        // 進捗バー更新
        const total = todos.length;
        const percent = total === 0 ? 0 : (doneCount / total) * 100;
        todoProgress.style.width = percent + '%';
        todoCount.textContent = `${doneCount}/${total} 完了`;
    }

    window.toggleTodo = (index) => {
        const todos = JSON.parse(localStorage.getItem('todos'));
        todos[index].done = !todos[index].done;
        saveTodos(todos);
    };

    window.deleteTodo = (index) => {
        const todos = JSON.parse(localStorage.getItem('todos'));
        todos.splice(index, 1);
        saveTodos(todos);
    };

    addTodoBtn.addEventListener('click', () => {
        const text = newTodoInput.value.trim();
        if (text) {
            const todos = JSON.parse(localStorage.getItem('todos')) || [];
            todos.push({ text: text, done: false });
            saveTodos(todos);
            newTodoInput.value = '';
        }
    });


    /* === 5. ポモドーロタイマー (設定機能付き・完全版) === */
    let timerInterval;
    let isRunning = false;
    
    // 設定値（初期値）
    let workDuration = 25;
    let breakDuration = 5;
    
    let timeLeft = workDuration * 60;
    let isWorkMode = true; // true = 作業中, false = 休憩中

    const timerDisplay = document.getElementById('pomoTimer');
    const startBtn = document.getElementById('pomoStartBtn');
    const resetBtn = document.getElementById('pomoResetBtn');
    const statusText = document.getElementById('pomoStatus');

    // 設定関連DOM
    const settingsBtn = document.getElementById('pomoSettingsBtn');
    const modal = document.getElementById('pomoModal');
    const closeValBtn = document.getElementById('closePomoModal');
    const saveSettingsBtn = document.getElementById('savePomoSettings');
    const workInput = document.getElementById('pomoWorkInput');
    const breakInput = document.getElementById('pomoBreakInput');

    function updatePomoDisplay() {
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${m}:${s}`;
    }
    
    function updateStatusText() {
        if(isWorkMode) {
            statusText.textContent = `${workDuration}分集中`;
            statusText.style.color = "var(--text-sub)";
        } else {
            statusText.textContent = `${breakDuration}分休憩`;
            statusText.style.color = "var(--text-green)";
        }
    }

    function toggleTimer() {
        if (isRunning) {
            clearInterval(timerInterval);
            startBtn.textContent = '開始';
        } else {
            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updatePomoDisplay();
                } else {
                    clearInterval(timerInterval);
                    isRunning = false;
                    startBtn.textContent = '開始';
                    
                    // モード切り替え
                    isWorkMode = !isWorkMode;
                    if (isWorkMode) {
                        timeLeft = workDuration * 60;
                        alert('休憩終了！作業に戻りましょう。');
                    } else {
                        timeLeft = breakDuration * 60;
                        alert('作業終了！休憩しましょう。');
                    }
                    updatePomoDisplay();
                    updateStatusText();
                }
            }, 1000);
            startBtn.textContent = '停止';
        }
        isRunning = !isRunning;
    }

    function resetTimer() {
        clearInterval(timerInterval);
        isRunning = false;
        isWorkMode = true; 
        timeLeft = workDuration * 60;
        updatePomoDisplay();
        updateStatusText();
        startBtn.textContent = '開始';
    }

    // モーダル操作
    settingsBtn.addEventListener('click', () => {
        workInput.value = workDuration;
        breakInput.value = breakDuration;
        modal.classList.add('open');
    });

    closeValBtn.addEventListener('click', () => {
        modal.classList.remove('open');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newWork = parseInt(workInput.value);
        const newBreak = parseInt(breakInput.value);

        if (newWork > 0 && newBreak > 0) {
            workDuration = newWork;
            breakDuration = newBreak;
            resetTimer(); // 設定反映のためリセット
            modal.classList.remove('open');
        } else {
            alert("時間は1分以上に設定してください");
        }
    });

    startBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);
    
    // 初期表示
    updatePomoDisplay();
    updateStatusText();


    /* === 6. テストカウントダウン === */
    function updateTestCountdown() {
        const container = document.getElementById('testContainer');
        const nameEl = document.getElementById('targetTestName');
        const daysEl = document.getElementById('cdDays');

        // 直近のテストを探す
        const now = new Date();
        const upcomingTests = appData.tests
            .map(t => ({ name: t.name, date: new Date(t.date) }))
            .filter(t => t.date >= now)
            .sort((a, b) => a.date - b.date);

        if (upcomingTests.length > 0) {
            const nextTest = upcomingTests[0];
            nameEl.textContent = nextTest.name;
            const diffTime = nextTest.date - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            daysEl.textContent = diffDays;
        } else {
            nameEl.textContent = "予定なし";
            daysEl.textContent = "-";
        }
    }


    /* === 画面遷移 === */
    const pages = {
        home: document.getElementById('page-home'),
        settings: document.getElementById('page-settings'),
        adminLogin: document.getElementById('page-admin-login'),
        adminDash: document.getElementById('page-admin-dashboard')
    };

    function showPage(pageId) {
        Object.values(pages).forEach(p => p.classList.remove('active'));
        pages[pageId].classList.add('active');
    }

    function setupEventListeners() {
        document.getElementById('btnHome').addEventListener('click', () => {
            showPage('home');
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btnHome').classList.add('active');
        });

        document.getElementById('btnSettings').addEventListener('click', () => {
            showPage('settings');
            // クラス選択肢の生成（簡易）
            const select = document.getElementById('settingClassSelect');
            select.innerHTML = '';
            Object.keys(appData.schedule).forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls;
                opt.textContent = cls;
                if(cls === userSettings.classId) opt.selected = true;
                select.appendChild(opt);
            });
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btnSettings').classList.add('active');
        });

        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            userSettings.classId = document.getElementById('settingClassSelect').value;
            userSettings.icalUrl = document.getElementById('icalUrlInput').value;
            localStorage.setItem('userSettings', JSON.stringify(userSettings));
            alert('設定を保存しました');
            location.reload();
        });

        document.getElementById('btnAdmin').addEventListener('click', () => {
            showPage('adminLogin');
        });

        document.getElementById('adminLoginBtn').addEventListener('click', () => {
            const pass = document.getElementById('adminPasswordInput').value;
            if (pass === '1234') {
                showPage('adminDash');
                document.getElementById('adminPasswordInput').value = '';
                document.getElementById('loginError').style.display = 'none';
            } else {
                document.getElementById('loginError').style.display = 'block';
            }
        });

        document.getElementById('adminBackBtn').addEventListener('click', () => {
            showPage('home');
        });
    }

    /* === 管理者機能 (簡易) === */
    function initAdmin() {
        // タブ切り替え
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).classList.add('active');
            });
        });

        // JSONダウンロード
        document.getElementById('downloadJsonBtn').addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "data.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }

});
