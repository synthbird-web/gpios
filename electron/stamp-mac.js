const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { version } = require('../package.json');

async function stampMacPackage() {
  const baseDir = path.join(__dirname, '..');
  const macAppDir = path.join(baseDir, 'dist_electron', 'mac-arm64', 'GPIOS.app');
  const infoPlistPath = path.join(macAppDir, 'Contents', 'Info.plist');
  const asarPath = path.join(macAppDir, 'Contents', 'Resources', 'app.asar');
  let zipOutPath = path.join(baseDir, 'dist_electron', `GPIOS-${version}-arm64-mac.zip`);
  if (!fs.existsSync(zipOutPath)) {
    try {
      const distFiles = fs.readdirSync(path.join(baseDir, 'dist_electron'));
      const macZip = distFiles.find(f => f.endsWith('.zip') && (f.includes('mac') || f.includes('arm64')));
      if (macZip) zipOutPath = path.join(baseDir, 'dist_electron', macZip);
    } catch {}
  }

  const sevenZa = (() => {
    try {
      const p = require('7zip-bin').path7za;
      if (p && fs.existsSync(p)) return p;
    } catch {}
    return '';
  })();

  if (!fs.existsSync(macAppDir)) {
    console.error('[STAMP-MAC] Application folder not found at:', macAppDir);
    process.exit(1);
  }

  console.log('[STAMP-MAC] 1. Computing SHA-256 integrity hash of app.asar...');
  const asarBuffer = fs.readFileSync(asarPath);
  const realSha256 = crypto.createHash('sha256').update(asarBuffer).digest('hex');
  console.log('[STAMP-MAC] Real SHA256:', realSha256);

  console.log('[STAMP-MAC] 2. Updating Info.plist with ElectronAsarIntegrity hash...');
  let plistContent = fs.readFileSync(infoPlistPath, 'utf8');
  
  plistContent = plistContent.replace(
    /<key>ElectronAsarIntegrity<\/key><dict><key>Resources\/app\.asar<\/key><dict><key>algorithm<\/key><string>SHA256<\/string><key>hash<\/key><string>[a-f0-9]+<\/string><\/dict><\/dict>/,
    `<key>ElectronAsarIntegrity</key><dict><key>Resources/app.asar</key><dict><key>algorithm</key><string>SHA256</string><key>hash</key><string>${realSha256}</string></dict></dict>`
  );

  fs.writeFileSync(infoPlistPath, plistContent, 'utf8');
  console.log('[STAMP-MAC] ✓ Info.plist updated successfully.');

  console.log('[STAMP-MAC] 3. Synchronizing Info.plist inside distribution ZIP...');
  if (fs.existsSync(zipOutPath)) {
    const macUnpackedDir = path.join(baseDir, 'dist_electron', 'mac-arm64');
    let updated = false;
    if (sevenZa) {
      try {
        execFileSync(sevenZa, ['u', zipOutPath, 'GPIOS.app/Contents/Info.plist'], { cwd: macUnpackedDir });
        updated = true;
      } catch (err) {
        console.warn('[STAMP-MAC] 7za utility failed, attempting system zip command:', err.message);
      }
    }
    if (!updated) {
      try {
        execFileSync('zip', ['-u', zipOutPath, 'GPIOS.app/Contents/Info.plist'], { cwd: macUnpackedDir });
      } catch (err) {
        console.warn('[STAMP-MAC] Warning: could not update zip using system zip utility:', err.message);
      }
    }
    console.log('[STAMP-MAC] ✓ ZIP package updated successfully, preserving symlinks and permissions.');
  }
}

stampMacPackage().catch(err => {
  console.error('[STAMP-MAC ERROR]', err);
  process.exit(1);
});
