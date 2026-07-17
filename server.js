const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// BẢO MẬT CƠ BẢN
// ==========================================
app.use(helmet({ contentSecurityPolicy: false })); 
app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 60, 
    message: "Bạn thao tác quá nhanh! Vui lòng chậm lại."
});
app.use(limiter);

// ==========================================
// BỘ NHỚ KEY & HWID (HẠN 24 GIỜ)
// ==========================================
const activeKeys = new Map(); // Lưu: Key -> { hwid, expiresAt }
const hwidToKey = new Map();  // Lưu: HWID -> { key, expiresAt }
const KEY_EXPIRATION_MS = 24 * 60 * 60 * 1000; 

// Dọn dẹp key hết hạn
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of activeKeys.entries()) {
        if (now > data.expiresAt) activeKeys.delete(key);
    }
    for (const [hwid, data] of hwidToKey.entries()) {
        if (now > data.expiresAt) hwidToKey.delete(hwid);
    }
}, 15 * 60 * 1000);

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
    // BẮT BUỘC PHẢI CÓ HWID TRÊN THANH ĐỊA CHỈ TỪ GAME TRUYỀN LÊN
    const clientHwid = req.query.hwid;
    
    if (!clientHwid) {
        return res.send(`
            <body style="background:#808080; color:white; font-family:sans-serif; text-align:center; padding-top:100px;">
                <h1>❌ TRUY CẬP TỪ CHỐI</h1>
                <p>Vui lòng vào Game, ấn nút <b>"Get Key Link"</b> để hệ thống nhận diện thiết bị (HWID) của bạn!</p>
            </body>
        `);
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vantablack Hub - HWID Key System</title>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        <style>
            body { background-color: #808080; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Press Start 2P', cursive; }
            .container { text-align: center; background: rgba(0, 0, 0, 0.2); padding: 40px; border-radius: 10px; border: 4px solid #fff; }
            h1 { color: #ffffff; font-size: 28px; text-shadow: 4px 4px 0px #000, 6px 6px 0px #444; margin-bottom: 10px; line-height: 1.5; }
            .hwid-text { font-size: 8px; color: #ccc; margin-bottom: 20px; word-wrap: break-word; max-width: 300px; }
            .key-display { background-color: #fff; padding: 15px; font-size: 14px; color: #000; border: 4px solid #000; margin-bottom: 20px; min-width: 320px; height: 20px; word-wrap: break-word; }
            .timer-display { color: #ffeb3b; font-size: 12px; margin-bottom: 20px; text-shadow: 2px 2px 0px #000; display: none; }
            button { background-color: #4CAF50; color: white; border: 4px solid #000; padding: 15px 20px; font-family: 'Press Start 2P', cursive; font-size: 12px; cursor: pointer; margin: 5px; box-shadow: 4px 4px 0px #000; transition: all 0.1s; }
            button:active { box-shadow: 0px 0px 0px #000; transform: translate(4px, 4px); }
            button:disabled { background-color: #555; cursor: not-allowed; box-shadow: none; transform: none; }
            #copyBtn { background-color: #2196F3; display: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Vantablack Hub</h1>
            <div class="hwid-text">Target HWID: ${clientHwid.substring(0, 15)}...</div>
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
            const myHwid = "${clientHwid}"; // Lấy HWID từ Server gán vào JavaScript

            async function generateKey() {
                const keyBox = document.getElementById('keyBox');
                const genBtn = document.getElementById('genBtn');
                keyBox.innerText = "Generating...";
                genBtn.disabled = true;
                
                try {
                    const response = await fetch('/api/generate-key', {
                        headers: { 
                            'x-vantablack-auth': 'true_secure_request',
                            'x-hwid': myHwid // Gửi HWID ngầm lên cho API tạo key
                        }
                    });
                    const data = await response.json();
                    
                    if(data.success) {
                        currentKey = data.key;
                        keyBox.innerText = currentKey;
                        genBtn.style.display = 'none';
                        document.getElementById('copyBtn').style.display = 'inline-block';
                        document.getElementById('timerBox').style.display = 'block';
                        startTimer(data.expiresAt);
                    } else {
                        keyBox.innerText = data.error || "Error!";
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
// API XỬ LÝ LẤY KEY VÀ KIỂM TRA (VỚI HWID)
// ==========================================
app.get('/api/generate-key', (req, res) => {
    const clientHwid = req.headers['x-hwid'];
    
    if (req.headers['x-vantablack-auth'] !== 'true_secure_request' || !clientHwid) {
        return res.status(403).json({ success: false, error: "Access Denied / Missing HWID" });
    }

    const now = Date.now();

    // Nếu HWID này đã có Key còn hạn, trả lại luôn key đó
    if (hwidToKey.has(clientHwid)) {
        const existingData = hwidToKey.get(clientHwid);
        if (now < existingData.expiresAt) {
            return res.json({ success: true, key: existingData.key, expiresAt: existingData.expiresAt });
        }
    }

    // Tạo Key mới
    let newKey;
    do { newKey = 'Vantablack_' + generateRandomString(15); } while (activeKeys.has(newKey));
    
    const expiresAt = now + KEY_EXPIRATION_MS; 
    
    activeKeys.set(newKey, { hwid: clientHwid, expiresAt: expiresAt });
    hwidToKey.set(clientHwid, { key: newKey, expiresAt: expiresAt });
    
    res.json({ success: true, key: newKey, expiresAt: expiresAt });
});

// LUA GỌI API NÀY KÈM THEO HWID ĐỂ CHECK
app.get('/api/verify-key/:key', (req, res) => {
    const userKey = req.params.key;
    const luaHwid = req.query.hwid; // Lấy HWID mà Lua gửi lên
    const now = Date.now();

    if (!luaHwid) return res.json({ valid: false, message: 'Missing HWID in request!' });

    if (activeKeys.has(userKey)) {
        const keyData = activeKeys.get(userKey);
        
        // KIỂM TRA HẠN
        if (now > keyData.expiresAt) {
            activeKeys.delete(userKey);
            return res.json({ valid: false, message: 'Key has expired!' });
        }
        
        // KIỂM TRA HWID CÓ KHỚP VỚI LÚC TẠO KHÔNG?
        if (keyData.hwid !== luaHwid) {
            return res.json({ valid: false, message: 'HWID Mismatch! Bạn không thể xài key của người khác.' });
        }

        // Hợp lệ 100%
        res.json({ valid: true, message: 'Key is valid!' });
    } else {
        res.json({ valid: false, message: 'Invalid key!' });
    }
});

process.on('uncaughtException', (err) => console.log('Error:', err));
process.on('unhandledRejection', (err) => console.log('Rejection:', err));

app.listen(port, () => console.log('Vantablack Server running on port ' + port));
