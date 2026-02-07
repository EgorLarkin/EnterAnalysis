const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const iconv = require('iconv-lite');
const pdfParse = require('pdf-parse');

// ========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ========================================
function doubleHash(password) {
    const firstHash = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.createHash('sha256').update(firstHash).digest('hex');
}

function isPasswordComplex(password) {
    const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&^])[A-Za-z\d@$!%*#?&^]{8,}$/;
    return regex.test(password);
}

function checkPermission(req, requiredPerm) {
    const token = req.headers['x-admin-token'];
    if (!token) return false;
    
    if (dbData.users) {
        const user = dbData.users.find(u => u.token === token);
        if (user) {
            if (user.role === 'admin') return true;
            if (user.permissions && user.permissions.includes(requiredPerm)) return true;
        }
    }
    
    return token === dbData.settings.adminSessionToken;
}

function saveDatabase() {
    // Determine if this is a blocking save (initialization) or async
    // Making it async to prevent server lag
    fs.writeFile(dbPath, JSON.stringify(dbData, null, 2), 'utf8', (err) => {
        if (err) {
            console.error('❌ Ошибка сохранения базы данных:', err);
        } else {
            console.log('💾 База данных сохранена (async)');
        }
    });
}

function recalculateAdmission() {
    Object.keys(dbData.faculties).forEach(k => {
        dbData.faculties[k].occupied = 0;
        dbData.faculties[k].consents = 0;
    });

    dbData.applicants.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.math !== a.math) return (b.math || 0) - (a.math || 0);
        return (b.russian || 0) - (a.russian || 0);
    });

    const buckets = {};
    Object.keys(dbData.faculties).forEach(k => {
        buckets[k] = { count: 0, limit: dbData.faculties[k].total, lastScore: 0 };
    });

    dbData.applicants.forEach(app => {
        // Учитываем только абитуриентов с согласием
        if (!app.hasConsent) {
             app.status = 'не участвует';
             app.recommendedFaculty = null;
             return;
        }

        let priorityList = app.priorities || (app.faculty ? [app.faculty] : []);
        let admittedTo = null;

        for (const facultyKey of priorityList) {
            if (!buckets[facultyKey]) continue;
            if (buckets[facultyKey].count < buckets[facultyKey].limit) {
                admittedTo = facultyKey;
                buckets[facultyKey].count++;
                buckets[facultyKey].lastScore = app.score;
                break;
            }
        }

        app.status = admittedTo ? 'допущен' : 'на рассмотрении';
        app.recommendedFaculty = admittedTo;
    });

    Object.keys(buckets).forEach(k => {
        dbData.faculties[k].occupied = buckets[k].count;
        dbData.faculties[k].consents = dbData.applicants.filter(a => 
            a.recommendedFaculty === k && a.hasConsent
        ).length;
        dbData.faculties[k].passingScore = 
            buckets[k].count < buckets[k].limit ? "НЕДОБОР" : buckets[k].lastScore;
    });
}

function serveFile(res, filename, contentType) {
    fs.readFile(path.join(__dirname, filename), (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Файл не найден');
            return;
        }
        // For binary/font resources do not append charset
        const fontTypes = ['.ttf', '.otf', '.woff', '.woff2'];
        const ext = path.extname(filename).toLowerCase();
        if (fontTypes.includes(ext)) {
            res.writeHead(200, { 'Content-Type': contentType || 'font/ttf' });
            res.end(data);
        } else {
            res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
            res.end(data);
        }
    });
}

// ========================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ========================================
const dbPath = path.join(__dirname, 'db.json');
const defaultFaculties = {
    pm: { name: 'Прикладная математика (ПМ)', total: 25, occupied: 0, consents: 0, passingScore: 0 },
    ivt: { name: 'Информатика и выч. техника (ИВТ)', total: 40, occupied: 0, consents: 0, passingScore: 0 },
    itss: { name: 'Инфокоммуникационные технологии (ИТСС)', total: 20, occupied: 0, consents: 0, passingScore: 0 },
    ib: { name: 'Информационная безопасность (ИБ)', total: 15, occupied: 0, consents: 0, passingScore: 0 }
};

let dbData = {
    applicants: [],
    settings: { adminPasswordHash: doubleHash('admin') },
    users: [],
    faculties: JSON.parse(JSON.stringify(defaultFaculties)),
    archive: []
};

