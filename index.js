import cors from 'cors';
import express from 'express';
import fs from 'fs';
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
app.use(cors({
  origin: ['https://gift-al5t.onrender.com', 'http://localhost:8000'],
  methods: ['GET', 'POST'],
  credentials: true
}));
// Serve static files
app.use(express.static('public'));

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
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

// Main pairing endpoint
app.get('/code', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ code: 'Phone number is required' });
    }

    async function GIFT_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            // ✅ FIX: Fetch latest Baileys version
            const { version } = await fetchLatestBaileysVersion();
            
            let sock = makeWASocket({
                version, // ✅ ADD THIS
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }).child({ level: 'silent' })),
                },
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }).child({ level: 'silent' }),
                browser: Browsers.macOS('Chrome'),
                // ✅ ADD THESE OPTIONS
                getMessage: async (key) => {
                    return { conversation: 'GIFT MD' };
                }
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                // Validate phone number
                const pn = awesomePhoneNumber('+' + num);
                if (!pn.isValid()) {
                    await removeFile('./temp/' + id);
                    return res.status(400).json({ code: 'Invalid phone number' });
                }

                try {
                    const code = await sock.requestPairingCode(num);
                    
                    if (!res.headersSent) {
                        await res.send({ code });
                    }
                } catch (pairError) {
                    console.error('Pairing error:', pairError);
                    await removeFile('./temp/' + id);
                    if (!res.headersSent) {
                        return res.status(500).json({ 
                            code: 'Failed to generate code. Try again.' 
                        });
                    }
                }
            }

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;
                
                if (connection === 'open') {
                    await delay(5000);
                    
                    try {
                        // Read session file
                        let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                        await delay(800);
                        
                        // Convert to base64
                        let b64data = Buffer.from(data).toString('base64');
                        
                        // Send session to user
                        let session = await sock.sendMessage(sock.user.id, { 
                            text: 'GIFT-MD~' + b64data 
                        });

                        let GIFT_MD_TEXT = `
╔════════════════════
║ *◇SESSION CONNECTED◇*
║ ◇Bot: GIFT MD
║ ◇Dev: Isaac Favour
╚════════════════════
╔════════════════════◇
║ *◇SETUP INSTRUCTIONS◇*
║ 
║ 1. Copy the session ID above
║ 2. Go to your deployment platform
║ 3. Set environment variable:
║    SESSION_ID = <paste session>
║ 4. Deploy your bot
╚════════════════════╝
╔════════════════════◇
║ *◇SUPPORT & LINKS◇*
║ 
║ 📱 Owner: +2348154853640
║ 🔗 Repo: https://github.com/eminentboy11/GIFT-MD
║ 💬 WhatsApp Channel: 
║    https://whatsapp.com/channel/0029VbBT5JR3LdQMA5ckyE3e
╚════════════════════╝

⚠️ Keep your session ID private!
🎉 Enjoy GIFT MD!
`;

                        await sock.sendMessage(sock.user.id, { text: GIFT_MD_TEXT }, { quoted: session });

                        await delay(100);
                        await sock.ws.close();
                    } catch (sessionError) {
                        console.error('Session error:', sessionError);
                    } finally {
                        await removeFile('./temp/' + id);
                    }
                    
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    await delay(10000);
                    GIFT_MD_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.error('Service error:', err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.status(500).json({ 
                    code: 'Service Currently Unavailable' 
                });
            }
        }
    }

    return await GIFT_MD_PAIR_CODE();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════╗
║   GIFT MD PAIRING API          ║
║   Status: ONLINE ✅            ║
║   Port: ${PORT}                    ║
╚════════════════════════════════╝

📡 API Endpoint: http://localhost:${PORT}/code?number=...
🌐 Web Interface: http://localhost:${PORT}
    `);
});
