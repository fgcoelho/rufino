import { Command, Flags, type Interfaces } from "@oclif/core";

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<
	typeof BaseCommand.baseFlags & T["flags"]
>;

export abstract class BaseCommand<T extends typeof Command> extends Command {
	static override baseFlags = {
		config: Flags.string({
			description: "Path to acutis.config.json",
			helpGroup: "GLOBAL",
		}),
	};

	protected flags!: BaseFlags<T>;
	protected parsedArgv!: string[];
}
