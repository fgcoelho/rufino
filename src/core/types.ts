export type SceneScalar = string | number | boolean;

export type ProjectConfigScalar = SceneScalar;

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
	ops?: ResourceMethodCall[];
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

export interface ResourceMethodCall {
	resourceType: string;
	method: string;
	args: SceneValue[];
}

export interface NodeMethodCall {
	nodeType: string;
	method: string;
	args: SceneValue[];
}

export type rufinoKey = string | number;
export type rufinoComponent<TProps extends object = object> = (
	props: TProps,
) => rufinoNode;
export type RufinoElementType = string | rufinoComponent<any> | symbol;

export interface RufinoElement<
	TProps extends object = object,
	TType extends RufinoElementType = RufinoElementType,
> {
	$$typeof: symbol;
	type: TType;
	key: rufinoKey | null;
	props: TProps;
}

export type rufinoNode =
	| RufinoElement
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

export interface HostNodeMethodProps {
	method: string;
	nodeType: string;
	args: unknown[];
	children?: never;
}

export type HostNodeProps = SceneNodeProps & {
	[key: string]: unknown;
	gdxType: string;
};

export type HostResourceProps = {
	[key: string]: unknown;
	gdxType: string;
	children?: rufinoNode;
};

export interface HostResourceMethodProps {
	method: string;
	resourceType: string;
	args: unknown[];
	children?: never;
}

export interface SceneNode {
	type: string;
	name: string;
	props: SceneProps;
	groups?: string[];
	instance?: ExtResourceValue;
	children: SceneNode[];
	ops?: NodeMethodCall[];
}

export type SceneRenderable = rufinoNode | (() => rufinoNode);
export type ResourceRenderable = rufinoNode | (() => rufinoNode);

export type ResourceComponent<
	TProps extends object = object,
	TMethods extends object = object,
> = ((props: TProps) => RufinoElement) & TMethods;

export type NodeComponent<
	TProps extends object = object,
	TMethods extends object = object,
> = ((props: TProps) => RufinoElement) & TMethods;

export type ProjectConfigValue = ProjectConfigScalar | RawValue;

export interface ProjectConfigDocument {
	kind: "project_config";
	settings: Record<string, ProjectConfigValue | undefined>;
	sections: Record<
		string,
		Record<string, ProjectConfigValue | undefined> | undefined
	>;
}

export interface ProjectConfigProps {
	config_version?: number;
	sections?: Record<
		string,
		Record<string, ProjectConfigValue | undefined> | undefined
	>;
	children?: never;
}
