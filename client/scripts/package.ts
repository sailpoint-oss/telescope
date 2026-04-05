import { execSync } from "node:child_process";
import {
	existsSync,
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

function parseArg(flag: string): string | undefined {
	const idx = process.argv.findIndex((arg) => arg.startsWith(flag));
	if (idx === -1) return undefined;
	const arg = process.argv[idx];
	if (arg.includes("=")) return arg.split("=")[1];
	return process.argv[idx + 1];
}

const target = parseArg("--target");
const platform = parseArg("--platform");

const validTargets = ["vscode", "openvsx"] as const;
const validPlatforms = [
	"darwin-arm64",
	"darwin-x64",
	"linux-x64",
	"linux-arm64",
	"win32-x64",
	"win32-arm64",
	"alpine-x64",
	"alpine-arm64",
	"universal",
] as const;

if (!target || !validTargets.includes(target as (typeof validTargets)[number])) {
	console.error(
		"Usage: bun scripts/package.ts --target <vscode|openvsx> [--platform <platform|universal>]",
	);
	console.error(`  Platforms: ${validPlatforms.join(", ")}`);
	process.exit(1);
}

if (platform && !validPlatforms.includes(platform as (typeof validPlatforms)[number])) {
	console.error(`Invalid platform: ${platform}`);
	console.error(`  Valid platforms: ${validPlatforms.join(", ")}`);
	process.exit(1);
}

const configs = {
	vscode: {
		publisher: "SailPointTechnologies",
		name: "telescope-openapi",
	},
	openvsx: {
		publisher: "sailpoint",
		name: "telescope",
	},
};

const platformLabel = platform ?? "universal";
console.log(
	`Packaging for ${target.toUpperCase()} marketplace (${platformLabel})...`,
);

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const originalPublisher = packageJson.publisher;
const originalName = packageJson.name;

const config = configs[target as keyof typeof configs];
packageJson.publisher = config.publisher;
packageJson.name = config.name;

console.log(`  Publisher: ${config.publisher}`);
console.log(`  Name: ${config.name}`);

writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, "\t") + "\n");

try {
	const packageDir = join(__dirname, "..");
	const sidecarBundlePath = join(packageDir, "sidecar", "runner.js");
	const beforeTime = Date.now();

	if (!existsSync(sidecarBundlePath)) {
		throw new Error(
			`Bundled Bun sidecar missing at ${sidecarBundlePath}. Run 'pnpm run build:sidecar' before packaging.`,
		);
	}

	const vsceArgs = ["vsce", "package", "--no-dependencies"];
	if (platform && platform !== "universal") {
		vsceArgs.push("--target", platform);
	}

	console.log(`  Running ${vsceArgs.join(" ")}...`);
	execSync(vsceArgs.join(" "), {
		cwd: packageDir,
		stdio: "inherit",
	});

	const version = packageJson.version;
	const files = readdirSync(packageDir);
	const vsixFiles = files
		.filter((f) => f.endsWith(".vsix"))
		.map((f) => ({
			name: f,
			path: join(packageDir, f),
			mtime: statSync(join(packageDir, f)).mtimeMs,
		}))
		.filter((f) => f.mtime >= beforeTime - 1000)
		.sort((a, b) => b.mtime - a.mtime);

	if (vsixFiles.length === 0) {
		throw new Error("No VSIX file was created");
	}

	const generatedVsix = vsixFiles[0];
	const suffix = platform && platform !== "universal" ? `-${platform}` : "";
	const renamedVsixName = `telescope-${target}${suffix}-${version}.vsix`;
	const renamedVsixPath = join(packageDir, renamedVsixName);

	renameSync(generatedVsix.path, renamedVsixPath);

	console.log(`Created ${renamedVsixName}`);
} finally {
	packageJson.publisher = originalPublisher;
	packageJson.name = originalName;
	writeFileSync(
		packageJsonPath,
		JSON.stringify(packageJson, null, "\t") + "\n",
	);
	console.log("  Restored original package.json");
}
