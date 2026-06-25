#!/usr/bin/env node
// ============================================================================
// bump.js — Version bump helper for fm-server
//
// Detects the appropriate semver bump from git history, or accepts an explicit
// bump type as an argument. Delegates to `pnpm version` to update package.json
// and create the git tag.
//
// Usage:
//   node scripts/bump.js [patch|minor|major|<version>]
//
// When no argument is provided, auto-detects from commits since the last tag:
//   - BREAKING CHANGE or feat!: → major
//   - feat: or feat(scope): → minor
//   - Otherwise → minor (default)
// ============================================================================

import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(__dirname);

const C = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
};

function exec(command) {
	try {
		return execSync(command, { encoding: "utf-8", cwd: ROOT_DIR }).trim();
	} catch {
		return null;
	}
}

function detectBumpStrategy() {
	const lastTag = exec("git describe --tags --abbrev=0 2>/dev/null");
	const range = lastTag ? `${lastTag}..HEAD` : "HEAD~20..HEAD";
	const log = exec(`git log ${range} --pretty=format:"%s%n%b"`) || "";

	if (/BREAKING CHANGE|^.+!:/m.test(log)) return "major";
	if (/^feat(\(.+\))?:/m.test(log)) return "minor";
	return "minor";
}

function main() {
	const arg = process.argv[2];
	const validBumps = ["patch", "minor", "major"];

	let bump;
	if (!arg) {
		bump = detectBumpStrategy();
		console.log(
			`${C.blue}[BUMP]${C.reset} Auto-detected: ${C.green}${bump}${C.reset}`,
		);
	} else if (validBumps.includes(arg)) {
		bump = arg;
		console.log(
			`${C.blue}[BUMP]${C.reset} Explicit: ${C.green}${bump}${C.reset}`,
		);
	} else if (/^\d+\.\d+\.\d+/.test(arg)) {
		bump = arg;
		console.log(
			`${C.blue}[BUMP]${C.reset} Explicit version: ${C.green}${bump}${C.reset}`,
		);
	} else {
		console.error(
			`${C.yellow}Usage: node scripts/bump.js [patch|minor|major|<version>]${C.reset}`,
		);
		process.exit(1);
	}

	console.log(
		`${C.blue}[BUMP]${C.reset} Running: pnpm version ${bump} --no-git-tag-version`,
	);

	try {
		const result = execSync(`pnpm version ${bump} --no-git-tag-version`, {
			encoding: "utf-8",
			cwd: ROOT_DIR,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		const version = result.replace(/^v/, "");
		console.log(
			`${C.green}[BUMP]${C.reset} Version bumped to ${C.green}${version}${C.reset}`,
		);
		console.log(
			`${C.blue}[BUMP]${C.reset} Next: commit, tag, and run ${C.yellow}pnpm run release:publish${C.reset}`,
		);
	} catch (error) {
		console.error(`Failed to bump version: ${error.message}`);
		process.exit(1);
	}
}

main();
