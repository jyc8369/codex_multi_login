import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { readAuthFile, writeAuthFile } from "../codex/authFile";
import { refreshTokens } from "../auth/oauth";
import { refreshQuota } from "../services/quota";
import { extractClaims, isTokenExpired } from "../utils/jwt";
import {
  CodexAccountRecord,
  CodexTokens,
  SharedCodexAccountJson,
  StorageMode,
  StoredAccountRecord
} from "../types";

interface AccountIndex {
  currentAccountId?: string;
  accounts: StoredAccountRecord[];
}

interface StoredTokenRecord {
  tokens: CodexTokens;
  email?: string;
}

const ACCOUNT_FILE = "account.json";
const TOKENS_FILE = "tokens.json";
const STORAGE_MODE_KEY = "codexMultiLogin.storageMode";
const TOKEN_SECRET_PREFIX = "codexMultiLogin.tokens.";

export class AccountsStore {
  private readonly accountPath: string;
  private readonly tokensPath: string;
  private activeAccountIdFromAuthFile: string | undefined;
  private activeEmailFromAuthFile: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger?: { appendLine(message: string): void }
  ) {
    this.accountPath = path.join(context.globalStorageUri.fsPath, ACCOUNT_FILE);
    this.tokensPath = path.join(context.globalStorageUri.fsPath, TOKENS_FILE);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
    await this.syncActiveAccountFromAuthFile();
    await this.ensureAccountFiles();
    await this.migrateStorageIfNeeded();
    this.log(
      "info",
      `init storage=${this.context.globalStorageUri.fsPath} mode=${this.getConfiguredStorageMode()} backend=${await this.getStorageBackend()} accountFile=${this.accountPath}`
    );
  }

  getStorageMode(): StorageMode {
    return this.getConfiguredStorageMode();
  }

  async updateStorageMode(mode: StorageMode): Promise<void> {
    this.log("info", `updateStorageMode requested mode=${mode}`);
    await this.context.globalState.update(STORAGE_MODE_KEY, mode);
    await this.migrateStorageIfNeeded(true);
  }

  async list(): Promise<CodexAccountRecord[]> {
    return await this.readIndex();
  }

  async purgeMissingCredentials(): Promise<number> {
    const index = await this.readIndex();
    const missing = index.filter((account) => account.credentialsMissing);
    if (!missing.length) {
      return 0;
    }

    const remaining = index.filter((account) => !account.credentialsMissing);
    await this.writeIndex(
      remaining.map((item) => this.stripTokens(item)),
      this.findCurrentAccountId(remaining)
    );

    for (const account of missing) {
      await this.context.secrets.delete(this.storageKeyForAccount(account));
      await this.deletePlaintextToken(account);
    }

    this.log("warn", `purgeMissingCredentials removed=${missing.length}`);
    return missing.length;
  }

  async addTokens(tokens: CodexTokens, markActive = true): Promise<CodexAccountRecord> {
    const claims = extractClaims(tokens.idToken, tokens.accessToken);
    const index = await this.readIndex();
    const email = claims.email ?? tokens.accountId ?? "unknown";
    const id = `${email}:${claims.accountId ?? tokens.accountId ?? "account"}`;
    const storageKey = this.secretKey(id);
    const now = Date.now();
    const record: CodexAccountRecord = {
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
      await writeAuthFile(tokens, record.email);
      this.activeAccountIdFromAuthFile = tokens.accountId;
      this.activeEmailFromAuthFile = record.email;
      this.log("info", `addTokens active email=${record.email} accountId=${tokens.accountId ?? "unknown"}`);
    }
    this.log("info", `addTokens saved id=${id} email=${record.email} active=${markActive}`);
    return record;
  }

  async importCurrentAuth(): Promise<CodexAccountRecord | undefined> {
    const auth = await readAuthFile();
    if (!auth) {
      this.log("warn", "importCurrentAuth skipped reason=no_auth_file");
      return undefined;
    }
    return this.addTokens(
      {
        idToken: auth.tokens.id_token,
        accessToken: auth.tokens.access_token,
        refreshToken: auth.tokens.refresh_token,
        accountId: auth.tokens.account_id
      },
      true
    );
  }

  async importFromJsonFile(filePath: string): Promise<CodexAccountRecord[]> {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const imported: CodexAccountRecord[] = [];
    for (const entry of entries) {
      const shared = this.normalizeSharedJson(entry);
      if (!shared?.tokens) {
        continue;
      }
      imported.push(await this.addTokens(shared.tokens, false));
    }
    return imported;
  }

  async exportToJsonFile(filePath: string): Promise<void> {
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

  async switchAccount(accountId: string): Promise<CodexAccountRecord | undefined> {
    const index = await this.readIndex();
    const record = index.find((item) => item.id === accountId);
    if (!record?.tokens) {
      this.log("warn", `switchAccount skipped id=${accountId} reason=missing_record`);
      return undefined;
    }
    await writeAuthFile(record.tokens, record.email);
    this.log("info", `switchAccount wrote auth.json email=${record.email} accountId=${record.accountId ?? "unknown"}`);
    await this.writeIndex(
      index.map((item) =>
        this.stripTokens({
          ...item,
          isActive: item.id === accountId,
          updatedAt: item.id === accountId ? Date.now() : item.updatedAt
        })
      ),
      accountId
    );
    return record;
  }

  async deleteAccount(accountId: string): Promise<CodexAccountRecord | undefined> {
    const index = await this.readIndex();
    const record = index.find((item) => item.id === accountId);
    if (!record) {
      return undefined;
    }

    const remaining = index.filter((item) => item.id !== accountId);
    const nextCurrentAccountId =
      record.id === accountId ? remaining.find((item) => item.id !== accountId)?.id : undefined;

    await this.writeIndex(
      remaining.map((item) =>
        this.stripTokens({
          ...item,
          isActive: item.id === nextCurrentAccountId
        })
      ),
      nextCurrentAccountId
    );
    await this.deleteTokens(record);

    if (record.isActive) {
      const nextActive = remaining.find((item) => item.id === nextCurrentAccountId);
      if (nextActive?.tokens) {
        await writeAuthFile(nextActive.tokens, nextActive.email);
        this.activeAccountIdFromAuthFile = nextActive.tokens.accountId;
        this.activeEmailFromAuthFile = nextActive.email;
        this.log("info", `deleteAccount rotated auth.json email=${nextActive.email} accountId=${nextActive.accountId ?? "unknown"}`);
      }
    }

    return this.rehydrateRecord(record);
  }

  async moveAccount(
    accountId: string,
    targetAccountId: string,
    placement: "before" | "after"
  ): Promise<CodexAccountRecord[] | undefined> {
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

  async refreshAccount(
    accountId: string,
    logger?: { appendLine(message: string): void }
  ): Promise<CodexAccountRecord | undefined> {
    try {
      const index = await this.readIndex();
      const record = index.find((item) => item.id === accountId);
      if (!record?.tokens) {
        this.log("warn", `refreshAccount skipped id=${accountId} reason=missing_tokens`);
        return undefined;
      }
      this.log("info", `refreshAccount start id=${record.id} email=${record.email} active=${record.isActive}`);

      let tokens = record.tokens;
      if (tokens.refreshToken && isTokenExpired(tokens.accessToken)) {
        this.log("info", `refreshAccount refreshToken id=${record.id}`);
        tokens = await refreshTokens(tokens.refreshToken);
      }

      this.log("info", `refreshAccount fetchQuota id=${record.id}`);
      const quotaSummary = await refreshQuota(tokens, logger);
      const updated: CodexAccountRecord = {
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
        await writeAuthFile(tokens, record.email);
      }
      this.log("info", `refreshAccount done id=${record.id} email=${record.email}`);
      return updated;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.log("error", `refreshAccount failed id=${accountId} error=${message}`);
      throw error;
    }
  }

  async refreshAll(logger?: { appendLine(message: string): void }): Promise<CodexAccountRecord[]> {
    const index = await this.readIndex();
    const updated: CodexAccountRecord[] = [];
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

  private async readIndex(): Promise<CodexAccountRecord[]> {
    try {
      const meta = await this.readIndexMeta();
      const storedTokens = await this.readStoredTokens(meta.accounts);
      const activeAccountId = this.activeAccountIdFromAuthFile;
      const activeEmail = this.activeEmailFromAuthFile;
    const hydrated = meta.accounts.map((account) => {
      const key = this.storageKeyForAccount(account);
      const stored = storedTokens[key] ?? storedTokens[account.id];
      return this.hydrateRecord(
        account,
        stored?.tokens,
        stored?.email ?? account.email,
        activeAccountId,
        activeEmail
      );
    });
      this.log(
        "info",
        `readIndex accounts=${hydrated.length} activeAccountId=${activeAccountId ?? "none"} activeEmail=${activeEmail ?? "none"}`
      );
      return hydrated;
    } catch {
      return [];
    }
  }

  private async writeIndex(accounts: StoredAccountRecord[], currentAccountId?: string): Promise<void> {
    const payload: AccountIndex = { currentAccountId, accounts };
    await this.writeIndexFile(this.accountPath, payload);
  }

  private async readIndexMeta(): Promise<AccountIndex> {
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

  private async ensureAccountFiles(): Promise<void> {
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

  private async readIndexFile(filePath: string): Promise<AccountIndex | undefined> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as AccountIndex;
      return {
        currentAccountId: parsed.currentAccountId,
        accounts: Array.isArray(parsed.accounts)
          ? parsed.accounts.map((account) => ({
              ...account,
              storageKey: account.storageKey ?? this.secretKey(account.id)
            }))
          : []
      };
    } catch {
      return undefined;
    }
  }

  private async writeIndexFile(filePath: string, payload: AccountIndex): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  private async writeTokens(account: Pick<StoredAccountRecord, "id" | "storageKey">, tokens: CodexTokens, email?: string): Promise<void> {
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

  private async deleteTokens(account: Pick<StoredAccountRecord, "id" | "storageKey">): Promise<void> {
    const storageKey = this.storageKeyForAccount(account);
    await this.context.secrets.delete(storageKey);
    await this.deletePlaintextToken(account);
  }

  private async deletePlaintextToken(account: Pick<StoredAccountRecord, "id" | "storageKey">): Promise<void> {
    const current = await this.readPlaintextTokens();
    const storageKey = this.storageKeyForAccount(account);
    if (current[storageKey] || current[account.id]) {
      delete current[storageKey];
      delete current[account.id];
      await fs.writeFile(this.tokensPath, JSON.stringify(current, null, 2), "utf8");
    }
  }

  private async readStoredTokens(accounts?: StoredAccountRecord[]): Promise<Record<string, StoredTokenRecord>> {
    const mode = await this.getStorageBackend();
    if (mode === "keychain") {
      return this.readKeychainTokens(accounts);
    }
    return this.readPlaintextTokens();
  }

  private async readPlaintextTokens(): Promise<Record<string, StoredTokenRecord>> {
    try {
      const raw = await fs.readFile(this.tokensPath, "utf8");
      return JSON.parse(raw) as Record<string, StoredTokenRecord>;
    } catch {
      return {};
    }
  }

  private async readKeychainTokens(accounts?: StoredAccountRecord[]): Promise<Record<string, StoredTokenRecord>> {
    const result: Record<string, StoredTokenRecord> = {};
    const resolvedAccounts = accounts ?? (await this.readIndexMeta()).accounts;
    for (const account of resolvedAccounts) {
      const storageKey = this.storageKeyForAccount(account);
      const raw = await this.context.secrets.get(storageKey);
      if (!raw) {
        continue;
      }
      try {
        result[storageKey] = JSON.parse(raw) as StoredTokenRecord;
      } catch {
        this.log("warn", `readKeychainTokens invalid payload id=${account.id} key=${storageKey}`);
      }
    }
    return result;
  }

  private async syncActiveAccountFromAuthFile(): Promise<void> {
    const auth = await readAuthFile();
    this.activeAccountIdFromAuthFile = auth?.tokens.account_id;
    this.activeEmailFromAuthFile = auth?.email;
    this.log(
      "info",
      `syncActiveAccountFromAuthFile accountId=${this.activeAccountIdFromAuthFile ?? "none"} email=${this.activeEmailFromAuthFile ?? "none"}`
    );
  }

  private async migrateStorageIfNeeded(force = false): Promise<void> {
    const mode = this.getConfiguredStorageMode();
    const meta = await this.readIndexMeta().catch(() => ({ currentAccountId: undefined, accounts: [] }));
    const hasPlaintext = await this.hasPlaintextTokens();
    const hasKeychain = await this.hasKeychainTokens();
    const currentMode: StorageMode = hasKeychain && !hasPlaintext ? "keychain" : hasPlaintext && !hasKeychain ? "plaintext" : mode;
    this.log(
      "info",
      `migrateStorageIfNeeded mode=${mode} current=${currentMode} hasKeychain=${hasKeychain} hasPlaintext=${hasPlaintext} force=${force}`
    );
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
      if (!record?.tokens) continue;
      await this.writeTokens(account, record.tokens, record.email ?? account.email);
    }
    if (mode === "keychain") {
      await fs.rm(this.tokensPath, { force: true });
    } else {
      for (const account of index) {
        await this.context.secrets.delete(this.storageKeyForAccount(account));
      }
    }
    this.log("info", `migrateStorageIfNeeded from=${currentMode} to=${mode} count=${index.length}`);
  }

  private async hasPlaintextTokens(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.tokensPath, "utf8");
      return raw.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async hasKeychainTokens(): Promise<boolean> {
    const index = await this.readIndexMeta();
    for (const account of index.accounts) {
      if (await this.context.secrets.get(this.storageKeyForAccount(account))) {
        return true;
      }
    }
    return false;
  }

  private getConfiguredStorageMode(): StorageMode {
    return this.context.globalState.get(STORAGE_MODE_KEY) === "plaintext" ? "plaintext" : "keychain";
  }

  private async getStorageBackend(): Promise<StorageMode> {
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

  private secretKey(accountId: string): string {
    return `${TOKEN_SECRET_PREFIX}${accountId}`;
  }

  private storageKeyForAccount(account: Pick<StoredAccountRecord, "id" | "storageKey">): string {
    return account.storageKey ?? this.secretKey(account.id);
  }

  private hydrateRecord(
    stored: StoredAccountRecord,
    tokens: CodexTokens | undefined,
    email: string,
    activeAccountId: string | undefined,
    activeEmail: string | undefined
  ): CodexAccountRecord {
    const account: CodexAccountRecord = {
      ...stored,
      email,
      tokens,
      credentialsMissing: !tokens,
      isActive: this.matchesActiveIdentity(
        { email, accountId: stored.accountId },
        activeAccountId,
        activeEmail
      )
    };
    return account;
  }

  private stripTokens(account: CodexAccountRecord): StoredAccountRecord {
    // Persist metadata only; tokens live in the selected storage backend.
    const { tokens: _tokens, credentialsMissing: _credentialsMissing, ...rest } = account;
    return {
      ...rest,
      storageKey: rest.storageKey ?? this.secretKey(rest.id)
    };
  }

  private rehydrateRecord(stored: StoredAccountRecord): CodexAccountRecord {
    return {
      ...stored,
      tokens: undefined,
      isActive: this.matchesActiveIdentity(stored as CodexAccountRecord, this.activeAccountIdFromAuthFile, this.activeEmailFromAuthFile)
    };
  }

  private findCurrentAccountId(accounts: StoredAccountRecord[]): string | undefined {
    return accounts.find((account) =>
      this.matchesActiveIdentity(
        { email: account.email, accountId: account.accountId },
        this.activeAccountIdFromAuthFile,
        this.activeEmailFromAuthFile
      )
    )?.id;
  }

  private matchesActiveIdentity(
    account: Pick<CodexAccountRecord, "accountId" | "email">,
    activeAccountId: string | undefined,
    activeEmail: string | undefined
  ): boolean {
    if (activeAccountId && account.accountId === activeAccountId) {
      return true;
    }
    if (activeEmail && account.email.toLowerCase() === activeEmail.toLowerCase()) {
      return true;
    }
    return false;
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    this.logger?.appendLine(`[${level}] [accounts] ${message}`);
  }

  private normalizeSharedJson(value: unknown): SharedCodexAccountJson | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    const candidate = value as SharedCodexAccountJson & {
      id_token?: string;
      access_token?: string;
      refresh_token?: string;
      account_id?: string;
    };
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
