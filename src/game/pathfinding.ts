export interface NavPoint {
  x: number;
  y: number;
}

export interface ObstacleBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PathOptions {
  isHarvester?: boolean;
  isPlayer?: boolean;
}

// Binary Min-Heap Priority Queue for fast A* operations
class FastMinHeap {
  private indices: Int32Array;
  private priorities: Float32Array;
  public size: number = 0;

  constructor(maxSize: number) {
    this.indices = new Int32Array(maxSize);
    this.priorities = new Float32Array(maxSize);
  }

  public clear() {
    this.size = 0;
  }

  public push(index: number, priority: number) {
    let i = this.size++;
    this.indices[i] = index;
    this.priorities[i] = priority;

    // Percolate up
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[i] < this.priorities[parent]) {
        // Swap
        const tmpIdx = this.indices[i];
        this.indices[i] = this.indices[parent];
        this.indices[parent] = tmpIdx;

        const tmpP = this.priorities[i];
        this.priorities[i] = this.priorities[parent];
        this.priorities[parent] = tmpP;

        i = parent;
      } else {
        break;
      }
    }
  }

  public pop(): number {
    if (this.size === 0) return -1;
    const result = this.indices[0];
    this.size--;

    if (this.size > 0) {
      this.indices[0] = this.indices[this.size];
      this.priorities[0] = this.priorities[this.size];

      // Percolate down
      let i = 0;
      while (true) {
        let smallest = i;
        const left = (i << 1) + 1;
        const right = left + 1;

        if (left < this.size && this.priorities[left] < this.priorities[smallest]) {
          smallest = left;
        }
        if (right < this.size && this.priorities[right] < this.priorities[smallest]) {
          smallest = right;
        }

        if (smallest !== i) {
          const tmpIdx = this.indices[i];
          this.indices[i] = this.indices[smallest];
          this.indices[smallest] = tmpIdx;

          const tmpP = this.priorities[i];
          this.priorities[i] = this.priorities[smallest];
          this.priorities[smallest] = tmpP;

          i = smallest;
        } else {
          break;
        }
      }
    }

    return result;
  }

  public isEmpty(): boolean {
    return this.size === 0;
  }
}

export class Pathfinder {
  public readonly cellSize: number;
  public readonly mapWidth: number;
  public readonly mapHeight: number;
  public readonly gridWidth: number;
  public readonly gridHeight: number;
  private readonly totalCells: number;

  // Grid states
  public walkable: Uint8Array; // 1 = free, 0 = blocked
  public walkableHarvesterPlayer: Uint8Array;
  public walkableHarvesterAi: Uint8Array;

  // Pre-allocated buffers for A* to avoid garbage collection
  private heap: FastMinHeap;
  private gScore: Float32Array;
  private cameFrom: Int32Array;
  private visited: Uint32Array;
  private currentSearchToken: number = 0;

  // 8-directional neighbor offsets (orthogonal first, then diagonals)
  private readonly dx = [0, 1, 0, -1, 1, 1, -1, -1];
  private readonly dy = [-1, 0, 1, 0, -1, 1, 1, -1];
  private readonly costs = [1.0, 1.0, 1.0, 1.0, 1.4142, 1.4142, 1.4142, 1.4142];

  constructor(mapWidth: number = 2400, mapHeight: number = 2400, cellSize: number = 40) {
    this.cellSize = cellSize;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.gridWidth = Math.ceil(mapWidth / cellSize);
    this.gridHeight = Math.ceil(mapHeight / cellSize);
    this.totalCells = this.gridWidth * this.gridHeight;

    this.walkable = new Uint8Array(this.totalCells);
    this.walkable.fill(1);
    this.walkableHarvesterPlayer = new Uint8Array(this.totalCells);
    this.walkableHarvesterPlayer.fill(1);
    this.walkableHarvesterAi = new Uint8Array(this.totalCells);
    this.walkableHarvesterAi.fill(1);

    this.heap = new FastMinHeap(this.totalCells);
    this.gScore = new Float32Array(this.totalCells);
    this.cameFrom = new Int32Array(this.totalCells);
    this.visited = new Uint32Array(this.totalCells);
  }

