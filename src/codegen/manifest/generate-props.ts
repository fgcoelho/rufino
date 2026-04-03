/** biome-ignore-all lint/style/noNonNullAssertion: ! */
import { spawn } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveManifestDocs } from "./docs.ts";
import type {
	GodotCallableMetadata,
	GodotCallableQualifierMetadata,
	GodotClassPropsMetadata,
	GodotEnumMetadata,
	GodotManifestFile,
	GodotParameterMetadata,
	GodotPropertyMetadata,
	GodotPropsMetadataFile,
	GodotValueTypeMetadata,
} from "./types.ts";

interface XmlClassInfo {
	name: string;
	inherits: string | null;
	members: GodotPropertyMetadata[];
	constructors: GodotCallableMetadata[];
	methods: GodotCallableMetadata[];
	enums: GodotEnumMetadata[];
}

const rootDir = resolve(process.cwd());
const engineRootArg = process.argv[2] ?? process.env.GODOT_ENGINE_ROOT;
const outFile = resolve(
	process.argv[3] ?? "generated/manifest/godot-4.6-props.json",
);
const manifestPath = resolve("generated/manifest/godot-4.6-stable.json");
const dumpScriptPath = resolve("src/codegen/manifest/dump_classdb.gd");

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

function parseConstantValue(value: string): number | string {
	const numeric = Number(value);
	return Number.isNaN(numeric) ? value : numeric;
}

