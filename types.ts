export interface Vector {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export enum EntityType {
  PLAYER,
  BLOCK,
  PLATFORM,
  ENEMY,
  COLLECTIBLE,
  TRIGGER_ESCAPE, // The object that starts the escape
  EXIT_DOOR,
  BREAKABLE, // Blocks destroyed at high speed
  SLURP_RAIL, // Speed rail
  CHECKPOINT, // Respawn point
  LAP_PORTAL, // Lap 2 entry
  TOPPIN_CAGE, // Cage holding an ingredient
  TOPPIN, // The ingredient follower
  GERRY, // The sauce bottle helper
  JANITOR_DOOR, // Locked door needing Gerry
  TREASURE, // Tower Secret Treasure
  SECRET, // Hidden eyes (3 per level)
}

export enum EnemyType {
  FORK_BOT, // Patrols, hurts front
  SPICY_SLIME, // Bounces vertically
  TINY_BILL, // Chases player during escape
}

export enum ToppinType {
  NUGGET,    // Was Mushroom
  BURGER,    // Was Cheese
  PIZZA,     // Was Tomato
  HOTDOG,    // Was Sausage
  SLUSHY     // Was Pineapple
}

export interface Entity extends Rect {
  id: string;
  type: EntityType;
  color?: string;
  vx?: number;
  vy?: number;
  // Specific properties
  enemyType?: EnemyType;
  toppinType?: ToppinType; // Which ingredient is it?
  dead?: boolean;
  knockedOut?: boolean; // Physics active but defeated (flying off screen)
  value?: number; // Score value
  escapeOnly?: boolean; // Only visible during escape
  patrolStart?: number; // For enemies
  patrolEnd?: number; // For enemies
  direction?: number; // 1 or -1
  isGroundPound?: boolean;
  active?: boolean; // For checkpoints
  isDiving?: boolean; // Used for both Air Dive and Ground Slide
  isCrouching?: boolean;
  isUppercutting?: boolean;
  isSuperJumpPrep?: boolean;
  isSuperJumping?: boolean;
  isSuperJumpCancel?: boolean; // Shoulder Bash from Superjump
  isAttacking?: boolean; // Specifically the "Grab" dash state
  attackTimer?: number; // Frame counter for attack duration
  grounded?: boolean;
  onRail?: boolean; // Is player on a rail
  isTurning?: boolean; // Mach turn state
  turnTimer?: number;
  storedSpeed?: number; // To preserve speed during a turn
  triggered?: boolean; // For Big ol' Bill animation
  initialX?: number; // For respawning
  initialY?: number; // For respawning
  collected?: boolean; // For Toppins and Gerry
  followIndex?: number; // Index offset in position history for followers
  tauntTimer?: number; // For taunts/parry window
  breakdanceTimer?: number; // How long taunt is held
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface GameState {
  score: number;
  combo: number;
  comboTimer: number;
  rank: string;
  status: 'MENU' | 'PLAYING' | 'ESCAPE' | 'GAMEOVER' | 'VICTORY';
  escapeTimer: number;
  lap2: boolean;
  lap3: boolean; // New Lap 3 State
  // P-Rank Requirements
  gerryCollected: boolean;
  treasureCollected: boolean;
  secretsFound: number; // Max 3
  comboDropped: boolean; // Has the combo bar hit 0 after starting?
}