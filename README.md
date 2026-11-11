# MultiApp Desktop

A cross-platform Electron desktop browser that opens configured web applications as tabs with isolated persistent sessions.

## Run locally

Requires Node.js 22+:

```bash
npm install
npm start
```

The starter configuration is at `config/apps.json`. On first launch it is copied to Electron's per-user application data directory. Use **Edit config** and **Reload config** in the app to change tabs without rebuilding.

## Config

```json
{
  "title": "My Platform",
  "apps": [
    {"id": "dashboard", "name": "Dashboard", "url": "https://example.com"},
    {"id": "fleet", "name": "Fleet Management", "url": "https://www.wikipedia.org"}
  ]
}
```

Each stable app ID gets a distinct Chromium persistent session partition. IDs must be unique and contain letters, numbers, hyphens or underscores. Up to 40 apps are supported.

## Build

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

The GitHub Actions workflow builds packages on Windows, macOS and Linux and uploads them as **workflow artifacts**. Trigger it manually from Actions > Cross-platform builds > Run workflow, or push a version tag (e.g. `v1.0.0`). You must download each platform's artifact from a completed workflow run.

- Windows: x64 installer EXE and portable EXE
- macOS: universal DMG and ZIP (unsigned)
- Linux: x64 AppImage and DEB

The packages bundle Electron, but Linux still requires compatible system libraries. Mac signing/notarization and Windows code signing are not configured.

## Security notes

Remote content uses sandboxed web views, disabled Node integration and isolated sessions. Web permission requests are denied by default. Popups are opened in the external browser. Only load trusted sites. Some OAuth providers prohibit embedded browser authentication. Each view can consume substantial memory while inactive. The app does not contain auto-updates or a download manager.
