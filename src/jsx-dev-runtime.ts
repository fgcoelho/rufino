import type {
	AcutisComponent,
	AcutisElement,
	AcutisKey,
	AcutisNode,
} from "./core/types.ts";

export { Fragment, jsxDEV } from "./core/jsx.ts";

export namespace JSX {
	export type Element = AcutisElement;
	export type ElementType = string | AcutisComponent<any>;
	export interface ElementChildrenAttribute {
		children: {};
	}
	export interface IntrinsicAttributes {
		key?: AcutisKey;
	}
	export interface IntrinsicElements {
		[elementName: string]: Record<string, unknown>;
	}
	export interface IntrinsicClassAttributes<T> {
		ref?: T;
	}
	export type Fragment = AcutisNode;
	export type LibraryManagedAttributes<_C, P> = P;
}
