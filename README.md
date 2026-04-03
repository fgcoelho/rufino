# rufino

Text-first WYSIWYM scene and resource authoring for Godot with TypeScript and TSX.

Godot's native workflow is WYSIWYG in the editor. `rufino` is the opposite: you write the Godot scene or resource you mean in TSX, then generate the sibling `.tscn` and `.tres` files.

## Installation

Install `rufino` and TypeScript (inside your godot project folder):

```bash
pnpm init
pnpm add rufino
pnpm add -D typescript
```

Or scaffold a project with the CLI:

```bash
npx rufino@latest init
```

This creates or updates:

- `package.json`
- `tsconfig.json`
- `rufino.config.json`

## Quick start

### 1. Configure TypeScript for the rufino JSX runtime

Your `tsconfig.json` should include the JSX settings used by `rufino`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "jsxImportSource": "rufino",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

### 2. Configure the Godot binary

Create `rufino.config.json` in your project root:

```json
{
  "engineBinary": "engine/binary"
}
```

`engineBinary` should point to your Godot executable.

You can also override the executable with `GODOT_BIN`.

### 3. Write a scene document

Create a file like `test/player-test.scene.tsx`:

```tsx
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
  StaticBody2D,
  Vector2,
} from "rufino";

export default (
  <Node2D name="GdxTestWorld">
    <CharacterBody2D
      name="Player"
      position={Vector2(0, 0)}
      collision_layer={1}
      collision_mask={1}
      script={ExtResource("Script", "res://PlayerController.gd")}
    >
      <AnimatedSprite2D
        name="AnimatedSprite2D"
        animation="idle_down"
        sprite_frames={ExtResource(
          "SpriteFrames",
          "res://player.spriteframes.tres",
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
  </Node2D>
);
```

### 4. Write a resource document

Create a file like `test/player.spriteframes.tres.tsx`:

```tsx
import { AtlasTexture, ExtResource, raw, SpriteFrames } from "rufino";

const texture = ExtResource("Texture2D", "res://assets/player.sprite.png");
const frameWidth = 46;
const frameHeight = 34;

function frame(index: number) {
  return (
    <AtlasTexture
      atlas={texture}
      region={raw(`Rect2(${index * frameWidth}, 0, ${frameWidth}, ${frameHeight})`)}
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
    ]}
  />
);
```

### 5. Generate the Godot files

```bash
pnpm rufino generate
```

This writes sibling files next to your TSX sources:

- `player-test.scene.tsx` -> `player-test.tscn`
- `player.spriteframes.tres.tsx` -> `player.spriteframes.tres`

## Workflow

`rufino` is one workflow:

- author scenes and resources in TSX
- generate native Godot files
- run or iterate on them through the CLI

The runtime and the CLI are meant to be used together.

### `rufino init`

Scaffold the basic project setup:

```bash
pnpm rufino init
```

You can also target a different directory:

```bash
pnpm rufino init ./my-project
```

### `rufino generate`

Generate sibling `.tscn` and `.tres` files from matching TSX documents:

```bash
pnpm rufino generate
```

You can also limit generation to a file or directory:

```bash
pnpm rufino generate test
pnpm rufino generate test/player-test.scene.tsx
pnpm rufino generate test/player.spriteframes.tres.tsx
```

Supported source suffixes:

- `*.scene.tsx`
- `*.tres.tsx`

By default, `rufino` discovers matching files under:

- `src/**`
- `lib/**`
- `test/**`

### `rufino run`

Generate one scene and launch it in Godot:

```bash
pnpm rufino run test/player-test.scene.tsx
```

This command expects exactly one `.scene.tsx` file.

### `rufino dev`

Run a scene in a persistent Godot dev wrapper with automatic rebuilds:

```bash
pnpm rufino dev test/player-test.scene.tsx
```

This is the best day-to-day development loop when you are iterating on TSX scene files, resource files, or linked scripts.

If you are actively building with `rufino`, `rufino dev` is usually the best DX.

## Core helpers

`rufino` exposes a small set of helpers for values that should remain clearly Godot-shaped.

### `Vector2(x, y)`

Emit a Godot `Vector2(...)` literal.

```tsx
position={Vector2(10, 20)}
```

### `Vector3(x, y, z)`

Emit a Godot `Vector3(...)` literal.

```tsx
position={Vector3(0, 1, 2)}
```

### `Color(r, g, b, a?)`

Emit a Godot `Color(...)` literal.

```tsx
modulate={Color(1, 0.5, 0.5, 1)}
```

### `NodePath(path)`

Emit a Godot `NodePath(...)` literal.

```tsx
target={NodePath("../Player")}
```

### `PackedStringArray(...values)`

Emit a Godot `PackedStringArray(...)` literal.

```tsx
groups={PackedStringArray("interactable", "enemy")}
```

### `ExtResource(type, path, uid?)`

Reference an external Godot resource.

```tsx
script={ExtResource("Script", "res://PlayerController.gd")}
sprite_frames={ExtResource("SpriteFrames", "res://player.spriteframes.tres")}
```

### `SubResource(type, props?)`

Construct a subresource value explicitly.

```tsx
shape={SubResource("RectangleShape2D", { size: Vector2(32, 32) })}
```

In many cases, nested TSX resource components are more readable, but `SubResource(...)` is available when an explicit value form is better.

### `raw(value)`

Pass through a literal Godot value unchanged.

```tsx
region={raw("Rect2(0, 0, 46, 34)")}
```

Use this when you need something Godot-specific that is not covered by a helper yet.
