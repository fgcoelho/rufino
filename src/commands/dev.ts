import { readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { Args } from "@oclif/core";
import watcher from "@parcel/watcher";
import chalk from "chalk";
import logSymbols from "log-symbols";
import ora from "ora";
import { BaseCommand, type BaseFlags } from "../base.ts";
import {
	buildGeneratedFiles,
	createDevSessionState,
	type RunningGodotProcess,
	resolveSceneSourceFile,
	resolveSceneTarget,
	startDevWrapperProcess,
} from "../build/build.ts";

type DevState = {
	targetScenePath: string;
	version: number;
	status: "building" | "ready" | "error";
	error: string | null;
	updatedAt: string;
};

const WATCH_IGNORE = [
	"**/node_modules/**",
	"**/.git/**",
	"**/.godot/**",
	"**/.acutis/**",
	"**/dist/**",
	"**/*.tscn",
	"**/*.tres",
];
const DEBOUNCE_MS = 100;
const STALE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function letSpinnerRender(): Promise<void> {
	await new Promise<void>((resolvePromise) => {
		setImmediate(resolvePromise);
	});
}

function stopActiveSpinner(spinner: ReturnType<typeof ora> | null): void {
	if (spinner === null) {
		return;
	}

	if (spinner.isSpinning) {
		spinner.stop();
	}
}

function isWatchedSourcePath(filePath: string): boolean {
	return (
		filePath.endsWith(".ts") ||
		filePath.endsWith(".tsx") ||
		filePath.endsWith(".gd") ||
		filePath.endsWith(".cs")
	);
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") {
			return false;
		}

		return true;
	}
}

function createSignalPromise(): {
	promise: Promise<NodeJS.Signals>;
	dispose: () => void;
} {
	let resolveSignal = (_signal: NodeJS.Signals) => {};
	const promise = new Promise<NodeJS.Signals>((resolvePromise) => {
		resolveSignal = resolvePromise;
	});

	const onSigint = () => resolveSignal("SIGINT");
	const onSigterm = () => resolveSignal("SIGTERM");
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);

	return {
		promise,
		dispose: () => {
			process.off("SIGINT", onSigint);
			process.off("SIGTERM", onSigterm);
		},
	};
}

async function cleanupDevSessionFile(filePath: string): Promise<void> {
	await rm(filePath, { force: true });

	const sessionDirectory = dirname(filePath);
	try {
		const remaining = await readdir(sessionDirectory);
		if (remaining.length === 0) {
			await rmdir(sessionDirectory);
			const parentDirectory = dirname(sessionDirectory);
			const parentRemaining = await readdir(parentDirectory);
			if (parentRemaining.length === 0) {
				await rmdir(parentDirectory);
			}
		}
	} catch {
		// Best-effort cleanup only.
	}
}

async function cleanupStaleDevSessions(stateFilePath: string): Promise<void> {
	const sessionDirectory = dirname(stateFilePath);
	let entries = [] as string[];

	try {
		entries = await readdir(sessionDirectory);
	} catch {
		return;
	}

	const now = Date.now();
	for (const entry of entries) {
		if (entry === "state.json") {
			await rm(`${sessionDirectory}/${entry}`, { force: true });
			continue;
		}

		const match = /^state-(\d+)-(\d+)\.json$/.exec(entry);
		if (match === null) {
			continue;
		}

		const pid = Number(match[1]);
		const createdAt = Number(match[2]);
		if (!Number.isFinite(pid) || !Number.isFinite(createdAt)) {
			continue;
		}

		if (processExists(pid) && now - createdAt < STALE_SESSION_MAX_AGE_MS) {
			continue;
		}

		await rm(`${sessionDirectory}/${entry}`, { force: true });
	}
}

