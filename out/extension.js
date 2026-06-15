"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const oauth_1 = require("./auth/oauth");
const dashboard_1 = require("./dashboard");
const accounts_1 = require("./storage/accounts");
const config_1 = require("./storage/config");
const localization_1 = require("./localization");
let store;
let dashboard;
let outputChannel;
let configStore;
const LOCALE_KEY = "codexMultiLogin.locale";
const THEME_KEY = "codexMultiLogin.theme";
const STORAGE_KEY = "codexMultiLogin.storageMode";
console.log("[codex-multi-login] module loaded");
async function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Codex Multi login");
    const boot = (message) => {
        console.log(`[codex-multi-login] ${message}`);
        outputChannel?.appendLine(`[info] [boot] ${message}`);
    };
    try {
        boot(`activate start extensionPath=${context.extensionPath} storageUri=${context.globalStorageUri.fsPath} extensionId=${context.extension.id}`);
        configStore = new config_1.ConfigStore(context);
        const appConfig = await configStore.read();
        boot(`config loaded storageMode=${appConfig.storageMode} warnedStorageRisk=${appConfig.warnedStorageRisk}`);
        const log = (level, message) => {
            outputChannel?.appendLine(`[${level}] [extension] ${message}`);
            if (level === "error") {
                console.error(`[codex-multi-login] ${message}`);
            }
        };
        store = new accounts_1.AccountsStore(context, outputChannel);
        dashboard = new dashboard_1.DashboardPanel(context);
        await context.globalState.update(STORAGE_KEY, appConfig.storageMode);
        boot(`globalState storageMode=${appConfig.storageMode}`);
        await store.init();
        const keychainReady = await probeKeychain(context);
        boot(`keychainReady=${keychainReady}`);
        if ((!keychainReady || appConfig.storageMode === "plaintext") && !appConfig.warnedStorageRisk) {
            const choice = await vscode.window.showWarningMessage(keychainReady
                ? "Plaintext storage weakens token protection. Continue only if you understand the risk."
                : "OS Keychain storage is not available in this environment. Plaintext storage will be used unless you change the setting.", { modal: true }, "OK");
            boot(`storage warning choice=${choice ?? "none"}`);
            if (choice === "OK") {
                const nextMode = keychainReady ? appConfig.storageMode : "plaintext";
                await configStore.write({ storageMode: nextMode, warnedStorageRisk: true });
                await context.globalState.update(STORAGE_KEY, nextMode);
                await store.updateStorageMode(nextMode);
                boot(`storage mode applied nextMode=${nextMode}`);
            }
        }
        log("info", "activate");
        const openDashboard = async () => {
            const accounts = await store.list();
            const missingCount = accounts.filter((account) => account.credentialsMissing).length;
            log("info", `openDashboard accounts=${accounts.length} active=${accounts.filter((account) => account.isActive).length} missing=${missingCount}`);
            const settings = {
                locale: (0, localization_1.normalizeLocale)(context.globalState.get(LOCALE_KEY)),
                theme: context.globalState.get(THEME_KEY) ?? "auto",
                storageMode: context.globalState.get(STORAGE_KEY) ?? "keychain"
            };
            dashboard.show(accounts, settings, async (message) => {
                const command = message.command;
                if (command === "addAccount") {
                    await vscode.commands.executeCommand("codexMultiLogin.addAccount");
                }
                if (command === "importJson") {
                    await vscode.commands.executeCommand("codexMultiLogin.importJson");
                }
                if (command === "refreshAll") {
                    await vscode.commands.executeCommand("codexMultiLogin.refreshAllQuotas");
                }
                if (command === "switchAccount") {
                    const accountId = message.accountId;
                    if (accountId) {
                        await vscode.commands.executeCommand("codexMultiLogin.switchAccount", accountId);
                    }
                }
                if (command === "deleteAccount") {
                    const accountId = message.accountId;
                    if (accountId) {
                        await vscode.commands.executeCommand("codexMultiLogin.deleteAccount", accountId);
                    }
                }
                if (command === "moveAccount") {
                    const accountId = message.accountId;
                    const targetAccountId = message.targetAccountId;
                    const placement = message.placement;
                    if (accountId && targetAccountId && (placement === "before" || placement === "after")) {
                        await vscode.commands.executeCommand("codexMultiLogin.moveAccount", accountId, targetAccountId, placement);
                    }
                }
                if (command === "refreshAccount") {
                    const accountId = message.accountId;
                    if (accountId) {
                        await vscode.commands.executeCommand("codexMultiLogin.refreshAccount", accountId);
                    }
                }
                if (command === "setLocale") {
                    const value = message.value;
                    await context.globalState.update(LOCALE_KEY, (0, localization_1.normalizeLocale)(value));
                    await openDashboard();
                }
                if (command === "setTheme") {
                    const value = message.value;
                    if (value === "auto" || value === "vscode" || value === "dark" || value === "light") {
                        await context.globalState.update(THEME_KEY, value);
                        await openDashboard();
                    }
                }
                if (command === "setStorageMode") {
                    const value = message.value;
                    if (value === "keychain" || value === "plaintext") {
                        if (value === "plaintext" && keychainReady) {
                            const choice = await vscode.window.showWarningMessage("Plaintext storage weakens token protection. Continue only if you understand the risk.", { modal: true }, "Use Plaintext", "Cancel");
                            if (choice !== "Use Plaintext") {
                                await openDashboard();
                                return;
                            }
                        }
                        await context.globalState.update(STORAGE_KEY, value);
                        await configStore.write({ ...(await configStore.read()), storageMode: value, warnedStorageRisk: true });
                        await store.updateStorageMode(value);
                        await openDashboard();
                    }
                }
            });
            if (missingCount > 0) {
                void store.purgeMissingCredentials().then((removed) => {
                    if (removed > 0) {
                        log("warn", `purgeMissingCredentials removed=${removed}`);
                    }
                });
            }
        };
        const currentLocale = () => (0, localization_1.normalizeLocale)(context.globalState.get(LOCALE_KEY));
        const refreshAccountCard = async (accountId) => {
            const accounts = await store.list();
            const current = accounts.find((account) => account.id === accountId);
            if (!current) {
                log("warn", `refreshAccount skipped id=${accountId} reason=missing_account`);
                return false;
            }
            await dashboard.postMessage({ command: "refresh-start", accountId });
            try {
                const updated = await store.refreshAccount(accountId, outputChannel);
                if (!updated) {
                    const message = "Refresh failed.";
                    log("warn", `refreshAccount returned no data id=${accountId}`);
                    await dashboard.postMessage({
                        command: "refresh-error",
                        accountId,
                        html: (0, dashboard_1.renderAccountCardHtml)(current, currentLocale(), "error", message)
                    });
                    return false;
                }
                const nextAccount = updated ?? (await store.list()).find((account) => account.id === accountId) ?? current;
                await dashboard.postMessage({
                    command: "refresh-success",
                    accountId,
                    html: (0, dashboard_1.renderAccountCardHtml)(nextAccount, currentLocale())
                });
                return true;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log("error", `refreshAccount failed id=${accountId} error=${message}`);
                await dashboard.postMessage({
                    command: "refresh-error",
                    accountId,
                    html: (0, dashboard_1.renderAccountCardHtml)(current, currentLocale(), "error", message)
                });
                return false;
            }
        };
        const refreshAllAccounts = async () => {
            const accounts = await store.list();
            await dashboard.postMessage({ command: "refresh-batch-start" });
            try {
                for (const account of accounts) {
                    log("info", `refreshAllQuotas queue id=${account.id}`);
                    await refreshAccountCard(account.id);
                }
            }
            finally {
                await dashboard.postMessage({ command: "refresh-batch-end" });
            }
        };
        context.subscriptions.push(vscode.commands.registerCommand("codexMultiLogin.openDashboard", openDashboard), vscode.commands.registerCommand("codexMultiLogin.addAccount", async () => {
            log("info", "addAccount start");
            const session = (0, oauth_1.prepareOAuthLoginSession)();
            const tokens = await (0, oauth_1.runPreparedOAuthLoginSession)(session);
            await store.addTokens(tokens, true);
            log("info", `addAccount done accountId=${tokens.accountId ?? "unknown"}`);
            await openDashboard();
        }), vscode.commands.registerCommand("codexMultiLogin.importJson", async () => {
            log("info", "importJson start");
            const action = await vscode.window.showQuickPick([
                { label: "Import JSON", description: "Load accounts from a JSON file.", id: "import" },
                { label: "Export JSON", description: "Save the current accounts to a JSON file.", id: "export" }
            ], { placeHolder: "Choose a JSON action" });
            if (!action) {
                return;
            }
            if (action.id === "import") {
                const picked = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters: { JSON: ["json"] },
                    openLabel: "Import JSON"
                });
                if (!picked?.[0]) {
                    return;
                }
                const imported = await store.importFromJsonFile(picked[0].fsPath);
                log("info", `importJson imported count=${imported.length}`);
                if (!imported.length) {
                    log("warn", "importJson no valid account tokens found");
                    void vscode.window.showInformationMessage("No valid account tokens were found in the JSON file.");
                }
                await openDashboard();
                return;
            }
            const picked = await vscode.window.showSaveDialog({
                saveLabel: "Export JSON",
                filters: { JSON: ["json"] },
                defaultUri: vscode.Uri.file("codex-accounts.json")
            });
            if (!picked) {
                return;
            }
            await store.exportToJsonFile(picked.fsPath);
            log("info", `exportJson path=${picked.fsPath}`);
            void vscode.window.showInformationMessage("Accounts exported to JSON.");
            await openDashboard();
        }), vscode.commands.registerCommand("codexMultiLogin.switchAccount", async (argAccountId) => {
            if (typeof argAccountId === "string" && argAccountId) {
                log("info", `switchAccount direct id=${argAccountId}`);
                const switched = await store.switchAccount(argAccountId);
                if (switched) {
                    const choice = await vscode.window.showInformationMessage(`Switched to ${switched.email}. ` + "Reload VS Code to refresh the workspace state.", "Reload VS Code", "Dismiss");
                    if (choice === "Reload VS Code") {
                        await vscode.commands.executeCommand("workbench.action.reloadWindow");
                    }
                    else {
                        log("info", `switchAccount dismissed email=${switched.email}`);
                    }
                }
                await openDashboard();
                return;
            }
            const accounts = await store.list();
            const picked = await vscode.window.showQuickPick(accounts.map((account) => ({ label: account.email, description: account.isActive ? "active" : "", id: account.id })), { placeHolder: "Choose account" });
            if (picked) {
                log("info", `switchAccount picked id=${picked.id}`);
                const switched = await store.switchAccount(picked.id);
                if (switched) {
                    const choice = await vscode.window.showInformationMessage(`Switched to ${switched.email}. ` + "Reload VS Code to refresh the workspace state.", "Reload VS Code", "Dismiss");
                    if (choice === "Reload VS Code") {
                        await vscode.commands.executeCommand("workbench.action.reloadWindow");
                    }
                    else {
                        log("info", `switchAccount dismissed email=${switched.email}`);
                    }
                }
                await openDashboard();
            }
        }), vscode.commands.registerCommand("codexMultiLogin.deleteAccount", async (argAccountId) => {
            if (!argAccountId) {
                return;
            }
            log("info", `deleteAccount start id=${argAccountId}`);
            const account = (await store.list()).find((item) => item.id === argAccountId);
            if (!account) {
                return;
            }
            const choice = await vscode.window.showWarningMessage(`Delete ${account.email}? This will remove the saved account and token.`, { modal: true }, "Delete", "Cancel");
            if (choice !== "Delete") {
                return;
            }
            await store.deleteAccount(argAccountId);
            log("info", `deleteAccount done id=${argAccountId}`);
            void vscode.window.showInformationMessage(`Deleted ${account.email}.`);
            await openDashboard();
        }), vscode.commands.registerCommand("codexMultiLogin.moveAccount", async (argAccountId, targetAccountId, placement) => {
            if (!argAccountId || !targetAccountId || (placement !== "before" && placement !== "after")) {
                return;
            }
            log("info", `moveAccount command id=${argAccountId} target=${targetAccountId} placement=${placement}`);
            const reordered = await store.moveAccount(argAccountId, targetAccountId, placement);
            if (!reordered) {
                log("warn", `moveAccount failed id=${argAccountId} target=${targetAccountId} placement=${placement}`);
                return;
            }
            await openDashboard();
        }), vscode.commands.registerCommand("codexMultiLogin.refreshAccount", async (argAccountId) => {
            if (!argAccountId) {
                return;
            }
            log("info", `refreshAccount command id=${argAccountId}`);
            await refreshAccountCard(argAccountId);
        }), vscode.commands.registerCommand("codexMultiLogin.refreshQuota", async () => {
            const accounts = await store.list();
            const active = accounts.find((account) => account.isActive) ?? accounts[0];
            if (active) {
                log("info", `refreshQuota command activeId=${active.id}`);
                await refreshAccountCard(active.id);
            }
            else {
                log("warn", "refreshQuota skipped no accounts available");
            }
        }), vscode.commands.registerCommand("codexMultiLogin.refreshAllQuotas", async () => {
            log("info", "refreshAllQuotas command");
            await refreshAllAccounts();
        }));
        boot("activate done");
    }
    catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error(`[codex-multi-login] activate failed: ${message}`);
        outputChannel?.appendLine(`[error] [boot] activate failed: ${message}`);
        throw error;
    }
}
function deactivate() {
    store = undefined;
    dashboard = undefined;
    outputChannel?.dispose();
    outputChannel = undefined;
    configStore = undefined;
}
async function probeKeychain(context) {
    const probeKey = "codexMultiLogin.__probe__";
    try {
        await context.secrets.store(probeKey, "ok");
        await context.secrets.delete(probeKey);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=extension.js.map