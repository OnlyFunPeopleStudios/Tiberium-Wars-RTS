import { 
  Faction, StructureType, UnitType, StructureInstance, UnitInstance, 
  TiberiumCrystal, Projectile, ParticleEffect, BuildQueueItem, 
  AIDifficulty, MapType, StructureCategory, ScorchDecal,
  MoveMarker, TreadMark, PathVisualization, WeatherType, WeatherParticle, LightningBolt,
  WeatherControllerState, FloatingCombatText
} from './types';
import { STRUCTURE_DEFS, UNIT_DEFS, MAP_PRESETS, MapPreset, getRequiredEngineersToMove } from './gameData';
import { AICommander } from './aiCommander';
import { sound } from '../audio/soundEngine';
import { Pathfinder } from './pathfinding';
import { storage, SavedGameState } from './storage';

export class GameEngine {
  public playerFaction: Faction = 'gdi';
  public aiFaction: Faction = 'nod';
  public difficulty: AIDifficulty = 'medium';
  public mapType: MapType = 'wasteland';
  public currentMap: MapPreset;
  public pathfinder: Pathfinder;

  public gameState: 'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'DEFEAT' = 'MENU';
  public gameTime: number = 0;
  public gameSpeed: number = 1.0;

  // Economy & Power
  public playerCredits: number = 5000;
  public aiCredits: number = 5000;
  public isLowPower: boolean = false;

  // Weather Controller & Atmospheric Simulation
  public weather: WeatherControllerState;
  public weatherParticles: WeatherParticle[] = [];
  public weatherLightningBolts: LightningBolt[] = [];
  private lightningTimer: number = 4.0;

  // Superweapon
  public playerSuperweaponReady: boolean = false;
  public playerSuperweaponTimer: number = 0; // seconds remaining
  public playerSuperweaponCooldown: number = 120; // 2 minutes

  // Local Match Statistics
  public matchKills: number = 0;
  public matchTiberiumHarvested: number = 0;
  public matchStructuresBuilt: number = 0;
  public matchSuperweaponFired: boolean = false;

  // World Entities
  public structures: StructureInstance[] = [];
  public units: UnitInstance[] = [];
  public tiberiumCrystals: TiberiumCrystal[] = [];
  public projectiles: Projectile[] = [];
  public particles: ParticleEffect[] = [];
  public scorches: ScorchDecal[] = [];
  public moveMarkers: MoveMarker[] = [];
  public treadMarks: TreadMark[] = [];
  public pathVisualizations: PathVisualization[] = [];
  public floatingTexts: FloatingCombatText[] = [];

  // Build Queues (Sequential multi-item production lines)
  public structureQueue: BuildQueueItem[] = [];
  public infantryQueue: BuildQueueItem[] = [];
  public vehicleQueue: BuildQueueItem[] = [];

  // Backward compatibility getter for single-unit queue references
  public get unitQueue(): BuildQueueItem | null {
    return this.vehicleQueue[0] || this.infantryQueue[0] || null;
  }

  // Placement & Selection mode
  public placementStructure: StructureType | null = null;
  public selectedStructureId: string | null = null;
  public relocatingStructure: StructureInstance | null = null;
  public superweaponTargeting: boolean = false;

  // Fog of war
  public fogGridWidth: number = 60;
  public fogGridHeight: number = 60;
  public fogCellSize: number = 40; // 2400 / 60
  // 0: Shroud (black), 1: Explored (fogged), 2: Visible (clear)
  public fogGrid: Uint8Array;

  // Control groups (1-9)
  public controlGroups: Record<number, string[]> = {};

  // AI
  private aiCommander: AICommander | null = null;

  // Camera & Viewport
  public cameraX: number = 0;
  public cameraY: number = 0;
  public viewportWidth: number = 1200;
  public viewportHeight: number = 800;
  public screenShake: number = 0;

  // Event listener for UI updates
  private onStateChangeCallback: (() => void) | null = null;
  private lastAlertTime: number = 0;

  constructor() {
    this.currentMap = MAP_PRESETS.wasteland;
    this.pathfinder = new Pathfinder(this.currentMap.width, this.currentMap.height, 40);
    this.fogGrid = new Uint8Array(this.fogGridWidth * this.fogGridHeight);
    this.weather = {
      current: 'sunny',
      next: 'rain',
      timer: 0,
      duration: 45,
      transitionDuration: 6,
      transitionProgress: 0,
      isTransitioning: false,
      visibilityMultiplier: 1.0,
      lightningFlash: 0,
      fogDensity: 0,
      stormIntensity: 0,
      rainIntensity: 0,
    };
    this.initWeatherParticles();
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChangeCallback = cb;
  }

  public notifyUI() {
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  public startNewGame(playerFaction: Faction, difficulty: AIDifficulty, mapType: MapType) {
    this.playerFaction = playerFaction;
    this.aiFaction = playerFaction === 'gdi' ? 'nod' : 'gdi';
    this.difficulty = difficulty;
    this.mapType = mapType;
    this.currentMap = MAP_PRESETS[mapType] || MAP_PRESETS.wasteland;
    this.pathfinder = new Pathfinder(this.currentMap.width, this.currentMap.height, 40);

    this.gameState = 'PLAYING';
    this.gameTime = 0;
    this.playerCredits = 5000;
    this.aiCredits = difficulty === 'hard' ? 7000 : difficulty === 'medium' ? 5000 : 3500;
    this.structures = [];
    this.units = [];
    this.projectiles = [];
    this.particles = [];
    this.scorches = [];
    this.moveMarkers = [];
    this.treadMarks = [];
    this.pathVisualizations = [];
    this.floatingTexts = [];
    this.structureQueue = [];
    this.infantryQueue = [];
    this.vehicleQueue = [];
    this.placementStructure = null;
    this.superweaponTargeting = false;
    // Stale refs from the previous match would brick clicks (relocation mode eats
    // every left click and never self-heals once the structure no longer exists).
    this.relocatingStructure = null;
    this.selectedStructureId = null;
    this.playerSuperweaponReady = false;
    this.playerSuperweaponTimer = this.playerSuperweaponCooldown;
    this.controlGroups = {};

    // Reset Weather
    this.weather = {
      current: 'sunny',
      next: 'rain',
      timer: 0,
      duration: 45,
      transitionDuration: 6,
      transitionProgress: 0,
      isTransitioning: false,
      visibilityMultiplier: 1.0,
      lightningFlash: 0,
      fogDensity: 0,
      stormIntensity: 0,
      rainIntensity: 0,
    };
    this.initWeatherParticles();

    // Reset Local Match Tracking Stats
    this.matchKills = 0;
    this.matchTiberiumHarvested = 0;
    this.matchStructuresBuilt = 0;
    this.matchSuperweaponFired = false;

    // Reset Fog
    this.fogGrid.fill(0);

    // Populate Tiberium
    this.initTiberium();

    // Spawn Player Conyard & starting Units
    this.spawnStartingBases();

    // Initialize navigation grid with obstacles and initial base buildings
    this.pathfinder.updateGrid(this.currentMap.terrainObstacles, this.structures);

    // Init AI
    this.aiCommander = new AICommander(this, this.difficulty, this.currentMap.enemyStart);

    // Center camera on player Conyard
    this.cameraX = Math.max(0, this.currentMap.playerStart.x - window.innerWidth / 2);
    this.cameraY = Math.max(0, this.currentMap.playerStart.y - window.innerHeight / 2);

    sound.speakEVA('Estableciendo conexión táctica. ¡Bienvenido de vuelta, Comandante!', true);
    this.notifyUI();
  }

  private initTiberium() {
    this.tiberiumCrystals = [];
    this.currentMap.tiberiumPatches.forEach((patch, idx) => {
      // Create cluster of crystals
      const count = patch.type === 'blue' ? 14 : 18;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 85;
        this.tiberiumCrystals.push({
          id: `tib_${idx}_${i}`,
          x: patch.x + Math.cos(angle) * dist,
          y: patch.y + Math.sin(angle) * dist,
          amount: patch.amount / count,
          maxAmount: patch.amount / count,
          type: patch.type,
          clusterRadius: 90,
        });
      }
    });
  }

  private spawnStartingBases() {
    // Player Base
    const pStart = this.currentMap.playerStart;
    this.spawnStructure('conyard', this.playerFaction, true, pStart.x, pStart.y);
    this.spawnStructure('powerplant', this.playerFaction, true, pStart.x + 120, pStart.y);

    // Starting units
    this.spawnUnit('rifleman', this.playerFaction, true, pStart.x - 50, pStart.y + 70);
    this.spawnUnit('rifleman', this.playerFaction, true, pStart.x - 20, pStart.y + 70);
    this.spawnUnit('missile', this.playerFaction, true, pStart.x + 10, pStart.y + 70);
    this.spawnUnit('tank', this.playerFaction, true, pStart.x + 60, pStart.y + 90);

    // Enemy Base
    const eStart = this.currentMap.enemyStart;
    this.spawnStructure('conyard', this.aiFaction, false, eStart.x, eStart.y);
    this.spawnStructure('powerplant', this.aiFaction, false, eStart.x - 120, eStart.y);
    this.spawnUnit('rifleman', this.aiFaction, false, eStart.x + 40, eStart.y - 70);
    this.spawnUnit('rifleman', this.aiFaction, false, eStart.x + 10, eStart.y - 70);
    this.spawnUnit('missile', this.aiFaction, false, eStart.x - 20, eStart.y - 70);
    this.spawnUnit('tank', this.aiFaction, false, eStart.x - 60, eStart.y - 90);
  }

  public spawnStructure(type: StructureType, faction: Faction, isPlayer: boolean, x: number, y: number): StructureInstance {
    const def = STRUCTURE_DEFS[type];
    const struct: StructureInstance = {
      id: `struct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      faction,
      isPlayer,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      powerOut: def.powerOut,
      powerIn: def.powerIn,
      width: def.width,
      height: def.height,
      rallyPoint: { x: x + 80, y: y + 80 },
    };

    this.structures.push(struct);
    this.pathfinder.updateGrid(this.currentMap.terrainObstacles, this.structures);

    // If refinery is built, give 1 free Harvester!
    if (type === 'refinery') {
      this.spawnUnit('harvester', faction, isPlayer, x, y + 60);
    }

    if (isPlayer) {
      this.matchStructuresBuilt++;
      sound.playBuildPlaced();
      sound.speakEVA('Construcción completada');
    }

    return struct;
  }

  public spawnUnit(type: UnitType, faction: Faction, isPlayer: boolean, x: number, y: number): UnitInstance {
    const def = UNIT_DEFS[type];
    const unit: UnitInstance = {
      id: `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      faction,
      isPlayer,
      x,
      y,
      rotation: isPlayer ? Math.PI / 4 : -3 * Math.PI / 4,
      turretRotation: isPlayer ? Math.PI / 4 : -3 * Math.PI / 4,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      range: def.range,
      damage: def.damage,
      rateOfFire: def.rateOfFire,
      damageType: def.damageType,
      isAir: def.isAir,
      canTargetAir: def.canTargetAir,
      size: def.size,
      tiberiumCargo: 0,
      harvestState: 'idle',
      altitude: def.isAir ? 30 : 0,
      currentSpeed: 0,
      isMoving: false,
      recoil: 0,
      treadOffset: 0,
      walkPhase: Math.random() * Math.PI,
      bankAngle: 0,
      harvesterBladeAngle: 0,
    };

    this.units.push(unit);

    if (isPlayer) {
      sound.speakEVA('Unidad lista');
    }

    return unit;
  }

  public spawnAIUnit(type: UnitType) {
    const def = UNIT_DEFS[type];
    if (this.aiCredits < def.cost) return;

    // Find appropriate production building
    const isInfantry = def.category === 'infantry';
    const bType = isInfantry ? 'barracks' : 'warfactory';
    const factory = this.structures.find(s => !s.isPlayer && s.type === bType);
    if (!factory) return;

    this.aiCredits -= def.cost;
    const spawnX = factory.x + (Math.random() * 40 - 20);
    const spawnY = factory.y + 60;
    this.spawnUnit(type, this.aiFaction, false, spawnX, spawnY);
  }

  // --- POWER CALCULATIONS ---
  public getPlayerPower(): { produced: number; consumed: number; surplus: number } {
    let produced = 0;
    let consumed = 0;
    this.structures.forEach(s => {
      if (s.isPlayer) {
        produced += s.powerOut;
        consumed += s.powerIn;
      }
    });
    return { produced, consumed, surplus: produced - consumed };
  }

  public getAIPower(): { produced: number; consumed: number; surplus: number } {
    let produced = 0;
    let consumed = 0;
    this.structures.forEach(s => {
      if (!s.isPlayer) {
        produced += s.powerOut;
        consumed += s.powerIn;
      }
    });
    return { produced, consumed, surplus: produced - consumed };
  }

  // --- QUEUE MANAGEMENT (Sequential Multi-Item Production Lines) ---

  /** Returns all queued items for a specific sidebar category */
  public getQueueForCategory(category: StructureCategory): BuildQueueItem[] {
    if (category === 'structures' || category === 'defenses') {
      return this.structureQueue;
    } else if (category === 'infantry') {
      return this.infantryQueue;
    } else {
      return this.vehicleQueue;
    }
  }

  /** Returns the total count of a specific structure or unit type currently in production or waiting in queue */
  public getQueuedCount(itemType: StructureType | UnitType): number {
    let count = 0;
    for (const q of this.structureQueue) {
      if (q.itemType === itemType) count++;
    }
    for (const q of this.infantryQueue) {
      if (q.itemType === itemType) count++;
    }
    for (const q of this.vehicleQueue) {
      if (q.itemType === itemType) count++;
    }
    return count;
  }

  /** Enqueues an item into its respective sequential production line */
  public startBuild(itemType: StructureType | UnitType, category: StructureCategory): boolean {
    const isStructure = category === 'structures' || category === 'defenses';
    const isInfantry = category === 'infantry';

    const def = isStructure 
      ? STRUCTURE_DEFS[itemType as StructureType] 
      : UNIT_DEFS[itemType as UnitType];

    if (!def) return false;

    // Prerequisite structure validation
    if (def.prereq && !def.prereq.every(p => this.structures.some(s => s.isPlayer && s.type === p && s.hp > 0))) {
      sound.speakEVA('Estructura previa requerida');
      return false;
    }

    // Select queue
    const queue = isStructure 
      ? this.structureQueue 
      : isInfantry 
        ? this.infantryQueue 
        : this.vehicleQueue;

    // Max 5 items per building / unit type queue limit
    if (this.getQueuedCount(itemType) >= 5) {
      sound.speakEVA('Límite de cola alcanzado (5 máx)');
      return false;
    }

    // Max queue depth limit (20 items per production line)
    if (queue.length >= 20) {
      sound.speakEVA('Cola de producción llena');
      return false;
    }

    // Funds check
    if (this.playerCredits < def.cost) {
      sound.speakEVA('Fondos insuficientes');
      return false;
    }

    // Deduct cost and enqueue
    this.playerCredits -= def.cost;
    const queueItem: BuildQueueItem = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      itemType,
      category,
      progress: 0,
      buildTime: def.buildTime,
      cost: def.cost,
      ready: false,
    };
    queue.push(queueItem);

    // Audio announcement feedback
    if (queue.length === 1) {
      if (isStructure) {
        sound.speakEVA('Construyendo');
      } else if (isInfantry) {
        sound.speakEVA('Entrenando');
      } else {
        sound.speakEVA('Construyendo');
      }
    } else {
      sound.playClick();
    }

