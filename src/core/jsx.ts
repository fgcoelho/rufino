import type {
	AcutisComponent,
	AcutisElement,
	AcutisElementType,
	AcutisKey,
	AcutisNode,
} from "./types.ts";

export const ACUTIS_ELEMENT_TYPE = Symbol.for("acutis.element");
export const Fragment = Symbol.for("acutis.fragment");

export function createElement<TType extends AcutisElementType>(
	type: TType,
	props: object | null = {},
	key: AcutisKey | null = null,
): AcutisElement<object, TType> {
	return {
		$$typeof: ACUTIS_ELEMENT_TYPE,
		type,
		key,
		props: props ?? {},
	};
}

export function jsx(
	type: AcutisElementType,
	props: object,
	key?: AcutisKey,
): AcutisElement {
	return createElement(type, props, key ?? null);
}

export const jsxs = jsx;

export function jsxDEV(
	type: AcutisElementType,
	props: object,
	key?: AcutisKey,
): AcutisElement {
	return createElement(type, props, key ?? null);
}

export function isElement(value: unknown): value is AcutisElement {
	return (
		typeof value === "object" &&
		value !== null &&
		"$$typeof" in value &&
		value.$$typeof === ACUTIS_ELEMENT_TYPE
	);
}

export function isComponent(value: unknown): value is AcutisComponent {
	return typeof value === "function";
}

export function flattenChildren(node: AcutisNode): AcutisNode[] {
	if (Array.isArray(node)) {
		return node.flatMap(flattenChildren);
	}

	return [node];
}
