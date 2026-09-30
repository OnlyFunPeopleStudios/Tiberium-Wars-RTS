import { GameEngine } from './engine';
import { StructureType, UnitType, AIDifficulty, UnitInstance } from './types';
import { STRUCTURE_DEFS } from './gameData';

export class AICommander {
  private engine: GameEngine;
  private difficulty: AIDifficulty;
  private lastThinkTime: number = 0;
  private attackCooldown: number = 25; // seconds
  private lastAttackTime: number = 0;
  private basePos: { x: number; y: number };

  constructor(engine: GameEngine, difficulty: AIDifficulty, basePos: { x: number; y: number }) {
    this.engine = engine;
    this.difficulty = difficulty;
    this.basePos = basePos;
  }

  public update(dt: number) {
    this.lastThinkTime += dt;
    // AI thinks every 1.2 to 2.0 seconds
    const interval = this.difficulty === 'hard' ? 1.0 : this.difficulty === 'medium' ? 1.6 : 2.2;
    if (this.lastThinkTime >= interval) {
      this.lastThinkTime = 0;
      this.think();
    }
  }

  private think() {
    const aiCredits = this.engine.aiCredits;
    const aiPower = this.engine.getAIPower();
    const aiStructures = this.engine.structures.filter(s => !s.isPlayer);
    const aiUnits = this.engine.units.filter(u => !u.isPlayer);

    // 1. Maintain Power Grid
    if (aiPower.produced <= aiPower.consumed + 20 && aiCredits >= STRUCTURE_DEFS.powerplant.cost) {
      this.tryBuildStructure('powerplant');
      return;
    }

    // 2. Build Refinery if missing or have excess credits
    const hasRefinery = aiStructures.some(s => s.type === 'refinery');
    if (!hasRefinery && aiCredits >= STRUCTURE_DEFS.refinery.cost) {
      this.tryBuildStructure('refinery');
      return;
    }

    // 3. Ensure Harvesters are harvesting
    const aiHarvesters = aiUnits.filter(u => u.type === 'harvester');
    if (aiHarvesters.length === 0 && hasRefinery && aiCredits >= 1200) {
      this.tryBuildUnit('harvester');
    }

    // 4. Build Barracks
    const hasBarracks = aiStructures.some(s => s.type === 'barracks');
    if (!hasBarracks && aiCredits >= STRUCTURE_DEFS.barracks.cost) {
      this.tryBuildStructure('barracks');
      return;
    }

    // 5. Build War Factory
    const hasWarFactory = aiStructures.some(s => s.type === 'warfactory');
    if (!hasWarFactory && hasRefinery && aiCredits >= STRUCTURE_DEFS.warfactory.cost) {
      this.tryBuildStructure('warfactory');
      return;
    }

    // 6. Build Defenses if threatened or medium/hard
    const turretsCount = aiStructures.filter(s => s.type === 'turret' || s.type === 'aaturret').length;
    const desiredTurrets = this.difficulty === 'hard' ? 4 : this.difficulty === 'medium' ? 2 : 1;
    if (turretsCount < desiredTurrets && hasBarracks && aiCredits >= 700) {
      const defType: StructureType = turretsCount % 2 === 0 ? 'turret' : 'aaturret';
      this.tryBuildStructure(defType);
      return;
    }

    // 7. Build Tech Lab on Medium/Hard
    const hasTechLab = aiStructures.some(s => s.type === 'techlab');
    if (this.difficulty !== 'easy' && !hasTechLab && hasWarFactory && aiCredits >= 3000) {
      this.tryBuildStructure('techlab');
      return;
    }

    // 8. Produce Army Units
    const combatUnits = aiUnits.filter(u => u.type !== 'harvester');
    const attackThreshold = this.difficulty === 'hard' ? 9 : this.difficulty === 'medium' ? 6 : 4;

    // Infantry recruitment
    if (hasBarracks && Math.random() < 0.6) {
      const infantryRoll = Math.random();
      if (hasTechLab && infantryRoll > 0.7 && aiCredits >= 800) {
        this.tryBuildUnit('zone_trooper');
      } else if (infantryRoll > 0.4 && aiCredits >= 350) {
        this.tryBuildUnit('missile');
      } else if (aiCredits >= 200) {
        this.tryBuildUnit('rifleman');
      }
    }

    // Vehicle production
    if (hasWarFactory) {
      const vehicleRoll = Math.random();
      if (hasTechLab && vehicleRoll > 0.75 && aiCredits >= 2400) {
        this.tryBuildUnit('walker');
      } else if (vehicleRoll > 0.5 && aiCredits >= 1300) {
        this.tryBuildUnit('aircraft');
      } else if (vehicleRoll > 0.25 && aiCredits >= 1000) {
        this.tryBuildUnit('tank');
      } else if (aiCredits >= 650) {
        this.tryBuildUnit('apc');
      }
    }

    // 9. Coordinate Assault Waves
    const now = Date.now() / 1000;
    if (combatUnits.length >= attackThreshold && now - this.lastAttackTime > this.attackCooldown) {
      this.lastAttackTime = now;
      this.launchAttackWave(combatUnits);
    }
  }

