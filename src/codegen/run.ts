import { spawn } from "node:child_process";
import { resolveManifestDocs, SHARED_DOCS_ROOT_ENV } from "./manifest/docs.ts";

const rootDir = process.cwd();

function run(
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("pnpm", ["exec", "tsx", ...args], {
			cwd: rootDir,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(
					`pnpm exec tsx ${args.join(" ")} exited with code ${code}\n${output}`.trim(),
				),
			);
		});
	});
}

function logStep(message: string) {
	console.log(`[codegen] ${message}`);
}

async function main() {
	const engineArg = process.argv[2];
	const docs = await resolveManifestDocs(engineArg);

	try {
		logStep(`docs -> ${docs.docsRoot.replace(`${rootDir}/`, "")}`);
		const env = {
			...process.env,
			[SHARED_DOCS_ROOT_ENV]: docs.docsRoot,
		};

		const forwardedArgs = engineArg ? [engineArg] : [];

		logStep("manifest");
		await run(["src/codegen/manifest/generate.ts", ...forwardedArgs], env);
		logStep("props");
		await run(
			["src/codegen/manifest/generate-props.ts", ...forwardedArgs],
			env,
		);
		logStep("wrappers");
		await run(["src/codegen/generate-wrappers.ts"], env);
	} finally {
		await docs.cleanup();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
