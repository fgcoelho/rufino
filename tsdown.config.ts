import { spawn } from "node:child_process";
import { defineConfig, type UserConfig } from "tsdown";

let codegenPromise: Promise<void> | null = null;

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: import.meta.dirname,
			stdio: "inherit",
		});

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(`${command} ${args.join(" ")} exited with code ${code}`),
			);
		});
	});
}

async function runCodegen() {
	await run("pnpm", ["exec", "tsx", "src/codegen/run.ts"]);
}

function withCodegen(config: UserConfig): UserConfig {
	return {
		...config,
		hooks: {
			"build:prepare": async () => {
				codegenPromise ??= runCodegen().catch((error) => {
					codegenPromise = null;
					throw error;
				});
				await codegenPromise;
			},
		},
	};
}

function nodeLib(config: UserConfig): UserConfig {
	return withCodegen({
		format: ["cjs"],
		shims: true,
		platform: "node",
		tsconfig: "tsconfig.build.json",
		...config,
	});
}

const cli = nodeLib({
	entry: {
		cli: "src/bin.ts",
		commands: "src/commands.ts",
		"create-batch-worker": "src/build/create-batch-worker.ts",
	},
	dts: false,
	clean: true,
	copy: ["src/godot/build_from_ir.gd", "src/godot/dev_wrapper.gd"],
	banner: { js: "#!/usr/bin/env node" },
});

const runtime = nodeLib({
	entry: {
		index: "src/index.ts",
		"jsx-runtime": "src/jsx-runtime.ts",
		"jsx-dev-runtime": "src/jsx-dev-runtime.ts",
	},
	dts: true,
	clean: false,
});

export default defineConfig([cli, runtime]);
