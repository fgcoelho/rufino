import chalk from "chalk";
import logSymbols from "log-symbols";
import ora from "ora";
import { BaseCommand, type BaseFlags } from "../base.ts";
import {
	collectGeneratedSourceFiles,
	runGenerateBuild,
} from "../build/build.ts";

export default class GenerateCommand extends BaseCommand<
	typeof GenerateCommand
> {
	static override description =
		"Generate project.godot, .tscn, and .tres files from TSX documents";
	static override strict = false;

	async run(): Promise<void> {
		const { argv, flags } = await this.parse(GenerateCommand);
		this.flags = flags as BaseFlags<typeof GenerateCommand>;
		this.parsedArgv = argv.map(String);

		const inputs = this.parsedArgv;
		const files = await collectGeneratedSourceFiles(inputs);

		if (files.length === 0) {
			this.log(
				`${logSymbols.info} ${chalk.yellow("No project.config.tsx, .scene.tsx, or .tres.tsx files matched the requested paths")}`,
			);
			return;
		}

		const spinner = ora(
			`Generating ${files.length} Godot document${files.length === 1 ? "" : "s"}`,
		).start();

		try {
			const count = await runGenerateBuild(inputs, {
				configPath: this.flags.config,
			});
			spinner.succeed(
				`Generated ${count} Godot document${count === 1 ? "" : "s"}`,
			);
			this.log(
				`${logSymbols.success} ${chalk.green("Generated project/resource/scene outputs are up to date")}`,
			);
		} catch (error) {
			spinner.fail("Generation failed");
			throw error;
		}
	}
}
