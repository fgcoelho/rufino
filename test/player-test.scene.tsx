import {
	Camera2D,
	CharacterBody2D,
	CollisionShape2D,
	ExtResource,
	Label,
	Marker2D,
	Node2D,
	RectangleShape2D,
	Scene,
	StaticBody2D,
	Vector2,
} from "../src/index.ts";

export default (
	<Scene>
		<Node2D name="GdxTestWorld">
			<CharacterBody2D
				name="Player"
				position={Vector2(0, 5000)}
				collision_layer={1}
				collision_mask={1}
				script={ExtResource("Script", "res://lib/gdx-test/PlayerController.gd")}
			>
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
	</Scene>
);