try {
    if (fs.existsSync(dbPath)) {
        const fileData = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(fileData);
        dbData.applicants = parsed.applicants || [];
        dbData.settings = parsed.settings || { adminPasswordHash: doubleHash('admin') };
        dbData.users = parsed.users || [];
        dbData.archive = parsed.archive || [];
        
        const mapKeys = { 
            'applied_math': 'pm', 'informatics': 'ivt', 'das': 'itss', 'fs': 'ib',
            'economics': 'pm', 'management': 'ivt' 
        };
        
        dbData.applicants.forEach(app => {
            if (mapKeys[app.faculty]) app.faculty = mapKeys[app.faculty];
            if (!app.priorities || !Array.isArray(app.priorities)) {
                app.priorities = app.faculty ? [app.faculty] : [];
            }
            app.priorities = app.priorities.map(p => mapKeys[p] || p);
        });
        
        console.log(`✅ Загружено ${dbData.applicants.length} абитуриентов`);
    } else {
        console.log('🆕 Создан новый файл базы данных');
        saveDatabase();
    }
} catch (err) {
    console.error('❌ Ошибка загрузки базы данных:', err);
    console.log('🔄 Используется база данных по умолчанию');
}

recalculateAdmission();
let lastUpdateTime = new Date();

// ========================================
// ОБРАБОТЧИКИ ЗАПРОСОВ
// ========================================
function handleFaculties(req, res, parsedUrl) {
    if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(dbData.faculties));
    } else if (req.method === 'POST') {
        if (!checkPermission(req, 'manage_faculties')) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
            return;
        }
        
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const newFaculties = JSON.parse(body);
                dbData.faculties = newFaculties;
                saveDatabase();
                recalculateAdmission();
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Ошибка обработки данных' }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Метод не поддерживается');
    }
}

function handleApplicants(req, res, parsedUrl) {
    const faculty = parsedUrl.query.faculty || 'all';
    
    let filteredApplicants = [...dbData.applicants];
    if (faculty !== 'all' && dbData.faculties[faculty]) {
        filteredApplicants = filteredApplicants.filter(a => a.faculty === faculty);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(filteredApplicants));
}

function handleSettings(req, res) {
    if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(dbData.settings));
    } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const newSettings = JSON.parse(body);
                dbData.settings = { ...dbData.settings, ...newSettings };
                saveDatabase();
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Ошибка сохранения' }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Метод не поддерживается');
    }
}

function handleUpdateStatus(req, res) {
    if (!checkPermission(req, 'update_status')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
        return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            const { id, status } = JSON.parse(body);
            const applicant = dbData.applicants.find(a => a.id == id);
            
            if (!applicant) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Абитуриент не найден' }));
                return;
            }
            
            applicant.status = status;
            saveDatabase();
            recalculateAdmission();
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка обновления' }));
        }
    });
}

function handleSendEmail(req, res) {
    if (!checkPermission(req, 'send_email')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
        return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            const { to, subject, body: emailBody } = JSON.parse(body);
            
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER || 'test@example.com',
                    pass: process.env.SMTP_PASS || 'password'
                }
            });
            
            const mailOptions = {
                from: '"Приемная комиссия" <noreply@example.com>',
                to: to,
                subject: subject,
                text: emailBody
            };
            
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Ошибка отправки письма:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: 'Ошибка отправки письма' }));
                } else {
                    console.log('Письмо отправлено:', info.response);
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true }));
                }
            });
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка обработки' }));
        }
    });
}

function handleRegister(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Метод не поддерживается' }));
        return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            const { name, email, password } = JSON.parse(body);
            
            if (!name || !email || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Заполните все поля' }));
                return;
            }
            
            if (!isPasswordComplex(password)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Пароль должен содержать минимум 8 символов, буквы, цифры и спецсимволы' 
                }));
                return;
            }
            
            if (dbData.users.find(u => u.email === email)) {
                res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Пользователь с таким email уже существует' }));
                return;
            }
            
            const newUser = {
                id: Date.now(),
                name: name,
                email: email,
                passwordHash: doubleHash(password),
                role: 'user',
                permissions: [],
                token: crypto.randomBytes(32).toString('hex')
            };
            
            dbData.users.push(newUser);
            saveDatabase();
            
            res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ 
                success: true, 
                message: 'Пользователь успешно зарегистрирован',
                token: newUser.token
            }));
        } catch (err) {
            console.error('Ошибка регистрации:', err);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
        }
    });
}

