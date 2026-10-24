# NibbleSpot — desktop installers

The desktop installers wrap the live restaurant website at https://restaurant.ajdapp.org. Searches (including AI) use the same Cloudflare backend; this is not an offline restaurant database.

- Windows 10/11, 64-bit: `NibbleSpot-Windows-Setup.exe`
- macOS Intel + Apple Silicon (universal): `NibbleSpot-macOS.dmg`
- GitHub desktop workflow: https://github.com/Jhamal96/Restaurant/actions/workflows/desktop.yml
- Stable release: https://github.com/Jhamal96/Restaurant/releases/tag/desktop-latest
- Install/download page: https://restaurant.ajdapp.org/download

The desktop app has a warm welcome screen, stays in a dedicated Electron window and opens outside providers such as Apple Maps and Google Maps in the default browser. Electron context isolation and sandbox are on; Node integration is off. Nearby-location access requires an explicit permission prompt. The app stores its own browser data locally, separately from Chrome, Safari or the Android app. It does not sync saved lists yet.

The repository is **private**, so downloading the releases requires authorized GitHub access. The installers are **unsigned test builds**. SmartScreen or Gatekeeper may warn; follow standard per-app operating system safety review. Signing/notarization is required for smooth public distribution.

For local development: `cd desktop && npm install && npm start`. Builds: `npm run dist:win` on Windows, `npm run dist:mac` on macOS.

The macOS build targets universal Intel/Apple Silicon for compatibility with supported macOS releases (including Intel hardware); test on actual devices before distribution.
