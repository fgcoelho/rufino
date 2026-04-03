extends SceneTree

var _resource_cache: Dictionary = {}

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Missing IR batch path argument.")
		quit(1)
		return

	var batch_path: String = args[0]
	var error := _build_from_ir(batch_path)
	quit(0 if error == OK else 1)


func _build_from_ir(batch_path: String) -> int:
	var file := FileAccess.open(batch_path, FileAccess.READ)
	if file == null:
		push_error("Unable to open IR batch: %s" % batch_path)
		return ERR_CANT_OPEN

	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid IR batch JSON.")
		return ERR_PARSE_ERROR

	var documents: Array = parsed.get("documents", [])
	for document in documents:
		var error := _build_document(document)
		if error != OK:
			return error

	return OK


func _build_document(document: Dictionary) -> int:
	var kind: String = document.get("kind", "")
	if kind == "scene":
		return _build_scene_document(document)
	if kind == "resource":
		return _build_resource_document(document)

	push_error("Unsupported IR document kind: %s" % kind)
	return ERR_INVALID_DATA


func _build_scene_document(document: Dictionary) -> int:
	_resource_cache.clear()
	var root_node = _build_node(document.get("root", {}), null)
	if root_node == null:
		return ERR_CANT_CREATE

	_assign_owner(root_node, root_node)

	var packed_scene := PackedScene.new()
	var pack_error := packed_scene.pack(root_node)
	if pack_error != OK:
		push_error("Failed to pack scene for %s" % document.get("outputPath", ""))
		root_node.free()
		return pack_error

	var save_error := ResourceSaver.save(packed_scene, document.get("outputPath", ""))
	root_node.free()
	if save_error != OK:
		push_error("Failed to save scene to %s" % document.get("outputPath", ""))
		return save_error

	return OK


func _build_resource_document(document: Dictionary) -> int:
	_resource_cache.clear()
	var resource = _build_resource(document.get("root", {}))
	if resource == null:
		return ERR_CANT_CREATE

	var save_error := ResourceSaver.save(resource, document.get("outputPath", ""))
	if save_error != OK:
		push_error("Failed to save resource to %s" % document.get("outputPath", ""))
		return save_error

	return OK


func _build_node(description: Dictionary, owner: Node) -> Node:
	var node: Node = null
	if description.has("instance"):
		var instance_resource = _build_value(description.get("instance"))
		if instance_resource == null or not instance_resource is PackedScene:
			push_error("Node instance must resolve to a PackedScene.")
			return null
		node = instance_resource.instantiate()
	else:
		var created = ClassDB.instantiate(description.get("class", ""))
		if created == null or not created is Node:
			push_error("Unable to instantiate node class %s" % description.get("class", ""))
			return null
		node = created

	node.name = String(description.get("name", node.name))
	_apply_properties(node, description.get("props", {}))
	_apply_node_methods(node, description.get("ops", []))

	for group_name in description.get("groups", []):
		node.add_to_group(String(group_name))

	for child_description in description.get("children", []):
		var child = _build_node(child_description, owner if owner != null else node)
		if child == null:
			node.free()
			return null
		node.add_child(child)

	return node


func _assign_owner(node: Node, root: Node) -> void:
	for child in node.get_children():
		if child is Node:
			child.owner = root
			_assign_owner(child, root)


func _build_resource(description: Dictionary) -> Resource:
	var id: String = description.get("id", "")
	if id != "" and _resource_cache.has(id):
		return _resource_cache[id]

	var created = ClassDB.instantiate(description.get("resourceType", ""))
	if created == null or not created is Resource:
		push_error("Unable to instantiate resource class %s" % description.get("resourceType", ""))
		return null

	var resource: Resource = created
	if id != "":
		_resource_cache[id] = resource

	_apply_properties(resource, description.get("props", {}))
	_apply_resource_methods(resource, description.get("ops", []))
	return resource


func _apply_properties(target: Object, props: Dictionary) -> void:
	if target is SpriteFrames and props.has("animations"):
		_apply_sprite_frames_animations(target, props["animations"])

	if props.has("sprite_frames"):
		target.set(&"sprite_frames", _build_value(props["sprite_frames"]))

	for key in props.keys():
		if key == "sprite_frames" or key == "animations":
			continue
		target.set(StringName(key), _build_value(props[key]))


