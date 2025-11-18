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

// ✅ Track completed sessions
const completedSessions = new Set();
const activeSockets = new Map();

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

// ✅ FIXED: Send session with retry mechanism
async function sendSessionToUser(sock, sessionPath, num, id, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📤 Attempt ${attempt}/${retries} - Sending session to: ${num}`);
      
      await delay(2000); // Wait for stable connection
      
      const credsPath = path.join(sessionPath, 'creds.json');
      
      if (!fs.existsSync(credsPath)) {
        throw new Error('Credentials file not found');
      }

      let data = fs.readFileSync(credsPath);
      let b64data = Buffer.from(data).toString('base64');

      // ✅ Send session ID with retry
      let session = await sock.sendMessage(sock.user.id, {
        text: 'GIFT-MD~' + b64data
      });

      await delay(1000);

      // ✅ Send instructions
      let GIFT_MD_TEXT = `
╔════════════════════◇
║『 SESSION CONNECTED 』
║ 🤖 BOT: GIFT MD
║ 👤 USER: ${sock.user.id.split('@')[0]}
║ 📱 NUMBER: +${num}
║ 🟢 TYPE: base64
╚════════════════════╝

╔════════════════════◇
║『 You've chosen GIFT MD Bot 』
║
║ 📋 SETUP INSTRUCTIONS:
║ 1. Copy the session ID above
║ 2. Go to your deployment
║ 3. Add to .env:
║    SESSION_ID=GIFT-MD~[session]
║ 4. Deploy your bot
║
╠════════════════════◇
║ 🔗 SUPPORT
║ 📱 Owner: +2348154853640
║ 💬 GitHub: github.com/isaacodofin
║ 🌐 Channel: whatsapp.com/channel/...
╚════════════════════╝

⚠️ Keep your session private!
🎉 Enjoy GIFT MD!

Don't Forget To Give Star⭐ To My Repo`;

      await sock.sendMessage(sock.user.id, { text: GIFT_MD_TEXT }, { quoted: session });

      console.log(`✅ Session successfully sent to: ${num}`);
      
      // ✅ Mark as completed
      completedSessions.add(id);
      
      return true;

    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      if (attempt < retries) {
        console.log(`⏳ Retrying in 3 seconds...`);
        await delay(3000);
      } else {
        console.error(`❌ All ${retries} attempts failed for session ${id}`);
        return false;
      }
    }
  }
  
  return false;
}

// ✅ MAIN PAIRING ENDPOINT
app.get('/code', async (req, res) => {
  const id = makeid();
  let num = req.query.number;

  console.log(`📞 Pairing request for: ${num}`);

  async function GIFT_MD_PAIR_CODE() {
    const sessionPath = path.join(tempDir, id);

    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      console.log(`🔌 Creating socket for session: ${id}`);

      let sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: Browsers.windows('Edge'),
        getMessage: async (key) => {
          return { conversation: 'GIFT MD' };
        }
      });

      // ✅ Store active socket
      activeSockets.set(id, sock);

      // ✅ Request pairing code
      if (!sock.authState.creds.registered) {
        await delay(1500);

        // Clean number
        num = num.replace(/[^0-9]/g, '');

        // Validate number
        const pn = awesomePhoneNumber('+' + num);
        if (!pn.isValid()) {
          console.log(`❌ Invalid phone number: ${num}`);
          if (!res.headersSent) {
            return res.status(400).json({
              success: false,
              code: 'Invalid phone number format'
            });
          }
        }

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
              code: 'Service Currently Unavailable'
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

          // ✅ Send session with retry mechanism
          const success = await sendSessionToUser(sock, sessionPath, num, id);

          if (success) {
            // ✅ Wait before closing to ensure delivery
            await delay(3000);

            try {
              await sock.ws.close();
            } catch (e) {
              console.log('Socket already closed');
            }

            // ✅ Clean up
            activeSockets.delete(id);
            
            // ✅ Clean up files after delay
            setTimeout(() => {
              removeFile(sessionPath);
            }, 5000);
          } else {
            console.error(`❌ Failed to send session for ${id}`);
            completedSessions.add(id);
            await removeFile(sessionPath);
            activeSockets.delete(id);
          }

        } else if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;

          console.log(`❌ Connection closed. Status: ${statusCode}`);

          // ✅ Don't retry if session already sent
          if (completedSessions.has(id)) {
            console.log(`✅ Session already sent for ${id}`);
            activeSockets.delete(id);
            return;
          }

          // ✅ Clean up on 401 (logged out)
          if (statusCode === 401) {
            console.log(`❌ Logged out error for ${id}`);
            await removeFile(sessionPath);
            activeSockets.delete(id);
          } else {
            // ✅ Retry on other errors
            console.log('🔄 Retrying connection...');
            await delay(5000);
            GIFT_MD_PAIR_CODE();
          }
        }
      });

    } catch (err) {
      console.error('❌ Service error:', err.message);
      await removeFile(sessionPath);
      activeSockets.delete(id);

      if (!res.headersSent) {
        return res.json({
          success: false,
          code: 'Service Currently Unavailable'
        });
      }
    }
  }

  return await GIFT_MD_PAIR_CODE();
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    completedSessions: completedSessions.size,
    activeSessions: activeSockets.size
  });
});

// ✅ Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'GIFT MD Pairing API',
    status: 'online',
    version: '2.1.0',
    style: 'Enhanced Reliability',
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
║   GIFT MD PAIRING API         ║
║   Status: ✅ ONLINE            ║
║   Port: ${PORT}                ║
║   Version: 2.1.0 (Fixed)      ║
╚════════════════════════════════╝

📡 API Endpoint: http://localhost:${PORT}/code?number=...
🌐 CORS: Enabled for all origins
  `);
});

// ✅ Cleanup old sessions (every 5 minutes)
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

        // Remove sessions older than 15 minutes
        if (age > 15 * 60 * 1000) {
          removeFile(filePath);
          console.log(`🗑️ Cleaned old session: ${file}`);
        }
      } catch (err) {
        // Skip
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 5 * 60 * 1000);

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close all active sockets
  for (const [id, sock] of activeSockets.entries()) {
    try {
      await sock.ws.close();
      console.log(`✅ Closed socket: ${id}`);
    } catch (e) {
      // Ignore
    }
  }
  
  process.exit(0);
});
