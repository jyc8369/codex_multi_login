import * as vscode from "vscode";

type StorageMode = "keychain" | "plaintext";

interface AppConfig {
  storageMode: StorageMode;
  warnedStorageRisk: boolean;
}

interface BrowserStoredAccount {
  id: string;
  email: string;
  accountId?: string;
  storageKey?: string;
  planType?: string;
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

interface BrowserAccountIndex {
  currentAccountId?: string;
  accounts: BrowserStoredAccount[];
}

interface BrowserTokenRecord {
  tokens?: unknown;
  email?: string;
}

const ACCOUNT_FILE = "account.json";
const CONFIG_FILE = "config.json";
const TOKENS_FILE = "tokens.json";
const COMMANDS = [
  "codexMultiLogin.addAccount",
  "codexMultiLogin.importCurrentAuth",
  "codexMultiLogin.switchAccount",
  "codexMultiLogin.deleteAccount",
  "codexMultiLogin.refreshQuota",
  "codexMultiLogin.refreshAllQuotas"
] as const;

let panel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  registerCommands(context);
  await openReadOnlyDashboard(context);
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand("codexMultiLogin.openDashboard", async () => {
    await openReadOnlyDashboard(context);
  }));

  for (const command of COMMANDS) {
    context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
      void vscode.window.showWarningMessage(
        "This command is not available in VS Code Web. Open the desktop extension to manage auth.json and OS keychain storage."
      );
    }));
  }
}

async function openReadOnlyDashboard(context: vscode.ExtensionContext): Promise<void> {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "codexMultiLoginWebDashboard",
      "Codex Multi Login",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message?.command === "refresh") {
        await renderDashboard(context);
      }
    });
  }

  await renderDashboard(context);
}

async function renderDashboard(context: vscode.ExtensionContext): Promise<void> {
  if (!panel) {
    return;
  }

  const state = await loadBrowserState(context);
  panel.webview.html = buildHtml(state);
}

async function loadBrowserState(context: vscode.ExtensionContext): Promise<{
  config: AppConfig;
  index: BrowserAccountIndex;
  tokensByAccount: Record<string, BrowserTokenRecord>;
}> {
  const config = await readJson<AppConfig>(context, CONFIG_FILE, { storageMode: "keychain", warnedStorageRisk: false });
  const index = await readJson<BrowserAccountIndex>(context, ACCOUNT_FILE, { currentAccountId: undefined, accounts: [] });
  const tokensByAccount =
    config.storageMode === "plaintext"
      ? await readJson<Record<string, BrowserTokenRecord>>(context, TOKENS_FILE, {})
      : {};

  return { config, index, tokensByAccount };
}

async function readJson<T>(context: vscode.ExtensionContext, fileName: string, fallback: T): Promise<T> {
  try {
    const uri = vscode.Uri.joinPath(context.globalStorageUri, fileName);
    const data = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(new TextDecoder().decode(data)) as T;
  } catch {
    return fallback;
  }
}

