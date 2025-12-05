import { Entity, Rect, Vector, GameState } from '../types';

export const checkCollision = (r1: Rect, r2: Rect): boolean => {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
};

export const resolveCollision = (
  entity: Entity, 
  obstacle: Entity
): { collided: boolean; side: 'top' | 'bottom' | 'left' | 'right' | 'none' } => {
  // Simple AABB resolution
  const dx = (entity.x + entity.w / 2) - (obstacle.x + obstacle.w / 2);
  const dy = (entity.y + entity.h / 2) - (obstacle.y + obstacle.h / 2);
  const width = (entity.w + obstacle.w) / 2;
  const height = (entity.h + obstacle.h) / 2;
  const crossWidth = width * dy;
  const crossHeight = height * dx;

  let side: 'top' | 'bottom' | 'left' | 'right' | 'none' = 'none';

  if (Math.abs(dx) <= width && Math.abs(dy) <= height) {
    if (crossWidth > crossHeight) {
      side = crossWidth > -crossHeight ? 'bottom' : 'left';
    } else {
      side = crossWidth > -crossHeight ? 'right' : 'top';
    }
  }

  return { collided: side !== 'none', side };
};

export const getRank = (state: GameState): string => {
  const { score, escapeTimer, lap2, secretsFound, treasureCollected, comboDropped } = state;
  const totalScore = score + (escapeTimer * 10);
  
  // P-RANK CRITERIA:
  // 1. Lap 2 Completed
  // 2. All 3 Secrets found
  // 3. Tower Secret Treasure collected
  // 4. Combo NEVER dropped (purple bar maintained)
  // 5. S-Rank score threshold met
  const isPRank = 
    lap2 && 
    secretsFound >= 3 && 
    treasureCollected && 
    !comboDropped && 
    totalScore > 10000;

  if (isPRank) return 'P';
  
  if (totalScore > 10000) return 'S';
  if (totalScore > 7000) return 'A';
  if (totalScore > 4000) return 'B';
  if (totalScore > 1000) return 'C';
  return 'D';
};