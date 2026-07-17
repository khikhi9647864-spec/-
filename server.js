const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors'); // Thêm thư viện CORS

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// CÀI ĐẶT BẢO MẬT & RENDER PROXY
// ==========================================
app.use(helmet());
app.use(cors());
app.use(cookieParser());

// BẮT BUỘC TRÊN RENDER: Để express-rate-limit nhận diện đúng IP thật của user
// thay vì IP của Load Balancer trên Render.
app.set('trust proxy', 1); 

const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, max: 100,
    message: "Hệ thống Anti-DDoS đang hoạt động. Vui lòng thử lại sau ít phút!"
});
app.use('/', generalLimiter);

// ==========================================
// BỘ NHỚ LƯU TRỮ KEY & IP (HẠN 24 GIỜ)
// ==========================================
const activeKeys = new Map(); 
const ipToKey = new Map();    
// 24 Giờ = 24 * 60 * 60 * 1000 mili-giây
const KEY_EXPIRATION_MS = 24 * 60 * 60 * 1000; 

// Dọn dẹp Key hết hạn (Chạy mỗi 15 phút)
setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of activeKeys.entries()) {
        if (now > expiresAt) activeKeys.delete(key);
    }
    for (const [ip, data] of ipToKey.entries()) {
        if (now > data.expiresAt) ipToKey.delete(ip);
    }
}, 15 * 60 * 1000);

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ==========================================
// API & ROUTES
// ==========================================

// ROUTE GIỮ STATE CHO RENDER (Chống sleep)
app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

