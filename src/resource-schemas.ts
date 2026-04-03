export interface ResourceSchemaOverride {
	declarations: string[];
	propLines: string[];
	propNames: string[];
}

export const resourceSchemaOverrides: Record<string, ResourceSchemaOverride> = {
	SpriteFrames: {
		declarations: [
			"export interface SpriteFramesAnimationFrame {",
			'  "texture": GodotResourceInput;',
			'  "duration"?: number;',
			"}",
			"",
			"export interface SpriteFramesAnimation {",
			'  "name": string;',
			'  "speed"?: number;',
			'  "loop"?: boolean;',
			'  "frames"?: SpriteFramesAnimationFrame[];',
			"}",
		],
		propLines: ['  "animations"?: SpriteFramesAnimation[];'],
		propNames: ["animations"],
	},
};

export const resourceSchemaPropNames = new Map(
	Object.entries(resourceSchemaOverrides).map(([className, override]) => [
		className,
		override.propNames,
	]),
);
