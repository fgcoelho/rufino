import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	isExtResource,
	isRawValue,
	isSubResource,
	renderScene,
} from "./runtime.ts";
import type {
	ExtResourceValue,
	SceneNode,
	SceneProps,
	SceneRenderable,
	SceneValue,
	SubResourceValue,
} from "./types.ts";

interface CollectedExtResource extends ExtResourceValue {
	id: string;
}

interface CollectedSubResource extends SubResourceValue {
	id: string;
}

interface RenderContext {
	extResources: CollectedExtResource[];
	extResourceIds: Map<string, string>;
	subResources: CollectedSubResource[];
	subResourceIds: Map<SubResourceValue, string>;
}

function normalizeResPath(path: string) {
	return path;
}

function escapeString(value: string) {
	return JSON.stringify(value);
}

function ensureExtResource(context: RenderContext, resource: ExtResourceValue) {
	const normalizedPath = normalizeResPath(resource.path);
	const key = `${resource.resourceType}:${resource.uid ?? ""}:${normalizedPath}`;
	const existing = context.extResourceIds.get(key);
	if (existing) {
		return existing;
	}

	const id = `${context.extResources.length + 1}`;
	context.extResourceIds.set(key, id);
	context.extResources.push({ ...resource, path: normalizedPath, id });
	return id;
}

function ensureSubResource(context: RenderContext, resource: SubResourceValue) {
	const existing = context.subResourceIds.get(resource);
	if (existing) {
		return existing;
	}

	const id = `${resource.resourceType}_${context.subResources.length + 1}`;
	context.subResourceIds.set(resource, id);
	context.subResources.push({ ...resource, id });
	return id;
}

function stringifyValue(context: RenderContext, value: SceneValue): string {
	if (typeof value === "string") {
		return escapeString(value);
	}

	if (value === null) {
		return "null";
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((entry) => stringifyValue(context, entry)).join(", ")}]`;
	}

	if (isRawValue(value)) {
		return value.value;
	}

	if (isExtResource(value)) {
		return `ExtResource(${escapeString(ensureExtResource(context, value))})`;
	}

	if (isSubResource(value)) {
		return `SubResource(${escapeString(ensureSubResource(context, value))})`;
	}

	return `{${Object.entries(value)
		.filter(([, entry]) => typeof entry !== "undefined")
		.map(
			([key, entry]) =>
				`${escapeString(key)}: ${stringifyValue(context, entry as SceneValue)}`,
		)
		.join(", ")}}`;
}

function collectValue(
	context: RenderContext,
	value: SceneValue | undefined,
): void {
	if (typeof value === "undefined" || value === null) {
		return;
	}

	if (Array.isArray(value)) {
		value.forEach((entry) => {
			collectValue(context, entry);
		});

		return;
	}

	if (typeof value === "object") {
		if (isExtResource(value)) {
			ensureExtResource(context, value);
			return;
		}

		if (isSubResource(value)) {
			ensureSubResource(context, value);
			Object.values(value.props ?? {}).forEach((entry) => {
				collectValue(context, entry);
			});

			return;
		}

		if (!isRawValue(value)) {
			Object.values(value).forEach((entry) => {
				collectValue(context, entry as SceneValue | undefined);
			});
		}
	}
}

function collectNode(context: RenderContext, node: SceneNode): void {
	if (node.instance) {
		ensureExtResource(context, node.instance);
	}

	Object.values(node.props).forEach((value) => {
		collectValue(context, value);
	});

	node.children.forEach((child) => {
		collectNode(context, child);
	});
}

function renderProps(context: RenderContext, props: SceneProps) {
	return Object.entries(props)
		.filter(([, value]) => typeof value !== "undefined")
		.map(
			([key, value]) =>
				`${key} = ${stringifyValue(context, value as SceneValue)}`,
		)
		.join("\n");
}

function renderExtResources(context: RenderContext) {
	return context.extResources
		.map((resource) => {
			const uidText = resource.uid ? ` uid=${escapeString(resource.uid)}` : "";
			return `[ext_resource type=${escapeString(resource.resourceType)}${uidText} path=${escapeString(resource.path)} id=${escapeString(resource.id)}]`;
		})
		.join("\n");
}

function renderSubResources(context: RenderContext) {
	return context.subResources
		.map((resource) => {
			const propsText = renderProps(context, resource.props ?? {});
			return propsText
				? `[sub_resource type=${escapeString(resource.resourceType)} id=${escapeString(resource.id)}]\n${propsText}`
				: `[sub_resource type=${escapeString(resource.resourceType)} id=${escapeString(resource.id)}]`;
		})
		.join("\n\n");
}

function renderNodes(
	context: RenderContext,
	node: SceneNode,
	parentPath?: string,
): string[] {
	const headerParts = [`name=${escapeString(node.name)}`];
	if (parentPath) {
		headerParts.push(`parent=${escapeString(parentPath)}`);
	}

	if (node.instance) {
		headerParts.push(
			`instance=ExtResource(${escapeString(ensureExtResource(context, node.instance))})`,
		);
	} else {
		headerParts.push(`type=${escapeString(node.type)}`);
	}

	if (node.groups?.length) {
		headerParts.push(`groups=${stringifyValue(context, node.groups)}`);
	}

	const propsText = renderProps(context, node.props);
	const block = propsText
		? [`[node ${headerParts.join(" ")}]`, propsText].join("\n")
		: `[node ${headerParts.join(" ")}]`;

	const nextParentPath = parentPath ? `${parentPath}/${node.name}` : ".";
	return [
		block,
		...node.children.flatMap((child) =>
			renderNodes(context, child, nextParentPath),
		),
	];
}

export function renderSceneText(renderable: SceneRenderable) {
	const root = renderScene(renderable);
	const context: RenderContext = {
		extResources: [],
		extResourceIds: new Map(),
		subResources: [],
		subResourceIds: new Map(),
	};

	collectNode(context, root);

	const sections = ["[gd_scene format=3]"];
	const extResourcesText = renderExtResources(context);
	if (extResourcesText) {
		sections.push(extResourcesText);
	}

	const subResourcesText = renderSubResources(context);
	if (subResourcesText) {
		sections.push(subResourcesText);
	}

	sections.push(renderNodes(context, root).join("\n\n"));
	return `${sections.join("\n\n")}\n`;
}

export async function createScene(
	renderable: SceneRenderable,
	outFile: string,
) {
	await mkdir(dirname(outFile), { recursive: true });
	await writeFile(outFile, renderSceneText(renderable), "utf8");
}
