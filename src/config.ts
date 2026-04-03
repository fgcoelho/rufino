import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface AcutisUserConfig {
	engineBinary?: string;
}

export interface AcutisConfig {
	engineBinary: string;
}

export function acutis(userConfig: AcutisUserConfig = {}): AcutisConfig {
	return {
		engineBinary: userConfig.engineBinary ?? "engine/binary",
	};
}

const CONFIG_FILENAME = "acutis.config.json";
const LEGACY_CONFIG_FILENAME = "acutis.config.ts";

export function resolveConfigPath(configPath?: string): string {
	const cwd = process.cwd();
	return configPath
		? path.resolve(cwd, configPath)
		: path.resolve(cwd, CONFIG_FILENAME);
}

async function importConfigModule(
	resolvedPath: string,
	requireConfig: boolean,
): Promise<unknown | undefined> {
	if (!fs.existsSync(resolvedPath)) {
		const legacyPath = path.resolve(
			path.dirname(resolvedPath),
			LEGACY_CONFIG_FILENAME,
		);
		if (!requireConfig && fs.existsSync(legacyPath)) {
			throw new Error(
				`Acutis no longer supports ${LEGACY_CONFIG_FILENAME}. Rename it to ${CONFIG_FILENAME} and convert it to JSON.`,
			);
		}

		if (!requireConfig) {
			return undefined;
		}

		throw new Error(
			`Config file not found: ${resolvedPath}\n\nCreate an ${CONFIG_FILENAME} file in your project root:\n\n  {\n    "engineBinary": "engine/binary"\n  }\n`,
		);
	}

	const raw = await readFile(resolvedPath, "utf8");
	try {
		return JSON.parse(raw) as unknown;
	} catch (error) {
		throw new Error(`Invalid JSON in config file at ${resolvedPath}.`, {
			cause: error,
		});
	}
}

function validateConfigModule(
	loaded: unknown,
	resolvedPath: string,
): AcutisConfig {
	if (!loaded || typeof loaded !== "object" || !("engineBinary" in loaded)) {
		throw new Error(
			`Invalid config file at ${resolvedPath}. Expected a JSON object with an "engineBinary" string.`,
		);
	}

	const { engineBinary } = loaded as { engineBinary?: unknown };
	if (typeof engineBinary !== "string") {
		throw new Error(
			`Invalid config file at ${resolvedPath}. "engineBinary" must be a string.`,
		);
	}

	return { engineBinary };
}

export async function loadConfig(configPath?: string): Promise<AcutisConfig> {
	const resolvedPath = resolveConfigPath(configPath);
	const loaded = await importConfigModule(resolvedPath, Boolean(configPath));

	if (!loaded) {
		return acutis();
	}

	return validateConfigModule(loaded, resolvedPath);
}
