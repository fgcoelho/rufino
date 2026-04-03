import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob } from "glob";
import { tsImport } from "tsx/esm/api";
import { type AcutisConfig, loadConfig } from "../config.ts";
import { createElement } from "../core/jsx.ts";
import type {
	AcutisComponent,
	ResourceRenderable,
	SceneRenderable,
} from "../core/types.ts";
import {
	type IrBatch,
	serializeResourceDocument,
	serializeSceneDocument,
} from "./ir.ts";

const rootDir = process.cwd();

function resolveBundledGodotScriptPath(): string {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidatePaths = [
		resolve(moduleDir, "./build_from_ir.gd"),
		resolve(moduleDir, "../godot/build_from_ir.gd"),
		resolve(moduleDir, "./godot/build_from_ir.gd"),
	];

	for (const candidatePath of candidatePaths) {
		if (fs.existsSync(candidatePath)) {
			return candidatePath;
		}
	}

	throw new Error(
		`Unable to locate bundled Godot build script. Tried: ${candidatePaths.join(", ")}`,
	);
}

function resolveBundledGodotDevWrapperPath(): string {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidatePaths = [
		resolve(moduleDir, "./dev_wrapper.gd"),
		resolve(moduleDir, "../godot/dev_wrapper.gd"),
		resolve(moduleDir, "./godot/dev_wrapper.gd"),
	];

	for (const candidatePath of candidatePaths) {
		if (fs.existsSync(candidatePath)) {
			return candidatePath;
		}
	}

	throw new Error(
		`Unable to locate bundled Godot dev wrapper script. Tried: ${candidatePaths.join(", ")}`,
	);
}

function resolveBundledBatchWorkerPath(): string {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidatePaths = [
		resolve(moduleDir, "./create-batch-worker.cjs"),
		resolve(moduleDir, "./create-batch-worker.js"),
		resolve(moduleDir, "./create-batch-worker.ts"),
		resolve(moduleDir, "../build/create-batch-worker.cjs"),
		resolve(moduleDir, "../build/create-batch-worker.ts"),
	];

	for (const candidatePath of candidatePaths) {
		if (fs.existsSync(candidatePath)) {
			return candidatePath;
		}
	}

	throw new Error(
		`Unable to locate bundled batch worker. Tried: ${candidatePaths.join(", ")}`,
	);
}

const godotScriptPath = resolveBundledGodotScriptPath();
const godotDevWrapperPath = resolveBundledGodotDevWrapperPath();
const batchWorkerPath = resolveBundledBatchWorkerPath();
const PROJECT_FILE = "project.godot";
const MAX_CAPTURED_OUTPUT = 64 * 1024;
const DEV_WRAPPER_DIR = ".acutis/dev";

export type SceneTarget = {
	projectRoot: string;
	scenePath: string;
	engineBinary: string;
};

export type DevSessionState = {
	stateFilePath: string;
};

export type RunningGodotProcess = {
	child: ChildProcess;
	waitForExit: Promise<void>;
};

type CapturedProcessResult = {
	code: number | null;
	stdout: string;
	stderr: string;
};

type RunningCapturedProcess = {
	child: ChildProcess;
	stdout: () => string;
	stderr: () => string;
	waitForExit: Promise<CapturedProcessResult>;
};

type BatchWorkerRequest = {
	sourceFiles: string[];
	cacheBustKey?: string;
	responseFilePath: string;
};

function appendCapturedOutput(current: string, chunk: string): string {
	if (current.length >= MAX_CAPTURED_OUTPUT) {
		return current;
	}

	return `${current}${chunk}`.slice(0, MAX_CAPTURED_OUTPUT);
}

function formatCapturedOutput(stdout: string, stderr: string): string {
	const sections = [] as string[];

	if (stdout.trim().length > 0) {
		sections.push(`stdout:\n${stdout.trimEnd()}`);
	}

	if (stderr.trim().length > 0) {
		sections.push(`stderr:\n${stderr.trimEnd()}`);
	}

	return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function spawnCapturedProcess(
	executable: string,
	args: string[],
	projectRoot: string,
): Promise<CapturedProcessResult> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(executable, args, {
			cwd: projectRoot,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");

		child.stdout?.on("data", (chunk: string) => {
			stdout = appendCapturedOutput(stdout, chunk);
		});

		child.stderr?.on("data", (chunk: string) => {
			stderr = appendCapturedOutput(stderr, chunk);
		});

		child.on("error", (error) => {
			rejectPromise(error);
		});

		child.on("exit", (code) => {
			resolvePromise({ code, stdout, stderr });
		});
	});
}

