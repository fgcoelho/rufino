import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import React from "react";
import type { ResourceRenderable, SceneRenderable } from "../core/types.ts";
import {
	type IrBatch,
	serializeResourceDocument,
	serializeSceneDocument,
} from "./ir.ts";

const rootDir = process.cwd();
const godotScriptPath = resolve(rootDir, "lib/gdx/godot/build_from_ir.gd");

async function walk(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				return walk(fullPath);
			}

			return [fullPath];
		}),
	);

	return files.flat();
}

function toResPath(filePath: string): string {
	const relativePath = relative(rootDir, filePath).replaceAll("\\", "/");
	return `res://${relativePath}`;
}

function resolveSiblingOutput(sourceFile: string): string {
	if (sourceFile.endsWith(".scene.tsx")) {
		return sourceFile.replace(/\.scene\.tsx$/, ".tscn");
	}

	if (sourceFile.endsWith(".tres.tsx")) {
		return sourceFile.replace(/\.tres\.tsx$/, ".tres");
	}

	throw new Error(`Unsupported generated source file: ${sourceFile}`);
}

function isGeneratedSourceFile(filePath: string) {
	return filePath.endsWith(".scene.tsx") || filePath.endsWith(".tres.tsx");
}

async function resolveInputToFiles(inputPath: string): Promise<string[]> {
	const normalized = inputPath.replaceAll("\\", "/");
	if (/[*?{}()[\]]/.test(normalized)) {
		return glob(normalized, {
			cwd: rootDir,
			nodir: true,
			absolute: true,
			posix: false,
		});
	}

	const absolutePath = resolve(rootDir, inputPath);
	const stats = await stat(absolutePath);
	if (stats.isDirectory()) {
		const files = await walk(absolutePath);
		return files.filter(isGeneratedSourceFile);
	}

	return isGeneratedSourceFile(absolutePath) ? [absolutePath] : [];
}

export async function collectGeneratedSourceFiles(
	inputs: string[] = [],
): Promise<string[]> {
	if (inputs.length === 0) {
		return glob(
			[
				"src/**/*.scene.tsx",
				"src/**/*.tres.tsx",
				"lib/**/*.scene.tsx",
				"lib/**/*.tres.tsx",
			],
			{
				cwd: rootDir,
				nodir: true,
				absolute: true,
				posix: false,
			},
		);
	}

	const resolved = await Promise.all(
		inputs.map((input) => resolveInputToFiles(input)),
	);
	return Array.from(
		new Set(resolved.flat().filter(isGeneratedSourceFile)),
	).sort((a, b) => a.localeCompare(b));
}

function resolveGodotExecutables(): string[] {
	const configured = [process.env.GODOT_BIN, process.env.GODOT].filter(
		(value): value is string => Boolean(value),
	);
	return [
		...configured,
		resolve(rootDir, ".engine/launcher"),
		"godot4",
		"godot",
	];
}

function tryRunGodot(executable: string, irBatchPath: string): Promise<void> {
	const args = [
		"--headless",
		"--path",
		rootDir,
		"--script",
		godotScriptPath,
		"--",
		irBatchPath,
	];

	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(executable, args, { cwd: rootDir, stdio: "inherit" });

		child.on("error", (error) => {
			rejectPromise(
				new Error(
					`Failed to start Godot executable ${JSON.stringify(executable)}. Set GODOT_BIN to your Godot 4.6 binary.`,
					{ cause: error },
				),
			);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}

			rejectPromise(
				new Error(`Godot build script exited with code ${code ?? "unknown"}.`),
			);
		});
	});
}

async function runGodot(irBatchPath: string): Promise<void> {
	const attempted = new Set<string>();
	let lastError: unknown = null;

	for (const executable of resolveGodotExecutables()) {
		if (attempted.has(executable)) {
			continue;
		}

		attempted.add(executable);

		try {
			await tryRunGodot(executable, irBatchPath);
			return;
		} catch (error) {
			lastError = error;
			const cause = error instanceof Error ? error.cause : null;
			if (
				!(cause instanceof Error) ||
				!("code" in cause) ||
				cause.code !== "ENOENT"
			) {
				throw error;
			}
		}
	}

	throw new Error(
		`Failed to start a Godot executable. Tried: ${Array.from(attempted).join(", ")}. Set GODOT_BIN to your Godot 4.6 binary.`,
		{ cause: lastError instanceof Error ? lastError : undefined },
	);
}

async function loadModuleDefault(sourceFile: string): Promise<unknown> {
	const moduleUrl = pathToFileURL(sourceFile).href;
	const loadedModule = await import(moduleUrl);
	if (!("default" in loadedModule)) {
		throw new Error(
			`Generated source file is missing a default export: ${sourceFile}`,
		);
	}

	return loadedModule.default;
}

export async function createBatch(sourceFiles: string[]): Promise<IrBatch> {
	const documents = [] as IrBatch["documents"];

	for (const sourceFile of sourceFiles) {
		const defaultExport = await loadModuleDefault(sourceFile);
		const outputPath = toResPath(resolveSiblingOutput(sourceFile));

		if (sourceFile.endsWith(".scene.tsx")) {
			const renderable =
				typeof defaultExport === "function"
					? (React.createElement(
							defaultExport as React.ComponentType,
						) as SceneRenderable)
					: (defaultExport as SceneRenderable);
			documents.push(serializeSceneDocument(renderable, outputPath));
			continue;
		}

		const renderable =
			typeof defaultExport === "function"
				? (React.createElement(
						defaultExport as React.ComponentType,
					) as ResourceRenderable)
				: (defaultExport as ResourceRenderable);
		documents.push(serializeResourceDocument(renderable, outputPath));
	}

	return {
		version: 1,
		documents,
	};
}

export async function runGenerateBuild(inputs: string[] = []) {
	const generatedFiles = await collectGeneratedSourceFiles(inputs);
	if (generatedFiles.length === 0) {
		return 0;
	}

	const batch = await createBatch(generatedFiles);
	const tempDirectory = await mkdtemp(join(tmpdir(), "gdx-build-"));
	const batchPath = resolve(tempDirectory, "batch.json");

	try {
		await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
		await runGodot(batchPath);
	} finally {
		await rm(tempDirectory, { recursive: true, force: true });
	}

	return generatedFiles.length;
}

const invokedAsEntryPoint = process.argv[1]
	? pathToFileURL(process.argv[1]).href === import.meta.url
	: false;

if (invokedAsEntryPoint) {
	runGenerateBuild().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
