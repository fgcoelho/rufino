extends SceneTree

const POLL_INTERVAL_SECONDS := 0.25

var _state_file_path := ""
var _last_version := -1
var _last_error_message := ""
var _last_poll_time_seconds := 0.0
var _state_loaded_once := false


func _initialize() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Missing Acutis dev state path argument.")
		quit(1)
		return

	_state_file_path = String(args[0])
	process_frame.connect(_on_process_frame)
	_poll_state(true)


func _on_process_frame() -> void:
	var now_seconds: float = Time.get_ticks_msec() / 1000.0
	if now_seconds - _last_poll_time_seconds < POLL_INTERVAL_SECONDS:
		return

	_last_poll_time_seconds = now_seconds
	_poll_state(false)


func _poll_state(force_reload: bool) -> void:
	var state: Dictionary = _read_state()
	if state.is_empty():
		if _state_loaded_once:
			quit()
		return

	_state_loaded_once = true
	var status := String(state.get("status", ""))
	if status == "error":
		var error_message := String(state.get("error", "Build failed."))
		if error_message != _last_error_message:
			push_warning(error_message)
			_last_error_message = error_message
		return

	if status != "ready":
		return

	_last_error_message = ""

	var version := int(state.get("version", -1))
	if not force_reload and version == _last_version:
		return

	var target_scene_path := String(state.get("targetScenePath", ""))
	if target_scene_path == "":
		push_error("Missing targetScenePath in Acutis dev state.")
		return

	var loaded: Resource = ResourceLoader.load(
		target_scene_path,
		"",
		ResourceLoader.CACHE_MODE_REPLACE_DEEP,
	)
	if loaded == null or not loaded is PackedScene:
		push_error("Failed to load scene: %s" % target_scene_path)
		return

	var change_error: int = change_scene_to_packed(loaded as PackedScene)
	if change_error != OK:
		push_error("Failed to change scene to %s (error %d)" % [target_scene_path, change_error])
		return

	_last_version = version


func _read_state() -> Dictionary:
	if not FileAccess.file_exists(_state_file_path):
		return {}

	var file: FileAccess = FileAccess.open(_state_file_path, FileAccess.READ)
	if file == null:
		return {}

	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid Acutis dev state JSON.")
		return {}

	return parsed
