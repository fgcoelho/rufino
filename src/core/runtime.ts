import type {
	GodotResourceClassName,
	InstantiableGodotResourceClassName,
} from "../generated/props.ts";
import type { AnyType } from "../types.ts";
import {
	createElement,
	Fragment,
	flattenChildren,
	isComponent,
	isElement,
} from "./jsx.ts";
import type {
	AcutisElement,
	AcutisNode,
	ExtResourceValue,
	HostNodeProps,
	HostResourceProps,
	RawValue,
	ResourceProps,
	ResourceRenderable,
	SceneNode,
	SceneNodeProps,
	SceneProps,
	SceneRenderable,
	SceneValue,
	SubResourceValue,
} from "./types.ts";

const GDX_NODE = "gdx-node";
const GDX_RESOURCE = "gdx-resource";

function createHostNode(type: string, props: SceneNodeProps) {
	return createElement(GDX_NODE, { ...props, gdxType: type });
}

function createHostResource(type: string, props: ResourceProps = {}) {
	return createElement(GDX_RESOURCE, { ...props, gdxType: type });
}

export function createNodeType<TProps extends SceneNodeProps>(type: string) {
	return function GdxNodeComponent(props: TProps) {
		return createHostNode(type, props);
	};
}

export function createResourceType<TProps extends object>(
	resourceType: string,
) {
	return function GdxResourceComponent(props: TProps) {
		return createHostResource(resourceType, props as ResourceProps);
	};
}

export function GodotNode(props: HostNodeProps) {
	return createElement(GDX_NODE, props);
}

export function GodotResource(props: HostResourceProps) {
	return createElement(GDX_RESOURCE, props);
}

export { Fragment };

export function raw(value: string): RawValue {
	return { kind: "raw", value };
}

export function Vector2(x: number, y: number): RawValue {
	return raw(`Vector2(${x}, ${y})`);
}

export function Vector3(x: number, y: number, z: number): RawValue {
	return raw(`Vector3(${x}, ${y}, ${z})`);
}

export function Color(r: number, g: number, b: number, a = 1): RawValue {
	return raw(`Color(${r}, ${g}, ${b}, ${a})`);
}

export function NodePath(path: string): RawValue {
	return raw(`NodePath(${JSON.stringify(path)})`);
}

export function PackedStringArray(...values: string[]): RawValue {
	return raw(
		`PackedStringArray(${values.map((value) => JSON.stringify(value)).join(", ")})`,
	);
}

export function ExtResource<TResourceType extends GodotResourceClassName>(
	resourceType: TResourceType,
	path: string,
	uid?: string,
): ExtResourceValue<TResourceType> {
	return { kind: "ext_resource", resourceType, path, uid };
}

export function SubResource<
	TResourceType extends InstantiableGodotResourceClassName,
>(
	resourceType: TResourceType,
	props?: SceneProps,
): SubResourceValue<TResourceType> {
	return { kind: "sub_resource", resourceType, props };
}

function normalizeChildren(node: AcutisNode): AcutisNode[] {
	const resolved: AcutisNode[] = [];
	for (const child of flattenChildren(node)) {
		if (typeof child === "string") {
			if (child.trim()) {
				resolved.push(child);
			}

			continue;
		}

		if (typeof child === "number") {
			resolved.push(child);
			continue;
		}

		resolved.push(child);
	}

	return resolved;
}

function resolveRenderable(
	renderable: SceneRenderable | ResourceRenderable,
): AcutisNode {
	if (typeof renderable === "function") {
		return createElement(renderable, {});
	}

	return renderable;
}

function resolveElement(element: AcutisElement<AnyType, AnyType>): AcutisNode {
	let current: AcutisNode = element;

	while (isElement(current)) {
		const currentElement = current as AcutisElement<AnyType, AnyType>;

		if (currentElement.type === Fragment) {
			return normalizeChildren(currentElement.props.children);
		}

		if (isComponent(currentElement.type)) {
			if (
				"prototype" in currentElement.type &&
				"render" in (currentElement.type.prototype ?? {})
			) {
				throw new Error(
					"Class components are not supported in GDX scenes or resources",
				);
			}

			current = currentElement.type(currentElement.props);
			continue;
		}

		return currentElement;
	}

	return current;
}

