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
exports.ConfigStore = void 0;
exports.defaultConfig = defaultConfig;
exports.normalizeConfig = normalizeConfig;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const CONFIG_FILE = "config.json";
function defaultConfig() {
    return { storageMode: "keychain", warnedStorageRisk: false };
}
function normalizeConfig(config) {
    return {
        storageMode: config?.storageMode === "plaintext" ? "plaintext" : "keychain",
        warnedStorageRisk: config?.warnedStorageRisk === true
    };
}
class ConfigStore {
    constructor(context) {
        this.context = context;
        this.configPath = path.join(context.globalStorageUri.fsPath, CONFIG_FILE);
    }
    async read() {
        try {
            const raw = await fs.readFile(this.configPath, "utf8");
            const parsed = JSON.parse(raw);
            return normalizeConfig(parsed);
        }
        catch {
            const config = defaultConfig();
            await this.write(config);
            return config;
        }
    }
    async write(config) {
        await fs.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf8");
    }
}
exports.ConfigStore = ConfigStore;
//# sourceMappingURL=config.js.map