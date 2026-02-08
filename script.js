// ========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ========================================
let currentFaculty = 'all';
let lastUpdateTime = new Date();
let updateInterval;
let appSettings = {};
let isAdminMode = false;
let currentUser = null;
let currentDate = '01.08'; // Текущая выбранная дата
let passingScoreHistory = {}; // История проходных баллов по датам

// ========================================
// ДАННЫЕ ПО ДАТАМ (симуляция для демонстрации)
// ========================================
const dateDataHistory = {
    '01.08': { pm: 0, ivt: 0, itss: 0, ib: 0 },
    '02.08': { pm: 235, ivt: 228, itss: 0, ib: 0 },
    '03.08': { pm: 242, ivt: 235, itss: 218, ib: 0 },
    '04.08': { pm: 248, ivt: 241, itss: 225, ib: 212 }
};

// ========================================
// ТРЕБОВАНИЯ ТЗ ПО КОЛИЧЕСТВУ АБИТУРИЕНТОВ (п. 8)
// ========================================
const tzRequirements = {
    '01.08': { pm: 60, ivt: 100, itss: 45, ib: 30 },
    '02.08': { pm: 75, ivt: 120, itss: 55, ib: 40 },
    '03.08': { pm: 90, ivt: 140, itss: 65, ib: 50 },
    '04.08': { pm: 100, ivt: 160, itss: 75, ib: 60 }
};

// ========================================
// ЗАГРУЗКА НАСТРОЕК
// ========================================
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            appSettings = await res.json();
            
            const nameInput = document.querySelector('input[data-setting="campaignName"]');
            if (nameInput && appSettings.campaignName) nameInput.value = appSettings.campaignName;
            
            const passingInput = document.getElementById('passingScoreInput');
            if (passingInput && appSettings.passingScore) passingInput.value = appSettings.passingScore;
            
            if (appSettings.adminMode) {
                isAdminMode = true;
                updateAdminUI(true);
            }
        }
    } catch (e) {
        console.error('Ошибка загрузки настроек:', e);
    }
}

// ========================================
// СОХРАНЕНИЕ НАСТРОЕК
// ========================================
window.saveSettings = async function() {
    const passingScore = document.getElementById('passingScoreInput')?.value;
    const campaignName = document.querySelector('input[data-setting="campaignName"]')?.value;
    const newSettings = { passingScore, campaignName, adminMode: isAdminMode };

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        
        if (res.ok) {
            alert('Настройки успешно сохранены!');
            appSettings = { ...appSettings, ...newSettings };
            if (currentFaculty) loadApplicants();
            renderListsView();
        } else {
            alert('Ошибка сохранения настроек');
        }
    } catch (e) {
        console.error('Ошибка сети:', e);
        alert('Ошибка сети при сохранении настроек');
    }
};

// ========================================
// СИСТЕМА АУТЕНТИФИКАЦИИ
// ========================================
window.handleAuthClick = function() {
    if (currentUser) {
        if (confirm('Выйти из аккаунта ' + currentUser.name + '?')) {
            logout();
        }
    } else {
        document.getElementById('authModal').style.display = 'flex';
        switchAuthTab('login');
    }
};

window.closeAuthModal = function() {
    document.getElementById('authModal').style.display = 'none';
};

window.switchAuthTab = function(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabLogin.style.background = 'white';
        tabLogin.style.color = '#3b82f6';
        tabLogin.style.borderBottom = '2px solid #3b82f6';
        
        tabRegister.style.background = '#f8fafc';
        tabRegister.style.color = '#64748b';
        tabRegister.style.borderBottom = '2px solid transparent';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabRegister.style.background = 'white';
        tabRegister.style.color = '#10b981';
        tabRegister.style.borderBottom = '2px solid #10b981';
        
        tabLogin.style.background = '#f8fafc';
        tabLogin.style.color = '#64748b';
        tabLogin.style.borderBottom = '2px solid transparent';
    }
};

window.submitAuthLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const pwd = document.getElementById('loginPassword').value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pwd })
        });
        
        const result = await res.json();
        
        if (result.success) {
            currentUser = { 
                name: result.name || 'Admin', 
                role: result.role || 'admin', 
                email,
                permissions: result.permissions || []
            };
            
            isAdminMode = (currentUser.role === 'admin');
            
            sessionStorage.setItem('adminToken', result.token);
            sessionStorage.setItem('userProfile', JSON.stringify(currentUser));
            
            updateUserUI();
            updateAdminUI(true);
            saveAdminState(isAdminMode);
            
            closeAuthModal();
            showToast(`Добро пожаловать, ${currentUser.name}`, 'success');
            
            if (currentFaculty) loadApplicants();
            renderListsView();
        } else {
            showToast(result.message || 'Ошибка входа', 'error');
        }
    } catch (e) {
        console.error('Ошибка входа:', e);
        showToast('Ошибка сети при входе', 'error');
    }
};

window.submitAuthRegister = async function() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const pwd = document.getElementById('regPassword').value;
    
    if (!name || !email || !pwd) {
        showToast('Заполните все поля', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password: pwd })
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast('Аккаунт создан! Теперь войдите.', 'success');
            switchAuthTab('login');
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').focus();
        } else {
            showToast(result.message || 'Ошибка регистрации', 'error');
        }
    } catch (e) {
        console.error('Ошибка регистрации:', e);
        showToast('Ошибка сети при регистрации', 'error');
    }
};

function logout() {
    currentUser = null;
    isAdminMode = false;
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('userProfile');
    updateUserUI();
    updateAdminUI(false);
    saveAdminState(false);
    showToast('Вы вышли из системы', 'info');
    
    if (currentFaculty) loadApplicants();
    renderListsView();
}

function updateUserUI() {
    const userNameEl = document.getElementById('currentUser');
    const userRoleEl = document.getElementById('currentRole');
    const avatarEl = document.querySelector('.user-profile .avatar');
    
    if (!userNameEl) return;
    
    if (currentUser) {
        userNameEl.textContent = currentUser.name;
        userRoleEl.textContent = currentUser.role === 'admin' ? 'Администратор' : 'Пользователь';
        avatarEl.style.background = currentUser.role === 'admin' ? '#3b82f6' : '#10b981';
        avatarEl.style.color = 'white';
    } else {
        userNameEl.textContent = 'Гость';
        userRoleEl.textContent = 'Войти в аккаунт';
        avatarEl.style.background = 'rgba(255,255,255,0.1)';
        avatarEl.style.color = '#94a3b8';
    }
}

function restoreUserSession() {
    const profile = sessionStorage.getItem('userProfile');
    if (profile) {
        try {
            currentUser = JSON.parse(profile);
            isAdminMode = (currentUser.role === 'admin');
            updateUserUI();
            updateAdminUI(isAdminMode);
        } catch (e) {
            sessionStorage.removeItem('userProfile');
        }
    } else {
        updateUserUI();
    }
}

// ========================================
// УПРАВЛЕНИЕ АДМИН-РЕЖИМОМ
// ========================================
window.toggleAdmin = function() {
    handleAuthClick();
};

window.closeLoginModal = function() {
    closeAuthModal();
};

window.submitLogin = async function() {
    const pwd = document.getElementById('adminPasswordInput').value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: '', password: pwd })
        });
        
        const result = await res.json();
        
        if (result.success) {
            currentUser = { name: result.name || 'Admin', role: result.role || 'admin', email: '' };
            isAdminMode = true;
            sessionStorage.setItem('adminToken', result.token);
            sessionStorage.setItem('userProfile', JSON.stringify(currentUser));
            updateUserUI();
            updateAdminUI(true);
            document.getElementById('loginModal').style.display = 'none';
            showToast('Вход выполнен', 'success');
        } else {
            showToast('Ошибка входа', 'error');
        }
    } catch (e) {
        console.error('Ошибка входа:', e);
        showToast('Ошибка сети', 'error');
    }
};

function updateAdminUI(isActive) {
    const toggle = document.getElementById('adminToggle');
    if (!toggle) return;
    
    const circle = toggle.querySelector('div');
    if (isActive) {
        toggle.style.background = '#3b82f6';
        circle.style.transform = 'translateX(20px)';
    } else {
        toggle.style.background = '#cbd5e1';
        circle.style.transform = 'translateX(0)';
    }

    if (document.getElementById('applicantsTableBody')) loadApplicants();
    if (document.getElementById('view-lists') && document.getElementById('view-lists').style.display !== 'none') {
        renderListsView();
    }

    if (document.getElementById('view-settings')) {
        const mgmt = document.getElementById('usersManagementGroup');
        const canManageUsers = isAdminMode || (currentUser && currentUser.permissions && currentUser.permissions.includes('manage_users'));
        if (mgmt) mgmt.style.display = canManageUsers ? 'block' : 'none';
        
        if (canManageUsers && document.getElementById('view-settings').style.display !== 'none') {
            loadUsersManagement();
        }
        
        renderFacultiesEditTable();
    }
}

// ========================================
// СМЕНА ПАРОЛЯ
// ========================================
window.openChangePasswordModal = function() {
    if (!isAdminMode) {
        showToast('Только администратор может менять пароль', 'error');
        return;
    }
    document.getElementById('changePasswordModal').style.display = 'flex';
};

window.closeChangePasswordModal = function() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
};

window.submitChangePassword = async function() {
    const oldPass = document.getElementById('oldPasswordInput').value;
    const newPass = document.getElementById('newPasswordInput').value;
    const confirmPass = document.getElementById('confirmPasswordInput').value;
    
    if (!oldPass || !newPass) {
        showToast('Заполните все поля', 'error');
        return;
    }

    if (newPass !== confirmPass) {
        showToast('Новые пароли не совпадают', 'error');
        return;
    }

    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': token
            },
            body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
        });
        
        const result = await res.json();
        if (result.success) {
            showToast('Пароль успешно изменен', 'success');
            closeChangePasswordModal();
        } else {
            showToast(result.message || 'Ошибка смены пароля', 'error');
        }
    } catch (e) {
        console.error('Ошибка сети:', e);
        showToast('Ошибка сети', 'error');
    }
};

async function saveAdminState(isActive) {
    appSettings.adminMode = isActive;
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminMode: isActive })
        });
    } catch (e) {
        console.error('Ошибка сохранения состояния админа:', e);
    }
}

