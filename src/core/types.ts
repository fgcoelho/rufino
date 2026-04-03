export type SceneScalar = string | number | boolean;

export interface RawValue {
	kind: "raw";
	value: string;
}

export interface ExtResourceValue<TResourceType extends string = string> {
	kind: "ext_resource";
	resourceType: TResourceType;
	path: string;
	uid?: string;
}

export interface SubResourceValue<TResourceType extends string = string> {
	kind: "sub_resource";
	resourceType: TResourceType;
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

export type rufinoKey = string | number;
export type rufinoComponent<TProps extends object = object> = (
	props: TProps,
) => rufinoNode;
export type rufinoElementType = string | rufinoComponent<any> | symbol;

export interface rufinoElement<
	TProps extends object = object,
	TType extends rufinoElementType = rufinoElementType,
> {
	$$typeof: symbol;
	type: TType;
	key: rufinoKey | null;
	props: TProps;
}

export type rufinoNode =
	| rufinoElement
	| SceneScalar
	| null
	| undefined
	| boolean
	| rufinoNode[];

export interface SceneNodeProps {
	name?: string;
	instance?: ExtResourceValue;
	groups?: string[];
	script?: ExtResourceValue | SubResourceValue | null;
	children?: rufinoNode;
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

export type SceneRenderable = rufinoNode | (() => rufinoNode);
export type ResourceRenderable = rufinoNode | (() => rufinoNode);
