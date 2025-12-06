import express from 'express';
import fs from 'fs';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ FIXED IMPORT
import pkg from '@whiskeysockets/baileys';
const { 
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ IMPORTANT: Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Utility to generate random ID
function makeid(length = 10) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Remove temp folder
function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

// ✅ ROOT ROUTE - Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ PAIR ROUTE - Pairing page
app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// ✅ CODE ENDPOINT - API for generating pairing code
app.get('/code', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    async function GIFT_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            const { version } = await fetchLatestBaileysVersion();
            
            let sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
                browser: Browsers.windows('Edge'),
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                console.log(`✅ Pairing code generated: ${code} for ${num}`);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;
                
                if (connection === 'open') {
                    console.log('🎉 Connection opened successfully!');
                    
                    await delay(5000);
                    
                    if (!sock.user || !sock.user.id) {
                        console.log('❌ ERROR: sock.user is undefined after connection!');
                        await sock.ws.close();
                        return await removeFile('./temp/' + id);
                    }
                    
                    console.log('✅ User connected:', sock.user.id);
                    
                    try {
                        const credsPath = path.join(__dirname, 'temp', id, 'creds.json');
                        
                        if (!fs.existsSync(credsPath)) {
                            console.log('❌ ERROR: Creds file not found');
                            await sock.ws.close();
                            return await removeFile('./temp/' + id);
                        }
                        
                        let data = fs.readFileSync(credsPath);
                        await delay(800);
                        
                        let b64data = Buffer.from(data).toString('base64');
                        let sessionString = 'GIFT-MD~' + b64data;
                        
                        let session = await sock.sendMessage(sock.user.id, { 
                            text: sessionString 
                        });
                        
                        let GIFT_MD_TEXT = `
╔════════════════════◇
║ SESSION CONNECTED ✅
║ 🎁 GIFT MD BOT
║ By Isaac Favour
╚════════════════════╝

╔════════════════════◇
║ SETUP INSTRUCTIONS:
║ 
║ 1. Copy the session above (GIFT-MD~...)
║ 2. Go to your hosting platform
║ 3. Set environment variable:
║    SESSION_ID = <paste here>
║ 4. Deploy your bot
╚════════════════════╝

╔════════════════════◇
║ SUPPORT & LINKS:
║ 
║ 📺 YouTube: @officialGift-md
║ 📱 Owner: +2348085046874
║ 🔗 Repo: github.com/isaacfont461461-cmd
║ 💬 Channel: whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A
╚════════════════════╝

🎉 Enjoy GIFT MD!
______________________________`;

                        await sock.sendMessage(sock.user.id, { 
                            text: GIFT_MD_TEXT 
                        }, { quoted: session });
                        
                        await delay(2000);
                        await sock.ws.close();
                        return await removeFile('./temp/' + id);
                        
                    } catch (sendError) {
                        console.log('❌ ERROR while sending messages:', sendError.message);
                        await sock.ws.close();
                        return await removeFile('./temp/' + id);
                    }
                    
                } else if (connection === 'close') {
                    console.log('⚠️ Connection closed');
                    
                    if (lastDisconnect && lastDisconnect.error) {
                        const statusCode = lastDisconnect.error.output?.statusCode;
                        
                        if (statusCode !== 401) {
                            await delay(10000);
                            GIFT_MD_PAIR_CODE();
                        } else {
                            await removeFile('./temp/' + id);
                        }
                    }
                }
            });
            
        } catch (err) {
            console.log('❌ Service error:', err.message);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: 'Service Currently Unavailable' });
            }
        }
    }

    return await GIFT_MD_PAIR_CODE();
});

// ✅ HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        message: 'GIFT MD Pairing API is running'
    });
});

// ✅ 404 HANDLER
app.use((req, res) => {
    res.status(404).send('404 - Page Not Found');
});

// ✅ START SERVER
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════╗
║   🎁 Gift-X PAIRING SITE      ║
║   Status: ONLINE ✅            ║
║   Port: ${PORT}                    ║
╚════════════════════════════════╝

🌐 Home: http://localhost:${PORT}
🔗 Pairing: http://localhost:${PORT}/pair
📡 API: http://localhost:${PORT}/code?number=...
    `);
});
