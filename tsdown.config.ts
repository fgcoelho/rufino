import { defineConfig, type UserConfig } from "tsdown";

export type { UserConfig };
export { defineConfig };

export interface NodeLibConfig {
	entry: string[];
	dts?: boolean;
	clean?: boolean;
	banner?: UserConfig["banner"];
}

export function nodeLib({
	entry,
	dts = true,
	clean = true,
	banner,
}: NodeLibConfig): UserConfig {
	return {
		entry,
		format: ["cjs"],
		dts,
		shims: true,
		clean,
		platform: "node",
		tsconfig: "tsconfig.build.json",
		...(banner ? { banner } : {}),
	};
}

const cli = nodeLib({
	entry: ["src/index.ts"],
	dts: false,
	banner: { js: "#!/usr/bin/env node" },
});

const runtime = nodeLib({
	entry: ["src/runtime.ts"],
	clean: false,
});

const worker = nodeLib({
	entry: ["src/workers/generate.ts", "src/workers/populate.ts"],
	dts: false,
	clean: false,
});

export default defineConfig([cli, runtime, worker]);