  /**
   * Rebuilds the walkable navigation grid from terrain obstacles and structures
   */
  public updateGrid(
    terrainObstacles: ObstacleBox[],
    structures: Array<ObstacleBox & { hp: number; isPlayer?: boolean; type?: string }>
  ) {
    this.walkable.fill(1);
    this.walkableHarvesterPlayer.fill(1);
    this.walkableHarvesterAi.fill(1);

    // 1. Terrain obstacles with safety margin (impassable to everyone)
    for (const obs of terrainObstacles) {
      const minX = obs.x - obs.width / 2;
      const minY = obs.y - obs.height / 2;
      this.markBoxBlocked(minX, minY, obs.width, obs.height, 4);
      this.markBoxBlockedInGrid(this.walkableHarvesterPlayer, minX, minY, obs.width, obs.height, 4);
      this.markBoxBlockedInGrid(this.walkableHarvesterAi, minX, minY, obs.width, obs.height, 4);
    }

    // 2. Active structures
    for (const s of structures) {
      if (s.hp > 0) {
        const isRefinery = (s as any).type === 'refinery';
        const minX = s.x - s.width / 2;
        const minY = s.y - s.height / 2;
        // Mark only the back processing block of the refinery, leaving front dock ramp open
        const blockHeight = isRefinery ? s.height * 0.52 : s.height;
        const pad = isRefinery ? 2 : 4;

        // Default navigation grid: all structures block standard combat units
        this.markBoxBlocked(minX, minY, s.width, blockHeight, pad);

        // Harvester pathfinding optimization:
        // Harvesters treat allied structures as passable waypoints to navigate cleanly into refineries and base corridors
        if (!s.isPlayer) {
          this.markBoxBlockedInGrid(this.walkableHarvesterPlayer, minX, minY, s.width, blockHeight, pad);
        }

        if (s.isPlayer) {
          this.markBoxBlockedInGrid(this.walkableHarvesterAi, minX, minY, s.width, blockHeight, pad);
        }
      }
    }
  }

  public markBoxBlockedInGrid(grid: Uint8Array, minX: number, minY: number, width: number, height: number, padding: number = 0) {
    const startGX = Math.max(0, Math.floor((minX - padding) / this.cellSize));
    const endGX = Math.min(this.gridWidth - 1, Math.floor((minX + width + padding) / this.cellSize));
    const startGY = Math.max(0, Math.floor((minY - padding) / this.cellSize));
    const endGY = Math.min(this.gridHeight - 1, Math.floor((minY + height + padding) / this.cellSize));

    for (let gy = startGY; gy <= endGY; gy++) {
      const rowOffset = gy * this.gridWidth;
      for (let gx = startGX; gx <= endGX; gx++) {
        grid[rowOffset + gx] = 0;
      }
    }
  }

  public markBoxBlocked(minX: number, minY: number, width: number, height: number, padding: number = 0) {
    const startGX = Math.max(0, Math.floor((minX - padding) / this.cellSize));
    const endGX = Math.min(this.gridWidth - 1, Math.floor((minX + width + padding) / this.cellSize));
    const startGY = Math.max(0, Math.floor((minY - padding) / this.cellSize));
    const endGY = Math.min(this.gridHeight - 1, Math.floor((minY + height + padding) / this.cellSize));

    for (let gy = startGY; gy <= endGY; gy++) {
      const rowOffset = gy * this.gridWidth;
      for (let gx = startGX; gx <= endGX; gx++) {
        this.walkable[rowOffset + gx] = 0;
      }
    }
  }

  public markBoxWalkable(minX: number, minY: number, width: number, height: number, padding: number = 0) {
    const startGX = Math.max(0, Math.floor((minX - padding) / this.cellSize));
    const endGX = Math.min(this.gridWidth - 1, Math.floor((minX + width + padding) / this.cellSize));
    const startGY = Math.max(0, Math.floor((minY - padding) / this.cellSize));
    const endGY = Math.min(this.gridHeight - 1, Math.floor((minY + height + padding) / this.cellSize));

    for (let gy = startGY; gy <= endGY; gy++) {
      const rowOffset = gy * this.gridWidth;
      for (let gx = startGX; gx <= endGX; gx++) {
        this.walkable[rowOffset + gx] = 1;
        this.walkableHarvesterPlayer[rowOffset + gx] = 1;
        this.walkableHarvesterAi[rowOffset + gx] = 1;
      }
    }
  }

