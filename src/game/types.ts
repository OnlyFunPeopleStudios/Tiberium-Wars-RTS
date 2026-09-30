export type Faction = 'gdi' | 'nod';

export type StructureType = 
  | 'conyard'
  | 'powerplant'
  | 'refinery'
  | 'barracks'
  | 'warfactory'
  | 'turret'
  | 'aaturret'
  | 'techlab'
  | 'superweapon';

export type UnitType = 
  | 'harvester'
  | 'rifleman'
  | 'missile'
  | 'zone_trooper'
  | 'engineer'
  | 'tank'
  | 'apc'
  | 'aircraft'
  | 'walker';

export type StructureCategory = 'structures' | 'defenses' | 'infantry' | 'vehicles';

export interface StructureDef {
  type: StructureType;
  name: string;
  category: 'structures' | 'defenses';
  cost: number;
  buildTime: number; // seconds
  hp: number;
  powerOut: number;
  powerIn: number;
  width: number;
  height: number;
  prereq?: StructureType[];
  weapon?: {
    damage: number;
    range: number;
    rateOfFire: number; // shots per sec
    targetsAir: boolean;
    type: 'bullet' | 'laser' | 'missile';
  };
  description: string;
}

export interface UnitDef {
  type: UnitType;
  name: string;
  category: 'infantry' | 'vehicles';
  cost: number;
  buildTime: number; // seconds
  hp: number;
  speed: number;
  range: number;
  damage: number;
  rateOfFire: number;
  damageType: 'bullet' | 'rocket' | 'cannon' | 'laser';
  isAir: boolean;
  canTargetAir: boolean;
  size: number;
  prereq?: StructureType[];
  description: string;
}

export interface StructureInstance {
  id: string;
  type: StructureType;
  faction: Faction;
  isPlayer: boolean;
  x: number; // center world coords
  y: number;
  hp: number;
  maxHp: number;
  powerOut: number;
  powerIn: number;
  width: number;
  height: number;
  isUnderConstruction?: boolean;
  constructionProgress?: number;
  lastFired?: number;
  targetId?: string;
  rallyPoint?: { x: number; y: number };
  smokeTimer?: number;

  // Engineer Building Relocation (Level 2 Engineers)
  isBeingMoved?: boolean;
  moveTargetX?: number;
  moveTargetY?: number;
  moveSpeed?: number;
  relocatePath?: { x: number; y: number }[];
  relocatePathIndex?: number;
  assignedEngineers?: string[]; // IDs of Level 2 engineers escorting/carrying this building

  // Captured Enemy Structure (Infiltrated by Engineer)
  isCaptured?: boolean;
  capturedFrom?: Faction;
  capturedTimer?: number; // Income pulse from captured enemy refineries

  // Combat Veterancy & Health Regeneration
  kills?: number; // Kills scored by defensive structure
  veterancy?: number; // 0 = Standard, 1 = Veteran, 2 = Elite, 3 = Heroic
  lastCombatTime?: number; // timestamp in seconds of last damage dealt or received
  regenVfxTimer?: number;
  regenTextTimer?: number;
}

export interface UnitInstance {
  id: string;
  type: UnitType;
  faction: Faction;
  isPlayer: boolean;
  x: number;
  y: number;
  rotation: number; // radians
  turretRotation?: number; // radians for tanks/walkers
  hp: number;
  maxHp: number;
  speed: number;
  range: number;
  damage: number;
  rateOfFire: number;
  damageType: 'bullet' | 'rocket' | 'cannon' | 'laser';
  isAir: boolean;
  canTargetAir: boolean;
  size: number;
  selected?: boolean;

  // Combat & Veterancy
  kills?: number; // Total enemy kills by this unit
  veterancy?: number; // 0 = Recruit, 1 = Veteran, 2 = Elite (Level 2), 3 = Heroic
  engineerXp?: number; // Accumulated repair/capture XP for engineers to rank up
  lastCombatTime?: number; // timestamp in seconds of last damage dealt or received
  
  // Movement & AI
  targetX?: number;
  targetY?: number;
  targetUnitId?: string;
  targetStructureId?: string;
  lastFired?: number;

  // Pathfinding & Navigation
  path?: { x: number; y: number }[];
  pathIndex?: number;
  lastPathTargetX?: number;
  lastPathTargetY?: number;
  stuckTimer?: number;

