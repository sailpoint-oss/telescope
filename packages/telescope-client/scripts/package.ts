import { execSync } from "node:child_process";
import {
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, "..", "package.json");

// Parse target argument
let target: string | undefined;
const targetArgIndex = process.argv.findIndex((arg) =>
	arg.startsWith("--target"),
);

if (targetArgIndex !== -1) {
	const targetArg = process.argv[targetArgIndex];
	// Handle --target=value format
	if (targetArg.includes("=")) {
		target = targetArg.split("=")[1];
	} else {
		// Handle --target value format (value is next argument)
		target = process.argv[targetArgIndex + 1];
	}
}

if (!target || (target !== "vscode" && target !== "openvsx")) {
	console.error("Usage: bun scripts/package.ts --target <vscode|openvsx>");
	process.exit(1);
}

// Marketplace configurations
const configs = {
	vscode: {
		publisher: "SailPointTechnologies",
		name: "Telescope OpenAPI",
	},
	openvsx: {
		publisher: "sailpoint",
		name: "telescope",
	},
};

console.log(`📦 Packaging for ${target.toUpperCase()} marketplace...`);

// Read current package.json
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

// Store original values
const originalPublisher = packageJson.publisher;
const originalName = packageJson.name;

// Modify package.json for target marketplace
const config = configs[target as keyof typeof configs];
packageJson.publisher = config.publisher;
packageJson.name = config.name;

console.log(`  Publisher: ${config.publisher}`);
console.log(`  Name: ${config.name}`);

// Write modified package.json
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, "\t") + "\n");

try {
	// Get timestamp before packaging to find the newly created file
	const packageDir = join(__dirname, "..");
	const beforeTime = Date.now();

	// Run vsce package
	console.log("  Running vsce package...");
	execSync("vsce package --no-dependencies", {
		cwd: packageDir,
		stdio: "inherit",
	});

	// Find the generated VSIX file (most recently created .vsix file)
	const version = packageJson.version;
	const files = readdirSync(packageDir);
	const vsixFiles = files
		.filter((f) => f.endsWith(".vsix"))
		.map((f) => ({
			name: f,
			path: join(packageDir, f),
			mtime: statSync(join(packageDir, f)).mtimeMs,
		}))
		.filter((f) => f.mtime >= beforeTime - 1000) // Allow 1 second buffer
		.sort((a, b) => b.mtime - a.mtime);

	if (vsixFiles.length === 0) {
		throw new Error("No VSIX file was created");
	}

	const generatedVsix = vsixFiles[0];
	const renamedVsixName = `telescope-${target}-${version}.vsix`;
	const renamedVsixPath = join(packageDir, renamedVsixName);

	// Rename using Node.js fs operations (cross-platform)
	renameSync(generatedVsix.path, renamedVsixPath);

	console.log(`✅ Created ${renamedVsixName}`);
} finally {
	// Always restore original package.json
	packageJson.publisher = originalPublisher;
	packageJson.name = originalName;
	writeFileSync(
		packageJsonPath,
		JSON.stringify(packageJson, null, "\t") + "\n",
	);
	console.log("  Restored original package.json");
}
