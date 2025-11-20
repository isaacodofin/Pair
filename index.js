import express from 'express';
import fs from 'fs';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
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

// Serve static files
app.use(express.static('public'));

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

// Pairing endpoint
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
                version: [2, 3000, 1025190524],
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
                browser: Browsers.windows('Edge'),
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;
                
                if (connection === 'open') {
                    await delay(5000);
                    let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                    await delay(800);
                    let b64data = Buffer.from(data).toString('base64');
                    let session = await sock.sendMessage(sock.user.id, { text: 'GIFT-MD~' + b64data });

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
║ ☬ ☬ ☬ ☬
╚════════════════════╝

🎉 Enjoy GIFT MD!

Don't forget to give a ⭐ to the repo!
______________________________`;

                    await sock.sendMessage(sock.user.id, { text: GIFT_MD_TEXT }, { quoted: session });

                    await delay(100);
                    await sock.ws.close();
                    return await removeFile('./temp/' + id);
                    
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    await delay(10000);
                    GIFT_MD_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.log('Service restarted:', err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: 'Service Currently Unavailable' });
            }
        }
    }

    return await GIFT_MD_PAIR_CODE();
});

// Serve the pairing HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'online' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════╗
║   🎁 GIFT MD PAIRING SITE      ║
║   Status: ONLINE ✅            ║
║   Port: ${PORT}                    ║
╚════════════════════════════════╝

🌐 Pairing Site: http://localhost:${PORT}
📡 API: http://localhost:${PORT}/code?number=...
    `);
});
