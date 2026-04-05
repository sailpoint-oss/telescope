import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const clientDir = join(__dirname, "..");
const sourcePath = join(
	__dirname,
	"..",
	"..",
	"server",
	"lsp",
	"bun",
	"runner",
	"dist",
	"runner.js",
);
const targetDir = join(clientDir, "sidecar");
const targetPath = join(targetDir, "runner.js");

if (!existsSync(sourcePath)) {
	console.error(`Bundled Bun sidecar not found: ${sourcePath}`);
	console.error("Run the Bun sidecar build before preparing the extension package.");
	process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(sourcePath, targetPath);

console.log(`Prepared bundled Bun sidecar at ${targetPath}`);
