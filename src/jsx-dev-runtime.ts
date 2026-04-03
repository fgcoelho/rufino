import type {
	rufinoComponent,
	rufinoElement,
	rufinoKey,
	rufinoNode,
} from "./core/types.ts";

export { Fragment, jsxDEV } from "./core/jsx.ts";

export namespace JSX {
	export type Element = rufinoElement;
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
	export type LibraryManagedAttributes<_C, P> = P;
}