  // Harvester specific
  tiberiumCargo?: number; // 0 to 100
  harvestingFrom?: string; // patch id
  targetRefineryId?: string;
  harvestState?: 'idle' | 'moving_to_field' | 'harvesting' | 'returning_to_refinery' | 'unloading';
  harvestTimer?: number;
  harvesterBladeAngle?: number;
  manualMoveOrder?: boolean;

  // Engineer specific
  engineerAction?: 'idle' | 'repairing' | 'capturing' | 'moving_building';
  repairTargetId?: string;
  captureTargetId?: string;
  assignedStructureId?: string;
  repairPulseTimer?: number;

  // Aircraft specific
  altitude?: number;
  bankAngle?: number; // Roll angle during turns

  // Dynamics & Animation
  currentSpeed?: number;
  isMoving?: boolean;
  recoil?: number; // Gun barrel kickback (0 to 1)
  treadOffset?: number; // Animated tank treads
  walkPhase?: number; // Walker and infantry leg articulation
  suspensionOffset?: number; // Vertical bobbing
  smokeTimer?: number; // Accumulated timer for damaged smoke emission
  regenVfxTimer?: number; // Accumulated timer for passive health regeneration particle effects
  regenTextTimer?: number; // Accumulated timer for floating healing numbers
}

export interface MoveMarker {
  id: string;
  x: number;
  y: number;
  type: 'move' | 'attack';
  radius: number;
  maxRadius: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface TreadMark {
  id: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface PathVisualization {
  id: string;
  unitId: string;
  points: { x: number; y: number }[];
  color: string;
  secondaryColor?: string;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'move' | 'attack';
}

export interface TiberiumCrystal {
  id: string;
  x: number;
  y: number;
  amount: number; // 0 to 1000
  maxAmount: number;
  type: 'green' | 'blue';
  clusterRadius: number;
}

export interface Projectile {
  id: string;
  type: 'bullet' | 'rocket' | 'cannon' | 'laser' | 'ion' | 'nuke';
  startX: number;
  startY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  targetUnitId?: string;
  targetStructureId?: string;
  sourceUnitId?: string; // Unit ID that launched this projectile
  sourceStructureId?: string; // Structure ID (e.g. Turret) that launched this projectile
  speed: number;
  damage: number;
  splashRadius: number;
  isPlayer: boolean;
  color: string;
  createdAt: number;
  duration?: number; // for lasers/instant
}

export interface FloatingCombatText {
  id: string;
  x: number;
  y: number;
  text: string;
  type: 'damage' | 'critical' | 'heal';
  fontSize: number;
  alpha: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  scale: number;
}

export interface ParticleEffect {
  id: string;
  type: 'explosion' | 'smoke' | 'spark' | 'tiberium_spore' | 'shockwave' | 'muzzle' | 'debris';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  rotation?: number;
  vRot?: number;
  drag?: number;
}

export interface ScorchDecal {
  id: string;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
}

export interface BuildQueueItem {
  id: string;
  itemType: StructureType | UnitType;
  category: StructureCategory;
  progress: number; // 0 to 1
  buildTime: number; // seconds
  cost: number;
  ready: boolean; // waiting for placement if structure
}

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type MapType = 'wasteland' | 'sarajevo' | 'yellowzone';

export interface GameSettings {
  crtScanlines: boolean;
  showDamageNumbers: boolean;
  sfxVolume: number;
  voiceVolume: number;
  gameSpeed: number; // 1, 1.5, 2
  showGrid: boolean;
}

export type WeatherType = 'sunny' | 'rain' | 'ion_storm' | 'fog';

export interface WeatherParticle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  color: string;
  life: number;
  maxLife: number;
  type: 'fog_wisp' | 'ion_spark' | 'sun_mote' | 'rain_drop';
  baseAngle?: number;
  phase?: number;
}

export interface LightningBolt {
  id: string;
  points: { x: number; y: number }[];
  alpha: number;
  life: number;
  maxLife: number;
}

export interface WeatherControllerState {
  current: WeatherType;
  next: WeatherType;
  timer: number;               // seconds into current weather
  duration: number;            // seconds total for current phase
  transitionDuration: number;  // seconds transition lasts
  transitionProgress: number;  // 0 (pure current) to 1 (fully switched)
  isTransitioning: boolean;
  visibilityMultiplier: number;// 1.0 (sunny), 0.70 (fog), 0.85 (ion storm), 0.90 (rain)
  lightningFlash: number;      // 0 to 1 intensity flash
  fogDensity: number;          // 0 to 1
  stormIntensity: number;      // 0 to 1
  rainIntensity: number;       // 0 to 1
}
