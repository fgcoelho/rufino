import { Command } from "@oclif/core";
import chalk from "chalk";
import logSymbols from "log-symbols";
import ora from "ora";
import {
	collectGeneratedSourceFiles,
	runGenerateBuild,
} from "../build/build.ts";

export default class GenerateCommand extends Command {
	static override description =
		"Generate sibling .tscn and .tres files from TSX documents";
	static override strict = false;

	async run(): Promise<void> {
		const { argv } = await this.parse(GenerateCommand);
		const inputs = argv.map(String);
		const files = await collectGeneratedSourceFiles(inputs);

		if (files.length === 0) {
			this.log(
				`${logSymbols.info} ${chalk.yellow("No .scene.tsx or .tres.tsx files matched the requested paths")}`,
			);
			return;
		}

		const spinner = ora(
			`Generating ${files.length} Godot document${files.length === 1 ? "" : "s"}`,
		).start();

		try {
			const count = await runGenerateBuild(inputs);
			spinner.succeed(
				`Generated ${count} Godot document${count === 1 ? "" : "s"}`,
			);
			this.log(
				`${logSymbols.success} ${chalk.green("Sibling .tscn/.tres outputs are up to date")}`,
			);
		} catch (error) {
			spinner.fail("Generation failed");
			throw error;
		}
	}
}
