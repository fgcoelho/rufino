import {
	AnimatedSprite2D,
	Camera2D,
	CharacterBody2D,
	CollisionShape2D,
	ExtResource,
	Label,
	Marker2D,
	Node2D,
	RectangleShape2D,
	raw,
	StaticBody2D,
	TileMapLayer,
	Vector2,
} from "../../src/index.ts";

const grassTileset = ExtResource("TileSet", "res://resources/tileset.tres");

const groundCells = [
	[-8, -2],
	[-7, -2],
	[-6, -2],
	[-5, -2],
	[-4, -2],
	[-3, -2],
	[-2, -2],
	[-1, -2],
	[0, -2],
	[1, -2],
	[2, -2],
	[3, -2],
	[4, -2],
	[5, -2],
	[6, -2],
	[7, -2],
	[-8, -1],
	[-7, -1],
	[-6, -1],
	[-5, -1],
	[-4, -1],
	[-3, -1],
	[-2, -1],
	[-1, -1],
	[0, -1],
	[1, -1],
	[2, -1],
	[3, -1],
	[4, -1],
	[5, -1],
	[6, -1],
	[7, -1],
	[-8, 0],
	[-7, 0],
	[-6, 0],
	[-5, 0],
	[-4, 0],
	[-3, 0],
	[-2, 0],
	[-1, 0],
	[0, 0],
	[1, 0],
	[2, 0],
	[3, 0],
	[4, 0],
	[5, 0],
	[6, 0],
	[7, 0],
	[-8, 1],
	[-7, 1],
	[-6, 1],
	[-5, 1],
	[-4, 1],
	[-3, 1],
	[-2, 1],
	[-1, 1],
	[0, 1],
	[1, 1],
	[2, 1],
	[3, 1],
	[4, 1],
	[5, 1],
	[6, 1],
	[7, 1],
	[-8, 2],
	[-7, 2],
	[-6, 2],
	[-5, 2],
	[-4, 2],
	[-3, 2],
	[-2, 2],
	[-1, 2],
	[0, 2],
	[1, 2],
	[2, 2],
	[3, 2],
	[4, 2],
	[5, 2],
	[6, 2],
	[7, 2],
] as const;

function cell(x: number, y: number) {
	return raw(`Vector2i(${x}, ${y})`);
}

function atlasCoords(x: number, y: number) {
	return raw(`Vector2i(${x}, ${y})`);
}

export default (
	<Node2D name="GdxTestWorld">
		<TileMapLayer
			name="Ground"
			position={Vector2(0, -8)}
			tile_set={grassTileset}
			z_index={-10}
		>
			{groundCells.map(([x, y], index) => (
				<TileMapLayer.set_cell
					coords={cell(x, y)}
					source_id={0}
					atlas_coords={atlasCoords(index % 6, 0)}
				/>
			))}
		</TileMapLayer>

		<CharacterBody2D
			name="Player"
			position={Vector2(0, 0)}
			collision_layer={1}
			collision_mask={1}
			script={ExtResource("Script", "res://scripts/player-controller.gd")}
		>
			<AnimatedSprite2D
				name="AnimatedSprite2D"
				animation="idle_down"
				sprite_frames={ExtResource(
					"SpriteFrames",
					"res://resources/player.spriteframes.tres",
				)}
			/>
			<CollisionShape2D
				name="Hitbox"
				shape={<RectangleShape2D size={Vector2(20, 20)} />}
			/>
			<Label name="PlayerLabel" position={Vector2(-22, -30)} text="Player" />
			<Camera2D
				name="Camera2D"
				enabled={true}
				position_smoothing_enabled={true}
				position_smoothing_speed={8.0}
			/>
		</CharacterBody2D>

		<Label
			name="Instructions"
			position={Vector2(-160, -120)}
			text="Move with arrow keys or WASD/ui actions"
		/>

		<Marker2D name="NorthMarker" position={Vector2(0, -120)} />
		<Marker2D name="SouthMarker" position={Vector2(0, 120)} />

		<StaticBody2D name="Floor" position={Vector2(0, 72)}>
			<CollisionShape2D
				name="FloorShape"
				shape={<RectangleShape2D size={Vector2(320, 24)} />}
			/>
			<Label name="FloorLabel" position={Vector2(-30, -10)} text="Floor" />
		</StaticBody2D>

		<StaticBody2D name="LeftWall" position={Vector2(-164, 0)}>
			<CollisionShape2D
				name="LeftWallShape"
				shape={<RectangleShape2D size={Vector2(24, 220)} />}
			/>
		</StaticBody2D>

		<StaticBody2D name="RightWall" position={Vector2(164, 0)}>
			<CollisionShape2D
				name="RightWallShape"
				shape={<RectangleShape2D size={Vector2(24, 220)} />}
			/>
		</StaticBody2D>
	</Node2D>
);