function spawnTrackedProcess(
	executable: string,
	args: string[],
	projectRoot: string,
): Promise<RunningCapturedProcess> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(executable, args, {
			cwd: projectRoot,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let resolved = false;

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");

		child.stdout?.on("data", (chunk: string) => {
			stdout = appendCapturedOutput(stdout, chunk);
		});

		child.stderr?.on("data", (chunk: string) => {
			stderr = appendCapturedOutput(stderr, chunk);
		});

		child.once("error", (error) => {
			if (!resolved) {
				rejectPromise(error);
			}
		});

		child.once("spawn", () => {
			resolved = true;
			resolvePromise({
				child,
				stdout: () => stdout,
				stderr: () => stderr,
				waitForExit: new Promise((resolveExit, rejectExit) => {
					child.once("close", (code) => {
						if (code === 0) {
							resolveExit({ code, stdout, stderr });
							return;
						}

						rejectExit({
							code,
							stdout,
							stderr,
						} satisfies CapturedProcessResult);
					});
				}),
			});
		});
	});
}

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

function toResPath(filePath: string, projectRoot: string): string {
	const relativePath = relative(projectRoot, filePath).replaceAll("\\", "/");
	return `res://${relativePath}`;
}

function findProjectRootForFile(filePath: string): string {
	let currentDir = dirname(filePath);

	while (true) {
		if (fs.existsSync(resolve(currentDir, PROJECT_FILE))) {
			return currentDir;
		}

		if (currentDir === rootDir) {
			return rootDir;
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return rootDir;
		}

		currentDir = parentDir;
	}
}

function resolveProjectRoot(files: string[]): string {
	const projectRoots = Array.from(
		new Set(files.map((file) => findProjectRootForFile(file))),
	);

	if (projectRoots.length > 1) {
		throw new Error(
			`Generated files span multiple Godot project roots: ${projectRoots.join(", ")}`,
		);
	}

	return projectRoots[0] ?? rootDir;
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

export function resolveGeneratedOutputPath(sourceFile: string): string {
	return resolveSiblingOutput(sourceFile);
}

function isGeneratedSourceFile(filePath: string) {
	return filePath.endsWith(".scene.tsx") || filePath.endsWith(".tres.tsx");
}

function compareGeneratedSourceFiles(a: string, b: string): number {
	const aIsResource = a.endsWith(".tres.tsx");
	const bIsResource = b.endsWith(".tres.tsx");

	if (aIsResource !== bIsResource) {
		return aIsResource ? -1 : 1;
	}

	return a.localeCompare(b);
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
				"test/**/*.scene.tsx",
				"test/**/*.tres.tsx",
			],
			{
				cwd: rootDir,
				nodir: true,
				absolute: true,
				posix: false,
			},
		).then((files) => files.sort(compareGeneratedSourceFiles));
	}

	const resolved = await Promise.all(
		inputs.map((input) => resolveInputToFiles(input)),
	);
	return Array.from(
		new Set(resolved.flat().filter(isGeneratedSourceFile)),
	).sort(compareGeneratedSourceFiles);
}

export async function resolveSceneSourceFile(input: string): Promise<string> {
	const files = await collectGeneratedSourceFiles([input]);
	const sceneFiles = files.filter((file) => file.endsWith(".scene.tsx"));
	if (sceneFiles.length !== 1 || files.length !== 1) {
		throw new Error(
			`Expected exactly one .scene.tsx file. Matched: ${files.join(", ") || "none"}`,
		);
	}

	return sceneFiles[0];
}

function resolveGodotExecutables(): string[] {
	const configured = [process.env.GODOT_BIN, process.env.GODOT].filter(
		(value): value is string => Boolean(value),
	);
	return [...configured, resolve(rootDir, "engine/binary"), "godot4", "godot"];
}