// ========================================
// ИСПРАВЛЕННЫЕ ФУНКЦИИ ЭКСПОРТА В PDF (ПОЛНЫЙ ОТЧЁТ)
// ========================================
window.exportToPDF = async function() {
    try {
        if (!window.jspdf?.jsPDF) {
            alert('Библиотека jsPDF не загружена. Убедитесь, что подключена версия 2.5+');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        let pdfFontName = 'helvetica';
        
        // Регистрация шрифта
        async function tryRegisterFont() {
            try {
                let base64 = window.dejavuFontBase64 || null;
                if (!base64) {
                    const paths = [
                        '/fonts/DejaVuSans.ttf',
                        '/DejaVuSans.ttf',
                        'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/ttf/DejaVuSans.ttf'
                    ];
                    for (const p of paths) {
                        try {
                            const resp = await fetch(p);
                            if (!resp.ok) continue;
                            const buf = await resp.arrayBuffer();
                            const bytes = new Uint8Array(buf);
                            let binary = '';
                            const chunk = 0x8000;
                            for (let i = 0; i < bytes.length; i += chunk) {
                                binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + chunk));
                            }
                            base64 = btoa(binary);
                            break;
                        } catch (err) {}
                    }
                }
                if (base64 && base64.length > 1000) {
                    doc.addFileToVFS('DejaVuSans.ttf', base64);
                    doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
                    doc.setFont('DejaVu', 'normal');
                    pdfFontName = 'DejaVu';
                }
            } catch (e) {
                console.warn('Font registration skipped:', e);
            }
        }
        await tryRegisterFont();
        
        // ЗАГРУЗКА ДАННЫХ
        const [appRes, facRes] = await Promise.all([
            fetch(`/api/applicants?faculty=all`),
            fetch('/api/faculties')
        ]);
        
        let applicants = await appRes.json();
        const faculties = await facRes.json();
        
        if (!Array.isArray(applicants)) {
            if (applicants.applicants) applicants = applicants.applicants;
            else applicants = [];
        }

        applicants.sort((a, b) => (b.score || 0) - (a.score || 0));
        
        // ============ СТРАНИЦА 1: ТИТУЛЬНАЯ ============
        doc.setFont(pdfFontName, 'normal');
        doc.setFontSize(22);
        doc.text('ОТЧЁТ', 105, 40, { align: 'center' });
        doc.setFontSize(16);
        doc.text('Анализ приемной кампании', 105, 52, { align: 'center' });
        
        // Используем currentDate из глобальной переменной
        const reportDateStr = currentDate || '01.08';
        doc.text(`Списки по состоянию на: ${reportDateStr}.2025`, 105, 60, { align: 'center' });
        
        const dateStr = new Date().toLocaleDateString('ru-RU', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        
        doc.setFontSize(11);
        doc.text(`Дата и время формирования: ${dateStr}`, 105, 80, { align: 'center' });
        
        // Общая статистика на титульной
        doc.setFontSize(12);
        let y = 110;
        doc.text('Общая статистика:', 14, y);
        y += 8;
        doc.setFontSize(10);
        doc.text(`• Всего абитуриентов: ${applicants.length}`, 20, y); y += 6;
        doc.text(`• С согласием на зачисление: ${applicants.filter(a => a.hasConsent).length}`, 20, y); y += 6;
        doc.text(`• Допущено к зачислению: ${applicants.filter(a => a.status === 'допущен').length}`, 20, y); y += 6;
        
        const avgScore = applicants.length > 0 
            ? (applicants.reduce((sum, a) => sum + (a.score || 0), 0) / applicants.length).toFixed(1)
            : 0;
        doc.text(`• Средний балл (общий): ${avgScore}`, 20, y);
        
        // ============ СТРАНИЦА 2: ПРОХОДНЫЕ БАЛЛЫ ============
        doc.addPage();
        doc.setFont(pdfFontName, 'normal');
        doc.setFontSize(16);
        doc.text('Проходные баллы по образовательным программам', 105, 20, { align: 'center' });
        
        y = 35;
        doc.setFontSize(12);
        
        const facultyStats = [];
        Object.entries(faculties).forEach(([key, fac]) => {
            const facApps = applicants.filter(a => a.faculty === key || (a.priorities && a.priorities.includes(key)));
            const withConsent = facApps.filter(a => a.hasConsent).length;
            const priority1 = applicants.filter(a => a.priorities && a.priorities[0] === key).length;
            
            // Средний балл зачисленных
            const enrolled = applicants.filter(a => a.recommendedFaculty === key);
            const avgEnrolledScore = enrolled.length > 0 
                ? (enrolled.reduce((sum, a) => sum + (a.score || 0), 0) / enrolled.length).toFixed(2)
                : '-';

            const passingScore = fac.passingScore;
            // IMPORTANT: Check against TOTAL seats
            const totalSeats = fac.total || fac.places || 0;
            // Nedobor calculation logic
            const isNedobor = passingScore === "НЕДОБОР" || (fac.consents !== undefined ? fac.consents : withConsent) < totalSeats;
            
            facultyStats.push({
                name: fac.name,
                total: totalSeats,
                applications: facApps.length,
                priority1: priority1,
                consents: withConsent,
                passingScore: isNedobor ? 'НЕДОБОР' : passingScore,
                avgScore: avgEnrolledScore
            });
            
            doc.setFontSize(11);
            doc.text(`${fac.name}:`, 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.text(`   Проходной балл: ${isNedobor ? 'НЕДОБОР' : passingScore + ' баллов'}`, 14, y);
            doc.text(`   Ср. балл зачисленных: ${avgEnrolledScore}`, 100, y);
            y += 5;
            doc.text(`   Мест: ${totalSeats} | Согласий: ${withConsent} | 1-й приоритет: ${priority1}`, 14, y);
            y += 10;
        });
        
        // Таблица статистики по ОП
        if (doc.autoTable) {
            doc.autoTable({
                head: [['ОП', 'Мест', 'Заявл.', '1-й пр.', 'Согл.', 'Прох. балл', 'Ср. балл']],
                body: facultyStats.map(f => [
                    f.name.split('(')[0].trim(),
                    f.total,
                    f.applications,
                    f.priority1,
                    f.consents,
                    f.passingScore,
                    f.avgScore
                ]),
                startY: y + 5,
                theme: 'striped',
                styles: { font: pdfFontName, fontSize: 9 },
                headStyles: { fillColor: [59, 130, 246] }
            });
        }
        
        // ============ СТРАНИЦА 3: ДИНАМИКА ============
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Динамика проходных баллов (01.08 - 04.08)', 105, 20, { align: 'center' });
        
        y = 35;
        doc.setFontSize(10);
        
        const dates = ['01.08', '02.08', '03.08', '04.08'];
        Object.entries(faculties).forEach(([key, fac]) => {
            doc.setFontSize(11);
            doc.text(`${fac.name}:`, 14, y);
            y += 6;
            doc.setFontSize(9);
            
            const values = dates.map(d => {
                const val = dateDataHistory[d]?.[key];
                return val === 0 ? 'НЕДОБОР' : (val || '-');
            });
            
            doc.text(`   ${dates.join('    |    ')}`, 20, y);
            y += 5;
            doc.text(`   ${values.join('      |     ')}`, 20, y);
            y += 10;
        });
        
        // ============ СТРАНИЦА 4: СПИСОК ЗАЧИСЛЕННЫХ ============
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Списки зачисленных абитуриентов', 105, 20, { align: 'center' });
        
        const admitted = applicants.filter(a => a.status === 'допущен');
        
        if (doc.autoTable && admitted.length > 0) {
            doc.autoTable({
                head: [['ID', 'ФИО', 'ОП', 'Баллы', 'Согласие']],
                body: admitted.map(a => [
                    a.id,
                    a.fullName || 'Не указано',
                    a.faculty,
                    a.score || 0,
                    a.hasConsent ? 'Да' : 'Нет'
                ]),
                startY: 30,
                theme: 'grid',
                styles: { font: pdfFontName, fontSize: 8 },
                headStyles: { fillColor: [16, 185, 129] }
            });
        } else {
            doc.setFontSize(11);
            doc.text('Зачисленных абитуриентов пока нет.', 14, 40);
        }
        
        // ============ СТРАНИЦА 5: ВСЕ АБИТУРИЕНТЫ ============
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Полный список абитуриентов', 105, 20, { align: 'center' });
        
        if (doc.autoTable) {
            doc.autoTable({
                head: [['№', 'ID', 'ФИО', 'ОП', 'Баллы', 'Статус']],
                body: applicants.slice(0, 100).map((a, i) => [
                    i + 1,
                    a.id,
                    (a.fullName || '').substring(0, 25),
                    a.faculty,
                    a.score || 0,
                    a.status === 'допущен' ? 'Допущен' : 'На рассм.'
                ]),
                startY: 30,
                theme: 'striped',
                styles: { font: pdfFontName, fontSize: 7 },
                headStyles: { fillColor: [45, 55, 72] },
                didDrawPage: (data) => {
                    doc.setFontSize(8);
                    doc.text(`Страница ${doc.internal.getNumberOfPages()} | Сформировано: ${dateStr}`, 
                            14, doc.internal.pageSize.height - 10);
                }
            });
        }
        
        // СОХРАНЕНИЕ
        // Fix: Use report_DD_MM.pdf format
        const dateFileStr = reportDateStr.replace('.', '_');
        const fileName = `report_${dateFileStr}.pdf`;
        
        doc.save(fileName);
        showToast(`PDF успешно сохранен: ${fileName}`, 'success');
        
    } catch (error) {
        console.error('Критическая ошибка экспорта PDF:', error);
        showToast(`Ошибка генерации PDF: ${error.message || 'Неизвестная ошибка'}`, 'error');
    }
};

// ========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ГРАФИКОВ
// ========================================
async function generateChartImage(labels, data, label, color) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 300;
        // chart.js requires canvas in DOM for some operations sometimes, but usually detached works if not using animations
        // We set animation: false
        
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: color,
                    backgroundColor: color + '33', // transparency
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: false,
                animation: false,
                plugins: { legend: { display: true } },
                scales: {
                    y: { beginAtZero: false } // Scores usually 100+
                }
            }
        });
        
        // Wait a tick for render
        setTimeout(() => {
            const imgUrl = canvas.toDataURL('image/png');
            chart.destroy();
            resolve(imgUrl);
        }, 100);
    });
}

