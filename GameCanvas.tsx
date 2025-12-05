import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Entity, EntityType, EnemyType, Particle, GameState, Vector, ToppinType } from '../types';
import { 
  GRAVITY, FRICTION, GROUND_FRICTION, AIR_FRICTION, WALK_SPEED, 
  MACH_1_SPEED, MACH_2_SPEED, MACH_3_SPEED, JUMP_FORCE, SUPER_JUMP_FORCE,
  TILE_SIZE, MAX_ESCAPE_TIME, DASH_SPEED, COMBO_DECAY,
  LEVEL_HEIGHT_TILES, CROUCH_SPEED, CROUCH_JUMP_FORCE, UPPERCUT_FORCE,
  RUN_SPEED_CAP, LEVEL_WIDTH_TILES
} from '../constants';
import { checkCollision, resolveCollision, getRank } from '../utils/gameLogic';
import { generateLevel } from '../utils/levelGenerator';
import { audioSystem } from '../utils/audioSystem';
import { Play, RotateCcw, Trophy, Skull, AlertTriangle, ArrowRight, Flag, Flame, Star, Disc, Lock, Key } from 'lucide-react';

interface GameCanvasProps {
  onGameOver: (score: number, rank: string, win: boolean, lap3: boolean) => void;
  onExit: () => void;
}

// Structure to store player position history for the snake-follow effect
interface PlayerHistoryFrame {
  x: number;
  y: number;
  direction: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onGameOver, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Initialize Level
  const levelRef = useRef<Entity[] | null>(null);
  if (levelRef.current === null) {
      levelRef.current = generateLevel();
  }
  
  const spawnPoint = levelRef.current.find(e => e.type === EntityType.EXIT_DOOR);
  const initialX = spawnPoint ? spawnPoint.x + spawnPoint.w + 60 : 100;
  const initialY = spawnPoint ? spawnPoint.y + spawnPoint.h - 100 : 300; 

  const checkpointRef = useRef<Vector>({ x: initialX, y: initialY });
  const showExitPromptRef = useRef<boolean>(false);

  // Game State Refs
  const playerRef = useRef<Entity>({
    id: 'player', type: EntityType.PLAYER, 
    x: initialX, 
    y: initialY, 
    w: 40, h: 40, 
    vx: 0, vy: 0,
    direction: 1,
    isGroundPound: false,
    isDiving: false,
    isCrouching: false,
    isUppercutting: false,
    isSuperJumpPrep: false,
    isSuperJumping: false,
    isSuperJumpCancel: false,
    isAttacking: false,
    attackTimer: 0,
    grounded: false,
    onRail: false,
    isTurning: false,
    turnTimer: 0,
    storedSpeed: 0,
    tauntTimer: 0,
    breakdanceTimer: 0
  });

  // Player Position History for Toppins & Gerry
  const playerHistoryRef = useRef<PlayerHistoryFrame[]>([]);
  // Max frames to store.
  const MAX_HISTORY = 600; // Increased to accommodate distance based spacing

  // Chaser (The Overtime Enemy)
  const chaserRef = useRef<Entity>({
      id: 'chaser', type: EntityType.ENEMY,
      x: initialX, y: initialY, w: 120, h: 120, // Increased size
      vx: 0, vy: 0
  });
  const chaserSpawnedRef = useRef<boolean>(false);
  
