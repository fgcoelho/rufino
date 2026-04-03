import { Args } from "@oclif/core";
import chalk from "chalk";
import logSymbols from "log-symbols";
import ora from "ora";
import { BaseCommand, type BaseFlags } from "../base.ts";
import { collectGeneratedSourceFiles, runSceneBuild } from "../build/build.ts";

export default class RunCommand extends BaseCommand<typeof RunCommand> {
	static override description =
		"Generate a scene document and launch it in Godot";

	static override args = {
		scene: Args.string({
			description: "Path to a .scene.tsx file",
			required: true,
		}),
	};

	public async run(): Promise<void> {
		const { argv, flags } = await this.parse(RunCommand);
		this.flags = flags as BaseFlags<typeof RunCommand>;
		this.parsedArgv = argv.map(String);

		const input = this.parsedArgv[0];
		const files = await collectGeneratedSourceFiles([input]);

		if (files.length === 0) {
			this.log(
				`${logSymbols.info} ${chalk.yellow("No .scene.tsx file matched the requested path")}`,
			);
			return;
		}

		const sceneFiles = files.filter((file) => file.endsWith(".scene.tsx"));
		if (sceneFiles.length !== 1 || files.length !== 1) {
			throw new Error(
				`Run expects exactly one .scene.tsx file. Matched: ${files.join(", ")}`,
			);
		}

		const spinner = ora("Generating and launching scene").start();

		try {
			await runSceneBuild(sceneFiles[0], {
				configPath: this.flags.config,
				onLaunchingScene: () => {
					spinner.succeed("Generated scene");
					this.log(`${logSymbols.info} ${chalk.cyan("Running scene")}`);
				},
			});
		} catch (error) {
			if (spinner.isSpinning) {
				spinner.fail("Scene launch failed");
			}
			throw error;
		}
	}
}
