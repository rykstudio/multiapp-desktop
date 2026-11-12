# MultiApp Desktop

A cross-platform Electron desktop shell for multiple web apps, with isolated sessions, a settings editor, and optional demo-login drawers.

## Features

- Open multiple configured websites as browser tabs.
- Each app ID maps to an independent persistent Chromium session, including its own cookies, storage and login state.
- **Settings:** Click **⚙ Settings** to add, rename, remove and reorder apps. Changes are saved to the application's user-data directory, not the bundled application files.
- **Demo logins:** Add any number of demo accounts to an app, each with a title, description, username and optional password. The **☰ Logins** button only appears when the active app has demo logins. Open the drawer and copy individual usernames or passwords with one click.
- Existing passwords are not shown or returned to the Settings screen. Leave password blank when editing to preserve an existing password.
- Passwords use Electron `safeStorage` when a secure OS keyring exists. If no secure OS credential backend is available, **packaged builds refuse new demo passwords** rather than storing them as plaintext. Legacy plaintext entries remain readable until remediated. Development-only plaintext fallback requires an explicit environment override.
- All settings are stored in an embedded SQLite file `multiapp-settings.sqlite` in the Electron user-data directory. Native `node:sqlite` requires no additional platform-specific native module.
- **Encrypted JSON export:** Settings > Export encrypted JSON requests a password (minimum 8 characters) and exports apps, logins and their demo passwords as an AES-256-GCM encrypted document with a scrypt-derived key. The export requires the password again to import on another machine.
- The clipboard contains any copied password until you overwrite it. Avoid storing real production credentials in a shared demo environment.

## Local development

Requires Node.js 22+.

```bash
npm install
npm start
```

## Import settings and download a template

Open **Settings** and choose **Download JSON template** to save `multiapp-settings-template.json` to your computer. It includes three sample applications, two with multiple demo accounts, and a third with no accounts. Replace the example `.example.com` URLs and usernames with your own details.

Click **Import settings JSON** and select a JSON file using the same structure. If the file is an encrypted export, enter its export password to decrypt it before previewing. The app validates the format, application IDs, URLs, demo-login IDs and field lengths, then shows a **preview**. The imported apps replace the current **draft** settings, not your saved configuration. Review them and click **Save changes** to apply or **Cancel** to discard.

For each demo login, use `id`, `title`, `description`, `username` and optional `password`. Empty imported passwords preserve an existing encrypted password when the app and login IDs match. Real passwords in an import JSON are stored in plaintext until imported, so protect the file and delete it securely if needed. Internally encrypted passwords cannot be imported between machines; configure them through the UI or using an import file with a plaintext password on the destination computer.

## Sign-in links and popup authentication

Websites that use `window.open()` or `target=_blank` for sign-in now open a temporary embedded BrowserView authentication view **inside the originating application's tab** rather than launching your operating system browser. The popup shares the same persistent Electron session partition as that app, preserving its cookies, authentication and `window.opener`/`postMessage` popup communication. When the popup calls `window.close()`, the app view is restored. Use **Close [Page Title]** in the navigation toolbar to dismiss it manually. The control follows the embedded page's live document title, truncating long titles in the button while preserving the full title in its tooltip and accessible label. Switching to another app preserves that app's distinct session and leaves the originating app's temporary popup associated with its tab.

Only HTTP and HTTPS URLs (and the initial `about:blank`) are allowed in embedded popups. Electron requires its pre-created popup `webContents` to be adopted unchanged by the custom popup view; the implementation uses `BrowserView` for that compatibility path while keeping `WebContentsView` for ordinary tabs. Some identity providers explicitly prohibit embedded browser sign-in, and those restrictions cannot be bypassed; the app will not automatically open the external browser in such cases.

## Temporary mobile responsive preview for Desktop tabs

A desktop-configured tab now has a **Mobile preview** button in the navigation toolbar. Click it to view that website in the existing centered phone-style frame; click **Desktop view** to restore full width. The preview is temporary and per tab, and never changes the stored Desktop mode, app ID, cookies or isolated session. Preview changes the viewport width only, keeping the original desktop user agent, which is useful for testing CSS responsive behaviour. Apps configured as Mobile remain in their saved mobile mode and do not show this temporary toggle. Sign-in popups follow the temporary viewport bounds while active.

The demo login drawer now uses compact clipboard icons instead of text buttons. Each icon retains a tooltip and accessible name, and the copied username or password still produces a confirmation message.

## iPhone-style mobile preview

The Mobile display mode and temporary Mobile Preview use a premium iPhone Pro Max-inspired mock device with rounded metallic edges, a Dynamic Island-style cutout, and an understated bottom home indicator. The embedded browser bounds are aligned with the simulated screen, not stretched edge to edge. This is a visual approximation, not a claim of exact iPhone 18 Pro Max physical specifications or native iOS emulation. The shell remains responsive to window size and full-screen mode.

## Desktop and mobile display modes

In **Settings**, each application now has a **Display mode** selector:

- **Desktop (full window)**: the website fills all space beneath the tab/navigation bars, as before.
- **Mobile (phone preview)**: the website is rendered inside a centered, iPhone Pro Max-inspired phone-style shell with a narrow, responsive viewport. The mobile frame stays centered on resizing or full screen and is limited to roughly 440 px external width and 890 px external height, adapting to small windows. A mobile browser user agent is applied to the website.

