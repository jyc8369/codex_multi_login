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
exports.AccountsStore = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const authFile_1 = require("../codex/authFile");
const oauth_1 = require("../auth/oauth");
const quota_1 = require("../services/quota");
const jwt_1 = require("../utils/jwt");
const ACCOUNT_FILE = "account.json";
const TOKENS_FILE = "tokens.json";
const STORAGE_MODE_KEY = "codexMultiLogin.storageMode";
const TOKEN_SECRET_PREFIX = "codexMultiLogin.tokens.";
class AccountsStore {
    constructor(context, logger) {
        this.context = context;
        this.logger = logger;
        this.accountPath = path.join(context.globalStorageUri.fsPath, ACCOUNT_FILE);
        this.tokensPath = path.join(context.globalStorageUri.fsPath, TOKENS_FILE);
    }
    async init() {
        await fs.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
        await this.syncActiveAccountFromAuthFile();
        await this.ensureAccountFiles();
        await this.migrateStorageIfNeeded();
        this.log("info", `init storage=${this.context.globalStorageUri.fsPath} mode=${this.getConfiguredStorageMode()} backend=${await this.getStorageBackend()} accountFile=${this.accountPath}`);
    }
    getStorageMode() {
        return this.getConfiguredStorageMode();
    }
    async updateStorageMode(mode) {
        this.log("info", `updateStorageMode requested mode=${mode}`);
        await this.context.globalState.update(STORAGE_MODE_KEY, mode);
        await this.migrateStorageIfNeeded(true);
    }
    async list() {
        return await this.readIndex();
    }
    async purgeMissingCredentials() {
        const index = await this.readIndex();
        const missing = index.filter((account) => account.credentialsMissing);
        if (!missing.length) {
            return 0;
        }
        const remaining = index.filter((account) => !account.credentialsMissing);
        await this.writeIndex(remaining.map((item) => this.stripTokens(item)), this.findCurrentAccountId(remaining));
        for (const account of missing) {
            await this.context.secrets.delete(this.storageKeyForAccount(account));
            await this.deletePlaintextToken(account);
        }
        this.log("warn", `purgeMissingCredentials removed=${missing.length}`);
        return missing.length;
    }
    async addTokens(tokens, markActive = true) {
        const claims = (0, jwt_1.extractClaims)(tokens.idToken, tokens.accessToken);
        const index = await this.readIndex();
        const email = claims.email ?? tokens.accountId ?? "unknown";
        const id = `${email}:${claims.accountId ?? tokens.accountId ?? "account"}`;
        const storageKey = this.secretKey(id);
        const now = Date.now();
        const record = {
            id,
            email,
            accountId: claims.accountId ?? tokens.accountId,
            storageKey,
            planType: claims.planType,
            isActive: markActive,
            tokens,
            createdAt: index.find((item) => item.id === id)?.createdAt ?? now,
            updatedAt: now
        };
        const accounts = index.filter((item) => item.id !== id);
        accounts.push(this.stripTokens(record));
        await this.writeIndex(accounts, markActive ? id : undefined);
        await this.writeTokens(record, tokens, record.email);
        if (markActive) {
            await (0, authFile_1.writeAuthFile)(tokens, record.email);
            this.activeAccountIdFromAuthFile = tokens.accountId;
            this.activeEmailFromAuthFile = record.email;
            this.log("info", `addTokens active email=${record.email} accountId=${tokens.accountId ?? "unknown"}`);
        }
        this.log("info", `addTokens saved id=${id} email=${record.email} active=${markActive}`);
        return record;
    }
    async importCurrentAuth() {
        const auth = await (0, authFile_1.readAuthFile)();
        if (!auth) {
            this.log("warn", "importCurrentAuth skipped reason=no_auth_file");
            return undefined;
        }
        return this.addTokens({
            idToken: auth.tokens.id_token,
            accessToken: auth.tokens.access_token,
            refreshToken: auth.tokens.refresh_token,
            accountId: auth.tokens.account_id
        }, true);
    }
    async importFromJsonFile(filePath) {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        const imported = [];
        for (const entry of entries) {
            const shared = this.normalizeSharedJson(entry);
            if (!shared?.tokens) {
                continue;
            }
            imported.push(await this.addTokens(shared.tokens, false));
        }
        return imported;
    }
    async exportToJsonFile(filePath) {
        const index = await this.readIndex();
        const payload = index
            .filter((account) => account.tokens?.idToken && account.tokens?.accessToken)
            .map((account) => ({
            email: account.email,
            id: account.id,
            tokens: account.tokens
        }));
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    }
    async switchAccount(accountId) {
        const index = await this.readIndex();
        const record = index.find((item) => item.id === accountId);
        if (!record?.tokens) {
            this.log("warn", `switchAccount skipped id=${accountId} reason=missing_record`);
            return undefined;
        }
        await (0, authFile_1.writeAuthFile)(record.tokens, record.email);
        this.log("info", `switchAccount wrote auth.json email=${record.email} accountId=${record.accountId ?? "unknown"}`);
        await this.writeIndex(index.map((item) => this.stripTokens({
            ...item,
            isActive: item.id === accountId,
            updatedAt: item.id === accountId ? Date.now() : item.updatedAt
        })), accountId);
        return record;
    }
    async deleteAccount(accountId) {
        const index = await this.readIndex();
        const record = index.find((item) => item.id === accountId);
        if (!record) {
            return undefined;
        }
        const remaining = index.filter((item) => item.id !== accountId);
        const nextCurrentAccountId = record.id === accountId ? remaining.find((item) => item.id !== accountId)?.id : undefined;
        await this.writeIndex(remaining.map((item) => this.stripTokens({
            ...item,
            isActive: item.id === nextCurrentAccountId
        })), nextCurrentAccountId);
        await this.deleteTokens(record);
        if (record.isActive) {
            const nextActive = remaining.find((item) => item.id === nextCurrentAccountId);
            if (nextActive?.tokens) {
                await (0, authFile_1.writeAuthFile)(nextActive.tokens, nextActive.email);
                this.activeAccountIdFromAuthFile = nextActive.tokens.accountId;
                this.activeEmailFromAuthFile = nextActive.email;
                this.log("info", `deleteAccount rotated auth.json email=${nextActive.email} accountId=${nextActive.accountId ?? "unknown"}`);
            }
        }
        return this.rehydrateRecord(record);
    }
    async moveAccount(accountId, targetAccountId, placement) {
        const index = await this.readIndex();
        const currentIndex = index.findIndex((item) => item.id === accountId);
        const targetIndex = index.findIndex((item) => item.id === targetAccountId);
        if (currentIndex < 0 || targetIndex < 0) {
            this.log("warn", `moveAccount skipped id=${accountId} reason=missing_record`);
            return undefined;
        }
        if (accountId === targetAccountId) {
            this.log("warn", `moveAccount skipped id=${accountId} reason=same_target`);
            return undefined;
        }
        const [moved] = index.splice(currentIndex, 1);
        const adjustedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const insertIndex = placement === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
        index.splice(insertIndex, 0, moved);
        await this.writeIndex(index.map((item) => this.stripTokens(item)), this.findCurrentAccountId(index));
        this.log("info", `moveAccount id=${accountId} target=${targetAccountId} placement=${placement} from=${currentIndex} to=${insertIndex}`);
        return index.map((item) => this.rehydrateRecord(item));
    }
    async refreshAccount(accountId, logger) {
        try {
            const index = await this.readIndex();
            const record = index.find((item) => item.id === accountId);
            if (!record?.tokens) {
                this.log("warn", `refreshAccount skipped id=${accountId} reason=missing_tokens`);
                return undefined;
            }
            this.log("info", `refreshAccount start id=${record.id} email=${record.email} active=${record.isActive}`);
            let tokens = record.tokens;
            if (tokens.refreshToken && (0, jwt_1.isTokenExpired)(tokens.accessToken)) {
                this.log("info", `refreshAccount refreshToken id=${record.id}`);
                tokens = await (0, oauth_1.refreshTokens)(tokens.refreshToken);
            }
            this.log("info", `refreshAccount fetchQuota id=${record.id}`);
            const quotaSummary = await (0, quota_1.refreshQuota)(tokens, logger);
            const updated = {
                ...record,
                tokens,
                quotaSummary,
                lastQuotaAt: Date.now(),
                updatedAt: Date.now()
            };
            this.log("info", `refreshAccount writeTokens id=${record.id}`);
            await this.writeTokens(record, tokens, record.email);
            const replaced = index.map((item) => this.stripTokens(item.id === accountId ? updated : item));
            this.log("info", `refreshAccount writeIndex id=${record.id}`);
            await this.writeIndex(replaced, this.findCurrentAccountId(replaced));
            if (record.isActive) {
                this.log("info", `refreshAccount writeAuthJson id=${record.id}`);
                await (0, authFile_1.writeAuthFile)(tokens, record.email);
            }
            this.log("info", `refreshAccount done id=${record.id} email=${record.email}`);
            return updated;
        }
        catch (error) {
            const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
            this.log("error", `refreshAccount failed id=${accountId} error=${message}`);
            throw error;
        }
    }
    async refreshAll(logger) {
        const index = await this.readIndex();
        const updated = [];
        for (const account of index) {
            this.log("info", `refreshAll queue id=${account.id} email=${account.email}`);
            const refreshed = await this.refreshAccount(account.id, logger);
            if (refreshed) {
                updated.push(refreshed);
            }
        }
        this.log("info", `refreshAll done count=${updated.length}`);
        return updated;
    }
    async readIndex() {
        try {
            const meta = await this.readIndexMeta();
            const storedTokens = await this.readStoredTokens(meta.accounts);
            const activeAccountId = this.activeAccountIdFromAuthFile;
            const activeEmail = this.activeEmailFromAuthFile;
            const hydrated = meta.accounts.map((account) => {
                const key = this.storageKeyForAccount(account);
                const stored = storedTokens[key] ?? storedTokens[account.id];
                return this.hydrateRecord(account, stored?.tokens, stored?.email ?? account.email, activeAccountId, activeEmail);
            });
            this.log("info", `readIndex accounts=${hydrated.length} activeAccountId=${activeAccountId ?? "none"} activeEmail=${activeEmail ?? "none"}`);
            return hydrated;
        }
        catch {
            return [];
        }
    }
    async writeIndex(accounts, currentAccountId) {
        const payload = { currentAccountId, accounts };
        await this.writeIndexFile(this.accountPath, payload);
    }
    async readIndexMeta() {
        const primary = await this.readIndexFile(this.accountPath);
        if (primary) {
            return primary;
        }
        const legacy = await this.readIndexFile(path.join(this.context.globalStorageUri.fsPath, "accounts.json"));
        if (legacy) {
            return legacy;
        }
        return { currentAccountId: undefined, accounts: [] };
    }
    async ensureAccountFiles() {
        const primary = await this.readIndexFile(this.accountPath);
        const legacyPath = path.join(this.context.globalStorageUri.fsPath, "accounts.json");
        const legacy = await this.readIndexFile(legacyPath);
        const resolved = primary ?? legacy ?? { currentAccountId: undefined, accounts: [] };
        if (!primary) {
            await this.writeIndexFile(this.accountPath, resolved);
            this.log("info", `ensureAccountFiles created account.json accounts=${resolved.accounts.length}`);
        }
        if (legacy) {
            await fs.rm(legacyPath, { force: true });
            this.log("info", "ensureAccountFiles removed legacy accounts.json");
        }
    }
    async readIndexFile(filePath) {
        try {
            const raw = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(raw);
            return {
                currentAccountId: parsed.currentAccountId,
                accounts: Array.isArray(parsed.accounts)
                    ? parsed.accounts.map((account) => ({
                        ...account,
                        storageKey: account.storageKey ?? this.secretKey(account.id)
                    }))
                    : []
            };
        }
        catch {
            return undefined;
        }
    }
    async writeIndexFile(filePath, payload) {
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    }
    async writeTokens(account, tokens, email) {
        const mode = this.getConfiguredStorageMode();
        const storageKey = this.storageKeyForAccount(account);
        if (mode === "keychain") {
            const payload = JSON.stringify({ tokens, email });
            await this.context.secrets.store(storageKey, payload);
            const verify = await this.context.secrets.get(storageKey);
            this.log("info", `writeTokens keychain id=${account.id} email=${email ?? "none"} key=${storageKey} stored=${Boolean(verify)}`);
            await this.deletePlaintextToken(account);
            return;
        }
        const current = await this.readPlaintextTokens();
        current[storageKey] = { tokens, email };
        await fs.writeFile(this.tokensPath, JSON.stringify(current, null, 2), "utf8");
        this.log("info", `writeTokens plaintext id=${account.id} email=${email ?? "none"} key=${storageKey} path=${this.tokensPath}`);
        await this.context.secrets.delete(storageKey);
    }
    async deleteTokens(account) {
        const storageKey = this.storageKeyForAccount(account);
        await this.context.secrets.delete(storageKey);
        await this.deletePlaintextToken(account);
    }
    async deletePlaintextToken(account) {
        const current = await this.readPlaintextTokens();
        const storageKey = this.storageKeyForAccount(account);
        if (current[storageKey] || current[account.id]) {
            delete current[storageKey];
            delete current[account.id];
            await fs.writeFile(this.tokensPath, JSON.stringify(current, null, 2), "utf8");
        }
    }
    async readStoredTokens(accounts) {
        const mode = await this.getStorageBackend();
        if (mode === "keychain") {
            return this.readKeychainTokens(accounts);
        }
        return this.readPlaintextTokens();
    }
    async readPlaintextTokens() {
        try {
            const raw = await fs.readFile(this.tokensPath, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return {};
        }
    }
    async readKeychainTokens(accounts) {
        const result = {};
        const resolvedAccounts = accounts ?? (await this.readIndexMeta()).accounts;
        for (const account of resolvedAccounts) {
            const storageKey = this.storageKeyForAccount(account);
            const raw = await this.context.secrets.get(storageKey);
            if (!raw) {
                continue;
            }
            try {
                result[storageKey] = JSON.parse(raw);
            }
            catch {
                this.log("warn", `readKeychainTokens invalid payload id=${account.id} key=${storageKey}`);
            }
        }
        return result;
    }
    async syncActiveAccountFromAuthFile() {
        const auth = await (0, authFile_1.readAuthFile)();
        this.activeAccountIdFromAuthFile = auth?.tokens.account_id;
        this.activeEmailFromAuthFile = auth?.email;
        this.log("info", `syncActiveAccountFromAuthFile accountId=${this.activeAccountIdFromAuthFile ?? "none"} email=${this.activeEmailFromAuthFile ?? "none"}`);
    }
    async migrateStorageIfNeeded(force = false) {
        const mode = this.getConfiguredStorageMode();
        const meta = await this.readIndexMeta().catch(() => ({ currentAccountId: undefined, accounts: [] }));
        const hasPlaintext = await this.hasPlaintextTokens();
        const hasKeychain = await this.hasKeychainTokens();
        const currentMode = hasKeychain && !hasPlaintext ? "keychain" : hasPlaintext && !hasKeychain ? "plaintext" : mode;
        this.log("info", `migrateStorageIfNeeded mode=${mode} current=${currentMode} hasKeychain=${hasKeychain} hasPlaintext=${hasPlaintext} force=${force}`);
        if (!force && currentMode === mode) {
            return;
        }
        if (currentMode === mode) {
            return;
        }
        const index = meta.accounts;
        const stored = currentMode === "keychain" ? await this.readKeychainTokens(index) : await this.readPlaintextTokens();
        for (const account of index) {
            const storageKey = this.storageKeyForAccount(account);
            const record = stored[storageKey] ?? stored[account.id];
            if (!record?.tokens)
                continue;
            await this.writeTokens(account, record.tokens, record.email ?? account.email);
        }
        if (mode === "keychain") {
            await fs.rm(this.tokensPath, { force: true });
        }
        else {
            for (const account of index) {
                await this.context.secrets.delete(this.storageKeyForAccount(account));
            }
        }
        this.log("info", `migrateStorageIfNeeded from=${currentMode} to=${mode} count=${index.length}`);
    }
    async hasPlaintextTokens() {
        try {
            const raw = await fs.readFile(this.tokensPath, "utf8");
            return raw.trim().length > 0;
        }
        catch {
            return false;
        }
    }
    async hasKeychainTokens() {
        const index = await this.readIndexMeta();
        for (const account of index.accounts) {
            if (await this.context.secrets.get(this.storageKeyForAccount(account))) {
                return true;
            }
        }
        return false;
    }
    getConfiguredStorageMode() {
        return this.context.globalState.get(STORAGE_MODE_KEY) === "plaintext" ? "plaintext" : "keychain";
    }
    async getStorageBackend() {
        const configured = this.getConfiguredStorageMode();
        const hasPlaintext = await this.hasPlaintextTokens();
        const hasKeychain = await this.hasKeychainTokens();
        if (hasPlaintext && !hasKeychain) {
            return "plaintext";
        }
        if (hasKeychain && !hasPlaintext) {
            return "keychain";
        }
        return configured;
    }
    secretKey(accountId) {
        return `${TOKEN_SECRET_PREFIX}${accountId}`;
    }
    storageKeyForAccount(account) {
        return account.storageKey ?? this.secretKey(account.id);
    }
    hydrateRecord(stored, tokens, email, activeAccountId, activeEmail) {
        const account = {
            ...stored,
            email,
            tokens,
            credentialsMissing: !tokens,
            isActive: this.matchesActiveIdentity({ email, accountId: stored.accountId }, activeAccountId, activeEmail)
        };
        return account;
    }
    stripTokens(account) {
        // Persist metadata only; tokens live in the selected storage backend.
        const { tokens: _tokens, credentialsMissing: _credentialsMissing, ...rest } = account;
        return {
            ...rest,
            storageKey: rest.storageKey ?? this.secretKey(rest.id)
        };
    }
    rehydrateRecord(stored) {
        return {
            ...stored,
            tokens: undefined,
            isActive: this.matchesActiveIdentity(stored, this.activeAccountIdFromAuthFile, this.activeEmailFromAuthFile)
        };
    }
    findCurrentAccountId(accounts) {
        return accounts.find((account) => this.matchesActiveIdentity({ email: account.email, accountId: account.accountId }, this.activeAccountIdFromAuthFile, this.activeEmailFromAuthFile))?.id;
    }
    matchesActiveIdentity(account, activeAccountId, activeEmail) {
        if (activeAccountId && account.accountId === activeAccountId) {
            return true;
        }
        if (activeEmail && account.email.toLowerCase() === activeEmail.toLowerCase()) {
            return true;
        }
        return false;
    }
    log(level, message) {
        this.logger?.appendLine(`[${level}] [accounts] ${message}`);
    }
    normalizeSharedJson(value) {
        if (!value || typeof value !== "object") {
            return undefined;
        }
        const candidate = value;
        if (candidate.tokens?.idToken && candidate.tokens?.accessToken) {
            return candidate;
        }
        if (candidate.id_token && candidate.access_token) {
            return {
                email: candidate.email,
                id: candidate.id,
                tokens: {
                    idToken: candidate.id_token,
                    accessToken: candidate.access_token,
                    refreshToken: candidate.refresh_token,
                    accountId: candidate.account_id
                }
            };
        }
        return undefined;
    }
}
exports.AccountsStore = AccountsStore;
//# sourceMappingURL=accounts.js.map