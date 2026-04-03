import {
	isExtResource,
	isRawValue,
	isSubResource,
	renderResource,
	renderScene,
} from "../core/runtime.ts";
import type {
	ExtResourceValue,
	ResourceProps,
	ResourceRenderable,
	SceneNode,
	SceneRenderable,
	SceneValue,
	SubResourceValue,
} from "../core/types.ts";

export interface IrRawValue {
	kind: "raw";
	value: string;
}

export interface IrExtResourceValue {
	kind: "ext_resource";
	resourceType: string;
	path: string;
	uid?: string;
}

export interface IrSubResourceValue {
	kind: "sub_resource";
	id: string;
	resourceType: string;
	props: IrProps;
	ops: IrResourceMethodCall[];
}

export interface IrSubResourceRefValue {
	kind: "sub_resource_ref";
	id: string;
}

export type IrValue =
	| string
	| number
	| boolean
	| null
	| IrRawValue
	| IrExtResourceValue
	| IrSubResourceValue
	| IrSubResourceRefValue
	| IrValue[]
	| { [key: string]: IrValue };

export type IrProps = Record<string, IrValue>;

export interface IrResourceMethodCall {
	resourceType: string;
	method: string;
	args: IrValue[];
}

export interface IrNode {
	class: string;
	name: string;
	props: IrProps;
	groups?: string[];
	instance?: IrExtResourceValue;
	children: IrNode[];
	ops: IrNodeMethodCall[];
}

export interface IrNodeMethodCall {
	nodeType: string;
	method: string;
	args: IrValue[];
}

export interface IrSceneDocument {
	kind: "scene";
	outputPath: string;
	root: IrNode;
}

export interface IrResourceDocument {
	kind: "resource";
	outputPath: string;
	root: IrSubResourceValue;
}

export type IrDocument = IrSceneDocument | IrResourceDocument;

export interface IrBatch {
	version: 1;
	documents: IrDocument[];
}

interface SerializeContext {
	subResourceIds: Map<SubResourceValue, string>;
	serializedSubResources: Set<SubResourceValue>;
	nextSubResourceId: number;
}

type ValidateModule = typeof import("./validate.ts");

let validateModulePromise: Promise<ValidateModule> | null = null;

async function loadValidateModule(): Promise<ValidateModule> {
	validateModulePromise ??= import("./validate.ts");
	return validateModulePromise;
}

function createContext(): SerializeContext {
	return {
		subResourceIds: new Map(),
		serializedSubResources: new Set(),
		nextSubResourceId: 1,
	};
}

function toIrExtResource(resource: ExtResourceValue): IrExtResourceValue {
	return {
		kind: "ext_resource",
		resourceType: resource.resourceType,
		path: resource.path,
		uid: resource.uid,
	};
}

function toIrProps(context: SerializeContext, props: ResourceProps): IrProps {
	const entries = Object.entries(props)
		.filter(([, value]) => typeof value !== "undefined")
		.map(([key, value]) => [key, toIrValue(context, value as SceneValue)]);
	return Object.fromEntries(entries);
}

function ensureSubResourceId(
	context: SerializeContext,
	resource: SubResourceValue,
): string {
	const existing = context.subResourceIds.get(resource);
	if (existing) {
		return existing;
	}

	const id = `${resource.resourceType}_${context.nextSubResourceId++}`;
	context.subResourceIds.set(resource, id);
	return id;
}

function toIrSubResource(
	context: SerializeContext,
	resource: SubResourceValue,
): IrSubResourceValue | IrSubResourceRefValue {
	const id = ensureSubResourceId(context, resource);
	if (context.serializedSubResources.has(resource)) {
		return { kind: "sub_resource_ref", id };
	}

	context.serializedSubResources.add(resource);
	return {
		kind: "sub_resource",
		id,
		resourceType: resource.resourceType,
		props: toIrProps(context, resource.props ?? {}),
		ops: (resource.ops ?? []).map((op) => ({
			resourceType: op.resourceType,
			method: op.method,
			args: op.args.map((arg) => toIrValue(context, arg)),
		})),
	};
}

function toIrValue(context: SerializeContext, value: SceneValue): IrValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => toIrValue(context, entry));
	}

	if (isRawValue(value)) {
		return { kind: "raw", value: value.value };
	}

	if (isExtResource(value)) {
		return toIrExtResource(value);
	}

	if (isSubResource(value)) {
		return toIrSubResource(context, value);
	}

	const entries = Object.entries(value)
		.filter(([, entry]) => typeof entry !== "undefined")
		.map(([key, entry]) => [key, toIrValue(context, entry as SceneValue)]);
	return Object.fromEntries(entries);
}

function toIrNode(context: SerializeContext, node: SceneNode): IrNode {
	return {
		class: node.type,
		name: node.name,
		props: toIrProps(context, node.props),
		groups: node.groups,
		instance: node.instance ? toIrExtResource(node.instance) : undefined,
		children: node.children.map((child) => toIrNode(context, child)),
		ops: (node.ops ?? []).map((op) => ({
			nodeType: op.nodeType,
			method: op.method,
			args: op.args.map((arg) => toIrValue(context, arg)),
		})),
	};
}

export async function serializeSceneDocument(
	renderable: SceneRenderable,
	outputPath: string,
): Promise<IrSceneDocument> {
	const context = createContext();
	const root = renderScene(renderable);
	const { validateSceneNode } = await loadValidateModule();
	validateSceneNode(root);
	return {
		kind: "scene",
		outputPath,
		root: toIrNode(context, root),
	};
}

export async function serializeResourceDocument(
	renderable: ResourceRenderable,
	outputPath: string,
): Promise<IrResourceDocument> {
	const context = createContext();
	const resource = renderResource(renderable);
	const { validateResource } = await loadValidateModule();
	validateResource(resource);
	const root = toIrSubResource(context, resource);
	if (root.kind !== "sub_resource") {
		throw new Error(
			"Top-level resource document must serialize as a concrete resource definition.",
		);
	}

	return {
		kind: "resource",
		outputPath,
		root,
	};
}
