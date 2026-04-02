import { godotClassPropsMap } from "../../godot-manifest/props.ts";
import { isExtResource, isSubResource } from "../core/runtime.ts";
import type { SceneNode, SceneValue, SubResourceValue } from "../core/types.ts";

function validateValue(value: SceneValue): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return;
	}

	if (Array.isArray(value)) {
		value.forEach(validateValue);
		return;
	}

	if (isExtResource(value)) {
		return;
	}

	if (isSubResource(value)) {
		validateResource(value);
		return;
	}

	for (const nested of Object.values(value)) {
		if (typeof nested !== "undefined") {
			validateValue(nested);
		}
	}
}

export function validateResource(resource: SubResourceValue): void {
	const metadata = godotClassPropsMap.get(resource.resourceType);
	if (!metadata) {
		throw new Error(`Unknown Godot resource type: ${resource.resourceType}`);
	}

	const allowed = new Set(metadata.allMembers.map((member) => member.name));
	allowed.add("script");
	for (const [key, value] of Object.entries(resource.props ?? {})) {
		if (!allowed.has(key)) {
			throw new Error(
				`Unknown prop ${JSON.stringify(key)} on Godot resource ${resource.resourceType}`,
			);
		}

		if (typeof value !== "undefined") {
			validateValue(value);
		}
	}
}

export function validateSceneNode(node: SceneNode): void {
	const metadata = godotClassPropsMap.get(node.type);
	if (!metadata) {
		throw new Error(`Unknown Godot node type: ${node.type}`);
	}

	const allowed = new Set(metadata.allMembers.map((member) => member.name));
	allowed.add("script");
	for (const [key, value] of Object.entries(node.props)) {
		if (!allowed.has(key)) {
			throw new Error(
				`Unknown prop ${JSON.stringify(key)} on Godot node ${node.type}`,
			);
		}

		if (typeof value !== "undefined") {
			validateValue(value);
		}
	}

	node.children.forEach(validateSceneNode);
}
