import express from 'express';
import cors from 'cors';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, Browsers, delay } from '@whiskeysockets/baileys';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: ['https://gift-al5t.onrender.com', 'http://localhost:8000', '*'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Serve your HTML page
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

// Pairing code endpoint
app.get('/code', async (req, res) => {
  const { number } = req.query;
  
  if (!number) {
    return res.status(400).json({ 
      error: 'Phone number required',
      code: 'Service Unavailable'
    });
  }

  let sock = null;
  
  try {
    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    
    // Create fresh connection for this request ONLY
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
    });

    // Listen for credential updates
    sock.ev.on('creds.update', saveCreds);

    // Request pairing code
    const code = await sock.requestPairingCode(number);
    
    // ✅ CRITICAL: Close connection immediately after getting code
    await delay(2000); // Small delay to ensure code is sent
    await sock.end();
    sock = null;
    
    console.log(`✅ Pairing code generated for ${number}: ${code}`);
    
    res.json({ 
      code,
      status: 'success'
    });
    
  } catch (error) {
    console.error('❌ Error generating pairing code:', error.message);
    
    // Always cleanup on error
    if (sock) {
      try {
        await sock.end();
      } catch (e) {
        console.error('Error closing socket:', e.message);
      }
      sock = null;
    }
    
    res.status(500).json({ 
      error: error.message,
      code: 'Service Unavailable'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════╗');
  console.log('║   GIFT MD PAIRING API          ║');
  console.log('║   Status: ONLINE ✅            ║');
  console.log(`║   Port: ${PORT}                    ║`);
  console.log('╚════════════════════════════════╝\n');
  console.log(`📡 API Endpoint: http://localhost:${PORT}/code?number=...`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  console.log('    ');
});
