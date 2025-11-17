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
    proto,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Track completed sessions to prevent duplicate sends
const completedSessions = new Set();

// ✅ CORS Configuration
app.use(cors());
app.options('*', cors());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ✅ Ensure temp directory exists
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

// ✅ MAIN PAIRING ENDPOINT
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

    // Clean and validate number
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
                browser: Browsers.ubuntu('Chrome'),
                getMessage: async (key) => {
                    return { conversation: 'GIFT MD' };
                }
            });

            // ✅ Request pairing code
            if (!sock.authState.creds.registered) {
                await delay(1500);
                
                try {
                    console.log(`🔐 Requesting pairing code for: ${num}`);
                    const code = await sock.requestPairingCode(num);
                    
                    console.log(`✅ Pairing code generated: ${code}`);
                    
                    if (!res.headersSent) {
                        res.json({
                            bot: "GIFT-MD",
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
                            code: 'Failed to generate code. Try again later.'
                        });
                    }
                }
            }

            // ✅ Save credentials
            sock.ev.on('creds.update', saveCreds);

            // ✅ FIXED CONNECTION HANDLER
            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    // ✅ Prevent duplicate sends
                    if (completedSessions.has(id)) {
                        console.log(`⚠️ Session ${id} already sent, skipping`);
                        return;
                    }
                    
                    console.log(`✅ Connection opened for: ${num}`);
                    await delay(5000);

                    try {
                        const credsPath = path.join(sessionPath, 'creds.json');
                        
                        if (!fs.existsSync(credsPath)) {
                            throw new Error('Credentials file not found');
                        }

                        let data = fs.readFileSync(credsPath);
                        let b64data = Buffer.from(data).toString('base64');

                        // Send session ID
                        await sock.sendMessage(sock.user.id, {
                            text: 'GIFT-MD~' + b64data
                        });

                        // Send instructions
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
                        
                        // ✅ Mark as completed
                        completedSessions.add(id);
                        
                        // ✅ Close connection gracefully
                        await delay(2000);
                        sock.end(undefined);
                        
                        // ✅ Schedule delayed cleanup (10 seconds)
                        setTimeout(() => {
                            removeFile(sessionPath);
                            completedSessions.delete(id);
                            console.log(`🗑️ Cleaned session: ${id}`);
                        }, 10000);
                        
                    } catch (sessionError) {
                        console.error('❌ Session error:', sessionError.message);
                        completedSessions.add(id);
                        await removeFile(sessionPath);
                    }

                } else if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    console.log(`❌ Connection closed. Status: ${statusCode}`);

                    // ✅ Don't retry if session already sent
                    if (completedSessions.has(id)) {
                        console.log(`✅ Session already sent for ${id}, not retrying`);
                        return;
                    }

                    // ✅ Handle specific disconnect reasons
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        console.log(`🛑 Logged out - stopping`);
                        await removeFile(sessionPath);
                    } 
                    else if (statusCode === 428) {
                        console.log(`🛑 Bad session - stopping`);
                        await removeFile(sessionPath);
                    }
                    else if (statusCode === 515) {
                        console.log(`🛑 Rate limited - stopping`);
                        await removeFile(sessionPath);
                    }
                    else if (statusCode === DisconnectReason.restartRequired) {
                        console.log('🔄 Restart required, retrying...');
                        await delay(3000);
                        GIFT_MD_PAIR_CODE();
                    }
                    else if (statusCode === DisconnectReason.timedOut) {
                        console.log('⏱️ Timed out, retrying...');
                        await delay(3000);
                        GIFT_MD_PAIR_CODE();
                    }
                    else {
                        console.log(`🛑 Unknown error (${statusCode}), stopping`);
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

// ✅ Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        activeSessions: completedSessions.size
    });
});

// ✅ Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'GIFT MD Pairing API',
        status: 'online',
        version: '2.0.0',
        endpoints: {
            pairing: '/code?number=YOUR_NUMBER',
            health: '/health'
        }
    });
});

// ✅ Start server
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

// ✅ Cleanup old sessions periodically (every 5 minutes)
setInterval(() => {
    try {
        if (!fs.existsSync(tempDir)) return;
        
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            
            try {
                const stats = fs.statSync(filePath);
                const now = Date.now();
                const age = now - stats.mtimeMs;
                
                // Delete sessions older than 15 minutes
                if (age > 15 * 60 * 1000) {
                    removeFile(filePath);
                    console.log(`🗑️ Cleaned old session: ${file}`);
                }
            } catch (err) {
                // Skip if file already deleted
            }
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}, 5 * 60 * 1000);
