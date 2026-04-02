import metadata from "./godot-4.6-props.json" with { type: "json" };
import type {
	GodotClassPropsMetadata,
	GodotPropsMetadataFile,
} from "./types.ts";

const godotPropsMetadata = metadata as GodotPropsMetadataFile;

export const godotClassPropsMetadata = godotPropsMetadata.classes;
export const godotEnumMetadata = godotPropsMetadata.enums;
export const godotClassPropsMap = new Map(
	godotClassPropsMetadata.map(
		(entry) => [entry.name, entry] satisfies [string, GodotClassPropsMetadata],
	),
);

export { godotPropsMetadata };