function buildHtml(state: {
  config: AppConfig;
  index: BrowserAccountIndex;
  tokensByAccount: Record<string, BrowserTokenRecord>;
}): string {
  const accounts = state.index.accounts ?? [];
  const activeAccountId = state.index.currentAccountId;
  const activeCount = accounts.filter((account) => account.isActive || account.id === activeAccountId).length;
  const rows = accounts
    .map((account) => {
      const isActive = Boolean(account.isActive || account.id === activeAccountId);
      const credentialState =
        state.config.storageMode === "plaintext"
          ? state.tokensByAccount[account.storageKey ?? account.id]
            ? "available"
            : "missing"
          : "keychain";
      return `
        <div class="card ${isActive ? "active" : ""}">
          <div class="row">
            <div class="email">${escapeHtml(account.email)}</div>
            <div class="badges">
              <span class="badge">${escapeHtml((account.planType ?? "unknown").toUpperCase())}</span>
              <span class="badge ${isActive ? "active-badge" : "inactive-badge"}">${isActive ? "ACTIVE" : "INACTIVE"}</span>
              <span class="badge ${credentialState === "available" ? "ok" : credentialState === "missing" ? "warn" : "neutral"}">
                ${credentialState === "keychain" ? "KEYCHAIN" : credentialState === "available" ? "CREDENTIALS" : "MISSING"}
              </span>
            </div>
          </div>
          <div class="meta">storageKey: ${escapeHtml(account.storageKey ?? account.id)}</div>
        </div>`;
    })
    .join("");

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0f172a;
        --surface: #111827;
        --border: rgba(148, 163, 184, 0.18);
        --text: #e5e7eb;
        --muted: #94a3b8;
        --accent: #60a5fa;
        --good: #22c55e;
        --warn: #f59e0b;
      }
      body.light {
        --bg: #f8fafc;
        --surface: #ffffff;
        --border: rgba(15, 23, 42, 0.1);
        --text: #0f172a;
        --muted: #475569;
        --accent: #2563eb;
        --good: #16a34a;
        --warn: #d97706;
      }
      body {
        margin: 0;
        padding: 24px;
        background: linear-gradient(180deg, var(--bg), color-mix(in srgb, var(--bg) 80%, black));
        color: var(--text);
        font: 14px/1.5 system-ui, sans-serif;
      }
      .shell { max-width: 980px; margin: 0 auto; }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 18px;
      }
      h1 { margin: 0; font-size: 28px; }
      .sub { color: var(--muted); margin-top: 8px; max-width: 68ch; }
      .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 82%, transparent);
        color: var(--text);
        font-size: 12px;
        font-weight: 700;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }
      .tile, .card {
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 90%, transparent);
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
      }
      .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
      .v { font-size: 24px; font-weight: 800; margin-top: 8px; }
      .list { display: grid; gap: 12px; }
      .card.active { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); }
      .row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .email { font-size: 16px; font-weight: 800; word-break: break-all; }
      .badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 800;
        border: 1px solid var(--border);
      }
      .active-badge { color: var(--good); }
      .inactive-badge { color: var(--muted); }
      .ok { color: var(--good); }
      .warn { color: var(--warn); }
      .neutral { color: var(--muted); }
      .meta { color: var(--muted); margin-top: 10px; font-size: 12px; }
      .toolbar { display: flex; gap: 8px; align-items: center; }
      button {
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 80%, var(--accent));
        color: var(--text);
        padding: 10px 14px;
        border-radius: 999px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .notice {
        margin: 0 0 18px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--warn) 28%, var(--border));
        background: color-mix(in srgb, var(--warn) 10%, transparent);
        color: var(--text);
      }
      @media (max-width: 840px) {
        .hero { flex-direction: column; }
        .summary { grid-template-columns: 1fr; }
        .row { flex-direction: column; }
        .badges { justify-content: flex-start; }
      }
    </style>
  </head>
  <body class="${isDarkTheme() ? "" : "light"}">
    <div class="shell">
      <div class="hero">
        <div>
          <h1>Codex Multi Login - Web Dashboard</h1>
          <div class="sub">
            This is the browser-host version. It reads account metadata from VS Code web storage using
            <code>workspace.fs</code>. Desktop-only actions such as OS keychain access and rewriting
            <code>~/.codex/auth.json</code> are intentionally unavailable here.
          </div>
          <div class="pill-row">
            <span class="pill">storage: ${escapeHtml(state.config.storageMode.toUpperCase())}</span>
            <span class="pill">active: ${activeCount}</span>
            <span class="pill">saved: ${accounts.length}</span>
          </div>
        </div>
        <div class="toolbar">
          <button onclick="refresh()">Refresh</button>
        </div>
      </div>

      <div class="notice">
        Desktop account management commands are hidden in web mode. Use the desktop extension for OAuth login,
        switching accounts, and keychain-backed token storage.
      </div>

      <div class="summary">
        <div class="tile">
          <div class="k">Saved Accounts</div>
          <div class="v">${accounts.length}</div>
        </div>
        <div class="tile">
          <div class="k">Active Accounts</div>
          <div class="v">${activeCount}</div>
        </div>
        <div class="tile">
          <div class="k">Storage Mode</div>
          <div class="v">${escapeHtml(state.config.storageMode)}</div>
        </div>
      </div>

      <div class="list">
        ${rows || `<div class="tile">No saved accounts were found in this workspace storage.</div>`}
      </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function refresh() {
        vscode.postMessage({ command: 'refresh' });
      }
    </script>
  </body>
  </html>`;
}

function isDarkTheme(): boolean {
  return vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}