function isAbsolutePath(filePath: string): boolean {
	return filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath);
}

function resolveConfiguredGodotExecutables(engineBinary: string): string[] {
	const configuredBinary = isAbsolutePath(engineBinary)
		? engineBinary
		: resolve(rootDir, engineBinary);

	return Array.from(new Set([configuredBinary, ...resolveGodotExecutables()]));
}

function tryRunGodot(
	executable: string,
	irBatchPath: string,
	projectRoot: string,
): Promise<void> {
	const args = [
		"--headless",
		"--quiet",
		"--no-header",
		"--path",
		projectRoot,
		"--script",
		godotScriptPath,
		"--",
		irBatchPath,
	];

	return new Promise((resolvePromise, rejectPromise) => {
		spawnCapturedProcess(executable, args, projectRoot)
			.then(({ code, stdout, stderr }) => {
				if (code === 0) {
					resolvePromise();
					return;
				}

				rejectPromise(
					new Error(
						`Godot build script exited with code ${code ?? "unknown"}.${formatCapturedOutput(stdout, stderr)}`,
					),
				);
			})
			.catch((error) => {
				rejectPromise(
					new Error(
						`Failed to start Godot executable ${JSON.stringify(executable)}. Set GODOT_BIN to your Godot 4.6 binary.`,
						{ cause: error },
					),
				);
			});
	});
}

