import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import { OAuth2Client } from 'google-auth-library';

const PORT = 8989;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

// Percorsi candidati per drive_config.json
const configCandidates = [
  '/app/config/drive_config.json',
  '/data/drive_config.json',
  path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json'),
  path.join(process.cwd(), 'config', 'drive_config.json'),
  path.join(process.cwd(), 'scheduler', 'src', 'app', 'config', 'drive_config.json'),
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
  targetConfigPath = fs.existsSync('/app/config')
    ? '/app/config/drive_config.json'
    : path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json');
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
console.log('🔗 Visita questo link nel browser per autorizzare:\n');
console.log(`\x1b[36m${authorizeUrl}\x1b[0m\n`);

// Tenta apertura browser (funziona su desktop/locale)
const openCmd = process.platform === 'win32'
  ? `start "" "${authorizeUrl}"`
  : process.platform === 'darwin'
  ? `open "${authorizeUrl}"`
  : `xdg-open "${authorizeUrl}"`;

exec(openCmd, () => {});

async function handleAuthorizationCode(rawInput) {
  try {
    let code = rawInput.trim();
    if (!code) return;

    // Se l'utente ha incollato l'intero URL di callback
    if (code.includes('code=')) {
      const match = code.match(/[?&]code=([^&]+)/);
      if (match && match[1]) {
        code = decodeURIComponent(match[1]);
      }
    }

    console.log('\n🔄 Scambio codice autorizzazione con Refresh Token in corso...');
    const { tokens } = await oauth2Client.getToken(code);
    const newRefreshToken = tokens.refresh_token;

    if (!newRefreshToken) {
      console.warn('⚠️ Google non ha restituito un nuovo refresh_token (forse l\'app era già autorizzata).');
    }

    currentConfig.oauthRefreshToken = newRefreshToken || currentConfig.oauthRefreshToken;

    // Salva nei percorsi disponibili
    for (const p of [
      targetConfigPath,
      '/app/config/drive_config.json',
      '/data/drive_config.json',
      path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json'),
      path.join(process.cwd(), 'config', 'drive_config.json'),
    ]) {
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(currentConfig, null, 2), 'utf-8');
        console.log(`✅ Configurazione aggiornata salvata in: ${p}`);
      } catch (_) {}
    }

    console.log('\n🎉 SUCCESS! Nuovo Refresh Token acquisito con successo!');
    console.log(`\x1b[32mToken: ${newRefreshToken || currentConfig.oauthRefreshToken}\x1b[0m\n`);
    console.log('Ora puoi riavviare o usare la sincronizzazione in ScalaScheduler!\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Errore durante lo scambio token:', err.message);
    if (err.response?.data) {
      console.error('Dettagli Google:', JSON.stringify(err.response.data));
    }
    console.log('\nRiprova incollando il codice corretto.');
  }
}

// Server HTTP per callback automatica locale
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/' && parsedUrl.query.code) {
      const code = parsedUrl.query.code;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Autorizzazione Completata</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f0fdf4; color: #166534;">
          <h1>✅ Autorizzazione Google Drive completata!</h1>
          <p>Il Refresh Token è stato acquisito e salvato in ScalaScheduler.</p>
          <p>Puoi chiudere questa scheda del browser.</p>
        </body>
        </html>
      `);
      server.close();
      await handleAuthorizationCode(code);
    } else if (parsedUrl.pathname === '/' && parsedUrl.query.error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Errore Autorizzazione</h1><p>${parsedUrl.query.error}</p>`);
      console.error(`\n❌ Errore Google OAuth: ${parsedUrl.query.error}\n`);
    }
  } catch (err) {
    console.error('Errore callback HTTP:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎧 Server di callback in ascolto su porta ${PORT}.`);
  console.log('-------------------------------------------------------------');
  console.log('👉 Se il reindirizzamento automatico non funziona (es. in Docker/remoto):');
  console.log('   Dopo aver fatto il login, copia l\'URL dalla barra degli indirizzi');
  console.log('   (anche se dice "Impossibile raggiungere il sito") e incollalo qui:');
  console.log('-------------------------------------------------------------\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Incolla qui l\'URL di reindirizzamento o il codice (?code=...): ', async (answer) => {
    rl.close();
    server.close();
    await handleAuthorizationCode(answer);
  });
});

