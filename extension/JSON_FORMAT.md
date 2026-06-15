# JSON Format

`Import / Export JSON` works with the extension's saved account bundle.

## Export format

Export writes an array of records like this:

```json
[
  {
    "email": "user@example.com",
    "id": "user@example.com:account-id",
    "tokens": {
      "idToken": "...",
      "accessToken": "...",
      "refreshToken": "...",
      "accountId": "..."
    }
  }
]
```

## Import format

Import accepts either:

- the export format above
- a single object with `id_token`, `access_token`, `refresh_token`, `account_id`

## Notes

- Only entries with both `idToken` and `accessToken` are imported.
- Import does not overwrite `~/.codex/auth.json` unless you later switch that account.

## Local storage layout

The extension keeps non-sensitive account metadata in `account.json` and plaintext tokens in `tokens.json` only when plaintext mode is selected.
`account.json` never stores `tokens`.

### `account.json`

```json
[
  {
    "id": "user@example.com:account-id",
    "email": "user@example.com",
    "accountId": "account-id",
    "storageKey": "codexMultiLogin.tokens.user@example.com:account-id",
    "planType": "plus",
    "isActive": true,
    "createdAt": 1718500000000,
    "updatedAt": 1718501234567
  }
]
```

### `tokens.json` in plaintext mode

```json
{
  "codexMultiLogin.tokens.user@example.com:account-id": {
    "tokens": {
      "idToken": "...",
      "accessToken": "...",
      "refreshToken": "...",
      "accountId": "..."
    },
    "email": "user@example.com"
  }
}
```

## Missing credentials

If a keychain entry is no longer available, the account remains in `account.json` only until the dashboard refreshes. At that point the UI shows `Credentials missing` and the account is removed from the saved list.
