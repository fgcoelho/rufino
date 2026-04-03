extends SceneTree

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Missing output path for ClassDB dump")
		quit(1)
		return

	var output_path: String = args[0]
	var classes := ClassDB.get_class_list()
	classes.sort()

	var result: Dictionary = {}
	for klass in classes:
		result[klass] = {
			"instantiable": ClassDB.can_instantiate(klass),
			"is_class_enabled": ClassDB.is_class_enabled(klass),
		}

	var file := FileAccess.open(output_path, FileAccess.WRITE)
	if file == null:
		push_error("Unable to open output path: %s" % output_path)
		quit(1)
		return

	file.store_string(JSON.stringify(result, "  "))
	file.store_string("\n")
	quit(0)