function handleLogin(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Метод не поддерживается' }));
        return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            const { email, password, username } = JSON.parse(body);
            const login = username || email; // Поддержка обоих полей
            
            if (!login || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Заполните все поля' }));
                return;
            }
            
            // Ищем по username или email
            let user = dbData.users.find(u => 
                u.username === login || 
                u.email === login || 
                u.name === login
            );
            
            if (!user) {
                res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Неверный логин или пароль' }));
                return;
            }
            
            // Проверяем пароль (поддержка простого пароля и хеша)
            const passwordMatch = user.password === password || 
                                  (user.passwordHash && user.passwordHash === doubleHash(password));
            
            if (!passwordMatch) {
                res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Неверный логин или пароль' }));
                return;
            }
            
            // Генерируем токен
            user.token = crypto.randomBytes(32).toString('hex');
            saveDatabase();
            
            console.log(`✅ Успешный вход: ${user.username || user.name} (${user.role})`);
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                success: true,
                token: user.token,
                name: user.name || user.username,
                role: user.role,
                permissions: user.permissions || []
            }));
        } catch (err) {
            console.error('Ошибка входа:', err);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
        }
    });
}

function handleImport(req, res, parsedUrl) {
    // Для демонстрации разрешаем импорт без авторизации
    // В продакшене раскомментировать проверку прав:
    // if (!checkPermission(req, 'import_data')) {
    //     res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    //     res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
    //     return;
    // }

    const importDate = parsedUrl && parsedUrl.query && parsedUrl.query.date ? parsedUrl.query.date : new Date().toISOString().split('T')[0];
    
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
        try {
            const buffer = Buffer.concat(body);
            
            let text;
            if (buffer.lastIndexOf('%PDF-', 0) === 0) {
                 try { const pd = await pdfParse(buffer); text = pd.text; } catch(e){text='';}
            } else {
            // Пробуем декодировать как UTF-8, потом как CP1251
            try {
                text = buffer.toString('utf8');
                // Проверяем на невалидные символы
                if (text.includes('�')) {
                    text = iconv.decode(buffer, 'cp1251');
                }
            } catch (e) {
                text = iconv.decode(buffer, 'cp1251');
            }
            }
            
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            
            let importedCount = 0;
            let currentApplicant = null;
            
            // Определяем формат файла
            const firstLine = lines[0] || '';
            const isCSV = firstLine.includes(';') || firstLine.includes(',');
            
            if (isCSV) {
                // Обработка CSV формата
                // Определяем разделитель
                const separator = firstLine.includes(';') ? ';' : ',';
                
                // Пропускаем заголовок если он есть
                let startIndex = 0;
                const headerLower = firstLine.toLowerCase();
                if (headerLower.includes('фио') || headerLower.includes('имя') || 
                    headerLower.includes('name') || headerLower.includes('id')) {
                    startIndex = 1;
                }
                
                // Парсим заголовок для определения колонок
                const headers = firstLine.split(separator).map(h => h.trim().toLowerCase());
                
                // Ищем индексы колонок
                const findColumn = (names) => {
                    for (const name of names) {
                        const idx = headers.findIndex(h => h.includes(name));
                        if (idx !== -1) return idx;
                    }
                    return -1;
                };
                
                const nameCol = findColumn(['фио', 'имя', 'name', 'fullname', 'ф.и.о']);
                const mathCol = findColumn(['математика', 'матем', 'math']);
                const russianCol = findColumn(['русский', 'русск', 'russian', 'рус']);
                const physicsCol = findColumn(['физика', 'физ', 'physics']);
                const scoreCol = findColumn(['сумма', 'балл', 'score', 'total', 'итого']);
                const facultyCol = findColumn(['факультет', 'направление', 'faculty', 'программа', 'оп']);
                const statusCol = findColumn(['статус', 'status']);
                const consentCol = findColumn(['согласие', 'consent']);
                const prioritiesCol = findColumn(['приоритеты', 'priority', 'priorities', 'приоритет']);
                const idCol = findColumn(['id', 'uid', 'код']);
                const achievementsCol = findColumn(['ид', 'achievements', 'достижения', 'инд']);
                
                for (let i = startIndex; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line) continue;
                    
                    const parts = line.split(separator).map(p => p.trim());
                    if (parts.length < 2) continue;
                    
                    // Получаем данные из колонок
                    let fullName = nameCol >= 0 ? parts[nameCol] : parts[0];
                    let math = mathCol >= 0 ? parseInt(parts[mathCol]) || 0 : 0;
                    let russian = russianCol >= 0 ? parseInt(parts[russianCol]) || 0 : 0;
                    let physics = physicsCol >= 0 ? parseInt(parts[physicsCol]) || 0 : 0;
                    let score = scoreCol >= 0 ? parseInt(parts[scoreCol]) || 0 : 0;
                    let faculty = facultyCol >= 0 ? parts[facultyCol] : 'pm';
                    let status = statusCol >= 0 ? parts[statusCol] : 'на рассмотрении';
                    let hasConsent = false;
                    if (consentCol >= 0) {
                        const val = parts[consentCol].toLowerCase();
                        hasConsent = val === 'да' || val === '1' || val === 'yes' || val === 'true';
                    }
                    
                    let importedId = idCol >= 0 ? parseInt(parts[idCol]) : null;
                    let achievements = achievementsCol >= 0 ? parseInt(parts[achievementsCol]) || 0 : 0;

                    let priorities = [];
                    // Handle Priority/Faculty logic more robustly
                    // Check if we have explicit priority column
                    if (prioritiesCol >= 0 && parts[prioritiesCol]) {
                        const val = parts[prioritiesCol].trim();
                        if (val.match(/^[1-4]$/)) {
                            const pMap = { '1': 'pm', '2': 'ivt', '3': 'itss', '4': 'ib' };
                            priorities = [pMap[val]];
                            faculty = pMap[val]; // Set main faculty based on priority
                        } else {
                            // Maybe it's a list like "pm, ivt"
                           priorities = val.split(/[,;]/).map(p => normalizeFaculty(p.trim())).filter(p => p);
                           if (priorities.length > 0) faculty = priorities[0];
                        }
                    } 
                    
                    // If no priority found, check if we found a faculty column
                    if (priorities.length === 0 && facultyCol >= 0) {
                         faculty = normalizeFaculty(parts[facultyCol]);
                         priorities = [faculty];
                    }
                    
                    // Fallback: If no priority and faculty is default 'pm' but maybe it was just not found
                    // In the provided CSV example: ID;Satisfied;Priority;...
                    // The "Priority" column in list_01.08.csv seems to hold "1" for everyone in the snippet.
                    // Wait, if Priority is "1", then it means PM. But what if it is "2" for others?
                    // User says "everyone goes to math".
                    // Let's verify pMap logic. 
                    // 1=pm, 2=ivt, 3=itss, 4=ib.
                    // If everyone has "1" in the CSV, then everyone is PM.
                    // But if user says "list_01.08.csv", maybe it contains other numbers.
                    
                    // Also fixing duplicates issue:
                    // String comparison for fullname should be case-insensitive and trimmed.
                    
                    // Если сумма не указана, считаем
                    if (score === 0 && (math > 0 || russian > 0 || physics > 0)) {
                        score = math + russian + physics + achievements;
                    }
                    
                    // Если баллы не разделены, но есть сумма
                    if (score > 0 && math === 0 && russian === 0 && physics === 0) {
                        // Примерно распределяем баллы
                        math = Math.round((score - achievements) / 3);
                        russian = Math.round((score - achievements) / 3);
                        physics = score - math - russian - achievements;
                    }
                    
                    // Нормализуем факультет
                    faculty = normalizeFaculty(faculty);
                    
                    // Приоритеты: если не указаны, то текущий факультет - первый (и единственный, если нет других данных)
                    if (priorities.length === 0) {
                        priorities = [faculty];
                    }

                    // Пропускаем пустые ФИО
                    if (!fullName || fullName.length < 3) continue;
                    
                    // Ищем по ID, если есть, или по ФИО
                    let existingIndex = -1;
                    if (importedId) {
                        existingIndex = dbData.applicants.findIndex(a => a.id == importedId); // loose equality for string/int
                    }
                    if (existingIndex === -1) {
                        existingIndex = dbData.applicants.findIndex(a => a.fullName.toLowerCase().trim() === fullName.toLowerCase().trim());
                    }
                    
                    const applicantData = {
                        fullName: fullName,
                        math: math,
                        russian: russian,
                        physics: physics,
                        score: score,
                        bonusPoints: achievements,
                        achievements: [],
                        status: status,
                        hasConsent: hasConsent,
                        faculty: priorities[0] || faculty, // Use first priority as main faculty
                        priorities: priorities,
                        submissionDate: importDate,
                        email: '',
                        phone: ''
                    };

                    if (existingIndex !== -1) {
                         // Проверяем, действительно ли стоит обновлять? 
                         // Если это тот же день или новее.
                         // Но ТЗ говорит "загружаешь списки", подразумевая обновление.
                         dbData.applicants[existingIndex] = { 
                             ...dbData.applicants[existingIndex], 
                             ...applicantData,
                             id: dbData.applicants[existingIndex].id // keep original ID if matched by name
                         };
                    } else {
                        // Создаем нового
                        dbData.applicants.push({
                            ...applicantData,
                            id: Date.now() + importedCount
                        });
                    }
                    importedCount++;
                }
            } else {
                // Обработка текстового формата (ФИО:, Математика: и т.д.)
                lines.forEach(line => {
                    if (!line) return;
                    
                    if (line.includes('ФИО:')) {
                        if (currentApplicant) {
                            dbData.applicants.push(currentApplicant);
                            importedCount++;
                        }
                        currentApplicant = {
                            id: Date.now() + importedCount,
                            fullName: line.split('ФИО:')[1].trim(),
                            math: 0,
                            russian: 0,
                            physics: 0,
                            score: 0,
                            bonusPoints: 0,
                            achievements: [],
                            status: 'на рассмотрении',
                            hasConsent: false,
                            faculty: 'pm',
                            priorities: ['pm'],
                            submissionDate: importDate
                        };
                    } else if (line.includes('Математика:')) {
                        if (currentApplicant) currentApplicant.math = parseInt(line.split(':')[1]) || 0;
                    } else if (line.includes('Русский язык:') || line.includes('Русский:')) {
                        if (currentApplicant) currentApplicant.russian = parseInt(line.split(':')[1]) || 0;
                    } else if (line.includes('Физика:')) {
                        if (currentApplicant) currentApplicant.physics = parseInt(line.split(':')[1]) || 0;
                        if (currentApplicant) {
                            currentApplicant.score = currentApplicant.math + currentApplicant.russian + currentApplicant.physics;
                        }
                    } else if (line.includes('Факультет:') || line.includes('Направление:')) {
                        if (currentApplicant) {
                            const faculty = normalizeFaculty(line.split(':')[1].trim());
                            currentApplicant.faculty = faculty;
                            currentApplicant.priorities = [faculty];
                        }
                    }
                });
                
                if (currentApplicant) {
                    dbData.applicants.push(currentApplicant);
                    importedCount++;
                }
            }
            
            saveDatabase();
            recalculateAdmission();
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ 
                success: true, 
                count: importedCount,
                message: `Успешно импортировано ${importedCount} записей`
            }));
        } catch (err) {
            console.error('Ошибка импорта:', err);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка обработки файла: ' + err.message }));
        }
    });
}