// ========================================
// ДНЕВНОЙ ОТЧЕТ (REQUIREMENT 1)
// ========================================
window.generateDailyReport = async function() {
    try {
        if (!window.jspdf?.jsPDF) { alert('jsPDF не загружен'); return; }
        const { jsPDF } = window.jspdf;
        
        // Получаем дату для отчета
        const reportDateInput = document.getElementById('reportDateInput');
        const reportDate = reportDateInput?.value || new Date().toISOString().split('T')[0];
        
        // Загрузка данных
        const [appRes, facRes] = await Promise.all([
            fetch(`/api/applicants?faculty=all`),
            fetch('/api/faculties')
        ]);
        
        let applicants = await appRes.json();
        const faculties = await facRes.json();
        
        if (!Array.isArray(applicants)) applicants = applicants.applicants || [];
        
        // Финальная сборка doc
        const doc = new jsPDF();
        let pdfFontName = 'helvetica';
        
        // Шрифт
        try {
            if (window.dejavuFontBase64) {
                 doc.addFileToVFS('DejaVuSans.ttf', window.dejavuFontBase64);
                 doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
                 doc.setFont('DejaVu', 'normal');
                 pdfFontName = 'DejaVu';
            }
        } catch(e) {}
        
        // 1.1 Заголовок
        doc.setFontSize(20);
        doc.text('Дневной отчет по приемной кампании', 105, 20, {align: 'center'});
        doc.setFontSize(12);
        doc.text(`Дата формирования: ${new Date().toLocaleString()}`, 14, 35);
        doc.text(`За день: ${reportDate}`, 14, 42);
        
        let y = 55;
        
        // 1.2 Секции по ОП
        const dates = ['01.08', '02.08', '03.08', '04.08']; // Historical dates
        const historyColors = { pm: '#3b82f6', ivt: '#10b981', itss: '#f59e0b', ib: '#ef4444' };
        
        for (const [code, fac] of Object.entries(faculties)) {
             if (y > 250) { doc.addPage(); y = 20; }
             
             doc.setFontSize(16);
             doc.setTextColor(0, 0, 0);
             doc.text(`Образовательная программа: ${fac.name}`, 14, y);
             y += 10;
             
             // Проходной балл
             doc.setFontSize(12);
             const passing = fac.passingScore === 'НЕДОБОР' ? 'НЕДОБОР' : fac.passingScore;
             doc.text(`Текущий проходной балл: ${passing}`, 14, y);
             y += 10;
             
             // 1.3 График (динамика)
             // Строим массив значений для графика
             const dynData = dates.map(d => {
                 const stored = dateDataHistory[d]?.[code];
                 if (stored === undefined || stored === 0) return 0; // Или пропускаем
                 return stored;
             });
             
             // Генерируем изображение
             const imgData = await generateChartImage(dates, dynData, `Динамика: ${fac.name}`, historyColors[code] || '#000');
             doc.addImage(imgData, 'PNG', 14, y, 100, 50); // width 100, height 50
             
             // Список зачисленных (справа от графика или снизу)
             const admitted = applicants
                 .filter(a => a.recommendedFaculty === code && a.status === 'допущен')
                 .sort((a,b) => b.score - a.score)
                 .slice(0, 5); // Топ 5 для компактности
             
             doc.setFontSize(10);
             doc.text('Топ зачисленных студентов (пример):', 120, y + 5);
             let ly = y + 12;
             
             if (admitted.length === 0) {
                 doc.text('(нет зачисленных)', 120, ly);
             } else {
                 admitted.forEach(a => {
                     doc.text(`${a.fullName} - ${a.score} б.`, 120, ly);
                     ly += 6;
                 });
             }
             
             y += 60; // Отступ после графика
        }
        
        // 1.4 Общая статистика
        doc.addPage();
        doc.setFontSize(18);
        doc.text('Общая статистика кампании', 105, 20, { align: 'center' });
        
        const totalApps = applicants.length;
        const uniqueApps = new Set(applicants.map(a => a.fullName)).size; // Simple unique check
        const avgTotal = totalApps > 0 ? (applicants.reduce((acc, v) => acc + (v.score||0), 0) / totalApps).toFixed(2) : 0;
        const competitionCount = Object.values(faculties).filter(f => f.passingScore !== 'НЕДОБОР').length;
        const totalRecommended = applicants.filter(a => a.status === 'допущен').length;
        
        // Рассчет мин/макс/среднего проходного
        const passingScoresNumeric = Object.values(faculties)
            .map(f => f.passingScore)
            .filter(s => s !== 'НЕДОБОР' && s > 0);
            
        const minPass = passingScoresNumeric.length ? Math.min(...passingScoresNumeric) : '-';
        const maxPass = passingScoresNumeric.length ? Math.max(...passingScoresNumeric) : '-';
        const avgPass = passingScoresNumeric.length ? (passingScoresNumeric.reduce((a,b)=>a+b,0)/passingScoresNumeric.length).toFixed(1) : '-';

        const statsData = [
            ['Показатель', 'Значение'],
            ['Всего заявлений', totalApps],
            ['Уникальных абитуриентов', uniqueApps],
            ['Средний балл (всех)', avgTotal],
            ['ОП с конкурсом', competitionCount],
            ['Зачислено всего', totalRecommended],
            ['Мин. проходной балл', minPass],
            ['Макс. проходной балл', maxPass],
            ['Ср. проходной балл', avgPass]
        ];
        
        if (doc.autoTable) {
            doc.autoTable({
                head: [statsData[0]],
                body: statsData.slice(1),
                startY: 40,
                theme: 'grid',
                styles: { font: pdfFontName }
            });
        }
        
        doc.save(`Отчет_${reportDate}.pdf`);
        showToast('Дневной отчет создан', 'success');

    } catch(e) {
        console.error(e);
        showToast('Ошибка создания отчета', 'error');
    }
};

// ========================================
// ОТЧЕТ ВАЛИДАЦИИ (REQUIREMENT 2)
// ========================================
window.generateValidationReport = async function() {
    try {
        if (!window.jspdf?.jsPDF) { alert('jsPDF не загружен'); return; }
        const { jsPDF } = window.jspdf;
        
        const reportDate = document.getElementById('reportDateInput')?.value || new Date().toISOString().split('T')[0];
        
        // Данные
        const [appRes, facRes] = await Promise.all([
            fetch(`/api/applicants?faculty=all`),
            fetch('/api/faculties')
        ]);
        let applicants = await appRes.json();
        if (!Array.isArray(applicants)) applicants = applicants.applicants || [];
        const faculties = await facRes.json();
        
        const doc = new jsPDF();
        let pdfFontName = 'helvetica';
        try {
            if (window.dejavuFontBase64) {
                 doc.addFileToVFS('DejaVuSans.ttf', window.dejavuFontBase64);
                 doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
                 doc.setFont('DejaVu', 'normal');
                 pdfFontName = 'DejaVu';
            }
        } catch(e) {}
        
        doc.setFontSize(18);
        doc.text(`Валидация алгоритма. Дата: ${reportDate}`, 14, 20);
        
        const validationRows = [];
        let validCount = 0;
        let totalProgs = 0;
        
        Object.entries(faculties).forEach(([code, fac]) => {
            totalProgs++;
            const passing = fac.passingScore;
            // Реальный список зачисленных на этот факультет
            const enrolled = applicants
                .filter(a => a.recommendedFaculty === code && a.status === 'допущен')
                .sort((a,b) => b.score - a.score);
                
            const places = fac.total || fac.places || 0;
            const enrolledCount = enrolled.length;
            
            // Последний зачисленный (реальный)
            const lastEnrolledScore = enrolled.length > 0 ? enrolled[enrolled.length - 1].score : 0;
            
            // Проверка (Валидация)
            let status = 'РАССХОЖДЕНИЕ';
            if (passing === 'НЕДОБОР') {
                // Если недобор, то количество зачисленных должно быть равно кол-ву подавших согласие (или меньше мест)
                // И алгоритм верно поставил НЕДОБОР.
                if (enrolledCount < places) status = 'OK';
            } else {
                // Если число, оно должно совпадать с баллом последнего
                if (Math.abs(passing - lastEnrolledScore) < 0.1) status = 'OK';
            }
            
            if (status === 'OK') validCount++;
            
            validationRows.push([
                fac.name.split('(')[0].trim(),
                passing,
                lastEnrolledScore || '-',
                places,
                enrolledCount,
                status
            ]);
        });
        
        // Таблица
        doc.autoTable({
            head: [['ОП', 'Проходной (Алго)', 'Последний (Факт)', 'План', 'Факт', 'Статус']],
            body: validationRows,
            startY: 40,
            styles: { font: pdfFontName, fontSize: 10 },
            headStyles: { fillColor: [70, 70, 70] },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    if (data.cell.raw === 'OK') {
                        data.cell.styles.textColor = [0, 150, 0];
                    } else {
                        data.cell.styles.textColor = [200, 0, 0];
                    }
                }
            }
        });
        
        // Заключение
        const finalY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.text('ЗАКЛЮЧЕНИЕ:', 14, finalY);
        doc.setFontSize(11);
        if (validCount === totalProgs) {
            doc.setTextColor(0, 100, 0);
            doc.text(`Алгоритм работает корректно для ${validCount} из ${totalProgs} программ.`, 14, finalY + 7);
        } else {
            doc.setTextColor(200, 0, 0);
            doc.text(`Обнаружены расхождения! Корректно: ${validCount} из ${totalProgs}. Требуется проверка.`, 14, finalY + 7);
        }
        
        doc.save(`Валидация_${reportDate}.pdf`);
        showToast('Отчет валидации создан', 'success');
        
    } catch(e) {
        console.error(e);
        showToast('Ошибка создания валидации', 'error');
    }
};

