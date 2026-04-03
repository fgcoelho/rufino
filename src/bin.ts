import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "@oclif/core";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const rootDir = resolve(currentDir, "..");
const runningFromSource = currentDir.includes("/src");

if (runningFromSource) {
	const packageJson = JSON.parse(
		readFileSync(resolve(rootDir, "package.json"), "utf8"),
	) as {
		oclif?: {
			[key: string]: unknown;
			commands?: Record<string, unknown>;
		};
		[key: string]: unknown;
	};

	void execute({
		development: true,
		loadOptions: {
			root: rootDir,
			pjson: {
				...packageJson,
				oclif: {
					...packageJson.oclif,
					commands: {
						...packageJson.oclif?.commands,
						target: "./src/commands.ts",
					},
				},
			} as never,
		},
	});
} else {
	void execute({
		dir: import.meta.url,
	});
}