  const cameraRef = useRef<Vector>({ x: Math.max(0, initialX - window.innerWidth / 3), y: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const gameStateRef = useRef<GameState>({
    score: 0,
    combo: 0,
    comboTimer: 0,
    rank: 'D',
    status: 'PLAYING',
    escapeTimer: 0,
    lap2: false,
    lap3: false,
    gerryCollected: false,
    treasureCollected: false,
    secretsFound: 0,
    comboDropped: false
  });

  const [uiState, setUiState] = useState<GameState>(gameStateRef.current);
  const requestRef = useRef<number>(0);
  const keysPressed = useRef<Record<string, boolean>>({});
  
  const [shake, setShake] = useState(0);

  // Audio System Management
  useEffect(() => {
    // Attempt to start audio system on mount (assuming user gesture in previous screen allowed it)
    audioSystem.init();
    
    // Cleanup on unmount
    return () => {
      audioSystem.stop();
      audioSystem.stopMachLoop();
    };
  }, []);

  // Music Logic
  useEffect(() => {
    if (uiState.status === 'PLAYING') {
       audioSystem.playTheme('level');
    } else if (uiState.status === 'ESCAPE') {
       if (uiState.lap3) {
          audioSystem.playTheme('lap3');
       } else if (uiState.lap2) {
          audioSystem.playTheme('lap2');
       } else {
          audioSystem.playTheme('escape');
       }
    } else {
       audioSystem.stop();
       audioSystem.stopMachLoop();
    }
  }, [uiState.status, uiState.lap2, uiState.lap3]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = true;
      if(e.key === 'z' || e.key === 'Z') jump();
      if(e.key === 'x' || e.key === 'X') attack();
      if(e.key === 'c' || e.key === 'C') taunt();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = false;

      // Superjump Trigger
      if (e.key === 'ArrowUp') {
        const p = playerRef.current;
        if (p.isSuperJumpPrep) {
            p.isSuperJumpPrep = false;
            p.isSuperJumping = true;
            p.vy = SUPER_JUMP_FORCE;
            audioSystem.playSFX('superjump');
            createParticles(p.x + p.w/2, p.y + p.h, 20, '#ff0000');
            setShake(10);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const jump = () => {
    const p = playerRef.current;
    
    // Can't jump while turning
    if (p.isTurning) return;
    
    // Stop breakdancing
    p.breakdanceTimer = 0;

    // Normal / Crouch Jump / Rail Jump
    if (p.grounded || p.onRail) {
      audioSystem.playSFX('jump');
      if (p.isCrouching) {
          p.vy = CROUCH_JUMP_FORCE;
          createParticles(p.x + p.w/2, p.y + p.h, 5, '#fff');
      } else {
          p.vy = JUMP_FORCE;
          createParticles(p.x + p.w/2, p.y + p.h, 10, '#fff');
      }
      p.grounded = false; 
      p.onRail = false; // Detach from rail on jump
    } 
  };

  const attack = () => {
    const p = playerRef.current;
    if (p.isGroundPound || p.isSuperJumpPrep || p.isTurning) return;
    
    // Stop breakdancing
    p.breakdanceTimer = 0;
    
    // Uppercut - REWORKED: Can be done in air
    // Check UP + X
    if (keysPressed.current['ArrowUp'] && !p.isDiving && !p.isCrouching && !p.isUppercutting && !p.isSuperJumping) {
        p.isUppercutting = true;
        p.isAttacking = false; // Ensure we aren't dashing
        p.vx = 0;
        p.vy = UPPERCUT_FORCE; // Rising uppercut
        p.grounded = false; 
        p.onRail = false;
        audioSystem.playSFX('jump'); // Similar to jump but maybe punchier
        createParticles(p.x + p.w/2, p.y + p.h, 15, '#FFFF00');
        setShake(5);
        return;
    }

    // Superjump Cancel (Shoulder Bash from Superjump)
    if (p.isSuperJumping) {
        p.isSuperJumping = false;
        p.vy = 0;
        p.vx = (p.direction || 1) * MACH_3_SPEED;
        p.isAttacking = true;
        p.isSuperJumpCancel = true;
        p.attackTimer = 999; // Keep active until land or cancel
        audioSystem.playSFX('dash');
        createParticles(p.x + p.w/2, p.y + p.h/2, 15, '#fff');
        setShake(8);
        return;
    }

    // Regular Attack (Grab/Dash)
    if (!p.isCrouching && !p.isUppercutting) {
        if (!p.isAttacking) {
            p.isAttacking = true;
            p.attackTimer = 39; // Fixed 39 frames duration
            p.isDiving = false; // Cancel dive if attacking
            p.vx = (p.direction || 1) * DASH_SPEED;
            p.vy = -2; // Small hop
            audioSystem.playSFX('dash');
            setShake(5);
        }
    }
  };

  const taunt = () => {
      const p = playerRef.current;
      if (p.isCrouching || p.isUppercutting || p.isTurning) return; 
      
      p.tauntTimer = 20; // 20 Frames window for parry
      audioSystem.playSFX('taunt');
      createParticles(p.x + p.w/2, p.y, 5, '#FFFF00');
      
      // Trigger Toppin & Gerry Taunts
      levelRef.current!.forEach(e => {
          if ((e.type === EntityType.TOPPIN || e.type === EntityType.GERRY) && e.collected) {
              e.tauntTimer = 30; // Frames to taunt
              e.vy = -5; // Little jump
              createParticles(e.x + e.w/2, e.y, 3, '#FFFF00');
          }
      });

      if (gameStateRef.current.combo > 0) {
          gameStateRef.current.score += 50;
      }
  };

  const performParry = (enemy: Entity | null) => {
      const p = playerRef.current;
      // Effect
      setShake(15);
      audioSystem.playSFX('collect'); // Using collect/chime for parry
      createParticles(p.x + p.w/2, p.y + p.h/2, 30, '#fff'); // Flash
      // Kill enemy if exists
      if (enemy) {
          killEnemy(enemy);
      }
      // Reset player velocity? or give invuln?
      // Just a visual stop for frame
      p.tauntTimer = 0; // Consume parry
  };

  const createParticles = (x: number, y: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        size: Math.random() * 6 + 2
      });
    }
  };

  const hurtPlayer = (halfCombo: boolean = false) => {
      const p = playerRef.current;
      const state = gameStateRef.current;
      
      // Stop Breakdancing
      p.breakdanceTimer = 0;

      audioSystem.playSFX('hurt');
      p.vx = -p.direction! * 10;
      p.vy = -5;
      if (state.score > 0) state.score = Math.max(0, state.score - 50); 
      
      if (halfCombo) {
          state.comboTimer = state.comboTimer / 2;
          // P-Rank is preserved for "light" hits (Forkbot/Tiny Bill)
      } else {
          state.combo = 0;
          state.comboDropped = true; 
      }
      
      p.isDiving = false;
      p.isSuperJumpPrep = false;
      p.isSuperJumping = false;
      p.isSuperJumpCancel = false;
      p.isGroundPound = false;
      p.isAttacking = false;
      p.isUppercutting = false;
      p.isCrouching = false;
      p.isTurning = false;
      createParticles(p.x, p.y, 5, '#fff');
      setShake(10);
  };

  const killEnemy = (entity: Entity) => {
    const state = gameStateRef.current;
    const p = playerRef.current;
    
    // Physics Knockout
    entity.knockedOut = true;
    entity.dead = false; // Ensure it stays registered for physics loop
    entity.vx = (entity.x - p.x > 0 ? 1 : -1) * 15;
    entity.vy = -20;

    audioSystem.playSFX('kill');
    state.score += 100;
    state.combo += 1;
    state.comboTimer = 100;
    
    if (!p.isGroundPound && !p.isSuperJumping && !p.isDiving && !p.isUppercutting && !p.isSuperJumpCancel) {
        p.vy = -8; 
    }
    createParticles(entity.x, entity.y, 15, '#ff0000');
    setShake(5);
  };

  // Helper to determine live rank for HUD
  const getLiveRank = (state: GameState): string => {
      const { score, escapeTimer, secretsFound, treasureCollected, comboDropped, lap2 } = state;
      const totalScore = score + (escapeTimer > 0 ? escapeTimer * 10 : 0);
      
      // Live P-Rank Check
      const potentialP = 
        secretsFound >= 3 && 
        treasureCollected && 
        !comboDropped && 
        lap2; // Must have at least started Lap 2 to see P

      if (potentialP && totalScore > 10000) return 'P';
      
      if (totalScore > 10000) return 'S';
      if (totalScore > 7000) return 'A';
      if (totalScore > 4000) return 'B';
      if (totalScore > 1000) return 'C';
      return 'D';
  };

  const update = () => {
    const p = playerRef.current;
    const state = gameStateRef.current;
    const level = levelRef.current!;

    // Reset frame flags
    showExitPromptRef.current = false;

    if (state.status === 'GAMEOVER' || state.status === 'VICTORY') return;

    // --- Escape Timer ---
    if (state.status === 'ESCAPE') {
        state.escapeTimer -= 1/60; // Assuming 60Hz update
        if (state.escapeTimer <= 0) {
            state.escapeTimer = 0;
            // Activate Chaser Movement
            if (!chaserSpawnedRef.current) {
                chaserSpawnedRef.current = true;
                const chaser = chaserRef.current;
                
                // SPAWN LOGIC CHANGED:
                // Spawn directly above the player's current view (top of screen relative to camera)
                chaser.x = p.x;
                chaser.y = cameraRef.current.y - 150;
                
                audioSystem.playSFX('escape'); // Alarm
            }
            
            const c = chaserRef.current;
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            c.x += dx * 0.04; // Moves towards player
            c.y += dy * 0.04;
            
            if (checkCollision(p, c)) {
               hurtPlayer(false); // Chaser still causes full loss
               // Or instant kill?
               state.status = 'GAMEOVER';
               onGameOver(state.score, getRank(state), false, state.lap3);
            }
        }
    }

    // --- Breakdance Logic ---
    if (keysPressed.current['c'] || keysPressed.current['C']) {
        if (p.grounded) {
            p.breakdanceTimer = (p.breakdanceTimer || 0) + 1;
        }
    } else {
        p.breakdanceTimer = 0;
    }

    // --- Mach Sound Logic ---
    const machSpeed = Math.abs(p.vx!);
    if ((p.grounded || p.onRail) && machSpeed >= MACH_1_SPEED) {
        // Only play if we are moving faster than Mach 1 (8)
        let mach = 1;
        if (machSpeed >= MACH_3_SPEED) mach = 3;
        else if (machSpeed >= MACH_2_SPEED) mach = 2;
        audioSystem.updateMachLoop(mach);
    } else {
        audioSystem.stopMachLoop();
    }

    // --- Record Position History for Toppins & Gerry ---
    // Update history only if distance threshold is met to prevent bunching when idle/slow
    const lastRec = playerHistoryRef.current[0];
    const distToLast = lastRec ? Math.hypot(p.x - lastRec.x, p.y - lastRec.y) : 100;
    
    // Record a frame every ~5 pixels of movement
    if (distToLast > 5) {
        playerHistoryRef.current.unshift({ x: p.x, y: p.y, direction: p.direction || 1 });
        if (playerHistoryRef.current.length > MAX_HISTORY) {
            playerHistoryRef.current.pop();
        }
    } else if (playerHistoryRef.current.length === 0) {
        // Init first frame
        playerHistoryRef.current.unshift({ x: p.x, y: p.y, direction: p.direction || 1 });
    }

    // --- Timers ---
    if (p.tauntTimer && p.tauntTimer > 0) p.tauntTimer--;
    if (p.isAttacking) {
        if (!p.isSuperJumpCancel) {
            p.attackTimer = (p.attackTimer || 0) - 1;
            if (p.attackTimer <= 0) {
                p.isAttacking = false;
            }
        }
    }
    // Update Combo Timer
    if (state.combo > 0) {
        state.comboTimer -= COMBO_DECAY;
        if (state.comboTimer <= 0) {
            state.combo = 0;
            state.comboDropped = true;
        }
    }
    
    // --- Out of Bounds (Pit) ---
    if (p.y > (LEVEL_HEIGHT_TILES * TILE_SIZE) + 400) {
        audioSystem.playSFX('hurt');
        p.x = checkpointRef.current.x;
        p.y = checkpointRef.current.y;
        p.vx = 0;
        p.vy = 0;
        // Reset States
        p.isGroundPound = false;
        p.isDiving = false;
        p.isCrouching = false;
        p.isSuperJumpPrep = false;
        p.isSuperJumping = false;
        p.isSuperJumpCancel = false;
        p.isUppercutting = false;
        p.isTurning = false;
        p.isAttacking = false;
        p.grounded = true; 
        p.onRail = false;
        p.breakdanceTimer = 0;
        
        setShake(10);
        playerHistoryRef.current = [];
    }

    // --- Entity Updates (Enemies & Followers) ---
    const followers = level.filter(e => (e.type === EntityType.TOPPIN || e.type === EntityType.GERRY) && e.collected);

    level.forEach((e) => {
        if (e.dead) return;

        // 1. Handle Knocked Out (Physics)
        if (e.knockedOut) {
            e.x += (e.vx || 0);
            e.y += (e.vy || 0);
            e.vy = (e.vy || 0) + GRAVITY;
            e.vx = (e.vx || 0) * 0.99; // Air friction
            
            // Check bounds to kill
            if (e.y > (LEVEL_HEIGHT_TILES * TILE_SIZE) + 500) {
                e.dead = true;
            }
            return; // Skip normal AI
        }

        // 2. Handle Followers (Snake Logic)
        if ((e.type === EntityType.TOPPIN || e.type === EntityType.GERRY) && e.collected) {
            const index = followers.indexOf(e);
            // Spacing: We record every ~5px. We want ~40px spacing. So 8 indices per follower.
            const spacingFrames = 8;
            const historyIndex = (index + 1) * spacingFrames;
            
            // Use safe index to prevent out of bounds and ensure they stack at end of line if short history
            const safeIndex = Math.min(historyIndex, playerHistoryRef.current.length - 1);
            const frame = playerHistoryRef.current[safeIndex];
            
            if (frame) {
                e.x = frame.x;
                e.y = frame.y;
                e.direction = frame.direction;
                
                // --- FIX: Prevent floating when idle ---
                // If player is grounded and barely moving (idle), force toppins to ground level if they are floating
                if (p.grounded && Math.abs(p.vx!) < 0.5) {
                    // Check if toppin is higher than player (y is smaller)
                    if (e.y < p.y) {
                       e.y = p.y;
                    }
                }
            } else {
                e.x = p.x;
                e.y = p.y;
            }
            if (e.tauntTimer && e.tauntTimer > 0) {
                e.y -= 2; 
            }
            return;
        }

        // 3. Handle Active Enemies
        if (e.type === EntityType.ENEMY) {
            // Apply Gravity to ALL enemies now (including Tiny Bill)
            e.vy = (e.vy || 0) + GRAVITY;

            // --- AI Logic ---
            if (e.enemyType === EnemyType.FORK_BOT) {
                const speed = 2;
                e.vx = (e.direction || 1) * speed;
                if (e.patrolStart !== undefined && e.patrolEnd !== undefined) {
                    if (e.x <= e.patrolStart) { e.x = e.patrolStart; e.direction = 1; }
                    if (e.x >= e.patrolEnd) { e.x = e.patrolEnd; e.direction = -1; }
                }
                
                // Ledge Detection (Turn around instead of falling)
                if (e.grounded) {
                    const lookAhead = e.direction! * (e.w / 2 + 10);
                    const checkX = e.x + (e.w / 2) + lookAhead;
                    const checkY = e.y + e.h + 5;
                    // Check if there is ground ahead
                    const hasGround = level.some(b => 
                        (b.type === EntityType.BLOCK || b.type === EntityType.PLATFORM || b.type === EntityType.BREAKABLE) &&
                        !b.dead &&
                        checkX >= b.x && checkX <= b.x + b.w &&
                        checkY >= b.y && checkY <= b.y + b.h
                    );
                    if (!hasGround) {
                        e.direction! *= -1;
                        e.vx = 0;
                    }
                }
            }
            else if (e.enemyType === EnemyType.SPICY_SLIME) {
                // No more bouncing. Just a slow moving hazard.
                e.vx = (e.direction || 1) * 1;
                // Patrol limits if needed, or just wall bounce
                
                // Ledge Detection for Slimes too
                if (e.grounded) {
                    const lookAhead = e.direction! * (e.w / 2 + 10);
                    const checkX = e.x + (e.w / 2) + lookAhead;
                    const checkY = e.y + e.h + 5;
                    const hasGround = level.some(b => 
                        (b.type === EntityType.BLOCK || b.type === EntityType.PLATFORM || b.type === EntityType.BREAKABLE) &&
                        !b.dead &&
                        checkX >= b.x && checkX <= b.x + b.w &&
                        checkY >= b.y && checkY <= b.y + b.h
                    );
                    if (!hasGround) {
                        e.direction! *= -1;
                        e.vx = 0;
                    }
                }
            }
            else if (e.enemyType === EnemyType.TINY_BILL) {
                if (state.status === 'ESCAPE') {
                    // Grounded Chase Logic
                    const dx = p.x - e.x;
                    const dy = p.y - e.y;
                    const distance = Math.abs(dx);
                    
                    if (distance < 600) { // Aggro range
                         const speed = 6;
                         e.direction = dx > 0 ? 1 : -1;
                         e.vx = e.direction * speed;
                         
                         // Jump over obstacles (simple)
                         if (e.grounded && Math.abs(dx) > 20) {
                             // If we hit a wall or just randomly to be chaotic
                             if (e.vx === 0) e.vy = -12;
                         }
                         
                         // Punch logic
                         if (distance < 50 && e.grounded) {
                             // Punch animation state could go here
                             // For now, just ensuring collision logic hurts player
                         }
                    } else {
                        e.vx = 0;
                    }
                } else {
                    e.vx = 0; e.vy = 0;
                }
            }

            // Apply Velocity
            e.x += (e.vx || 0);
            e.y += (e.vy || 0);

            // --- World Collision (All Enemies) ---
            e.grounded = false;
            // Check nearby blocks
            for (const other of level) {
                if (other.type === EntityType.BLOCK || other.type === EntityType.PLATFORM || other.type === EntityType.BREAKABLE) {
                    if (other.dead) continue;
                    
                    // CULLING OPTIMIZATION FIX:
                    // Use a bounding box check with margin instead of distance from top-left.
                    // This prevents enemies from falling through large blocks.
                    const margin = 100;
                    if (e.x + e.w + margin < other.x || 
                        e.x - margin > other.x + other.w || 
                        e.y + e.h + margin < other.y || 
                        e.y - margin > other.y + other.h) {
                        continue;
                    }

                    const { collided, side } = resolveCollision(e, other);
                    if (collided) {
                        if (side === 'bottom') {
                            e.vy = 0;
                            e.y = other.y + other.h;
                        } else if (side === 'top') {
                            e.vy = 0;
                            e.grounded = true;
                            e.y = other.y - e.h;
                        } else if (side === 'left') {
                            e.vx = 0;
                            e.x = other.x - e.w;
                            e.direction = -1;
                            if (e.enemyType === EnemyType.TINY_BILL && e.grounded) e.vy = -12; // Wall Jump behavior
                            if (e.enemyType === EnemyType.SPICY_SLIME) e.direction = -1; // Bounce
                            if (e.enemyType === EnemyType.FORK_BOT) e.direction *= -1;
                        } else if (side === 'right') {
                            e.vx = 0;
                            e.x = other.x + other.w;
                            e.direction = 1;
                            if (e.enemyType === EnemyType.TINY_BILL && e.grounded) e.vy = -12; // Wall Jump behavior
                            if (e.enemyType === EnemyType.SPICY_SLIME) e.direction = 1; // Bounce
                            if (e.enemyType === EnemyType.FORK_BOT) e.direction *= -1;
                        }
                    }
                }
            }
        }
    });

    // --- Movement Logic (Player) ---
    // 1. Handle Turning (Mach Drift)
    if (p.isTurning) {
        p.turnTimer! -= 1;
        p.vx = p.vx! * 0.92; 
        if (Math.random() > 0.5) createParticles(p.x + p.w/2, p.y + p.h, 1, '#fff');

        if (p.turnTimer! <= 0) {
            p.isTurning = false;
            p.direction! *= -1; 
            p.vx = p.direction! * p.storedSpeed!; 
            createParticles(p.x + p.w/2, p.y + p.h/2, 10, '#f56565');
        }
    } else if (p.isSuperJumpPrep) {
        p.vx = 0; 
        if (!keysPressed.current['ArrowUp']) p.isSuperJumpPrep = false;
        if (p.isUppercutting) p.isSuperJumpPrep = false;
        if (Math.random() > 0.5) createParticles(p.x + Math.random()*p.w, p.y + p.h, 1, '#ff4500');
    } else {
        if (!p.isSuperJumping && !p.isGroundPound && !p.isUppercutting && Math.abs(p.vx!) >= MACH_2_SPEED && keysPressed.current['ArrowUp'] && p.grounded) {
            p.isSuperJumpPrep = true;
        }
        if (keysPressed.current['ArrowDown']) {
            if (!p.isSuperJumping && !p.isUppercutting && !p.isSuperJumpCancel) {
                const isFast = Math.abs(p.vx!) >= MACH_1_SPEED; 
                const isSprinting = keysPressed.current['Shift'];
                if (p.grounded || p.onRail) {
                    if (isSprinting || isFast || p.isDiving) {
                        if (!p.isDiving) {
                            p.isDiving = true;
                            p.isCrouching = false;
                            const boost = Math.max(Math.abs(p.vx!), MACH_2_SPEED);
                            p.vx = (p.direction || 1) * boost;
                        }
                    } else {
                        p.isCrouching = true;
                    }
                } else {
                    p.isDiving = true;
                    p.isGroundPound = false; 
                    if (p.vy! < 12) p.vy! += 3.0; 
                }
            }
        } else {
            p.isCrouching = false;
            if ((p.grounded || p.onRail) && p.isDiving) p.isDiving = false; 
            if (!p.grounded && p.isDiving) p.isDiving = false; 
        }

        if (!p.isGroundPound && !p.isSuperJumping) {
            const isSprinting = keysPressed.current['Shift'];
            const maxSpeed = isSprinting ? MACH_3_SPEED : RUN_SPEED_CAP;
            const currentSpeed = Math.abs(p.vx!);
            if ((p.grounded || p.onRail) && currentSpeed >= MACH_2_SPEED) {
                if ((keysPressed.current['ArrowLeft'] && p.direction === 1) || (keysPressed.current['ArrowRight'] && p.direction === -1)) {
                    p.isTurning = true;
                    p.turnTimer = 15;
                    p.storedSpeed = currentSpeed;
                    createParticles(p.x + p.w/2, p.y + p.h, 8, '#fff');
                    setShake(3);
                }
            }

            if (!p.isTurning) {
                if (keysPressed.current['ArrowRight']) {
                    if (!p.isCrouching) {
                        p.direction = 1;
                        if (p.vx! < maxSpeed) p.vx! += isSprinting ? 0.8 : 0.5; else if (!isSprinting && p.vx! > maxSpeed) p.vx! *= 0.98;
                    } else if (p.grounded || p.onRail) {
                        p.vx = CROUCH_SPEED; p.direction = 1;
                    }
                } else if (keysPressed.current['ArrowLeft']) {
                    if (!p.isCrouching) {
                        p.direction = -1;
                        if (p.vx! > -maxSpeed) p.vx! -= isSprinting ? 0.8 : 0.5; else if (!isSprinting && p.vx! < -maxSpeed) p.vx! *= 0.98;
                    } else if (p.grounded || p.onRail) {
                        p.vx = -CROUCH_SPEED; p.direction = -1;
                    }
                } else {
                    const friction = Math.abs(p.vy!) < 0.2 ? GROUND_FRICTION : AIR_FRICTION;
                    p.vx! *= friction;
                }
            }
        }
    }

    if (p.isSuperJumping) { p.vx = 0; p.vy = SUPER_JUMP_FORCE; createParticles(p.x + p.w/2, p.y + p.h, 2, 'rgba(255,255,255,0.5)'); } 
    else if (p.isSuperJumpPrep) { p.vx = 0; } 
    else if (p.isGroundPound) { p.vx = 0; p.vy! += 1.5; } 
    else if (p.isDiving) { p.vy! += GRAVITY; } 
    else if (!p.onRail) { 
        if (p.isSuperJumpCancel) {
            p.vy! += GRAVITY * 0.3; // Slow falling
        } else {
            p.vy! += GRAVITY; 
        }
    }

    p.x += p.vx!;
    p.y += p.vy!;

    const collisionSpeed = Math.abs(p.vx!);
    const isMach2 = collisionSpeed > MACH_1_SPEED;
    const aggressive = isMach2 || p.isAttacking || p.isGroundPound || p.isDiving || p.isSuperJumping || p.isUppercutting;

    // --- Collisions ---
    if (shake > 0) setShake(prev => Math.max(0, prev - 1));
    const cullRange = 2000; 
    
    p.grounded = false;
    p.onRail = false;

    for (const entity of level) {
      if (entity.dead) continue;
      if (entity.knockedOut) continue; // Don't collide with KO'd enemies
      if (entity.escapeOnly && state.status !== 'ESCAPE') continue;
      if (entity.x > p.x + cullRange || entity.x + entity.w < p.x - cullRange) continue;

      // BYPASS: Followers and collected items should NEVER collide physically
      if (entity.type === EntityType.TOPPIN) continue;
      if (entity.type === EntityType.GERRY && entity.collected) continue;
      if (entity.collected) continue;

      if (checkCollision(p, entity)) {
        // --- Trigger Logic (Non-Solid) ---
        
        // 1. Checkpoint
        if (entity.type === EntityType.CHECKPOINT) {
            if (!entity.active) {
                entity.active = true;
                checkpointRef.current = { x: entity.x, y: entity.y - 20 }; 
                audioSystem.playSFX('collect');
                createParticles(entity.x + entity.w/2, entity.y, 20, '#00ff00');
            }
            continue; // Explicitly skip resolution
        }

        // 2. Gerry
        if (entity.type === EntityType.GERRY) {
            if (!entity.collected) {
                entity.collected = true;
                state.gerryCollected = true;
                audioSystem.playSFX('collect');
                if (state.combo > 0) state.comboTimer = 100;
                state.score += 1000;
                setShake(5);
                createParticles(entity.x + entity.w/2, entity.y, 20, '#d69e2e'); 
            }
            continue;
        }

        // 3. Secrets
        if (entity.type === EntityType.SECRET) {
            entity.dead = true;
            state.secretsFound += 1;
            state.score += 500;
            state.combo += 1;
            state.comboTimer = 100;
            audioSystem.playSFX('secret');
            setShake(5);
            createParticles(entity.x + entity.w/2, entity.y + entity.h/2, 30, '#ec4899');
            continue;
        }

        // 4. Treasure
        if (entity.type === EntityType.TREASURE) {
            entity.dead = true;
            state.treasureCollected = true;
            state.score += 3000;
            state.combo += 1;
            state.comboTimer = 100;
            audioSystem.playSFX('secret');
            setShake(30); 
            createParticles(entity.x + entity.w/2, entity.y + entity.h/2, 50, '#ffd700'); 
            continue;
        }

        // 5. Toppin Cage
        if (entity.type === EntityType.TOPPIN_CAGE) {
            if (aggressive || p.isUppercutting) {
                entity.dead = true; state.score += 1000; setShake(10);
                audioSystem.playSFX('break');
                audioSystem.playSFX('collect');
                state.combo += 1; state.comboTimer = 100;
                createParticles(entity.x + entity.w/2, entity.y + entity.h/2, 20, '#d1d5db'); 
                entity.dead = false; entity.type = EntityType.TOPPIN; entity.w = 30; entity.h = 30;
                entity.collected = true; entity.tauntTimer = 0;
            } 
            continue; // Always continue, so it's never solid.
        }

        // 6. Janitor Door
        if (entity.type === EntityType.JANITOR_DOOR) {
            if (state.gerryCollected) {
                entity.dead = true;
                audioSystem.playSFX('break');
                createParticles(entity.x + entity.w/2, entity.y + entity.h/2, 20, '#fff');
                setShake(5);
                continue; // Opened -> Not solid
            }
            // If locked, falls through to Solid Logic
        }

        // 7. Collectible
        if (entity.type === EntityType.COLLECTIBLE) {
          entity.dead = true;
          state.score += entity.value || 10;
          state.combo += 1;
          state.comboTimer = 100; 
          audioSystem.playSFX('collect');
          createParticles(entity.x, entity.y, 5, entity.escapeOnly ? '#00ff00' : '#ffd700');
          continue;
        }

        // 8. Escape Trigger
        if (entity.type === EntityType.TRIGGER_ESCAPE) {
          if (state.status !== 'ESCAPE') {
              state.status = 'ESCAPE';
              state.escapeTimer = MAX_ESCAPE_TIME;
              setShake(20);
              entity.triggered = true;
              
              // Launch him!
              entity.knockedOut = true;
              entity.vx = 15;
              entity.vy = -25;

              audioSystem.playSFX('escape');
              createParticles(entity.x + entity.w/2, entity.y + entity.h/2, 20, '#ff4500');
          }
          continue;
        }

        // 9. Exit Door
        if (entity.type === EntityType.EXIT_DOOR) {
          if (state.status === 'ESCAPE') {
            showExitPromptRef.current = true;
            if (keysPressed.current['ArrowUp']) {
                state.status = 'VICTORY';
                onGameOver(state.score, getRank(state), true, state.lap3);
                return;
            }
          }
          continue;
        }
        
        // 10. Lap Portal
        if (entity.type === EntityType.LAP_PORTAL) {
            if (state.status === 'ESCAPE') {
                if (!state.lap2) {
                    state.lap2 = true;
                    state.score += 3000;
                    state.comboTimer = 100; // Refuel combo
                    p.x = 240 * TILE_SIZE; // Teleport to Big ol' Bill
                    p.y = 28 * TILE_SIZE;
                    p.vx = 0; p.vy = 0;
                    setShake(30);
                    audioSystem.playSFX('escape'); 
                    createParticles(p.x, p.y, 50, '#9f7aea');
                    level.forEach(e => {
                        if (e.type === EntityType.COLLECTIBLE && e.escapeOnly) e.dead = false;
                        if (e.enemyType === EnemyType.TINY_BILL) {
                            e.dead = false;
                            e.knockedOut = false;
                            if (e.initialX !== undefined) e.x = e.initialX;
                            if (e.initialY !== undefined) e.y = e.initialY;
                            e.vx = 0; e.vy = 0; e.attackTimer = 0;
                        }
                        if (e.type === EntityType.TRIGGER_ESCAPE) {
                            // Reset Big Bill for Lap 2
                            e.knockedOut = false; e.triggered = false; e.x = 240 * TILE_SIZE; e.y = 28 * TILE_SIZE; e.vx = 0; e.vy = 0;
                        }
                    });
                } else if (!state.lap3) {
                    state.lap3 = true;
                    state.score += 5000; 
                    state.comboTimer = 100; // Refuel combo
                    p.x = 240 * TILE_SIZE; // Teleport to Big ol' Bill
                    p.y = 28 * TILE_SIZE;
                    p.vx = 0; p.vy = 0;
                    setShake(50);
                    audioSystem.playSFX('escape'); 
                    createParticles(p.x, p.y, 80, '#ef4444');
                    state.escapeTimer = 0.1; 
                    level.forEach(e => {
                        if (e.type === EntityType.COLLECTIBLE && e.escapeOnly) e.dead = false;
                        if (e.enemyType === EnemyType.TINY_BILL) {
                            e.dead = false;
                            e.knockedOut = false;
                            if (e.initialX !== undefined) e.x = e.initialX;
                            if (e.initialY !== undefined) e.y = e.initialY;
                            e.vx = 0; e.vy = 0; e.attackTimer = 0;
                        }
                        if (e.type === EntityType.TRIGGER_ESCAPE) {
                             e.knockedOut = false; e.triggered = false; e.x = 240 * TILE_SIZE; e.y = 28 * TILE_SIZE; e.vx = 0; e.vy = 0;
                        }
                    });
                }
            }
            continue;
        }

        if (entity.type === EntityType.BREAKABLE) {
          if (aggressive || p.isUppercutting) {
            entity.dead = true;
            state.score += 50;
            audioSystem.playSFX('break');
            createParticles(entity.x, entity.y, 8, '#a52a2a');
            setShake(2);
            continue;
          }
        }
        if (entity.type === EntityType.SLURP_RAIL) {
           if (p.vy! < 0 || p.isGroundPound || p.isSuperJumping || p.isSuperJumpPrep || p.isUppercutting) continue; 
           if (p.y + p.h <= entity.y + entity.h + 20 && p.y + p.h >= entity.y - 10) {
              p.vy = 0;
              p.y = entity.y - p.h + 8; // Snap
              if (Math.abs(p.vx!) < 10) p.vx = p.direction! * 10; 
              p.onRail = true;
              p.isDiving = false; p.isCrouching = false;
              audioSystem.playSFX('dash');
              createParticles(p.x + p.w/2, p.y + p.h, 2, '#FFFF00');
              continue;
           }
        }
        if (entity.type === EntityType.ENEMY) {
          if (p.tauntTimer && p.tauntTimer > 0) {
              performParry(entity);
              continue; 
          }
          const falling = p.vy! > 0 && p.y + p.h < entity.y + entity.h / 2;
          if (entity.enemyType === EnemyType.FORK_BOT) {
              const hitFront = (entity.direction === 1 && p.x > entity.x) || (entity.direction === -1 && p.x < entity.x);
              if (falling || p.isUppercutting) { killEnemy(entity); } 
              else if (!hitFront && aggressive) { killEnemy(entity); } 
              else if (hitFront && collisionSpeed >= MACH_2_SPEED) { killEnemy(entity); } 
              else { hurtPlayer(true); }
          } else if (entity.enemyType === EnemyType.TINY_BILL) {
               if (falling || aggressive || p.isUppercutting) { killEnemy(entity); } else { hurtPlayer(true); }
          } else if (entity.enemyType === EnemyType.SPICY_SLIME) {
               killEnemy(entity);
          } else {
              if (falling || aggressive || p.isUppercutting) { killEnemy(entity); } else { hurtPlayer(false); }
          }
          continue;
        }

        const { side } = resolveCollision(p, entity);
        if (side === 'top') {
          if (p.vy! > 0) audioSystem.playSFX('land');
          p.y = entity.y - p.h; p.vy = 0; p.grounded = true; 
          if (p.isGroundPound) { p.isGroundPound = false; audioSystem.playSFX('bump'); createParticles(p.x + p.w/2, p.y + p.h, 20, '#fbd38d'); setShake(10); }
          if (p.isUppercutting) { p.isUppercutting = false; createParticles(p.x + p.w/2, p.y + p.h, 10, '#fbd38d'); }
          if (p.isSuperJumpCancel) { p.isSuperJumpCancel = false; p.isAttacking = false; createParticles(p.x + p.w/2, p.y + p.h, 10, '#fff'); }
        } else if (side === 'bottom') {
          p.y = entity.y + entity.h; p.vy = 0;
          if (p.isSuperJumping) { p.isSuperJumping = false; audioSystem.playSFX('bump'); createParticles(p.x + p.w/2, p.y, 20, '#fff'); setShake(15); }
        } else if (side === 'left') {
          p.x = entity.x - p.w;
          if (p.isDiving || p.isAttacking) { p.isDiving = false; p.isAttacking = false; p.vx = -5; p.vy = -4; setShake(5); audioSystem.playSFX('bump'); createParticles(p.x + p.w, p.y + p.h/2, 5, '#fff'); } 
          else if (keysPressed.current['Shift'] && keysPressed.current['ArrowRight']) { p.vy = -10; p.vx = 0; } else { p.vx = 0; }
        } else if (side === 'right') {
          p.x = entity.x + entity.w;
          if (p.isDiving || p.isAttacking) { p.isDiving = false; p.isAttacking = false; p.vx = 5; p.vy = -4; setShake(5); audioSystem.playSFX('bump'); createParticles(p.x, p.y + p.h/2, 5, '#fff'); } 
          else if (keysPressed.current['Shift'] && keysPressed.current['ArrowLeft']) { p.vy = -10; p.vx = 0; } else { p.vx = 0; }
        }
      }
    }

    // (Particle Updates)
    particlesRef.current.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.life -= 0.05; });
    particlesRef.current = particlesRef.current.filter(pt => pt.life > 0);

    // --- Camera ---
    const targetCamX = p.x - window.innerWidth / 2 + (p.vx! * 20); 
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;
    if (p.isSuperJumping) {
        const targetCamY = p.y - window.innerHeight / 2;
        cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.2;
    } else {
        const groundY = 28 * TILE_SIZE; // Focus slightly lower
        const targetCamY = Math.min(p.y - window.innerHeight / 2, groundY);
        cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.1;
    }

    if (requestRef.current! % 10 === 0) setUiState({...state});
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) => {
      // Parallax Industrial Background
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      const isLap3 = gameStateRef.current.lap3;
      const isEscape = gameStateRef.current.status === 'ESCAPE';

      // Base color
      ctx.fillStyle = isLap3 ? '#1a0000' : (isEscape ? '#1a1010' : '#0f172a');
      ctx.fillRect(0, 0, width, height);

      // Distant Pipes (Slow moving)
      ctx.save();
      const pipesX = -(cameraX * 0.2) % 200;
      const pipesY = -(cameraY * 0.2);
      ctx.strokeStyle = isLap3 ? '#330000' : '#1e293b';
      ctx.lineWidth = 40;
      ctx.beginPath();
      for (let i = -200; i < width + 200; i += 200) {
          ctx.moveTo(i + pipesX, 0); ctx.lineTo(i + pipesX, height);
          ctx.moveTo(0, i + pipesY); ctx.lineTo(width, i + pipesY);
      }
      ctx.stroke();
      ctx.restore();

      // Closer Gears (Medium speed)
      ctx.save();
      const gearsX = -(cameraX * 0.5) % 400;
      const gearsY = -(cameraY * 0.5) % 400;
      ctx.fillStyle = isLap3 ? '#4a0000' : '#334155';
      for (let i = -400; i < width + 400; i += 400) {
          for (let j = -400; j < height + 400; j += 400) {
              const cx = i + gearsX + 200;
              const cy = j + gearsY + 200;
              // Simple gear shape
              ctx.beginPath();
              ctx.arc(cx, cy, 60, 0, Math.PI * 2);
              ctx.fill();
              // Teeth
              for(let k=0; k<8; k++) {
                  const angle = (k / 8) * Math.PI * 2 + (Date.now() / 1000);
                  const tx = cx + Math.cos(angle) * 70;
                  const ty = cy + Math.sin(angle) * 70;
                  ctx.fillRect(tx - 10, ty - 10, 20, 20);
              }
          }
      }
      ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const level = levelRef.current!; // Defined level here
    const { width, height } = ctx.canvas;
    
    // Draw Background Layer (Fixed to screen mostly, but moves with parallax)
    drawBackground(ctx, cameraRef.current.x, cameraRef.current.y);

    ctx.save();
    // Screen Shake
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;
    ctx.translate(-cameraRef.current.x + shakeX, -cameraRef.current.y + shakeY);

    const isEscape = gameStateRef.current.status === 'ESCAPE';
    const isLap3 = gameStateRef.current.lap3;

    // Draw Level Entities
    level.forEach(e => {
      if (e.dead) return;
      if (e.escapeOnly && !isEscape) return;
      if (e.x > cameraRef.current.x + width + 100 || e.x + e.w < cameraRef.current.x - 100) return;
      
      // Handle Rotation for Knocked Out Enemies
      if (e.knockedOut) {
          ctx.save();
          ctx.translate(e.x + e.w/2, e.y + e.h/2);
          ctx.rotate(Date.now() / 100);
          ctx.translate(-(e.x + e.w/2), -(e.y + e.h/2));
      }

      // Special Lap Portal Logic (Already existing)
      if (e.type === EntityType.LAP_PORTAL) {
          if (isEscape && (!gameStateRef.current.lap2 || (gameStateRef.current.lap2 && !gameStateRef.current.lap3))) {
              const time = Date.now() / 200; 
              ctx.fillStyle = gameStateRef.current.lap2 ? '#ef4444' : '#9f7aea'; 
              const wobble = Math.sin(time) * 5; 
              ctx.beginPath(); ctx.ellipse(e.x + e.w/2, e.y + e.h/2, e.w/2 + wobble, e.h/2 - wobble, 0, 0, Math.PI * 2); ctx.fill(); 
              ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); 
              ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; 
              ctx.fillText(gameStateRef.current.lap2 ? "LAP 2?" : "LAP 3", e.x + 5, e.y + e.h/2 + 5);
          }
          if (e.knockedOut) ctx.restore(); // Should not happen for portals but safety
          return;
      }
      
      if (e.type === EntityType.BLOCK || e.type === EntityType.PLATFORM) {
        // INDUSTRIAL TILESET RENDERING
        const isPlat = e.type === EntityType.PLATFORM;
        
        ctx.fillStyle = isLap3 ? '#4a0000' : (isEscape ? '#4a2525' : '#475569');
        ctx.fillRect(e.x, e.y, e.w, e.h);
        
        // Borders (Industrial Metal Plate)
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x, e.y, e.w, e.h);
        
        // Rivets
        ctx.fillStyle = '#cbd5e1';
        if (!isPlat) {
            ctx.beginPath(); ctx.arc(e.x + 5, e.y + 5, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x + e.w - 5, e.y + 5, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x + 5, e.y + e.h - 5, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x + e.w - 5, e.y + e.h - 5, 2, 0, Math.PI*2); ctx.fill();
            
            // X Brace Pattern
            if (e.w > 30 && e.h > 30) {
               ctx.strokeStyle = '#334155';
               ctx.lineWidth = 1;
               ctx.beginPath(); 
               ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.w, e.y + e.h);
               ctx.moveTo(e.x + e.w, e.y); ctx.lineTo(e.x, e.y + e.h);
               ctx.stroke();
            }
        } else {
            // Platform Scaffolding
            ctx.fillStyle = '#1e293b';
            for(let i=5; i<e.w; i+=10) {
               ctx.fillRect(e.x + i, e.y, 2, e.h);
            }
        }

      } else if (e.type === EntityType.BREAKABLE) {
        ctx.fillStyle = '#7c3aed';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.strokeStyle = '#a78bfa'; ctx.strokeRect(e.x, e.y, e.w, e.h);
        // Cracks
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.w, e.y + e.h); ctx.stroke();
      } else if (e.type === EntityType.TOPPIN_CAGE) {
         ctx.fillStyle = '#4a5568'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.fillStyle = '#a0aec0'; ctx.fillRect(e.x + 10, e.y, 5, e.h); ctx.fillRect(e.x + 20, e.y, 5, e.h); ctx.fillRect(e.x + 30, e.y, 5, e.h); ctx.fillStyle = '#ecc94b'; ctx.fillRect(e.x + 15, e.y + 15, 15, 15); ctx.fillStyle = 'white'; ctx.font = '10px Arial'; ctx.fillText("HELP", e.x + 10, e.y - 5);
      } else if (e.type === EntityType.GERRY) {
          const dir = e.direction || 1; const gx = e.x; const gy = e.y;
          ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.moveTo(gx + 10, gy + 10); ctx.lineTo(gx + 20, gy + 10); ctx.lineTo(gx + 25, gy + 20); ctx.lineTo(gx + 25, gy + e.h); ctx.lineTo(gx + 5, gy + e.h); ctx.lineTo(gx + 5, gy + 20); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ef4444'; ctx.fillRect(gx + 5, gy, 20, 10); ctx.fillRect(gx + (dir === 1 ? 20 : 0), gy + 5, 10, 5);
          ctx.fillStyle = '#22d3ee'; ctx.fillRect(gx + (dir === 1 ? 22 : -5), gy + 25, 8, 8); ctx.fillRect(gx + 5, gy + e.h - 5, 8, 5); ctx.fillRect(gx + 17, gy + e.h - 5, 8, 5);
          const eyeX = gx + (dir === 1 ? 15 : 8); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(eyeX, gy + 18, 5, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX, gy + 18, 2, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'black'; ctx.fillRect(gx + (dir === 1 ? 12 : 5), gy + 12, 10, 3); ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.arc(gx + (dir === 1 ? 20 : 10), gy + 22, 4, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fde047'; ctx.fillRect(gx + (dir === 1 ? 15 : 5), gy + 26, 12, 4);
          if (e.tauntTimer! > 0) { ctx.fillStyle = 'white'; ctx.fillText("!", gx + 10, gy - 5); }
      } else if (e.type === EntityType.TOPPIN) {
           // Do not draw here to avoid pink square overlap, handled in separate pass
      } else if (e.type === EntityType.SECRET) {
          const hover = Math.sin(Date.now() / 200) * 5; ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.arc(e.x + 15, e.y + 15 + hover, 15, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(e.x + 15, e.y + 15 + hover, 10, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(e.x + 15, e.y + 15 + hover, 4, 0, Math.PI*2); ctx.fill();
      } else if (e.type === EntityType.JANITOR_DOOR) {
          ctx.fillStyle = '#718096'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 4; ctx.strokeRect(e.x, e.y, e.w, e.h); ctx.fillStyle = '#1a202c'; ctx.beginPath(); ctx.arc(e.x + e.w/2, e.y + e.h/2 - 10, 15, Math.PI, 0); ctx.fill(); ctx.fillRect(e.x + e.w/2 - 15, e.y + e.h/2 - 10, 30, 25); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(e.x + e.w/2, e.y + e.h/2 + 2, 5, 0, Math.PI*2); ctx.fill(); ctx.fillRect(e.x + e.w/2 - 2, e.y + e.h/2 + 2, 4, 10);
      } else if (e.type === EntityType.TREASURE) {
          ctx.fillStyle = '#fbbf24'; ctx.fillRect(e.x, e.y + 10, e.w, e.h - 10); ctx.fillStyle = '#f59e0b'; ctx.fillRect(e.x - 2, e.y + 5, e.w + 4, 10); ctx.fillStyle = 'white'; ctx.font = '20px Arial'; ctx.fillText("✨", e.x + 5, e.y);
      } else if (e.type === EntityType.SLURP_RAIL) {
        ctx.fillStyle = '#00ff00'; ctx.globalAlpha = 0.6; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.globalAlpha = 1.0;
        // Rail Texture
        ctx.strokeStyle = '#004400'; ctx.beginPath(); ctx.moveTo(e.x, e.y + e.h/2); ctx.lineTo(e.x + e.w, e.y + e.h/2); ctx.stroke();
      } else if (e.type === EntityType.COLLECTIBLE) {
        ctx.fillStyle = e.escapeOnly ? '#48bb78' : '#f6e05e'; ctx.beginPath(); ctx.arc(e.x + e.w/2, e.y + e.h/2, 10, 0, Math.PI * 2); ctx.fill(); if (e.escapeOnly) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      } else if (e.type === EntityType.CHECKPOINT) {
        ctx.fillStyle = '#4a5568'; ctx.fillRect(e.x + 5, e.y, 5, e.h); ctx.fillStyle = e.active ? '#48bb78' : '#e53e3e'; ctx.beginPath(); ctx.moveTo(e.x + 10, e.y + 5); ctx.lineTo(e.x + 40, e.y + 15); ctx.lineTo(e.x + 10, e.y + 25); ctx.fill();
      } else if (e.type === EntityType.TRIGGER_ESCAPE) {
        // (Trigger Escape Drawing Code)
        ctx.save();
        if (e.triggered) { const centerX = e.x + e.w/2; const centerY = e.y + e.h/2; ctx.translate(centerX, centerY); ctx.rotate(Date.now() / 100); ctx.translate(-centerX, -centerY); }
        ctx.fillStyle = '#ff4500'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.strokeStyle = '#b33000'; ctx.lineWidth = 4; ctx.strokeRect(e.x, e.y, e.w, e.h);
        const cx = e.x + e.w / 2;
        if (e.triggered) {
            ctx.fillStyle = '#3e2723'; ctx.fillRect(cx - 35, e.y + 10, 30, 8); ctx.fillRect(cx + 5, e.y + 10, 30, 8);
            const eyeY = e.y + 60; ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(cx - 20, eyeY, 20, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 20, eyeY, 20, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(cx - 20, eyeY, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 20, eyeY, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.ellipse(cx, e.y + 110, 15, 25, 0, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.strokeStyle = '#802000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 30, e.y + 20); ctx.bezierCurveTo(cx - 10, e.y + 25, cx + 10, e.y + 25, cx + 30, e.y + 20); ctx.stroke();
            ctx.fillStyle = '#3e2723'; ctx.beginPath(); ctx.rect(cx - 40, e.y + 50, 35, 12); ctx.fill(); ctx.beginPath(); ctx.rect(cx + 5, e.y + 50, 35, 12); ctx.fill();
            const eyeY = e.y + 75; ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(cx - 20, eyeY, 14, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 20, eyeY, 14, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx - 20, eyeY, 4, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 20, eyeY, 4, 0, Math.PI * 2); ctx.stroke();
            const mouthY = e.y + 115; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 25, mouthY); ctx.quadraticCurveTo(cx, mouthY - 5, cx + 25, mouthY); ctx.stroke();
            ctx.fillStyle = '#b33000'; ctx.beginPath(); ctx.moveTo(cx - 28, mouthY); ctx.bezierCurveTo(cx - 20, mouthY + 25, cx + 20, mouthY + 25, cx + 28, mouthY); ctx.stroke();
        }
        ctx.restore();
      } else if (e.type === EntityType.EXIT_DOOR) {
        ctx.fillStyle = '#38a169'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.fillStyle = 'white'; ctx.fillText("EXIT", e.x, e.y - 10);
      } else if (e.type === EntityType.ENEMY) {
        if (e.enemyType === EnemyType.FORK_BOT) {
            ctx.fillStyle = '#718096'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.fillStyle = 'red'; ctx.fillRect(e.x + (e.direction === 1 ? 25 : 5), e.y + 10, 15, 5); ctx.fillStyle = '#cbd5e0'; const handleX = e.direction === 1 ? e.x + e.w : e.x - 25; ctx.fillRect(handleX, e.y + 20, 25, 8); const prongX = e.direction === 1 ? e.x + e.w + 25 : e.x - 25; const prongW = 5; ctx.fillRect(prongX, e.y + 15, prongW, 18); if (e.direction === 1) { ctx.fillRect(prongX + prongW, e.y + 15, 10, 3); ctx.fillRect(prongX + prongW, e.y + 22, 10, 3); ctx.fillRect(prongX + prongW, e.y + 29, 10, 3); } else { ctx.fillRect(prongX - 10, e.y + 15, 10, 3); ctx.fillRect(prongX - 10, e.y + 22, 10, 3); ctx.fillRect(prongX - 10, e.y + 29, 10, 3); }
        } else if (e.enemyType === EnemyType.TINY_BILL) {
            ctx.fillStyle = '#ff4500'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.strokeStyle = '#b33000'; ctx.lineWidth = 2; ctx.strokeRect(e.x, e.y, e.w, e.h); const isAttacking = e.attackTimer && e.attackTimer < 20; const isWindingUp = e.attackTimer && e.attackTimer >= 20; ctx.fillStyle = '#b33000'; ctx.fillRect(e.x + 10, e.y + e.h, 10, 8); ctx.fillRect(e.x + e.w - 20, e.y + e.h, 10, 8); ctx.fillStyle = '#ff4500'; if (isAttacking) { const armX = e.direction === 1 ? e.x + e.w : e.x - 15; ctx.fillRect(armX, e.y + 20, 25, 10); } else if (isWindingUp) { const armX = e.direction === 1 ? e.x - 10 : e.x + e.w; ctx.fillRect(armX, e.y + 15, 10, 10); } else { ctx.fillRect(e.x - 5, e.y + 20, 10, 10); ctx.fillRect(e.x + e.w - 5, e.y + 20, 10, 10); } const faceX = e.x + (e.direction === 1 ? 15 : 5); const faceY = e.y + 10; ctx.fillStyle = 'black'; ctx.fillRect(faceX, faceY, 10, 10); ctx.fillRect(faceX + 15, faceY, 10, 10); ctx.fillStyle = 'red'; ctx.fillRect(faceX + 3, faceY + 3, 4, 4); ctx.fillRect(faceX + 18, faceY + 3, 4, 4); ctx.fillStyle = 'white'; ctx.fillRect(faceX, faceY + 18, 25, 8); ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(faceX, faceY + 22); ctx.lineTo(faceX + 25, faceY + 22); ctx.stroke();
        } else {
            ctx.fillStyle = '#ef4444'; const time = Date.now() / 150; const squash = Math.abs(Math.sin(time)) * 4; const slimeH = e.h + squash; ctx.beginPath(); ctx.moveTo(e.x, e.y + e.h); ctx.lineTo(e.x + e.w, e.y + e.h); ctx.lineTo(e.x + e.w, e.y + 10 + squash); ctx.quadraticCurveTo(e.x + e.w/2, e.y - 5 + squash, e.x, e.y + 10 + squash); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'white'; const faceX = e.x + (e.direction === 1 ? 28 : 12); const faceY = e.y + 20 + squash; ctx.beginPath(); ctx.arc(faceX, faceY, 8, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(faceX + (e.direction === 1 ? 2 : -2), faceY, 3, 0, Math.PI*2); ctx.fill();
        }
      }
      
      // End Rotation for Knocked Out
      if (e.knockedOut) {
          ctx.restore();
      }
    });

    // Draw Player
    const p = playerRef.current;
    const speed = Math.abs(p.vx!);
    ctx.fillStyle = '#fbd38d'; 
    if (p.breakdanceTimer! > 20) { const spin = (Date.now() / 100); ctx.save(); ctx.translate(p.x + p.w/2, p.y + p.h/2); ctx.rotate(spin); ctx.fillStyle = '#fbd38d'; ctx.fillRect(-20, -10, 40, 20); ctx.fillRect(-25, 10, 10, 10); ctx.fillRect(15, 10, 10, 10); ctx.restore(); ctx.fillStyle = '#48bb78'; ctx.fillRect(p.x - 40, p.y + p.h - 30, 30, 30); ctx.fillStyle = '#1a202c'; ctx.beginPath(); ctx.arc(p.x - 25, p.y + p.h - 15, 10, 0, Math.PI*2); ctx.fill(); }
    else if (p.tauntTimer! > 0) { ctx.fillStyle = '#fbd38d'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.fillStyle = 'white'; ctx.font = '20px Arial'; ctx.fillText("!", p.x + p.w, p.y); }
    else if (p.onRail) { ctx.save(); ctx.translate(p.x + p.w/2, p.y + p.h); const tilt = (p.direction || 1) * 0.2; ctx.rotate(tilt); ctx.fillStyle = '#fbd38d'; ctx.fillRect(-p.w/2, -p.h, p.w, p.h); ctx.fillStyle = 'black'; ctx.fillRect((p.direction === 1 ? 5 : -15), -p.h + 12, 16, 4); ctx.restore(); }
    else if (p.isTurning) { ctx.fillStyle = '#fff'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.fillStyle = '#f56565'; ctx.fillRect(p.x - 10, p.y + p.h - 10, 10, 10); ctx.fillRect(p.x + p.w, p.y + p.h - 10, 10, 10); }
    else if (p.isUppercutting) { ctx.fillStyle = '#d53f8c'; ctx.fillRect(p.x, p.y - 10, p.w, p.h + 20); ctx.fillStyle = '#fff'; ctx.fillRect(p.x + 10, p.y - 20, 20, 20); }
    else if (p.isSuperJumpPrep) { ctx.fillStyle = (Math.floor(Date.now() / 50) % 2 === 0) ? '#fff' : '#f56565'; ctx.fillRect(p.x + 10, p.y + 20, p.w - 20, p.h - 20); }
    else if (p.isSuperJumping) { ctx.fillStyle = '#f56565'; ctx.fillRect(p.x + 10, p.y - 20, p.w - 20, p.h + 40); }
    else if (p.isGroundPound) { ctx.fillStyle = '#fbd38d'; ctx.fillRect(p.x + 5, p.y, p.w - 10, p.h); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5; ctx.fillRect(p.x + 5, p.y - 20, p.w - 10, 20); ctx.globalAlpha = 1.0; }
    else if (p.isDiving) { ctx.fillStyle = '#fbd38d'; ctx.fillRect(p.x - 10, p.y + 20, p.w + 20, p.h - 20); if (Math.abs(p.vx!) > 5 || Math.abs(p.vy!) > 10) { ctx.fillStyle = '#fff'; if (!p.grounded && !p.onRail) { ctx.fillRect(p.x, p.y - 20, 5, 20); ctx.fillRect(p.x + p.w - 5, p.y - 20, 5, 20); } else { ctx.fillRect(p.x - 20, p.y + 25, 20, 5); } } }
    else if (p.isCrouching) { ctx.fillStyle = '#fbd38d'; ctx.fillRect(p.x, p.y + 20, p.w, p.h - 20); ctx.fillStyle = 'white'; const eyeOffset = p.direction === 1 ? 25 : 5; ctx.fillRect(p.x + eyeOffset, p.y + 25, 10, 10); ctx.fillStyle = 'black'; ctx.fillRect(p.x + eyeOffset + 2, p.y + 27, 4, 4); }
    else { if (speed > MACH_2_SPEED && !p.isAttacking) { ctx.save(); ctx.translate(p.x + p.w/2, p.y + p.h); const lean = p.direction! * 0.4; ctx.transform(1, 0, lean, 1, 0, 0); ctx.fillStyle = '#f56565'; ctx.fillRect(-p.w/2, -p.h, p.w, p.h); ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'; ctx.fillRect(-p.w/2 - (p.vx! * 2), -p.h, p.w, p.h); ctx.globalAlpha = 1.0; ctx.restore(); ctx.fillStyle = 'white'; const eyeOffset = p.direction === 1 ? 25 : 5; ctx.fillRect(p.x + eyeOffset + (p.direction! * 10), p.y + 10, 10, 10); } else if (p.isAttacking) { ctx.fillStyle = '#ecc94b'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.fillStyle = '#fff'; const fistX = p.direction === 1 ? p.w : -20; ctx.fillRect(p.x + fistX, p.y + 15, 20, 15); ctx.fillStyle = 'white'; const eyeOffset = p.direction === 1 ? 25 : 5; ctx.fillRect(p.x + eyeOffset, p.y + 10, 10, 10); ctx.fillStyle = 'red'; ctx.fillRect(p.x + eyeOffset + 2, p.y + 12, 4, 4); } else { ctx.fillRect(p.x, p.y, p.w, p.h); ctx.fillStyle = 'white'; const eyeOffset = p.direction === 1 ? 25 : 5; ctx.fillRect(p.x + eyeOffset, p.y + 10, 10, 10); ctx.fillStyle = 'black'; ctx.fillRect(p.x + eyeOffset + 2, p.y + 12, 4, 4); } }
    
    // Draw Followers (Snake Chain)
    // const followers = level.filter(e => (e.type === EntityType.TOPPIN || e.type === EntityType.GERRY) && e.collected);
    // ^ Already defined above update() but this is draw(). Re-calculate or pass.
    const drawFollowers = level.filter(e => (e.type === EntityType.TOPPIN || e.type === EntityType.GERRY) && e.collected);
    
    drawFollowers.forEach((f, index) => {
        // Draw Follower
        const tx = f.x; const ty = f.y; const dir = f.direction || 1;

        if (f.type === EntityType.GERRY) {
             const gx = f.x; const gy = f.y;
             ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.moveTo(gx + 10, gy + 10); ctx.lineTo(gx + 20, gy + 10); ctx.lineTo(gx + 25, gy + 20); ctx.lineTo(gx + 25, gy + f.h); ctx.lineTo(gx + 5, gy + f.h); ctx.lineTo(gx + 5, gy + 20); ctx.closePath(); ctx.fill();
             ctx.fillStyle = '#ef4444'; ctx.fillRect(gx + 5, gy, 20, 10); ctx.fillRect(gx + (dir === 1 ? 20 : 0), gy + 5, 10, 5);
             ctx.fillStyle = '#22d3ee'; ctx.fillRect(gx + (dir === 1 ? 22 : -5), gy + 25, 8, 8); ctx.fillRect(gx + 5, gy + f.h - 5, 8, 5); ctx.fillRect(gx + 17, gy + f.h - 5, 8, 5);
             const eyeX = gx + (dir === 1 ? 15 : 8); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(eyeX, gy + 18, 5, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX, gy + 18, 2, 0, Math.PI*2); ctx.fill();
        } else {
             // Toppin Drawing Logic
             if (f.toppinType === ToppinType.NUGGET) { ctx.fillStyle = '#d69e2e'; ctx.beginPath(); ctx.moveTo(tx + 5, ty + 10); ctx.lineTo(tx + 25, ty + 8); ctx.lineTo(tx + 28, ty + 25); ctx.lineTo(tx + 5, ty + 25); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'black'; ctx.fillRect(tx + 12 + (dir*2), ty + 15, 2, 2); ctx.fillRect(tx + 18 + (dir*2), ty + 15, 2, 2); } 
             else if (f.toppinType === ToppinType.BURGER) { ctx.fillStyle = '#f6ad55'; ctx.fillRect(tx + 5, ty + 22, 20, 5); ctx.fillStyle = '#4a2511'; ctx.fillRect(tx + 4, ty + 17, 22, 5); ctx.fillStyle = '#48bb78'; ctx.fillRect(tx + 5, ty + 15, 20, 2); ctx.fillStyle = '#f6ad55'; ctx.beginPath(); ctx.arc(tx + 15, ty + 15, 12, Math.PI, 0); ctx.fill(); ctx.fillStyle = 'black'; ctx.fillRect(tx + 12 + (dir*2), ty + 10, 2, 2); ctx.fillRect(tx + 18 + (dir*2), ty + 10, 2, 2); } 
             else if (f.toppinType === ToppinType.PIZZA) { ctx.fillStyle = '#f6ad55'; ctx.beginPath(); ctx.moveTo(tx + 15, ty); ctx.lineTo(tx + 30, ty + 30); ctx.lineTo(tx, ty + 30); ctx.fill(); ctx.fillStyle = '#dd6b20'; ctx.fillRect(tx, ty, 30, 5); ctx.fillStyle = '#e53e3e'; ctx.beginPath(); ctx.arc(tx + 15, ty + 15, 3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(tx + 10, ty + 25, 3, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'black'; ctx.fillRect(tx + 13 + (dir*1), ty + 10, 2, 2); ctx.fillRect(tx + 17 + (dir*1), ty + 10, 2, 2); } 
             else if (f.toppinType === ToppinType.HOTDOG) { ctx.fillStyle = '#f6ad55'; ctx.fillRect(tx + 10, ty + 5, 10, 25); ctx.fillStyle = '#9b2c2c'; ctx.beginPath(); ctx.ellipse(tx + 15, ty + 17, 3, 14, 0, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = '#ecc94b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx + 15, ty + 5); ctx.lineTo(tx + 15, ty + 25); ctx.stroke(); ctx.fillStyle = 'black'; ctx.fillRect(tx + 13 + (dir*1), ty + 12, 1, 1); ctx.fillRect(tx + 16 + (dir*1), ty + 12, 1, 1); } 
             else if (f.toppinType === ToppinType.SLUSHY) { ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(tx + 8, ty + 30); ctx.lineTo(tx + 22, ty + 30); ctx.lineTo(tx + 25, ty + 10); ctx.lineTo(tx + 5, ty + 10); ctx.fill(); ctx.fillStyle = '#4299e1'; ctx.beginPath(); ctx.arc(tx + 15, ty + 10, 10, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#f56565'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx + 18, ty + 5); ctx.lineTo(tx + 25, ty - 5); ctx.stroke(); ctx.fillStyle = 'black'; ctx.fillRect(tx + 8, ty + 18, 14, 4); }
        }
    });

    // Draw Chaser (The Overtime Enemy)
    if (gameStateRef.current.status === 'ESCAPE' && gameStateRef.current.escapeTimer <= 0) {
        const c = chaserRef.current;
        const cx = c.x + c.w/2;
        const cy = c.y + c.h/2;
        
        ctx.save();
        ctx.translate(cx, cy);
        const wobble = Math.sin(Date.now() / 50) * 0.1;
        ctx.rotate(wobble);

        // --- Fire Aura ---
        const time = Date.now() / 100;
        for(let i=0; i<12; i++) {
            const angle = (i / 12) * Math.PI * 2 + time; // Spin
            const dist = 60 + Math.sin(time * 3 + i) * 15; // Pulse
            ctx.fillStyle = i % 3 === 0 ? '#fef08a' : (i % 2 === 0 ? '#f97316' : '#ef4444'); // Yellow/Orange/Red
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 25, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- Skull ---
        ctx.fillStyle = '#f1f5f9'; // Bone white
        // Cranium
        ctx.beginPath();
        ctx.arc(0, -10, 55, 0, Math.PI * 2);
        ctx.fill();
        // Jaw
        ctx.fillRect(-35, 20, 70, 40);
        
        // --- Crown ---
        ctx.fillStyle = '#fbbf24'; // Gold
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-45, -45);
        ctx.lineTo(-50, -90); // Left point
        ctx.lineTo(-25, -60);
        ctx.lineTo(0, -100);  // Center point
        ctx.lineTo(25, -60);
        ctx.lineTo(50, -90);  // Right point
        ctx.lineTo(45, -45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Jewels
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, -75, 6, 0, Math.PI*2); ctx.fill(); // Center Ruby
        ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(-35, -70, 4, 0, Math.PI*2); ctx.fill(); // Left Sapphire
        ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(35, -70, 4, 0, Math.PI*2); ctx.fill(); // Right Sapphire

        // --- Face ---
        ctx.fillStyle = 'black';
        
        // Eye Sockets (Menacing Slant)
        ctx.save();
        ctx.translate(-25, -10);
        ctx.rotate(0.2);
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(25, -10);
        ctx.rotate(-0.2);
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // Glowing Red Eyes
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0000';
        ctx.fillStyle = '#ff0000';
        const eyeTime = Date.now() / 150;
        // Left
        ctx.beginPath(); ctx.arc(-25 + Math.cos(eyeTime)*2, -10 + Math.sin(eyeTime)*2, 5, 0, Math.PI*2); ctx.fill();
        // Right
        ctx.beginPath(); ctx.arc(25 + Math.sin(eyeTime)*2, -10 + Math.cos(eyeTime)*2, 5, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;

        // Nose
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(-8, 30);
        ctx.lineTo(8, 30);
        ctx.fill();

        // Evil Grin
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(-35, 40);
        ctx.quadraticCurveTo(0, 65, 35, 40); 
        ctx.lineTo(35, 55);
        ctx.quadraticCurveTo(0, 80, -35, 55);
        ctx.closePath();
        ctx.fill();

        // Teeth Details
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 45); ctx.lineTo(0, 75);
        ctx.moveTo(-15, 42); ctx.lineTo(-12, 65);
        ctx.moveTo(15, 42); ctx.lineTo(12, 65);
        ctx.stroke();

        ctx.restore();
    }

    // Draw Exit Prompt
    if (showExitPromptRef.current) {
        const time = Date.now() / 100; const bounce = Math.sin(time * 0.5) * 5;
        ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 4;
        const ax = p.x + p.w/2; const ay = p.y - 30 + bounce;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 15, ay + 15); ctx.lineTo(ax - 5, ay + 15); ctx.lineTo(ax - 5, ay + 35); ctx.lineTo(ax + 5, ay + 35); ctx.lineTo(ax + 5, ay + 15); ctx.lineTo(ax + 15, ay + 15); ctx.closePath();
        ctx.stroke(); ctx.fill();
        ctx.fillStyle = 'black'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.strokeText("UP", ax, ay + 25); ctx.fillText("UP", ax, ay + 25); ctx.textAlign = 'left'; 
    }

    ctx.restore();
  };

  const tick = useCallback(() => {
    update();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx);
    }
    requestRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    requestRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [tick]);

  const isEscape = uiState.status === 'ESCAPE';
  const isOvertime = uiState.escapeTimer <= 0;
  const currentLiveRank = getLiveRank(uiState);

  return (
    <div className="relative w-full h-screen bg-black">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* HUD */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 font-comic text-white select-none">
        <div className="flex items-center gap-4">
            <div className="text-4xl drop-shadow-[0_4px_0_rgba(0,0,0,0.8)] flex items-center gap-2">
                <span className="text-yellow-400">SCORE:</span> {Math.floor(uiState.score)}
            </div>
            {/* RANK DISPLAY */}
            <div className={`text-5xl font-black drop-shadow-[2px_2px_0_rgba(0,0,0,1)] ${
                currentLiveRank === 'P' ? 'text-purple-500 animate-bounce' :
                currentLiveRank === 'S' ? 'text-yellow-400' :
                currentLiveRank === 'A' ? 'text-red-500' :
                'text-gray-400'
            }`}>
                {currentLiveRank}
            </div>
        </div>
        
        {/* P-Rank Check List HUD */}
        <div className="flex gap-2 text-sm text-gray-400 items-center">
            {uiState.gerryCollected && <div className="text-orange-500 font-bold">GERRY</div>}
            <div className={`flex gap-1 ${uiState.secretsFound === 3 ? 'text-pink-500 font-bold' : ''}`}>
                SECRETS: {uiState.secretsFound}/3
            </div>
            {uiState.treasureCollected && <div className="text-yellow-500 font-bold">TREASURE</div>}
        </div>

        {uiState.lap3 && (
             <div className="text-4xl text-red-600 font-bold animate-pulse font-comic drop-shadow-[0_2px_0_#fff]">LAP 3 ACTIVE!!!</div>
        )}
        {!uiState.lap3 && uiState.lap2 && (
             <div className="text-3xl text-purple-400 font-bold animate-pulse">LAP 2 ACTIVE!</div>
        )}
        
        {uiState.combo > 1 && (
            <div className="flex flex-col animate-bounce">
                <div className="text-5xl font-black text-white stroke-black drop-shadow-[0_4px_0_rgba(0,0,0,1)]">
                    {uiState.combo}x COMBO!
                </div>
                <div className="w-32 h-4 bg-gray-800 border-2 border-white rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-75 ${uiState.comboDropped ? 'bg-yellow-400' : 'bg-purple-600'}`} 
                        style={{width: `${uiState.comboTimer}%`}} 
                    />
                </div>
                {!uiState.comboDropped && (
                    <div className="text-xs text-purple-300 font-mono tracking-widest">P-RANK READY</div>
                )}
            </div>
        )}
      </div>

      {/* Speedometer */}
      <div className="absolute bottom-4 left-4 text-white font-comic">
        <div className="text-2xl">SPEED</div>
        <div className="flex gap-1">
            <div className={`w-8 h-4 border ${Math.abs(playerRef.current.vx!) > WALK_SPEED ? 'bg-yellow-400' : 'bg-transparent'}`} />
            <div className={`w-8 h-4 border ${Math.abs(playerRef.current.vx!) > MACH_1_SPEED ? 'bg-orange-500' : 'bg-transparent'}`} />
            <div className={`w-8 h-4 border ${Math.abs(playerRef.current.vx!) > MACH_2_SPEED ? 'bg-red-600' : 'bg-transparent'}`} />
        </div>
      </div>

      {/* Escape Timer */}
      {isEscape && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center animate-pulse">
            <div className="text-6xl font-black text-red-600 font-comic drop-shadow-[0_5px_0_#fff]">
                {isOvertime ? "OVERTIME!" : "IT'S LUNCH TIME!"}
            </div>
            <div className="text-4xl text-white font-mono">
                {isOvertime ? <Skull className="w-12 h-12 inline-block animate-spin" /> : uiState.escapeTimer.toFixed(2)}
            </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 text-white/50 text-sm font-sans text-right">
        <p>ARROWS to Move</p>
        <p>SHIFT to Sprint (Hold for MACH)</p>
        <p>Z to Jump (Air/Rail compatible)</p>
        <p>X to Grab/Dash</p>
        <p>C to Taunt (Hold to Breakdance!)</p>
        <p className="text-yellow-400">DOWN to Crouch (Jump for Crouch Jump)</p>
        <p className="text-yellow-400">Sprint + DOWN to SLIDE</p>
        <p className="text-yellow-400">Release UP at MAX SPEED to SUPERJUMP</p>
        <p className="text-yellow-400">UP + X to UPPERCUT (Air compatible)</p>
        <p className="text-yellow-400">DOWN in air to DIVE</p>
        <p className="text-yellow-400">Taunt right before hit to PARRY!</p>
      </div>
    </div>
  );
};

export default GameCanvas;