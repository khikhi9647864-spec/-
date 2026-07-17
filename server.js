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
// BỘ NHỚ KEY & HWID
// ==========================================
const activeKeys = new Map(); // Dành cho Game (Lưu: Key -> { hwid, expiresAt })
const hwidToKey = new Map();  // Dành cho Web (Lưu: HWID -> { key, expiresAt, pageExpiresAt })

const KEY_EXPIRATION_MS = 24 * 60 * 60 * 1000; // Key dùng trong game: 24 giờ
const PAGE_EXPIRATION_MS = 5 * 60 * 1000;      // Web tự hủy sau: 5 phút

// Dọn dẹp bộ nhớ định kỳ (Chỉ xóa khi Key 24h đã hết hạn)
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
    const clientHwid = req.query.hwid;
    const now = Date.now();
    
    if (!clientHwid) {
        return res.send(`
            <body style="background:#808080; color:white; font-family:sans-serif; text-align:center; padding-top:100px;">
                <h1>❌ TRUY CẬP TỪ CHỐI</h1>
                <p>Vui lòng vào Game, ấn nút <b>"Get Key Link"</b> để hệ thống nhận diện thiết bị (HWID) của bạn!</p>
            </body>
        `);
    }

    // KIỂM TRA TRẠNG THÁI CỦA HWID NÀY
    let hasActiveKey = false;
    let prefillKey = "";
    let pageExpiresAt = 0;

    if (hwidToKey.has(clientHwid)) {
        const data = hwidToKey.get(clientHwid);
        
        // Nếu Key 24h vẫn còn hạn
        if (now < data.expiresAt) {
            // Kiểm tra xem trang web 5 phút đã hết hạn chưa?
            if (now > data.pageExpiresAt) {
                // TRẢ VỀ 404 NẾU QUÁ 5 PHÚT
                return res.status(404).send(`
                    <body style="background:#1a1a1a; color:#ff4444; font-family:monospace; text-align:center; padding-top:100px;">
                        <h1>404 - TRANG ĐÃ TỰ HỦY</h1>
                        <p>Thời gian 5 phút xem Key đã kết thúc để bảo mật.</p>
                        <p>Key của bạn vẫn <b>đang hoạt động trong Game</b>.</p>
                        <p style="color:#888;">(Vui lòng chờ hết hạn 24h để lấy Key mới nếu bạn làm mất Key cũ)</p>
                    </body>
                `);
            } else {
                // Chưa hết 5 phút -> Cho phép hiển thị lại Key cũ
                hasActiveKey = true;
                prefillKey = data.key;
                pageExpiresAt = data.pageExpiresAt;
            }
        }
    }

    // RENDER HTML TĨNH (SẼ ĐƯỢC JS BÊN TRONG XỬ LÝ)
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vantablack Hub - Secure Key</title>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        <style>
            body { background-color: #808080; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Press Start 2P', cursive; }
            .container { text-align: center; background: rgba(0, 0, 0, 0.2); padding: 40px; border-radius: 10px; border: 4px solid #fff; max-width: 90%; }
            h1 { color: #ffffff; font-size: 24px; text-shadow: 4px 4px 0px #000; margin-bottom: 10px; line-height: 1.5; }
            .hwid-text { font-size: 8px; color: #ccc; margin-bottom: 20px; word-wrap: break-word; }
            .key-display { background-color: #fff; padding: 15px; font-size: 14px; color: #000; border: 4px solid #000; margin-bottom: 10px; min-width: 320px; height: 20px; display: flex; align-items: center; justify-content: center; }
            
            .warning-text { color: #ffeb3b; font-size: 9px; margin-bottom: 20px; text-shadow: 1px 1px 0px #000; line-height: 1.5; }
            .timer-display { color: #ff4444; font-size: 14px; margin-bottom: 20px; text-shadow: 2px 2px 0px #000; }
            
            button { background-color: #4CAF50; color: white; border: 4px solid #000; padding: 15px 20px; font-family: 'Press Start 2P', cursive; font-size: 12px; cursor: pointer; margin: 5px; box-shadow: 4px 4px 0px #000; transition: all 0.1s; }
            button:active { box-shadow: 0px 0px 0px #000; transform: translate(4px, 4px); }
            button:disabled { background-color: #555; cursor: not-allowed; box-shadow: none; transform: none; }
            
            #copyBtn { background-color: #2196F3; }
        </style>
    </head>
    <body id="mainBody">
        <div class="container" id="mainContainer">
            <h1>Vantablack Hub</h1>
            <div class="hwid-text">Target HWID: ${clientHwid.substring(0, 15)}...</div>
            
            <div id="warningBox" class="warning-text" style="display: none;">
                ⚠️ LƯU Ý: HÃY COPY VÀ LƯU LẠI KEY NGAY!<br><br>
                Trang web này sẽ tự hủy vĩnh viễn sau:
            </div>
            <div id="timerBox" class="timer-display" style="display: none;">05:00</div>
            
            <div id="keyBox" class="key-display">Click Generate...</div>
            
            <div>
                <button id="genBtn" onclick="generateKey()">Generate Key</button>
                <button id="copyBtn" onclick="copyKey()" style="display: none;">Copy Key</button>
            </div>
        </div>

        <script>
            const myHwid = "${clientHwid}";
            let currentKey = "";
            let timerInterval;

            // KIỂM TRA XEM SERVER CÓ BÁO LÀ ĐÃ CÓ KEY CHƯA
            const hasActiveKey = ${hasActiveKey};
            
            if (hasActiveKey) {
                currentKey = "${prefillKey}";
                document.getElementById('keyBox').innerText = currentKey;
                document.getElementById('genBtn').style.display = 'none';
                document.getElementById('copyBtn').style.display = 'inline-block';
                document.getElementById('warningBox').style.display = 'block';
                document.getElementById('timerBox').style.display = 'block';
                startSelfDestructTimer(${pageExpiresAt});
            }

            async function generateKey() {
                const keyBox = document.getElementById('keyBox');
                const genBtn = document.getElementById('genBtn');
                keyBox.innerText = "Generating...";
                genBtn.disabled = true;
                
                try {
                    const response = await fetch('/api/generate-key', {
                        headers: { 
                            'x-vantablack-auth': 'true_secure_request',
                            'x-hwid': myHwid
                        }
                    });
                    const data = await response.json();
                    
                    if(data.success) {
                        currentKey = data.key;
                        keyBox.innerText = currentKey;
                        genBtn.style.display = 'none';
                        document.getElementById('copyBtn').style.display = 'inline-block';
                        document.getElementById('warningBox').style.display = 'block';
                        document.getElementById('timerBox').style.display = 'block';
                        
                        startSelfDestructTimer(data.pageExpiresAt);
                    } else {
                        keyBox.innerText = data.error || "Error!";
                        genBtn.disabled = false;
                    }
                } catch (err) {
                    keyBox.innerText = "Network Error!";
                    genBtn.disabled = false;
                }
            }

            function startSelfDestructTimer(expireTime) {
                const timerBox = document.getElementById('timerBox');
                clearInterval(timerInterval);
                
                timerInterval = setInterval(() => {
                    const now = Date.now();
                    const timeLeft = Math.floor((expireTime - now) / 1000);
                    
                    if (timeLeft <= 0) {
                        clearInterval(timerInterval);
                        // KHI HẾT 5 PHÚT -> ĐỔI GIAO DIỆN THÀNH 404 TRỰC TIẾP
                        document.getElementById('mainBody').style.background = "#1a1a1a";
                        document.getElementById('mainBody').innerHTML = \`
                            <div style="color:#ff4444; font-family:monospace; text-align:center; padding-top:100px;">
                                <h1 style="text-shadow: none;">404 - TRANG ĐÃ TỰ HỦY</h1>
                                <p>Thời gian 5 phút xem Key đã kết thúc để bảo mật.</p>
                                <p>Key của bạn vẫn <b>đang hoạt động trong Game</b>.</p>
                            </div>
                        \`;
                    } else {
                        const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
                        const seconds = (timeLeft % 60).toString().padStart(2, '0');
                        timerBox.innerText = minutes + ":" + seconds;
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
// API XỬ LÝ LẤY KEY 
// ==========================================
app.get('/api/generate-key', (req, res) => {
    const clientHwid = req.headers['x-hwid'];
    
    if (req.headers['x-vantablack-auth'] !== 'true_secure_request' || !clientHwid) {
        return res.status(403).json({ success: false, error: "Access Denied" });
    }

    const now = Date.now();

    // Nếu HWID này đã có Key còn hạn 24h
    if (hwidToKey.has(clientHwid)) {
        const existingData = hwidToKey.get(clientHwid);
        if (now < existingData.expiresAt) {
            if (now > existingData.pageExpiresAt) {
                // Nếu đã qua 5 phút web
                return res.status(403).json({ success: false, error: "Web page expired (404)" });
            }
            // Trả về Key cũ đang dùng
            return res.json({ success: true, key: existingData.key, pageExpiresAt: existingData.pageExpiresAt });
        }
    }

    // TẠO KEY MỚI NẾU CHƯA CÓ HOẶC ĐÃ HẾT HẠN 24H
    let newKey;
    do { newKey = 'Vantablack_' + generateRandomString(15); } while (activeKeys.has(newKey));
    
    const expiresAt = now + KEY_EXPIRATION_MS;    // 24 Giờ cho game
    const pageExpiresAt = now + PAGE_EXPIRATION_MS; // 5 Phút tự hủy web
    
    activeKeys.set(newKey, { hwid: clientHwid, expiresAt: expiresAt });
    hwidToKey.set(clientHwid, { key: newKey, expiresAt: expiresAt, pageExpiresAt: pageExpiresAt });
    
    res.json({ success: true, key: newKey, pageExpiresAt: pageExpiresAt });
});

// ==========================================
// API KIỂM TRA KEY (ROBLOX LUA GỌI VÀO ĐÂY)
// ==========================================
app.get('/api/verify-key/:key', (req, res) => {
    const userKey = req.params.key;
    const luaHwid = req.query.hwid; 
    const now = Date.now();

    if (!luaHwid) return res.json({ valid: false, message: 'Missing HWID in request!' });

    if (activeKeys.has(userKey)) {
        const keyData = activeKeys.get(userKey);
        
        // KIỂM TRA HẠN 24 GIỜ
        if (now > keyData.expiresAt) {
            activeKeys.delete(userKey);
            return res.json({ valid: false, message: 'Key has expired!' });
        }
        
        // KIỂM TRA HWID (Chống share key)
        if (keyData.hwid !== luaHwid) {
            return res.json({ valid: false, message: 'HWID Mismatch! Bạn không thể xài key của người khác.' });
        }

        res.json({ valid: true, message: 'Key is valid!' });
    } else {
        res.json({ valid: false, message: 'Invalid key!' });
    }
});

process.on('uncaughtException', (err) => console.log('Error:', err));
process.on('unhandledRejection', (err) => console.log('Rejection:', err));

app.listen(port, () => console.log('Vantablack Server running on port ' + port));