    this.notifyUI();
    return true;
  }

  /** Cancels the currently active item in a category queue */
  public cancelBuild(category: StructureCategory) {
    this.cancelBuildItem(category);
  }

  /**
   * Cancels one or all instances of a specific item from the queue, refunding full cost.
   * If cancelAll is false, cancels the latest waiting instance (preserving active progress when possible).
   */
  public cancelBuildItem(category: StructureCategory, itemType?: StructureType | UnitType, cancelAll: boolean = false): boolean {
    const isStructure = category === 'structures' || category === 'defenses';
    const isInfantry = category === 'infantry';
    const queue = isStructure 
      ? this.structureQueue 
      : isInfantry 
        ? this.infantryQueue 
        : this.vehicleQueue;

    if (queue.length === 0) return false;

    if (!itemType) {
      // Cancel active item at front of queue
      const canceled = queue.shift();
      if (canceled) {
        this.playerCredits += canceled.cost;
        if (isStructure && this.placementStructure === canceled.itemType) {
          this.placementStructure = null;
        }
        sound.speakEVA('Cancelado');
        this.notifyUI();
        return true;
      }
      return false;
    }

    if (cancelAll) {
      let refunded = 0;
      const remaining: BuildQueueItem[] = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (item.itemType === itemType) {
          refunded += item.cost;
          if (i === 0 && isStructure && this.placementStructure === item.itemType) {
            this.placementStructure = null;
          }
        } else {
          remaining.push(item);
        }
      }

      this.playerCredits += refunded;
      if (isStructure) {
        this.structureQueue = remaining;
      } else if (isInfantry) {
        this.infantryQueue = remaining;
      } else {
        this.vehicleQueue = remaining;
      }

      if (refunded > 0) {
        sound.speakEVA('Cancelado');
        this.notifyUI();
        return true;
      }
      return false;
    } else {
      // Cancel ONE instance: prefer canceling from the tail (waiting instances)
      let targetIndex = -1;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].itemType === itemType) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex !== -1) {
        const [removed] = queue.splice(targetIndex, 1);
        this.playerCredits += removed.cost;
        if (targetIndex === 0 && isStructure && this.placementStructure === removed.itemType) {
          this.placementStructure = null;
        }
        sound.playClick();
        this.notifyUI();
        return true;
      }
      return false;
    }
  }

  public selectStructureForPlacement(type: StructureType) {
    const readyItem = this.structureQueue.find(q => q.ready && q.itemType === type);
    if (readyItem) {
      this.placementStructure = type;
      sound.playClick();
      this.notifyUI();
    }
  }

  public placeStructure(worldX: number, worldY: number) {
    if (!this.placementStructure || this.structureQueue.length === 0) return;
    const current = this.structureQueue[0];
    if (!current || !current.ready || current.itemType !== this.placementStructure) return;

    const def = STRUCTURE_DEFS[this.placementStructure];
    if (this.canPlaceStructure(worldX, worldY, def.width, def.height, true)) {
      this.spawnStructure(this.placementStructure, this.playerFaction, true, worldX, worldY);
      // Remove placed structure from queue
      this.structureQueue.shift();
      this.placementStructure = null;
      sound.playBuildPlaced();

      // If more structures are queued, start next one
      if (this.structureQueue.length > 0) {
        sound.speakEVA('Construyendo');
      }

      this.notifyUI();
    } else {
      sound.speakEVA('Ubicación no válida');
    }
  }

  public canPlaceStructure(worldX: number, worldY: number, width: number, height: number, isPlayer: boolean): boolean {
    // 1. Must be within map bounds
    if (worldX - width / 2 < 40 || worldX + width / 2 > this.currentMap.width - 40 ||
        worldY - height / 2 < 40 || worldY + height / 2 > this.currentMap.height - 40) {
      return false;
    }

    // 2. Must not collide with terrain obstacles
    for (const obs of this.currentMap.terrainObstacles) {
      if (Math.abs(worldX - obs.x) < (width + obs.width) / 2 &&
          Math.abs(worldY - obs.y) < (height + obs.height) / 2) {
        return false;
      }
    }

    // 3. Must not collide with existing structures
    for (const s of this.structures) {
      if (Math.abs(worldX - s.x) < (width + s.width) / 2 + 10 &&
          Math.abs(worldY - s.y) < (height + s.height) / 2 + 10) {
        return false;
      }
    }

    // 4. Must be within build proximity of friendly base (unless Conyard itself)
    const friendlyStructures = this.structures.filter(s => s.isPlayer === isPlayer);
    if (friendlyStructures.length > 0) {
      const nearFriendly = friendlyStructures.some(s => {
        const dist = Math.hypot(worldX - s.x, worldY - s.y);
        return dist < 360; // 360px build radius around existing base
      });
      if (!nearFriendly) return false;
    }

    return true;
  }

  // --- SUPERWEAPON ---
  public fireSuperweapon(worldX: number, worldY: number) {
    if (!this.playerSuperweaponReady) return;
    this.playerSuperweaponReady = false;
    this.playerSuperweaponTimer = this.playerSuperweaponCooldown;
    this.superweaponTargeting = false;
    this.matchSuperweaponFired = true;

    sound.playSuperweaponCharge();

    if (this.playerFaction === 'gdi') {
      sound.speakEVA('¡Disparando Cañón de Iones Orbital!', true);
      // Spawn orbital Ion Strike
      this.projectiles.push({
        id: `ion_${Date.now()}`,
        type: 'ion',
        startX: worldX,
        startY: 0,
        x: worldX,
        y: worldY,
        targetX: worldX,
        targetY: worldY,
        speed: 900,
        damage: 3500,
        splashRadius: 180,
        isPlayer: true,
        color: '#38bdf8',
        createdAt: Date.now(),
        duration: 2500,
      });
    } else {
      sound.speakEVA('¡Alerta: Misil Nuclear Táctico lanzado!', true);
      // Spawn ICBM Nuke
      this.projectiles.push({
        id: `nuke_${Date.now()}`,
        type: 'nuke',
        startX: worldX - 400,
        startY: 0,
        x: worldX,
        y: worldY,
        targetX: worldX,
        targetY: worldY,
        speed: 600,
        damage: 4000,
        splashRadius: 220,
        isPlayer: true,
        color: '#f97316',
        createdAt: Date.now(),
        duration: 3000,
      });
    }

    this.screenShake = 18;
    this.notifyUI();
  }

  // --- MAIN SIMULATION LOOP ---
  public update(dt: number) {
    if (this.gameState !== 'PLAYING') return;

    const scaledDt = dt * this.gameSpeed;
    this.gameTime += scaledDt;

    // Low power check
    const power = this.getPlayerPower();
    this.isLowPower = power.produced < power.consumed;

    // Screen shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    // Update Spatial Audio Listener to Camera Center
    sound.setCameraListener(
      this.cameraX + this.viewportWidth * 0.5,
      this.cameraY + this.viewportHeight * 0.5,
      this.viewportWidth,
      this.viewportHeight
    );

    // Update Queues
    this.updateQueues(scaledDt);

    // Update Superweapon Timer
    const hasSuperweapon = this.structures.some(s => s.isPlayer && s.type === 'superweapon');
    if (hasSuperweapon) {
      if (this.playerSuperweaponTimer > 0) {
        // Ion Storm atmospheric ionization charges GDI Orbital Ion Cannon +25% faster
        const stormChargeBonus = (this.weather.stormIntensity > 0.2 && this.playerFaction === 'gdi')
          ? (1.0 + 0.25 * this.weather.stormIntensity)
          : 1.0;
        this.playerSuperweaponTimer -= scaledDt * stormChargeBonus;
        if (this.playerSuperweaponTimer <= 0) {
          this.playerSuperweaponTimer = 0;
          this.playerSuperweaponReady = true;
          sound.playAlert();
          sound.speakEVA(this.playerFaction === 'gdi' ? 'Cañón de Iones listo' : 'Misil Nuclear listo', true);
          this.notifyUI();
        }
      }
    } else {
      this.playerSuperweaponReady = false;
      this.playerSuperweaponTimer = this.playerSuperweaponCooldown;
    }

    // Update Units & Steering
    this.updateUnits(scaledDt);

    // Update Defenses & Structure Weapons
    this.updateStructures(scaledDt);

    // Update Projectiles & Combat
    this.updateProjectiles(scaledDt);

    // Update Particles
    this.updateParticles(scaledDt);

    // Update Floating Combat Texts (Damage & Healing numbers)
    this.updateFloatingTexts(scaledDt);

    // Update Weather Controller & Atmospheric Simulation
    this.updateWeather(scaledDt);

    // Update Fog of War
    this.updateFogOfWar();

    // Update Tiberium regrowth & regeneration
    this.updateTiberium(scaledDt);

    // Update AI Commander
    if (this.aiCommander) {
      this.aiCommander.update(scaledDt);
    }

    // Check Win/Loss conditions
    this.checkEndConditions();
  }

  private updateQueues(dt: number) {
    const speedMult = this.isLowPower ? 0.5 : 1.0;

    // 1. Structure Queue (Sequential production via Construction Yard)
    if (this.structureQueue.length > 0) {
      const current = this.structureQueue[0];
      if (!current.ready) {
        current.progress += (dt / current.buildTime) * speedMult;
        if (current.progress >= 1.0) {
          current.progress = 1.0;
          current.ready = true;
          sound.speakEVA('Construcción lista');
          this.placementStructure = current.itemType as StructureType;
          this.notifyUI();
        }
      }
    }

    // 2. Infantry Queue (Sequential training via Barracks)
    if (this.infantryQueue.length > 0) {
      const barracks = this.structures.find(s => s.isPlayer && s.type === 'barracks' && s.hp > 0);
      if (!barracks) {
        // If Barracks destroyed, refund all queued infantry
        let refund = 0;
        this.infantryQueue.forEach(q => refund += q.cost);
        this.playerCredits += refund;
        this.infantryQueue = [];
        sound.speakEVA('Producción cancelada');
        this.notifyUI();
      } else {
        const current = this.infantryQueue[0];
        current.progress += (dt / current.buildTime) * speedMult;
        if (current.progress >= 1.0) {
          const spawnX = barracks.rallyPoint ? barracks.rallyPoint.x : barracks.x + 40;
          const spawnY = barracks.rallyPoint ? barracks.rallyPoint.y : barracks.y + 50;
          this.spawnUnit(current.itemType as UnitType, this.playerFaction, true, spawnX, spawnY);
          sound.playUnitResponse(current.itemType as UnitType, 'ready');
          this.infantryQueue.shift();
          this.notifyUI();
        }
      }
    }

    // 3. Vehicle Queue (Sequential manufacturing via War Factory)
    if (this.vehicleQueue.length > 0) {
      const warfactory = this.structures.find(s => s.isPlayer && s.type === 'warfactory' && s.hp > 0);
      if (!warfactory) {
        // If War Factory destroyed, refund all queued vehicles
        let refund = 0;
        this.vehicleQueue.forEach(q => refund += q.cost);
        this.playerCredits += refund;
        this.vehicleQueue = [];
        sound.speakEVA('Producción cancelada');
        this.notifyUI();
      } else {
        const current = this.vehicleQueue[0];
        current.progress += (dt / current.buildTime) * speedMult;
        if (current.progress >= 1.0) {
          const spawnX = warfactory.rallyPoint ? warfactory.rallyPoint.x : warfactory.x + 55;
          const spawnY = warfactory.rallyPoint ? warfactory.rallyPoint.y : warfactory.y + 65;
          this.spawnUnit(current.itemType as UnitType, this.playerFaction, true, spawnX, spawnY);
          sound.playUnitResponse(current.itemType as UnitType, 'ready');
          this.vehicleQueue.shift();
          this.notifyUI();
        }
      }
    }
  }

  private updateUnits(dt: number) {
    // Spatial separation buffer to prevent unit crowding and rigid overlap
    for (let i = 0; i < this.units.length; i++) {
      const u1 = this.units[i];
      for (let j = i + 1; j < this.units.length; j++) {
        const u2 = this.units[j];
        if (u1.isAir !== u2.isAir) continue; // aircraft fly over ground units
        const dx = u2.x - u1.x;
        const dy = u2.y - u1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = (u1.size + u2.size) * 0.72;
        if (dist < minDist && dist > 0.001) {
          const overlap = (minDist - dist) * 0.5;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;

          // Smooth yielding: moving unit glides around stationary unit
          const weight1 = u1.isMoving && !u2.isMoving ? 0.7 : (!u1.isMoving && u2.isMoving ? 0.3 : 0.5);
          const weight2 = 1.0 - weight1;

          u1.x -= nx * weight1;
          u1.y -= ny * weight1;
          u2.x += nx * weight2;
          u2.y += ny * weight2;
        }
      }
    }

    // Keep ground units outside of blocked static cells
    for (const unit of this.units) {
      // Harvesters during docking/harvesting and Engineers repairing/relocating must move freely without being kicked out
      if (unit.type === 'harvester' && (unit.harvestState === 'unloading' || unit.harvestState === 'returning_to_refinery' || unit.harvestState === 'harvesting')) {
        continue;
      }
      if (unit.type === 'engineer' && (unit.assignedStructureId || unit.repairTargetId || unit.captureTargetId)) {
        continue;
      }

      if (!unit.isAir && !this.pathfinder.isWorldWalkable(unit.x, unit.y)) {
        const cell = this.pathfinder.findNearestWalkableCell(
          Math.floor(unit.x / this.pathfinder.cellSize),
          Math.floor(unit.y / this.pathfinder.cellSize),
          4
        );
        if (cell) {
          const targetWX = cell.gx * this.pathfinder.cellSize + this.pathfinder.cellSize * 0.5;
          const targetWY = cell.gy * this.pathfinder.cellSize + this.pathfinder.cellSize * 0.5;
          unit.x += (targetWX - unit.x) * 0.08;
          unit.y += (targetWY - unit.y) * 0.08;
        }
      }
    }

    // Process unit logic
    for (const unit of this.units) {
      // 1. Harvester Automation
      if (unit.type === 'harvester') {
        this.updateHarvester(unit, dt);
      } else if (unit.type === 'engineer') {
        // 2. Engineer Repair, Capture, and Relocation Escort Logic
        this.updateEngineer(unit, dt);
      } else {
        // 3. Combat Unit Targeting
        this.updateCombatUnit(unit, dt);
      }

      // Physics and animation decays
      if (unit.recoil && unit.recoil > 0) {
        unit.recoil = Math.max(0, unit.recoil - dt * 6.0);
      }
      if (!unit.isMoving && unit.currentSpeed && unit.currentSpeed > 0) {
        unit.currentSpeed = Math.max(0, unit.currentSpeed - 500 * dt);
      }
      if (unit.isAir && !unit.isMoving && unit.bankAngle) {
        unit.bankAngle = unit.bankAngle * Math.max(0, 1 - dt * 5);
      }

      // Persistent health damage VFX (smoke & sparks)
      this.updateDamagedUnitSmoke(unit, dt);

      // Passive health regeneration system for units with Veteran, Elite, or Heroic rank
      this.updatePassiveVeterancyRegeneration(unit, dt);
    }

    // Update Move Markers
    const aliveMarkers: MoveMarker[] = [];
    for (const m of this.moveMarkers) {
      m.life += dt;
      if (m.life < m.maxLife) {
        const progress = m.life / m.maxLife;
        m.radius = 4 + (m.maxRadius - 4) * progress;
        m.alpha = Math.max(0, 1 - progress);
        aliveMarkers.push(m);
      }
    }
    this.moveMarkers = aliveMarkers;

    // Update Tread Marks
    const aliveTreads: TreadMark[] = [];
    for (const t of this.treadMarks) {
      t.life += dt;
      if (t.life < t.maxLife) {
        if (t.life > t.maxLife * 0.5) {
          t.alpha = Math.max(0, 0.35 * (1 - (t.life - t.maxLife * 0.5) / (t.maxLife * 0.5)));
        }
        aliveTreads.push(t);
      }
    }
    this.treadMarks = aliveTreads;

    // Update Path Visualizations (Visualización de ruta en el suelo)
    const alivePaths: PathVisualization[] = [];
    for (const pv of this.pathVisualizations) {
      pv.life += dt;
      if (pv.life < pv.maxLife) {
        const progress = pv.life / pv.maxLife;
        if (progress > 0.35) {
          pv.alpha = Math.max(0, 1 - (progress - 0.35) / 0.65);
        } else {
          pv.alpha = 1.0;
        }
        alivePaths.push(pv);
      }
    }
    this.pathVisualizations = alivePaths;
  }

  /**
   * Health regeneration mechanic for units that have attained 'Elite' (rank 2)
   * or 'Heroic' (rank 3) veteran status.
   * Slowly recovers HP over time when not in active combat (no damage dealt or received for > 3.5s).
   */
  private updatePassiveVeterancyRegeneration(unit: UnitInstance, dt: number) {
    const rank = unit.veterancy || 0;
    if (rank < 2 || unit.hp >= unit.maxHp || unit.hp <= 0) {
      return;
    }

    // Out-of-combat check: no damage received and no weapons fired for at least 3.5 seconds
    const now = Date.now() / 1000;
    const lastCombat = Math.max(unit.lastCombatTime || 0, unit.lastFired || 0);
    const isOutOfCombat = (now - lastCombat) > 3.5;
    if (!isOutOfCombat) return;

    // Base heal rate: Elite = 3.0% maxHp/s + 6 HP/s, Heroic = 5.0% maxHp/s + 12 HP/s
    const regenRate = rank === 2
      ? (6.0 + unit.maxHp * 0.030)
      : (12.0 + unit.maxHp * 0.050);

    const oldHp = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + regenRate * dt);

    // Passive regeneration visual feedback: emerald (Elite) or golden (Heroic) nano-repair motes
    unit.regenVfxTimer = (unit.regenVfxTimer || 0) + dt;
    if (unit.regenVfxTimer >= 0.35 && unit.hp < unit.maxHp) {
      unit.regenVfxTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (unit.size * 0.45);
      const isHeroic = rank >= 3;
      this.particles.push({
        id: `regen_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: unit.x + Math.cos(angle) * dist,
        y: unit.y + Math.sin(angle) * dist - 3,
        vx: (Math.random() - 0.5) * 14,
        vy: -22 - Math.random() * 26,
        size: isHeroic ? 3.0 : 2.4,
        maxSize: 0.8,
        color: isHeroic ? '#fbbf24' : '#22c55e',
        alpha: 0.9,
        life: 0,
        maxLife: 0.6,
        drag: 0.93,
      });
    }

    // Periodically spawn floating green healing numbers
    unit.regenTextTimer = (unit.regenTextTimer || 0) + dt;
    if (unit.regenTextTimer >= 1.2 && unit.hp < unit.maxHp) {
      unit.regenTextTimer = 0;
      const healedAmt = Math.max(1, Math.round(regenRate * 1.2));
      this.spawnFloatingText(unit.x, unit.y - (unit.size || 16) - 4, healedAmt, false, 'heal');
    }

    // If unit reached full health, play subtle visual sparkles on full repair
    if (oldHp < unit.maxHp && unit.hp >= unit.maxHp && unit.isPlayer) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.particles.push({
          id: `fullheal_${Date.now()}_${i}`,
          type: 'spark',
          x: unit.x,
          y: unit.y,
          vx: Math.cos(a) * 35,
          vy: Math.sin(a) * 35,
          size: 2.2,
          maxSize: 0.8,
          color: '#4ade80',
          alpha: 1.0,
          life: 0,
          maxLife: 0.45,
          drag: 0.92,
        });
      }
    }
  }

  /**
   * Health regeneration mechanic for structures that have attained 'Elite' (rank 2)
   * or 'Heroic' (rank 3) veteran status (via defensive combat kills or fortified capture).
   * Slowly recovers HP over time when not in active combat (no damage dealt or received for > 4.0s).
   */
  private updatePassiveStructureVeterancyRegeneration(struct: StructureInstance, dt: number) {
    const rank = struct.veterancy || 0;
    if (rank < 2 || struct.hp >= struct.maxHp || struct.hp <= 0 || struct.isUnderConstruction) {
      return;
    }

    // Out-of-combat check: no damage received and no weapons fired for at least 4.0 seconds
    const now = Date.now() / 1000;
    const lastCombat = Math.max(struct.lastCombatTime || 0, struct.lastFired || 0);
    const isOutOfCombat = (now - lastCombat) > 4.0;
    if (!isOutOfCombat) return;

    // Elite: 2.0% maxHp/s + 15 HP/s, Heroic: 3.5% maxHp/s + 30 HP/s
    const regenRate = rank === 2
      ? (15.0 + struct.maxHp * 0.020)
      : (30.0 + struct.maxHp * 0.035);

    const oldHp = struct.hp;
    struct.hp = Math.min(struct.maxHp, struct.hp + regenRate * dt);

    // Passive structure nano-repair sparks around perimeter
    struct.regenVfxTimer = (struct.regenVfxTimer || 0) + dt;
    if (struct.regenVfxTimer >= 0.40 && struct.hp < struct.maxHp) {
      struct.regenVfxTimer = 0;
      const sparkX = struct.x + (Math.random() - 0.5) * struct.width * 0.85;
      const sparkY = struct.y + (Math.random() - 0.5) * struct.height * 0.85;
      const isHeroic = rank >= 3;
      this.particles.push({
        id: `s_regen_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: sparkX,
        y: sparkY,
        vx: (Math.random() - 0.5) * 16,
        vy: -24 - Math.random() * 26,
        size: isHeroic ? 3.4 : 2.6,
        maxSize: 1.0,
        color: isHeroic ? '#fbbf24' : '#22c55e',
        alpha: 0.9,
        life: 0,
        maxLife: 0.65,
        drag: 0.92,
      });
    }

    // Periodically spawn floating green healing numbers for structure
    struct.regenTextTimer = (struct.regenTextTimer || 0) + dt;
    if (struct.regenTextTimer >= 1.5 && struct.hp < struct.maxHp) {
      struct.regenTextTimer = 0;
      const healedAmt = Math.max(1, Math.round(regenRate * 1.5));
      this.spawnFloatingText(struct.x, struct.y - struct.height / 2 - 8, healedAmt, false, 'heal');
    }

    // Structure reached full repair
    if (oldHp < struct.maxHp && struct.hp >= struct.maxHp && struct.isPlayer) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        this.particles.push({
          id: `s_fullheal_${Date.now()}_${i}`,
          type: 'spark',
          x: struct.x + Math.cos(a) * (struct.width * 0.45),
          y: struct.y + Math.sin(a) * (struct.height * 0.45),
          vx: Math.cos(a) * 35,
          vy: Math.sin(a) * 35,
          size: 3,
          maxSize: 1,
          color: '#4ade80',
          alpha: 1.0,
          life: 0,
          maxLife: 0.5,
          drag: 0.92,
        });
      }
    }
  }

  /** Visualización de ruta: añade el camino temporal calculado para una unidad hacia su destino */
  public addPathVisualization(
    unitId: string, 
    points: { x: number; y: number }[], 
    type: 'move' | 'attack',
    faction?: Faction
  ) {
    if (!points || points.length < 2) return;

    // Filter out previous path visualization for this unit to prevent clutter
    this.pathVisualizations = this.pathVisualizations.filter(p => p.unitId !== unitId);

    const isAttack = type === 'attack';
    const mainColor = isAttack ? '#ef4444' : (faction === 'nod' ? '#f87171' : '#22c55e');
    const secondaryColor = isAttack ? '#fca5a5' : '#38bdf8';

    this.pathVisualizations.push({
      id: `path_${Date.now()}_${Math.random()}`,
      unitId,
      points,
      color: mainColor,
      secondaryColor,
      alpha: 1.0,
      life: 0,
      maxLife: 2.2, // Línea temporal visible en el suelo durante 2.2 segundos
      type
    });

    if (this.pathVisualizations.length > 35) {
      this.pathVisualizations.shift();
    }
  }

  public addMoveMarker(x: number, y: number, type: 'move' | 'attack') {
    this.moveMarkers.push({
      id: `mark_${Date.now()}_${Math.random()}`,
      x,
      y,
      type,
      radius: 4,
      maxRadius: 26,
      alpha: 1.0,
      life: 0,
      maxLife: 0.45,
    });
    if (this.moveMarkers.length > 20) {
      this.moveMarkers.shift();
    }
  }

  public addTreadMark(x: number, y: number, rotation: number, width: number) {
    this.treadMarks.push({
      id: `tread_${Date.now()}_${Math.random()}`,
      x,
      y,
      rotation,
      width,
      alpha: 0.35,
      life: 0,
      maxLife: 14,
    });
    if (this.treadMarks.length > 60) {
      this.treadMarks.shift();
    }
  }

  /**
   * Sistema de Texto Flotante (Floating Combat Text) para unidades y estructuras:
   * Muestra el daño infligido con colores y efectos visuales diferenciados:
   * - Normal: Blanco / Carmesí nítido (-X)
   * - Crítico: Dorado / Naranja brillante con pop de escala e impacto (-X!)
   * - Curación: Verde esmeralda para regeneración pasiva y reparaciones (+X)
   */
  public spawnFloatingText(
    x: number,
    y: number,
    amount: number,
    isCritical: boolean = false,
    type: 'damage' | 'critical' | 'heal' = (isCritical ? 'critical' : 'damage'),
    customText?: string
  ) {
    if (this.floatingTexts.length > 80) {
      this.floatingTexts.shift();
    }

    const rounded = Math.max(1, Math.round(amount));
    const textStr = customText || (type === 'heal' ? `+${rounded}` : isCritical ? `-${rounded}!` : `-${rounded}`);
    const scatterX = (Math.random() - 0.5) * 18;
    const scatterY = (Math.random() - 0.5) * 8;

    this.floatingTexts.push({
      id: `fct_${Date.now()}_${Math.random()}`,
      x: x + scatterX,
      y: y + scatterY,
      text: textStr,
      type,
      fontSize: isCritical ? 15 : type === 'heal' ? 12 : 11,
      alpha: 1.0,
      life: 0,
      maxLife: isCritical ? 1.05 : 0.8,
      vx: (Math.random() - 0.5) * 20,
      vy: isCritical ? -48 - Math.random() * 16 : -34 - Math.random() * 12,
      scale: isCritical ? 1.45 : 1.15,
    });
  }

  private updateFloatingTexts(dt: number) {
    const alive: FloatingCombatText[] = [];
    for (const ft of this.floatingTexts) {
      ft.life += dt;
      if (ft.life < ft.maxLife) {
        ft.x += ft.vx * dt;
        ft.y += ft.vy * dt;
        ft.vy *= Math.pow(0.92, dt * 60);
        ft.vx *= Math.pow(0.94, dt * 60);

        // Pop scale decay to base size
        if (ft.scale > 1.0) {
          ft.scale = Math.max(1.0, ft.scale - dt * 3.2);
        }

        // Smooth alpha fade during final 45% of life
        const fadeThreshold = ft.maxLife * 0.55;
        if (ft.life > fadeThreshold) {
          ft.alpha = Math.max(0, 1 - (ft.life - fadeThreshold) / (ft.maxLife - fadeThreshold));
        } else {
          ft.alpha = 1.0;
        }

        alive.push(ft);
      }
    }
    this.floatingTexts = alive;
  }

  private tiberiumRegrowTimer: number = 0;
  private updateTiberium(dt: number) {
    this.tiberiumRegrowTimer += dt;
    if (this.tiberiumRegrowTimer >= 1.5) {
      this.tiberiumRegrowTimer = 0;
      for (const crystal of this.tiberiumCrystals) {
        if (crystal.amount < crystal.maxAmount) {
          crystal.amount = Math.min(crystal.maxAmount, crystal.amount + 1.2);
        }
      }
    }
  }

  /**
   * Finds the most optimal friendly refinery for a harvester, balancing travel distance with dock congestion
   */
  public findBestRefineryForHarvester(unit: UnitInstance): StructureInstance | null {
    const friendlyRefineries = this.structures.filter(
      s => s.isPlayer === unit.isPlayer && s.type === 'refinery' && s.hp > 0
    );
    if (friendlyRefineries.length === 0) return null;
    if (friendlyRefineries.length === 1) return friendlyRefineries[0];

    let bestRef = friendlyRefineries[0];
    let bestScore = Infinity;

    for (const ref of friendlyRefineries) {
      const dist = Math.hypot(ref.x - unit.x, ref.y - unit.y);
      // Penalize refineries that already have harvesters unloading or heading to them
      let occupancyPenalty = 0;
      for (const other of this.units) {
        if (other.id !== unit.id && other.type === 'harvester' && other.targetRefineryId === ref.id) {
          if (other.harvestState === 'unloading') occupancyPenalty += 180;
          else if (other.harvestState === 'returning_to_refinery') occupancyPenalty += 80;
        }
      }
      const score = dist + occupancyPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestRef = ref;
      }
    }

    return bestRef;
  }

  /**
   * Evento de 'llegada al destino' para los Cosechadores.
   * Al detectar la colisión o proximidad con la Refinería, activa automáticamente
   * el método de descarga de créditos de Tiberio sin esperar entrada del usuario.
   */
  public onHarvesterArrivedAtRefinery(unit: UnitInstance, refinery: StructureInstance, dt: number = 1 / 60) {
    const dockX = refinery.x;
    const dockY = refinery.y + 36;

    // Verificar si otro cosechador está ocupando la tolva de descarga
    const isDockOccupied = this.units.some(
      other => other.id !== unit.id && other.type === 'harvester' && other.targetRefineryId === refinery.id && other.harvestState === 'unloading'
    );

    if (isDockOccupied) {
      // Mantener posición en zona de cola justo frente a la rampa
      const queueX = dockX;
      const queueY = dockY + 32;
      const distToQueue = Math.hypot(queueX - unit.x, queueY - unit.y);
      if (distToQueue > 14) {
        this.moveUnitToward(unit, queueX, queueY, dt);
      } else {
        unit.isMoving = false;
        unit.currentSpeed = 0;
      }
      return;
    }

    // La rampa está libre: activar el método de descarga de créditos automáticamente sin esperar entrada del usuario
    this.unloadHarvesterCredits(unit, refinery);
  }

  /**
   * Método de descarga automática de créditos de Tiberio.
   * Transfiere inmediatamente el cargamento a fondos del jugador/IA, genera efectos
   * audiovisuales (monedas, voz EVA, partículas de Tiberio) y orienta la unidad.
   */
  public unloadHarvesterCredits(unit: UnitInstance, refinery: StructureInstance): number {
    unit.harvestState = 'unloading';
    unit.harvestTimer = 0;
    unit.isMoving = false;
    unit.currentSpeed = 0;
    unit.path = undefined;
    unit.targetX = undefined;
    unit.targetY = undefined;
    unit.targetRefineryId = refinery.id;

    // Orientar cabina hacia la tolva de la refinería
    const angleToRefinery = Math.atan2(refinery.y - unit.y, refinery.x - unit.x);
    unit.rotation = angleToRefinery;

    const cargo = unit.tiberiumCargo ?? 0;
    let creditsEarned = 0;

    if (cargo > 0) {
      creditsEarned = Math.max(50, Math.round((cargo / 100) * 800));
      if (unit.isPlayer) {
        this.playerCredits += creditsEarned;
        this.matchTiberiumHarvested += creditsEarned;
        sound.playCreditsDeposited();
        sound.speakEVA('Tiberio procesado.');
        for (let i = 0; i < 10; i++) {
          this.spawnSporeParticle(unit.x, unit.y - 12, i % 2 === 0 ? '#fbbf24' : '#22c55e', 55 + Math.random() * 40);
        }
        this.notifyUI();
      } else {
        this.aiCredits += creditsEarned;
      }
    }

    unit.tiberiumCargo = 0;
    return creditsEarned;
  }

  /**
   * Automatically calculates the optimal path to the nearest available refinery and initiates return
   */
  public dispatchHarvesterToRefinery(unit: UnitInstance, refinery?: StructureInstance): boolean {
    const targetRef = refinery || this.findBestRefineryForHarvester(unit);
    if (!targetRef) {
      unit.harvestState = 'idle';
      unit.isMoving = false;
      return false;
    }

    const dockX = targetRef.x;
    const dockY = targetRef.y + 36; // Clean, walkable front dock bay

    unit.targetRefineryId = targetRef.id;
    unit.targetX = dockX;
    unit.targetY = dockY;
    unit.harvestState = 'returning_to_refinery';
    unit.isMoving = true;
    unit.manualMoveOrder = false;

    // Immediately calculate optimal A* navigation path to refinery dock considering allied structures as passable
    const pathOpts = { isHarvester: true, isPlayer: unit.isPlayer };
    if (this.pathfinder.hasLineOfSight(unit.x, unit.y, dockX, dockY, pathOpts)) {
      unit.path = [{ x: dockX, y: dockY }];
    } else {
      const computed = this.pathfinder.findPath(unit.x, unit.y, dockX, dockY, pathOpts);
      unit.path = computed && computed.length > 0 ? computed : [{ x: dockX, y: dockY }];
    }
    unit.pathIndex = 0;
    unit.lastPathTargetX = dockX;
    unit.lastPathTargetY = dockY;

    if (unit.selected) {
      this.addPathVisualization(unit.id, [{ x: unit.x, y: unit.y }, ...unit.path], 'move', unit.faction);
    }

    this.notifyUI();
    return true;
  }

  /**
   * Automatically calculates the optimal path to the best nearby Tiberium crystal and initiates harvest run
   */
  public dispatchHarvesterToTiberium(unit: UnitInstance, targetCrystalId?: string): boolean {
    let chosenCrystal: TiberiumCrystal | null = null;

    if (targetCrystalId) {
      chosenCrystal = this.tiberiumCrystals.find(c => c.id === targetCrystalId && c.amount > 0) || null;
    }

    if (!chosenCrystal) {
      // Find closest viable crystal with load balancing across cluster
      let bestScore = Infinity;
      for (const crystal of this.tiberiumCrystals) {
        if (crystal.amount <= 0) continue;
        const dist = Math.hypot(crystal.x - unit.x, crystal.y - unit.y);
        // Distribute harvesters among different nodes in the field
        let crowdingPenalty = 0;
        for (const other of this.units) {
          if (other.id !== unit.id && other.type === 'harvester' && other.harvestingFrom === crystal.id) {
            crowdingPenalty += 50;
          }
        }
        const score = dist + crowdingPenalty;
        if (score < bestScore) {
          bestScore = score;
          chosenCrystal = crystal;
        }
      }
    }

    if (!chosenCrystal) {
      unit.harvestState = 'idle';
      unit.isMoving = false;
      return false;
    }

    unit.harvestingFrom = chosenCrystal.id;
    unit.targetX = chosenCrystal.x;
    unit.targetY = chosenCrystal.y;
    unit.harvestState = 'moving_to_field';
    unit.isMoving = true;
    unit.manualMoveOrder = false;

    // Immediately calculate optimal A* navigation path to Tiberium field considering allied structures as passable
    const pathOpts = { isHarvester: true, isPlayer: unit.isPlayer };
    if (this.pathfinder.hasLineOfSight(unit.x, unit.y, chosenCrystal.x, chosenCrystal.y, pathOpts)) {
      unit.path = [{ x: chosenCrystal.x, y: chosenCrystal.y }];
    } else {
      const computed = this.pathfinder.findPath(unit.x, unit.y, chosenCrystal.x, chosenCrystal.y, pathOpts);
      unit.path = computed && computed.length > 0 ? computed : [{ x: chosenCrystal.x, y: chosenCrystal.y }];
    }
    unit.pathIndex = 0;
    unit.lastPathTargetX = chosenCrystal.x;
    unit.lastPathTargetY = chosenCrystal.y;

    if (unit.selected) {
      this.addPathVisualization(unit.id, [{ x: unit.x, y: unit.y }, ...unit.path], 'move', unit.faction);
    }

    this.notifyUI();
    return true;
  }

  private updateHarvester(unit: UnitInstance, dt: number) {
    // 0. Manual Ground Movement Priority:
    // If the commander specifically ordered the harvester to a map position, respect that order
    if (unit.manualMoveOrder && unit.targetX !== undefined && unit.targetY !== undefined) {
      const dist = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
      if (dist > 18) {
        this.moveUnitToward(unit, unit.targetX, unit.targetY, dt);
        return;
      } else {
        unit.manualMoveOrder = false;
        unit.targetX = undefined;
        unit.targetY = undefined;
        unit.isMoving = false;
        unit.path = undefined;
      }
    }

    // STATE 1: IDLE - Auto-dispatch based on current cargo payload
    if (!unit.harvestState || unit.harvestState === 'idle') {
      unit.isMoving = false;

      // If harvester has any cargo, immediately route to the best refinery!
      if (unit.tiberiumCargo && unit.tiberiumCargo > 0) {
        this.dispatchHarvesterToRefinery(unit);
      } else {
        // Otherwise, route to the nearest viable Tiberium crystal field!
        this.dispatchHarvesterToTiberium(unit);
      }
    } 
    // STATE 2: MOVING TO TIBERIUM FIELD
    else if (unit.harvestState === 'moving_to_field') {
      const patch = this.tiberiumCrystals.find(c => c.id === unit.harvestingFrom);
      if (!patch || patch.amount <= 0) {
        // Current target crystal depleted en route: dynamically retarget next best crystal without pausing!
        this.dispatchHarvesterToTiberium(unit);
        return;
      }

      const dist = Math.hypot(patch.x - unit.x, patch.y - unit.y);
      // Arrived at Tiberium crystal: start harvesting immediately
      if (dist < 42) {
        unit.harvestState = 'harvesting';
        unit.harvestTimer = 0;
        unit.isMoving = false;
        unit.currentSpeed = 0;
        unit.path = undefined;
      } else {
        this.moveUnitToward(unit, patch.x, patch.y, dt);
      }
    } 
    // STATE 3: HARVESTING MINERALS FROM CRYSTAL
    else if (unit.harvestState === 'harvesting') {
      unit.isMoving = false;
      const patch = this.tiberiumCrystals.find(c => c.id === unit.harvestingFrom);

      // If current patch is exhausted:
      if (!patch || patch.amount <= 0) {
        // If harvester has gathered any cargo, automatically return to refinery immediately!
        if (unit.tiberiumCargo && unit.tiberiumCargo > 0) {
          this.dispatchHarvesterToRefinery(unit);
        } else {
          // If empty, shift to next crystal in the field
          this.dispatchHarvesterToTiberium(unit);
        }
        return;
      }

      // Fast spinning diamond grinding blades animation
      unit.harvesterBladeAngle = ((unit.harvesterBladeAngle || 0) + dt * 26) % (Math.PI * 2);

      unit.harvestTimer = (unit.harvestTimer || 0) + dt;
      // Ambient Tiberium harvesting spore VFX
      if (Math.random() < 0.35) {
        const frontX = unit.x + Math.cos(unit.rotation) * (unit.size * 0.5);
        const frontY = unit.y + Math.sin(unit.rotation) * (unit.size * 0.5);
        this.spawnSporeParticle(frontX, frontY, patch.type === 'blue' ? '#38bdf8' : '#22c55e', 40 + Math.random() * 50);
      }

      // Extraction tick: gathers 25 Tiberium per cycle (~1.4s total to reach 100% capacity)
      if (unit.harvestTimer >= 0.35) {
        unit.harvestTimer = 0;
        const harvestAmt = 25;
        patch.amount = Math.max(0, patch.amount - harvestAmt);
        unit.tiberiumCargo = Math.min(100, (unit.tiberiumCargo || 0) + harvestAmt);

        if (unit.isPlayer && Math.random() < 0.3) {
          sound.playHarvestCrystals();
        }

        // FULL CARGO AUTOMATION:
        // As soon as cargo is full (100%), automatically calculate optimal path to nearest refinery and initiate return!
        if (unit.tiberiumCargo >= 100) {
          this.dispatchHarvesterToRefinery(unit);
        }
      }
    } 
    // STATE 4: RETURNING TO REFINERY
    else if (unit.harvestState === 'returning_to_refinery') {
      let refinery = this.structures.find(s => s.id === unit.targetRefineryId && s.hp > 0);
      if (!refinery) {
        // Target refinery destroyed or missing: dynamically reroute to alternate friendly refinery
        const rerouted = this.dispatchHarvesterToRefinery(unit);
        if (!rerouted) {
          unit.harvestState = 'idle';
          unit.isMoving = false;
        }
        return;
      }

      const dockX = refinery.x;
      const dockY = refinery.y + 36;
      const distToDock = Math.hypot(dockX - unit.x, dockY - unit.y);
      const distToCenter = Math.hypot(refinery.x - unit.x, refinery.y - unit.y);

      // Distance to building bounding box edges
      const dx = Math.max(Math.abs(unit.x - refinery.x) - refinery.width / 2, 0);
      const dy = Math.max(Math.abs(unit.y - refinery.y) - refinery.height / 2, 0);
      const distToEdge = Math.hypot(dx, dy);

      // Direct collision detection with refinery bounding box (overlapping or touching bounds)
      const collidesWithRefinery = (dx === 0 && dy === 0) ||
        (Math.abs(unit.x - refinery.x) <= (refinery.width / 2 + unit.size / 2) &&
         Math.abs(unit.y - refinery.y) <= (refinery.height / 2 + unit.size / 2));

      // Evento de 'llegada al destino': al detectar colisión o proximidad con la Refinería,
      // se activa automáticamente el método de descarga de créditos sin esperar entrada del usuario
      if (collidesWithRefinery || distToDock <= 48 || distToEdge <= 30 || distToCenter <= 70) {
        this.onHarvesterArrivedAtRefinery(unit, refinery, dt);
      } else {
        this.moveUnitToward(unit, dockX, dockY, dt);
      }
    } 
    // STATE 5: UNLOADING MINERALS INTO REFINERY HOPPER
    else if (unit.harvestState === 'unloading') {
      unit.isMoving = false;
      unit.currentSpeed = 0;
      unit.harvestTimer = (unit.harvestTimer || 0) + dt;

      // Face toward the refinery unloading bay
      const refinery = this.structures.find(s => s.id === unit.targetRefineryId && s.hp > 0);
      if (refinery) {
        const angleToRefinery = Math.atan2(refinery.y - unit.y, refinery.x - unit.x);
        let diff = ((angleToRefinery - unit.rotation + Math.PI) % (Math.PI * 2)) - Math.PI;
        unit.rotation += Math.sign(diff) * Math.min(Math.abs(diff), dt * 8);
      }

      // Visual feedback: Spurt of green crystal particles flowing into the refinery hopper
      if (Math.random() < 0.45) {
        this.spawnSporeParticle(unit.x, unit.y - 12, '#22c55e', 50);
      }

      // Unload process complete (0.85s)
      if (unit.harvestTimer >= 0.85) {
        // Clear targets and markers
        unit.tiberiumCargo = 0;
        unit.targetX = undefined;
        unit.targetY = undefined;
        unit.targetRefineryId = undefined;
        unit.harvestTimer = 0;
        unit.path = undefined;
        unit.manualMoveOrder = false;

        // AUTOMATIC RE-DEPLOYMENT:
        // Automatically calculate path back to the nearest Tiberium crystal field and resume harvesting!
        this.dispatchHarvesterToTiberium(unit);
        this.notifyUI();
      }
    }
  }

  private updateCombatUnit(unit: UnitInstance, dt: number) {
    // 1. If unit has target enemy unit/structure, pursue or attack
    let targetEntity: { x: number; y: number; hp: number; isPlayer: boolean; isAir?: boolean } | null = null;

    if (unit.targetUnitId) {
      const u = this.units.find(o => o.id === unit.targetUnitId);
      if (u && u.hp > 0) targetEntity = u;
      else unit.targetUnitId = undefined;
    }

    if (!targetEntity && unit.targetStructureId) {
      const s = this.structures.find(o => o.id === unit.targetStructureId);
      if (s && s.hp > 0) targetEntity = s;
      else unit.targetStructureId = undefined;
    }

    // Auto-acquire target in sight if idle or no target
    if (!targetEntity) {
      let closestEnemy: UnitInstance | null = null;
      let minEnemyDist = unit.range + 90;
      for (const other of this.units) {
        if (other.isPlayer !== unit.isPlayer && other.hp > 0) {
          if (other.isAir && !unit.canTargetAir) continue; // can't target aircraft
          // If player unit, enemy must be in active line-of-sight!
          if (unit.isPlayer && !this.isPositionVisible(other.x, other.y)) continue;
          const d = Math.hypot(other.x - unit.x, other.y - unit.y);
          if (d < minEnemyDist) {
            minEnemyDist = d;
            closestEnemy = other;
          }
        }
      }
      if (closestEnemy) {
        targetEntity = closestEnemy;
        unit.targetUnitId = closestEnemy.id;
      }
    }

    // Lost sight of enemy unit in fog of war: drop pursuit if outside line of sight
    if (unit.isPlayer && targetEntity && !targetEntity.isPlayer && !this.isPositionVisible(targetEntity.x, targetEntity.y)) {
      targetEntity = null;
      unit.targetUnitId = undefined;
    }

    // Initialize turret rotation
    if (unit.turretRotation === undefined) {
      unit.turretRotation = unit.rotation;
    }

    if (targetEntity) {
      const dist = Math.hypot(targetEntity.x - unit.x, targetEntity.y - unit.y);
      const aimAngle = Math.atan2(targetEntity.y - unit.y, targetEntity.x - unit.x);

      // Independent turret rotation toward target
      let turretDiff = ((aimAngle - unit.turretRotation + Math.PI) % (Math.PI * 2)) - Math.PI;
      const turretTurnSpeed = 8.5 * dt;
      if (Math.abs(turretDiff) <= turretTurnSpeed) {
        unit.turretRotation = aimAngle;
      } else {
        unit.turretRotation += Math.sign(turretDiff) * turretTurnSpeed;
      }

      if (dist <= unit.range) {
        // In attack range! Halt and fire
        unit.isMoving = false;
        if (unit.currentSpeed) {
          unit.currentSpeed = Math.max(0, unit.currentSpeed - 550 * dt);
        }
        // Fire when turret is reasonably lined up (< 35 degrees)
        if (Math.abs(turretDiff) < 0.6) {
          this.tryUnitFire(unit, targetEntity);
        }
      } else {
        // Move closer
        this.moveUnitToward(unit, targetEntity.x, targetEntity.y, dt);
      }
    } else if (unit.targetX !== undefined && unit.targetY !== undefined) {
      // Moving to ground target
      const dist = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
      if (dist > 8) {
        this.moveUnitToward(unit, unit.targetX, unit.targetY, dt);
      } else {
        unit.targetX = undefined;
        unit.targetY = undefined;
        unit.isMoving = false;
      }

      // If idle/no enemy, turret smoothly aligns back to vehicle heading
      let turretDiff = ((unit.rotation - unit.turretRotation + Math.PI) % (Math.PI * 2)) - Math.PI;
      const turretTurnSpeed = 5.0 * dt;
      if (Math.abs(turretDiff) <= turretTurnSpeed) {
        unit.turretRotation = unit.rotation;
      } else {
        unit.turretRotation += Math.sign(turretDiff) * turretTurnSpeed;
      }
    } else {
      unit.isMoving = false;
      // Re-align turret when idle
      let turretDiff = ((unit.rotation - unit.turretRotation + Math.PI) % (Math.PI * 2)) - Math.PI;
      const turretTurnSpeed = 4.0 * dt;
      if (Math.abs(turretDiff) <= turretTurnSpeed) {
        unit.turretRotation = unit.rotation;
      } else {
        unit.turretRotation += Math.sign(turretDiff) * turretTurnSpeed;
      }
    }
  }

  /**
   * Engineer Unit AI & Order execution:
   * 1. Repairing damaged friendly structures (channels repair beam, welding tool audio, sparks/nanites).
   *    Gains veterancy experience from repairs.
   * 2. Infiltrating/capturing enemy structures (reaches entrance, takes over weapons/economy).
   * 3. Autonomous nearby field repair when idle.
   */
  private updateEngineer(unit: UnitInstance, dt: number) {
    // 0. Manual ground movement
    if (unit.targetX !== undefined && unit.targetY !== undefined && !unit.repairTargetId && !unit.captureTargetId) {
      const dist = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
      if (dist > 12) {
        this.moveUnitToward(unit, unit.targetX, unit.targetY, dt);
        return;
      } else {
        unit.targetX = undefined;
        unit.targetY = undefined;
        unit.isMoving = false;
        unit.currentSpeed = 0;
        unit.path = undefined;
      }
    }

    // 1. REPAIR ORDER / ACTION
    if (unit.repairTargetId) {
      const targetStruct = this.structures.find(s => s.id === unit.repairTargetId);
      if (!targetStruct || targetStruct.hp <= 0 || targetStruct.hp >= targetStruct.maxHp) {
        // Target destroyed or fully repaired!
        if (targetStruct && targetStruct.hp >= targetStruct.maxHp && unit.isPlayer) {
          // If repaired by an Elite (Level 2+) engineer, fortify structure with Elite status and auto-repair!
          if (unit.veterancy && unit.veterancy >= 2 && (!targetStruct.veterancy || targetStruct.veterancy < 2)) {
            targetStruct.veterancy = 2;
            sound.playPromotion();
            const sDef = STRUCTURE_DEFS[targetStruct.type];
            sound.speakEVA(`¡${sDef?.name || 'Estructura'} fortificada a rango Élite! Auto-regeneración táctica desbloqueada.`, true);
          } else {
            sound.speakEVA('Reparación completada.');
          }
        }
        unit.repairTargetId = undefined;
        unit.engineerAction = 'idle';
        unit.isMoving = false;
        unit.currentSpeed = 0;
        return;
      }

      // Proximity check to structure perimeter
      const halfW = targetStruct.width / 2;
      const halfH = targetStruct.height / 2;
      const dx = Math.max(0, Math.abs(unit.x - targetStruct.x) - halfW);
      const dy = Math.max(0, Math.abs(unit.y - targetStruct.y) - halfH);
      const distToEdge = Math.hypot(dx, dy);

      if (distToEdge <= 38) {
        // In repair range: hold position, orient toward building and channel repair nanites
        unit.isMoving = false;
        unit.currentSpeed = 0;
        unit.path = undefined;
        unit.engineerAction = 'repairing';
        unit.rotation = Math.atan2(targetStruct.y - unit.y, targetStruct.x - unit.x);

        // Continuous repair rate: 65 HP/s for standard, 95 HP/s for Level 2 (Elite)
        const repairRate = (unit.veterancy && unit.veterancy >= 2) ? 95 : 65;
        const healAmt = repairRate * dt;
        const oldHp = targetStruct.hp;
        targetStruct.hp = Math.min(targetStruct.maxHp, targetStruct.hp + healAmt);
        const actualHealed = targetStruct.hp - oldHp;

        // Sound & VFX throttling
        unit.repairPulseTimer = (unit.repairPulseTimer || 0) + dt;
        if (unit.repairPulseTimer >= 0.14) {
          unit.repairPulseTimer = 0;
          sound.playRepairTool(unit.x, unit.y);

          // Welding sparks & repair nanites from engineer to building surface
          const angle = unit.rotation + (Math.random() - 0.5) * 0.4;
          const sparkDist = 18 + Math.random() * 24;
          this.particles.push({
            id: `rep_${Date.now()}_${Math.random()}`,
            type: 'spark',
            x: unit.x + Math.cos(angle) * sparkDist,
            y: unit.y + Math.sin(angle) * sparkDist,
            vx: (Math.random() - 0.5) * 30,
            vy: (Math.random() - 0.5) * 30 - 15,
            size: 1.8 + Math.random() * 1.5,
            maxSize: 0.6,
            color: Math.random() < 0.5 ? '#38bdf8' : '#facc15',
            alpha: 1.0,
            life: 0,
            maxLife: 0.22,
            drag: 0.92,
          });
        }

        // Engineer Veterancy progression through field repair
        unit.engineerXp = (unit.engineerXp || 0) + actualHealed;
        // Every 300 HP repaired counts as a battlefield promotion point!
        if (unit.engineerXp >= 300) {
          unit.engineerXp -= 300;
          unit.kills = (unit.kills || 0) + 1;
          const oldRank = unit.veterancy || 0;
          let newRank = oldRank;
          if (unit.kills >= 7) newRank = 3;
          else if (unit.kills >= 3) newRank = 2; // Level 2: Elite / Moving buildings unlocked!
          else if (unit.kills >= 1) newRank = 1; // Level 1: Veteran

          if (newRank > oldRank) {
            unit.veterancy = newRank;
            if (unit.isPlayer) {
              sound.playPromotion();
              if (newRank === 2) {
                sound.speakEVA('¡Ingeniero ascendido a Nivel 2! Capacidad de traslado de estructuras desbloqueada.', true);
              } else {
                sound.speakEVA('Unidad promovida a rango Veterano.');
              }
            }
          }
        }
      } else {
        // Move towards closest point of structure perimeter
        const targetApproachX = targetStruct.x + (unit.x < targetStruct.x ? -halfW - 16 : halfW + 16);
        const targetApproachY = targetStruct.y + (unit.y < targetStruct.y ? -halfH - 16 : halfH + 16);
        this.moveUnitToward(unit, targetApproachX, targetApproachY, dt);
      }
      return;
    }

    // 2. CAPTURE ORDER / ACTION (Enemy structure occupation)
    if (unit.captureTargetId) {
      const targetStruct = this.structures.find(s => s.id === unit.captureTargetId);
      if (!targetStruct || targetStruct.hp <= 0 || targetStruct.isPlayer === unit.isPlayer) {
        // Structure destroyed or already ours!
        unit.captureTargetId = undefined;
        unit.engineerAction = 'idle';
        unit.isMoving = false;
        unit.currentSpeed = 0;
        return;
      }

      const halfW = targetStruct.width / 2;
      const halfH = targetStruct.height / 2;
      const dx = Math.max(0, Math.abs(unit.x - targetStruct.x) - halfW);
      const dy = Math.max(0, Math.abs(unit.y - targetStruct.y) - halfH);
      const distToEdge = Math.hypot(dx, dy);

      if (distToEdge <= 30) {
        // INFILTRATE & CAPTURE!
        this.captureStructure(targetStruct, unit);
        // Engineer enters the structure (infiltrated)
        this.units = this.units.filter(u => u.id !== unit.id);
        return;
      } else {
        this.moveUnitToward(unit, targetStruct.x, targetStruct.y, dt);
      }
      return;
    }

    // 3. AUTONOMOUS PROXIMITY REPAIR (Idle engineers automatically assist damaged structures nearby)
    if (!unit.isMoving && (!unit.engineerAction || unit.engineerAction === 'idle')) {
      let nearestDamaged: StructureInstance | null = null;
      let minDamagedDist = 260; // Auto-patrol repair radius

      for (const s of this.structures) {
        if (s.isPlayer === unit.isPlayer && s.hp > 0 && s.hp < s.maxHp && !s.isBeingMoved) {
          const d = Math.hypot(s.x - unit.x, s.y - unit.y);
          if (d < minDamagedDist) {
            minDamagedDist = d;
            nearestDamaged = s;
          }
        }
      }

      if (nearestDamaged) {
        unit.repairTargetId = nearestDamaged.id;
        unit.engineerAction = 'repairing';
      }
    }
  }

  /**
   * Captures an enemy structure when infiltrated by an engineer.
   * Flips ownership, transfers resources/weapons, and triggers audiovisual rewards.
   */
  public captureStructure(struct: StructureInstance, engineer: UnitInstance) {
    const prevFaction = struct.faction;
    const isPlayerCapture = engineer.isPlayer;

    struct.isPlayer = isPlayerCapture;
    struct.faction = engineer.faction;
    struct.isCaptured = true;
    struct.capturedFrom = prevFaction;
    // Restore health to full upon capture / overhaul
    struct.hp = struct.maxHp;

    if (isPlayerCapture) {
      sound.playBuildingCaptured();

      // Captured spoils based on structure type
      if (struct.type === 'refinery') {
        const bonusCredits = 1200;
        this.playerCredits += bonusCredits;
        this.matchTiberiumHarvested += bonusCredits;
        sound.speakEVA('¡Refinería enemiga capturada! Fondos confiscados: 1,200 créditos.');
      } else if (struct.type === 'turret' || struct.type === 'aaturret') {
        sound.speakEVA('¡Defensa enemiga capturada y rearmada a nuestro favor!');
      } else if (struct.type === 'powerplant') {
        sound.speakEVA('¡Planta de energía enemiga capturada!');
      } else if (struct.type === 'barracks' || struct.type === 'warfactory') {
        sound.speakEVA('¡Instalación de producción enemiga capturada!');
      } else if (struct.type === 'techlab') {
        sound.speakEVA('¡Centro tecnológico enemigo capturado! Datos de armamento descargados.');
      } else if (struct.type === 'conyard') {
        sound.speakEVA('¡Puesto de mando enemigo capturado!');
      } else {
        sound.speakEVA('¡Estructura enemiga capturada!');
      }

      // Celebratory capture holographic shockwaves
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        this.particles.push({
          id: `cap_${Date.now()}_${i}`,
          type: 'spark',
          x: struct.x,
          y: struct.y,
          vx: Math.cos(angle) * (80 + Math.random() * 60),
          vy: Math.sin(angle) * (80 + Math.random() * 60),
          size: 2.8,
          maxSize: 0.8,
          color: engineer.faction === 'gdi' ? '#38bdf8' : '#ef4444',
          alpha: 1.0,
          life: 0,
          maxLife: 0.6,
          drag: 0.94,
        });
      }
    } else {
      // AI captured a player structure!
      this.notifyPlayerOfAttack();
      sound.speakEVA('¡Alerta: Una estructura nuestra ha sido capturada por el enemigo!');
    }

    // Refresh pathfinding grid so units know the new allegiance
    this.pathfinder.updateStructure(struct, true);
    this.notifyUI();
  }

  /**
   * Initiates building relocation using Level 2 (Elite) Engineers.
   * Number of Level 2 engineers required depends on building size:
   * Turret: 1, Power/Barracks: 2, Refinery/TechLab: 3, ConYard/WarFactory/Superweapon: 4.
   */
  public orderRelocateStructure(structId: string, targetX: number, targetY: number): boolean {
    const struct = this.structures.find(s => s.id === structId);
    if (!struct || !struct.isPlayer || struct.hp <= 0) return false;

    // Check if destination is valid and walkable/clear
    const halfW = struct.width / 2;
    const halfH = struct.height / 2;
    if (targetX - halfW < 0 || targetX + halfW > this.currentMap.width ||
        targetY - halfH < 0 || targetY + halfH > this.currentMap.height) {
      sound.speakEVA('Ubicación fuera de límites.');
      return false;
    }

    // Check overlap with other structures
    for (const other of this.structures) {
      if (other.id !== struct.id && other.hp > 0) {
        if (Math.abs(other.x - targetX) < (struct.width + other.width) * 0.48 &&
            Math.abs(other.y - targetY) < (struct.height + other.height) * 0.48) {
          sound.speakEVA('Ubicación obstruida por otra estructura.');
          return false;
        }
      }
    }

    const requiredEngineers = getRequiredEngineersToMove(struct.type);
    // Find available Level 2 (veterancy >= 2) engineers
    const availableLvl2Engineers = this.units.filter(u => 
      u.isPlayer && u.type === 'engineer' && (u.veterancy || 0) >= 2 && (!u.assignedStructureId || u.assignedStructureId === struct.id)
    );

    if (availableLvl2Engineers.length < requiredEngineers) {
      sound.speakEVA(`Se requieren ${requiredEngineers} ingenieros Nivel 2 para mover este edificio. Tienes ${availableLvl2Engineers.length}.`);
      return false;
    }

    // Assign required engineers
    const assigned = availableLvl2Engineers.slice(0, requiredEngineers);
    struct.assignedEngineers = assigned.map(e => e.id);
    assigned.forEach(e => {
      e.assignedStructureId = struct.id;
      e.engineerAction = 'moving_building';
      e.repairTargetId = undefined;
      e.captureTargetId = undefined;
    });

    // Clear old footprint in pathfinder so the building can move freely
    this.pathfinder.updateStructure(struct, false);

    // Compute convoy relocation path
    let path = this.pathfinder.findPath(struct.x, struct.y, targetX, targetY, { isHarvester: true, isPlayer: true });
    if (!path || path.length === 0) {
      path = [{ x: targetX, y: targetY }];
    }

    struct.isBeingMoved = true;
    struct.moveTargetX = targetX;
    struct.moveTargetY = targetY;
    struct.moveSpeed = 48; // Convoy transport speed
    struct.relocatePath = path;
    struct.relocatePathIndex = 0;

    sound.playBuildingRelocationStart();
    sound.speakEVA('Iniciando traslado de estructura.');
    this.notifyUI();
    return true;
  }

  /**
   * Updates structures being moved by Level 2 engineers.
   */
  private updateRelocatingStructures(dt: number) {
    for (const struct of this.structures) {
      if (!struct.isBeingMoved || !struct.relocatePath || struct.moveTargetX === undefined || struct.moveTargetY === undefined) {
        continue;
      }

      const path = struct.relocatePath;
      // relocatePathIndex round-trips through localStorage, so clamp both ends
      // rather than only the top: a negative index yields undefined and blows up below.
      let pathIdx = struct.relocatePathIndex ?? 0;
      pathIdx = Math.max(0, Math.min(pathIdx, path.length - 1));

      const targetWp = path[pathIdx];
      const dx = targetWp.x - struct.x;
      const dy = targetWp.y - struct.y;
      const dist = Math.hypot(dx, dy);

      const isLastWp = pathIdx >= path.length - 1;
      const threshold = isLastWp ? 6 : 24;

      if (dist < threshold) {
        if (!isLastWp) {
          struct.relocatePathIndex = pathIdx + 1;
        } else {
          // ARRIVED AT NEW SITE!
          struct.x = struct.moveTargetX;
          struct.y = struct.moveTargetY;
          struct.isBeingMoved = false;
          struct.relocatePath = undefined;
          struct.relocatePathIndex = undefined;
          struct.moveTargetX = undefined;
          struct.moveTargetY = undefined;

          // Free assigned engineers and reposition them next to the building
          if (struct.assignedEngineers) {
            const engineers = this.units.filter(u => struct.assignedEngineers?.includes(u.id));
            engineers.forEach((e, idx) => {
              e.assignedStructureId = undefined;
              e.engineerAction = 'idle';
              const angle = (idx / Math.max(1, engineers.length)) * Math.PI * 2;
              e.x = struct.x + Math.cos(angle) * (struct.width * 0.65);
              e.y = struct.y + Math.sin(angle) * (struct.height * 0.65);
              e.targetX = undefined;
              e.targetY = undefined;
              e.isMoving = false;
            });
            struct.assignedEngineers = undefined;
          }

          // Register new footprint in pathfinder
          this.pathfinder.updateStructure(struct, true);

          // Hydraulic anchor sound and dust shockwave
          sound.playBuildingRelocationComplete();
          if (struct.isPlayer) {
            sound.speakEVA('Estructura reubicada y operativa.');
          }

          // Dust shockwave
          for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            this.particles.push({
              id: `anchor_${Date.now()}_${i}`,
              type: 'smoke',
              x: struct.x + Math.cos(a) * (struct.width * 0.4),
              y: struct.y + Math.sin(a) * (struct.height * 0.4),
              vx: Math.cos(a) * 45,
              vy: Math.sin(a) * 45 - 10,
              size: 5,
              maxSize: 18,
              color: '#78716c',
              alpha: 0.8,
              life: 0,
              maxLife: 0.5,
              drag: 0.92,
            });
          }

          this.notifyUI();
          continue;
        }
      }

      // Move toward waypoint
      const speed = struct.moveSpeed || 48;
      const moveDist = Math.min(dist, speed * dt);
      const moveX = (dx / dist) * moveDist;
      const moveY = (dy / dist) * moveDist;

      struct.x += moveX;
      struct.y += moveY;

      // Keep assigned escort engineers moving along in formation around the transport rig
      if (struct.assignedEngineers) {
        const engineers = this.units.filter(u => struct.assignedEngineers?.includes(u.id));
        engineers.forEach((e, idx) => {
          const escortAngle = (idx / Math.max(1, engineers.length)) * Math.PI * 2;
          const escortDist = Math.max(struct.width, struct.height) * 0.58;
          const desiredX = struct.x + Math.cos(escortAngle) * escortDist;
          const desiredY = struct.y + Math.sin(escortAngle) * escortDist;
          e.x += (desiredX - e.x) * Math.min(1, dt * 10);
          e.y += (desiredY - e.y) * Math.min(1, dt * 10);
          e.rotation = Math.atan2(dy, dx);
          e.isMoving = true;
        });
      }

      // Transport crawler dust effects
      if (Math.random() < 0.25) {
        this.particles.push({
          id: `crawl_${Date.now()}_${Math.random()}`,
          type: 'smoke',
          x: struct.x + (Math.random() - 0.5) * struct.width * 0.6,
          y: struct.y + struct.height * 0.35,
          vx: (Math.random() - 0.5) * 15,
          vy: -10 - Math.random() * 10,
          size: 4,
          maxSize: 14,
          color: '#a8a29e',
          alpha: 0.6,
          life: 0,
          maxLife: 0.4,
          drag: 0.92,
        });
      }
    }
  }

  public getAvailableLevel2EngineersCount(): number {
    return this.units.filter(u => u.isPlayer && u.type === 'engineer' && (u.veterancy || 0) >= 2 && !u.assignedStructureId).length;
  }

  public getTotalPlayerEngineersCount(): number {
    return this.units.filter(u => u.isPlayer && u.type === 'engineer').length;
  }

  public isRelocationTargetValid(struct: StructureInstance, targetX: number, targetY: number): boolean {
    const halfW = struct.width / 2;
    const halfH = struct.height / 2;
    if (targetX - halfW < 12 || targetX + halfW > this.currentMap.width - 12 ||
        targetY - halfH < 12 || targetY + halfH > this.currentMap.height - 12) {
      return false;
    }

    for (const other of this.structures) {
      if (other.id !== struct.id && other.hp > 0) {
        if (Math.abs(other.x - targetX) < (struct.width + other.width) * 0.48 &&
            Math.abs(other.y - targetY) < (struct.height + other.height) * 0.48) {
          return false;
        }
      }
    }
    return true;
  }

  public startStructureRelocation(structId: string): boolean {
    const struct = this.structures.find(s => s.id === structId);
    if (!struct || !struct.isPlayer || struct.hp <= 0 || struct.isBeingMoved) return false;
    const req = getRequiredEngineersToMove(struct.type);
    const avail = this.getAvailableLevel2EngineersCount();
    if (avail < req) {
      sound.speakEVA(`Se requieren ${req} ingenieros Nivel 2 (Élite) para trasladar esta estructura. Tienes ${avail}.`);
      return false;
    }
    this.relocatingStructure = struct;
    this.placementStructure = null;
    this.superweaponTargeting = false;
    sound.speakEVA('Seleccione nueva ubicación para la estructura.');
    sound.playClick();
    this.notifyUI();
    return true;
  }

  public confirmStructureRelocation(targetX: number, targetY: number): boolean {
    if (!this.relocatingStructure) return false;
    const structId = this.relocatingStructure.id;
    const success = this.orderRelocateStructure(structId, targetX, targetY);
    if (success) {
      this.relocatingStructure = null;
    }
    return success;
  }

  public cancelStructureRelocation() {
    this.relocatingStructure = null;
    this.notifyUI();
  }

  /**
   * Commands available friendly engineers to move to and repair a damaged friendly structure.
   */
  public commandRepairStructure(structId: string): boolean {
    const struct = this.structures.find(s => s.id === structId);
    if (!struct || !struct.isPlayer || struct.hp >= struct.maxHp) return false;

    // Find closest idle or non-busy friendly engineer
    const engineers = this.units.filter(u => u.isPlayer && u.type === 'engineer' && !u.assignedStructureId);
    if (engineers.length === 0) {
      sound.speakEVA('No hay ingenieros disponibles. Entrena uno en los Barracones.');
      return false;
    }

    engineers.sort((a, b) => Math.hypot(a.x - struct.x, a.y - struct.y) - Math.hypot(b.x - struct.x, b.y - struct.y));
    const chosen = engineers[0];
    chosen.repairTargetId = struct.id;
    chosen.captureTargetId = undefined;
    chosen.engineerAction = 'repairing';
    chosen.targetX = struct.x;
    chosen.targetY = struct.y;
    chosen.isMoving = true;
    chosen.path = undefined;
    sound.speakEVA('Ingeniero asignado a reparación.');
    sound.playCommandAck();
    this.notifyUI();
    return true;
  }

  public selectStructure(struct: StructureInstance | null) {
    this.selectedStructureId = struct ? struct.id : null;
    if (struct) {
      this.units.forEach(u => u.selected = false);
      sound.playUnitSelect();
    }
    this.notifyUI();
  }

  private moveUnitToward(unit: UnitInstance, tx: number, ty: number, dt: number) {
    let steerX = tx;
    let steerY = ty;

    if (!unit.isAir) {
      const distToGoal = Math.hypot(tx - unit.x, ty - unit.y);
      if (distToGoal < 7) {
        unit.isMoving = false;
        unit.currentSpeed = 0;
        unit.path = undefined;
        return;
      }

      // Check if A* path needs recomputing
      const needNewPath = !unit.path ||
        unit.lastPathTargetX === undefined ||
        unit.lastPathTargetY === undefined ||
        Math.hypot(tx - unit.lastPathTargetX, ty - unit.lastPathTargetY) > 36;

      const pathOpts = (unit.type === 'harvester' || unit.type === 'engineer') ? { isHarvester: true, isPlayer: unit.isPlayer } : undefined;

      if (needNewPath) {
        if (this.pathfinder.hasLineOfSight(unit.x, unit.y, tx, ty, pathOpts)) {
          unit.path = [{ x: tx, y: ty }];
          unit.pathIndex = 0;
        } else {
          unit.path = this.pathfinder.findPath(unit.x, unit.y, tx, ty, pathOpts);
          unit.pathIndex = 0;
        }
        unit.lastPathTargetX = tx;
        unit.lastPathTargetY = ty;
      }

      // Advance through waypoints
      if (unit.path && unit.path.length > 0) {
        if (unit.pathIndex === undefined || unit.pathIndex >= unit.path.length) {
          unit.pathIndex = 0;
        }

        let currentWP = unit.path[unit.pathIndex];
        const isLastWP = unit.pathIndex >= unit.path.length - 1;

        // Dynamic lookahead shortcutting: if next waypoint has clear line-of-sight, skip ahead directly!
        if (!isLastWP && unit.path.length > unit.pathIndex + 1) {
          const nextWP = unit.path[unit.pathIndex + 1];
          if (this.pathfinder.hasLineOfSight(unit.x, unit.y, nextWP.x, nextWP.y, pathOpts)) {
            unit.pathIndex++;
            currentWP = unit.path[unit.pathIndex];
          }
        }

        // Re-evaluate isLastWP after any lookahead jump so we never index past the end.
        const isLastWPAfter = unit.pathIndex >= unit.path.length - 1;
        const wpDist = Math.hypot(currentWP.x - unit.x, currentWP.y - unit.y);
        const wpThreshold = isLastWPAfter ? 8 : 22;

        if (wpDist < wpThreshold) {
          if (isLastWPAfter) {
            unit.isMoving = false;
            unit.currentSpeed = 0;
            unit.path = undefined;
            return;
          }
          // Safe by definition: isLastWPAfter false means pathIndex < path.length - 1.
          unit.pathIndex++;
          currentWP = unit.path[unit.pathIndex];
        }

        steerX = currentWP.x;
        steerY = currentWP.y;
      }
    }

    const dx = steerX - unit.x;
    const dy = steerY - unit.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) {
      unit.isMoving = false;
      unit.currentSpeed = 0;
      return;
    }

    // Normalized direction vector toward steering target
    let vx = dx / dist;
    let vy = dy / dist;

    // Dynamic obstacle avoidance & local steering around other units to avoid rigidity/blocking
    if (!unit.isAir) {
      let avoidX = 0;
      let avoidY = 0;
      const sensorRange = unit.size * 1.8;

      for (const other of this.units) {
        if (other.id === unit.id || other.isAir) continue;
        const odx = unit.x - other.x;
        const ody = unit.y - other.y;
        const odist = Math.hypot(odx, ody);

        if (odist > 0.001 && odist < sensorRange) {
          // Check if obstacle is ahead in our movement cone
          const dot = vx * (-odx / odist) + vy * (-ody / odist);
          if (dot > 0.2) {
            // Perpendicular steering push
            const perpX = -ody / odist;
            const perpY = odx / odist;
            const side = (vx * perpX + vy * perpY) >= 0 ? 1 : -1;
            const strength = (1 - odist / sensorRange) * 0.7;
            avoidX += perpX * side * strength;
            avoidY += perpY * side * strength;
          }
        }
      }

      if (avoidX !== 0 || avoidY !== 0) {
        vx = vx * 0.75 + avoidX * 0.45;
        vy = vy * 0.75 + avoidY * 0.45;
        const newMag = Math.hypot(vx, vy);
        if (newMag > 0.001) {
          vx /= newMag;
          vy /= newMag;
        }
      }
    }

    const targetAngle = Math.atan2(vy, vx);

    // Smooth turn rate: shortest path on circle
    let angleDiff = ((targetAngle - unit.rotation + Math.PI) % (Math.PI * 2)) - Math.PI;

    // Dynamic turn rate based on vehicle agility
    let maxTurnSpeed = 7.0;
    if (unit.type === 'harvester') maxTurnSpeed = 4.2;
    else if (unit.type === 'walker') maxTurnSpeed = 3.8;
    else if (unit.type === 'tank') maxTurnSpeed = 6.0;
    else if (unit.type === 'apc') maxTurnSpeed = 8.5;
    else if (unit.isAir) maxTurnSpeed = 9.0;
    else if (unit.type === 'rifleman' || unit.type === 'missile' || unit.type === 'zone_trooper') maxTurnSpeed = 11.0;

    const turnStep = maxTurnSpeed * dt;
    if (Math.abs(angleDiff) <= turnStep) {
      unit.rotation = targetAngle;
    } else {
      unit.rotation += Math.sign(angleDiff) * turnStep;
    }

    // Aircraft roll/banking into turns
    if (unit.isAir) {
      const bankTarget = Math.max(-0.45, Math.min(0.45, angleDiff * 1.5));
      unit.bankAngle = (unit.bankAngle || 0) + (bankTarget - (unit.bankAngle || 0)) * Math.min(1, dt * 10);
    }

    // Facing factor: vehicle slows down slightly if turning sharp corners (tank pivot physics)
    const facingFactor = Math.max(0.25, Math.cos(angleDiff));

    // Snappy Acceleration & Momentum
    const vetRank = unit.veterancy || 0;
    const speedBonus = vetRank === 2 ? 1.15 : vetRank >= 3 ? 1.25 : 1.0;

    // Dynamic Weather Movement Speed Modifier
    // Rain dampens/cools engines and slicks tracks: +20% movement speed for ground units
    // Severe Ion Storm turbulence reduces aircraft velocity by 15%
    let weatherSpeedMod = 1.0;
    if (this.weather.rainIntensity > 0.15 && !unit.isAir) {
      weatherSpeedMod += 0.20 * this.weather.rainIntensity;
    } else if (this.weather.stormIntensity > 0.35 && unit.isAir) {
      weatherSpeedMod -= 0.15 * this.weather.stormIntensity;
    }

    const topSpeed = unit.speed * speedBonus * weatherSpeedMod;
    const targetSpeed = topSpeed * facingFactor;
    unit.currentSpeed = unit.currentSpeed ?? 0;
    const accel = 520; // px/s^2 for responsive movement

    if (unit.currentSpeed < targetSpeed) {
      unit.currentSpeed = Math.min(targetSpeed, unit.currentSpeed + accel * dt);
    } else {
      unit.currentSpeed = Math.max(targetSpeed, unit.currentSpeed - accel * 1.8 * dt);
    }

    const step = unit.currentSpeed * dt;
    unit.x += Math.cos(unit.rotation) * step;
    unit.y += Math.sin(unit.rotation) * step;
    unit.isMoving = true;

    // Stuck timer check: if commanded to move but barely progressing, recompute path
    if (unit.currentSpeed < 10) {
      unit.stuckTimer = (unit.stuckTimer || 0) + dt;
      if (unit.stuckTimer > 0.9) {
        unit.path = undefined; // Trigger fresh search
        unit.stuckTimer = 0;
      }
    } else {
      unit.stuckTimer = 0;
    }

    // Tread and walking animation cycles
    unit.treadOffset = ((unit.treadOffset || 0) + step * 0.4) % 20;
    unit.walkPhase = ((unit.walkPhase || 0) + step * 0.16) % (Math.PI * 2);

    // Tread dust and exhaust particles
    if (!unit.isAir && unit.currentSpeed > 25 && Math.random() < 0.25) {
      const rearDist = unit.size * 0.45;
      const rearX = unit.x - Math.cos(unit.rotation) * rearDist;
      const rearY = unit.y - Math.sin(unit.rotation) * rearDist;
      this.particles.push({
        id: `dust_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: rearX + (Math.random() - 0.5) * 8,
        y: rearY + (Math.random() - 0.5) * 8,
        vx: -Math.cos(unit.rotation) * 14 + (Math.random() - 0.5) * 8,
        vy: -Math.sin(unit.rotation) * 14 - 6,
        size: 3 + Math.random() * 2,
        maxSize: 9 + Math.random() * 4,
        color: '#78716c',
        alpha: 0.35,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.2,
        drag: 0.92,
      });

      // Ground tread marks
      if ((unit.type === 'tank' || unit.type === 'harvester') && Math.random() < 0.28) {
        this.addTreadMark(unit.x, unit.y, unit.rotation, unit.size * 0.75);
      }
    }

    // Aircraft thruster afterburner flare
    if (unit.isAir && Math.random() < 0.4) {
      const rearDist = unit.size * 0.45;
      const rearX = unit.x - Math.cos(unit.rotation) * rearDist;
      const rearY = unit.y - Math.sin(unit.rotation) * rearDist;
      this.particles.push({
        id: `flare_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: rearX,
        y: rearY,
        vx: -Math.cos(unit.rotation) * 38 + (Math.random() - 0.5) * 10,
        vy: -Math.sin(unit.rotation) * 38 + (Math.random() - 0.5) * 10,
        size: 2.5,
        maxSize: 1,
        color: unit.faction === 'gdi' ? '#38bdf8' : '#f97316',
        alpha: 0.85,
        life: 0,
        maxLife: 0.16,
      });
    }

    // Bounds check
    unit.x = Math.max(30, Math.min(this.currentMap.width - 30, unit.x));
    unit.y = Math.max(30, Math.min(this.currentMap.height - 30, unit.y));
  }

  private tryUnitFire(unit: UnitInstance, target: { x: number; y: number; hp: number; isPlayer: boolean }) {
    const now = Date.now() / 1000;
    const vetRank = unit.veterancy || 0;

    // Dynamic Weather Combat Modifiers:
    // 1. Rain engine/barrel liquid cooling: +10% rate of fire / faster reload
    const rainRofBonus = this.weather.rainIntensity > 0.15 ? (1.0 + 0.10 * this.weather.rainIntensity) : 1.0;
    // Veterancy Fire Rate Bonus: Rank 1 +15%, Rank 2 +30%, Rank 3 +50%
    const rofMultiplier = (vetRank === 1 ? 1.15 : vetRank === 2 ? 1.30 : vetRank >= 3 ? 1.50 : 1.0) * rainRofBonus;
    const reloadTime = 1 / (unit.rateOfFire * rofMultiplier);
    if (unit.lastFired && now - unit.lastFired < reloadTime) return;
    unit.lastFired = now;
    unit.lastCombatTime = now;

    // Trigger cannon recoil
    unit.recoil = 1.0;

    // Barrel muzzle flash & sparks
    const gunAngle = unit.turretRotation ?? unit.rotation;
    const barrelLen = unit.size * 0.72;
    const muzzleX = unit.x + Math.cos(gunAngle) * barrelLen;
    const muzzleY = unit.y + Math.sin(gunAngle) * barrelLen;

    const isElectricalOrLaser = unit.type === 'zone_trooper' || unit.type === 'walker' || unit.damageType === 'laser';
    const isStormEnergized = this.weather.stormIntensity > 0.15 && isElectricalOrLaser;

    const muzColor = isStormEnergized
      ? '#38bdf8'
      : unit.damageType === 'laser'
        ? (unit.faction === 'gdi' ? '#38bdf8' : '#ef4444')
        : '#fef08a';

    this.particles.push({
      id: `muz_${Date.now()}_${Math.random()}`,
      type: 'explosion',
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(gunAngle) * 50,
      vy: Math.sin(gunAngle) * 50,
      size: unit.damageType === 'cannon' ? 7 : 4,
      maxSize: unit.damageType === 'cannon' ? 16 : 9,
      color: muzColor,
      alpha: 1.0,
      life: 0,
      maxLife: 0.12,
    });

    // Storm energized ionization arcs on muzzle for electrical/laser units
    if (isStormEnergized) {
      for (let i = 0; i < 6; i++) {
        const spkAngle = gunAngle + (Math.random() - 0.5) * 1.2;
        const spkSpeed = 120 + Math.random() * 160;
        this.particles.push({
          id: `storm_muz_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(spkAngle) * spkSpeed,
          vy: Math.sin(spkAngle) * spkSpeed,
          size: 2.8,
          maxSize: 1,
          color: '#38bdf8',
          alpha: 1.0,
          life: 0,
          maxLife: 0.18,
          drag: 0.88,
        });
      }
    }

    // Muzzle sparks for kinetic cannons and weapons
    if (unit.damageType === 'cannon' || unit.damageType === 'bullet') {
      for (let i = 0; i < 4; i++) {
        const spkAngle = gunAngle + (Math.random() - 0.5) * 0.7;
        const spkSpeed = 90 + Math.random() * 140;
        this.particles.push({
          id: `muz_spk_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(spkAngle) * spkSpeed,
          vy: Math.sin(spkAngle) * spkSpeed,
          size: 2,
          maxSize: 1,
          color: '#fef08a',
          alpha: 1.0,
          life: 0,
          maxLife: 0.12,
          drag: 0.88,
        });
      }
    }

    // 2. Ion Storm Electrical & Beam Damage Bonus (+35% for electrical / laser units)
    let weatherDmgMod = 1.0;
    if (isStormEnergized) {
      weatherDmgMod += 0.35 * this.weather.stormIntensity;
    }

    // Veterancy Damage Bonus: Rank 1 +15%, Rank 2 +30%, Rank 3 +50%
    const dmgMultiplier = vetRank === 1 ? 1.15 : vetRank === 2 ? 1.30 : vetRank >= 3 ? 1.50 : 1.0;
    const finalDamage = Math.round(unit.damage * dmgMultiplier * weatherDmgMod);

    // Spawn Projectile
    const pColor = unit.damageType === 'laser' 
      ? (unit.faction === 'gdi' ? '#38bdf8' : '#ef4444')
      : unit.damageType === 'rocket' ? '#f59e0b' : '#fbbf24';

    this.projectiles.push({
      id: `proj_${Date.now()}_${Math.random()}`,
      type: unit.damageType === 'laser' ? 'laser' : unit.damageType === 'rocket' ? 'rocket' : unit.damageType === 'cannon' ? 'cannon' : 'bullet',
      startX: muzzleX,
      startY: muzzleY,
      x: muzzleX,
      y: muzzleY,
      targetX: target.x,
      targetY: target.y,
      targetUnitId: (target as UnitInstance).id,
      sourceUnitId: unit.id,
      speed: unit.damageType === 'laser' ? 2200 : unit.damageType === 'rocket' ? 340 : 480,
      damage: finalDamage,
      splashRadius: unit.damageType === 'cannon' ? 35 : unit.damageType === 'rocket' ? 25 : 0,
      isPlayer: unit.isPlayer,
      color: pColor,
      createdAt: Date.now(),
      duration: unit.damageType === 'laser' ? 120 : undefined,
    });

    // Spatial Combat Sound FX
    if (unit.isPlayer || this.isPositionVisible(unit.x, unit.y)) {
      if (unit.damageType === 'cannon') sound.playSpatialCannonFire(unit.x, unit.y);
      else if (unit.damageType === 'rocket') sound.playSpatialMissileLaunch(unit.x, unit.y);
      else if (unit.damageType === 'laser') sound.playSpatialLaserFire(unit.x, unit.y);
      else sound.playSpatialRifleFire(unit.x, unit.y);
    }
  }

  private updateStructures(dt: number) {
    // Process mobile structures relocating with Level 2 engineers
    this.updateRelocatingStructures(dt);

    const now = Date.now() / 1000;
    for (const struct of this.structures) {
      // Persistent health damage VFX for structures
      this.updateDamagedStructureSmoke(struct, dt);

      // Passive out-of-combat health regeneration for Elite and Heroic structures
      this.updatePassiveStructureVeterancyRegeneration(struct, dt);

      // Captured Structure Special Resource & Tech Extraction
      if (struct.isCaptured && struct.isPlayer) {
        struct.capturedTimer = (struct.capturedTimer || 0) + dt;

        // Captured Refinery: +150 credits every 6s with Tiberium harvesting pulse
        if (struct.type === 'refinery' && struct.capturedTimer >= 6.0) {
          struct.capturedTimer = 0;
          this.playerCredits += 150;
          this.matchTiberiumHarvested += 150;
          this.particles.push({
            id: `siphon_${Date.now()}_${Math.random()}`,
            type: 'tiberium_spore',
            x: struct.x + (Math.random() - 0.5) * 24,
            y: struct.y - struct.height * 0.45,
            vx: 0,
            vy: -24,
            size: 3,
            maxSize: 6,
            color: '#22c55e',
            alpha: 1.0,
            life: 0,
            maxLife: 1.2,
            drag: 0.96,
          });
        }

        // Captured Tech Lab: Military research data siphoning (+100 credits every 10s)
        if (struct.type === 'techlab' && struct.capturedTimer >= 10.0) {
          struct.capturedTimer = 0;
          this.playerCredits += 100;
          this.matchTiberiumHarvested += 100;
          this.particles.push({
            id: `techsiphon_${Date.now()}_${Math.random()}`,
            type: 'spark',
            x: struct.x,
            y: struct.y - struct.height * 0.45,
            vx: (Math.random() - 0.5) * 15,
            vy: -20,
            size: 2.5,
            maxSize: 5,
            color: '#38bdf8',
            alpha: 1.0,
            life: 0,
            maxLife: 1.0,
            drag: 0.95,
          });
        }
      }

      const def = STRUCTURE_DEFS[struct.type];

      // Defenses with weapons (turrets) or occupied captured structures with engineer garrison rifle ports
      const hasStandardWeapon = !!def.weapon;
      const isOccupiedGarrison = struct.isCaptured && struct.isPlayer && !hasStandardWeapon;

      if (!hasStandardWeapon && !isOccupiedGarrison) continue;

      const rateMult = struct.isCaptured ? 1.25 : 1.0;
      const baseRof = def.weapon ? def.weapon.rateOfFire : 0.8;
      const reloadTime = (1 / (baseRof * rateMult));
      if (struct.lastFired && now - struct.lastFired < reloadTime) continue;

      // Find nearest enemy unit
      let nearestTarget: UnitInstance | null = null;
      let minDist = def.weapon ? def.weapon.range : 145; // Garrison rifle port range

      for (const u of this.units) {
        if (u.isPlayer !== struct.isPlayer && u.hp > 0) {
          if (u.isAir && (!def.weapon || !def.weapon.targetsAir)) continue;
          if (struct.isPlayer && !this.isPositionVisible(u.x, u.y)) continue;
          const dist = Math.hypot(u.x - struct.x, u.y - struct.y);
          if (dist < minDist) {
            minDist = dist;
            nearestTarget = u;
          }
        }
      }

      if (nearestTarget) {
        struct.lastFired = now;
        const aimAngle = Math.atan2(nearestTarget.y - struct.y, nearestTarget.x - struct.x);
        const barrelLen = Math.max(struct.width, struct.height) * 0.38;
        const muzzleX = struct.x + Math.cos(aimAngle) * barrelLen;
        const muzzleY = struct.y + Math.sin(aimAngle) * barrelLen;

        if (isOccupiedGarrison) {
          // Engineer defense garrison rifle burst from occupied building
          sound.playSpatialRifleFire(struct.x, struct.y);
          this.particles.push({
            id: `gar_muz_${Date.now()}_${Math.random()}`,
            type: 'muzzle',
            x: muzzleX,
            y: muzzleY,
            vx: Math.cos(aimAngle) * 35,
            vy: Math.sin(aimAngle) * 35,
            size: 4,
            maxSize: 9,
            color: '#38bdf8',
            alpha: 1.0,
            life: 0,
            maxLife: 0.08,
          });

          this.projectiles.push({
            id: `gar_proj_${Date.now()}`,
            type: 'bullet',
            startX: muzzleX,
            startY: muzzleY,
            x: muzzleX,
            y: muzzleY,
            targetX: nearestTarget.x,
            targetY: nearestTarget.y,
            targetUnitId: nearestTarget.id,
            speed: 460,
            damage: 28,
            splashRadius: 0,
            isPlayer: struct.isPlayer,
            color: '#38bdf8',
            createdAt: Date.now(),
          });
          continue;
        }

        if (!def.weapon) continue;

        const isLaser = def.weapon.type === 'laser';
        const color = isLaser ? '#ef4444' : def.weapon.type === 'missile' ? '#f59e0b' : '#fbbf24';

        // Muzzle flash on defense turret
        this.particles.push({
          id: `turret_muz_${Date.now()}_${Math.random()}`,
          type: 'explosion',
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(aimAngle) * 45,
          vy: Math.sin(aimAngle) * 45,
          size: isLaser ? 6 : 8,
          maxSize: isLaser ? 14 : 18,
          color: isLaser ? '#ef4444' : '#fef08a',
          alpha: 1.0,
          life: 0,
          maxLife: 0.12,
        });

        const vetRank = struct.veterancy || 0;
        const vetDmgMultiplier = vetRank === 1 ? 1.15 : vetRank === 2 ? 1.30 : vetRank >= 3 ? 1.50 : 1.0;
        const isStormEnergized = this.weather.stormIntensity > 0.15 && (isLaser || struct.type === 'turret');
        const stormBonus = isStormEnergized ? (1.0 + 0.35 * this.weather.stormIntensity) : 1.0;
        const finalDamage = Math.round(def.weapon.damage * vetDmgMultiplier * stormBonus);

        this.projectiles.push({
          id: `turret_proj_${Date.now()}`,
          type: def.weapon.type === 'laser' ? 'laser' : def.weapon.type === 'missile' ? 'rocket' : 'bullet',
          startX: muzzleX,
          startY: muzzleY,
          x: muzzleX,
          y: muzzleY,
          targetX: nearestTarget.x,
          targetY: nearestTarget.y,
          targetUnitId: nearestTarget.id,
          sourceStructureId: struct.id,
          speed: isLaser ? 2200 : def.weapon.type === 'missile' ? 360 : 480,
          damage: finalDamage,
          splashRadius: def.weapon.type === 'missile' ? 30 : 0,
          isPlayer: struct.isPlayer,
          color,
          createdAt: Date.now(),
          duration: isLaser ? 130 : undefined,
        });

        struct.lastFired = now;
        struct.lastCombatTime = now;

        if (struct.isPlayer || this.isPositionVisible(struct.x, struct.y)) {
          if (def.weapon.type === 'missile') sound.playSpatialMissileLaunch(struct.x, struct.y);
          else if (def.weapon.type === 'laser') sound.playSpatialLaserFire(struct.x, struct.y);
          else sound.playSpatialCannonFire(struct.x, struct.y);
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    const remaining: Projectile[] = [];

    for (const p of this.projectiles) {
      if (p.type === 'laser') {
        // Laser is instant beam with duration
        const age = Date.now() - p.createdAt;
        if (age < (p.duration || 120)) {
          remaining.push(p);
        } else {
          // Apply damage once and trigger impact sparks
          this.applyDamageAt(p.targetX, p.targetY, p.damage, p.splashRadius, p.isPlayer, p.targetUnitId, p.sourceUnitId, p.sourceStructureId);
          this.spawnProjectileImpact(p, p.targetX, p.targetY);
        }
        continue;
      }

      if (p.type === 'ion' || p.type === 'nuke') {
        const age = Date.now() - p.createdAt;
        if (age < (p.duration || 2000)) {
          remaining.push(p);
        } else {
          // Superweapon impact!
          this.applyDamageAt(p.targetX, p.targetY, p.damage, p.splashRadius, p.isPlayer);
          this.spawnExplosion(p.targetX, p.targetY, true);
          sound.playSpatialExplosion(p.targetX, p.targetY, 'large');
        }
        continue;
      }

      // Move missile/shell
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step) {
        // Hit target!
        this.applyDamageAt(p.targetX, p.targetY, p.damage, p.splashRadius, p.isPlayer, p.targetUnitId, p.sourceUnitId, p.sourceStructureId);
        this.spawnProjectileImpact(p, p.targetX, p.targetY);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;

        // In-flight projectile particles (contrails & tracer sparks)
        if (p.type === 'rocket' && Math.random() < 0.65 && this.particles.length < 320) {
          // Lingering rocket exhaust smoke contrail
          this.particles.push({
            id: `r_trail_${Date.now()}_${Math.random()}`,
            type: 'smoke',
            x: p.x - (dx / dist) * 8 + (Math.random() - 0.5) * 3,
            y: p.y - (dy / dist) * 8 + (Math.random() - 0.5) * 3,
            vx: -(dx / dist) * 20 + (Math.random() - 0.5) * 8,
            vy: -(dy / dist) * 20 - 8 + (Math.random() - 0.5) * 8,
            size: 3 + Math.random() * 2,
            maxSize: 11 + Math.random() * 5,
            color: '#e2e8f0',
            alpha: 0.65,
            life: 0,
            maxLife: 0.45 + Math.random() * 0.25,
            drag: 0.93,
          });
        } else if (p.type === 'cannon' && Math.random() < 0.35 && this.particles.length < 320) {
          // Trailing propellant spark from tank shell sabot
          this.particles.push({
            id: `c_spk_${Date.now()}_${Math.random()}`,
            type: 'spark',
            x: p.x - (dx / dist) * 12,
            y: p.y - (dy / dist) * 12,
            vx: -(dx / dist) * 30 + (Math.random() - 0.5) * 20,
            vy: -(dy / dist) * 30 + (Math.random() - 0.5) * 20,
            size: 2,
            maxSize: 1,
            color: '#fbbf24',
            alpha: 0.9,
            life: 0,
            maxLife: 0.12,
            drag: 0.88,
          });
        }

        remaining.push(p);
      }
    }

    this.projectiles = remaining;
  }

  // --- PROJECTILE IMPACT SYSTEM ---
  private spawnProjectileImpact(p: Projectile, x: number, y: number) {
    const isDirectHit = !!p.targetUnitId || !!p.targetStructureId;

    if (p.type === 'cannon') {
      // 1. High-Velocity Kinetic Shell Impact & Armor Ricochet Sparks
      const sparkCount = isDirectHit ? 14 : 9;
      const incomingAngle = Math.atan2(p.targetY - p.startY, p.targetX - p.startX);
      const deflectAngle = incomingAngle + Math.PI;

      for (let i = 0; i < sparkCount; i++) {
        // Conical ricochet spray
        const sprAngle = deflectAngle + (Math.random() - 0.5) * 1.6;
        const sprSpeed = 100 + Math.random() * 240;
        this.particles.push({
          id: `imp_spk_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x,
          y,
          vx: Math.cos(sprAngle) * sprSpeed,
          vy: Math.sin(sprAngle) * sprSpeed - 15,
          size: 2.2 + Math.random() * 1.5,
          maxSize: 1,
          color: Math.random() < 0.35 ? '#ffffff' : Math.random() < 0.7 ? '#fde047' : '#f97316',
          alpha: 1.0,
          life: 0,
          maxLife: 0.22 + Math.random() * 0.2,
          drag: 0.89,
        });
      }

      // Flying armor shrapnel / stone chips
      for (let i = 0; i < 4; i++) {
        const shrapAngle = Math.random() * Math.PI * 2;
        const shrapSpeed = 60 + Math.random() * 120;
        this.particles.push({
          id: `imp_shrap_${Date.now()}_${Math.random()}`,
          type: 'debris',
          x,
          y,
          vx: Math.cos(shrapAngle) * shrapSpeed,
          vy: Math.sin(shrapAngle) * shrapSpeed - 25,
          size: 3 + Math.random() * 3,
          maxSize: 3 + Math.random() * 3,
          color: '#52525b',
          alpha: 1.0,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.3,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 15,
          drag: 0.91,
        });
      }

      // Kinetic dust shockwave ring
      this.particles.push({
        id: `imp_ring_${Date.now()}_${Math.random()}`,
        type: 'shockwave',
        x,
        y,
        vx: 0,
        vy: 0,
        size: 8,
        maxSize: 32,
        color: '#f59e0b',
        alpha: 0.8,
        life: 0,
        maxLife: 0.25,
      });

      // Blast core explosion
      this.spawnExplosion(x, y, true);
      this.addScorch(x, y, 18);
      this.screenShake = Math.max(this.screenShake, 2.5);
      sound.playSpatialExplosion(x, y, 'medium');

    } else if (p.type === 'rocket') {
      // 2. High-Explosive Rocket Detonation
      const sparkCount = 12;
      for (let i = 0; i < sparkCount; i++) {
        const sprAngle = Math.random() * Math.PI * 2;
        const sprSpeed = 90 + Math.random() * 190;
        this.particles.push({
          id: `r_spk_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x,
          y,
          vx: Math.cos(sprAngle) * sprSpeed,
          vy: Math.sin(sprAngle) * sprSpeed - 20,
          size: 2.5,
          maxSize: 1,
          color: Math.random() < 0.5 ? '#f97316' : '#ef4444',
          alpha: 1.0,
          life: 0,
          maxLife: 0.3 + Math.random() * 0.25,
          drag: 0.90,
        });
      }

      this.particles.push({
        id: `r_ring_${Date.now()}_${Math.random()}`,
        type: 'shockwave',
        x,
        y,
        vx: 0,
        vy: 0,
        size: 10,
        maxSize: 36,
        color: '#f97316',
        alpha: 0.85,
        life: 0,
        maxLife: 0.28,
      });

      this.spawnExplosion(x, y, true);
      this.addScorch(x, y, 20);
      this.screenShake = Math.max(this.screenShake, 3.0);
      sound.playSpatialExplosion(x, y, 'medium');

    } else if (p.type === 'laser') {
      // 3. Directed-Energy Plasma Splash
      const sparkColor = p.color;
      for (let i = 0; i < 10; i++) {
        const sprAngle = Math.random() * Math.PI * 2;
        const sprSpeed = 80 + Math.random() * 180;
        this.particles.push({
          id: `lz_spk_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x,
          y,
          vx: Math.cos(sprAngle) * sprSpeed,
          vy: Math.sin(sprAngle) * sprSpeed,
          size: 2.2,
          maxSize: 1,
          color: Math.random() < 0.3 ? '#ffffff' : sparkColor,
          alpha: 1.0,
          life: 0,
          maxLife: 0.2 + Math.random() * 0.2,
          drag: 0.88,
        });
      }

      // Glowing plasma burn flash
      this.particles.push({
        id: `lz_burn_${Date.now()}_${Math.random()}`,
        type: 'explosion',
        x,
        y,
        vx: 0,
        vy: 0,
        size: 5,
        maxSize: 16,
        color: sparkColor,
        alpha: 1.0,
        life: 0,
        maxLife: 0.18,
      });

    } else {
      // 4. Kinetic Bullet / Autocannon Impact
      const sparkCount = 6;
      for (let i = 0; i < sparkCount; i++) {
        const sprAngle = Math.random() * Math.PI * 2;
        const sprSpeed = 70 + Math.random() * 140;
        this.particles.push({
          id: `b_spk_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x,
          y,
          vx: Math.cos(sprAngle) * sprSpeed,
          vy: Math.sin(sprAngle) * sprSpeed - 10,
          size: 1.8,
          maxSize: 1,
          color: Math.random() < 0.4 ? '#ffffff' : '#fde047',
          alpha: 1.0,
          life: 0,
          maxLife: 0.16 + Math.random() * 0.14,
          drag: 0.88,
        });
      }

      // Micro smoke puff / pulverized dust
      this.particles.push({
        id: `b_dust_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: -15 - Math.random() * 10,
        size: 3,
        maxSize: 9,
        color: '#71717a',
        alpha: 0.6,
        life: 0,
        maxLife: 0.35,
        drag: 0.92,
      });
    }
  }

  private applyDamageAt(
    x: number, 
    y: number, 
    damage: number, 
    splashRadius: number, 
    isPlayer: boolean, 
    directUnitId?: string,
    sourceUnitId?: string,
    sourceStructureId?: string
  ) {
    const now = Date.now() / 1000;
    const killerId = sourceUnitId || sourceStructureId;

    if (sourceUnitId) {
      const srcU = this.units.find(o => o.id === sourceUnitId);
      if (srcU) srcU.lastCombatTime = now;
    }
    if (sourceStructureId) {
      const srcS = this.structures.find(o => o.id === sourceStructureId);
      if (srcS) srcS.lastCombatTime = now;
    }

    if (splashRadius <= 0 && directUnitId) {
      const u = this.units.find(o => o.id === directUnitId);
      if (u) {
        // Critical hit check: 20% base chance, or higher if high-damage weapon
        const isCritical = Math.random() < 0.20 || damage >= 65;
        const finalDamage = isCritical ? Math.round(damage * (damage >= 65 ? 1.0 : 1.35)) : Math.round(damage);
        u.hp -= finalDamage;
        u.lastCombatTime = now;
        this.spawnFloatingText(u.x, u.y - (u.size || 16) - 6, finalDamage, isCritical);
        if (u.hp <= 0) {
          this.onUnitDestroyed(u, killerId, sourceStructureId);
        } else if ((u.type === 'rifleman' || u.type === 'missile' || u.type === 'zone_trooper') && Math.random() < 0.45) {
          sound.playSpatialInfantryGrunt(u.x, u.y);
        }
      }
      return;
    }

    // Splash damage
    const radius = Math.max(splashRadius, 25);
    // Damage units
    this.units.forEach(u => {
      if (u.isPlayer !== isPlayer) {
        const d = Math.hypot(u.x - x, u.y - y);
        if (d <= radius) {
          const factor = 1 - (d / radius) * 0.5;
          const rawDamage = damage * factor;
          const isCritical = (d <= radius * 0.35 && Math.random() < 0.25) || rawDamage >= 80;
          const finalDamage = Math.max(1, Math.round(rawDamage * (isCritical && rawDamage < 80 ? 1.3 : 1.0)));
          u.hp -= finalDamage;
          u.lastCombatTime = now;
          this.spawnFloatingText(u.x, u.y - (u.size || 16) - 6, finalDamage, isCritical);
          if (u.hp <= 0) {
            this.onUnitDestroyed(u, killerId, sourceStructureId);
          } else if ((u.type === 'rifleman' || u.type === 'missile' || u.type === 'zone_trooper') && Math.random() < 0.35) {
            sound.playSpatialInfantryGrunt(u.x, u.y);
          }
        }
      }
    });

    // Damage structures
    this.structures.forEach(s => {
      if (s.isPlayer !== isPlayer) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= radius + Math.max(s.width, s.height) / 2) {
          const isCritical = Math.random() < 0.18 || damage >= 90;
          const finalDamage = Math.max(1, Math.round(damage * (isCritical && damage < 90 ? 1.25 : 1.0)));
          s.hp -= finalDamage;
          s.lastCombatTime = now;
          this.spawnFloatingText(s.x, s.y - s.height / 2 - 8, finalDamage, isCritical);
          if (s.hp <= 0) {
            this.onStructureDestroyed(s, killerId);
          }
        }
      }
    });
  }

  private onUnitDestroyed(unit: UnitInstance, killerId?: string, killerStructureId?: string) {
    this.createUnitExplosion(unit);
    this.units = this.units.filter(u => u.id !== unit.id);

    // Spatial Combat Audio: Infantry screams and vehicle explosions
    const isInfantry = unit.type === 'rifleman' || unit.type === 'missile' || unit.type === 'zone_trooper';
    if (isInfantry) {
      sound.playSpatialInfantryScream(unit.x, unit.y);
      sound.playSpatialExplosion(unit.x, unit.y, 'small');
    } else {
      sound.playSpatialExplosion(unit.x, unit.y, unit.size > 26 ? 'large' : 'medium');
    }

    if (unit.isPlayer) {
      if (unit.type === 'harvester') {
        sound.speakEVA('¡Alerta: Cosechador destruido!', true);
      } else {
        sound.speakEVA('Unidad perdida');
      }
    } else {
      this.matchKills++;
    }

    if (killerStructureId) {
      const killerStruct = this.structures.find(s => s.id === killerStructureId);
      if (killerStruct) {
        this.awardKillToStructure(killerStruct);
        return;
      }
    }

    if (killerId) {
      const killer = this.units.find(u => u.id === killerId);
      if (killer) {
        this.awardKillToUnit(killer);
      } else {
        const killerStruct = this.structures.find(s => s.id === killerId);
        if (killerStruct) {
          this.awardKillToStructure(killerStruct);
        }
      }
    }
  }

  private awardKillToStructure(struct: StructureInstance) {
    struct.kills = (struct.kills || 0) + 1;
    const oldRank = struct.veterancy || 0;
    let newRank = oldRank;
    if (struct.kills >= 12) {
      newRank = 3; // Heroic
    } else if (struct.kills >= 7) {
      newRank = 2; // Elite
    } else if (struct.kills >= 3) {
      newRank = 1; // Veteran
    }

    if (newRank > oldRank) {
      struct.veterancy = newRank;
      if (struct.isPlayer) {
        sound.playPromotion();
        const def = STRUCTURE_DEFS[struct.type];
        const rankName = newRank === 3 ? 'Heroico' : newRank === 2 ? 'Élite' : 'Veterano';
        sound.speakEVA(`¡${def?.name || 'Estructura'} ascendida a rango ${rankName}! Auto-regeneración táctica activada.`, true);
      }
    }
  }

  private onStructureDestroyed(struct: StructureInstance, killerId?: string) {
    this.createStructureExplosion(struct);
    this.structures = this.structures.filter(s => s.id !== struct.id);
    this.pathfinder.updateGrid(this.currentMap.terrainObstacles, this.structures);

    // Spatial structure destruction explosion
    sound.playSpatialExplosion(struct.x, struct.y, 'large');

    if (struct.isPlayer) {
      sound.speakEVA('Estructura destruida', true);
    } else {
      this.matchKills++;
    }

    if (killerId) {
      const killer = this.units.find(u => u.id === killerId);
      if (killer) {
        this.awardKillToUnit(killer);
      }
    }
  }

  private awardKillToUnit(unit: UnitInstance) {
    unit.kills = (unit.kills || 0) + 1;
    const oldRank = unit.veterancy || 0;
    let newRank = 0;
    if (unit.kills >= 12) {
      newRank = 3; // Heroic
    } else if (unit.kills >= 7) {
      newRank = 2; // Elite
    } else if (unit.kills >= 3) {
      newRank = 1; // Veteran
    }

    if (newRank > oldRank) {
      unit.veterancy = newRank;

      // Promotion visual flash & particle burst
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const spd = 60 + Math.random() * 40;
        this.particles.push({
          id: `promo_${Date.now()}_${i}`,
          type: 'spark',
          x: unit.x,
          y: unit.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          size: 4,
          maxSize: 1,
          color: newRank === 3 ? '#ef4444' : newRank === 2 ? '#eab308' : '#38bdf8',
          alpha: 1.0,
          life: 0,
          maxLife: 0.6,
          drag: 0.9,
        });
      }

      this.particles.push({
        id: `promo_ring_${Date.now()}`,
        type: 'shockwave',
        x: unit.x,
        y: unit.y,
        vx: 0,
        vy: 0,
        size: 10,
        maxSize: unit.size * 2.2,
        color: newRank === 3 ? '#ef4444' : newRank === 2 ? '#eab308' : '#38bdf8',
        alpha: 0.9,
        life: 0,
        maxLife: 0.45,
      });

      if (unit.isPlayer) {
        sound.playPromotion();
        const rankName = newRank === 3 ? 'Heroico' : newRank === 2 ? 'Élite' : 'Veterano';
        sound.speakEVA(`¡Unidad promovida a rango ${rankName}!`, true);
      }
      this.notifyUI();
    }
  }

  // --- PARTICLES & DESTRUCTION VFX SYSTEM ---
  public addScorch(x: number, y: number, radius: number) {
    this.scorches.push({
      id: `scorch_${Date.now()}_${Math.random()}`,
      x,
      y,
      radius,
      alpha: 0.75,
      maxAlpha: 0.75,
      life: 0,
      maxLife: 45, // Remains on battlefield for 45 seconds
    });
    // Keep max 60 scorches to prevent memory growth
    if (this.scorches.length > 60) {
      this.scorches.shift();
    }
  }

  public createUnitExplosion(unit: UnitInstance) {
    const isHeavy = unit.size > 22;
    const isAir = unit.isAir;

    // 1. Core explosion based on unit size
    this.spawnExplosion(unit.x, unit.y, isHeavy);

    // 2. Unit-specific particle nuances
    if (unit.type === 'harvester') {
      // Screen shake
      this.screenShake = Math.max(this.screenShake, 7);
      this.addScorch(unit.x, unit.y, 30);

      // If carrying Tiberium cargo, ruptured tank bursts volatile green/blue crystal spores
      const cargo = unit.tiberiumCargo || 0;
      const sporeCount = cargo > 0 ? 18 : 6;
      for (let i = 0; i < sporeCount; i++) {
        this.spawnSporeParticle(unit.x, unit.y, '#22c55e', 80 + Math.random() * 120);
      }
    } else if (unit.type === 'tank' || unit.type === 'walker' || unit.type === 'apc') {
      // Heavy armored vehicle: extra steel debris and thick diesel smoke
      this.screenShake = Math.max(this.screenShake, 6);
      this.addScorch(unit.x, unit.y, 26);

      // Flying burning armor plates
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 120;
        this.particles.push({
          id: `chunk_${Date.now()}_${Math.random()}`,
          type: 'debris',
          x: unit.x,
          y: unit.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 30,
          size: 4 + Math.random() * 4,
          maxSize: 4 + Math.random() * 4,
          color: Math.random() < 0.5 ? '#1f2937' : '#4b5563',
          alpha: 1.0,
          life: 0,
          maxLife: 0.8 + Math.random() * 0.6,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 16,
          drag: 0.92,
        });
      }
    } else if (isAir) {
      // Aircraft: mid-air detonation with trailing falling debris
      this.screenShake = Math.max(this.screenShake, 5);
      this.addScorch(unit.x, unit.y, 20);
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 100;
        this.particles.push({
          id: `air_deb_${Date.now()}_${Math.random()}`,
          type: 'debris',
          x: unit.x,
          y: unit.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd + 40,
          size: 3 + Math.random() * 3,
          maxSize: 3 + Math.random() * 3,
          color: '#f97316',
          alpha: 1.0,
          life: 0,
          maxLife: 0.9,
          drag: 0.94,
        });
      }
    } else {
      // Infantry squad
      this.addScorch(unit.x, unit.y, 14);
    }
  }

  public createStructureExplosion(struct: StructureInstance) {
    const halfW = struct.width / 2;
    const halfH = struct.height / 2;

    // 1. Central catastrophic explosion
    this.spawnExplosion(struct.x, struct.y, true);

    // 2. Heavy screen shake
    this.screenShake = Math.max(this.screenShake, 12);

    // 3. Persistent battleground scorch mark beneath structure
    this.addScorch(struct.x, struct.y, Math.max(struct.width, struct.height) * 0.65);

    // 4. Secondary staggered perimeter detonations along the building footprint
    const subExplosionCount = Math.min(6, Math.max(3, Math.floor((struct.width * struct.height) / 1000)));
    for (let i = 0; i < subExplosionCount; i++) {
      const offsetX = (Math.random() - 0.5) * struct.width * 0.75;
      const offsetY = (Math.random() - 0.5) * struct.height * 0.75;
      this.spawnExplosion(struct.x + offsetX, struct.y + offsetY, false);
    }

    // 5. Flying concrete and structural steel wreckage
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 200;
      this.particles.push({
        id: `struct_deb_${Date.now()}_${Math.random()}`,
        type: 'debris',
        x: struct.x + (Math.random() - 0.5) * halfW,
        y: struct.y + (Math.random() - 0.5) * halfH,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (40 + Math.random() * 40),
        size: 5 + Math.random() * 6,
        maxSize: 5 + Math.random() * 6,
        color: Math.random() < 0.4 ? '#18181b' : Math.random() < 0.7 ? '#44403c' : '#78716c',
        alpha: 1.0,
        life: 0,
        maxLife: 1.0 + Math.random() * 0.8,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
        drag: 0.93,
      });
    }

    // 6. Tall persistent smoke plumes rising from wreckage
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        id: `heavy_smoke_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: struct.x + (Math.random() - 0.5) * halfW,
        y: struct.y + (Math.random() - 0.5) * halfH,
        vx: (Math.random() - 0.5) * 20,
        vy: -25 - Math.random() * 35,
        size: 14 + Math.random() * 10,
        maxSize: 36 + Math.random() * 18,
        color: Math.random() < 0.5 ? '#1f2937' : '#111827',
        alpha: 0.85,
        life: 0,
        maxLife: 1.8 + Math.random() * 0.8,
        drag: 0.96,
      });
    }

    // 7. Special facility particle reactions
    if (struct.type === 'powerplant') {
      // Overloading reactor produces high-voltage blue electrical arc discharges
      for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 220;
        this.particles.push({
          id: `elec_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x: struct.x,
          y: struct.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2.5 + Math.random() * 2,
          maxSize: 1,
          color: Math.random() < 0.4 ? '#ffffff' : Math.random() < 0.7 ? '#38bdf8' : '#0284c7',
          alpha: 1.0,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.3,
          drag: 0.91,
        });
      }
    } else if (struct.type === 'refinery') {
      // Tiberium storage tanks rupture into emerald gas clouds
      for (let i = 0; i < 20; i++) {
        this.spawnSporeParticle(struct.x, struct.y, '#22c55e', 70 + Math.random() * 110);
      }
    } else if (struct.type === 'superweapon') {
      // Massive energy release shockwave
      this.screenShake = Math.max(this.screenShake, 16);
      this.particles.push({
        id: `super_ring_${Date.now()}`,
        type: 'shockwave',
        x: struct.x,
        y: struct.y,
        vx: 0,
        vy: 0,
        size: 15,
        maxSize: 150,
        color: struct.faction === 'gdi' ? '#38bdf8' : '#ef4444',
        alpha: 1.0,
        life: 0,
        maxLife: 0.65,
      });
    }
  }

  public spawnExplosion(x: number, y: number, large: boolean, colorOverride?: string) {
    // 1. Expanding Shockwave ring
    this.particles.push({
      id: `shock_${Date.now()}_${Math.random()}`,
      type: 'shockwave',
      x,
      y,
      vx: 0,
      vy: 0,
      size: large ? 10 : 5,
      maxSize: large ? 85 : 45,
      color: colorOverride || (large ? '#fed7aa' : '#fef08a'),
      alpha: 0.9,
      life: 0,
      maxLife: large ? 0.45 : 0.3,
    });

    // 2. Layered Core Fireballs (white center -> hot yellow -> orange -> crimson)
    const fireCount = large ? 20 : 10;
    const fireColors = ['#ffffff', '#fef08a', '#fbbf24', '#f97316', '#ef4444', '#dc2626'];
    for (let i = 0; i < fireCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * (large ? 160 : 80);
      const color = colorOverride || fireColors[Math.floor(Math.random() * fireColors.length)];
      const initialSize = large ? 12 + Math.random() * 12 : 6 + Math.random() * 6;
      const maxSize = large ? 28 + Math.random() * 16 : 14 + Math.random() * 8;
      this.particles.push({
        id: `p_fire_${Date.now()}_${Math.random()}`,
        type: 'explosion',
        x: x + (Math.random() - 0.5) * (large ? 16 : 6),
        y: y + (Math.random() - 0.5) * (large ? 16 : 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: initialSize,
        maxSize,
        color,
        alpha: 1.0,
        life: 0,
        maxLife: large ? 0.55 + Math.random() * 0.2 : 0.35 + Math.random() * 0.15,
        drag: 0.88,
      });
    }

    // 3. Rising Smoke Plumes
    const smokeCount = large ? 12 : 6;
    const smokeColors = ['#1f2937', '#374151', '#4b5563', '#111827'];
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * (large ? 65 : 30);
      const color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
      this.particles.push({
        id: `p_smoke_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: x + (Math.random() - 0.5) * (large ? 20 : 8),
        y: y + (Math.random() - 0.5) * (large ? 20 : 8),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (15 + Math.random() * 25), // upward buoyant draft
        size: large ? 10 + Math.random() * 8 : 6 + Math.random() * 4,
        maxSize: large ? 30 + Math.random() * 14 : 16 + Math.random() * 8,
        color,
        alpha: 0.75,
        life: 0,
        maxLife: large ? 1.2 + Math.random() * 0.5 : 0.7 + Math.random() * 0.4,
        drag: 0.94,
      });
    }

    // 4. Hot Flying Sparks / Embers
    const sparkCount = large ? 20 : 10;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * (large ? 220 : 120);
      this.particles.push({
        id: `p_spark_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 2,
        maxSize: 1,
        color: Math.random() < 0.3 ? '#ffffff' : Math.random() < 0.7 ? '#fde047' : '#f97316',
        alpha: 1.0,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.35,
        drag: 0.90,
      });
    }

    // 5. Flying Shrapnel / Debris
    const debrisCount = large ? 8 : 3;
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * (large ? 160 : 80);
      this.particles.push({
        id: `p_deb_${Date.now()}_${Math.random()}`,
        type: 'debris',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (20 + Math.random() * 30),
        size: 3 + Math.random() * 4,
        maxSize: 3 + Math.random() * 4,
        color: Math.random() < 0.5 ? '#374151' : '#78716c',
        alpha: 0.95,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.5,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
        drag: 0.92,
      });
    }
  }

  public spawnSporeParticle(x: number, y: number, color: string, speedOverride?: number) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedOverride !== undefined ? speedOverride : 15;
    this.particles.push({
      id: `spore_${Date.now()}_${Math.random()}`,
      type: 'tiberium_spore',
      x: x + (Math.random() * 20 - 10),
      y: y + (Math.random() * 20 - 10),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 15,
      size: 3 + Math.random() * 3,
      maxSize: 7,
      color,
      alpha: 0.85,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.5,
      drag: 0.93,
    });
  }

  // --- DAMAGED ENTITY PERSISTENT SMOKE & SPARK EFFECTS ---
  private updateDamagedUnitSmoke(unit: UnitInstance, dt: number) {
    if (unit.hp <= 0) return;
    const healthRatio = unit.hp / unit.maxHp;
    if (healthRatio >= 0.5) return; // Clean hull when healthy (> 50% HP)

    unit.smokeTimer = (unit.smokeTimer || 0) + dt;

    // Critical health (< 25% HP): rapid billowing soot + fiery combustion sparks
    // Damaged health (25% - 50% HP): steady dark grey smoke puffs
    const isCritical = healthRatio < 0.25;
    const interval = isCritical ? 0.08 : 0.18;

    if (unit.smokeTimer >= interval) {
      unit.smokeTimer = 0;

      // Particle safety ceiling to preserve solid 60 FPS
      if (this.particles.length > 320) return;

      let emitX = unit.x;
      let emitY = unit.y;
      let vx = 0;
      let vy = 0;

      if (unit.isAir) {
        // Trailing behind aircraft exhaust/fuselage
        const trailDist = unit.size * 0.45;
        const trailAngle = unit.rotation + Math.PI;
        emitX = unit.x + Math.cos(trailAngle) * trailDist + (Math.random() - 0.5) * 5;
        emitY = unit.y + Math.sin(trailAngle) * trailDist + (Math.random() - 0.5) * 5;

        // Trail drifts backward relative to aircraft speed + upward thermal drift
        const fwdSpeed = unit.currentSpeed || unit.speed;
        vx = -Math.cos(unit.rotation) * (fwdSpeed * 0.35) + (Math.random() - 0.5) * 10;
        vy = -Math.sin(unit.rotation) * (fwdSpeed * 0.35) - 14 + (Math.random() - 0.5) * 10;
      } else if (unit.type === 'rifleman' || unit.type === 'missile' || unit.type === 'zone_trooper') {
        // Infantry/Troopers: wisps from damaged powered combat armor
        emitX = unit.x + (Math.random() - 0.5) * (unit.size * 0.4);
        emitY = unit.y - unit.size * 0.25 + (Math.random() - 0.5) * 3;
        vx = (Math.random() - 0.5) * 8;
        vy = -18 - Math.random() * 14;
      } else {
        // Armored Vehicles (Tank, Harvester, APC, Walker): engine deck/rear hull
        const rearDist = unit.size * 0.35;
        const rearAngle = unit.rotation + Math.PI;
        emitX = unit.x + Math.cos(rearAngle) * rearDist + (Math.random() - 0.5) * (unit.size * 0.3);
        emitY = unit.y + Math.sin(rearAngle) * rearDist + (Math.random() - 0.5) * (unit.size * 0.3);

        const driftSpeed = unit.isMoving ? (unit.currentSpeed || unit.speed) * 0.25 : 0;
        vx = (Math.random() - 0.5) * 12 - Math.cos(unit.rotation) * driftSpeed;
        vy = -20 - Math.random() * 20 - Math.sin(unit.rotation) * driftSpeed;
      }

      // Dynamic smoke palette: pitch-black soot for critical, charcoal grey for damaged
      const smokeColors = isCritical 
        ? ['#09090b', '#18181b', '#111827', '#1f2937'] 
        : ['#374151', '#4b5563', '#6b7280', '#52525b'];
      const smokeColor = smokeColors[Math.floor(Math.random() * smokeColors.length)];

      const initialSize = isCritical ? 5 + Math.random() * 4 : 3 + Math.random() * 3;
      const maxSize = isCritical ? 18 + Math.random() * 8 : 10 + Math.random() * 5;
      const maxLife = isCritical ? 0.75 + Math.random() * 0.45 : 0.55 + Math.random() * 0.35;

      this.particles.push({
        id: `dmg_smoke_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: emitX,
        y: emitY,
        vx,
        vy,
        size: initialSize,
        maxSize,
        color: smokeColor,
        alpha: isCritical ? 0.82 : 0.55,
        life: 0,
        maxLife,
        drag: 0.94,
      });

      // If in critical condition (< 25% HP), spawn burning embers & sparks
      if (isCritical && Math.random() < 0.42) {
        const sparkColors = ['#f97316', '#ef4444', '#fde047', '#ffedd5'];
        this.particles.push({
          id: `dmg_spark_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x: emitX + (Math.random() - 0.5) * 4,
          y: emitY + (Math.random() - 0.5) * 4,
          vx: vx * 1.3 + (Math.random() - 0.5) * 45,
          vy: vy * 1.3 - Math.random() * 35,
          size: 2.2 + Math.random() * 1.5,
          maxSize: 1,
          color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
          alpha: 1.0,
          life: 0,
          maxLife: 0.22 + Math.random() * 0.18,
          drag: 0.88,
        });
      }
    }
  }

  private updateDamagedStructureSmoke(struct: StructureInstance, dt: number) {
    if (struct.hp <= 0) return;
    const healthRatio = struct.hp / struct.maxHp;
    if (healthRatio >= 0.5) return;

    struct.smokeTimer = (struct.smokeTimer || 0) + dt;
    const isCritical = healthRatio < 0.25;
    const interval = isCritical ? 0.12 : 0.26;

    if (struct.smokeTimer >= interval) {
      struct.smokeTimer = 0;
      if (this.particles.length > 320) return;

      const halfW = struct.width * 0.35;
      const halfH = struct.height * 0.35;
      const emitX = struct.x + (Math.random() - 0.5) * halfW * 2;
      const emitY = struct.y + (Math.random() - 0.5) * halfH * 2;

      const smokeColors = isCritical 
        ? ['#0f172a', '#18181b', '#111827'] 
        : ['#334155', '#475569', '#64748b'];
      const smokeColor = smokeColors[Math.floor(Math.random() * smokeColors.length)];

      this.particles.push({
        id: `s_smoke_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: emitX,
        y: emitY,
        vx: (Math.random() - 0.5) * 16,
        vy: -22 - Math.random() * 22,
        size: isCritical ? 8 + Math.random() * 5 : 5 + Math.random() * 4,
        maxSize: isCritical ? 24 + Math.random() * 10 : 14 + Math.random() * 6,
        color: smokeColor,
        alpha: isCritical ? 0.75 : 0.5,
        life: 0,
        maxLife: isCritical ? 1.1 + Math.random() * 0.5 : 0.8 + Math.random() * 0.4,
        drag: 0.95,
      });

      if (isCritical && Math.random() < 0.35) {
        this.particles.push({
          id: `s_spark_${Date.now()}_${Math.random()}`,
          type: 'spark',
          x: emitX,
          y: emitY,
          vx: (Math.random() - 0.5) * 50,
          vy: -35 - Math.random() * 40,
          size: 2.5,
          maxSize: 1,
          color: Math.random() < 0.5 ? '#f97316' : '#ef4444',
          alpha: 1.0,
          life: 0,
          maxLife: 0.3,
          drag: 0.89,
        });
      }
    }
  }

  private updateParticles(dt: number) {
    const alive: ParticleEffect[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life < p.maxLife) {
        // Drag deceleration
        if (p.drag) {
          const dragFactor = Math.pow(p.drag, dt * 60);
          p.vx *= dragFactor;
          p.vy *= dragFactor;
        }

        // Custom physics by particle type
        if (p.type === 'smoke') {
          p.vy -= 14 * dt; // Smoke rises
          p.vx *= Math.pow(0.96, dt * 60);
        } else if (p.type === 'debris') {
          p.vy += 65 * dt; // Gravity pulls debris down
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Rotation
        if (p.vRot) {
          p.rotation = (p.rotation || 0) + p.vRot * dt;
        }

        // Dynamic size expansion for blast effects
        const progress = p.life / p.maxLife;
        if (p.type === 'explosion' || p.type === 'smoke' || p.type === 'shockwave') {
          p.size += (p.maxSize - p.size) * Math.min(1, dt * 5.5);
        }

        // Alpha fade out
        p.alpha = Math.max(0, 1 - progress);

        alive.push(p);
      }
    }
    this.particles = alive.length > 350 ? alive.slice(alive.length - 350) : alive;

    // Update ground scorch decals
    const aliveScorches: ScorchDecal[] = [];
    for (const s of this.scorches) {
      s.life += dt;
      if (s.life < s.maxLife) {
        // Slow fade out in the last 35% of its lifespan
        if (s.life > s.maxLife * 0.65) {
          const fadeProgress = (s.life - s.maxLife * 0.65) / (s.maxLife * 0.35);
          s.alpha = Math.max(0, s.maxAlpha * (1 - fadeProgress));
        }
        aliveScorches.push(s);
      }
    }
    this.scorches = aliveScorches;

    // Filter dead units/structures
    this.units = this.units.filter(u => u.hp > 0);
    this.structures = this.structures.filter(s => s.hp > 0);
  }

  // --- WEATHER & ATMOSPHERIC SYSTEM ---
  public setWeather(type: WeatherType) {
    if (this.weather.current === type && !this.weather.isTransitioning) return;
    this.weather.next = type;
    this.weather.isTransitioning = true;
    this.weather.transitionProgress = 0;
    this.weather.timer = this.weather.duration - this.weather.transitionDuration;
    this.notifyUI();
  }

  public cycleWeather() {
    const cycle: WeatherType[] = ['sunny', 'rain', 'ion_storm', 'fog'];
    const nextIdx = (cycle.indexOf(this.weather.current) + 1) % cycle.length;
    this.setWeather(cycle[nextIdx]);
  }

  private updateWeather(dt: number) {
    const cycle: WeatherType[] = ['sunny', 'rain', 'ion_storm', 'fog'];
    this.weather.timer += dt;

    // Phase transition detection
    const transStart = this.weather.duration - this.weather.transitionDuration;
    if (this.weather.timer >= transStart) {
      this.weather.isTransitioning = true;
      this.weather.transitionProgress = Math.min(1, (this.weather.timer - transStart) / this.weather.transitionDuration);
    } else {
      this.weather.isTransitioning = false;
      this.weather.transitionProgress = 0;
    }

    // Cycle complete -> switch current to next
    if (this.weather.timer >= this.weather.duration) {
      this.weather.current = this.weather.next;
      const currentIdx = cycle.indexOf(this.weather.current);
      this.weather.next = cycle[(currentIdx + 1) % cycle.length];
      this.weather.timer = 0;
      this.weather.isTransitioning = false;
      this.weather.transitionProgress = 0;

      // EVA weather notifications with tactical stat modifier announcements
      if (this.weather.current === 'rain') {
        sound.playRainStart();
        sound.speakEVA('Alerta meteorológica: Lluvia ácida de combate. Tracción +20% y enfriamiento de cañones activados.', true);
      } else if (this.weather.current === 'ion_storm') {
        sound.speakEVA('¡Alerta: Tormenta Iónica de Tiberio! Sobrecarga de armas electromagnéticas y láser (+35% daño).', true);
      } else if (this.weather.current === 'fog') {
        sound.speakEVA('Alerta: Frente de niebla densa reduciendo visibilidad táctica', true);
      } else if (this.weather.current === 'sunny') {
        sound.speakEVA('Condiciones atmosféricas despejadas');
      }

      this.notifyUI();
    }

    // Target visibility and atmospheric densities
    const getTargets = (w: WeatherType) => {
      switch (w) {
        case 'fog':
          return { vis: 0.70, fog: 0.90, storm: 0.0, rain: 0.0 };
        case 'rain':
          return { vis: 0.90, fog: 0.20, storm: 0.0, rain: 1.0 };
        case 'ion_storm':
          return { vis: 0.85, fog: 0.12, storm: 0.95, rain: 0.25 };
        case 'sunny':
        default:
          return { vis: 1.0, fog: 0.0, storm: 0.0, rain: 0.0 };
      }
    };

    const curTargets = getTargets(this.weather.current);
    const nextTargets = getTargets(this.weather.next);
    const blend = this.weather.transitionProgress;

    this.weather.visibilityMultiplier = curTargets.vis + (nextTargets.vis - curTargets.vis) * blend;
    this.weather.fogDensity = curTargets.fog + (nextTargets.fog - curTargets.fog) * blend;
    this.weather.stormIntensity = curTargets.storm + (nextTargets.storm - curTargets.storm) * blend;
    this.weather.rainIntensity = curTargets.rain + (nextTargets.rain - curTargets.rain) * blend;

    // Ion Storm Lightning Strikes
    if (this.weather.stormIntensity > 0.3) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.triggerLightningStrike();
        this.lightningTimer = 3.5 + Math.random() * 5.0;
      }
    }

    // Decay lightning flash
    if (this.weather.lightningFlash > 0) {
      this.weather.lightningFlash = Math.max(0, this.weather.lightningFlash - dt * 4.2);
    }

    // Update Lightning bolts
    const aliveBolts: LightningBolt[] = [];
    for (const bolt of this.weatherLightningBolts) {
      bolt.life += dt;
      if (bolt.life < bolt.maxLife) {
        bolt.alpha = Math.max(0, 1 - (bolt.life / bolt.maxLife));
        aliveBolts.push(bolt);
      }
    }
    this.weatherLightningBolts = aliveBolts;

    // Update Atmospheric Weather Particles
    this.updateWeatherParticles(dt);
  }

  private triggerLightningStrike() {
    this.weather.lightningFlash = 1.0;
    this.screenShake = Math.max(this.screenShake, 5.0);
    sound.playIonStormThunder();

    // Generate procedural branching lightning bolt in visible area
    const startX = this.cameraX + Math.random() * 1200;
    const startY = this.cameraY - 40;
    const endX = startX + (Math.random() - 0.5) * 350;
    const endY = this.cameraY + 300 + Math.random() * 450;

    const points: { x: number; y: number }[] = [];
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const lx = startX + (endX - startX) * t + (i > 0 && i < segments ? (Math.random() - 0.5) * 70 : 0);
      const ly = startY + (endY - startY) * t + (i > 0 && i < segments ? (Math.random() - 0.5) * 40 : 0);
      points.push({ x: lx, y: ly });
    }

    this.weatherLightningBolts.push({
      id: `lightning_${Date.now()}`,
      points,
      alpha: 1.0,
      life: 0,
      maxLife: 0.18,
    });
  }

  private initWeatherParticles() {
    this.weatherParticles = [];
    const count = 100;
    for (let i = 0; i < count; i++) {
      this.weatherParticles.push(this.createRandomWeatherParticle(true));
    }
  }

  private createRandomWeatherParticle(scatter: boolean = false): WeatherParticle {
    const isRain = this.weather.rainIntensity > 0.25;
    const isStorm = this.weather.stormIntensity > 0.35;
    const isFog = this.weather.fogDensity > 0.35;

    const mapW = this.currentMap.width;
    const mapH = this.currentMap.height;

    const x = scatter ? Math.random() * mapW : (Math.random() < 0.5 ? this.cameraX - 100 : this.cameraX + Math.random() * 1400);
    const y = scatter ? Math.random() * mapH : (Math.random() < 0.5 ? this.cameraY - 80 : this.cameraY + Math.random() * 900);

    if (isRain) {
      // Slanted fast-falling combat raindrops
      return {
        id: `wp_${Date.now()}_${Math.random()}`,
        type: 'rain_drop',
        x,
        y,
        vx: 80 + Math.random() * 60,
        vy: 560 + Math.random() * 240,
        size: 2.0 + Math.random() * 1.5,
        alpha: 0.5 + Math.random() * 0.35,
        maxAlpha: 0.85,
        color: '#93c5fd',
        life: 0,
        maxLife: 0.75 + Math.random() * 0.45,
      };
    } else if (isStorm) {
      return {
        id: `wp_${Date.now()}_${Math.random()}`,
        type: 'ion_spark',
        x,
        y,
        vx: 240 + Math.random() * 160,
        vy: 140 + Math.random() * 100,
        size: 2 + Math.random() * 3,
        alpha: 0.4 + Math.random() * 0.5,
        maxAlpha: 0.9,
        color: Math.random() > 0.4 ? '#38bdf8' : '#c084fc',
        life: 0,
        maxLife: 1.5 + Math.random() * 2.5,
      };
    } else if (isFog) {
      return {
        id: `wp_${Date.now()}_${Math.random()}`,
        type: 'fog_wisp',
        x,
        y,
        vx: 30 + Math.random() * 40,
        vy: (Math.random() - 0.5) * 12,
        size: 70 + Math.random() * 90,
        alpha: 0.05 + Math.random() * 0.12,
        maxAlpha: 0.18,
        color: '#94a3b8',
        life: 0,
        maxLife: 6 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2,
      };
    } else {
      // Sunny atmospheric dust motes
      return {
        id: `wp_${Date.now()}_${Math.random()}`,
        type: 'sun_mote',
        x,
        y,
        vx: (Math.random() - 0.5) * 20,
        vy: -15 + Math.random() * 10,
        size: 2 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.35,
        maxAlpha: 0.55,
        color: '#fef08a',
        life: 0,
        maxLife: 4 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
      };
    }
  }

  private updateWeatherParticles(dt: number) {
    const alive: WeatherParticle[] = [];
    const mapW = this.currentMap.width;
    const mapH = this.currentMap.height;

    for (const p of this.weatherParticles) {
      p.life += dt;
      if (p.life < p.maxLife) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.type === 'fog_wisp' && p.phase !== undefined) {
          p.phase += dt * 0.8;
          p.y += Math.sin(p.phase) * 6 * dt;
        }

        // Wrap around map boundary
        if (p.x > mapW + 150) p.x = -100;
        if (p.x < -150) p.x = mapW + 100;
        if (p.y > mapH + 150) p.y = -100;
        if (p.y < -150) p.y = mapH + 100;

        alive.push(p);
      }
    }

    // Maintain pool of particles
    while (alive.length < 90) {
      alive.push(this.createRandomWeatherParticle(false));
    }

    this.weatherParticles = alive;
  }

  // --- FOG OF WAR ---
  private updateFogOfWar() {
    // Dim visible (2) to explored (1)
    for (let i = 0; i < this.fogGrid.length; i++) {
      if (this.fogGrid[i] === 2) {
        this.fogGrid[i] = 1;
      }
    }

    const visMult = this.weather.visibilityMultiplier;

    // Line of sight around player structures
    for (const s of this.structures) {
      if (s.isPlayer) {
        let baseRadius = 260;
        if (s.type === 'conyard') baseRadius = 400;
        else if (s.type === 'turret' || s.type === 'aaturret') baseRadius = 340;
        else if (s.type === 'techlab' || s.type === 'superweapon') baseRadius = 320;
        const radius = baseRadius * visMult;
        this.revealFogCircle(s.x, s.y, radius);
      }
    }

    // Line of sight around player units
    for (const u of this.units) {
      if (u.isPlayer) {
        let baseRadius = 240;
        if (u.type === 'aircraft') baseRadius = 380;
        else if (u.type === 'zone_trooper' || u.type === 'walker') baseRadius = 280;
        else if (u.type === 'harvester') baseRadius = 200;
        // Veterancy bonus: +15% vision for Elite/Heroic scouts
        if (u.veterancy && u.veterancy >= 2) baseRadius *= 1.15;
        const radius = baseRadius * visMult;
        this.revealFogCircle(u.x, u.y, radius);
      }
    }
  }

  private revealFogCircle(worldX: number, worldY: number, radius: number) {
    const centerCellX = Math.floor(worldX / this.fogCellSize);
    const centerCellY = Math.floor(worldY / this.fogCellSize);
    const cellRadius = Math.ceil(radius / this.fogCellSize);

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        if (dx * dx + dy * dy <= cellRadius * cellRadius) {
          const cx = centerCellX + dx;
          const cy = centerCellY + dy;
          if (cx >= 0 && cx < this.fogGridWidth && cy >= 0 && cy < this.fogGridHeight) {
            this.fogGrid[cy * this.fogGridWidth + cx] = 2; // fully visible
          }
        }
      }
    }
  }

  /** Returns true if coordinates are currently in active line-of-sight (state 2) */
  public isPositionVisible(worldX: number, worldY: number): boolean {
    const cx = Math.floor(worldX / this.fogCellSize);
    const cy = Math.floor(worldY / this.fogCellSize);
    if (cx >= 0 && cx < this.fogGridWidth && cy >= 0 && cy < this.fogGridHeight) {
      return this.fogGrid[cy * this.fogGridWidth + cx] === 2;
    }
    return false;
  }

  /** Returns true if coordinates have been discovered/explored (state 1 or 2) */
  public isPositionExplored(worldX: number, worldY: number): boolean {
    const cx = Math.floor(worldX / this.fogCellSize);
    const cy = Math.floor(worldY / this.fogCellSize);
    if (cx >= 0 && cx < this.fogGridWidth && cy >= 0 && cy < this.fogGridHeight) {
      return this.fogGrid[cy * this.fogGridWidth + cx] >= 1;
    }
    return false;
  }

  /** Returns raw fog state: 0 = Shroud (unexplored), 1 = Explored (fogged), 2 = Visible (active line of sight) */
  public getFogState(worldX: number, worldY: number): number {
    const cx = Math.floor(worldX / this.fogCellSize);
    const cy = Math.floor(worldY / this.fogCellSize);
    if (cx >= 0 && cx < this.fogGridWidth && cy >= 0 && cy < this.fogGridHeight) {
      return this.fogGrid[cy * this.fogGridWidth + cx];
    }
    return 0;
  }

  /** Helper to determine if an enemy unit is revealed by line-of-sight */
  public isUnitVisibleToPlayer(unit: UnitInstance): boolean {
    if (unit.isPlayer) return true;
    return this.isPositionVisible(unit.x, unit.y);
  }

  /** Helper to determine if an enemy structure is revealed by line-of-sight */
  public isStructureVisibleToPlayer(struct: StructureInstance): boolean {
    if (struct.isPlayer) return true;
    return this.isPositionVisible(struct.x, struct.y);
  }

  public notifyPlayerOfAttack() {
    const now = Date.now();
    if (now - this.lastAlertTime > 15000) {
      this.lastAlertTime = now;
      sound.playAlert();
      sound.speakEVA('¡Alerta: Tropas enemigas aproximándose a tu base!', true);
    }
  }

  // --- SELECTION & COMMANDS ---
  public selectUnitsInBox(x1: number, y1: number, x2: number, y2: number, append: boolean = false) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    let anySelected = false;
    this.units.forEach(u => {
      if (u.isPlayer) {
        const inBox = u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY;
        if (append) {
          if (inBox) u.selected = true;
        } else {
          u.selected = inBox;
        }
        if (u.selected) anySelected = true;
      }
    });

    if (anySelected) {
      sound.playUnitSelect();
      const repUnit = this.units.find(u => u.isPlayer && u.selected);
      if (repUnit) {
        sound.playUnitResponse(repUnit.type, 'select');
      }
    }
    this.notifyUI();
  }

  public selectSingleUnit(unit: UnitInstance, append: boolean = false) {
    if (!append) {
      this.units.forEach(u => u.selected = false);
    }
    unit.selected = true;
    sound.playUnitSelect();
    sound.playUnitResponse(unit.type, 'select');
    this.notifyUI();
  }

  public selectAllOfType(type: UnitType) {
    this.units.forEach(u => {
      if (u.isPlayer && u.type === type) {
        u.selected = true;
      }
    });
    sound.playUnitSelect();
    sound.playUnitResponse(type, 'select');
    this.notifyUI();
  }

  public issueCommandToSelected(targetX: number, targetY: number, targetUnitId?: string, targetStructureId?: string) {
    const selected = this.units.filter(u => u.isPlayer && u.selected);
    if (selected.length === 0) return;

    sound.playCommandAck();
    const orderType: 'move' | 'attack' = (targetUnitId || targetStructureId) ? 'attack' : 'move';
    const repUnit = selected[0];
    if (repUnit) {
      sound.playUnitResponse(repUnit.type, orderType);
    }
    this.addMoveMarker(targetX, targetY, orderType);

    // Distribute units in intelligent formation avoiding static obstacles
    selected.forEach((u, index) => {
      const offsetX = (index % 4 - 1.5) * 32;
      const offsetY = (Math.floor(index / 4) - 1.5) * 32;

      let slotX = targetX + offsetX;
      let slotY = targetY + offsetY;

      // If slot lands in blocked terrain or building, find closest walkable spot
      const pathOpts = u.type === 'harvester' ? { isHarvester: true, isPlayer: u.isPlayer } : undefined;
      if (!u.isAir && !this.pathfinder.isWorldWalkable(slotX, slotY, pathOpts)) {
        const cell = this.pathfinder.findNearestWalkableCell(
          Math.floor(slotX / this.pathfinder.cellSize),
          Math.floor(slotY / this.pathfinder.cellSize),
          6,
          pathOpts
        );
        if (cell) {
          slotX = cell.gx * this.pathfinder.cellSize + this.pathfinder.cellSize * 0.5;
          slotY = cell.gy * this.pathfinder.cellSize + this.pathfinder.cellSize * 0.5;
        }
      }

      u.targetX = slotX;
      u.targetY = slotY;
      u.targetUnitId = targetUnitId;
      u.targetStructureId = targetStructureId;
      u.stuckTimer = 0;

      // Visualización de ruta: calcular camino inmediatamente para movimiento ágil y visualización del trazado
      let computedPath: { x: number; y: number }[] = [];
      if (u.isAir) {
        computedPath = [{ x: slotX, y: slotY }];
      } else if (this.pathfinder.hasLineOfSight(u.x, u.y, slotX, slotY, pathOpts)) {
        computedPath = [{ x: slotX, y: slotY }];
      } else {
        const found = this.pathfinder.findPath(u.x, u.y, slotX, slotY, pathOpts);
        computedPath = found && found.length > 0 ? found : [{ x: slotX, y: slotY }];
      }

      u.path = computedPath;
      u.pathIndex = 0;
      u.lastPathTargetX = slotX;
      u.lastPathTargetY = slotY;

      // Generar línea de visualización de ruta temporal en el suelo mostrando el camino calculado
      const routePoints: { x: number; y: number }[] = [{ x: u.x, y: u.y }, ...computedPath];
      this.addPathVisualization(u.id, routePoints, orderType, u.faction);

      // Contextual harvester automated loop handling when given explicit manual order
      if (u.type === 'harvester') {
        const targetStruct = targetStructureId ? this.structures.find(s => s.id === targetStructureId && s.hp > 0) : null;
        if (targetStruct && targetStruct.isPlayer && targetStruct.type === 'refinery') {
          // Explicit command to return to friendly refinery and unload!
          u.manualMoveOrder = false;
          this.commandHarvesterUnload(u.id, targetStruct.id);
        } else {
          // Check if right-clicked on or near a Tiberium crystal patch (search within 80px)
          let clickedCrystal: TiberiumCrystal | null = null;
          let minCrystalDist = 80;
          for (const crystal of this.tiberiumCrystals) {
            if (crystal.amount > 0) {
              const d = Math.hypot(crystal.x - targetX, crystal.y - targetY);
              if (d < minCrystalDist) {
                minCrystalDist = d;
                clickedCrystal = crystal;
              }
            }
          }

          if (clickedCrystal) {
            // Explicit order to harvest this patch
            this.dispatchHarvesterToTiberium(u, clickedCrystal.id);
          } else if (!targetUnitId && !targetStructureId) {
            // Manual movement to ground: set target and mark manual order
            u.manualMoveOrder = true;
            u.targetX = slotX;
            u.targetY = slotY;
            u.harvestState = 'idle';
            u.isMoving = true;
          }
        }
      }

      // Contextual Engineer orders: repair friendly buildings or capture enemy buildings
      if (u.type === 'engineer') {
        const targetStruct = targetStructureId ? this.structures.find(s => s.id === targetStructureId && s.hp > 0) : null;
        if (targetStruct) {
          if (targetStruct.isPlayer) {
            // Friendly building: repair order
            u.repairTargetId = targetStruct.id;
            u.captureTargetId = undefined;
            u.engineerAction = 'repairing';
            sound.speakEVA('Ingeniero asignado a reparación.');
          } else {
            // Enemy building: capture / occupy order
            u.captureTargetId = targetStruct.id;
            u.repairTargetId = undefined;
            u.engineerAction = 'capturing';
            sound.speakEVA('Ingeniero en ruta para ocupar estructura enemiga.');
          }
        } else {
          // Ordered to move to ground: clear specific building action
          u.repairTargetId = undefined;
          u.captureTargetId = undefined;
          u.engineerAction = 'idle';
        }
      }
    });
  }

  /**
   * Explicitly commands a specific harvester or all selected friendly harvesters to return
   * to the nearest active refinery and unload their Tiberium cargo, immediately crediting funds upon dock.
   */
  public commandHarvesterUnload(unitId?: string, preferredRefineryId?: string): boolean {
    const harvestersToOrder = unitId 
      ? this.units.filter(u => u.id === unitId && u.type === 'harvester')
      : this.units.filter(u => u.isPlayer && u.selected && u.type === 'harvester');

    if (harvestersToOrder.length === 0) return false;

    let targetRef: StructureInstance | undefined;
    if (preferredRefineryId) {
      targetRef = this.structures.find(s => s.id === preferredRefineryId && s.hp > 0);
    }

    let orderedCount = 0;
    harvestersToOrder.forEach(u => {
      const dispatched = this.dispatchHarvesterToRefinery(u, targetRef);
      if (dispatched) orderedCount++;
    });

    if (orderedCount > 0) {
      sound.playCommandAck();
      this.notifyUI();
      return true;
    } else {
      sound.speakEVA('Se requiere una refinería activa.');
      return false;
    }
  }

  public createControlGroup(groupNumber: number) {
    const selectedIds = this.units.filter(u => u.isPlayer && u.selected).map(u => u.id);
    this.controlGroups[groupNumber] = selectedIds;
    sound.playClick();
  }

  public recallControlGroup(groupNumber: number) {
    const ids = this.controlGroups[groupNumber] || [];
    if (ids.length === 0) return;

    this.units.forEach(u => {
      u.selected = u.isPlayer && ids.includes(u.id);
    });
    sound.playUnitSelect();
    this.notifyUI();
  }

  // --- VICTORY & DEFEAT ---
  private checkEndConditions() {
    if (this.gameState !== 'PLAYING') return;

    const playerHasConyard = this.structures.some(s => s.isPlayer && s.type === 'conyard');
    const playerHasUnits = this.units.some(u => u.isPlayer);
    if (!playerHasConyard && !playerHasUnits && this.structures.filter(s => s.isPlayer).length === 0) {
      this.gameState = 'DEFEAT';
      sound.speakEVA('Misión fallida. La base ha sido aniquilada.', true);
      storage.recordMatchEnd({
        isVictory: false,
        faction: this.playerFaction,
        difficulty: this.difficulty,
        gameDuration: this.gameTime,
        kills: this.matchKills,
        tiberiumHarvested: this.matchTiberiumHarvested,
        structuresBuilt: this.matchStructuresBuilt,
        superweaponFired: this.matchSuperweaponFired,
      });
      this.notifyUI();
      return;
    }

    const enemyHasConyard = this.structures.some(s => !s.isPlayer && s.type === 'conyard');
    const enemyStructures = this.structures.filter(s => !s.isPlayer);
    const enemyUnits = this.units.filter(u => !u.isPlayer);
    if (!enemyHasConyard && enemyStructures.length === 0 && enemyUnits.length === 0) {
      this.gameState = 'VICTORY';
      sound.speakEVA('¡Victoria táctica! Todas las fuerzas hostiles han sido neutralizadas.', true);
      storage.recordMatchEnd({
        isVictory: true,
        faction: this.playerFaction,
        difficulty: this.difficulty,
        gameDuration: this.gameTime,
        kills: this.matchKills,
        tiberiumHarvested: this.matchTiberiumHarvested,
        structuresBuilt: this.matchStructuresBuilt,
        superweaponFired: this.matchSuperweaponFired,
      });
      this.notifyUI();
    }
  }

  // --- LOCAL SAVE & LOAD MATCH STATE ---
  public exportSaveState(): SavedGameState {
    return {
      id: `save_${Date.now()}`,
      timestamp: Date.now(),
      gameTime: Math.floor(this.gameTime),
      playerFaction: this.playerFaction,
      aiFaction: this.aiFaction,
      difficulty: this.difficulty,
      mapType: this.mapType,
      playerCredits: this.playerCredits,
      aiCredits: this.aiCredits,
      structures: JSON.parse(JSON.stringify(this.structures)),
      units: JSON.parse(JSON.stringify(this.units)),
      tiberiumCrystals: JSON.parse(JSON.stringify(this.tiberiumCrystals)),
      scorches: JSON.parse(JSON.stringify(this.scorches)),
      fog: Array.from(this.fogGrid),
      cameraX: Math.floor(this.cameraX),
      cameraY: Math.floor(this.cameraY),
      structureQueue: JSON.parse(JSON.stringify(this.structureQueue)),
      unitQueue: this.unitQueue ? JSON.parse(JSON.stringify(this.unitQueue)) : null,
      infantryQueue: JSON.parse(JSON.stringify(this.infantryQueue)),
      vehicleQueue: JSON.parse(JSON.stringify(this.vehicleQueue)),
      playerSuperweaponReady: this.playerSuperweaponReady,
      playerSuperweaponTimer: Math.floor(this.playerSuperweaponTimer),
    };
  }

  public loadSaveState(save: SavedGameState): boolean {
    try {
      this.playerFaction = save.playerFaction;
      this.aiFaction = save.aiFaction;
      this.difficulty = save.difficulty;
      this.mapType = save.mapType;
      this.currentMap = MAP_PRESETS[save.mapType] || MAP_PRESETS.wasteland;
      this.pathfinder = new Pathfinder(this.currentMap.width, this.currentMap.height, 40);

      this.gameState = 'PLAYING';
      this.gameTime = save.gameTime;
      this.playerCredits = save.playerCredits;
      this.aiCredits = save.aiCredits;
      this.structures = save.structures || [];
      this.units = save.units || [];
      this.tiberiumCrystals = save.tiberiumCrystals || [];
      this.scorches = save.scorches || [];
      this.particles = [];
      this.projectiles = [];
      this.moveMarkers = [];
      this.treadMarks = [];
      
      // Restore sequential queues with backward compatibility
      if (Array.isArray(save.structureQueue)) {
        this.structureQueue = save.structureQueue;
      } else if (save.structureQueue) {
        this.structureQueue = [save.structureQueue];
      } else {
        this.structureQueue = [];
      }

      if (save.infantryQueue && Array.isArray(save.infantryQueue)) {
        this.infantryQueue = save.infantryQueue;
      } else {
        this.infantryQueue = [];
      }

      if (save.vehicleQueue && Array.isArray(save.vehicleQueue)) {
        this.vehicleQueue = save.vehicleQueue;
      } else if (Array.isArray(save.unitQueue)) {
        this.vehicleQueue = save.unitQueue;
      } else if (save.unitQueue) {
        this.vehicleQueue = [save.unitQueue];
      } else {
        this.vehicleQueue = [];
      }

      this.placementStructure = null;
      this.superweaponTargeting = false;
      // A save captured mid-relocation carries a stale flag that can never resolve.
      this.relocatingStructure = null;
      this.pathVisualizations = [];
      this.floatingTexts = [];
      this.playerSuperweaponReady = save.playerSuperweaponReady;
      this.playerSuperweaponTimer = save.playerSuperweaponTimer;
      this.cameraX = save.cameraX || 0;
      this.cameraY = save.cameraY || 0;

      // Restore fog of war grid
      if (save.fog && save.fog.length === this.fogGrid.length) {
        this.fogGrid.set(save.fog);
      } else {
        this.fogGrid.fill(0);
      }

      // Rebuild pathfinder navigation obstacles
      this.pathfinder.updateGrid(this.currentMap.terrainObstacles, this.structures);

      // Re-initialize AI Commander
      this.aiCommander = new AICommander(this, this.difficulty, this.currentMap.enemyStart);

      sound.speakEVA('Secuencia de guardado recuperada. Batalla reanudada.', true);
      this.notifyUI();
      return true;
    } catch (e) {
      console.error('Failed to load save state', e);
      return false;
    }
  }
}