  private tryBuildStructure(type: StructureType) {
    const def = STRUCTURE_DEFS[type];
    if (this.engine.aiCredits < def.cost) return;

    // Find viable location near baseConyard
    const conyard = this.engine.structures.find(s => !s.isPlayer && s.type === 'conyard');
    const center = conyard ? { x: conyard.x, y: conyard.y } : this.basePos;

    // Try spiral positions around base
    for (let attempts = 0; attempts < 15; attempts++) {
      const angle = (attempts * 0.8) + Math.random() * 0.4;
      const dist = 120 + (attempts * 25);
      const testX = center.x + Math.cos(angle) * dist;
      const testY = center.y + Math.sin(angle) * dist;

      if (this.engine.canPlaceStructure(testX, testY, def.width, def.height, false)) {
        this.engine.aiCredits -= def.cost;
        this.engine.spawnStructure(type, this.engine.aiFaction, false, testX, testY);
        break;
      }
    }
  }

  private tryBuildUnit(type: UnitType) {
    this.engine.spawnAIUnit(type);
  }

  private launchAttackWave(combatUnits: UnitInstance[]) {
    // Select player high-value target: Harvester, Refinery, ConYard, or closest unit
    const playerHarvesters = this.engine.units.filter(u => u.isPlayer && u.type === 'harvester');
    const playerStructures = this.engine.structures.filter(s => s.isPlayer);
    const playerUnits = this.engine.units.filter(u => u.isPlayer);

    let targetX = 400;
    let targetY = 400;
    let targetUnitId: string | undefined = undefined;
    let targetStructureId: string | undefined = undefined;

    if (Math.random() < 0.4 && playerHarvesters.length > 0) {
      // Harvester raid! Classic RTS tactic!
      const targetHarv = playerHarvesters[Math.floor(Math.random() * playerHarvesters.length)];
      targetX = targetHarv.x;
      targetY = targetHarv.y;
      targetUnitId = targetHarv.id;
    } else if (playerStructures.length > 0) {
      // Strike key building (Refinery or Power Plant to cripple player)
      const priorityStructs = playerStructures.filter(s => s.type === 'refinery' || s.type === 'powerplant');
      const targetStruct = priorityStructs.length > 0 
        ? priorityStructs[Math.floor(Math.random() * priorityStructs.length)]
        : playerStructures[Math.floor(Math.random() * playerStructures.length)];
      targetX = targetStruct.x;
      targetY = targetStruct.y;
      targetStructureId = targetStruct.id;
    } else if (playerUnits.length > 0) {
      const targetU = playerUnits[0];
      targetX = targetU.x;
      targetY = targetU.y;
      targetUnitId = targetU.id;
    }

    combatUnits.forEach((unit, idx) => {
      // Give spread out formation
      const offsetX = (idx % 3 - 1) * 35;
      const offsetY = (Math.floor(idx / 3) - 1) * 35;
      unit.targetX = targetX + offsetX;
      unit.targetY = targetY + offsetY;
      unit.targetUnitId = targetUnitId;
      unit.targetStructureId = targetStructureId;
      unit.path = undefined;
      unit.pathIndex = 0;
      unit.lastPathTargetX = undefined;
      unit.lastPathTargetY = undefined;
    });

    this.engine.notifyPlayerOfAttack();
  }
}