window.exportAnalyticsReport = async function() {
    try {
        if (!window.jspdf?.jsPDF) {
            alert('Библиотека jsPDF не загружена');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Аналитический отчет приемной кампании', 105, 20, { 
            align: 'center',
            charSpace: 0.5
        });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const dateStr = new Date().toLocaleDateString('ru-RU');
        doc.text(`Дата: ${dateStr}`, 14, 30);
        
        const response = await fetch('/api/applicants?faculty=all');
        if (!response.ok) throw new Error('Ошибка загрузки данных');
        
        let applicants = await response.json();
        if (!Array.isArray(applicants)) {
            if (Array.isArray(applicants.applicants)) applicants = applicants.applicants;
            else if (Array.isArray(applicants.value)) applicants = applicants.value;
            else applicants = [];
        }
        
        const total = applicants.length;
        const admitted = applicants.filter(a => a.status === 'допущен').length;
        const consented = applicants.filter(a => a.hasConsent).length;
        const avgScore = total > 0 
            ? (applicants.reduce((sum, a) => sum + (a.score || 0), 0) / total).toFixed(1)
            : '0.0';
        const maxScore = total > 0 ? Math.max(...applicants.map(a => a.score || 0)) : 0;
        const minScore = total > 0 ? Math.min(...applicants.map(a => a.score || 0)) : 0;
        
        let y = 45;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Ключевые показатели:', 14, y);
        y += 8;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const stats = [
            `Всего абитуриентов: ${total}`,
            `Допущено к зачислению: ${admitted} (${((admitted / total) * 100).toFixed(1)}%)`,
            `Подали согласие: ${consented} (${((consented / total) * 100).toFixed(1)}%)`,
            `Средний балл: ${avgScore}`,
            `Максимальный балл: ${maxScore}`,
            `Минимальный балл: ${minScore}`
        ];
        
        stats.forEach(stat => {
            doc.text(stat, 14, y);
            y += 7;
        });
        
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.text('Распределение по баллам:', 14, y);
        y += 8;
        
        doc.setFont('helvetica', 'normal');
        const scoreRanges = {
            'Критический (<180)': 0,
            'Базовый (180-220)': 0,
            'Конкурентный (220-260)': 0,
            'Приоритетный (>260)': 0
        };
        
        applicants.forEach(app => {
            const score = app.score || 0;
            if (score < 180) scoreRanges['Критический (<180)']++;
            else if (score < 220) scoreRanges['Базовый (180-220)']++;
            else if (score < 260) scoreRanges['Конкурентный (220-260)']++;
            else scoreRanges['Приоритетный (>260)']++;
        });
        
        Object.entries(scoreRanges).forEach(([range, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            doc.text(`${range}: ${count} (${pct}%)`, 14, y);
            y += 7;
        });
        
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        let filename = 'Otchet_priemnaya_komissiya';
        if (reportDate) {
            filename += `_${reportDate}`;
        } else {
            filename += `_${timestamp}`;
        }
        
        doc.save(`${filename}.pdf`);
        showToast(`Отчет ${filename}.pdf успешно сгенерирован`, 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта аналитики:', error);
        showToast(`Ошибка: ${error.message}`, 'error');
    }
};

// ========================================
// DRAG & DROP ИМПОРТ
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    updateCurrentDate();
    
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const importDateInput = document.getElementById('importDateInput');
    if (importDateInput) {
        importDateInput.valueAsDate = new Date();
    }

    if (dropZone && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = '#3b82f6';
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = '#cbd5e1';
            });
        });

        dropZone.addEventListener('drop', handleDrop, false);
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }

        async function handleFiles(files) {
            if (!files.length) return;
            const file = files[0];
            const statusDiv = document.getElementById('uploadStatus');
            const timerDiv = document.getElementById('uploadTimer');
            const timerValue = document.getElementById('timerValue');
            
            statusDiv.style.display = 'block';
            statusDiv.textContent = `Загрузка ${file.name}...`;
            
            // Показываем таймер
            if (timerDiv) timerDiv.style.display = 'block';
            
            const startTime = performance.now();
            let timerInterval;
            
            if (timerValue) {
                timerInterval = setInterval(() => {
                    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                    timerValue.textContent = elapsed;
                }, 50);
            }

            try {
                const importDateInput = document.getElementById('importDateInput');
                const dateQuery = importDateInput && importDateInput.value ? `?date=${importDateInput.value}` : '';
                
                const res = await fetch(`/api/import${dateQuery}`, {
                    method: 'POST',
                    body: file
                });
                
                const endTime = performance.now();
                const totalTime = ((endTime - startTime) / 1000).toFixed(2);
                
                if (timerInterval) clearInterval(timerInterval);
                if (timerValue) timerValue.textContent = totalTime;
                 
                const result = await res.json();
                if (result.success) {
                    const timeColor = parseFloat(totalTime) < 5 ? '#10b981' : '#f59e0b';
                    statusDiv.innerHTML = `<span style="color:green">✅ Успешно импортировано: ${result.count} записей за <strong style="color:${timeColor}">${totalTime}</strong> сек</span>`;
                    localStorage.setItem('importHistory', JSON.stringify({
                        date: new Date().toLocaleString(),
                        file: file.name,
                        status: 'Успешно',
                        count: result.count,
                        time: totalTime,
                        user: isAdminMode ? 'Admin' : 'User'
                    }));
                    renderImportHistory();
                    
                    // Установка даты отчета
                    const importDateInput = document.getElementById('importDateInput');
                    const reportDateInput = document.getElementById('reportDateInput');
                    if (importDateInput && reportDateInput && importDateInput.value) {
                         reportDateInput.value = importDateInput.value;
                    }

                    // Обновляем данные
                    loadFaculties();
                    loadApplicants();
                    showToast(`Импортировано ${result.count} записей за ${totalTime} сек`, 'success');
                } else {
                    statusDiv.innerHTML = `<span style="color:red">❌ Ошибка: ${result.message || result.error}</span>`;
                }
            } catch (e) {
                console.error('Ошибка импорта:', e);
                if (timerInterval) clearInterval(timerInterval);
                statusDiv.innerHTML = `<span style="color:red">❌ Ошибка сети</span>`;
            }
        }
    }
});

function renderImportHistory() {
    const tbody = document.getElementById('importHistory');
    if (!tbody) return;
    
    const item = JSON.parse(localStorage.getItem('importHistory'));
    if (item) {
        tbody.innerHTML = `<tr>
            <td>${item.date}</td>
            <td>${item.file}</td>
            <td><span style="color: #10b981;">${item.status}</span></td>
            <td>${item.count || '-'}</td>
            <td>${item.user}</td>
        </tr>` + tbody.innerHTML;
    }
}

// ========================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    updateCurrentDate();
    
    fetch('/api/settings').then(res => {
        if (!res.ok) throw new Error('Сетевая ошибка');
    }).catch(() => {
        showToast('Не удалось подключиться к серверу. Убедитесь, что запущен node server.js', 'error');
    });

    if (document.getElementById('facultiesContainer')) {
        loadFaculties();
    }

    if (document.getElementById('applicantsTableBody')) {
        loadApplicants();
        
        updateInterval = setInterval(() => {
            loadApplicants();
            updateLastUpdateTime();
        }, 30000);
    }

    if (document.getElementById('lastUpdate')) {
        updateLastUpdateTime();
        setInterval(updateLastUpdateTime, 60000);
    }

    setupSidebarNavigation();
    setupSidebarToggle();
    restoreUserSession();
    
    // Инициализация фильтров
    const consentSelect = document.getElementById('listConsentSelect');
    if (consentSelect) consentSelect.addEventListener('change', renderListsView);
    
    const prioritySelect = document.getElementById('listPrioritySelect');
    if (prioritySelect) prioritySelect.addEventListener('change', renderListsView);
    
    // Инициализация визуализации множеств
    setTimeout(() => {
        renderSetsAndCompliance(null);
    }, 500);
});

// ========================================
// ВЫБОР ДАТЫ
// ========================================
window.selectDateTab = function(date, btn) {
    currentDate = date;
    
    // Обновляем активную вкладку
    document.querySelectorAll('.date-tab').forEach(tab => tab.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // Обновляем дату в секции ТЗ
    const tzDateSpan = document.getElementById('tzCurrentDate');
    if (tzDateSpan) tzDateSpan.textContent = date;
    
    // Перезагружаем данные для выбранной даты
    renderListsView();
    renderSetsAndCompliance(null);
    showToast(`Загружены списки за ${date}`, 'info');
};

// ========================================
// ОЧИСТКА БАЗЫ ДАННЫХ
// ========================================
window.clearDatabase = async function() {
    if (!confirm('ВНИМАНИЕ! Это действие удалит ВСЕХ абитуриентов из базы данных. Вы уверены?')) {
        return;
    }
    
    if (!confirm('Повторите подтверждение: очистить ВСЮ базу данных?')) {
        return;
    }
    
    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/clear-database', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Admin-Token': token || ''
            }
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast('База данных успешно очищена', 'success');
            // Обновляем отображение
            loadFaculties();
            loadApplicants();
            renderListsView();
        } else {
            showToast(result.error || 'Ошибка очистки БД', 'error');
        }
    } catch (e) {
        console.error('Ошибка очистки БД:', e);
        showToast('Ошибка сети при очистке БД', 'error');
    }
};

// ========================================
// НАВИГАЦИЯ И БОКОВАЯ ПАНЕЛЬ
// ========================================
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

function setupSidebarNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');
    let viewOrder = ['dashboard', 'lists', 'analytics', 'import', 'reports', 'settings'];
    let currentIndex = 0;
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (!item.hasAttribute('data-view')) return;
            
            e.preventDefault();
            
            const newViewName = item.dataset.view;
            const newIndex = viewOrder.indexOf(newViewName);
            const direction = newIndex > currentIndex ? 'down' : 'up';

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            views.forEach(view => {
                view.style.display = 'none';
                view.classList.remove('enter-up', 'enter-down');
            });
            
            const viewId = `view-${newViewName}`;
            const targetView = document.getElementById(viewId);
            if (targetView) {
                targetView.style.display = 'block';
                
                void targetView.offsetWidth;
                if (direction === 'down') {
                    targetView.classList.add('enter-up');
                } else {
                    targetView.classList.add('enter-down');
                }

                if (newViewName === 'lists') renderListsView();
                if (newViewName === 'analytics') renderAnalyticsView();
                if (newViewName === 'settings') {
                    loadUsersManagement();
                    renderFacultiesEditTable();
                }
            }
            
            currentIndex = newIndex;
        });
    });
}

// ========================================
// ДАТА И ВРЕМЯ
// ========================================
function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    const now = new Date();
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };
    dateElement.textContent = now.toLocaleDateString('ru-RU', options);
}

function updateLastUpdateTime() {
    const updateElement = document.getElementById('lastUpdate');
    const now = new Date();
    const diffMinutes = Math.floor((now - lastUpdateTime) / 60000);
    let text;
    
    if (diffMinutes === 0) {
        text = 'Обновлено: только что';
    } else if (diffMinutes === 1) {
        text = 'Обновлено: 1 мин назад';
    } else {
        text = `Обновлено: ${diffMinutes} мин назад`;
    }

    updateElement.textContent = text;
}

// ========================================
// АНИМАЦИЯ СЧЕТЧИКА
// ========================================
function animateValue(obj, start, end, duration) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}

