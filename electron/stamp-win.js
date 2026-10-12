const ResEdit = require('resedit');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { version } = require('../package.json');
const [major, minor, patch] = version.split('.').map(n => parseInt(n, 10) || 0);

async function stampWindowsExecutable() {
  const baseDir = path.join(__dirname, '..');
  const exePath = path.join(baseDir, 'dist_electron', 'win-unpacked', 'GPIOS.exe');
  const icoPath = path.join(baseDir, 'static', 'icon.ico');
  const winUnpackedDir = path.join(baseDir, 'dist_electron', 'win-unpacked');
  const zipOutPath = path.join(baseDir, 'dist_electron', `GPIOS-${version}-win.zip`);

  if (!fs.existsSync(exePath)) {
    console.error('[STAMP] Executable file not found at:', exePath);
    process.exit(1);
  }

  console.log('[STAMP] Embedding official icon and Windows PE metadata...');
  const exeBuffer = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(exeBuffer);
  const res = ResEdit.NtExecutableResource.from(exe);

  // Embed official .ico icon file
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    iconFile.icons.map(item => item.data)
  );

  // Embed version and author metadata
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = viList.length > 0 ? viList[0] : ResEdit.Resource.VersionInfo.createEmpty();
  vi.setFileVersion(major, minor, patch, 0);
  vi.setProductVersion(major, minor, patch, 0);
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      CompanyName: 'Vision by Data',
      FileDescription: 'GPIOS - Bird Field Notebook',
      FileVersion: `${version}.0`,
      InternalName: 'GPIOS.exe',
      LegalCopyright: `Copyright © ${new Date().getFullYear()} Vision by Data`,
      OriginalFilename: 'GPIOS.exe',
      ProductName: 'GPIOS',
      ProductVersion: `${version}.0`
    }
  );
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  const newExeBuffer = Buffer.from(exe.generate());
  fs.writeFileSync(exePath, newExeBuffer);
  console.log('[STAMP] ✓ Icon and metadata successfully embedded into GPIOS.exe');

  // Compress distribution directory to ZIP archive
  console.log('[STAMP] Packaging final Windows ZIP distribution...');
  const pyScript = `
import zipfile, os
src_dir = r"""${winUnpackedDir}"""
zip_path = r"""${zipOutPath}"""
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src_dir):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src_dir)
            z.write(full, rel)
`;
  const pyCmd = (() => {
    for (const cmd of ['python3', 'python', 'py']) {
      try {
        require('child_process').execSync(`${cmd} --version`, { stdio: 'ignore' });
        return cmd;
      } catch {}
    }
    return 'python';
  })();
  execFileSync(pyCmd, ['-c', pyScript]);
  console.log('[STAMP] ✓ ZIP package successfully generated at:', zipOutPath);
}

stampWindowsExecutable().catch(err => {
  console.error('[STAMP ERROR]', err);
  process.exit(1);
});
