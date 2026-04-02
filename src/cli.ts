import GenerateCommand from "./commands/generate.ts";

const [, , command = "generate", ...args] = process.argv;

async function main() {
	if (command === "generate") {
		await GenerateCommand.run(args);
		return;
	}

	throw new Error(`Unknown gdx command: ${command}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