// ========================================
// ЗАГРУЗКА ФАКУЛЬТЕТОВ
// ========================================
async function loadFaculties(animate = true) {
    try {
        const response = await fetch('/api/faculties');
        const faculties = await response.json();
        
        const container = document.getElementById('facultiesContainer');
        container.innerHTML = '';
        
        const allBtn = document.createElement('div');
        allBtn.className = 'faculty-card' + (currentFaculty === 'all' ? ' active' : '');
        allBtn.innerHTML = `
            <h3>Все факультеты</h3>
            <div class="big-number">ВСЕ</div>
            <div class="progress-container">
                <div class="progress-bar" style="width: 100%"></div>
            </div>
            <div class="details">
                <span>Все программы</span>
            </div>
        `;
        allBtn.onclick = () => selectFaculty('all', 'Все абитуриенты');
        container.appendChild(allBtn);
        
        const listSelect = document.getElementById('listFacultySelect');
        if (listSelect) {
            const currentVal = listSelect.value;
            listSelect.innerHTML = '<option value="">Все факультеты</option>';
            Object.entries(faculties).forEach(([key, faculty]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = faculty.name;
                listSelect.appendChild(opt);
            });
            if (faculties[currentVal]) listSelect.value = currentVal;
        }

        for (const [key, faculty] of Object.entries(faculties)) {
            const card = document.createElement('div');
            card.className = 'faculty-card' + (currentFaculty === key ? ' active' : '');
            
            const totalPlaces = faculty.places || faculty.total || 0;
            const occupied = faculty.occupied || 0;
            const percent = totalPlaces > 0 ? Math.min(100, Math.round((occupied / totalPlaces) * 100)) : 0;
            const remaining = Math.max(0, totalPlaces - occupied);
            
            card.innerHTML = `
                <h3>${faculty.name}</h3>
                <div class="big-number" id="cnt-${key}">${animate ? 0 : remaining}</div>
                <div class="details">
                    <span>Занято мест: ${occupied}/${totalPlaces}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${percent}%"></div>
                </div>
                <div class="progress-text">Осталось: ${remaining}</div>
            `;
            card.onclick = () => selectFaculty(key, faculty.name);
            container.appendChild(card);
            
            if (animate) {
                setTimeout(() => {
                    animateValue(document.getElementById(`cnt-${key}`), 0, remaining, 800);
                }, 100);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки факультетов:', error);
    }
}

function selectFaculty(facultyKey, facultyName) {
    currentFaculty = facultyKey;
    loadFaculties(false);
    loadApplicants();
}

// ========================================
// ЗАГРУЗКА АБИТУРИЕНТОВ (СИНТАКСИС ИСПРАВЛЕН)
// ========================================
async function loadApplicants() {
    try {
        const response = await fetch(`/api/applicants?faculty=${currentFaculty}`);
        let applicants = await response.json();
        
        if (!Array.isArray(applicants)) {
            if (applicants.applicants && Array.isArray(applicants.applicants)) applicants = applicants.applicants;
            else if (applicants.value && Array.isArray(applicants.value)) applicants = applicants.value;
            else applicants = [];
        }

        const tbody = document.getElementById('applicantsTableBody');
        tbody.innerHTML = '';
        
        if (applicants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Нет данных</td></tr>';
            return;
        }
        
        applicants.sort((a, b) => b.score - a.score);
        
        if (typeof renderAdmissionChanceChart === 'function') {
            renderAdmissionChanceChart(applicants);
        }

        applicants.forEach((applicant, index) => {
            const row = document.createElement('tr');
            row.classList.add('animate-slide-up');
            if (index < 5) row.classList.add(`stagger-${index + 1}`);
            
            let statusBadge = '';
            if (!isAdminMode) {
                const statusClass = applicant.status === 'допущен' ? 'status-допущен' : 'status-на-рассмотрении';
                const statusText = applicant.status === 'допущен' ? 'Допущен' : 'На рассмотрении';
                statusBadge = `<span class="status-badge ${statusClass}">${statusText}</span>`;
            } else {
                const isAdmitted = applicant.status === 'допущен';
                statusBadge = `
                    <select onchange="updateApplicantStatus(${applicant.id}, this.value)" style="padding:4px; border-radius:4px; border:1px solid #cbd5e1;">
                        <option value="на рассмотрении" ${!isAdmitted ? 'selected' : ''}>На рассмотрении</option>
                        <option value="допущен" ${isAdmitted ? 'selected' : ''}>Допущен</option>
                    </select>
                `;
            }

            let actions = `<a href="/sadb.html?id=${applicant.id}" class="btn-view" style="background:none; color:#3b82f6; padding:0;">Просмотр</a>`;
            if (isAdminMode && applicant.status === 'допущен') {
                actions += `<button onclick="sendAdmissionEmail(${applicant.id}, this)" style="border:none; background:none; cursor:pointer; color:#10b981; margin-left:8px;" title="Отправить письмо"><i class="fa-solid fa-envelope"></i></button>`;
            }

            row.innerHTML = `
                <td>${applicant.id}</td>
                <td>${applicant.fullName}</td>
                <td><strong>${applicant.score}</strong></td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            `;
            tbody.appendChild(row);
        });
        
        lastUpdateTime = new Date();
    } catch (error) {
        console.error('Ошибка загрузки абитуриентов:', error);
    }
}

// ========================================
// УПРАВЛЕНИЕ СТАТУСОМ АБИТУРИЕНТОВ
// ========================================
async function updateApplicantStatus(id, newStatus) {
    if (!isAdminMode) {
        alert('Доступ запрещен. Требуются права администратора.');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/update-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': token || ''
            },
            body: JSON.stringify({ id, status: newStatus })
        });
        
        if (res.ok) {
            renderListsView();
            loadApplicants();
        } else {
            const err = await res.json();
            alert(err.error || 'Ошибка обновления статуса');
        }
    } catch (e) {
        console.error('Ошибка обновления статуса:', e);
    }
}

// ========================================
// ОТПРАВКА EMAIL
// ========================================
async function sendAdmissionEmail(id, btn) {
    if (!confirm(`Отправить письмо о зачислении абитуриенту ID ${id}?`)) return;
    
    const originalIcon = btn ? btn.innerHTML : '';
    if (btn) {
        btn.classList.add('btn-loading');
    }

    try { 
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                to: `applicant_${id}@example.com`,
                subject: "Поздравляем с поступлением!",
                body: "Вы были зачислены в учебное заведение."
            })
        });
        
        const result = await res.json();
        
        if (btn) btn.classList.remove('btn-loading');

        if (result.success) {
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                btn.classList.add('btn-success-anim');
                setTimeout(() => {
                    btn.innerHTML = originalIcon;
                    btn.classList.remove('btn-success-anim');
                }, 2000);
            } else {
                alert('Письмо отправлено!');
            }
        } else {
            if (btn) btn.innerHTML = originalIcon;
            alert('Ошибка: ' + result.message);
        }
    } catch (e) {
        console.error('Ошибка отправки email:', e);
        if (btn) {
            btn.classList.remove('btn-loading');
            btn.innerHTML = originalIcon;
        }
        alert('Ошибка отправки письма');
    }
}

