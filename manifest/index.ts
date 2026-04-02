import manifest from "./godot-4.6-stable.json" with { type: "json" };
import type { GodotManifestFile } from "./types.ts";

const godotManifest = manifest as GodotManifestFile;

export const GODOT_MANIFEST_VERSION = godotManifest.version;
export const GODOT_DOCS_BRANCH = godotManifest.docsBranch;
export const godotNodeManifest = godotManifest.nodes;
export const godotResourceManifest = godotManifest.resources;
export const godotClassManifest = [
	...godotNodeManifest,
	...godotResourceManifest,
];

export type {
	GodotClassManifestEntry,
	GodotManifestFile,
	ManifestKind,
} from "./types.ts";
export { godotManifest };
