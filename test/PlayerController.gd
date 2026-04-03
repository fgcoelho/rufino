extends CharacterBody2D

@export var speed: float = 220.0
@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var last_direction := "down"

func _physics_process(_delta: float) -> void:
	var input_vector := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = input_vector * 3 * speed
	move_and_slide()
	_update_animation(input_vector)


func _update_animation(input_vector: Vector2) -> void:
	if input_vector == Vector2.ZERO:
		sprite.flip_h = last_direction == "left"
		sprite.play(_idle_animation())
		return

	if absf(input_vector.x) > absf(input_vector.y):
		last_direction = "left" if input_vector.x < 0.0 else "right"
		sprite.flip_h = input_vector.x < 0.0
		sprite.play("run_side")
		return

	last_direction = "up" if input_vector.y < 0.0 else "down"
	sprite.flip_h = false
	sprite.play("run_up" if input_vector.y < 0.0 else "run_down")


func _idle_animation() -> StringName:
	if last_direction == "up":
		return &"idle_up"
	if last_direction == "down":
		return &"idle_down"
	return &"idle_side"