  public updateStructure(struct: ObstacleBox & { hp: number; isPlayer?: boolean; type?: string }, blocked: boolean) {
    const isRefinery = (struct as any).type === 'refinery';
    const minX = struct.x - struct.width / 2;
    const minY = struct.y - struct.height / 2;
    const blockHeight = isRefinery ? struct.height * 0.52 : struct.height;
    const pad = isRefinery ? 2 : 4;

    if (blocked && struct.hp > 0) {
      this.markBoxBlocked(minX, minY, struct.width, blockHeight, pad);
      if (!struct.isPlayer) {
        this.markBoxBlockedInGrid(this.walkableHarvesterPlayer, minX, minY, struct.width, blockHeight, pad);
      }
      if (struct.isPlayer) {
        this.markBoxBlockedInGrid(this.walkableHarvesterAi, minX, minY, struct.width, blockHeight, pad);
      }
    } else {
      this.markBoxWalkable(minX, minY, struct.width, blockHeight, pad);
    }
  }

  public isGridWalkable(gx: number, gy: number, options?: PathOptions): boolean {
    if (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight) return false;
    const grid = options?.isHarvester
      ? (options.isPlayer ? this.walkableHarvesterPlayer : this.walkableHarvesterAi)
      : this.walkable;
    return grid[gy * this.gridWidth + gx] === 1;
  }

  public isWorldWalkable(wx: number, wy: number, options?: PathOptions): boolean {
    const gx = Math.floor(wx / this.cellSize);
    const gy = Math.floor(wy / this.cellSize);
    return this.isGridWalkable(gx, gy, options);
  }

