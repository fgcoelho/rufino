import { createElement, isComponent, isElement } from "./core/jsx.ts";
import { raw } from "./core/runtime.ts";
import type {
	ProjectConfigDocument,
	ProjectConfigProps,
	ProjectConfigValue,
	RufinoElement,
	RufinoElementType,
} from "./core/types.ts";
import type { AnyType } from "./types.ts";

const GDX_PROJECT_CONFIG = Symbol.for("rufino.project_config");

export function ProjectConfig(props: ProjectConfigProps): RufinoElement {
	return createElement(GDX_PROJECT_CONFIG as RufinoElementType, props);
}

function resolveProjectConfigValue(value: unknown): ProjectConfigValue {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		value.kind === "raw"
	) {
		return value as ProjectConfigValue;
	}

	throw new Error(
		`Unsupported ProjectConfig value: ${value === null ? "null" : typeof value}`,
	);
}

function resolveProjectConfigElement(
	element: RufinoElement<object, AnyType>,
): ProjectConfigDocument | unknown {
	let current: unknown = element;

	while (isElement(current)) {
		const currentElement = current as RufinoElement<object, AnyType>;
		if (currentElement.type === GDX_PROJECT_CONFIG) {
			const {
				config_version,
				sections = {},
				children,
				...rest
			} = currentElement.props as ProjectConfigProps;

			if (typeof children !== "undefined") {
				throw new Error("ProjectConfig does not support children");
			}

			return {
				kind: "project_config",
				settings: {
					...rest,
					config_version,
				},
				sections,
			};
		}

		if (!isComponent(currentElement.type)) {
			return current;
		}

		current = currentElement.type(currentElement.props);
	}

	return current;
}

export function renderProjectConfig(
	renderable: unknown,
): ProjectConfigDocument {
	const resolved =
		typeof renderable === "function"
			? createElement(renderable as AnyType, {})
			: renderable;

	const document = isElement(resolved)
		? resolveProjectConfigElement(resolved as RufinoElement<object, AnyType>)
		: resolved;

	if (
		!document ||
		typeof document !== "object" ||
		!("kind" in document) ||
		document.kind !== "project_config"
	) {
		throw new Error("Project config source must export <ProjectConfig ... />");
	}

	const typed = document as ProjectConfigDocument;
	const settings = Object.fromEntries(
		Object.entries(typed.settings)
			.filter(([, value]) => typeof value !== "undefined")
			.map(([key, value]) => [key, resolveProjectConfigValue(value)]),
	);
	const sections = Object.fromEntries(
		Object.entries(typed.sections)
			.filter(([, section]) => typeof section !== "undefined")
			.map(([sectionName, section]) => [
				sectionName,
				Object.fromEntries(
					Object.entries(section ?? {})
						.filter(([, value]) => typeof value !== "undefined")
						.map(([key, value]) => [key, resolveProjectConfigValue(value)]),
				),
			]),
	);

	return {
		kind: "project_config",
		settings,
		sections,
	};
}

function escapeProjectString(value: string): string {
	return JSON.stringify(value);
}

function formatProjectConfigValue(value: ProjectConfigValue): string {
	if (typeof value === "string") {
		return escapeProjectString(value);
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return value.value;
}

export function renderProjectConfigText(
	document: ProjectConfigDocument,
): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(document.settings)) {
		if (typeof value === "undefined") {
			continue;
		}
		lines.push(`${key}=${formatProjectConfigValue(value)}`);
	}

	const sectionEntries = Object.entries(document.sections).filter(
		([, values]) => typeof values !== "undefined",
	);

	for (const [sectionName, values] of sectionEntries) {
		if (lines.length > 0) {
			lines.push("");
		}

		lines.push(`[${sectionName}]`);
		lines.push("");

		for (const [key, value] of Object.entries(values ?? {})) {
			if (typeof value === "undefined") {
				continue;
			}
			lines.push(`${key}=${formatProjectConfigValue(value)}`);
		}
	}

	return `${lines.join("\n")}\n`;
}

export { raw };
