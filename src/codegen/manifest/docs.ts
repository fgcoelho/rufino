import { spawn } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = resolve(process.cwd());
const generatedDocsRoot = resolve(rootDir, "generated/docs");

export interface ManifestDocsContext {
	docsRoot: string;
	sourceRoot: string | null;
	cleanup(): Promise<void>;
}

const SHARED_DOCS_ROOT_ENV = "rufino_GODOT_DOCS_ROOT";

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function removeDirectory(path: string): Promise<void> {
	await rm(path, {
		recursive: true,
		force: true,
		maxRetries: 10,
		retryDelay: 50,
	});
}

function resolveGodotExecutables(preferredRoot: string | null): string[] {
	const configured = [process.env.GODOT_BIN, process.env.GODOT].filter(
		(value): value is string => Boolean(value),
	);
	const preferredBinary = preferredRoot
		? resolve(preferredRoot, "binary")
		: null;

	return Array.from(
		new Set([
			...configured,
			...(preferredBinary ? [preferredBinary] : []),
			resolve(rootDir, "engine/binary"),
			"godot4",
			"godot",
		]),
	);
}

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			cwd: rootDir,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});

		child.on("error", rejectPromise);
		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}

			rejectPromise(
				new Error(
					`${command} ${args.join(" ")} exited with code ${code}\n${output}`.trim(),
				),
			);
		});
	});
}

async function resolveSourceRoot(
	engineArg: string | undefined,
): Promise<string | null> {
	const candidate = resolve(
		engineArg ?? process.env.GODOT_ENGINE_ROOT ?? "engine",
	);
	if (await pathExists(resolve(candidate, "doc/classes"))) {
		return candidate;
	}

	return null;
}

export async function resolveManifestDocs(
	engineArg: string | undefined,
): Promise<ManifestDocsContext> {
	const sharedDocsRoot = process.env[SHARED_DOCS_ROOT_ENV];
	const sourceRoot = await resolveSourceRoot(engineArg);
	if (sharedDocsRoot) {
		return {
			docsRoot: resolve(sharedDocsRoot),
			sourceRoot,
			cleanup: async () => {},
		};
	}

	if (sourceRoot) {
		return {
			docsRoot: sourceRoot,
			sourceRoot,
			cleanup: async () => {},
		};
	}

	const preferredRoot = resolve(
		engineArg ?? process.env.GODOT_ENGINE_ROOT ?? "engine",
	);
	await removeDirectory(generatedDocsRoot);
	await mkdir(generatedDocsRoot, { recursive: true });
	let lastError: unknown = null;

	try {
		for (const executable of resolveGodotExecutables(preferredRoot)) {
			try {
				await run(executable, [
					"--headless",
					"--doctool",
					generatedDocsRoot,
					"--quit",
				]);
				return {
					docsRoot: generatedDocsRoot,
					sourceRoot: null,
					cleanup: async () => {},
				};
			} catch (error) {
				lastError = error;
				if (
					!(error instanceof Error) ||
					!("code" in error) ||
					error.code !== "ENOENT"
				) {
					throw error;
				}
			}
		}

		throw new Error(
			`Failed to start a Godot executable for doctool generation. Tried: ${resolveGodotExecutables(preferredRoot).join(", ")}. Set GODOT_BIN to your Godot 4.6 binary.`,
			{ cause: lastError },
		);
	} catch (error) {
		await removeDirectory(generatedDocsRoot);
		throw error;
	}
}

export { SHARED_DOCS_ROOT_ENV };
