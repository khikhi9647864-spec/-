const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// BẢO MẬT CƠ BẢN
// ==========================================
// Tắt tính năng tự chặn script của Helmet để code HTML chạy bình thường
app.use(helmet({ contentSecurityPolicy: false })); 
app.set('trust proxy', 1); // Bắt buộc cho Render để lấy đúng IP

// Chống Spam F5 và DDoS
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 60, // Tối đa 60 request / phút / IP
    message: "Bạn thao tác quá nhanh! Vui lòng chậm lại."
});
app.use(limiter);

// ==========================================
// BỘ NHỚ KEY (24 GIỜ)
// ==========================================
const activeKeys = new Map(); 
const ipToKey = new Map();    
const KEY_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 giờ

// Tự động xóa key rác sau mỗi 15 phút
setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of activeKeys.entries()) {
        if (now > expiresAt) activeKeys.delete(key);
    }
    for (const [ip, data] of ipToKey.entries()) {
        if (now > data.expiresAt) ipToKey.delete(ip);
    }
}, 15 * 60 * 1000);

// Hàm tạo chuỗi 15 ký tự ngẫu nhiên
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ==========================================
// GIAO DIỆN WEB HTML
// ==========================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vantablack Hub - Key System</title>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        <style>
            body {
                background-color: #808080; /* Màu xám chủ đạo */
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                font-family: 'Press Start 2P', cursive;
            }
            .container {
                text-align: center;
                background: rgba(0, 0, 0, 0.2);
                padding: 40px;
                border-radius: 10px;
                border: 4px solid #fff;
            }
            h1 {
                color: #ffffff;
                font-size: 32px;
                /* Hiệu ứng 4D */
                text-shadow: 4px 4px 0px #000, 6px 6px 0px #444; 
                margin-bottom: 20px;
                line-height: 1.5;
            }
            .key-display {
                background-color: #fff;
                padding: 15px;
                font-size: 14px;
                color: #000;
                border: 4px solid #000;
                margin-bottom: 20px;
                min-width: 320px;
                height: 20px;
                word-wrap: break-word;
            }
            .timer-display {
                color: #ffeb3b;
                font-size: 12px;
                margin-bottom: 20px;
                text-shadow: 2px 2px 0px #000;
                display: none;
            }
            button {
                background-color: #4CAF50;
                color: white;
                border: 4px solid #000;
                padding: 15px 20px;
                font-family: 'Press Start 2P', cursive;
                font-size: 12px;
                cursor: pointer;
                margin: 5px;
                box-shadow: 4px 4px 0px #000;
                transition: all 0.1s;
            }
            button:active {
                box-shadow: 0px 0px 0px #000;
                transform: translate(4px, 4px);
            }
            button:disabled {
                background-color: #555;
                cursor: not-allowed;
                box-shadow: none;
                transform: none;
            }
            #copyBtn { background-color: #2196F3; display: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Vantablack Hub</h1>
            <div id="timerBox" class="timer-display">Expires in: 24:00:00</div>
            <div id="keyBox" class="key-display">Click Generate...</div>
            <div>
                <button id="genBtn" onclick="generateKey()">Generate Key</button>
                <button id="copyBtn" onclick="copyKey()">Copy Key</button>
            </div>
        </div>

        <script>
            let currentKey = "";
            let timerInterval;

            // Phục hồi session nếu load lại trang
            if (localStorage.getItem('vantablack_key') && localStorage.getItem('vantablack_expire')) {
                const expire = parseInt(localStorage.getItem('vantablack_expire'));
                if (Date.now() < expire) {
                    currentKey = localStorage.getItem('vantablack_key');
                    document.getElementById('keyBox').innerText = currentKey;
                    document.getElementById('genBtn').style.display = 'none';
                    document.getElementById('copyBtn').style.display = 'inline-block';
                    document.getElementById('timerBox').style.display = 'block';
                    startTimer(expire);
                }
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
                        keyBox.innerText = "Error or Rate Limit!";
                        genBtn.disabled = false;
                    }
                } catch (err) {
                    keyBox.innerText = "Network Error!";
                    genBtn.disabled = false;
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
                if(!currentKey) return;
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
    `);
});

// ==========================================
// API XỬ LÝ LẤY KEY VÀ KIỂM TRA
// ==========================================
app.get('/api/generate-key', (req, res) => {
    // Chặn request từ tool
    if (req.headers['x-vantablack-auth'] !== 'true_secure_request') {
        return res.status(403).json({ success: false, error: "Access Denied" });
    }

    const userIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    // Nếu IP này đang có 1 key chưa hết hạn -> Trả về luôn key đó
    if (ipToKey.has(userIp)) {
        const existingData = ipToKey.get(userIp);
        if (now < existingData.expiresAt) {
            return res.json({ success: true, key: existingData.key, expiresAt: existingData.expiresAt });
        }
    }

    // Tạo Key mới: Vantablack_ + 15 ký tự
    let newKey;
    do {
        newKey = 'Vantablack_' + generateRandomString(15);
    } while (activeKeys.has(newKey));
    
    const expiresAt = now + KEY_EXPIRATION_MS; 
    
    activeKeys.set(newKey, expiresAt);
    ipToKey.set(userIp, { key: newKey, expiresAt: expiresAt });
    
    res.json({ success: true, key: newKey, expiresAt: expiresAt });
});

// Lua script gọi vào đây để check
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

// Chống sập server nếu có lỗi nhỏ
process.on('uncaughtException', (err) => console.log('Error:', err));
process.on('unhandledRejection', (err) => console.log('Rejection:', err));

app.listen(port, () => console.log('Vantablack Server running on port ' + port));