function normalizeEnumRef(
	enumRef: string | null,
	className: string,
): string | null {
	if (!enumRef) {
		return null;
	}

	if (enumRef.includes(".")) {
		return enumRef;
	}

	return `${className}.${enumRef}`;
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
		.replaceAll(/&quot;/g, '"')
		.replaceAll(/&apos;/g, "'")
		.replaceAll(/&lt;/g, "<")
		.replaceAll(/&gt;/g, ">")
		.replaceAll(/&amp;/g, "&")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function parseQualifiers(source: string): GodotCallableQualifierMetadata {
	const raw = xmlAttribute(source, "qualifiers");
	const parts = new Set((raw ?? "").split(/\s+/).filter(Boolean));
	return {
		raw,
		isConst: parts.has("const"),
		isStatic: parts.has("static"),
		isVararg: parts.has("vararg"),
		isVirtual: parts.has("virtual"),
	};
}

function parseValueType(
	attrs: string,
	className: string,
): GodotValueTypeMetadata {
	return {
		type: xmlAttribute(attrs, "type") ?? "Variant",
		defaultExpr: xmlAttribute(attrs, "default"),
		enumRef: normalizeEnumRef(xmlAttribute(attrs, "enum"), className),
		isBitfield: xmlAttribute(attrs, "is_bitfield") === "true",
	};
}

function parseParams(
	source: string,
	className: string,
): GodotParameterMetadata[] {
	return Array.from(source.matchAll(/<param\s+([^>]+?)\/>/g))
		.map((match) => {
			const attrs = match[1] ?? "";
			const name = xmlAttribute(attrs, "name");
			if (!name) {
				throw new Error(`Malformed param entry in ${className}`);
			}

			return {
				...parseValueType(attrs, className),
				index: Number(xmlAttribute(attrs, "index") ?? "0"),
				name,
				required: xmlAttribute(attrs, "default") === null,
			} satisfies GodotParameterMetadata;
		})
		.sort((a, b) => a.index - b.index);
}

function buildSignatureKey(
	name: string,
	params: GodotParameterMetadata[],
): string {
	return `${name}(${params.map((param) => param.type).join(",")})`;
}

function parseCallables(
	xml: string,
	className: string,
	section: "constructors" | "methods",
	kind: "constructor" | "method",
): GodotCallableMetadata[] {
	const sectionSource =
		xml.match(new RegExp(`<${section}>([\\s\\S]*?)<\\/${section}>`))?.[1] ?? "";
	const tagName = kind === "constructor" ? "constructor" : "method";
	return Array.from(
		sectionSource.matchAll(
			new RegExp(
				`<${tagName}\\s+([^>]+?)>([\\s\\S]*?)<\\/${tagName}>|<${tagName}\\s+([^>]+?)\\/>`,
				"g",
			),
		),
	).map((match) => {
		const attrs = match[1] ?? match[3] ?? "";
		const body = match[2] ?? "";
		const name = xmlAttribute(attrs, "name");
		if (!name) {
			throw new Error(`Malformed ${kind} entry in ${className}`);
		}

		const returnAttrs = body.match(/<return\s+([^>]+?)\/>/)?.[1] ?? null;
		const params = parseParams(body, className);
		return {
			kind,
			name,
			signatureKey: buildSignatureKey(name, params),
			declaredIn: className,
			qualifiers: parseQualifiers(attrs),
			returnType: returnAttrs ? parseValueType(returnAttrs, className) : null,
			params,
			description: cleanupXmlText(
				body.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "",
			),
			deprecated: xmlAttribute(attrs, "deprecated"),
			experimental: xmlAttribute(attrs, "experimental"),
			keywords: xmlAttribute(attrs, "keywords"),
		} satisfies GodotCallableMetadata;
	});
}

function parseEnums(xml: string, className: string): GodotEnumMetadata[] {
	const constantsSection =
		xml.match(/<constants>([\s\S]*?)<\/constants>/)?.[1] ?? "";
	const constants = Array.from(
		constantsSection.matchAll(
			/<constant\s+([^>]+?)>([\s\S]*?)<\/constant>|<constant\s+([^>]+?)\/>/g,
		),
	);
	const enumMap = new Map<string, GodotEnumMetadata>();

	for (const match of constants) {
		const attrs = match[1] ?? match[3] ?? "";
		const name = xmlAttribute(attrs, "name");
		const enumName = xmlAttribute(attrs, "enum");
		if (!name || !enumName) {
			continue;
		}

		const qualifiedName = normalizeEnumRef(enumName, className)!;
		const entry = enumMap.get(qualifiedName) ?? {
			name: qualifiedName.split(".").at(-1) ?? qualifiedName,
			qualifiedName,
			className: qualifiedName.includes(".")
				? qualifiedName.split(".")[0]
				: null,
			isBitfield: xmlAttribute(attrs, "is_bitfield") === "true",
			values: [],
		};

		const value = xmlAttribute(attrs, "value") ?? "0";
		entry.values.push({ name, value: parseConstantValue(value) });
		enumMap.set(qualifiedName, entry);
	}

	return Array.from(enumMap.values()).sort((a, b) =>
		a.qualifiedName.localeCompare(b.qualifiedName),
	);
}

function parseMembers(xml: string, className: string): GodotPropertyMetadata[] {
	const membersSection = xml.match(/<members>([\s\S]*?)<\/members>/)?.[1] ?? "";
	return Array.from(
		membersSection.matchAll(
			/<member\s+([^>]+?)>([\s\S]*?)<\/member>|<member\s+([^>]+?)\/>/g,
		),
	).map((match) => {
		const attrs = match[1] ?? match[3] ?? "";
		const name = xmlAttribute(attrs, "name");
		const type = xmlAttribute(attrs, "type");
		if (!name || !type) {
			throw new Error(`Malformed member entry in ${className}`);
		}

		return {
			name,
			type,
			defaultExpr: xmlAttribute(attrs, "default"),
			enumRef: normalizeEnumRef(xmlAttribute(attrs, "enum"), className),
			isBitfield: xmlAttribute(attrs, "is_bitfield") === "true",
			declaredIn: className,
			overrides: xmlAttribute(attrs, "overrides"),
		} satisfies GodotPropertyMetadata;
	});
}

async function dumpClassDbInstantiable(): Promise<Map<string, boolean>> {
	const tempDir = await mkdtemp(join(tmpdir(), "gdx-classdb-"));
	const dumpPath = resolve(tempDir, "classdb.json");
	const candidates = [
		process.env.GODOT_BIN,
		process.env.GODOT,
		resolve(rootDir, "engine/binary"),
		"godot4",
		"godot",
	].filter((value): value is string => Boolean(value));

	try {
		let lastError: unknown = null;
		for (const executable of new Set(candidates)) {
			try {
				await new Promise<void>((resolvePromise, rejectPromise) => {
					const child = spawn(
						executable,
						["--headless", "--script", dumpScriptPath, "--", dumpPath],
						{
							cwd: rootDir,
							stdio: "inherit",
						},
					);
					child.on("error", rejectPromise);
					child.on("exit", (code) =>
						code === 0
							? resolvePromise()
							: rejectPromise(new Error(`Godot exited with ${code}`)),
					);
				});

				const parsed = JSON.parse(await readFile(dumpPath, "utf8")) as Record<
					string,
					{ instantiable?: boolean }
				>;
				return new Map(
					Object.entries(parsed).map(([name, value]) => [
						name,
						Boolean(value.instantiable),
					]),
				);
			} catch (error) {
				lastError = error;
				if (
					!(error instanceof Error) ||
					!("code" in error) ||
					error.code !== "ENOENT"
				) {
					throw error;
				}
			}
		}

		throw lastError;
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

function flattenMembers(
	className: string,
	classMap: Map<string, XmlClassInfo>,
): GodotPropertyMetadata[] {
	const current = classMap.get(className);
	if (!current) {
		return [];
	}

	const inherited = current.inherits
		? flattenMembers(current.inherits, classMap)
		: [];
	const merged = new Map(inherited.map((member) => [member.name, member]));
	for (const member of current.members) {
		merged.set(member.name, member);
	}

	return Array.from(merged.values());
}

function flattenCallables(
	className: string,
	classMap: Map<string, XmlClassInfo>,
	key: "constructors" | "methods",
): GodotCallableMetadata[] {
	const current = classMap.get(className);
	if (!current) {
		return [];
	}

	const inherited = current.inherits
		? flattenCallables(current.inherits, classMap, key)
		: [];
	const merged = new Map(inherited.map((entry) => [entry.signatureKey, entry]));
	for (const entry of current[key]) {
		merged.set(entry.signatureKey, entry);
	}

	return Array.from(merged.values());
}

async function main() {
	const { docsRoot, cleanup } = await resolveManifestDocs(engineRootArg);

	try {
		const manifest = JSON.parse(
			await readFile(manifestPath, "utf8"),
		) as GodotManifestFile;
		const classFiles = (await walk(resolve(docsRoot, "doc/classes"))).filter(
			(file) => file.endsWith(".xml"),
		);
		const selected = new Map(
			[...manifest.nodes, ...manifest.resources].map((entry) => [
				entry.name,
				entry,
			]),
		);
		const parsedClasses: XmlClassInfo[] = [];
		const allEnums = new Map<string, GodotEnumMetadata>();

		for (const file of classFiles) {
			const xml = await readFile(file, "utf8");
			const name = xmlAttribute(xml, "name");
			if (!name || !selected.has(name)) {
				continue;
			}

			const entry: XmlClassInfo = {
				name,
				inherits: xmlAttribute(xml, "inherits"),
				members: parseMembers(xml, name),
				constructors: parseCallables(xml, name, "constructors", "constructor"),
				methods: parseCallables(xml, name, "methods", "method"),
				enums: parseEnums(xml, name),
			};

			parsedClasses.push(entry);
			for (const item of entry.enums) {
				allEnums.set(item.qualifiedName, item);
			}
		}

		const instantiableByName = await dumpClassDbInstantiable();
		const classMap = new Map(parsedClasses.map((entry) => [entry.name, entry]));
		const classes: GodotClassPropsMetadata[] = [
			...manifest.nodes,
			...manifest.resources,
		]
			.map((entry) => {
				const xml = classMap.get(entry.name);
				return {
					...entry,
					isInstantiable: instantiableByName.get(entry.name) ?? false,
					declaredMembers: xml?.members ?? [],
					allMembers: flattenMembers(entry.name, classMap),
					declaredConstructors: xml?.constructors ?? [],
					allConstructors: flattenCallables(
						entry.name,
						classMap,
						"constructors",
					),
					declaredMethods: xml?.methods ?? [],
					allMethods: flattenCallables(entry.name, classMap, "methods"),
				} satisfies GodotClassPropsMetadata;
			})
			.sort((a, b) => a.name.localeCompare(b.name));

		const output: GodotPropsMetadataFile = {
			version: manifest.version,
			docsBranch: manifest.docsBranch,
			generatedAt: new Date().toISOString(),
			classes,
			enums: Array.from(allEnums.values()).sort((a, b) =>
				a.qualifiedName.localeCompare(b.qualifiedName),
			),
		};

		await mkdir(dirname(outFile), { recursive: true });
		await writeFile(outFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
	} finally {
		await cleanup();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