// Нормализация названия факультета
function normalizeFaculty(name) {
    if (!name) return 'pm';
    const lower = name.toLowerCase().trim();
    
    if (lower.includes('прикладн') || lower.includes('пми') || lower === 'pm') return 'pm';
    if (lower.includes('информатик') || lower.includes('ивт') || lower === 'ivt' || lower.includes('вычисл')) return 'ivt';
    if (lower.includes('инфоком') || lower.includes('итсс') || lower === 'itss' || lower.includes('связ')) return 'itss';
    if (lower.includes('безопас') || lower.includes('иб') || lower === 'ib') return 'ib';
    
    return 'pm'; // по умолчанию
}

function handleStats(req, res) {
    const stats = {};
    Object.keys(dbData.faculties).forEach(key => {
        // Считаем средний балл зачисленных (рекомендованных)
        const applicants = dbData.applicants.filter(a => a.recommendedFaculty === key);
        const totalScore = applicants.reduce((sum, a) => sum + (a.score || 0), 0);
        const avg = applicants.length ? (totalScore / applicants.length) : 0;
        stats[key] = {
            name: dbData.faculties[key].name,
            averageScore: parseFloat(avg.toFixed(2)),
            count: applicants.length
        };
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(stats));
}

function handleArchive(req, res) {
    if (!checkPermission(req, 'manage_archive')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
        return;
    }
    
    if (req.method === 'POST') {
        const archiveEntry = {
            date: new Date().toISOString(),
            year: new Date().getFullYear(),
            stats: {
                count: dbData.applicants.length,
                admitted: dbData.applicants.filter(a => a.status === 'допущен').length
            },
            applicants: [...dbData.applicants]
        };
        
        dbData.archive.push(archiveEntry);
        dbData.applicants = [];
        saveDatabase();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
            success: true, 
            count: archiveEntry.stats.count,
            message: 'Кампания успешно архивирована'
        }));
    } else if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(dbData.archive));
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Метод не поддерживается');
    }
}

