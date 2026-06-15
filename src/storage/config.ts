import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { StorageMode } from "../types";

export interface AppConfig {
  storageMode: StorageMode;
  warnedStorageRisk: boolean;
}

const CONFIG_FILE = "config.json";

export function defaultConfig(): AppConfig {
  return { storageMode: "keychain", warnedStorageRisk: false };
}

export function normalizeConfig(config?: Partial<AppConfig>): AppConfig {
  return {
    storageMode: config?.storageMode === "plaintext" ? "plaintext" : "keychain",
    warnedStorageRisk: config?.warnedStorageRisk === true
  };
}

export class ConfigStore {
  private readonly configPath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.configPath = path.join(context.globalStorageUri.fsPath, CONFIG_FILE);
  }

  async read(): Promise<AppConfig> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return normalizeConfig(parsed);
    } catch {
      const config = defaultConfig();
      await this.write(config);
      return config;
    }
  }

  async write(config: AppConfig): Promise<void> {
    await fs.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf8");
  }
}