  /**
   * Fast line-of-sight raycast check between two world positions
   */
  public hasLineOfSight(x1: number, y1: number, x2: number, y2: number, options?: PathOptions): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist <= 4) return true;

    // Sample along the segment at increments of half a cell size
    const stepSize = this.cellSize * 0.45;
    const steps = Math.ceil(dist / stepSize);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      if (!this.isWorldWalkable(px, py, options)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Finds the nearest walkable cell to the given grid coordinate
   */
  public findNearestWalkableCell(startGX: number, startGY: number, maxRadius: number = 6, options?: PathOptions): { gx: number; gy: number } | null {
    if (this.isGridWalkable(startGX, startGY, options)) {
      return { gx: startGX, gy: startGY };
    }

    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const testGX = startGX + dx;
          const testGY = startGY + dy;
          if (this.isGridWalkable(testGX, testGY, options)) {
            return { gx: testGX, gy: testGY };
          }
        }
      }
    }
    return null;
  }

  /**
   * High-Performance A* algorithm with 8-directional movement, corner-cutting checks,
   * and Line-of-Sight smoothing (String Pulling).
   */
  public findPath(startX: number, startY: number, goalX: number, goalY: number, options?: PathOptions): NavPoint[] {
    // 1. Line-of-Sight Shortcut: If direct route is clear, return straight line immediately!
    if (this.hasLineOfSight(startX, startY, goalX, goalY, options)) {
      return [{ x: goalX, y: goalY }];
    }

    const grid = options?.isHarvester
      ? (options.isPlayer ? this.walkableHarvesterPlayer : this.walkableHarvesterAi)
      : this.walkable;

    // Convert to grid coordinates
    let startGX = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(startX / this.cellSize)));
    let startGY = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(startY / this.cellSize)));
    let goalGX = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(goalX / this.cellSize)));
    let goalGY = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(goalY / this.cellSize)));

    // Ensure start cell is walkable (if unit was pushed slightly into obstacle)
    if (!this.isGridWalkable(startGX, startGY, options)) {
      const nearestStart = this.findNearestWalkableCell(startGX, startGY, 4, options);
      if (nearestStart) {
        startGX = nearestStart.gx;
        startGY = nearestStart.gy;
      }
    }

    // Ensure goal cell is walkable (if player clicked an obstacle or structure)
    if (!this.isGridWalkable(goalGX, goalGY, options)) {
      const nearestGoal = this.findNearestWalkableCell(goalGX, goalGY, 7, options);
      if (nearestGoal) {
        goalGX = nearestGoal.gx;
        goalGY = nearestGoal.gy;
      } else {
        // Unreachable
        return [{ x: goalX, y: goalY }];
      }
    }

    const startIndex = startGY * this.gridWidth + startGX;
    const goalIndex = goalGY * this.gridWidth + goalGX;

    if (startIndex === goalIndex) {
      return [{ x: goalX, y: goalY }];
    }

    // Reset search buffers via search token increment
    this.currentSearchToken++;
    const token = this.currentSearchToken;
    this.heap.clear();

    this.gScore[startIndex] = 0;
    this.cameFrom[startIndex] = -1;
    this.visited[startIndex] = token;

    // Octile heuristic
    const hStart = this.octileDistance(startGX, startGY, goalGX, goalGY);
    this.heap.push(startIndex, hStart);

    let closestNodeIndex = startIndex;
    let closestDistToGoal = hStart;
    let found = false;
    let iterations = 0;
    const maxIterations = 800; // Search budget to maintain 60 FPS

    while (!this.heap.isEmpty() && iterations < maxIterations) {
      iterations++;
      const currentIdx = this.heap.pop();
      if (currentIdx === goalIndex) {
        found = true;
        break;
      }

      const curGX = currentIdx % this.gridWidth;
      const curGY = (currentIdx / this.gridWidth) | 0;
      const curG = this.gScore[currentIdx];

      // Track closest node in case of partial path
      const curH = this.octileDistance(curGX, curGY, goalGX, goalGY);
      if (curH < closestDistToGoal) {
        closestDistToGoal = curH;
        closestNodeIndex = currentIdx;
      }

      // Explore 8 neighbors
      for (let dir = 0; dir < 8; dir++) {
        const nextGX = curGX + this.dx[dir];
        const nextGY = curGY + this.dy[dir];

        if (nextGX < 0 || nextGX >= this.gridWidth || nextGY < 0 || nextGY >= this.gridHeight) {
          continue;
        }

        const nextIndex = nextGY * this.gridWidth + nextGX;
        if (grid[nextIndex] === 0) {
          continue;
        }

        // Corner-cutting check for diagonals
        if (dir >= 4) {
          const ortho1X = curGX + this.dx[dir];
          const ortho1Y = curGY;
          const ortho2X = curGX;
          const ortho2Y = curGY + this.dy[dir];
          if (!this.isGridWalkable(ortho1X, ortho1Y, options) || !this.isGridWalkable(ortho2X, ortho2Y, options)) {
            continue;
          }
        }

        const tentativeG = curG + this.costs[dir];

        if (this.visited[nextIndex] !== token || tentativeG < this.gScore[nextIndex]) {
          this.visited[nextIndex] = token;
          this.gScore[nextIndex] = tentativeG;
          this.cameFrom[nextIndex] = currentIdx;

          const f = tentativeG + this.octileDistance(nextGX, nextGY, goalGX, goalGY);
          this.heap.push(nextIndex, f);
        }
      }
    }

    // Reconstruct raw grid path
    const endTarget = found ? goalIndex : closestNodeIndex;
    const rawPath: NavPoint[] = [];

    let curr = endTarget;
    while (curr !== -1) {
      const gx = curr % this.gridWidth;
      const gy = (curr / this.gridWidth) | 0;
      rawPath.push({
        x: gx * this.cellSize + this.cellSize * 0.5,
        y: gy * this.cellSize + this.cellSize * 0.5,
      });
      curr = this.cameFrom[curr];
    }
    rawPath.reverse();

    if (rawPath.length === 0) {
      return [{ x: goalX, y: goalY }];
    }

    // Replace start and end with exact coordinates
    rawPath[0] = { x: startX, y: startY };
    if (found) {
      rawPath[rawPath.length - 1] = { x: goalX, y: goalY };
    }

    // 2. String Pulling / Waypoint Pruning Smoothing
    return this.smoothPath(rawPath, options);
  }

  /**
   * Smooths path by connecting distant waypoints if line of sight is clear
   */
  private smoothPath(path: NavPoint[], options?: PathOptions): NavPoint[] {
    if (path.length <= 2) {
      return path.slice(1);
    }

    const smoothed: NavPoint[] = [];
    let currentIdx = 0;

    while (currentIdx < path.length - 1) {
      let furthestIdx = path.length - 1;

      // Find the furthest reachable waypoint in direct line of sight
      for (let testIdx = path.length - 1; testIdx > currentIdx; testIdx--) {
        if (this.hasLineOfSight(path[currentIdx].x, path[currentIdx].y, path[testIdx].x, path[testIdx].y, options)) {
          furthestIdx = testIdx;
          break;
        }
      }

      smoothed.push(path[furthestIdx]);
      currentIdx = furthestIdx;
    }

    return smoothed;
  }

  private octileDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  }
}