function resolveResourceValue(value: unknown): SceneValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => resolveResourceValue(entry));
	}

	if (isElement(value)) {
		return renderResource(
			resolveElement(value as AcutisElement<AnyType, AnyType>),
		);
	}

	if (isRawValue(value) || isExtResource(value) || isSubResource(value)) {
		return value;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value).filter(
			([, entry]) => typeof entry !== "undefined",
		);
		return Object.fromEntries(
			entries.map(([key, entry]) => [key, resolveResourceValue(entry)]),
		);
	}

	throw new Error(`Unsupported prop value in GDX document: ${String(value)}`);
}

function resolveNode(node: AcutisNode): SceneNode[] {
	if (node === null || node === undefined || typeof node === "boolean") {
		return [];
	}

	if (Array.isArray(node)) {
		return node.flatMap(resolveNode);
	}

	if (typeof node === "string" || typeof node === "number") {
		throw new Error(
			`Text children are not supported in Godot scenes: ${String(node)}`,
		);
	}

	if (!isElement(node)) {
		throw new Error("Unsupported Acutis node in scene tree");
	}

	const resolved = resolveElement(node as AcutisElement<AnyType, AnyType>);
	if (resolved !== node) {
		return resolveNode(resolved);
	}

	const element = node as AcutisElement<HostNodeProps, typeof GDX_NODE>;

	if (element.type !== GDX_NODE) {
		throw new Error(
			`Unsupported host element in scene tree: ${String(element.type)}`,
		);
	}

	const props = element.props as HostNodeProps;
	const { children, gdxType, name, groups, instance, ...rest } = props;
	const resolvedChildren = normalizeChildren(children).flatMap(resolveNode);
	const resolvedProps = Object.fromEntries(
		Object.entries(rest)
			.filter(([, value]) => typeof value !== "undefined")
			.map(([key, value]) => [key, resolveResourceValue(value)]),
	) as SceneProps;

	return [
		{
			type: gdxType,
			name: name ?? gdxType,
			props: resolvedProps,
			groups,
			instance,
			children: resolvedChildren,
		},
	];
}

export function renderScene(renderable: SceneRenderable): SceneNode {
	const resolved = resolveRenderable(renderable);
	if (!isElement(resolved)) {
		throw new Error("Scene document must render a node root");
	}

	const sceneRoot = resolveElement(resolved as AcutisElement<AnyType, AnyType>);
	const roots = normalizeChildren(sceneRoot).flatMap(resolveNode);
	if (roots.length !== 1) {
		throw new Error(
			`Scene must resolve to exactly one root node, got ${roots.length}`,
		);
	}

	return roots[0];
}

export function renderResource(
	renderable: ResourceRenderable,
): SubResourceValue {
	const resolved = resolveRenderable(renderable);
	if (!isElement(resolved)) {
		throw new Error("Resource document must render a resource component root");
	}

	const resourceRoot = resolveElement(
		resolved as AcutisElement<AnyType, AnyType>,
	);
	if (!isElement(resourceRoot)) {
		throw new Error("Resource document must render a resource component root");
	}

	const element = resourceRoot as AcutisElement<HostResourceProps, AnyType>;
	if (element.type !== GDX_RESOURCE) {
		throw new Error(
			`Unsupported host element in resource tree: ${String(element.type)}`,
		);
	}

	const { children, gdxType, ...rest } = element.props as HostResourceProps;
	if (typeof children !== "undefined") {
		throw new Error("Resource components do not support children");
	}

	return {
		kind: "sub_resource",
		resourceType: gdxType,
		props: Object.fromEntries(
			Object.entries(rest)
				.filter(([, value]) => typeof value !== "undefined")
				.map(([key, value]) => [key, resolveResourceValue(value)]),
		) as SceneProps,
	};
}

export function isRawValue(value: unknown): value is RawValue {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		value.kind === "raw"
	);
}

export function isExtResource(value: unknown): value is ExtResourceValue {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		value.kind === "ext_resource"
	);
}

export function isSubResource(value: unknown): value is SubResourceValue {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		value.kind === "sub_resource"
	);
}
