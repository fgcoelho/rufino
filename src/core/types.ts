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

export type AcutisKey = string | number;
export type AcutisComponent<TProps extends object = object> = (
	props: TProps,
) => AcutisNode;
export type AcutisElementType = string | AcutisComponent<any> | symbol;

export interface AcutisElement<
	TProps extends object = object,
	TType extends AcutisElementType = AcutisElementType,
> {
	$$typeof: symbol;
	type: TType;
	key: AcutisKey | null;
	props: TProps;
}

export type AcutisNode =
	| AcutisElement
	| SceneScalar
	| null
	| undefined
	| boolean
	| AcutisNode[];

export interface SceneNodeProps {
	name?: string;
	instance?: ExtResourceValue;
	groups?: string[];
	script?: ExtResourceValue | SubResourceValue | null;
	children?: AcutisNode;
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

export type SceneRenderable = AcutisNode | (() => AcutisNode);
export type ResourceRenderable = AcutisNode | (() => AcutisNode);
