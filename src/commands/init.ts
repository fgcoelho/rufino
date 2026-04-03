import fs from "node:fs";
import path from "node:path";
import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import logSymbols from "log-symbols";
import { BaseCommand, type BaseFlags } from "../base.ts";

type PackageJson = {
	name?: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	type?: string;
	[key: string]: unknown;
};

type TsConfig = {
	compilerOptions?: Record<string, unknown>;
	include?: string[];
	[key: string]: unknown;
};

function readJsonFile<T>(filePath: string): T | undefined {
	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, data: unknown): void {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
}

function ensureDirectory(targetDir: string): void {
	fs.mkdirSync(targetDir, { recursive: true });
}

function ensurePackageJson(targetDir: string): {
	created: boolean;
	updated: boolean;
} {
	const packageJsonPath = path.join(targetDir, "package.json");
	const existing = readJsonFile<PackageJson>(packageJsonPath);
	const nextPackageJson: PackageJson = existing ?? {
		name: path.basename(targetDir),
		private: true,
	};

	nextPackageJson.type ??= "module";
	nextPackageJson.scripts = {
		...(nextPackageJson.scripts ?? {}),
		build: nextPackageJson.scripts?.build ?? "acutis generate",
	};
	nextPackageJson.dependencies = {
		...(nextPackageJson.dependencies ?? {}),
		"@acutisjs/acutis":
			nextPackageJson.dependencies?.["@acutisjs/acutis"] ?? "latest",
	};
	nextPackageJson.devDependencies = {
		...(nextPackageJson.devDependencies ?? {}),
		typescript: nextPackageJson.devDependencies?.typescript ?? "latest",
	};

	writeJsonFile(packageJsonPath, nextPackageJson);
	return {
		created: !existing,
		updated: true,
	};
}

function ensureTsconfig(targetDir: string): {
	created: boolean;
	updated: boolean;
} {
	const tsconfigPath = path.join(targetDir, "tsconfig.json");
	const existing = readJsonFile<TsConfig>(tsconfigPath);
	const nextConfig: TsConfig = existing ?? {};

	nextConfig.compilerOptions = {
		target: "ES2022",
		module: "NodeNext",
		moduleResolution: "NodeNext",
		allowImportingTsExtensions: true,
		resolveJsonModule: true,
		jsx: "react-jsx",
		jsxImportSource: "@acutisjs/acutis",
		strict: true,
		esModuleInterop: true,
		forceConsistentCasingInFileNames: true,
		skipLibCheck: true,
		noEmit: true,
		types: ["node"],
		...(nextConfig.compilerOptions ?? {}),
	};
	nextConfig.include = nextConfig.include ?? ["**/*.ts", "**/*.tsx"];

	writeJsonFile(tsconfigPath, nextConfig);
	return {
		created: !existing,
		updated: true,
	};
}

function ensureAcutisConfig(targetDir: string): {
	created: boolean;
	updated: boolean;
} {
	const configPath = path.join(targetDir, "acutis.config.json");
	if (fs.existsSync(configPath)) {
		return { created: false, updated: false };
	}

	fs.writeFileSync(
		configPath,
		`${JSON.stringify({ engineBinary: "engine/binary" }, null, 2)}\n`,
		"utf8",
	);

	return { created: true, updated: true };
}

export default class InitCommand extends BaseCommand<typeof InitCommand> {
	static override description = "Scaffold Acutis project files in a directory";

	static override args = {
		directory: Args.string({
			description: "Target directory",
			required: false,
		}),
	};

	static override flags = {
		force: Flags.boolean({
			description: "Rewrite acutis.config.json if it already exists",
			default: false,
		}),
	};

	public async run(): Promise<void> {
		const { argv, flags } = await this.parse(InitCommand);
		this.flags = flags as BaseFlags<typeof InitCommand>;
		this.parsedArgv = argv.map(String);

		const targetDir = path.resolve(this.parsedArgv[0] ?? ".");

		ensureDirectory(targetDir);

		const packageJson = ensurePackageJson(targetDir);
		const tsconfig = ensureTsconfig(targetDir);
		const acutisConfigPath = path.join(targetDir, "acutis.config.json");
		const acutisConfig =
			this.flags.force && fs.existsSync(acutisConfigPath)
				? (fs.rmSync(acutisConfigPath), ensureAcutisConfig(targetDir))
				: ensureAcutisConfig(targetDir);

		const relativeTarget = path.relative(process.cwd(), targetDir) || ".";
		this.log(
			`${logSymbols.success} ${chalk.green(`Initialized Acutis in ${relativeTarget}`)}`,
		);

		if (packageJson.created) {
			this.log(
				`- created ${chalk.cyan(path.join(relativeTarget, "package.json"))}`,
			);
		} else {
			this.log(
				`- updated ${chalk.cyan(path.join(relativeTarget, "package.json"))}`,
			);
		}

		if (tsconfig.created) {
			this.log(
				`- created ${chalk.cyan(path.join(relativeTarget, "tsconfig.json"))}`,
			);
		} else {
			this.log(
				`- updated ${chalk.cyan(path.join(relativeTarget, "tsconfig.json"))}`,
			);
		}

		if (acutisConfig.updated) {
			this.log(
				`- ${acutisConfig.created ? "created" : "updated"} ${chalk.cyan(path.join(relativeTarget, "acutis.config.json"))}`,
			);
		} else {
			this.log(
				`- kept existing ${chalk.cyan(path.join(relativeTarget, "acutis.config.json"))}`,
			);
		}

		this.log("\nNext steps:");
		this.log(
			`1. Run ${chalk.cyan(`pnpm install`)} in ${chalk.cyan(relativeTarget)}.`,
		);
		this.log(
			`2. Add scene/resource TSX files and run ${chalk.cyan("acutis generate")}.`,
		);
	}
}