// ========================================
// ГРАФИК ШАНСОВ ПОСТУПЛЕНИЯ
// ========================================
let admissionChart = null;
function renderAdmissionChanceChart(applicants) {
    const ctx = document.getElementById('admissionChanceChart');
    if (!ctx) return;

    const ranges = {
        'Низкий (<180)': { count: 0, color: '#ef4444' },
        'Средний (180-220)': { count: 0, color: '#f59e0b' },
        'Высокий (220-260)': { count: 0, color: '#10b981' },
        'Гарантировано (>260)': { count: 0, color: '#3b82f6' }
    };

    applicants.forEach(app => {
        const score = Number(app.score) || 0;
        if (score < 180) ranges['Низкий (<180)'].count++;
        else if (score < 220) ranges['Средний (180-220)'].count++;
        else if (score < 260) ranges['Высокий (220-260)'].count++;
        else ranges['Гарантировано (>260)'].count++;
    });

    const labels = Object.keys(ranges);
    const data = labels.map(label => ranges[label].count);
    const backgroundColors = labels.map(label => ranges[label].color);

    if (admissionChart) admissionChart.destroy();

    admissionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Количество абитуриентов',
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Распределение по баллам и шансам' }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// ========================================
// ЭКСПОРТ В EXCEL (CSV)
// ========================================
window.exportToExcel = async function() {
    try {
        // Используем серверный API для генерации CSV
        const faculty = currentFaculty || 'all';
        const url = `/api/export-csv?faculty=${faculty}`;
        
        // Создаем ссылку для скачивания напрямую
        const link = document.createElement('a');
        link.href = url;
        link.download = `applicants_${faculty}_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Скачивание CSV файла началось...', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта в CSV:', error);
        showToast('Ошибка экспорта: ' + error.message, 'error');
    }
};

// ========================================
// СОРТИРОВКА ТАБЛИЦЫ
// ========================================
window.sortTable = function(n) {
    let table, rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
    table = document.getElementById('listsTable') || document.getElementById('applicantsTable');
    if (!table) return;
    switching = true;
    dir = 'asc';
    
    while (switching) {
        switching = false;
        rows = table.rows;
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            x = rows[i].getElementsByTagName('TD')[n];
            y = rows[i + 1].getElementsByTagName('TD')[n];
            let xVal = x.textContent || x.innerText;
            let yVal = y.textContent || y.innerText;
            
            if (!isNaN(parseFloat(xVal)) && isFinite(xVal)) {
                xVal = parseFloat(xVal);
                yVal = parseFloat(yVal);
            }
            
            if (dir == 'asc') {
                if (xVal > yVal) { shouldSwitch = true; break; }
            } else if (dir == 'desc') {
                if (xVal < yVal) { shouldSwitch = true; break; }
            }
        }
        
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchcount++;
        } else {
            if (switchcount == 0 && dir == 'asc') {
                dir = 'desc';
                switching = true;
            }
        }
    }
};

// ========================================
// FUZZY SEARCH
// ========================================
function getTrigrams(str) {
    const s = " " + str.toLowerCase() + " ";
    const v = [];
    for (let i = 0; i < s.length - 2; i++) {
        v.push(s.slice(i, i + 3));
    }
    return v;
}

function calculateFuzzySimilarity(text, query) {
    if (!query) return 1.0;
    if (!text) return 0.0;
    const textTrigrams = getTrigrams(text);
    const queryTrigrams = getTrigrams(query);

    if (queryTrigrams.length === 0) return 1.0;

    let matches = 0;
    for (const qt of queryTrigrams) {
        if (textTrigrams.includes(qt)) matches++;
    }

    return matches / queryTrigrams.length;
}

// ========================================
// РЕНДЕР СТРАНИЦЫ СПИСКОВ
// ========================================
window.renderListsView = async function() {
    const container = document.getElementById('view-lists');
    if (!container || container.style.display === 'none') {
        const viewList = document.getElementById('view-lists');
        if (viewList) viewList.style.display = 'block';
    }
    
    const tbody = document.getElementById('listsTableBody');
    if (!tbody) return;

    const searchInput = document.getElementById('listSearchInput');
    const facultySelect = document.getElementById('listFacultySelect');
    const statusSelect = document.getElementById('listStatusSelect');
    const consentSelect = document.getElementById('listConsentSelect');
    const prioritySelect = document.getElementById('listPrioritySelect');

    const searchQuery = searchInput ? searchInput.value.trim() : "";
    const selectedFaculty = facultySelect ? facultySelect.value : "";
    const selectedStatus = statusSelect ? statusSelect.value : "";
    const selectedConsent = consentSelect ? consentSelect.value : "";
    const selectedPriority = prioritySelect ? prioritySelect.value : "";

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Загрузка данных <span class="loading-dots"></span></td></tr>';

    try {
        const res = await fetch(`/api/applicants?faculty=${selectedFaculty || 'all'}`);
        let data = await res.json();
        
        if (!Array.isArray(data)) {
            if (data.applicants && Array.isArray(data.applicants)) data = data.applicants;
            else if (data.value && Array.isArray(data.value)) data = data.value;
            else data = [];
        }

        let filteredData = data.filter(app => {
            // Фильтр по статусу
            if (selectedStatus && app.status !== selectedStatus) return false;
            
            // Фильтр по согласию
            if (selectedConsent === 'yes' && !app.hasConsent) return false;
            if (selectedConsent === 'no' && app.hasConsent) return false;
            
            // Фильтр по приоритету
            if (selectedPriority && app.priorities) {
                const priorityIndex = parseInt(selectedPriority) - 1;
                if (selectedFaculty && app.priorities.indexOf(selectedFaculty) !== priorityIndex) {
                    return false;
                }
            }
            
            // Фильтр по ФИО (fuzzy search)
            if (searchQuery) {
                const similarity = calculateFuzzySimilarity(app.fullName, searchQuery);
                if (similarity < 0.3) return false; 
            }
            return true;
        });

        // Обновляем статистику
        updateListStats(filteredData, data, selectedFaculty);

        // Сортируем по баллам
        filteredData.sort((a, b) => (b.score || 0) - (a.score || 0));

        tbody.innerHTML = '';
        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Нет данных</td></tr>';
            return;
        }

        const rows = filteredData.map(app => {
            let statusHtml = '';
            if (!isAdminMode) {
                const statusClass = app.status === 'допущен' ? 'status-допущен' : 'status-на-рассмотрении';
                const statusText = app.status === 'допущен' ? 'Допущен' : 'На рассмотрении';
                statusHtml = `<span class='status-badge ${statusClass}'>${statusText}</span>`;
            } else {
                const isAdmitted = app.status === 'допущен';
                statusHtml = `
                    <select onchange="updateApplicantStatus(${app.id}, this.value)" style="padding:4px; border-radius:4px; border:1px solid #cbd5e1;">
                        <option value="на рассмотрении" ${!isAdmitted ? 'selected' : ''}>На рассмотрении</option>
                        <option value="допущен" ${isAdmitted ? 'selected' : ''}>Допущен</option>
                    </select>
                `;
            }

            // Добавляем иконку согласия
            const consentIcon = app.hasConsent 
                ? '<span style="color: #10b981;" title="Есть согласие">✓</span>' 
                : '<span style="color: #94a3b8;" title="Нет согласия">-</span>';
            
            // Приоритет факультета
            const priorityNum = app.priorities ? app.priorities.indexOf(app.faculty) + 1 : '-';

            return `
                <tr style='border-bottom: 1px solid #e2e8f0;'>
                    <td style='padding:12px;'>${app.id}</td>
                    <td style='padding:12px;'>${app.fullName}</td>
                    <td style='padding:12px;'>${app.faculty} ${consentIcon}</td>
                    <td style='padding:12px;'>Пр. ${priorityNum}</td>
                    <td style='padding:12px;'><strong>${app.score}</strong></td>
                    <td style='padding:12px;'>${statusHtml}</td>
                    <td style='padding:12px;'><button class="btn-icon" onclick="window.location.href='/sadb.html?id=${app.id}'"><i class="fa-solid fa-eye"></i></button></td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rows.join('');
    } catch (e) {
        console.error('Ошибка загрузки списков:', e);
        tbody.innerHTML = '<tr><td colspan="7">Ошибка загрузки</td></tr>';
    }
};

function updateListStats(filteredData, allData, selectedFaculty) {
    const statTotal = document.getElementById('statTotal');
    const statConsent = document.getElementById('statConsent');
    const statPriority1 = document.getElementById('statPriority1');
    
    if (statTotal) statTotal.textContent = filteredData.length;
    if (statConsent) statConsent.textContent = filteredData.filter(a => a.hasConsent).length;
    if (statPriority1) {
        if (selectedFaculty) {
            statPriority1.textContent = filteredData.filter(a => 
                a.priorities && a.priorities[0] === selectedFaculty
            ).length;
        } else {
            statPriority1.textContent = filteredData.filter(a => a.priorities && a.priorities.length > 0).length;
        }
    }
    
    // Обновляем визуализацию множеств и соответствие ТЗ
    renderSetsAndCompliance(allData);
}

// ========================================
// ВИЗУАЛИЗАЦИЯ МНОЖЕСТВ И СООТВЕТСТВИЕ ТЗ
// ========================================
async function renderSetsAndCompliance(applicants) {
    if (!applicants || !Array.isArray(applicants)) {
        try {
            const res = await fetch('/api/applicants?faculty=all');
            applicants = await res.json();
            if (!Array.isArray(applicants)) {
                applicants = applicants.applicants || [];
            }
        } catch (e) {
            console.error('Ошибка загрузки данных для множеств:', e);
            return;
        }
    }
    
    // Получаем данные о факультетах
    let faculties = {};
    try {
        const facRes = await fetch('/api/faculties');
        faculties = await facRes.json();
    } catch (e) {}
    
    // Создаём множества по ОП
    const sets = {
        pm: new Set(),
        ivt: new Set(),
        itss: new Set(),
        ib: new Set()
    };
    
    // Заполняем множества
    applicants.forEach(app => {
        const priorities = app.priorities || [app.faculty];
        priorities.forEach(p => {
            if (sets[p]) {
                sets[p].add(app.id);
            }
        });
    });
    
    // Вычисляем пересечения
    const intersections = {};
    const opKeys = Object.keys(sets);
    
    // Попарные пересечения
    for (let i = 0; i < opKeys.length; i++) {
        for (let j = i + 1; j < opKeys.length; j++) {
            const key1 = opKeys[i];
            const key2 = opKeys[j];
            const intersection = new Set([...sets[key1]].filter(x => sets[key2].has(x)));
            intersections[`${key1}∩${key2}`] = intersection.size;
        }
    }
    
    // Рендерим карточки множеств
    const setsVis = document.getElementById('setsVisualization');
    if (setsVis) {
        const opNames = {
            pm: 'ПМИ (Прикл. математика)',
            ivt: 'ИВТ (Информатика)',
            itss: 'ИТСС (Инфоком. техн.)',
            ib: 'ИБ (Инф. безопасность)'
        };
        const colors = {
            pm: '#3b82f6',
            ivt: '#10b981',
            itss: '#f59e0b',
            ib: '#ef4444'
        };
        
        setsVis.innerHTML = opKeys.map(key => `
            <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid ${colors[key]}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="font-weight: 600; color: ${colors[key]}; margin-bottom: 8px;">${opNames[key]}</div>
                <div style="font-size: 28px; font-weight: 700; color: #1e293b;">|A<sub>${key.toUpperCase()}</sub>| = ${sets[key].size}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
                    Уникальных абитуриентов
                </div>
            </div>
        `).join('');
    }
    
    // Рендерим таблицу пересечений
    const intersTable = document.getElementById('intersectionsTable');
    if (intersTable) {
        let tableHTML = `
            <h4 style="margin-bottom: 10px; color: #1e40af;">Пересечения множеств (абитуриенты на несколько ОП):</h4>
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #1e40af; color: white;">
                        <th style="padding: 10px; text-align: left;">Пересечение</th>
                        <th style="padding: 10px; text-align: center;">Кол-во</th>
                        <th style="padding: 10px; text-align: left;">Описание</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.entries(intersections).forEach(([key, count]) => {
            const [op1, op2] = key.split('∩');
            const opNames = { pm: 'ПМИ', ivt: 'ИВТ', itss: 'ИТСС', ib: 'ИБ' };
            tableHTML += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px; font-family: monospace; font-weight: 600;">
                        A<sub>${op1.toUpperCase()}</sub> ∩ A<sub>${op2.toUpperCase()}</sub>
                    </td>
                    <td style="padding: 10px; text-align: center; font-weight: 700; color: ${count > 0 ? '#3b82f6' : '#94a3b8'};">
                        ${count}
                    </td>
                    <td style="padding: 10px; color: #64748b; font-size: 13px;">
                        Подали на ${opNames[op1]} и ${opNames[op2]}
                    </td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table>';
        intersTable.innerHTML = tableHTML;
    }
    
    // Рендерим соответствие ТЗ
    renderTZCompliance(sets, faculties);
}

function renderTZCompliance(sets, faculties) {
    const container = document.getElementById('tzComplianceTable');
    if (!container) return;
    
    const opNames = { pm: 'ПМИ', ivt: 'ИВТ', itss: 'ИТСС', ib: 'ИБ' };
    const dates = ['01.08', '02.08', '03.08', '04.08'];
    
    let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: rgba(255,255,255,0.1);">
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.2);">ОП</th>
                    <th style="padding: 10px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.2);">Мест</th>
                    <th style="padding: 10px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.2);">Факт</th>
                    <th style="padding: 10px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.2);">Требование ТЗ<br><small>(${currentDate})</small></th>
                    <th style="padding: 10px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.2);">Статус</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    const currentReq = tzRequirements[currentDate] || tzRequirements['01.08'];
    
    Object.entries(sets).forEach(([key, set]) => {
        const required = currentReq[key] || 0;
        const actual = set.size;
        const places = faculties[key]?.total || faculties[key]?.places || 0;
        const isOk = actual >= required * 0.9; // 90% допуск
        
        tableHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding: 10px; font-weight: 600;">${opNames[key]}</td>
                <td style="padding: 10px; text-align: center;">${places}</td>
                <td style="padding: 10px; text-align: center; font-weight: 700; font-size: 16px;">${actual}</td>
                <td style="padding: 10px; text-align: center;">≥ ${required}</td>
                <td style="padding: 10px; text-align: center;">
                    ${isOk 
                        ? '<span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px;">✓ Соответствует</span>' 
                        : '<span style="background: #f59e0b; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px;">⚠ Проверить</span>'
                    }
                </td>
            </tr>
        `;
    });
    
    // Добавляем итог
    const totalActual = Object.values(sets).reduce((sum, s) => sum + s.size, 0);
    const totalRequired = Object.values(currentReq).reduce((sum, v) => sum + v, 0);
    
    tableHTML += `
            <tr style="background: rgba(255,255,255,0.1); font-weight: 700;">
                <td style="padding: 10px;">ИТОГО</td>
                <td style="padding: 10px; text-align: center;">${Object.values(faculties).reduce((s, f) => s + (f.total || f.places || 0), 0)}</td>
                <td style="padding: 10px; text-align: center; font-size: 18px; color: #3b82f6;">${totalActual}</td>
                <td style="padding: 10px; text-align: center;">≥ ${totalRequired}</td>
                <td style="padding: 10px; text-align: center;">
                    ${totalActual >= totalRequired * 0.9 
                        ? '<span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 12px;">✓ OK</span>' 
                        : '<span style="background: #ef4444; color: white; padding: 4px 12px; border-radius: 12px;">✗</span>'
                    }
                </td>
            </tr>
        </tbody>
        </table>
        <div style="margin-top: 15px; padding: 10px; background: rgba(59, 130, 246, 0.2); border-radius: 8px; font-size: 12px;">
            <strong>📊 Формула:</strong> |A<sub>ОП</sub>| — мощность множества абитуриентов на ОП<br>
            <strong>Пересечение:</strong> A<sub>1</sub> ∩ A<sub>2</sub> — абитуриенты, подавшие заявления на обе ОП
        </div>
    `;
    
    container.innerHTML = tableHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    const sInput = document.getElementById('listSearchInput');
    if (sInput) sInput.addEventListener('keyup', (e) => renderListsView());
    
    const fSelect = document.getElementById('listFacultySelect');
    if (fSelect) fSelect.addEventListener('change', renderListsView);
    
    const stSelect = document.getElementById('listStatusSelect');
    if (stSelect) stSelect.addEventListener('change', renderListsView);
    
    const consentSel = document.getElementById('listConsentSelect');
    if (consentSel) consentSel.addEventListener('change', renderListsView);
    
    const prioSel = document.getElementById('listPrioritySelect');
    if (prioSel) prioSel.addEventListener('change', renderListsView);
});

