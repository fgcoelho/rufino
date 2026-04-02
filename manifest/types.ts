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

export interface GodotClassPropsMetadata extends GodotClassManifestEntry {
	isInstantiable: boolean;
	declaredMembers: GodotPropertyMetadata[];
	allMembers: GodotPropertyMetadata[];
}

export interface GodotPropsMetadataFile {
	version: string;
	docsBranch: string;
	generatedAt: string;
	classes: GodotClassPropsMetadata[];
	enums: GodotEnumMetadata[];
}
