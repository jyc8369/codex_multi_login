# Codex Multi Login

Lightweight VS Code extension for managing multiple Codex accounts, switching the active `auth.json`, and refreshing quota.

## What it does

- Add an account through OAuth
- Import or export the extension's JSON account bundle
- Switch the active account
- Refresh quota for one account or all accounts
- Show a simple dashboard for the saved accounts

## Storage Paths

- `~/.codex/auth.json`
  - Active Codex CLI auth file that gets overwritten when you switch accounts.
  - `CODEX_HOME` is supported. If set, the file becomes `${CODEX_HOME}/auth.json`.
- VS Code global storage
  - Windows: `%APPDATA%\\Code\\User\\globalStorage\\local-personal-use.codex-multi-login\\`
  - macOS: `~/Library/Application Support/Code/User/globalStorage/local-personal-use.codex-multi-login/`
  - Linux: `~/.config/Code/User/globalStorage/local-personal-use.codex-multi-login/`
  - `account.json`: canonical non-sensitive account metadata only
  - `tokens.json`: saved account tokens in plaintext mode only, keyed by `storageKey`
  - Missing keychain credentials are marked in the dashboard and removed from the saved list

See [`STORAGE.md`](./STORAGE.md) and [`JSON_FORMAT.md`](./JSON_FORMAT.md) for details.

## Build

```bash
npm install
npm run compile
```

## Package

```bash
npm run package
```

The output will be a `.vsix` file in the workspace root.

## Notes

- This project is intentionally lightweight.
- The reference implementation lives in `codex-accounts-manager-master/` and is kept as a reference only.
- Account metadata is stored in the extension global storage directory.
- Tokens are stored in OS Keychain by default, with plaintext mode available as an option.
- The extension now declares a `browser` entry point for VS Code Web compatibility.
- In web host mode, the extension shows a read-only dashboard backed by VS Code web storage (`workspace.fs`).
- Commands that depend on local auth files or keychain are hidden in web host mode.
