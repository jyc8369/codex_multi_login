import { cp, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "src", "webview");
const targetDir = path.join(rootDir, "out", "webview");
const extensionOutDir = path.join(rootDir, "extension", "out");

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
await mkdir(extensionOutDir, { recursive: true });
await cp(path.join(rootDir, "out"), extensionOutDir, { recursive: true });