// 1. TRANG CHỦ - YÊU CẦU VƯỢT LINK
app.get('/', (req, res) => {
    if (req.cookies.vantablack_auth === 'passed_link') {
        return res.redirect('/hub');
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vantablack Hub - Checkpoint</title>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        <style>
            body { background-color: #808080; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Press Start 2P', cursive; text-align: center;}
            .container { background: rgba(0, 0, 0, 0.2); padding: 40px; border-radius: 10px; border: 4px solid #fff; }
            h1 { color: #fff; font-size: 24px; text-shadow: 4px 4px 0px #000; margin-bottom: 20px; }
            p { color: #fff; font-size: 10px; line-height: 1.5; margin-bottom: 30px; }
            a.btn { display: inline-block; background-color: #ff5722; color: white; border: 4px solid #000; padding: 15px 20px; font-size: 12px; text-decoration: none; box-shadow: 4px 4px 0px #000; transition: all 0.1s; }
            a.btn:active { box-shadow: 0px 0px 0px #000; transform: translate(4px, 4px); }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Checkpoint 1</h1>
            <p>You must complete the Linkvertise<br>step to get your Vantablack Key!</p>
            <a href="/fake-linkvertise" class="btn">Get Key (Linkvertise)</a>
        </div>
    </body>
    </html>`;
    res.send(html);
});

// 2. ROUTE XÁC NHẬN VƯỢT LINK 
app.get('/fake-linkvertise', (req, res) => {
    res.cookie('vantablack_auth', 'passed_link', { maxAge: 15 * 60 * 1000, httpOnly: true });
    res.redirect('/hub');
});

// 3. TRANG TẠO KEY CHÍNH THỨC
app.get('/hub', (req, res) => {
    if (req.cookies.vantablack_auth !== 'passed_link') {
        return res.status(403).send("Access Denied: Vui lòng vượt link trước!");
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vantablack Hub - Key System</title>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        <style>
            body { background-color: #808080; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Press Start 2P', cursive; overflow: hidden; }
            #mainContainer { display: none; text-align: center; background: rgba(0, 0, 0, 0.2); padding: 40px; border-radius: 10px; border: 4px solid #fff; }
            h1 { color: #ffffff; font-size: 32px; text-shadow: 4px 4px 0px #000, 6px 6px 0px #444; margin-bottom: 40px; line-height: 1.5; }
            .key-display { background-color: #fff; padding: 15px; font-size: 14px; color: #000; border: 4px solid #000; margin-bottom: 20px; min-width: 300px; height: 20px; word-wrap: break-word; }
            .timer-display { color: #ffeb3b; font-size: 12px; margin-bottom: 20px; text-shadow: 2px 2px 0px #000; display: none;}
            button.action-btn { background-color: #4CAF50; color: white; border: 4px solid #000; padding: 15px 20px; font-family: 'Press Start 2P', cursive; font-size: 12px; cursor: pointer; margin: 5px; box-shadow: 4px 4px 0px #000; transition: all 0.1s; }
            button.action-btn:active:not(:disabled) { box-shadow: 0px 0px 0px #000; transform: translate(4px, 4px); }
            button.action-btn:disabled { background-color: #555; cursor: not-allowed; box-shadow: none; transform: none;}
            #copyBtn { background-color: #2196F3; display: none; }
            
            /* CSS CAPTCHA */
            #captchaContainer { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #808080; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100; }
            #captchaInfo { color: white; font-size: 16px; margin-bottom: 20px; text-shadow: 2px 2px 0px #000; text-align: center; line-height: 1.5; }
            #captchaBtn { position: absolute; background-color: #28a745; color: white; border: 3px solid #000; padding: 10px; font-family: 'Press Start 2P', cursive; font-size: 14px; cursor: pointer; box-shadow: 3px 3px 0px #000; display: none; }
        </style>
    </head>
    <body>
        <div id="captchaContainer">
            <div id="captchaInfo">Prove you are human!<br><br>Click the Check button 3 times.<br><br><span id="captchaCount">0/3</span></div>
            <button id="captchaBtn">✔️</button>
        </div>

        <div class="container" id="mainContainer">
            <h1>Vantablack Hub</h1>
            <div id="timerBox" class="timer-display">Expires in: 24:00:00</div>
            <div id="keyBox" class="key-display">Click Generate...</div>
            <div>
                <button id="genBtn" class="action-btn" onclick="generateKey()">Generate Key</button>
                <button id="copyBtn" class="action-btn" onclick="copyKey()">Copy Key</button>
            </div>
        </div>

        <script>
            // --- CAPTCHA LOGIC ---
            let captchaClicks = 0;
            const targetClicks = 3;
            const captchaBtn = document.getElementById('captchaBtn');
            const captchaContainer = document.getElementById('captchaContainer');
            const mainContainer = document.getElementById('mainContainer');
            
            if(localStorage.getItem('vantablack_expire') && Date.now() < parseInt(localStorage.getItem('vantablack_expire'))) {
                captchaContainer.style.display = 'none';
                mainContainer.style.display = 'block';
                resumeSession();
            } else {
                setTimeout(moveCaptchaButton, 1000);
            }

            function moveCaptchaButton() {
                captchaBtn.style.display = 'block';
                const maxX = window.innerWidth - captchaBtn.offsetWidth - 20;
                const maxY = window.innerHeight - captchaBtn.offsetHeight - 20;
                const minX = 20; const minY = 100; 
                let randomX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
                let randomY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
                captchaBtn.style.left = randomX + 'px'; captchaBtn.style.top = randomY + 'px';
            }

            captchaBtn.addEventListener('click', () => {
                captchaClicks++;
                document.getElementById('captchaCount').innerText = captchaClicks + '/' + targetClicks;
                if (captchaClicks >= targetClicks) {
                    captchaContainer.style.display = 'none';
                    mainContainer.style.display = 'block';
                } else { moveCaptchaButton(); }
            });

            // --- KEY GENERATION & TIMER LOGIC (24H) ---
            let currentKey = "";
            let timerInterval;

            function resumeSession() {
                currentKey = localStorage.getItem('vantablack_key');
                const expireTime = parseInt(localStorage.getItem('vantablack_expire'));
                
                document.getElementById('keyBox').innerText = currentKey;
                document.getElementById('genBtn').style.display = 'none';
                document.getElementById('copyBtn').style.display = 'inline-block';
                document.getElementById('timerBox').style.display = 'block';
                
                startTimer(expireTime);
            }

            async function generateKey() {
                const keyBox = document.getElementById('keyBox');
                const genBtn = document.getElementById('genBtn');
                keyBox.innerText = "Generating...";
                genBtn.disabled = true;
                
                try {
                    const response = await fetch('/api/generate-key', {
                        headers: { 'x-vantablack-auth': 'true_secure_request' }
                    });
                    const data = await response.json();
                    
                    if(data.success) {
                        currentKey = data.key;
                        const expireTime = data.expiresAt;
                        
                        keyBox.innerText = currentKey;
                        genBtn.style.display = 'none';
                        document.getElementById('copyBtn').style.display = 'inline-block';
                        document.getElementById('timerBox').style.display = 'block';
                        
                        localStorage.setItem('vantablack_key', currentKey);
                        localStorage.setItem('vantablack_expire', expireTime);
                        
                        startTimer(expireTime);
                    } else {
                        keyBox.innerText = data.error || "Rate limit error!";
                        setTimeout(() => {
                            keyBox.innerText = "Click Generate...";
                            genBtn.disabled = false;
                        }, 3000);
                    }
                } catch (err) {
                    keyBox.innerText = "Network Error!";
                    setTimeout(() => {
                        keyBox.innerText = "Click Generate...";
                        genBtn.disabled = false;
                    }, 3000);
                }
            }

            function startTimer(expireTime) {
                const timerBox = document.getElementById('timerBox');
                
                clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const now = Date.now();
                    const timeLeft = Math.floor((expireTime - now) / 1000);
                    
                    if (timeLeft <= 0) {
                        clearInterval(timerInterval);
                        timerBox.innerText = "Key Expired!";
                        localStorage.removeItem('vantablack_key');
                        localStorage.removeItem('vantablack_expire');
                        document.getElementById('genBtn').style.display = 'inline-block';
                        document.getElementById('genBtn').disabled = false;
                        document.getElementById('copyBtn').style.display = 'none';
                        document.getElementById('keyBox').innerText = "Click Generate...";
                    } else {
                        const hours = Math.floor(timeLeft / 3600).toString().padStart(2, '0');
                        const minutes = Math.floor((timeLeft % 3600) / 60).toString().padStart(2, '0');
                        const seconds = (timeLeft % 60).toString().padStart(2, '0');
                        timerBox.innerText = "Expires in: " + hours + ":" + minutes + ":" + seconds;
                    }
                }, 1000);
            }

            function copyKey() {
                if(!currentKey) {
                    const btn = document.getElementById('copyBtn');
                    btn.innerText = "No Key!";
                    setTimeout(() => { btn.innerText = "Copy Key"; }, 1500);
                    return;
                }
                const textarea = document.createElement("textarea");
                textarea.value = currentKey;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
                
                const btn = document.getElementById('copyBtn');
                btn.innerText = "Copied!";
                setTimeout(() => { btn.innerText = "Copy Key"; }, 2000);
            }
        </script>
    </body>
    </html>
    `;
    res.send(htmlContent);
});

// 4. API TẠO KEY (KHÓA IP + HẸN GIỜ 24H)
app.get('/api/generate-key', secureApiMiddleware, (req, res) => {
    // Nhờ trust proxy = 1, Express sẽ lấy đúng IP thật ở đây
    const userIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (ipToKey.has(userIp)) {
        const existingData = ipToKey.get(userIp);
        if (now < existingData.expiresAt) {
            return res.json({ 
                success: true, 
                key: existingData.key, 
                expiresAt: existingData.expiresAt 
            });
        }
    }

    let newKey;
    let isUnique = false;
    while (!isUnique) {
        newKey = 'Vantablack_' + generateRandomString(15);
        if (!activeKeys.has(newKey)) {
            isUnique = true;
        }
    }
    
    const expiresAt = now + KEY_EXPIRATION_MS; // Hết hạn sau 24 tiếng
    
    activeKeys.set(newKey, expiresAt);
    ipToKey.set(userIp, { key: newKey, expiresAt: expiresAt });
    
    res.json({ success: true, key: newKey, expiresAt: expiresAt });
});

// 5. API XÁC NHẬN KEY TỪ LUA
app.get('/api/verify-key/:key', (req, res) => {
    const userKey = req.params.key;
    const now = Date.now();

    if (activeKeys.has(userKey)) {
        const expiresAt = activeKeys.get(userKey);
        if (now > expiresAt) {
            activeKeys.delete(userKey);
            res.json({ valid: false, message: 'Key has expired!' });
        } else {
            res.json({ valid: true, message: 'Key is valid!' });
        }
    } else {
        res.json({ valid: false, message: 'Invalid key!' });
    }
});

// Middleware
function secureApiMiddleware(req, res, next) {
    if (req.headers['x-vantablack-auth'] === 'true_secure_request') {
        next();
    } else {
        res.status(403).json({ success: false, error: "Access Denied" });
    }
}

process.on('uncaughtException', (err) => console.log('Error:', err));
process.on('unhandledRejection', (err) => console.log('Rejection:', err));

app.listen(port, () => console.log(`Vantablack Server running on port ${port}`));
