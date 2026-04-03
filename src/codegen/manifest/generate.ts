import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { resolveManifestDocs } from "./docs.ts";
import type {
	GodotClassManifestEntry,
	GodotManifestFile,
	ManifestKind,
} from "./types.ts";

interface XmlClassInfo {
	name: string;
	inherits: string | null;
	brief: string;
	docPath: string;
}

const ENGINE_BRANCH = "4.6-stable";
const DOCS_BRANCH = "4.6";
const engineRootArg = process.argv[2] ?? process.env.GODOT_ENGINE_ROOT;
const outFile = resolve(
	process.argv[3] ?? "generated/manifest/godot-4.6-stable.json",
);

async function walk(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const children = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				return walk(fullPath);
			}

			return [fullPath];
		}),
	);

	return children.flat();
}

function xmlAttribute(source: string, attribute: string): string | null {
	const match = source.match(new RegExp(`${attribute}="([^"]+)"`));
	return match?.[1] ?? null;
}

function xmlTagText(source: string, tag: string): string {
	const match = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
	return cleanupXmlText(match?.[1] ?? "");
}

function cleanupXmlText(source: string): string {
	return source
		.replaceAll(/<[^>]+>/g, " ")
		.replaceAll(
			/\[\/(?:b|i|u|code|codeblock|kbd|kbdcode|center|br|url)\]/g,
			" ",
		)
		.replaceAll(/\[(?:b|i|u|code|codeblock|kbd|kbdcode|center|br)\]/g, " ")
		.replaceAll(/\[url=[^\]]+\]/g, " ")
		.replaceAll(
			/\[(?:method|member|signal|constant|enum|annotation|param|theme_item|theme_color|theme_style|theme_constant|theme_font|theme_font_size|constructor)\s+([^\]]+)\]/g,
			"$1",
		)
		.replaceAll(/\[([A-Za-z0-9_@.]+)\]/g, "$1")
		.replaceAll(/\$DOCS_URL/g, "https://docs.godotengine.org/en/4.6")
		.replaceAll(/&quot;/g, '"')
		.replaceAll(/&apos;/g, "'")
		.replaceAll(/&lt;/g, "<")
		.replaceAll(/&gt;/g, ">")
		.replaceAll(/&amp;/g, "&")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function toDocsSlug(name: string): string {
	return name.toLowerCase();
}

function toKebabCase(name: string): string {
	return name
		.replaceAll(/([a-z])([0-9]+D)(?=$|[A-Z])/g, "$1-$2")
		.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

function toSourceUrl(path: string, branch: string, repo: string) {
	return `https://github.com/godotengine/${repo}/blob/${branch}/${path}`;
}

function classifyCategory(path: string | null): string | null {
	if (!path) {
		return null;
	}

	const segments = path.split("/");
	if (segments.length === 1) {
		return segments[0];
	}

	return segments.slice(0, Math.min(3, segments.length - 1)).join("/");
}

function inferImplPath(
	headerPath: string,
	allSourceFiles: Set<string>,
): string | null {
	const stem = headerPath.slice(0, -2);
	for (const extension of [".cpp", ".mm", ".cxx", ".cc"]) {
		const candidate = `${stem}${extension}`;
		if (allSourceFiles.has(candidate)) {
			return candidate;
		}
	}

	return null;
}

function isDescendantOf(
	className: string,
	rootName: string,
	inheritsByName: Map<string, string | null>,
): boolean {
	let current: string | null = className;
	const seen = new Set<string>();

	while (current && !seen.has(current)) {
		if (current === rootName) {
			return true;
		}

		seen.add(current);
		current = inheritsByName.get(current) ?? null;
	}

	return false;
}

function buildEntry(
	info: XmlClassInfo,
	kind: ManifestKind,
	sourceHeaderPath: string | null,
	sourceImplPath: string | null,
): GodotClassManifestEntry {
	return {
		name: info.name,
		kind,
		inherits: info.inherits,
		brief: info.brief,
		docPath: info.docPath,
		docUrl: `https://docs.godotengine.org/en/4.6/classes/class_${toDocsSlug(info.name)}.html`,
		sourceHeaderPath,
		sourceHeaderUrl: sourceHeaderPath
			? toSourceUrl(sourceHeaderPath, ENGINE_BRANCH, "godot")
			: null,
		sourceImplPath,
		sourceImplUrl: sourceImplPath
			? toSourceUrl(sourceImplPath, ENGINE_BRANCH, "godot")
			: null,
		sourceCategory: classifyCategory(sourceHeaderPath),
		tsxTag: info.name,
		fileBase: toKebabCase(info.name),
	};
}

async function main() {
	const { docsRoot, sourceRoot, cleanup } =
		await resolveManifestDocs(engineRootArg);

	try {
		const classDirectory = resolve(docsRoot, "doc/classes");
		const classFiles = (await walk(classDirectory)).filter((file) =>
			file.endsWith(".xml"),
		);
		const engineFiles = sourceRoot ? await walk(sourceRoot) : [];
		const headerFiles = engineFiles.filter((file) => file.endsWith(".h"));
		const sourceFiles = new Set(
			engineFiles
				.filter((file) => /\.(cpp|mm|cxx|cc)$/.test(file))
				.map((file) =>
					relative(sourceRoot ?? docsRoot, file).replaceAll("\\", "/"),
				),
		);

		const classes: XmlClassInfo[] = [];
		for (const file of classFiles) {
			const xml = await readFile(file, "utf8");
			const name = xmlAttribute(xml, "name");
			if (!name) {
				continue;
			}

			classes.push({
				name,
				inherits: xmlAttribute(xml, "inherits"),
				brief: xmlTagText(xml, "brief_description"),
				docPath: relative(docsRoot, file).replaceAll("\\", "/"),
			});
		}

		const headerByClass = new Map<string, string>();
		for (const file of headerFiles) {
			const source = await readFile(file, "utf8");
			const relativeFile = relative(sourceRoot ?? docsRoot, file).replaceAll(
				"\\",
				"/",
			);
			for (const match of source.matchAll(/GDCLASS\(\s*([A-Za-z0-9_]+)/g)) {
				const className = match[1];
				if (!headerByClass.has(className)) {
					headerByClass.set(className, relativeFile);
				}
			}
		}

		const inheritsByName = new Map(
			classes.map((entry) => [entry.name, entry.inherits]),
		);
		const nodes: GodotClassManifestEntry[] = [];
		const resources: GodotClassManifestEntry[] = [];

		for (const info of classes) {
			const isNode = isDescendantOf(info.name, "Node", inheritsByName);
			const isResource = isDescendantOf(info.name, "Resource", inheritsByName);
			if (!isNode && !isResource) {
				continue;
			}

			const sourceHeaderPath = headerByClass.get(info.name) ?? null;
			const sourceImplPath = sourceHeaderPath
				? inferImplPath(sourceHeaderPath, sourceFiles)
				: null;
			const entry = buildEntry(
				info,
				isNode ? "node" : "resource",
				sourceHeaderPath,
				sourceImplPath,
			);

			if (isNode) {
				nodes.push(entry);
			} else {
				resources.push(entry);
			}
		}

		nodes.sort((a, b) => a.name.localeCompare(b.name));
		resources.sort((a, b) => a.name.localeCompare(b.name));

		const manifest: GodotManifestFile = {
			version: ENGINE_BRANCH,
			docsBranch: DOCS_BRANCH,
			nodes,
			resources,
		};

		await mkdir(dirname(outFile), { recursive: true });
		await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	} finally {
		await cleanup();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
