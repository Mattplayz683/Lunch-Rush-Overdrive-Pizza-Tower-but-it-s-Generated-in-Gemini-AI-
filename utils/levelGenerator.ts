import { Entity, EntityType, EnemyType, ToppinType } from '../types';
import { TILE_SIZE, LEVEL_WIDTH_TILES, LEVEL_HEIGHT_TILES } from '../constants';

export const generateLevel = (): Entity[] => {
  const entities: Entity[] = [];
  const addBlock = (x: number, y: number, w: number, h: number) => {
    entities.push({ id: `block-${x}-${y}`, type: EntityType.BLOCK, x: x * TILE_SIZE, y: y * TILE_SIZE, w: w * TILE_SIZE, h: h * TILE_SIZE });
  };
  const addPlat = (x: number, y: number, w: number) => {
    entities.push({ id: `plat-${x}-${y}`, type: EntityType.PLATFORM, x: x * TILE_SIZE, y: y * TILE_SIZE, w: w * TILE_SIZE, h: TILE_SIZE/2 });
  };
  const addEnemy = (x: number, y: number, type: EnemyType, range: number) => {
      entities.push({ 
          id: `enemy-${x}-${y}`, type: EntityType.ENEMY, enemyType: type,
          x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE,
          patrolStart: (x - range) * TILE_SIZE, patrolEnd: (x + range) * TILE_SIZE,
          direction: 1, vx: 0, vy: 0
      });
  };
  const addTinyBill = (x: number, y: number) => {
      entities.push({
          id: `tinybill-${x}-${y}`, type: EntityType.ENEMY, enemyType: EnemyType.TINY_BILL,
          x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE,
          escapeOnly: true, direction: -1, vx: 0, vy: 0, attackTimer: 0,
          initialX: x * TILE_SIZE, initialY: y * TILE_SIZE
      });
  };
  const addCollect = (x: number, y: number) => {
      entities.push({ id: `c-${x}-${y}`, type: EntityType.COLLECTIBLE, x: x*TILE_SIZE, y: y*TILE_SIZE, w: 20, h: 20, value: 10 });
  };
  const addEscapeCollect = (x: number, y: number) => {
    entities.push({ id: `ec-${x}-${y}`, type: EntityType.COLLECTIBLE, x: x*TILE_SIZE, y: y*TILE_SIZE, w: 20, h: 20, value: 50, escapeOnly: true });
};
  const addBreakable = (x: number, y: number) => {
      entities.push({ id: `brk-${x}-${y}`, type: EntityType.BREAKABLE, x: x*TILE_SIZE, y: y*TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
  };
  const addRail = (x: number, y: number, w: number) => {
      entities.push({ id: `rail-${x}-${y}`, type: EntityType.SLURP_RAIL, x: x*TILE_SIZE, y: y*TILE_SIZE, w: w*TILE_SIZE, h: TILE_SIZE/4 });
  };
  const addCheckpoint = (x: number, y: number) => {
      entities.push({ id: `cp-${x}-${y}`, type: EntityType.CHECKPOINT, x: x*TILE_SIZE, y: y*TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, active: false });
  };
  const addCage = (x: number, y: number, toppin: ToppinType) => {
      entities.push({ 
          id: `cage-${x}-${y}`, type: EntityType.TOPPIN_CAGE, toppinType: toppin,
          x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE 
      });
  };
  const addSecret = (x: number, y: number) => {
      entities.push({ id: `secret-${x}-${y}`, type: EntityType.SECRET, x: x*TILE_SIZE, y: y*TILE_SIZE, w: 30, h: 30 });
  };

  // --- THEME: BIG OL' BILL'S PROCESSING PLANT ---
  // A sprawling industrial factory with high verticality, long conveyors, and secret storage rooms.

  // --- ROOM 1: THE ENTRANCE (Start) ---
  addBlock(0, 0, 1, 40); // Left wall
  addBlock(0, 30, 20, 10); // Floor
  
  // Exit Door (Moved slightly right)
  entities.push({ id: 'exit-door', type: EntityType.EXIT_DOOR, x: 6 * TILE_SIZE, y: 27 * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE * 3 });
  
  // Lap 2 Portal (Hidden BEHIND the exit door - to the left)
  // Player must walk past the exit door to find this secret path
  entities.push({ id: 'lap-2-portal', type: EntityType.LAP_PORTAL, x: 2 * TILE_SIZE, y: 28 * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE * 2 });

  // Tutorial Blocks
  addBreakable(10, 29);
  addBreakable(11, 29);
  addBreakable(12, 28); // Stairs
  addCollect(10, 25);
  addCollect(12, 25);
  
  // ADDED: Tutorial Enemy to punch (Reduced from 2 to 1)
  addEnemy(16, 29, EnemyType.FORK_BOT, 1);

  // --- ROOM 2: THE MAIN HALL (Branching Paths) ---
  addBlock(20, 32, 40, 8); // Long floor
  
  // POPULATED: Enemies for combos (REDUCED)
  addEnemy(23, 31, EnemyType.FORK_BOT, 4);
  // Removed enemy at 28
  addEnemy(33, 31, EnemyType.FORK_BOT, 4);
  // Removed enemy at 38
  addEnemy(45, 31, EnemyType.FORK_BOT, 4);
  
  // High platforms
  addPlat(25, 25, 5);
  addPlat(35, 22, 5);
  addCollect(27, 24);
  addCollect(37, 21);
  
  // Enemy on platform
  addEnemy(36, 21, EnemyType.SPICY_SLIME, 2);

  // Toppin 1: Chicken Nugget (Easy find on a platform)
  addCage(37, 20, ToppinType.NUGGET);

  // Secret 1: In the ceiling of the main hall
  addBlock(30, 15, 6, 2); // Hidden alcove base
  addBreakable(30, 17); // Break to enter from bottom? No, break wall
  addBlock(29, 15, 1, 5); // Left wall of secret
  addBlock(36, 15, 1, 5); // Right wall
  addSecret(32, 14); // The Eye
  addCollect(31, 14); addCollect(33, 14);
  // Access via superjump or wall climb from 35, 22

  // --- ROOM 3: THE GRINDER (Speed & Hazards) ---
  // Drop down
  addBlock(60, 35, 10, 5); 
  addRail(60, 34, 10); // Speed rail
  
  // Add Collectibles on the Rail
  for(let i=1; i<10; i+=2) {
      addCollect(60 + i, 34);
  }
  
  // Combo fodder for Room 3 rail (Escape Only) - SIGNIFICANTLY REDUCED
  addTinyBill(62, 33);
  addTinyBill(65, 33);
  addTinyBill(68, 33); 
  
  // Spike pit (simulated with enemies)
  addBlock(70, 40, 30, 1); // Deep floor
  // Platforms over "pit"
  addBlock(75, 35, 2, 1);
  addBlock(80, 33, 2, 1);
  addBlock(85, 35, 2, 1);
  
  // Regular Enemies acting as hazards (REDUCED)
  // ADDED: Spicy Slimes on the platforms above pit as hazards
  addEnemy(75, 34, EnemyType.SPICY_SLIME, 1);
  addEnemy(80, 32, EnemyType.SPICY_SLIME, 1); // Added Slime here
  addEnemy(85, 34, EnemyType.SPICY_SLIME, 1);
  
  // Escape collectibles
  addEscapeCollect(72, 30);
  addEscapeCollect(77, 30);
  addEscapeCollect(82, 30);

  // Checkpoint 1 (Moved UP to ensure no floor clipping)
  addCheckpoint(90, 33);
  addBlock(90, 35, 10, 5);

  // --- ROOM 4: THE VERTICAL SHAFT (Climb) ---
  // Modified to open up access to the Burger room
  addBlock(100, 10, 5, 22); // Center pillar (Shortened to create entrance at bottom)
  addBlock(100, 35, 5, 5); // Floor bridge connecting Room 3 to Shaft

  // Right wall split to properly expose secret area
  addBlock(115, 10, 5, 15); // Upper right wall
  addBlock(115, 27, 5, 13); // Lower right wall
  
  // Left side climb
  addPlat(105, 35, 3);
  addPlat(110, 30, 3);
  addPlat(105, 25, 3);
  addPlat(110, 20, 3);
  
  // Reduced enemies in shaft
  addEnemy(106, 34, EnemyType.FORK_BOT, 1);
  // Removed enemy at 108
  addEnemy(111, 19, EnemyType.FORK_BOT, 1);
  // Removed enemy at 105

  // Toppin 2: Burger (Mid-shaft)
  addCage(106, 24, ToppinType.BURGER);

  // Secret 2: Breakable wall on the right of the shaft
  addBreakable(115, 25);
  addBreakable(116, 25);
  addSecret(118, 25); // In the wall
  
  // Top of shaft
  addBlock(100, 10, 20, 2); // Ceiling of shaft
  
  // --- ROOM 5: THE UPPER CONVEYORS ---
  addBlock(120, 12, 40, 2); // Floor
  addRail(120, 11, 40); // Fast travel
  
  // Add Collectibles on the long rail
  for(let i=2; i<38; i+=2) {
      addCollect(120 + i, 11);
  }

  // Escape Fodder
  addTinyBill(125, 10);
  addTinyBill(130, 10);
  addTinyBill(135, 10);
  addTinyBill(140, 10);
  addTinyBill(145, 10);
  addTinyBill(152, 10);
  
  // Regular Enemies (SIGNIFICANTLY REDUCED)
  addEnemy(122, 10, EnemyType.SPICY_SLIME, 2);
  // Removed enemy at 127
  addEnemy(132, 10, EnemyType.SPICY_SLIME, 2);
  // Removed enemy at 137
  addEnemy(142, 10, EnemyType.SPICY_SLIME, 2);
  // Removed enemy at 147
  addEnemy(153, 10, EnemyType.SPICY_SLIME, 2);
  
  // Toppin 3: Pizza (End of conveyor)
  addCage(155, 10, ToppinType.PIZZA);

  // --- ROOM 6: GERRY'S WAREHOUSE (Drop down from Conveyors) ---
  addBlock(160, 12, 2, 20); // Wall
  // Drop zone
  addBlock(162, 32, 20, 2); // Floor
  
  // Gerry is here
  entities.push({
      id: 'gerry', type: EntityType.GERRY,
      x: 170 * TILE_SIZE, y: 31 * TILE_SIZE, w: 30, h: 40,
      collected: false
  });
  
  // Guarded by elites (Reduced)
  addEnemy(165, 31, EnemyType.FORK_BOT, 3);
  // Removed enemy at 175
  addEnemy(170, 31, EnemyType.SPICY_SLIME, 2); 
  // Removed enemy at 168

  // --- ROOM 7: THE CRUSHER GAUNTLET (Path to Boss) ---
  addBlock(182, 32, 50, 5); // Long floor
  
  // P-Rank fodder (REDUCED NON-ESCAPE ENEMIES)
  for (let i = 0; i < 5; i++) { // Reduced from 10 to 5
      const ex = 190 + (i*8); // Increased spacing
      // Alternating enemies
      if (i % 2 === 0) addEnemy(ex, 31, EnemyType.SPICY_SLIME, 2);
      else addEnemy(ex, 31, EnemyType.FORK_BOT, 2);
      
      addCollect(ex, 28);
      // Also add escape bills for chaos during escape
      addTinyBill(ex, 29);
  }
  
  // Toppin 4: Hot Dog
  addCage(200, 25, ToppinType.HOTDOG); // High up, need to jump

  // --- ROOM 8: JANITOR CLOSET (Treasure) ---
  // The closet is now HOLLOW.
  // Floor is provided by the long floor from Room 7 (y=32)
  
  // Ceiling Block
  addBlock(220, 28, 10, 3); 
  
  // Right Wall
  addBlock(229, 31, 1, 5);
  
  // The Door is the Left Wall (until broken)
  entities.push({
      id: 'janitor-door', type: EntityType.JANITOR_DOOR,
      x: 220 * TILE_SIZE, y: 31 * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE * 2
  });
  
  // REMOVED: Guard outside Janitor door

  // The Treasure is INSIDE the hollow space
  entities.push({
      id: 'tower-treasure', type: EntityType.TREASURE,
      x: 224 * TILE_SIZE, y: 31 * TILE_SIZE, w: 40, h: 40
  });
  
  // Secret 3: Above the Janitor Closet (Superjump spot)
  addBreakable(225, 20); // Ceiling block (floating high above)
  addPlat(225, 15, 3);
  addSecret(226, 13);

  // --- ROOM 9: BOSS ARENA / ESCAPE TRIGGER ---
  addBlock(232, 32, 20, 2);
  
  // Big Ol' Bill Trigger
  entities.push({
      id: 'escape-trigger', type: EntityType.TRIGGER_ESCAPE,
      x: 240 * TILE_SIZE, y: 28 * TILE_SIZE, w: TILE_SIZE * 3, h: TILE_SIZE * 4
  });
  
  // Toppin 5: Slushy (Right before the trigger)
  addCage(235, 31, ToppinType.SLUSHY);

  // Escape Enemies (Only spawn during escape)
  addTinyBill(200, 20);
  addTinyBill(150, 20);
  addTinyBill(100, 20);
  addTinyBill(50, 20);

  // --- CEILING & BOUNDARIES ---
  addBlock(0, -10, LEVEL_WIDTH_TILES * 2, 10); // Sky limit
  
  return entities;
};