function handleClearDatabase(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Метод не поддерживается' }));
        return;
    }
    
    if (!checkPermission(req, 'manage_archive')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
        return;
    }
    
    try {
        const count = dbData.applicants.length;
        dbData.applicants = [];
        
        // Сбрасываем статистику факультетов
        Object.keys(dbData.faculties).forEach(key => {
            dbData.faculties[key].occupied = 0;
            dbData.faculties[key].consents = 0;
            dbData.faculties[key].passingScore = "НЕДОБОР";
        });
        
        // Удаляем файлы списков (ТОЛЬКО загруженные через интерфейс, если мы решим их сохранять, но сейчас удаляем старые отчеты TABLE_*.md)
        try {
            const files = fs.readdirSync(__dirname);
            files.forEach(file => {
                if (file.match(/^TABLE_.*\.md$/)) {
                    fs.unlinkSync(path.join(__dirname, file));
                    console.log(`🗑️ Удален файл отчета: ${file}`);
                }
            });
        } catch (err) {
            console.error('❌ Ошибка при удалении файлов списков:', err);
        }

        saveDatabase();
        console.log(`🗑️ База данных очищена. Удалено ${count} записей.`);
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
            success: true, 
            message: `Удалено ${count} записей`,
            count: count
        }));
    } catch (err) {
        console.error('Ошибка очистки БД:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка очистки базы данных' }));
    }
}

