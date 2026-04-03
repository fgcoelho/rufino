import {
	ExtResource,
	raw,
	TileSet,
	TileSetAtlasSource,
} from "../../src/index.ts";

const texture = ExtResource("Texture2D", "res://assets/grass-tileset.png");

function atlasCoords(x: number, y: number) {
	return raw(`Vector2i(${x}, ${y})`);
}

const tiles = [
	[0, 0],
	[1, 0],
	[2, 0],
	[3, 0],
	[4, 0],
	[5, 0],
] as const;

export default (
	<TileSet tile_size={atlasCoords(16, 16)}>
		<TileSet.add_source
			atlas_source_id_override={0}
			source={
				<TileSetAtlasSource
					texture={texture}
					texture_region_size={atlasCoords(16, 16)}
					use_texture_padding={false}
				>
					{tiles.map(([x, y]) => (
						<TileSetAtlasSource.create_tile atlas_coords={atlasCoords(x, y)} />
					))}
				</TileSetAtlasSource>
			}
		/>
	</TileSet>
);