func _apply_resource_methods(target: Object, ops_value) -> void:
	if typeof(ops_value) != TYPE_ARRAY:
		push_error("Resource method operations must be an array.")
		return

	for entry in ops_value:
		if typeof(entry) != TYPE_DICTIONARY:
			push_error("Resource method entries must be dictionaries.")
			continue

		var op: Dictionary = entry
		var method := StringName(op.get("method", ""))
		if method == StringName():
			push_error("Resource method entries require a method name.")
			continue

		var args_value = op.get("args", [])
		if typeof(args_value) != TYPE_ARRAY:
			push_error("Resource method args must be an array.")
			continue

		var args: Array = []
		for arg in args_value:
			args.append(_build_value(arg))

		target.callv(method, args)


func _apply_node_methods(target: Object, ops_value) -> void:
	if typeof(ops_value) != TYPE_ARRAY:
		push_error("Node method operations must be an array.")
		return

	for entry in ops_value:
		if typeof(entry) != TYPE_DICTIONARY:
			push_error("Node method entries must be dictionaries.")
			continue

		var op: Dictionary = entry
		var method := StringName(op.get("method", ""))
		if method == StringName():
			push_error("Node method entries require a method name.")
			continue

		var args_value = op.get("args", [])
		if typeof(args_value) != TYPE_ARRAY:
			push_error("Node method args must be an array.")
			continue

		var args: Array = []
		for arg in args_value:
			args.append(_build_value(arg))

		target.callv(method, args)


func _apply_sprite_frames_animations(target: SpriteFrames, animations_value) -> void:
	target.clear_all()
	if typeof(animations_value) != TYPE_ARRAY:
		push_error("SpriteFrames animations must be an array.")
		return

	for entry in animations_value:
		if typeof(entry) != TYPE_DICTIONARY:
			push_error("SpriteFrames animation entries must be dictionaries.")
			continue

		var animation: Dictionary = entry
		var animation_name := StringName(animation.get("name", ""))
		if animation_name == StringName():
			push_error("SpriteFrames animation entries require a name.")
			continue

		target.add_animation(animation_name)
		if animation.has("speed"):
			target.set_animation_speed(animation_name, float(animation["speed"]))
		if animation.has("loop"):
			target.set_animation_loop(animation_name, bool(animation["loop"]))

		var frames_value = animation.get("frames", [])
		if typeof(frames_value) != TYPE_ARRAY:
			push_error("SpriteFrames frames must be an array.")
			continue

		for frame_entry in frames_value:
			if typeof(frame_entry) != TYPE_DICTIONARY:
				push_error("SpriteFrames frame entries must be dictionaries.")
				continue

			var frame_data: Dictionary = frame_entry
			var texture = _build_value(frame_data.get("texture"))
			var duration := float(frame_data.get("duration", 1.0))
			target.add_frame(animation_name, texture, duration)

func _build_value(value):
	match typeof(value):
		TYPE_DICTIONARY:
			return _build_dictionary_value(value)
		TYPE_ARRAY:
			var result: Array = []
			for entry in value:
				result.append(_build_value(entry))
			return result
		_:
			return value


func _build_dictionary_value(value: Dictionary):
	var kind: String = value.get("kind", "")
	if kind == "raw":
		return str_to_var(String(value.get("value", "null")))
	if kind == "ext_resource":
		return _load_ext_resource(value)
	if kind == "sub_resource":
		return _build_resource(value)
	if kind == "sub_resource_ref":
		return _resource_cache.get(String(value.get("id", "")))

	var result := {}
	for key in value.keys():
		result[key] = _build_value(value[key])
	return result


func _load_ext_resource(value: Dictionary) -> Resource:
	var path := String(value.get("path", ""))
	var resource_type := String(value.get("resourceType", ""))
	if resource_type == "Texture2D":
		var image_texture := _load_image_texture(path)
		if image_texture != null:
			return image_texture

	if resource_type == "":
		return load(path)

	return ResourceLoader.load(path, resource_type)


func _load_image_texture(path: String) -> Texture2D:
	var image := Image.new()
	var error := image.load(path)
	if error != OK:
		return null

	return ImageTexture.create_from_image(image)