// Экспорт в CSV (серверная генерация)
function handleExportCSV(req, res, parsedUrl) {
    try {
        const faculty = parsedUrl.query.faculty || 'all';
        
        let applicants = dbData.applicants;
        if (faculty !== 'all') {
            applicants = applicants.filter(a => a.faculty === faculty || (a.priorities && a.priorities.includes(faculty)));
        }
        
        // BOM + заголовок + данные
        let csv = '\uFEFF'; // BOM для Excel
        csv += 'ID;ФИО;Факультет;Математика;Русский;Физика;Сумма;Статус;Согласие;Приоритеты\n';
        
        applicants.forEach(app => {
            const row = [
                app.id || '',
                `"${(app.fullName || '').replace(/"/g, '""')}"`,
                app.faculty || '',
                app.math || 0,
                app.russian || 0,
                app.physics || 0,
                app.score || 0,
                app.status || '',
                app.hasConsent ? 'Да' : 'Нет',
                (app.priorities || []).join(',')
            ].join(';');
            csv += row + '\n';
        });
        
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `applicants_${faculty}_${dateStr}.csv`;
        
        res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-cache'
        });
        res.end(csv);
        
        console.log(`📥 Экспорт CSV: ${applicants.length} записей`);
    } catch (err) {
        console.error('Ошибка экспорта CSV:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Ошибка экспорта' }));
    }
}

function handleUsers(req, res) {
    if (!checkPermission(req, 'manage_users')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Доступ запрещен' }));
        return;
    }
    
    if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(dbData.users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            permissions: u.permissions || []
        }))));
    } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { id, role, permissions } = JSON.parse(body);
                const user = dbData.users.find(u => u.id === id);
                
                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: 'Пользователь не найден' }));
                    return;
                }
                
                if (role) user.role = role;
                if (permissions) user.permissions = permissions;
                saveDatabase();
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Ошибка обновления' }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Метод не поддерживается');
    }
}

