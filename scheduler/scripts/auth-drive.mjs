import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { OAuth2Client } from 'google-auth-library';

const PORT = 8989;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

// Percorsi candidati per drive_config.json
const configCandidates = [
  path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json'),
  path.join(process.cwd(), 'config', 'drive_config.json'),
  path.join(process.cwd(), 'scheduler', 'src', 'app', 'config', 'drive_config.json'),
  '/app/config/drive_config.json',
  '/data/drive_config.json',
];

let targetConfigPath = null;
let currentConfig = {};

for (const p of configCandidates) {
  if (fs.existsSync(p)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(p, 'utf-8'));
      targetConfigPath = p;
      break;
    } catch (_) {}
  }
}

if (!targetConfigPath) {
  targetConfigPath = path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json');
}

const clientId = currentConfig.oauthClientId || process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
const clientSecret = currentConfig.oauthClientSecret || process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('\n❌ ERRORE: oauthClientId e oauthClientSecret non trovati in drive_config.json!');
  console.error(`Controlla il file: ${targetConfigPath}\n`);
  process.exit(1);
}

const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

const authorizeUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ],
  prompt: 'consent', // Forza il rilascio del refresh_token
});

console.log('\n=============================================================');
console.log('  ScalaScheduler - Assistente Autorizzazione Google Drive');
console.log('=============================================================\n');
console.log('📌 NOTA FONDAMENTALE PER NON FAR SCADERE IL TOKEN DOPO 7 GIORNI:');
console.log('   Assicurati che nella Google Cloud Console:');
console.log('   APIs & Services -> OAuth consent screen (Schermata di consenso OAuth)');
console.log('   lo stato sia impostato su "IN PRODUZIONE" (Publish app / Pubblica app).');
console.log('   (Se lo stato rimane "In fase di test", Google invaliderà il token ogni 7 giorni!)\n');
console.log('🔗 Apertura browser in corso per il consenso Google...\n');
console.log(`Se il browser non si apre automaticamente, visita questo link:\n${authorizeUrl}\n`);

// Apri browser in base al sistema operativo
const openCmd = process.platform === 'win32'
  ? `start "" "${authorizeUrl}"`
  : process.platform === 'darwin'
  ? `open "${authorizeUrl}"`
  : `xdg-open "${authorizeUrl}"`;

exec(openCmd, (err) => {
  if (err) {
    console.log('ℹ️ Copia e incolla il link sopra nel tuo browser.');
  }
});

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/' && parsedUrl.query.code) {
      const code = parsedUrl.query.code;

      console.log('🔄 Codice di autorizzazione ricevuto da Google! Scambio con Refresh Token in corso...');

      const { tokens } = await oauth2Client.getToken(code);
      const newRefreshToken = tokens.refresh_token;

      if (!newRefreshToken) {
        console.warn('⚠️ Nessun refresh_token restituito da Google (forse già concesso in precedenza).');
      }

      currentConfig.oauthRefreshToken = newRefreshToken || currentConfig.oauthRefreshToken;

      // Salva nei percorsi disponibili
      for (const p of [
        targetConfigPath,
        path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json'),
        '/app/config/drive_config.json',
        '/data/drive_config.json',
      ]) {
        try {
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, JSON.stringify(currentConfig, null, 2), 'utf-8');
          console.log(`✅ Configurazione aggiornata salvata in: ${p}`);
        } catch (_) {}
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Autorizzazione Completata - ScalaScheduler</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f0fdf4; color: #166534;">
          <h1 style="font-size: 28px;">✅ Autorizzazione Google Drive completata con successo!</h1>
          <p style="font-size: 16px; color: #15803d;">Il nuovo Refresh Token è stato salvato correttamente nella configurazione di ScalaScheduler.</p>
          <div style="background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #bbf7d0; max-width: 600px; margin: 20px auto; text-align: left; word-break: break-all; font-family: monospace; font-size: 13px;">
            <strong>Refresh Token:</strong><br/>
            ${newRefreshToken || '(token preservato)'}
          </div>
          <p style="color: #374151; font-size: 14px;">Puoi chiudere questa finestra e tornare a ScalaScheduler.</p>
        </body>
        </html>
      `);

      console.log('\n🎉 SUCCESS! Nuovo Refresh Token acquisito con successo!');
      console.log(`Token: ${newRefreshToken || '(invariato)'}\n`);

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1000);
    } else if (parsedUrl.pathname === '/' && parsedUrl.query.error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Errore Autorizzazione</h1><p>${parsedUrl.query.error}</p>`);
      console.error(`\n❌ Errore Google OAuth: ${parsedUrl.query.error}\n`);
      setTimeout(() => {
        server.close();
        process.exit(1);
      }, 1000);
    }
  } catch (err) {
    console.error('Errore durante lo scambio token:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Errore: ${err.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🎧 In ascolto su ${REDIRECT_URI} in attesa dell'autorizzazione Google...`);
});