// ========================================
// РЕНДЕР АНАЛИТИКИ
// ========================================
let passingScoreChart = null;
let analyticsDonutChart = null;

async function renderAnalyticsView() {
    const container = document.getElementById('view-analytics');
    if (!container) return;
    
    try {
        // Загружаем данные факультетов и абитуриентов
        const [facResponse, appResponse] = await Promise.all([
            fetch('/api/faculties'),
            fetch('/api/applicants?faculty=all')
        ]);
        
        const faculties = await facResponse.json();
        let applicants = await appResponse.json();
        
        if (!Array.isArray(applicants)) {
            if (applicants.applicants) applicants = applicants.applicants;
            else applicants = [];
        }
        
        // Рендерим карточки проходных баллов
        renderPassingScoresCards(faculties, applicants);
        
        // Рендерим KPI
        renderKPICards(faculties, applicants);
        
        // Рендерим график динамики
        renderPassingScoreDynamicsChart(faculties);

        // Загружаем средний балл
        loadAverageScores();
        
    } catch (e) {
        console.error('Ошибка загрузки аналитики:', e);
    }
}

function renderPassingScoresCards(faculties, applicants) {
    const container = document.getElementById('passingScoresSection');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.entries(faculties).forEach(([key, faculty]) => {
        const totalPlaces = faculty.total || faculty.places || 0;
        const consentsCount = applicants.filter(a => 
            (a.faculty === key || (a.priorities && a.priorities[0] === key)) && a.hasConsent
        ).length;
        const applicantsCount = applicants.filter(a => 
            a.faculty === key || (a.priorities && a.priorities.includes(key))
        ).length;
        
        const passingScore = faculty.passingScore;
        const isNedobor = passingScore === "НЕДОБОР" || consentsCount < totalPlaces;
        
        const card = document.createElement('div');
        card.className = 'passing-score-card';
        card.innerHTML = `
            <div class="faculty-name">${faculty.name}</div>
            <div class="score-value ${isNedobor ? 'nedobor' : ''}">
                ${isNedobor ? '⚠️ НЕДОБОР' : passingScore + ' баллов'}
            </div>
            <div class="stats-row">
                <span>Мест: ${totalPlaces}</span>
                <span>Согласий: ${consentsCount}</span>
            </div>
            <div class="stats-row">
                <span>Заявлений: ${applicantsCount}</span>
                <span>1-й пр.: ${applicants.filter(a => a.priorities && a.priorities[0] === key).length}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function loadAverageScores() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        const container = document.getElementById('averageScoresSection');
        if(!container) return;
        container.innerHTML = '';
        
        Object.keys(stats).forEach(key => {
            const stat = stats[key];
            const div = document.createElement('div');
            div.className = 'passing-score-card';
            div.innerHTML = `
                <div class="faculty-name">${stat.name}</div>
                <div class="score-value" style="color: #3b82f6;">
                    ${stat.averageScore}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
                    Средний балл (всего ${stat.count})
                </div>
            `;
            container.appendChild(div);
        });
    } catch(e) {
        console.error("Error loading stats", e);
    }
}

function renderKPICards(faculties, applicants) {
    const container = document.getElementById('kpiGrid');
    if (!container) return;
    
    const total = applicants.length;
    const withConsent = applicants.filter(a => a.hasConsent).length;
    const admitted = applicants.filter(a => a.status === 'допущен').length;
    const avgScore = total > 0 
        ? (applicants.reduce((sum, a) => sum + (a.score || 0), 0) / total).toFixed(1) 
        : 0;
    
    const totalPlaces = Object.values(faculties).reduce((sum, f) => sum + (f.total || f.places || 0), 0);
    const competition = totalPlaces > 0 ? (total / totalPlaces).toFixed(1) : 0;
    
    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-label">Всего заявлений</div>
            <div class="kpi-value">${total}</div>
            <div class="kpi-change positive">По всем ОП</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">С согласием</div>
            <div class="kpi-value">${withConsent}</div>
            <div class="kpi-change">${total > 0 ? ((withConsent / total) * 100).toFixed(1) : 0}% от общего</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Средний балл</div>
            <div class="kpi-value">${avgScore}</div>
            <div class="kpi-change positive">По всем абитуриентам</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Конкурс</div>
            <div class="kpi-value">${competition}</div>
            <div class="kpi-change">чел./место</div>
        </div>
    `;
}

function renderPassingScoreDynamicsChart(faculties) {
    const ctx = document.getElementById('passingScoreDynamicsChart');
    if (!ctx) return;
    
    if (passingScoreChart) passingScoreChart.destroy();
    
    const dates = ['01.08', '02.08', '03.08', '04.08'];
    const colors = {
        pm: '#3b82f6',
        ivt: '#10b981',
        itss: '#f59e0b',
        ib: '#ef4444'
    };
    
    const datasets = Object.entries(faculties).map(([key, faculty]) => {
        const data = dates.map(date => {
            const historyVal = dateDataHistory[date]?.[key];
            if (historyVal === 0) return null; // НЕДОБОР
            return historyVal || faculty.passingScore || 0;
        });
        
        return {
            label: faculty.name.split('(')[0].trim(),
            data: data,
            borderColor: colors[key] || '#64748b',
            backgroundColor: (colors[key] || '#64748b') + '20',
            tension: 0.4,
            fill: true,
            pointRadius: 6,
            pointHoverRadius: 8
        };
    });
    
    passingScoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { usePointStyle: true }
                },
                title: { 
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.raw === null || context.raw === 0) {
                                return context.dataset.label + ': НЕДОБОР';
                            }
                            return context.dataset.label + ': ' + context.raw + ' баллов';
                        }
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: false,
                    min: 180,
                    title: { display: true, text: 'Проходной балл' }
                },
                x: {
                    title: { display: true, text: 'Дата' }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

// ========================================
// УВЕДОМЛЕНИЯ
// ========================================
function showToast(message, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification show';
    toast.innerHTML = `<i class='fa-solid fa-circle-exclamation'></i> <span>${message}</span>`;

    if (type === 'success') {
        toast.style.borderLeftColor = '#10b981';
        toast.querySelector('i').className = 'fa-solid fa-check-circle';
        toast.querySelector('i').style.color = '#10b981';
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}

// ========================================
// УПРАВЛЕНИЕ ФАКУЛЬТЕТАМИ
// ========================================
let editingFaculties = {};

async function loadFacultiesForEdit() {
    try {
        const res = await fetch('/api/faculties');
        if (res.ok) {
            editingFaculties = await res.json();
            renderFacultiesEditTable();
        }
    } catch (e) {
        console.error('Ошибка загрузки факультетов для редактирования:', e);
    }
}

function renderFacultiesEditTable() {
    const tbody = document.getElementById('facultiesEditBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const actionsDiv = document.getElementById('facultyActions');
    const canManageFaculties = isAdminMode || (currentUser && currentUser.permissions && currentUser.permissions.includes('manage_faculties'));

    if (actionsDiv) actionsDiv.style.display = canManageFaculties ? 'block' : 'none';

    Object.keys(editingFaculties).forEach(key => {
        const f = editingFaculties[key];
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';
        
        const disabledAttr = canManageFaculties ? '' : 'disabled';
        const bgStyle = canManageFaculties ? '' : 'background: #f8fafc; color: #94a3b8;';
        
        const buttonsHtml = canManageFaculties ? `
            <button class="btn-icon" style="color: #3b82f6; background: none; border: none; cursor: pointer;" onclick="saveSingleFaculty('${key}')" title="Сохранить эту строку"><i class="fa-solid fa-save"></i></button>
            <button class="btn-icon delete" style="color: #ef4444; background: none; border: none; cursor: pointer;" onclick="removeFacultyRow('${key}')" title="Удалить"><i class="fa-solid fa-trash"></i></button>
        ` : `<span style="font-size:12px; color:#cbd5e1;">Только чтение</span>`;

        tr.innerHTML = `
            <td style="padding: 10px;">
                <input type="text" value="${key}" disabled style="width: 100px; background: #e2e8f0; border: 1px solid #cbd5e1; padding: 4px; border-radius: 4px; color: #64748b;">
            </td>
            <td style="padding: 10px;">
                <input type="text" class="edit-name" data-key="${key}" value="${f.name}" ${disabledAttr} style="width: 100%; border: 1px solid #cbd5e1; padding: 4px; border-radius: 4px; ${bgStyle}">
            </td>
            <td style="padding: 10px;">
                <input type="text" class="edit-places" data-key="${key}" value="${f.places || f.total || 50}" ${disabledAttr} style="width: 80px; border: 1px solid #cbd5e1; padding: 4px; border-radius: 4px; ${bgStyle}">
                <span style="font-size: 11px; color: #94a3b8; margin-left: 5px;">(Зан: ${f.occupied || 0})</span>
            </td>
            <td style="padding: 10px; display:flex; gap: 8px;">
                ${buttonsHtml}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.saveSingleFaculty = async function(key) {
    const nameInput = document.querySelector(`.edit-name[data-key="${key}"]`);
    const placeInput = document.querySelector(`.edit-places[data-key="${key}"]`);
    
    if (nameInput && editingFaculties[key]) editingFaculties[key].name = nameInput.value;
    if (placeInput && editingFaculties[key]) {
        editingFaculties[key].places = parseInt(placeInput.value) || 0;
        editingFaculties[key].total = editingFaculties[key].places;
    }

    await window.saveFacultiesChanges();
};

window.addFacultyRow = function() {
    const promptId = prompt("Введите уникальный ID факультета (лат. буквы, без пробелов, например: 'bio_tech'):");
    if (!promptId) return;
    if (!/^[a-zA-Z0-9_]+$/.test(promptId)) {
        alert('Только латинские буквы, цифры и подчеркивание!');
        return;
    }
    if (editingFaculties[promptId]) {
        alert('Такой ID уже существует!');
        return;
    }

    const promptName = prompt("Введите название факультета:", "Новый Факультет");

    editingFaculties[promptId] = {
        name: promptName || "Новый Факультет",
        places: 50,
        occupied: 0,
        total: 50
    };
    renderFacultiesEditTable();

    if (confirm("Сохранить новый факультет сейчас?")) {
        window.saveFacultiesChanges();
    }
};

window.removeFacultyRow = function(key) {
    if (confirm('Вы уверены? Это может повлиять на отображение существующих заявок этого факультета.')) {
        delete editingFaculties[key];
        renderFacultiesEditTable();
    }
};

window.saveFacultiesChanges = async function() {
    if (!isAdminMode) {
        alert('Доступ запрещен. Требуются права администратора.');
        return;
    }
    
    const nameInputs = document.querySelectorAll('.edit-name');
    nameInputs.forEach(input => {
        const key = input.dataset.key;
        if (editingFaculties[key]) editingFaculties[key].name = input.value;
    });
    
    const placeInputs = document.querySelectorAll('.edit-places');
    placeInputs.forEach(input => {
        const key = input.dataset.key;
        if (editingFaculties[key]) {
            editingFaculties[key].places = parseInt(input.value) || 0;
            editingFaculties[key].total = editingFaculties[key].places;
        }
    });

    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/faculties', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': token || ''
            },
            body: JSON.stringify(editingFaculties)
        });
        
        if (res.ok) {
            alert('Изменения факультетов сохранены! Обновите страницу.');
            loadFacultiesForEdit();
            loadFaculties();
        } else {
            const err = await res.json();
            alert(err.error || 'Ошибка при сохранении');
        }
    } catch (e) {
        console.error('Ошибка сохранения факультетов:', e);
        alert('Ошибка сети');
    }
};

// ========================================
// АРХИВ КАМПАНИИ
// ========================================
window.archiveCampaign = async function() {
    if (!isAdminMode) {
        alert('Доступ запрещен. Требуются права администратора.');
        return;
    }
    
    const confirmed = confirm("ВНИМАНИЕ: Это действие перенесет ВСЕХ текущих абитуриентов в архив и ОЧИСТИТ текущий список. Вы уверены?");
    if (!confirmed) return;
    
    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/archive', { 
            method: 'POST',
            headers: { 'X-Admin-Token': token || '' }
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert(`Кампания архивирована. ${data.count} записей перенесено.`);
            window.location.reload(); 
        } else {
            alert('Ошибка: ' + (data.error || data.message || 'Неизвестно'));
        }
    } catch (e) {
        alert('Ошибка при архивации: ' + e.message);
    }
};

async function renderArchives() {
    const list = document.getElementById('archiveHistoryList');
    if (!list) return;

    if (!isAdminMode) {
        list.innerHTML = '<li>Доступ к архиву запрещён (только для администратора).</li>';
        return;
    }

    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/archive', {
            headers: { 'X-Admin-Token': token || '' }
        });

        if (!res.ok) {
            if (res.status === 403) {
                list.innerHTML = '<li>Доступ к архиву запрещён (только для администратора).</li>';
            } else {
                list.innerHTML = '<li>Не удалось загрузить архив.</li>';
            }
            return;
        }

        const archives = await res.json();

        if (!archives || archives.length === 0) {
            list.innerHTML = '<li>Архивов пока нет.</li>';
            return;
        }

        list.innerHTML = '';
        archives.forEach((arc) => {
            const li = document.createElement('li');
            li.style.marginBottom = '8px';
            li.style.padding = '8px';
            li.style.background = '#f8fafc';
            li.style.borderRadius = '4px';
            li.style.border = '1px solid #e2e8f0';

            const date = arc.date ? new Date(arc.date).toLocaleDateString() : '???';
            const count = arc.stats ? arc.stats.count : (arc.applicants ? arc.applicants.length : 0);

            li.innerHTML = `<i class="fa-regular fa-clock" style="margin-right:8px; color:#64748b;"></i> <strong>${arc.year || 'Архив'}</strong> (${date}) — ${count} чел.`;
            list.appendChild(li);
        });
    } catch (e) {
        console.error('Ошибка загрузки архива:', e);
        if (list) list.innerHTML = '<li>Не удалось загрузить архив (возможно, нет прав)</li>';
    }
}

// ========================================
// УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ
// ========================================
window.loadUsersManagement = async function() {
    if (!isAdminMode) return;
    
    const tbody = document.getElementById('usersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Загрузка...</td></tr>';
    
    try {
        const token = sessionStorage.getItem('adminToken');
        const res = await fetch('/api/users', { headers: { 'X-Admin-Token': token } });
        if (res.ok) {
            const users = await res.json();
            renderUsersTable(users);
        }
    } catch (e) {
        console.error('Ошибка загрузки пользователей:', e);
    }
};

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        const isSelf = currentUser && currentUser.email === u.email;
        
        const roleSelect = `
            <select onchange="updateUserRole('${u.id}', this.value)" style="padding:4px;" ${isSelf ? 'disabled' : ''}>
                <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="guest" ${u.role === 'guest' ? 'selected' : ''}>Guest</option>
            </select>
        `;
        
        const perms = ['manage_faculties', 'manage_archive', 'update_status', 'send_email', 'manage_users'];
        const permsHtml = perms.map(p => {
            const checked = (u.permissions && u.permissions.includes(p)) ? 'checked' : '';
            const disabled = (u.role === 'admin' || isSelf) ? 'disabled' : '';
            return `<label style="display:block; font-size:11px;"><input type="checkbox" ${checked} ${disabled} onchange="toggleUserPerm('${u.id}', '${p}', this.checked)"> ${p}</label>`;
        }).join('');

        tr.innerHTML = `
            <td>${u.email}</td>
            <td>${u.name}</td>
            <td>${roleSelect}</td>
            <td>${permsHtml}</td>
            <td>${isSelf ? '<small>Это вы</small>' : ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.updateUserRole = async function(id, role) {
    await updateUser(id, { role });
};

window.toggleUserPerm = async function(id, perm, isChecked) {
    const token = sessionStorage.getItem('adminToken');
    const res = await fetch('/api/users', { headers: { 'X-Admin-Token': token } });
    if (res.ok) {
        const users = await res.json();
        const user = users.find(u => u.id === id);
        if (user) {
            let perms = user.permissions || [];
            if (isChecked) {
                if (!perms.includes(perm)) perms.push(perm);
            } else {
                perms = perms.filter(p => p !== perm);
            }
            await updateUser(id, { permissions: perms, role: user.role });
        }
    }
};

async function updateUser(id, data) {
    try {
        const token = sessionStorage.getItem('adminToken');
        
        if (!data.role || !data.permissions) {
            const res = await fetch('/api/users', { headers: { 'X-Admin-Token': token } });
            const users = await res.json();
            const u = users.find(user => user.id === id);
            if (!data.role) data.role = u.role;
            if (!data.permissions) data.permissions = u.permissions || [];
        }

        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Admin-Token': token 
            },
            body: JSON.stringify({ id, ...data })
        });
        
        if (res.ok) {
            showToast('Пользователь обновлен', 'success');
            loadUsersManagement();
        } else {
            const err = await res.json();
            showToast(err.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error('Ошибка обновления пользователя:', e);
    }
}

// ========================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ========================================
document.addEventListener("DOMContentLoaded", () => {
    restoreUserSession();
    loadFacultiesForEdit();
    renderArchives();
});
// ========================================
// PDF REPORT GENERATORS
// ========================================
window.generateDailyReport = async function() {
    if (typeof window.jspdf === 'undefined') {
        alert('���������� PDF �� ���������');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add header
    doc.setFontSize(20);
    doc.text('Daily Admission Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    const date = window.currentDate || new Date().toISOString().split('T')[0];
    doc.text('Date: ' + date, 20, 30);
    
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        
        let y = 45;
        doc.text('Faculty Statistics:', 20, y);
        y += 10;
        
        Object.entries(stats).forEach(([code, data]) => {
            doc.text(code.toUpperCase() + ' - ' + (data.name || code), 25, y);
            y += 7;
            doc.text('  Count: ' + data.count, 25, y);
            y += 7;
            doc.text('  Avg Score: ' + data.averageScore, 25, y);
            y += 10;
        });
        
        // Add footer
        doc.setFontSize(10);
        doc.text('Generated by NLV Admission System', 105, 280, { align: 'center' });
        
        doc.save('daily_report_' + date + '.pdf');
        
    } catch (e) {
        console.error('Error generating PDF:', e);
        alert('������ ��� ��������� PDF');
    }
};

window.generateValidationReport = window.generateDailyReport; // Reuse for now

