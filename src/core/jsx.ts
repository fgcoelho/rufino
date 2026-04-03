import type {
	RufinoElement,
	RufinoElementType,
	rufinoComponent,
	rufinoKey,
	rufinoNode,
} from "./types.ts";

export const rufino_ELEMENT_TYPE = Symbol.for("rufino.element");
export const Fragment = Symbol.for("rufino.fragment");

export function createElement<TType extends RufinoElementType>(
	type: TType,
	props: object | null = {},
	key: rufinoKey | null = null,
): RufinoElement<object, TType> {
	return {
		$$typeof: rufino_ELEMENT_TYPE,
		type,
		key,
		props: props ?? {},
	};
}

export function jsx(
	type: RufinoElementType,
	props: object,
	key?: rufinoKey,
): RufinoElement {
	return createElement(type, props, key ?? null);
}

export const jsxs = jsx;

export function jsxDEV(
	type: RufinoElementType,
	props: object,
	key?: rufinoKey,
): RufinoElement {
	return createElement(type, props, key ?? null);
}

export function isElement(value: unknown): value is RufinoElement {
	return (
		typeof value === "object" &&
		value !== null &&
		"$$typeof" in value &&
		value.$$typeof === rufino_ELEMENT_TYPE
	);
}

export function isComponent(value: unknown): value is rufinoComponent {
	return typeof value === "function";
}

export function flattenChildren(node: rufinoNode): rufinoNode[] {
	if (Array.isArray(node)) {
		return node.flatMap(flattenChildren);
	}

	return [node];
}
