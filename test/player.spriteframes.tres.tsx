import { AtlasTexture, ExtResource, raw, SpriteFrames } from "../src/index.ts";

const texture = ExtResource("Texture2D", "res://assets/player.sprite.png");
const frameWidth = 46;
const frameHeight = 34;

function frame(index: number) {
	return (
		<AtlasTexture
			atlas={texture}
			region={raw(
				`Rect2(${index * frameWidth}, 0, ${frameWidth}, ${frameHeight})`,
			)}
		/>
	);
}

export default (
	<SpriteFrames
		animations={[
			{
				name: "idle_side",
				speed: 1.0,
				loop: true,
				frames: [{ texture: frame(0) }],
			},
			{
				name: "run_side",
				speed: 10.0,
				loop: true,
				frames: [
					{ texture: frame(0) },
					{ texture: frame(1) },
					{ texture: frame(2) },
				],
			},
			{
				name: "attack_side",
				speed: 5.0,
				loop: false,
				frames: [{ texture: frame(3) }],
			},
			{
				name: "idle_down",
				speed: 1.0,
				loop: true,
				frames: [{ texture: frame(4) }],
			},
			{
				name: "run_down",
				speed: 10.0,
				loop: true,
				frames: [
					{ texture: frame(5) },
					{ texture: frame(6) },
					{ texture: frame(7) },
					{ texture: frame(8) },
				],
			},
			{
				name: "idle_up",
				speed: 1.0,
				loop: true,
				frames: [{ texture: frame(9) }],
			},
			{
				name: "run_up",
				speed: 10.0,
				loop: true,
				frames: [
					{ texture: frame(10) },
					{ texture: frame(11) },
					{ texture: frame(12) },
					{ texture: frame(13) },
				],
			},
		]}
	/>
);
