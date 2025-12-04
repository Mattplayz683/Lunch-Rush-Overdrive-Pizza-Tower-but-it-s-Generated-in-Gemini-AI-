export const GRAVITY = 0.6;
export const FRICTION = 0.85;
export const GROUND_FRICTION = 0.85;
export const AIR_FRICTION = 0.95;

// Movement
export const WALK_SPEED = 0.5;
export const RUN_SPEED_CAP = 7;
export const SPRINT_ACCEL = 0.2;
export const MACH_1_SPEED = 8;
export const MACH_2_SPEED = 12; // Needed to break blocks
export const MACH_3_SPEED = 16; // Maximum velocity
export const JUMP_FORCE = -14;
export const SUPER_JUMP_FORCE = -22;
export const WALL_JUMP_FORCE = -12;
export const WALL_KICK_X = 10;
export const DASH_SPEED = 15;
export const CROUCH_SPEED = 3;
export const CROUCH_JUMP_FORCE = -9;
export const UPPERCUT_FORCE = -16;

// Level
export const TILE_SIZE = 48;
export const LEVEL_WIDTH_TILES = 150;
export const LEVEL_HEIGHT_TILES = 60; // Increased to cover deep level geometry

// Gameplay
export const MAX_ESCAPE_TIME = 120; // Seconds
export const COMBO_DECAY = 0.278; // 6 seconds duration at 60fps (100 / 360 frames)