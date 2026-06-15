# Storage

This extension uses two storage locations.

## 1. Codex auth file

The active account is written to:

```text
~/.codex/auth.json
```

If `CODEX_HOME` is set, the file becomes:

```text
${CODEX_HOME}/auth.json
```

The file is rewritten when you switch accounts.

## 2. VS Code global storage

The extension stores account metadata and saved tokens in the VS Code global storage directory.

Platform paths:

- Windows: `%APPDATA%\\Code\\User\\globalStorage\\local-personal-use.codex-multi-login\\`
- macOS: `~/Library/Application Support/Code/User/globalStorage/local-personal-use.codex-multi-login/`
- Linux: `~/.config/Code/User/globalStorage/local-personal-use.codex-multi-login/`

Files:

- `account.json`
  - Canonical account metadata file
  - Account email
  - Account ID
  - Plan type
  - Active state
  - `storageKey` for the token backend entry
  - Non-sensitive account fields only
- `tokens.json`
  - Saved tokens keyed by `storageKey`
  - Used only in plaintext mode

## Notes

- `Switch Account` overwrites `auth.json` with the selected account tokens.
- `Delete` removes the selected account from `account.json` and `tokens.json` or the keychain entry.
- If a keychain entry disappears, the dashboard marks the account as `Credentials missing` and removes it from the saved list on refresh.