async function runGodot(
	irBatchPath: string,
	engineBinary: string,
	projectRoot: string,
): Promise<void> {
	const attempted = new Set<string>();
	let lastError: unknown = null;

	for (const executable of resolveConfiguredGodotExecutables(engineBinary)) {
		if (attempted.has(executable)) {
			continue;
		}

		attempted.add(executable);

		try {
			await tryRunGodot(executable, irBatchPath, projectRoot);
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
		`Failed to start a Godot executable. Tried: ${Array.from(attempted).join(", ")}. Set engineBinary in acutis.config.json or GODOT_BIN to your Godot 4.6 binary.`,
		{ cause: lastError instanceof Error ? lastError : undefined },
	);
}

function tryLaunchScene(
	executable: string,
	projectRoot: string,
	scenePath: string,
): Promise<void> {
	const args = ["--path", projectRoot, "--scene", scenePath];

	return new Promise((resolvePromise, rejectPromise) => {
		spawnCapturedProcess(executable, args, projectRoot)
			.then(({ code, stdout, stderr }) => {
				if (code === 0) {
					resolvePromise();
					return;
				}

				rejectPromise(
					new Error(
						`Godot scene exited with code ${code ?? "unknown"}.${formatCapturedOutput(stdout, stderr)}`,
					),
				);
			})
			.catch((error) => {
				rejectPromise(
					new Error(
						`Failed to start Godot executable ${JSON.stringify(executable)}. Set GODOT_BIN to your Godot 4.6 binary.`,
						{ cause: error },
					),
				);
			});
	});
}

async function tryStartGodotProcess(
	executable: string,
	projectRoot: string,
	args: string[],
	errorMessage: string,
): Promise<RunningGodotProcess> {
	try {
		const process = await spawnTrackedProcess(executable, args, projectRoot);
		return {
			child: process.child,
			waitForExit: (async () => {
				try {
					await process.waitForExit;
				} catch (result) {
					const captured = result as CapturedProcessResult;
					throw new Error(
						`${errorMessage} exited with code ${captured.code ?? "unknown"}.${formatCapturedOutput(captured.stdout, captured.stderr)}`,
					);
				}
			})(),
		};
	} catch (error) {
		throw new Error(
			`Failed to start Godot executable ${JSON.stringify(executable)}. Set GODOT_BIN to your Godot 4.6 binary.`,
			{ cause: error },
		);
	}
}

async function launchScene(
	engineBinary: string,
	projectRoot: string,
	scenePath: string,
): Promise<void> {
	const attempted = new Set<string>();
	let lastError: unknown = null;

	for (const executable of resolveConfiguredGodotExecutables(engineBinary)) {
		if (attempted.has(executable)) {
			continue;
		}

		attempted.add(executable);

		try {
			await tryLaunchScene(executable, projectRoot, scenePath);
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
		`Failed to start a Godot executable. Tried: ${Array.from(attempted).join(", ")}. Set engineBinary in acutis.config.json or GODOT_BIN to your Godot 4.6 binary.`,
		{ cause: lastError instanceof Error ? lastError : undefined },
	);
}

async function startGodotProcess(
	engineBinary: string,
	projectRoot: string,
	args: string[],
	errorMessage: string,
): Promise<RunningGodotProcess> {
	const attempted = new Set<string>();
	let lastError: unknown = null;

	for (const executable of resolveConfiguredGodotExecutables(engineBinary)) {
		if (attempted.has(executable)) {
			continue;
		}

		attempted.add(executable);

		try {
			return await tryStartGodotProcess(
				executable,
				projectRoot,
				args,
				errorMessage,
			);
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
		`Failed to start a Godot executable. Tried: ${Array.from(attempted).join(", ")}. Set engineBinary in acutis.config.json or GODOT_BIN to your Godot 4.6 binary.`,
		{ cause: lastError instanceof Error ? lastError : undefined },
	);
}

async function loadModuleDefault(
	sourceFile: string,
	cacheBustKey?: string,
): Promise<unknown> {
	const specifier = cacheBustKey
		? `${pathToFileURL(sourceFile).href}?acutis_cache_bust=${encodeURIComponent(cacheBustKey)}`
		: pathToFileURL(sourceFile).href;
	const loadedModule = (await tsImport(specifier, import.meta.url)) as {
		default?: unknown;
	};
	if (!("default" in loadedModule)) {
		throw new Error(
			`Generated source file is missing a default export: ${sourceFile}`,
		);
	}

	return loadedModule.default;
}

export async function createBatchInProcess(
	sourceFiles: string[],
	options: { cacheBustKey?: string } = {},
): Promise<IrBatch> {
	const projectRoot = resolveProjectRoot(sourceFiles);
	const documents = [] as IrBatch["documents"];
	const cacheBustKey = options.cacheBustKey;

	for (const sourceFile of sourceFiles) {
		const defaultExport = await loadModuleDefault(sourceFile, cacheBustKey);
		const outputPath = toResPath(resolveSiblingOutput(sourceFile), projectRoot);

		if (sourceFile.endsWith(".scene.tsx")) {
			const renderable =
				typeof defaultExport === "function"
					? (createElement(
							defaultExport as AcutisComponent,
							{},
						) as SceneRenderable)
					: (defaultExport as SceneRenderable);
			documents.push(await serializeSceneDocument(renderable, outputPath));
			continue;
		}

		const renderable =
			typeof defaultExport === "function"
				? (createElement(
						defaultExport as AcutisComponent,
						{},
					) as ResourceRenderable)
				: (defaultExport as ResourceRenderable);
		documents.push(await serializeResourceDocument(renderable, outputPath));
	}

	return {
		version: 1,
		documents,
	};
}

async function createBatchInSubprocess(
	sourceFiles: string[],
	options: { cacheBustKey?: string } = {},
): Promise<IrBatch> {
	const tempDirectory = await mkdtemp(join(tmpdir(), "acutis-batch-"));
	const requestFilePath = resolve(tempDirectory, "request.json");
	const responseFilePath = resolve(tempDirectory, "response.json");
	const request: BatchWorkerRequest = {
		sourceFiles,
		cacheBustKey: options.cacheBustKey,
		responseFilePath,
	};

	try {
		await writeFile(
			requestFilePath,
			`${JSON.stringify(request, null, 2)}\n`,
			"utf8",
		);

		const args = batchWorkerPath.endsWith(".ts")
			? ["--import", "tsx", batchWorkerPath, requestFilePath]
			: [batchWorkerPath, requestFilePath];
		const { code, stdout, stderr } = await spawnCapturedProcess(
			process.execPath,
			args,
			rootDir,
		);
		if (code !== 0) {
			throw new Error(
				`Acutis batch worker exited with code ${code ?? "unknown"}.${formatCapturedOutput(stdout, stderr)}`,
			);
		}

		return JSON.parse(await readFile(responseFilePath, "utf8")) as IrBatch;
	} finally {
		await rm(tempDirectory, { recursive: true, force: true });
	}
}

export async function createBatch(
	sourceFiles: string[],
	options: { cacheBustKey?: string } = {},
): Promise<IrBatch> {
	return createBatchInSubprocess(sourceFiles, options);
}

async function loadSceneTarget(
	sourceFile: string,
	configPath?: string,
): Promise<SceneTarget> {
	if (!sourceFile.endsWith(".scene.tsx")) {
		throw new Error(
			`Run only supports .scene.tsx files. Received: ${sourceFile}`,
		);
	}

	const projectRoot = resolveProjectRoot([sourceFile]);
	const config = await loadConfig(configPath);

	return {
		projectRoot,
		scenePath: toResPath(resolveSiblingOutput(sourceFile), projectRoot),
		engineBinary: config.engineBinary,
	};
}

export async function resolveSceneTarget(
	sourceFile: string,
	options: { configPath?: string } = {},
): Promise<SceneTarget> {
	return loadSceneTarget(sourceFile, options.configPath);
}

async function buildFilesWithConfig(
	sourceFiles: string[],
	config: AcutisConfig,
	options: { cacheBustKey?: string } = {},
): Promise<{ count: number; projectRoot: string }> {
	if (sourceFiles.length === 0) {
		return { count: 0, projectRoot: rootDir };
	}

	const projectRoot = resolveProjectRoot(sourceFiles);
	const batch = await createBatch(sourceFiles, {
		cacheBustKey: options.cacheBustKey,
	});
	const tempDirectory = await mkdtemp(join(tmpdir(), "gdx-build-"));
	const batchPath = resolve(tempDirectory, "batch.json");

	try {
		await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
		await runGodot(batchPath, config.engineBinary, projectRoot);
	} finally {
		await rm(tempDirectory, { recursive: true, force: true });
	}

	return { count: sourceFiles.length, projectRoot };
}

export async function buildGeneratedFiles(
	sourceFiles: string[],
	options: { configPath?: string; cacheBustKey?: string } = {},
): Promise<{ count: number; projectRoot: string; config: AcutisConfig }> {
	const config = await loadConfig(options.configPath);
	const result = await buildFilesWithConfig(sourceFiles, config, options);
	return { ...result, config };
}

export async function createDevSessionState(
	projectRoot: string,
	identifier = `${Date.now()}`,
): Promise<DevSessionState> {
	const wrapperDirectory = resolve(projectRoot, DEV_WRAPPER_DIR);
	const stateFilePath = resolve(wrapperDirectory, `state-${identifier}.json`);

	await mkdir(wrapperDirectory, { recursive: true });

	return {
		stateFilePath,
	};
}

export async function startDevWrapperProcess(
	sceneTarget: SceneTarget,
	stateFilePath: string,
): Promise<RunningGodotProcess> {
	return startGodotProcess(
		sceneTarget.engineBinary,
		sceneTarget.projectRoot,
		[
			"--quiet",
			"--no-header",
			"--path",
			sceneTarget.projectRoot,
			"--script",
			godotDevWrapperPath,
			"--",
			stateFilePath,
		],
		"Godot dev wrapper",
	);
}

export async function runGenerateBuild(
	inputs: string[] = [],
	options: { configPath?: string; cacheBustKey?: string } = {},
) {
	const generatedFiles = await collectGeneratedSourceFiles(inputs);
	if (generatedFiles.length === 0) {
		return 0;
	}

	return (await buildGeneratedFiles(generatedFiles, options)).count;
}

export async function runSceneBuild(
	sourceFile: string,
	options: {
		configPath?: string;
		cacheBustKey?: string;
		onLaunchingScene?: () => void;
	} = {},
): Promise<void> {
	const sceneTarget = await loadSceneTarget(sourceFile, options.configPath);
	await buildFilesWithConfig(
		[sourceFile],
		{ engineBinary: sceneTarget.engineBinary },
		options,
	);
	options.onLaunchingScene?.();
	await launchScene(
		sceneTarget.engineBinary,
		sceneTarget.projectRoot,
		sceneTarget.scenePath,
	);
}
