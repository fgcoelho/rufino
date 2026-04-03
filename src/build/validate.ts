import { isExtResource, isSubResource } from "../core/runtime.ts";
import type { SceneNode, SceneValue, SubResourceValue } from "../core/types.ts";
import {
	godotAllowedMethodNamesByClass,
	godotAllowedPropNamesByClass,
} from "../generated/validate.ts";
import { resourceSchemaPropNames } from "../resource-schemas.ts";

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
	const allowedPropNames = godotAllowedPropNamesByClass.get(
		resource.resourceType,
	);
	if (!allowedPropNames) {
		throw new Error(`Unknown Godot resource type: ${resource.resourceType}`);
	}

	const allowed = new Set(allowedPropNames);
	allowed.add("script");
	for (const propName of resourceSchemaPropNames.get(resource.resourceType) ??
		[]) {
		allowed.add(propName);
	}
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

	const allowedMethodNames = godotAllowedMethodNamesByClass.get(
		resource.resourceType,
	);
	if (!allowedMethodNames) {
		throw new Error(`Unknown Godot resource type: ${resource.resourceType}`);
	}

	const allowedMethods = new Set(allowedMethodNames);
	for (const op of resource.ops ?? []) {
		if (op.resourceType !== resource.resourceType) {
			throw new Error(
				`Resource method ${JSON.stringify(op.method)} targets ${op.resourceType}, but parent resource is ${resource.resourceType}`,
			);
		}

		if (!allowedMethods.has(op.method)) {
			throw new Error(
				`Unknown method ${JSON.stringify(op.method)} on Godot resource ${resource.resourceType}`,
			);
		}

		for (const arg of op.args) {
			validateValue(arg);
		}
	}
}

export function validateSceneNode(node: SceneNode): void {
	const allowedPropNames = godotAllowedPropNamesByClass.get(node.type);
	if (!allowedPropNames) {
		throw new Error(`Unknown Godot node type: ${node.type}`);
	}

	const allowed = new Set(allowedPropNames);
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

	const allowedMethodNames = godotAllowedMethodNamesByClass.get(node.type);
	if (!allowedMethodNames) {
		throw new Error(`Unknown Godot node type: ${node.type}`);
	}

	const allowedMethods = new Set(allowedMethodNames);
	for (const op of node.ops ?? []) {
		if (op.nodeType !== node.type) {
			throw new Error(
				`Node method ${JSON.stringify(op.method)} targets ${op.nodeType}, but parent node is ${node.type}`,
			);
		}

		if (!allowedMethods.has(op.method)) {
			throw new Error(
				`Unknown method ${JSON.stringify(op.method)} on Godot node ${node.type}`,
			);
		}

		for (const arg of op.args) {
			validateValue(arg);
		}
	}

	node.children.forEach(validateSceneNode);
}
