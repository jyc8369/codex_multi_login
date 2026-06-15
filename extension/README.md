# Codex Multi Login

Manage multiple Codex accounts inside VS Code.

This extension lets you add accounts through OAuth, switch the active account, refresh quota, and import or export your saved account bundle.

## Features

- Add an account through OAuth
- Switch the active account and rewrite `~/.codex/auth.json`
- Delete saved accounts
- Import or export the extension's JSON account bundle
- Refresh quota for one account or all accounts
- View a compact dashboard with plan, status, credits, and quota

## Storage

- Active Codex auth file: `~/.codex/auth.json`
- VS Code global storage:
  - `account.json`: canonical non-sensitive account metadata only
  - `tokens.json`: saved account tokens in plaintext mode only, keyed by `storageKey`
  - Missing keychain credentials are marked in the dashboard and removed from the saved list

If `CODEX_HOME` is set, the auth file path becomes `${CODEX_HOME}/auth.json`.

See `STORAGE.md` for the exact storage layout.

## JSON Import and Export

The extension can export the saved account bundle to JSON and import it back later.

See `JSON_FORMAT.md` for the supported format.

## Commands

- `Codex Multi Login: Open Dashboard`
- `Codex Multi Login: Add Account via OAuth`
- `Codex Multi Login: Import / Export JSON`
- `Codex Multi Login: Switch Account`
- `Codex Multi Login: Delete Account`
- `Codex Multi Login: Refresh Quota`
- `Codex Multi Login: Refresh All Quotas`

## Notes

- This is a lightweight personal-use build.
- Switching accounts overwrites the active Codex auth file.
- Deleting an account removes it from the metadata files and token store.
- The extension also exposes a browser entry point for VS Code Web.
- Web host mode shows a read-only dashboard backed by VS Code web storage.
- Web host mode intentionally hides commands that require local `auth.json` or OS keychain access.