The choice is saved in the embedded SQLite `applications.display_mode` column and is included in normal and encrypted JSON exports/imports (`displayMode: "desktop" | "mobile"`). Old SQLite configurations are migrated automatically, defaulting to Desktop. Each tab retains its original application ID and isolated session. Authentication popups also use the current display mode's centered view bounds. Switching display mode may reload the website to apply its mobile or desktop user agent.

## Handling many tabs

The tab bar hides the native horizontal scrollbar and uses subtle left and right chevrons only when tabs overflow. The active tab automatically scrolls into view as you switch tabs. Use the **▾** tab switcher to search all applications by name or URL, or press **Ctrl+K** (Windows/Linux) or **Cmd+K** (macOS). Mouse-wheel scrolling over the tab bar also moves through overflowed tabs. The tab strip keeps its position during page loading and preserves existing isolated browser sessions.

## Collapsible settings and demo logins

The Settings page uses native keyboard-accessible disclosure sections. Applications are listed as compact rows with the app name, Desktop/Mobile mode and number of demo logins. Expand only the application you need, or use **Expand all** / **Collapse all**. Each demo login also has an independent collapsible editor displaying its title and username, plus **Expand logins** / **Collapse logins** within the application. The first application opens by default. Newly added apps and logins open automatically for editing. Collapsing does not save, discard or alter fields, browser sessions or SQLite settings. Click **Save changes** to persist any actual edits.

The **☰ Logins** drawer within a running website now uses its own compact collapsible demo account cards, so large numbers of demo accounts do not create an excessively long panel. The first demo account opens initially and collapsed state is remembered while the application is running.

## Demo login editor

Under each website, use **+ Add demo login** to add as many as 50 demo accounts with separate titles and descriptions. Complete the title and username (and optionally a password), then click **Save changes**. If the OS secure credential store is unavailable, packaged builds refuse new passwords and display a warning. Existing legacy plaintext values may remain until cleared or reencrypted. Do not use demo credentials as production passwords.

## Managing applications

Use the **Settings** button in the top-right of the app. Enter the application title and its name, unique stable ID and URL. Then add optional demo logins. Click **Save changes**. The changes persist across launches.

On first launch, Electron creates `multiapp-settings.sqlite` in its user-data directory. Existing installations automatically migrate apps and demo-login values from the previous `apps.json` file into SQLite, preserving app IDs and Chromium sessions. The old JSON file is kept as `apps.json.pre-sqlite-backup` for recovery. New installations seed the database from bundled `config/apps.json`. The settings editor reads and writes SQLite, not the JSON file. No remote database is required.

### Reordering tabs

In **Settings**, use the **↑** and **↓** buttons next to each application. The numbered entries show the intended left-to-right tab sequence. Click **Save changes** and the tab strip updates immediately. The order is persisted in the application's SQLite database and is restored after closing and reopening the desktop application. Reordering does not change an app ID or clear its isolated browser session. Reordering behaviour is covered by automated regression tests in `tests/app-order.test.js`.

App IDs should be 1 to 48 characters using letters, numbers, underscores and dashes. Changing an app ID creates a new browser session, so old authentication may not carry over. Deleting an app does not automatically purge Chromium's session partition.

## Build distributables

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

GitHub Actions builds on pull requests and pushes to `main` using the committed npm lockfile. **Publishing is now an explicit manual action from `main`** and refuses to reuse an existing release version. Older `v1.0.0` binaries remain historical; set a new semantic version and run `workflow_dispatch` with `publish_release=true` only after review. Unsigned packages are not approved for enterprise production. Build artifacts:

- Windows: x64 installer EXE and portable EXE
- macOS: universal DMG and ZIP, unsigned
- Linux: x64 AppImage and DEB

The packages bundle Electron and do not require Node.js installed by end users. Linux may still require compatible system libraries. Windows signing and macOS signing/notarization are not configured.

## Production and enterprise hardening

See [Enterprise Readiness](docs/ENTERPRISE_READINESS.md) for the current control inventory, threat model, backup recovery procedure, release policy and required production go/no-go checks. **This repository is not yet an enterprise-certified or production-approved distribution.**

## Security and limitations

- Embedded content is sandboxed with Node integration disabled, privileged IPC checks the main UI sender and frame, and web permission requests are denied. Allowed popup pages open in their originating tab's embedded view.
- Demo passwords are **not** placed inside bundled JSON defaults or sent to the web pages by the app. Copy and paste is manual. Legacy entries and existing recovery snapshots may still contain plaintext; new packaged builds refuse new plaintext password storage.
- An exported encrypted JSON file includes all demo passwords within its encrypted payload. Its AES-256-GCM key is derived from the export passphrase using scrypt (N=32768, r=8, p=1). Protect the export passphrase. The database itself is not encrypted.
- When upgrading from JSON, a legacy backup file may contain encrypted data from the previous installation. The migration retains this file for rollback/recovery.
- The OS encryption backend may differ by operating system or Linux desktop configuration. Secure storage is tied to the local OS environment and may not be portable to another machine.
- Some services do not support OAuth login in embedded browsers.
- Changing app URL changes the view's home URL but retains its app ID's stored session, including cookies. Configure only trusted websites.
- Native view windows currently hide while Settings or the demo drawer is open, then restore when closed.
- This is an MVP. Automated runtime end-to-end and accessibility tests are not yet included.
