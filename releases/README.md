# GPIOS — Version 1.0.0 Releases

Official standalone pre-compiled binaries for Windows, macOS, and GNU/Linux. Ready to run without requiring Node.js, Python, or external databases.

---

## Download Packages

All release packages are published in the official [GitHub Releases](https://github.com/synthbird-web/gpios/releases) repository:

| Operating System | Architecture | Package File | Format |
| :--- | :---: | :--- | :--- |
| **Windows** | x64 (Windows 10 / 11) | `GPIOS-1.0.0-win.zip` | Portable executable (`GPIOS.exe`) |
| **macOS (Apple Silicon)** | arm64 | `GPIOS-1.0.0-arm64-mac.zip` | Application bundle (`GPIOS.app`) |
| **GNU / Linux** | x64 (Universal) | `GPIOS-1.0.0.AppImage` | AppImage standalone executable |

---

## Installation & First Run

### Windows (10 / 11)
1. Extract `GPIOS-1.0.0-win.zip`.
2. Launch `GPIOS.exe`.

### macOS (Apple Silicon)
1. Extract `GPIOS-1.0.0-arm64-mac.zip` and move `GPIOS.app` into `/Applications`.
2. Run the following command in Terminal once to clear Gatekeeper quarantine:
   ```bash
   xattr -cr /Applications/GPIOS.app
   codesign --force --deep --sign - /Applications/GPIOS.app
   ```
3. Open `GPIOS.app` from Applications or Launchpad.

### GNU / Linux (AppImage)
1. Grant execute permissions:
   ```bash
   chmod +x GPIOS-1.0.0.AppImage
   ```
2. Run `./GPIOS-1.0.0.AppImage` or double-click the file in your desktop environment.

---

## Technical Summary (v1.0.0)

- **Bilingual Interface:** Full English (default) and Spanish support throughout the application.
- **Global GIS Cartography:** OpenStreetMap and high-resolution Esri World Imagery satellite baselayers (requires an active internet connection for tile downloading).
- **Worldwide Taxonomic Catalogue:** +11,000 bird species with real-time diacritic-insensitive search in English, Spanish, scientific, or family names.
- **Smart Location & Geographic Limits:** Device GPS, IP geolocation with anti-VPN/proxy heuristics, and automatic view framing to the exact geographic boundaries of any selected city, town, province, or country.
- **First-Run Onboarding:** Initial profile setup for name, language, and regional preferences, always editable via ⚙️ Settings.
- **Field Sessions Notebook:** Full field excursion management with coordinates, weather conditions, specimen counts, and editing capabilities.
- **Data Export & Backup:** Excel-compatible CSV (UTF-8 with BOM) and full JSON backup import/export.
- **Local Persistence:** Zero telemetry, 100% private local storage powered by SQLite 3 over WebAssembly (`gpios.db`).

---

Developed by [Vision by Data](https://visionbydata.com)
