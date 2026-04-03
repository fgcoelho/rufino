import DevCommand from "./commands/dev.ts";
import GenerateCommand from "./commands/generate.ts";
import InitCommand from "./commands/init.ts";
import RunCommand from "./commands/run.ts";

export const COMMANDS = {
	dev: DevCommand,
	generate: GenerateCommand,
	init: InitCommand,
	run: RunCommand,
};