function handleChangePassword(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            const { oldPassword, newPassword } = JSON.parse(body);
            
            if (!oldPassword || !newPassword) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Заполните все поля' }));
                return;
            }
            
            if (!isPasswordComplex(newPassword)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Новый пароль должен содержать минимум 8 символов, буквы, цифры и спецсимволы' 
                }));
                return;
            }
            
            const token = req.headers['x-admin-token'];
            const user = dbData.users.find(u => u.token === token);
            
            if (!user || user.passwordHash !== doubleHash(oldPassword)) {
                res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Неверный текущий пароль' }));
                return;
            }
            
            user.passwordHash = doubleHash(newPassword);
            saveDatabase();
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, message: 'Пароль успешно изменен' }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка сервера' }));
        }
    });
}

function handleSubmit(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            
            const newApplicant = {
                id: Date.now(),
                fullName: data.fullName,
                math: parseInt(data.math) || 0,
                russian: parseInt(data.russian) || 0,
                physics: parseInt(data.physics) || 0,
                score: (parseInt(data.math) || 0) + (parseInt(data.russian) || 0) + (parseInt(data.physics) || 0),
                status: 'на рассмотрении',
                hasConsent: false,
                faculty: data.faculty || 'pm',
                priorities: data.priorities || [data.faculty || 'pm']
            };
            
            dbData.applicants.push(newApplicant);
            saveDatabase();
            recalculateAdmission();
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, message: 'Заявка успешно подана' }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка обработки' }));
        }
    });
}

// ========================================
// СОЗДАНИЕ И ЗАПУСК СЕРВЕРА
// ========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Admin-Token');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (pathname === '/' || pathname === '/index.html') {
        serveFile(res, 'index.html', 'text/html');
    } else if (pathname === '/sadb.html') {
        serveFile(res, 'sadb.html', 'text/html');
    } else if (pathname === '/script.js') {
        serveFile(res, 'script.js', 'application/javascript');
    } else if (pathname === '/style.css') {
        serveFile(res, 'style.css', 'text/css');
    } else if (pathname === '/DejaVuSans.ttf') {
        // legacy path support: allow font at root
        serveFile(res, 'fonts/DejaVuSans.ttf', 'font/ttf');
    } else if (pathname.startsWith('/fonts/')) {
        // serve any file from fonts directory
        const filePath = pathname.slice(1); // remove leading /
        serveFile(res, filePath, 'font/ttf');
    } else if (pathname === '/api/faculties') {
        handleFaculties(req, res, parsedUrl);
    } else if (pathname === '/api/applicants') {
        handleApplicants(req, res, parsedUrl);
    } else if (pathname === '/api/settings') {
        handleSettings(req, res);
    } else if (pathname === '/api/update-status') {
        handleUpdateStatus(req, res);
    } else if (pathname === '/api/send-email') {
        handleSendEmail(req, res);
    } else if (pathname === '/api/auth/register') {
        handleRegister(req, res);
    } else if (pathname === '/api/login') {
        handleLogin(req, res);
    } else if (pathname === '/api/import') {
        handleImport(req, res, parsedUrl);
    } else if (pathname === '/api/archive') {
        handleArchive(req, res);
    } else if (pathname === '/api/clear-database') {
        handleClearDatabase(req, res);
    } else if (pathname === '/api/export-csv') {
        handleExportCSV(req, res, parsedUrl);
    } else if (pathname === '/api/users') {
        handleUsers(req, res);
    } else if (pathname === '/api/change-password') {
        handleChangePassword(req, res);
    } else if (pathname === '/api/lastUpdate') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ lastUpdate: lastUpdateTime }));
    } else if (pathname === '/api/submit' && req.method === 'POST') {
        handleSubmit(req, res);
    } else if (pathname === '/api/stats') {
        handleStats(req, res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Страница не найдена');
    }
});

// Log uncaught exceptions and unhandled promise rejections to aid debugging
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

server.on('error', (err) => {
    console.error('❌ Server error:', err && err.stack ? err.stack : err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║  🚀 СЕРВЕР ПРИЕМНОЙ КОМИССИИ ЗАПУЩЕН                     ║');
    console.log(`║  🌐 Адрес: http://localhost:${PORT}                        ║`);
    console.log(`║  📊 Абитуриентов: ${dbData.applicants.length}             ║`);
    console.log(`║  👥 Пользователей: ${dbData.users.length}                 ║`);
    console.log(`║  📁 Факультетов: ${Object.keys(dbData.faculties).length}  ║`);
    console.log('║                                                            ║');
    console.log('║  ✅ Все системы работают. Нажмите Ctrl+C для остановки    ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
});