async function writeDevState(filePath: string, state: DevState): Promise<void> {
	await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function buildScene(
	sceneSourceFile: string,
	configPath?: string,
	cacheBustKey?: string,
): Promise<number> {
	return (
		await buildGeneratedFiles([sceneSourceFile], {
			configPath,
			cacheBustKey,
		})
	).count;
}

export default class DevCommand extends BaseCommand<typeof DevCommand> {
	static override description =
		"Run a scene in a persistent Godot dev wrapper with automatic rebuilds";

	static override args = {
		scene: Args.string({
			description: "Path to a .scene.tsx file",
			required: true,
		}),
	};

	public async run(): Promise<void> {
		const { argv, flags } = await this.parse(DevCommand);
		this.flags = flags as BaseFlags<typeof DevCommand>;
		this.parsedArgv = argv.map(String);

		const sceneSourceFile = await resolveSceneSourceFile(this.parsedArgv[0]);
		const sceneTarget = await resolveSceneTarget(sceneSourceFile, {
			configPath: this.flags.config,
		});
		const session = await createDevSessionState(
			sceneTarget.projectRoot,
			`${process.pid}-${Date.now()}`,
		);
		await cleanupStaleDevSessions(session.stateFilePath);

		try {
			const version = 1;
			await writeDevState(session.stateFilePath, {
				targetScenePath: sceneTarget.scenePath,
				version: 0,
				status: "building",
				error: null,
				updatedAt: new Date().toISOString(),
			});

			const generationStatus = ora("Generating project").start();
			try {
				await letSpinnerRender();
				const count = await buildScene(
					sceneSourceFile,
					this.flags.config,
					`initial-${Date.now()}`,
				);
				await writeDevState(session.stateFilePath, {
					targetScenePath: sceneTarget.scenePath,
					version,
					status: "ready",
					error: null,
					updatedAt: new Date().toISOString(),
				});
				generationStatus.succeed(
					`Generated ${count} Godot document${count === 1 ? "" : "s"}`,
				);
			} catch (error) {
				generationStatus.fail("Initial generation failed");
				await writeDevState(session.stateFilePath, {
					targetScenePath: sceneTarget.scenePath,
					version: 0,
					status: "error",
					error: error instanceof Error ? error.message : String(error),
					updatedAt: new Date().toISOString(),
				});
				throw error;
			}

			const godotProcess = await startDevWrapperProcess(
				sceneTarget,
				session.stateFilePath,
			);
			this.log(`${logSymbols.info} ${chalk.cyan("Running dev scene")}`);

			await this.watchAndRebuild(
				sceneSourceFile,
				sceneTarget.scenePath,
				sceneTarget.projectRoot,
				session.stateFilePath,
				godotProcess,
				version,
			);
		} finally {
			await cleanupStaleDevSessions(session.stateFilePath);
			await cleanupDevSessionFile(session.stateFilePath);
		}
	}

	private async watchAndRebuild(
		sceneSourceFile: string,
		targetScenePath: string,
		projectRoot: string,
		stateFilePath: string,
		godotProcess: RunningGodotProcess,
		startingVersion: number,
	): Promise<void> {
		const signal = createSignalPromise();
		const processExit = godotProcess.waitForExit.then(
			() => ({ type: "exit" as const, error: null }),
			(error) => ({ type: "exit" as const, error }),
		);

		let version = startingVersion;
		let activeSpinner: ReturnType<typeof ora> | null = null;
		let debounceTimer: NodeJS.Timeout | null = null;
		let isBuilding = false;
		let isShuttingDown = false;
		let hasPendingChanges = false;
		let pendingSignalVersion = 0;
		let completedSignalVersion = 0;
		let backgroundError: unknown = null;
		let notifyIdle = () => {};
		let buildIdle = new Promise<void>((resolvePromise) => {
			notifyIdle = resolvePromise;
		});

		const resetIdlePromise = () => {
			buildIdle = new Promise<void>((resolvePromise) => {
				notifyIdle = resolvePromise;
			});
		};

		const runBuild = async () => {
			if (isShuttingDown || isBuilding || !hasPendingChanges) {
				return;
			}

			isBuilding = true;
			hasPendingChanges = false;
			const buildSignalVersion = pendingSignalVersion;
			resetIdlePromise();
			activeSpinner = ora("Rebuilding project").start();
			await writeDevState(stateFilePath, {
				targetScenePath,
				version,
				status: "building",
				error: null,
				updatedAt: new Date().toISOString(),
			});

			try {
				await letSpinnerRender();
				const count = await buildScene(
					sceneSourceFile,
					this.flags.config,
					`watch-${Date.now()}`,
				);
				version += 1;
				await writeDevState(stateFilePath, {
					targetScenePath,
					version,
					status: "ready",
					error: null,
					updatedAt: new Date().toISOString(),
				});
				completedSignalVersion = buildSignalVersion;
				activeSpinner.succeed(
					`Reloaded ${count} Godot document${count === 1 ? "" : "s"}`,
				);
			} catch (error) {
				activeSpinner.fail("Rebuild failed");
				await writeDevState(stateFilePath, {
					targetScenePath,
					version,
					status: "error",
					error: error instanceof Error ? error.message : String(error),
					updatedAt: new Date().toISOString(),
				});
				this.log(
					`${logSymbols.error} ${chalk.red(error instanceof Error ? error.message : String(error))}`,
				);
			} finally {
				activeSpinner = null;
				isBuilding = false;
				notifyIdle();
				if (pendingSignalVersion > completedSignalVersion) {
					hasPendingChanges = true;
				}
				if (hasPendingChanges && !isShuttingDown) {
					void runBuild().catch((error) => {
						backgroundError = error;
					});
				}
			}
		};

		const queueBuild = () => {
			if (isShuttingDown) {
				return;
			}

			hasPendingChanges = true;
			pendingSignalVersion += 1;

			if (isBuilding) {
				return;
			}

			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
			}

			debounceTimer = setTimeout(() => {
				debounceTimer = null;
				void runBuild().catch((error) => {
					backgroundError = error;
				});
			}, DEBOUNCE_MS);
		};

		const subscription = await watcher.subscribe(
			projectRoot,
			(error, events) => {
				if (error !== null) {
					backgroundError = error;
					queueBuild();
					return;
				}

				for (const event of events) {
					if (!isWatchedSourcePath(event.path)) {
						continue;
					}

					if (basename(event.path) === basename(stateFilePath)) {
						continue;
					}

					queueBuild();
					break;
				}
			},
			{ ignore: WATCH_IGNORE },
		);

		try {
			while (true) {
				const event = await Promise.race([
					processExit,
					signal.promise.then((receivedSignal) => ({
						type: "signal" as const,
						signal: receivedSignal,
					})),
					buildIdle.then(() => ({ type: "idle" as const })),
				]);

				if (backgroundError !== null) {
					throw backgroundError;
				}

				if (event.type === "exit") {
					if (event.error) {
						throw event.error;
					}

					return;
				}

				if (event.type === "signal") {
					isShuttingDown = true;
					godotProcess.child.kill("SIGTERM");
					return;
				}
			}
		} finally {
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
			}
			stopActiveSpinner(activeSpinner);
			signal.dispose();
			await subscription.unsubscribe();
		}
	}
}
