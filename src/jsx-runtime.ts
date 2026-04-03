import type {
	RufinoElement,
	rufinoComponent,
	rufinoKey,
	rufinoNode,
} from "./core/types.ts";

export { Fragment, jsx, jsxs } from "./core/jsx.ts";

export namespace JSX {
	export type Element = RufinoElement;
	export type ElementType = string | rufinoComponent<any>;
	export interface ElementChildrenAttribute {
		children: {};
	}
	export interface IntrinsicAttributes {
		key?: rufinoKey;
	}
	export interface IntrinsicElements {
		[elementName: string]: Record<string, unknown>;
	}
	export interface IntrinsicClassAttributes<T> {
		ref?: T;
	}
	export type Fragment = rufinoNode;
	// biome-ignore lint/suspicious/noExplicitAny: JSX lib shape
	export type LibraryManagedAttributes<C, P> = P;
}
