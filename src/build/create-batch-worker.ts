import { readFile, writeFile } from "node:fs/promises";
import { createBatchInProcess } from "./build.ts";

type BatchWorkerRequest = {
	sourceFiles: string[];
	cacheBustKey?: string;
	responseFilePath: string;
};

async function main(): Promise<void> {
	const requestFilePath = process.argv[2];
	if (!requestFilePath) {
		throw new Error("Missing batch worker request file path.");
	}

	const request = JSON.parse(
		await readFile(requestFilePath, "utf8"),
	) as BatchWorkerRequest;
	const batch = await createBatchInProcess(request.sourceFiles, {
		cacheBustKey: request.cacheBustKey,
	});
	await writeFile(
		request.responseFilePath,
		`${JSON.stringify(batch, null, 2)}\n`,
		"utf8",
	);
}

void main().catch((error) => {
	console.error(
		error instanceof Error ? (error.stack ?? error.message) : String(error),
	);
	process.exitCode = 1;
});
