export type ManifestKind = "node" | "resource";

export interface GodotClassManifestEntry {
	name: string;
	kind: ManifestKind;
	inherits: string | null;
	brief: string;
	docPath: string;
	docUrl: string;
	sourceHeaderPath: string | null;
	sourceHeaderUrl: string | null;
	sourceImplPath: string | null;
	sourceImplUrl: string | null;
	sourceCategory: string | null;
	tsxTag: string;
	fileBase: string;
}

export interface GodotManifestFile {
	version: string;
	docsBranch: string;
	nodes: GodotClassManifestEntry[];
	resources: GodotClassManifestEntry[];
}

export interface GodotEnumValueMetadata {
	name: string;
	value: number | string;
}

export interface GodotEnumMetadata {
	name: string;
	qualifiedName: string;
	className: string | null;
	isBitfield: boolean;
	values: GodotEnumValueMetadata[];
}

export interface GodotPropertyMetadata {
	name: string;
	type: string;
	defaultExpr: string | null;
	enumRef: string | null;
	isBitfield: boolean;
	declaredIn: string;
	overrides: string | null;
}

export interface GodotValueTypeMetadata {
	type: string;
	defaultExpr: string | null;
	enumRef: string | null;
	isBitfield: boolean;
}

export interface GodotParameterMetadata extends GodotValueTypeMetadata {
	index: number;
	name: string;
	required: boolean;
}

export interface GodotCallableQualifierMetadata {
	raw: string | null;
	isConst: boolean;
	isStatic: boolean;
	isVararg: boolean;
	isVirtual: boolean;
}

export interface GodotCallableMetadata {
	kind: "constructor" | "method";
	name: string;
	signatureKey: string;
	declaredIn: string;
	qualifiers: GodotCallableQualifierMetadata;
	returnType: GodotValueTypeMetadata | null;
	params: GodotParameterMetadata[];
	description: string;
	deprecated: string | null;
	experimental: string | null;
	keywords: string | null;
}

export interface GodotClassPropsMetadata extends GodotClassManifestEntry {
	isInstantiable: boolean;
	declaredMembers: GodotPropertyMetadata[];
	allMembers: GodotPropertyMetadata[];
	declaredConstructors: GodotCallableMetadata[];
	allConstructors: GodotCallableMetadata[];
	declaredMethods: GodotCallableMetadata[];
	allMethods: GodotCallableMetadata[];
}

export interface GodotPropsMetadataFile {
	version: string;
	docsBranch: string;
	generatedAt: string;
	classes: GodotClassPropsMetadata[];
	enums: GodotEnumMetadata[];
}
