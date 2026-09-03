const fs = require('fs');
const path = require('path');
const { google } = require('./node_modules/googleapis');
const { OAuth2Client } = require('./node_modules/google-auth-library');

async function inspectDrive() {
  const config = JSON.parse(fs.readFileSync('src/app/config/drive_config.json', 'utf8'));
  const oauth2Client = new OAuth2Client(config.oauthClientId, config.oauthClientSecret);
  oauth2Client.setCredentials({ refresh_token: config.oauthRefreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  console.log('--- 1. Fetching subfolders with names starting with 2026 ---');
  const resFolders = await drive.files.list({
    q: `'${config.googleDriveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, createdTime, modifiedTime)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const folders = resFolders.data.files || [];
  folders.sort((a, b) => (b.name || '').localeCompare(a.name || ''));

  console.log('Total subfolders on Drive:', folders.length);
  console.log('Top 10 newest subfolders:');
  for (let i = 0; i < Math.min(10, folders.length); i++) {
    console.log(`  - ${folders[i].name} (ID: ${folders[i].id}, created: ${folders[i].createdTime})`);
  }

  try {
    const directRes = await drive.files.get({
      fileId: '1wGt9dXL3C0RsW_mVru5vzqDPOVHQY1tk',
      fields: 'id, name, trashed, parents',
      supportsAllDrives: true,
    });
    console.log('Direct lookup 1wGt9dXL3C0RsW_mVru5vzqDPOVHQY1tk:', directRes.data);
  } catch (e) {
    console.log('Direct lookup failed:', e.message);
  }
}

inspectDrive().catch(console.error);
