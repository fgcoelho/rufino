import type { ReactElement, ReactNode } from "react";

export type SceneScalar = string | number | boolean;

export interface RawValue {
	kind: "raw";
	value: string;
}

export interface ExtResourceValue {
	kind: "ext_resource";
	resourceType: string;
	path: string;
	uid?: string;
}

export interface SubResourceValue {
	kind: "sub_resource";
	resourceType: string;
	props?: SceneProps;
}

export type SceneValue =
	| SceneScalar
	| null
	| RawValue
	| ExtResourceValue
	| SubResourceValue
	| SceneValue[]
	| { [key: string]: SceneValue | undefined };

export type SceneProps = Record<string, SceneValue | undefined>;
export type ResourceProps = SceneProps;

export interface SceneNodeProps {
	name?: string;
	instance?: ExtResourceValue;
	groups?: string[];
	script?: ExtResourceValue | SubResourceValue | null;
	children?: ReactNode;
}

export interface SceneRootProps {
	children?: ReactNode;
}

export type HostNodeProps = SceneNodeProps & {
	[key: string]: unknown;
	gdxType: string;
};

export type HostResourceProps = {
	[key: string]: unknown;
	gdxType: string;
};

export interface SceneNode {
	type: string;
	name: string;
	props: SceneProps;
	groups?: string[];
	instance?: ExtResourceValue;
	children: SceneNode[];
}

export type SceneRenderable = ReactElement | ReactNode | (() => ReactNode);
export type ResourceRenderable = ReactElement | ReactNode | (() => ReactNode);
