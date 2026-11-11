# MultiApp Desktop

A cross-platform Electron desktop shell for multiple web apps, with isolated sessions, a settings editor, and optional demo-login drawers.

## Features

- Open multiple configured websites as browser tabs.
- Each app ID maps to an independent persistent Chromium session, including its own cookies, storage and login state.
- **Settings:** Click **⚙ Settings** to add, rename, remove and reorder apps. Changes are saved to the application's user-data directory, not the bundled application files.
- **Demo logins:** Add any number of demo accounts to an app, each with a title, description, username and optional password. The **☰ Logins** button only appears when the active app has demo logins. Open the drawer and copy individual usernames or passwords with one click.
- Existing passwords are not shown or returned to the Settings screen. Leave password blank when editing to preserve an existing password.
- Passwords use Electron `safeStorage` encryption, backed by the operating system's credential store when available. Saving new demo passwords is intentionally blocked when secure storage is unavailable or Linux falls back to the insecure `basic_text` backend.
- The clipboard contains any copied password until you overwrite it. Avoid storing real production credentials in a shared demo environment.

## Local development

Requires Node.js 22+.

```bash
npm install
npm start
```

## Managing applications

Use the **Settings** button in the top-right of the app. Enter the application title and its name, unique stable ID and URL. Then add optional demo logins. Click **Save changes**. The changes persist across launches.

On first launch, Electron copies `config/apps.json` into its per-user user-data directory as `apps.json`. Existing users retain their installed configuration, and you can edit it entirely through the UI. Avoid editing `apps.json` manually, particularly encrypted fields. No external service or database is required. The example configuration contains no credentials.

App IDs should be 1 to 48 characters using letters, numbers, underscores and dashes. Changing an app ID creates a new browser session, so old authentication may not carry over. Deleting an app does not automatically purge Chromium's session partition.

## Build distributables

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

GitHub Actions builds on each push to `main`, on version tags, or on manual dispatch. Download the relevant completed workflow artifact:

- Windows: x64 installer EXE and portable EXE
- macOS: universal DMG and ZIP, unsigned
- Linux: x64 AppImage and DEB

The packages bundle Electron and do not require Node.js installed by end users. Linux may still require compatible system libraries. Windows signing and macOS signing/notarization are not configured.

## Security and limitations

- Embedded content is sandboxed with Node integration disabled. Web permission requests are denied. Popups open in the operating system browser.
- Demo passwords are **not** placed inside the bundled JSON defaults or sent over the website connection by the app. Copy and paste is manual.
- The OS encryption backend may differ by operating system or Linux desktop configuration. Secure storage is tied to the local OS environment and may not be portable to another machine.
- Some services do not support OAuth login in embedded browsers.
- Changing app URL changes the view's home URL but retains its app ID's stored session, including cookies. Configure only trusted websites.
- Native view windows currently hide while Settings or the demo drawer is open, then restore when closed.
- This is an MVP. Automated runtime end-to-end and accessibility tests are not yet included.
