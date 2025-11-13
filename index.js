import express from 'express';
import fs from 'fs';
import cors from 'cors';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import awesomePhoneNumber from 'awesome-phonenumber';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ FIX 1: ENABLE CORS FOR ALL ORIGINS
app.use(cors());

// ✅ FIX 2: Handle preflight requests
app.options('*', cors());

// ✅ FIX 3: Add custom CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

// ✅ FIX 4: Add JSON parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// ✅ FIX 5: Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Utility functions
function makeid(length = 10) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { recursive: true, force: true });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing file:', error);
        return false;
    }
}

// ✅ FIX 6: Main pairing endpoint with better error handling
app.get('/code', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    console.log(`📞 Pairing request for: ${num}`);

    if (!num) {
        return res.status(400).json({ 
            success: false,
            code: 'Phone number is required' 
        });
    }

    // ✅ FIX 7: Clean and validate number early
    num = num.replace(/[^0-9]/g, '');
    
    const pn = awesomePhoneNumber('+' + num);
    if (!pn.isValid()) {
        console.log(`❌ Invalid phone number: ${num}`);
        return res.status(400).json({ 
            success: false,
            code: 'Invalid phone number format' 
        });
    }

    const sessionPath = path.join(tempDir, id);

    async function GIFT_MD_PAIR_CODE() {
        try {
            // Create session directory
            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            console.log(`🔌 Creating socket for session: ${id}`);

            let sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
                },
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: ["Android", "Edge", "142.0.3595.66"],
                getMessage: async (key) => {
                    return { conversation: 'GIFT MD' };
                }
            });

            // ✅ FIX 8: Request pairing code and respond immediately
            if (!sock.authState.creds.registered) {
                await delay(1500);

                try {
                    console.log(`🔐 Requesting pairing code for: ${num}`);
                    const code = await sock.requestPairingCode(num);

                    console.log(`✅ Pairing code generated: ${code}`);
                    
                    if (!res.headersSent) {
                        // ✅ SEND RESPONSE IMMEDIATELY WITH success FLAG
                        return res.json({ 
                            success: true,
                            code: code 
                        });
                    }
                } catch (pairError) {
                    console.error('❌ Pairing error:', pairError.message);
                    await removeFile(sessionPath);
                    
                    if (!res.headersSent) {
                        return res.status(500).json({
                            success: false,
                            code: 'Failed to generate code. Number may be invalid or already paired.'
                        });
                    }
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    console.log(`✅ Connection opened for: ${num}`);
                    await delay(5000);

                    try {
                        const credsPath = path.join(sessionPath, 'creds.json');
                        
                        if (!fs.existsSync(credsPath)) {
                            throw new Error('Credentials file not found');
                        }

                        let data = fs.readFileSync(credsPath);
                        await delay(800);

                        let b64data = Buffer.from(data).toString('base64');

                        await sock.sendMessage(sock.user.id, {
                            text: 'GIFT-MD~' + b64data
                        });

                        let GIFT_MD_TEXT = `
╔════════════════════════════════
║ ✅ SESSION CONNECTED
║ 
║ 🤖 Bot: GIFT MD
║ 👤 User: ${sock.user.id.split('@')[0]}
║ 📱 Number: +${num}
║ 
╠════════════════════════════════
║ 📋 SETUP INSTRUCTIONS
║ 
║ 1. Copy the session ID above
║ 2. Go to your deployment
║ 3. Add to .env:
║    SESSION_ID=GIFT-MD~[session]
║ 4. Deploy your bot
║ 
╠════════════════════════════════
║ 🔗 SUPPORT
║ 
║ 📱 Owner: +2348154853640
║ 💬 GitHub: github.com/isaacodofin
║ 🌐 Channel: whatsapp.com/channel/...
║ 
╚════════════════════════════════

⚠️ Keep your session private!
🎉 Enjoy GIFT MD!
`;

                        await sock.sendMessage(sock.user.id, { text: GIFT_MD_TEXT });

                        console.log(`📤 Session sent to: ${num}`);

                        await delay(100);
                        await sock.ws.close();
                    } catch (sessionError) {
                        console.error('❌ Session error:', sessionError.message);
                    } finally {
                        await removeFile(sessionPath);
                    }

                } else if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    console.log(`❌ Connection closed. Status: ${statusCode}`);

                    if (statusCode !== 401) {
                        console.log('🔄 Retrying connection...');
                        await delay(5000);
                        GIFT_MD_PAIR_CODE();
                    } else {
                        await removeFile(sessionPath);
                    }
                }
            });

        } catch (err) {
            console.error('❌ Service error:', err.message);
            await removeFile(sessionPath);
            
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    code: 'Service temporarily unavailable. Please try again.'
                });
            }
        }
    }

    return await GIFT_MD_PAIR_CODE();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ✅ FIX 9: Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'GIFT MD Pairing API',
        status: 'online',
        endpoints: {
            pairing: '/code?number=YOUR_NUMBER',
            health: '/health'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════╗
║   GIFT MD PAIRING API          ║
║   Status: ✅ ONLINE            ║
║   Port: ${PORT}                    ║
╚════════════════════════════════╝

📡 API Endpoint: http://localhost:${PORT}/code?number=...
🌐 CORS: Enabled for all origins
    `);
});

// ✅ FIX 10: Cleanup old sessions periodically
setInterval(() => {
    try {
        if (!fs.existsSync(tempDir)) return;
        
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            const now = Date.now();
            const age = now - stats.mtimeMs;
            
            // Delete sessions older than 10 minutes
            if (age > 10 * 60 * 1000) {
                removeFile(filePath);
                console.log(`🗑️ Cleaned old session: ${file}`);
            }
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}, 5 * 60 * 1000); // Run every 5 minutes
