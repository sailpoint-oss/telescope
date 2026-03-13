#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
	const args = {
		out: "",
		telescopeOutput: "",
		extensionHost: "",
		serverLog: "",
	};

	for (let i = 2; i < argv.length; i++) {
		const current = argv[i];
		const next = argv[i + 1];
		if ((current === "--out" || current === "-o") && next) {
			args.out = next;
			i++;
			continue;
		}
		if (current === "--telescope-output" && next) {
			args.telescopeOutput = next;
			i++;
			continue;
		}
		if (current === "--extension-host" && next) {
			args.extensionHost = next;
			i++;
			continue;
		}
		if (current === "--server-log" && next) {
			args.serverLog = next;
			i++;
			continue;
		}
	}

	if (!args.out) {
		throw new Error("missing required --out");
	}
	return args;
}

function parseTimestamp(line) {
	const patterns = [
		/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/,
		/time=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/,
		/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]/,
	];

	for (const pattern of patterns) {
		const match = line.match(pattern);
		if (!match) continue;
		const raw = match[1] || match[0];
		const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
		const parsed = Date.parse(normalized);
		if (!Number.isNaN(parsed)) {
			return new Date(parsed).toISOString();
		}
	}
	return "";
}

function parseFile(filePath, source) {
	if (!filePath) return [];
	if (!fs.existsSync(filePath)) {
		throw new Error(`${source} file not found: ${filePath}`);
	}

	const content = fs.readFileSync(filePath, "utf8");
	const lines = content.split(/\r?\n/);
	const entries = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) continue;
		const ts = parseTimestamp(line);
		entries.push({
			ts,
			source,
			line: i + 1,
			message: line,
		});
	}
	return entries;
}

function main() {
	const args = parseArgs(process.argv);
	const merged = [
		...parseFile(args.telescopeOutput, "telescope-output"),
		...parseFile(args.extensionHost, "extension-host"),
		...parseFile(args.serverLog, "server-log"),
	];

	merged.sort((a, b) => {
		if (!a.ts && !b.ts) return 0;
		if (!a.ts) return 1;
		if (!b.ts) return -1;
		return a.ts.localeCompare(b.ts);
	});

	const outPath = path.resolve(args.out);
	const output = merged.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, output, "utf8");
	console.log(`wrote ${merged.length} entries to ${outPath}`);
}

main();
