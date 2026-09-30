import { GameEngine } from './engine';
import { UnitInstance, StructureInstance, TiberiumCrystal } from './types';
import { STRUCTURE_DEFS, getRequiredEngineersToMove } from './gameData';

export interface CombatVFXParticle {
  id: string;
  type: 'spark' | 'smoke' | 'debris' | 'black_smoke';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  drag: number;
  gravity?: number;
  rotation?: number;
  vRot?: number;
  aspectRatio?: number;
}

export class CanvasRenderer {
  private engine: GameEngine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Combat Feedback Particle System (Sparks, Smoke, and Debris for Units & Structures)
  private combatParticles: CombatVFXParticle[] = [];
  private unitHpHistory: Map<string, number> = new Map();
  private unitSmokeTimers: Map<string, number> = new Map();
  private structureHpHistory: Map<string, number> = new Map();
  private structureSmokeTimers: Map<string, number> = new Map();
  private lastRenderTimestamp: number = 0;

  // Offscreen Fog of War mask canvas & context for smooth volumetric line-of-sight
  private fogCanvas: HTMLCanvasElement = document.createElement('canvas');
  private fogCtx: CanvasRenderingContext2D = this.fogCanvas.getContext('2d') as CanvasRenderingContext2D;

  constructor(engine: GameEngine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }

  public render(
    viewportWidth: number, 
    viewportHeight: number, 
    dragBox: { x1: number; y1: number; x2: number; y2: number } | null,
    mouseWorldX: number,
    mouseWorldY: number
  ) {
    const ctx = this.ctx;
    const map = this.engine.currentMap;

    // Update viewport dimensions for spatial sound and camera
    this.engine.viewportWidth = viewportWidth;
    this.engine.viewportHeight = viewportHeight;

    // Combat feedback particles timing & simulation (Damage Sparks & Low-HP Smoke Trails)
    const now = performance.now();
    const dt = this.lastRenderTimestamp > 0 
      ? Math.min(0.08, (now - this.lastRenderTimestamp) / 1000) 
      : 0.016;
    this.lastRenderTimestamp = now;
    this.updateCombatFeedback(dt);

    // Apply screen shake
    ctx.save();
    if (this.engine.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.engine.screenShake;
      const shakeY = (Math.random() - 0.5) * this.engine.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Clear background (deep wasteland terrain color)
    ctx.fillStyle = '#1c1917'; // warm stone/charcoal
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Camera transform
    const camX = this.engine.cameraX;
    const camY = this.engine.cameraY;
    ctx.translate(-camX, -camY);

    // 1. Draw Terrain & Grid
    this.drawTerrain(ctx, map.width, map.height);

    // 2. Draw Obstacles (rocks, ruins, craters)
    this.drawObstacles(ctx);

    // 3. Draw Tiberium Crystals
    this.drawTiberium(ctx);

    // 4. Draw Ground FX (Tread Tracks, Scorches & Waypoint Pings)
    this.drawTreadMarks(ctx);
    this.drawScorches(ctx);
    this.drawPathVisualizations(ctx);
    this.drawMoveMarkers(ctx);

    // 5. Draw Structures
    this.drawStructures(ctx);

    // 6. Draw Units
    this.drawUnits(ctx);

    // 6.5 Draw Engineer Beams (Welding Nanites & Infiltration Datalinks)
    if (typeof (this as any).drawEngineerBeams === 'function') {
      this.drawEngineerBeams(ctx);
    }

    // 7. Draw Projectiles & Lasers
    this.drawProjectiles(ctx);

    // 8. Draw Particles & Explosions
    this.drawParticles(ctx);

    // 8.5 Draw Combat Feedback VFX (Damage Sparks & Low-HP Black Smoke Trails)
    this.drawCombatParticles(ctx);

    // 9. Draw Fog of War
    this.drawFogOfWar(ctx, viewportWidth, viewportHeight, camX, camY);

    // 9.5 Draw Floating Combat Text (Damage & Healing numbers over units & structures)
    this.drawFloatingTexts(ctx);

    // 10. Draw Placement Hologram Preview
    if (this.engine.placementStructure) {
      this.drawPlacementPreview(ctx, mouseWorldX, mouseWorldY);
    }

    // 10.5 Draw Relocation Hologram Preview (Convoy Route & Placement Ghost)
    if (this.engine.relocatingStructure && typeof (this as any).drawRelocationPreview === 'function') {
      this.drawRelocationPreview(ctx, mouseWorldX, mouseWorldY);
    }

    // 11. Draw Superweapon Crosshair Targeting
    if (this.engine.superweaponTargeting) {
      this.drawSuperweaponTarget(ctx, mouseWorldX, mouseWorldY);
    }

    // Restore Camera
    ctx.restore();

    // 12. Top-Layer Screen-Space Atmospheric Weather System:
    // Dynamic color filters, atmospheric haze/vignette, lightning flashes, global particles
    this.drawWeatherAtmosphere(ctx, viewportWidth, viewportHeight);

    // 13. Draw Screen-Space Drag Selection Box
    if (dragBox) {
      this.drawDragBox(ctx, dragBox);
    }
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, mapWidth: number, mapHeight: number) {
    // Subtle tactical coordinate grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;

    const gridSize = 80;
    for (let x = 0; x < mapWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapHeight);
      ctx.stroke();
    }
    for (let y = 0; y < mapHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mapWidth, y);
      ctx.stroke();
    }

    // Map boundaries
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, mapWidth, mapHeight);
    ctx.restore();
  }

  private drawObstacles(ctx: CanvasRenderingContext2D) {
    for (const obs of this.engine.currentMap.terrainObstacles) {
      ctx.save();
      if (obs.type === 'rock') {
        ctx.fillStyle = '#292524';
        ctx.strokeStyle = '#44403c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(obs.x - obs.width / 2, obs.y - obs.height / 2, obs.width, obs.height, 16);
        ctx.fill();
        ctx.stroke();
      } else if (obs.type === 'crater') {
        const grad = ctx.createRadialGradient(obs.x, obs.y, 10, obs.x, obs.y, obs.width / 2);
        grad.addColorStop(0, '#0c0a09');
        grad.addColorStop(0.8, '#292524');
        grad.addColorStop(1, 'rgba(41, 37, 36, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Ruins
        ctx.fillStyle = '#1e1b18';
        ctx.strokeStyle = '#57534e';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x - obs.width / 2, obs.y - obs.height / 2, obs.width, obs.height);
        ctx.fillRect(obs.x - obs.width / 2, obs.y - obs.height / 2, obs.width, obs.height);
      }
      ctx.restore();
    }
  }

  private drawTiberium(ctx: CanvasRenderingContext2D) {
    const time = Date.now() / 1000;
    for (const crystal of this.engine.tiberiumCrystals) {
      if (crystal.amount <= 0) continue;
      // Fog of War: hide crystals in undiscovered shroud
      if (!this.engine.isPositionExplored(crystal.x, crystal.y)) continue;

      const isBlue = crystal.type === 'blue';
      const glowColor = isBlue ? '#38bdf8' : '#22c55e';
      const crystalColor = isBlue ? '#0284c7' : '#16a34a';
      const highlightColor = isBlue ? '#bae6fd' : '#86efac';

      const pulse = Math.sin(time * 3 + crystal.x * 0.05) * 0.2 + 0.8;
      const size = Math.max(6, 12 * (crystal.amount / crystal.maxAmount));

      // Glow halo
      ctx.save();
      const grad = ctx.createRadialGradient(crystal.x, crystal.y, 2, crystal.x, crystal.y, size * 2.2);
      grad.addColorStop(0, `${glowColor}${Math.floor(pulse * 80).toString(16).padStart(2, '0')}`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(crystal.x, crystal.y, size * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Sharp crystalline diamond facet
      ctx.fillStyle = crystalColor;
      ctx.beginPath();
      ctx.moveTo(crystal.x, crystal.y - size);
      ctx.lineTo(crystal.x + size * 0.7, crystal.y);
      ctx.lineTo(crystal.x, crystal.y + size * 0.9);
      ctx.lineTo(crystal.x - size * 0.7, crystal.y);
      ctx.closePath();
      ctx.fill();

      // Top shiny facet
      ctx.fillStyle = highlightColor;
      ctx.beginPath();
      ctx.moveTo(crystal.x, crystal.y - size);
      ctx.lineTo(crystal.x + size * 0.35, crystal.y);
      ctx.lineTo(crystal.x, crystal.y - size * 0.2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  private drawTreadMarks(ctx: CanvasRenderingContext2D) {
    for (const t of this.engine.treadMarks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, t.alpha));
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);

      // Dual parallel track lines
      ctx.fillStyle = '#1c1917';
      const halfW = t.width * 0.45;
      ctx.fillRect(-7, -halfW, 14, 3.5);
      ctx.fillRect(-7, halfW - 3.5, 14, 3.5);

      ctx.restore();
    }
  }

  private drawMoveMarkers(ctx: CanvasRenderingContext2D) {
    for (const m of this.engine.moveMarkers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, m.alpha));

      const isAttack = m.type === 'attack';
      const color = isAttack ? '#ef4444' : '#22c55e';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      // Expanding tactical ring
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Crossbars
      const arm = m.radius * 0.65;
      ctx.beginPath();
      ctx.moveTo(m.x - arm, m.y);
      ctx.lineTo(m.x + arm, m.y);
      ctx.moveTo(m.x, m.y - arm);
      ctx.lineTo(m.x, m.y + arm);
      ctx.stroke();

      ctx.restore();
    }

    // Tactical path lines for selected moving player units
    for (const u of this.engine.units) {
      if (u.isPlayer && u.selected && u.path && u.path.length > 0 && u.isMoving) {
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(u.x, u.y);

        const startIndex = Math.min(u.pathIndex ?? 0, u.path.length);
        for (let p = startIndex; p < u.path.length; p++) {
          ctx.lineTo(u.path[p].x, u.path[p].y);
        }
        ctx.stroke();

        // Small waypoint markers
        ctx.fillStyle = 'rgba(34, 197, 94, 0.7)';
        for (let p = startIndex; p < u.path.length; p++) {
          ctx.beginPath();
          ctx.arc(u.path[p].x, u.path[p].y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }
  }

  /** Visualización de ruta: dibuja en el suelo las líneas temporales calculadas hacia el destino */
  private drawPathVisualizations(ctx: CanvasRenderingContext2D) {
    if (!this.engine.pathVisualizations || this.engine.pathVisualizations.length === 0) return;

    const time = Date.now();
    const dashOffset = -((time / 35) % 16);

    for (const pv of this.engine.pathVisualizations) {
      if (!pv.points || pv.points.length < 2) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pv.alpha));

      const isAttack = pv.type === 'attack';
      const mainColor = pv.color || (isAttack ? '#ef4444' : '#22c55e');
      const secColor = pv.secondaryColor || '#38bdf8';

      // 1. Glowing ground underlay
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 4.5;
      ctx.setLineDash([]);
      ctx.globalAlpha = Math.max(0, Math.min(1, pv.alpha * 0.28));
      ctx.beginPath();
      ctx.moveTo(pv.points[0].x, pv.points[0].y);
      for (let i = 1; i < pv.points.length; i++) {
        ctx.lineTo(pv.points[i].x, pv.points[i].y);
      }
      ctx.stroke();

      // 2. Animated tactical dashed center line
      ctx.globalAlpha = Math.max(0, Math.min(1, pv.alpha * 0.88));
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = mainColor;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = dashOffset;
      ctx.beginPath();
      ctx.moveTo(pv.points[0].x, pv.points[0].y);
      for (let i = 1; i < pv.points.length; i++) {
        ctx.lineTo(pv.points[i].x, pv.points[i].y);
      }
      ctx.stroke();

      // 3. Intermediate Waypoint nodes and directional arrows
      ctx.setLineDash([]);
      for (let i = 0; i < pv.points.length; i++) {
        const pt = pv.points[i];
        const isStart = i === 0;
        const isEnd = i === pv.points.length - 1;

        if (isStart) {
          // Origin unit node
          ctx.fillStyle = mainColor;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (isEnd) {
          // Target Destination Tactical Ring & Crosshair
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 7.5, 0, Math.PI * 2);
          ctx.stroke();

          // Inner bullseye
          ctx.fillStyle = secColor;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Small crosshair ticks
          ctx.beginPath();
          ctx.moveTo(pt.x - 11, pt.y);
          ctx.lineTo(pt.x - 4, pt.y);
          ctx.moveTo(pt.x + 4, pt.y);
          ctx.lineTo(pt.x + 11, pt.y);
          ctx.moveTo(pt.x, pt.y - 11);
          ctx.lineTo(pt.x, pt.y - 4);
          ctx.moveTo(pt.x, pt.y + 4);
          ctx.lineTo(pt.x, pt.y + 11);
          ctx.stroke();
        } else {
          // Waypoint vertex corner node
          ctx.fillStyle = mainColor;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw directional arrows along segments if segment is reasonably long
        if (i < pv.points.length - 1) {
          const nextPt = pv.points[i + 1];
          const segDx = nextPt.x - pt.x;
          const segDy = nextPt.y - pt.y;
          const segDist = Math.hypot(segDx, segDy);
          if (segDist > 45) {
            const midX = pt.x + segDx * 0.5;
            const midY = pt.y + segDy * 0.5;
            const angle = Math.atan2(segDy, segDx);

            ctx.save();
            ctx.translate(midX, midY);
            ctx.rotate(angle);
            ctx.strokeStyle = mainColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-4, -4);
            ctx.lineTo(4, 0);
            ctx.lineTo(-4, 4);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      ctx.restore();
    }
  }

  private drawScorches(ctx: CanvasRenderingContext2D) {
    for (const s of this.engine.scorches) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha * 0.8));

      // Dark crater / burn circle
      const grad = ctx.createRadialGradient(s.x, s.y, s.radius * 0.1, s.x, s.y, s.radius);
      grad.addColorStop(0, '#0a0a0a');
      grad.addColorStop(0.5, '#18181b');
      grad.addColorStop(0.85, '#27272a');
      grad.addColorStop(1, 'rgba(39, 39, 42, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();

      // Burnt rubble flecks
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(s.x - s.radius * 0.3, s.y - s.radius * 0.2, s.radius * 0.15, 0, Math.PI * 2);
      ctx.arc(s.x + s.radius * 0.25, s.y + s.radius * 0.3, s.radius * 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private drawStructures(ctx: CanvasRenderingContext2D) {
    const time = Date.now() / 1000;

    for (const struct of this.engine.structures) {
      const isPlayer = struct.isPlayer;

      // FOG OF WAR: Hide enemy structures until discovered!
      let isFoggedExplored = false;
      if (!isPlayer) {
        const fogState = this.engine.getFogState(struct.x, struct.y);
        // Completely hidden if in unexplored shroud (state 0)
        if (fogState === 0) {
          continue;
        }
        // If in explored fog (state 1) but not in active line of sight
        if (fogState === 1) {
          isFoggedExplored = true;
        }
      }

      const mainColor = struct.faction === 'gdi' ? '#ca8a04' : '#b91c1c';
      const accentColor = struct.faction === 'gdi' ? '#eab308' : '#ef4444';
      const halfW = struct.width / 2;
      const halfH = struct.height / 2;

      ctx.save();
      ctx.translate(struct.x, struct.y);
      if (isFoggedExplored) {
        ctx.globalAlpha = 0.45;
      }

      // Structure shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(-halfW + 6, -halfH + 8, struct.width, struct.height, 8);
      ctx.fill();

      // Structure foundation base
      ctx.fillStyle = '#262626';
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, struct.width, struct.height, 6);
      ctx.fill();
      ctx.stroke();

      // Hazard striping / metallic armor plates
      ctx.fillStyle = '#171717';
      ctx.fillRect(-halfW + 8, -halfH + 8, struct.width - 16, struct.height - 16);

      // Type-specific decorations
      if (struct.type === 'conyard') {
        // Rotating radar dish
        ctx.save();
        ctx.rotate(time * 1.5);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -18);
        ctx.stroke();
        ctx.restore();
      } else if (struct.type === 'powerplant') {
        // Glowing reactor core
        const pulse = Math.sin(time * 4) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(56, 189, 248, ${pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        // Cooling towers
        ctx.strokeStyle = '#525252';
        ctx.lineWidth = 2;
        ctx.strokeRect(-halfW + 12, -halfH + 12, 14, 14);
        ctx.strokeRect(halfW - 26, -halfH + 12, 14, 14);
      } else if (struct.type === 'refinery') {
        // Tiberium hopper bay
        ctx.fillStyle = '#15803d';
        ctx.fillRect(-20, -halfH + 10, 40, 24);
        // Unloading ramp
        ctx.fillStyle = '#404040';
        ctx.fillRect(-15, halfH - 16, 30, 16);
      } else if (struct.type === 'turret' || struct.type === 'aaturret') {
        // Rotating gun mount
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        // Barrel
        ctx.strokeStyle = '#d4d4d4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(16, 0);
        ctx.stroke();
      } else if (struct.type === 'superweapon') {
        // Massive energy spire
        const pulse = Math.sin(time * 5) * 0.4 + 0.6;
        ctx.fillStyle = struct.faction === 'gdi' 
          ? `rgba(56, 189, 248, ${pulse})`
          : `rgba(239, 68, 68, ${pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Faction marker indicator
      ctx.fillStyle = accentColor;
      ctx.fillRect(-halfW + 4, -halfH + 4, 8, 8);

      // Mobile Structure Transport Rig (Relocating with Level 2 Engineers)
      if (struct.isBeingMoved) {
        // Heavy crawler track assemblies on both sides
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-halfW - 5, -halfH + 4, 7, struct.height - 8);
        ctx.fillRect(halfW - 2, -halfH + 4, 7, struct.height - 8);
        ctx.fillStyle = '#475569';
        const treadOffset = (Date.now() / 25) % 8;
        for (let ty = -halfH + 4 + treadOffset; ty < halfH - 4; ty += 8) {
          ctx.fillRect(-halfW - 5, ty, 7, 3);
          ctx.fillRect(halfW - 2, ty, 7, 3);
        }

        // Flashing amber hazard warning beacons at the 4 perimeter corners
        const flash = Math.sin(time * 9) > 0;
        ctx.fillStyle = flash ? '#f59e0b' : '#78350f';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = flash ? 8 : 0;
        ctx.beginPath();
        ctx.arc(-halfW + 3, -halfH + 3, 3, 0, Math.PI * 2);
        ctx.arc(halfW - 3, -halfH + 3, 3, 0, Math.PI * 2);
        ctx.arc(-halfW + 3, halfH - 3, 3, 0, Math.PI * 2);
        ctx.arc(halfW - 3, halfH - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Captured Enemy Structure (Infiltrated & Occupied by Engineers)
      if (struct.isCaptured) {
        // Glowing cyan/green tactical occupation banner
        const isPlayerOccupied = struct.isPlayer;
        const bannerColor = isPlayerOccupied ? '#22c55e' : '#ef4444';
        
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = bannerColor;
        ctx.lineWidth = 1.2;
        const badgeW = 76;
        const badgeH = 14;
        ctx.fillRect(-badgeW / 2, -halfH - 26, badgeW, badgeH);
        ctx.strokeRect(-badgeW / 2, -halfH - 26, badgeW, badgeH);

        ctx.fillStyle = bannerColor;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('★ OCUPADO', 0, -halfH - 16);
        ctx.restore();

        // Subtle pulsing cyber-override circuit accents
        ctx.strokeStyle = bannerColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5 + Math.sin(time * 5) * 0.3;
        ctx.strokeRect(-halfW + 4, -halfH + 4, struct.width - 8, struct.height - 8);
        ctx.globalAlpha = 1.0;
      }

      // Tactical Selection HUD Reticle for Selected Structure
      if (this.engine.selectedStructureId === struct.id) {
        const reticleMargin = 6;
        const bLen = 12;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(-halfW - reticleMargin, -halfH - reticleMargin + bLen);
        ctx.lineTo(-halfW - reticleMargin, -halfH - reticleMargin);
        ctx.lineTo(-halfW - reticleMargin + bLen, -halfH - reticleMargin);
        // Top-right
        ctx.moveTo(halfW + reticleMargin - bLen, -halfH - reticleMargin);
        ctx.lineTo(halfW + reticleMargin, -halfH - reticleMargin);
        ctx.lineTo(halfW + reticleMargin, -halfH - reticleMargin + bLen);
        // Bottom-left
        ctx.moveTo(-halfW - reticleMargin, halfH + reticleMargin - bLen);
        ctx.lineTo(-halfW - reticleMargin, halfH + reticleMargin);
        ctx.lineTo(-halfW - reticleMargin + bLen, halfH + reticleMargin);
        // Bottom-right
        ctx.moveTo(halfW + reticleMargin - bLen, halfH + reticleMargin);
        ctx.lineTo(halfW + reticleMargin, halfH + reticleMargin);
        ctx.lineTo(halfW + reticleMargin, halfH + reticleMargin - bLen);
        ctx.stroke();

        // Title and HP HUD Tag
        const structDef = STRUCTURE_DEFS[struct.type] || { name: 'Estructura desconocida' };
        const isDamaged = struct.hp < struct.maxHp;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        const labelText = `${structDef.name.toUpperCase()} [${Math.floor(struct.hp)}/${struct.maxHp}]`;
        const tw = ctx.measureText(labelText).width + 14;
        const tagY = -halfH - (struct.isCaptured ? 38 : 22);
        ctx.fillRect(-tw / 2, tagY - 10, tw, 14);
        ctx.strokeStyle = isDamaged ? '#f59e0b' : '#22c55e';
        ctx.lineWidth = 1;
        ctx.strokeRect(-tw / 2, tagY - 10, tw, 14);
        ctx.fillStyle = isDamaged ? '#fbbf24' : '#4ade80';
        ctx.fillText(labelText, 0, tagY);
      }

      // Health bar and Veterancy Badge / Regeneration indicator (only if damaged or player selected, and in active line of sight)
      const rank = struct.veterancy || 0;
      const isDamaged = struct.hp < struct.maxHp;
      const showStructureBar = !isFoggedExplored && (isDamaged || rank > 0 || this.engine.selectedStructureId === struct.id);

      if (showStructureBar) {
        const barW = Math.max(struct.width * 0.8, 36);
        const hpPercent = Math.max(0, struct.hp / struct.maxHp);
        const now = Date.now() / 1000;
        const lastCombat = Math.max(struct.lastCombatTime || 0, struct.lastFired || 0);
        const isOutOfCombat = (now - lastCombat) > 4.0;
        const isRegenerating = rank >= 2 && isDamaged && isOutOfCombat;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(-barW / 2, -halfH - 12, barW, 6);

        if (isRegenerating) {
          ctx.shadowColor = rank >= 3 ? '#fbbf24' : '#22c55e';
          ctx.shadowBlur = 6 + Math.sin(time * 6) * 3;
        }

        ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(-barW / 2, -halfH - 12, barW * hpPercent, 6);
        ctx.shadowBlur = 0;

        // Structure Health Regeneration indicator icon & badge (+REGEN)
        if (isRegenerating) {
          const pulse = 0.7 + Math.sin(time * 6) * 0.3;
          ctx.fillStyle = rank >= 3 ? `rgba(251, 191, 36, ${pulse})` : `rgba(34, 197, 94, ${pulse})`;
          const crossX = barW / 2 + 6;
          const crossY = -halfH - 9;
          // Cross (+)
          ctx.fillRect(crossX - 3, crossY - 1, 6, 2);
          ctx.fillRect(crossX - 1, crossY - 3, 2, 6);

          // Tag
          ctx.font = 'bold 8px monospace';
          ctx.fillText('REGEN', crossX + 15, crossY + 3);

          // Base footprint nano-repair field aura ring
          ctx.save();
          ctx.strokeStyle = rank >= 3 ? `rgba(251, 191, 36, ${pulse * 0.5})` : `rgba(34, 197, 94, ${pulse * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(-halfW - 3, -halfH - 3, struct.width + 6, struct.height + 6);
          ctx.restore();
        }

        // Structure Veterancy Badge
        if (rank > 0) {
          this.drawStructureVeterancyBadge(ctx, struct, barW, -halfH - 12);
        }
      }

      ctx.restore();
    }
  }

  private drawStructureVeterancyBadge(
    ctx: CanvasRenderingContext2D,
    struct: StructureInstance,
    barW: number,
    barY: number
  ) {
    const rank = struct.veterancy || 0;
    if (rank <= 0) return;

    ctx.save();
    const badgeX = -barW / 2 - 8;
    const badgeY = barY + 3;

    if (rank === 1) {
      // Rank 1: Veteran (Bronze single chevron)
      ctx.fillStyle = '#b45309';
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(badgeX - 4, badgeY + 3);
      ctx.lineTo(badgeX, badgeY - 3);
      ctx.lineTo(badgeX + 4, badgeY + 3);
      ctx.lineTo(badgeX, badgeY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (rank === 2) {
      // Rank 2: Elite (Emerald double chevron)
      ctx.fillStyle = '#15803d';
      ctx.strokeStyle = '#86efac';
      ctx.lineWidth = 1;
      // Chevron 1
      ctx.beginPath();
      ctx.moveTo(badgeX - 4, badgeY + 4);
      ctx.lineTo(badgeX, badgeY - 1);
      ctx.lineTo(badgeX + 4, badgeY + 4);
      ctx.lineTo(badgeX, badgeY + 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Chevron 2
      ctx.beginPath();
      ctx.moveTo(badgeX - 4, badgeY);
      ctx.lineTo(badgeX, badgeY - 5);
      ctx.lineTo(badgeX + 4, badgeY);
      ctx.lineTo(badgeX, badgeY - 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (rank >= 3) {
      // Rank 3: Heroic (Golden star with aura)
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const a2 = a1 + Math.PI / 5;
        const r1 = 5;
        const r2 = 2.2;
        if (i === 0) ctx.moveTo(badgeX + Math.cos(a1) * r1, badgeY + Math.sin(a1) * r1);
        else ctx.lineTo(badgeX + Math.cos(a1) * r1, badgeY + Math.sin(a1) * r1);
        ctx.lineTo(badgeX + Math.cos(a2) * r2, badgeY + Math.sin(a2) * r2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawUnits(ctx: CanvasRenderingContext2D) {
    const time = Date.now() / 1000;

    for (const unit of this.engine.units) {
      // FOG OF WAR: Enemy units are completely hidden until in line-of-sight radius!
      if (!unit.isPlayer && !this.engine.isPositionVisible(unit.x, unit.y)) {
        continue;
      }

      ctx.save();
      
      const isSelected = unit.selected;
      const isPlayer = unit.isPlayer;
      const mainColor = unit.faction === 'gdi' ? '#eab308' : '#ef4444';
      const secondaryColor = unit.faction === 'gdi' ? '#ca8a04' : '#b91c1c';

      // Vertical hover bobbing for aircraft
      let drawX = unit.x;
      let drawY = unit.y;
      if (unit.isAir) {
        drawY += Math.sin(time * 3.5 + (unit.id.charCodeAt(5) || 0)) * 3;
      }

      // Ground Shadow for aircraft
      if (unit.isAir) {
        ctx.save();
        ctx.translate(unit.x, unit.y + 24);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, unit.size * 0.75, unit.size * 0.4, unit.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.translate(drawX, drawY);

      // 1. Selection Circle & Tactical HUD Reticle
      if (isSelected) {
        ctx.strokeStyle = isPlayer ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, unit.size * 0.95, 0, Math.PI * 2);
        ctx.stroke();

        // Animated rotating brackets
        const rotOffset = time * 1.5;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, unit.size * 0.95, rotOffset - 0.35, rotOffset + 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, unit.size * 0.95, rotOffset + Math.PI - 0.35, rotOffset + Math.PI + 0.35);
        ctx.stroke();
      }

      // 2. WALKER ARTICULATED LEGS (drawn below chassis before hull rotation)
      if (unit.type === 'walker') {
        const walkPhase = unit.walkPhase || 0;
        const legStride = Math.sin(walkPhase) * (unit.size * 0.38);

        ctx.save();
        ctx.rotate(unit.rotation);

        // Left Leg
        ctx.save();
        ctx.translate(legStride, -unit.size * 0.35);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#374151';
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.restore();

        // Right Leg (reciprocal)
        ctx.save();
        ctx.translate(-legStride, unit.size * 0.35);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#374151';
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.restore();

        ctx.restore();
      }

      // 3. Chassis Rotation
      ctx.save();
      ctx.rotate(unit.rotation);

      // Aircraft Banking Roll
      if (unit.isAir && unit.bankAngle) {
        ctx.transform(1, 0, unit.bankAngle * 0.45, 1, 0, 0);
      }

      if (unit.type === 'harvester') {
        // Armored heavy harvester chassis
        ctx.fillStyle = '#1f2937';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2;
        ctx.fillRect(-unit.size * 0.5, -unit.size * 0.42, unit.size, unit.size * 0.84);
        ctx.strokeRect(-unit.size * 0.5, -unit.size * 0.42, unit.size, unit.size * 0.84);

        // Continuous Heavy Treads with rolling segments
        const treadOff = unit.treadOffset || 0;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-unit.size * 0.52, -unit.size * 0.45, unit.size * 1.04, 5);
        ctx.fillRect(-unit.size * 0.52, unit.size * 0.45 - 5, unit.size * 1.04, 5);
        ctx.fillStyle = '#475569';
        for (let tx = -unit.size * 0.5 + (treadOff % 8); tx < unit.size * 0.5; tx += 8) {
          ctx.fillRect(tx, -unit.size * 0.45, 2, 5);
          ctx.fillRect(tx, unit.size * 0.45 - 5, 2, 5);
        }

        // Armored Cabin Hood
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, -unit.size * 0.3, unit.size * 0.4, unit.size * 0.6);
        // Cabin Windshield
        ctx.fillStyle = unit.faction === 'gdi' ? '#fbbf24' : '#ef4444';
        ctx.fillRect(unit.size * 0.22, -unit.size * 0.2, 5, unit.size * 0.4);

        // Front Grinding Blade Drum (animated rotation)
        const bladeAngle = unit.harvesterBladeAngle || 0;
        ctx.save();
        ctx.translate(unit.size * 0.52, 0);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-2, -unit.size * 0.38, 7, unit.size * 0.76);
        // Spinning cutter teeth
        ctx.fillStyle = '#94a3b8';
        const toothOffset = Math.sin(bladeAngle) * 3;
        ctx.fillRect(2, -unit.size * 0.32 + toothOffset, 4, unit.size * 0.64);
        ctx.restore();

        // Tiberium Hopper Cargo Bed in rear
        const cargoPercent = Math.min(1, (unit.tiberiumCargo || 0) / 100);
        ctx.fillStyle = '#09090b';
        ctx.fillRect(-unit.size * 0.46, -unit.size * 0.32, unit.size * 0.44, unit.size * 0.64);
        if (cargoPercent > 0) {
          // Luminescent crystalline Tiberium ore
          const crystalGrad = ctx.createRadialGradient(
            -unit.size * 0.25, 0, 1,
            -unit.size * 0.25, 0, unit.size * 0.35
          );
          crystalGrad.addColorStop(0, '#86efac');
          crystalGrad.addColorStop(0.5, '#22c55e');
          crystalGrad.addColorStop(1, '#15803d');
          ctx.fillStyle = crystalGrad;
          ctx.fillRect(
            -unit.size * 0.45,
            -unit.size * 0.3 * cargoPercent,
            unit.size * 0.42,
            unit.size * 0.6 * cargoPercent
          );

          // Crystalline glow pulse
          ctx.shadowColor = '#22c55e';
          ctx.shadowBlur = 6 * cargoPercent;
          ctx.fillStyle = '#dcfce7';
          ctx.beginPath();
          ctx.arc(-unit.size * 0.25, 0, 3 * cargoPercent, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (unit.type === 'tank') {
        // Dual Heavy Armored Treads with animated track teeth
        const treadOff = unit.treadOffset || 0;
        const trackW = unit.size;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-trackW * 0.5, -unit.size * 0.48, trackW, 6);
        ctx.fillRect(-trackW * 0.5, unit.size * 0.48 - 6, trackW, 6);
        // Track tread teeth
        ctx.fillStyle = '#475569';
        for (let tx = -trackW * 0.5 + (treadOff % 7); tx < trackW * 0.5; tx += 7) {
          ctx.fillRect(tx, -unit.size * 0.48, 2, 6);
          ctx.fillRect(tx, unit.size * 0.48 - 6, 2, 6);
        }

        // Tank Sloped Glacis Hull
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(unit.size * 0.42, -unit.size * 0.3);
        ctx.lineTo(unit.size * 0.42, unit.size * 0.3);
        ctx.lineTo(-unit.size * 0.42, unit.size * 0.34);
        ctx.lineTo(-unit.size * 0.45, -unit.size * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Faction identification stripes
        ctx.fillStyle = secondaryColor;
        ctx.fillRect(-unit.size * 0.3, -unit.size * 0.2, 4, unit.size * 0.4);
      } else if (unit.type === 'apc') {
        // 4 High-Traction Wheels
        ctx.fillStyle = '#09090b';
        const wheelW = 8;
        const wheelH = 4;
        ctx.fillRect(unit.size * 0.2, -unit.size * 0.42, wheelW, wheelH);
        ctx.fillRect(-unit.size * 0.35, -unit.size * 0.42, wheelW, wheelH);
        ctx.fillRect(unit.size * 0.2, unit.size * 0.42 - wheelH, wheelW, wheelH);
        ctx.fillRect(-unit.size * 0.35, unit.size * 0.42 - wheelH, wheelW, wheelH);

        // Armored Fast Buggy / APC Hull
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(unit.size * 0.48, -unit.size * 0.22);
        ctx.lineTo(unit.size * 0.48, unit.size * 0.22);
        ctx.lineTo(-unit.size * 0.38, unit.size * 0.32);
        ctx.lineTo(-unit.size * 0.42, -unit.size * 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Front bullbar
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(unit.size * 0.5, -unit.size * 0.2);
        ctx.lineTo(unit.size * 0.5, unit.size * 0.2);
        ctx.stroke();
      } else if (unit.type === 'aircraft') {
        // Sleek VTOL/Jet Aircraft Fuselage
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(unit.size * 0.65, 0);
        ctx.lineTo(-unit.size * 0.35, -unit.size * 0.45);
        ctx.lineTo(-unit.size * 0.15, 0);
        ctx.lineTo(-unit.size * 0.35, unit.size * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Wingtip missile pods
        ctx.fillStyle = '#475569';
        ctx.fillRect(-unit.size * 0.25, -unit.size * 0.48, 8, 3);
        ctx.fillRect(-unit.size * 0.25, unit.size * 0.48 - 3, 8, 3);

        // Cockpit canopy glass
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(unit.size * 0.2, 0, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Afterburner thruster glow
        ctx.fillStyle = unit.faction === 'gdi' ? '#38bdf8' : '#f97316';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.fillRect(-unit.size * 0.42, -3.5, 5, 7);
        ctx.shadowBlur = 0;
      } else if (unit.type === 'walker') {
        // Heavy Titan / Juggernaut Upper Torso
        const bob = Math.abs(Math.sin((unit.walkPhase || 0) * 2)) * 2;
        ctx.translate(0, -bob);

        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-unit.size * 0.42, -unit.size * 0.38, unit.size * 0.84, unit.size * 0.76, 5);
        ctx.fill();
        ctx.stroke();

        // Heavy shoulder armor pauldrons
        ctx.fillStyle = secondaryColor;
        ctx.fillRect(-unit.size * 0.45, -unit.size * 0.44, 7, 6);
        ctx.fillRect(-unit.size * 0.45, unit.size * 0.44 - 6, 7, 6);
      } else if (unit.type === 'engineer') {
        // Combat Engineer: Safety Hard Hat, Utility Tool Backpack, Arc Welder & Nanite Emitter
        const stride = Math.sin(unit.walkPhase || 0) * 4;
        // Legs
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(stride, -3);
        ctx.moveTo(0, 3);
        ctx.lineTo(-stride, 3);
        ctx.stroke();

        // Engineering Tool & Power Backpack
        ctx.fillStyle = '#334155';
        ctx.fillRect(-unit.size * 0.42, -unit.size * 0.28, unit.size * 0.26, unit.size * 0.56);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-unit.size * 0.35, -unit.size * 0.28);
        ctx.lineTo(-unit.size * 0.35, -unit.size * 0.52);
        ctx.stroke();

        // Torso: High-visibility field work uniform
        ctx.fillStyle = unit.faction === 'gdi' ? '#d97706' : '#dc2626';
        ctx.beginPath();
        ctx.arc(0, 0, unit.size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // High-vis reflective safety cross-straps
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-unit.size * 0.1, -unit.size * 0.28, 2.5, unit.size * 0.56);

        // Safety Hard Hat with Headlamp
        ctx.fillStyle = '#facc15'; // Safety Yellow Helmet
        ctx.beginPath();
        ctx.arc(unit.size * 0.15, 0, unit.size * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Headlamp lens
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(unit.size * 0.32, 0, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Nanite repair tool / arc welding emitter
        const isRepairing = unit.engineerAction === 'repairing';
        const isCapturing = unit.engineerAction === 'capturing';
        ctx.strokeStyle = isRepairing ? '#38bdf8' : isCapturing ? '#ef4444' : '#cbd5e1';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(unit.size * 0.1, 0);
        ctx.lineTo(unit.size * 0.65, 0);
        ctx.stroke();

        // Tool emitter tip glow
        ctx.fillStyle = isRepairing ? '#38bdf8' : isCapturing ? '#ef4444' : '#64748b';
        ctx.beginPath();
        ctx.arc(unit.size * 0.65, 0, isRepairing || isCapturing ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Standard Infantry (Rifleman / Missile / Zone Trooper)
        const stride = Math.sin(unit.walkPhase || 0) * 4;
        // Legs
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(stride, -3);
        ctx.moveTo(0, 3);
        ctx.lineTo(-stride, 3);
        ctx.stroke();

        // Torso
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, 0, unit.size * 0.42, 0, Math.PI * 2);
        ctx.fill();

        // Helmet & Visor
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(unit.size * 0.15, 0, unit.size * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // Weapon barrel
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(unit.size * 0.1, 0);
        ctx.lineTo(unit.size * 0.65, 0);
        ctx.stroke();
      }

      ctx.restore(); // Restore chassis rotation

      // 4. SEPARATE TURRET ROTATION & BARREL RECOIL (Tanks, Walkers, APC)
      if (unit.type === 'tank' || unit.type === 'walker' || unit.type === 'apc') {
        ctx.save();
        ctx.rotate(unit.turretRotation ?? unit.rotation);

        const recoilOffset = (unit.recoil || 0) * (unit.type === 'walker' ? 7 : 5.5);

        if (unit.type === 'tank') {
          // Turret cupola ring
          ctx.fillStyle = '#334155';
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(-2, 0, unit.size * 0.26, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Gun Mantlet
          ctx.fillStyle = '#475569';
          ctx.fillRect(unit.size * 0.16, -4, 5, 8);

          // Cannon barrel with physical slide recoil
          const barrelStart = unit.size * 0.2 - recoilOffset;
          const barrelEnd = unit.size * 0.72 - recoilOffset;
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(barrelStart, 0);
          ctx.lineTo(barrelEnd, 0);
          ctx.stroke();

          // Muzzle Brake
          ctx.fillStyle = '#64748b';
          ctx.fillRect(barrelEnd - 3, -3, 3.5, 6);
        } else if (unit.type === 'walker') {
          // Colossal Siege Turret
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, unit.size * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Dual Heavy Artillery Cannons with recoil
          const barrelEnd = unit.size * 0.75 - recoilOffset;
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(unit.size * 0.1, -4);
          ctx.lineTo(barrelEnd, -4);
          ctx.moveTo(unit.size * 0.1, 4);
          ctx.lineTo(barrelEnd, 4);
          ctx.stroke();
        } else if (unit.type === 'apc') {
          // Roof pintle rotating machine gun
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, unit.size * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(unit.size * 0.55 - recoilOffset, 0);
          ctx.stroke();
        }

        ctx.restore();
      }

      // 5. Unit Health Bar & Experience Bar Overlay
      const barW = unit.size * 1.1;
      const hasKills = (unit.kills || 0) > 0;
      const rank = unit.veterancy || 0;
      const showHealthBar = unit.hp < unit.maxHp || isSelected || hasKills || rank > 0;
      const showXpBar = isSelected || hasKills || rank > 0;

      if (showHealthBar) {
        const hpPercent = Math.max(0, unit.hp / unit.maxHp);
        const isRegenerating = rank >= 1 && unit.hp < unit.maxHp;

        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(-barW / 2, -unit.size * 0.7 - 5.5, barW, 4);

        if (isRegenerating) {
          ctx.shadowColor = rank >= 2 ? '#22c55e' : '#38bdf8';
          ctx.shadowBlur = 4 + Math.sin(time * 6) * 2;
        }

        ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(-barW / 2, -unit.size * 0.7 - 5.5, barW * hpPercent, 4);
        ctx.shadowBlur = 0;

        // Passive health regeneration indicator icon (+) for Veteran and Elite units
        if (isRegenerating) {
          const pulse = 0.65 + Math.sin(time * 6) * 0.35;
          ctx.fillStyle = rank >= 2 ? `rgba(34, 197, 94, ${pulse})` : `rgba(56, 189, 248, ${pulse})`;
          const crossX = barW / 2 + 5;
          const crossY = -unit.size * 0.7 - 3.5;
          ctx.fillRect(crossX - 3, crossY - 1, 6, 2);
          ctx.fillRect(crossX - 1, crossY - 3, 2, 6);
        }
      }

      // 5.5 Harvester Tiberium Cargo Bar (when carrying ore or selected)
      if (unit.type === 'harvester' && ((unit.tiberiumCargo || 0) > 0 || isSelected)) {
        const cargoPercent = Math.min(1, Math.max(0, (unit.tiberiumCargo || 0) / 100));
        const cargoY = -unit.size * 0.7 - (showHealthBar ? 11 : 5.5);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(-barW / 2, cargoY, barW, 3.5);
        ctx.fillStyle = '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 4;
        ctx.fillRect(-barW / 2, cargoY, barW * cargoPercent, 3.5);
        ctx.shadowBlur = 0;
      }

      // 6. Unit Experience Bar Overlay (Veterancy progress based on kills)
      if (showXpBar) {
        this.drawExperienceBar(ctx, unit, barW);
      }

      // 7. Unit Veterancy Rank Badge docked next to HP bar
      if (rank > 0) {
        this.drawVeterancyBadge(ctx, unit, barW, showXpBar);
      }

      ctx.restore();
    }
  }

  /** Visual experience bar overlay indicating progress to next veterancy rank */
  private drawExperienceBar(ctx: CanvasRenderingContext2D, unit: UnitInstance, barW: number) {
    const kills = unit.kills || 0;
    const rank = unit.veterancy || 0;
    const barH = 3;
    const barY = -unit.size * 0.7 - 10.5;

    let progress = 0;
    let neededInTier = 3;
    let killsInTier = 0;
    let fillColor = '#06b6d4'; // Cyan
    let isMaxRank = false;

    if (unit.type === 'engineer') {
      if (rank >= 3) {
        isMaxRank = true;
        progress = 1.0;
        fillColor = '#fbbf24';
      } else {
        neededInTier = 1;
        progress = Math.min(1.0, (unit.engineerXp || 0) / 300);
        fillColor = rank >= 2 ? '#eab308' : rank >= 1 ? '#38bdf8' : '#06b6d4';
      }
    } else if (rank >= 3 || kills >= 12) {
      isMaxRank = true;
      progress = 1.0;
      fillColor = '#fbbf24'; // Gold
    } else if (rank === 2 || kills >= 7) {
      neededInTier = 5; // 7 -> 12 kills
      killsInTier = Math.max(0, kills - 7);
      progress = Math.min(1.0, killsInTier / neededInTier);
      fillColor = '#eab308'; // Amber/Gold (Elite -> Heroic)
    } else if (rank === 1 || kills >= 3) {
      neededInTier = 4; // 3 -> 7 kills
      killsInTier = Math.max(0, kills - 3);
      progress = Math.min(1.0, killsInTier / neededInTier);
      fillColor = '#38bdf8'; // Sky blue (Veteran -> Elite)
    } else {
      neededInTier = 3; // 0 -> 3 kills
      killsInTier = Math.max(0, kills);
      progress = Math.min(1.0, killsInTier / neededInTier);
      fillColor = '#06b6d4'; // Cyan (Recruit -> Veteran)
    }

    ctx.save();

    // 1. Dark tactical background container
    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.fillRect(-barW / 2 - 0.5, barY - 0.5, barW + 1, barH + 1);

    // 2. Experience progress fill
    if (isMaxRank) {
      // Heroic pulse glow for maximum veterancy
      const pulse = 0.85 + Math.sin(Date.now() / 150) * 0.15;
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 4 * pulse;
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.shadowBlur = 0;
    } else {
      const fillW = Math.max(0, Math.min(barW, barW * progress));
      if (fillW > 0) {
        ctx.fillStyle = fillColor;
        ctx.shadowColor = fillColor;
        ctx.shadowBlur = 3;
        ctx.fillRect(-barW / 2, barY, fillW, barH);
        ctx.shadowBlur = 0;

        // Leading edge bright pip indicator
        if (progress > 0 && progress < 1) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-barW / 2 + fillW - 1, barY, 1.2, barH);
        }
      }

      // Tactical segment notches (dividers for each kill needed in current tier)
      if (neededInTier > 1) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        for (let i = 1; i < neededInTier; i++) {
          const notchX = -barW / 2 + (barW * i) / neededInTier;
          ctx.fillRect(notchX - 0.5, barY, 1, barH);
        }
      }
    }

    // 3. Subtle tactical outer border
    ctx.strokeStyle = isMaxRank ? 'rgba(251, 191, 36, 0.7)' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-barW / 2 - 0.5, barY - 0.5, barW + 1, barH + 1);

    ctx.restore();
  }

  /**
   * Visual 'veterancy badge' system rendering unique rank icons (e.g., chevrons, stars)
   * docked immediately next to the unit HP bar in the CanvasRenderer based on veterancy level.
   */
  private drawVeterancyBadge(ctx: CanvasRenderingContext2D, unit: UnitInstance, barW: number, showXpBar: boolean) {
    const rank = unit.veterancy || 0;
    if (rank <= 0) return;

    ctx.save();

    // Position docked immediately next to the left edge of the HP bar
    const badgeX = -barW / 2 - 8;
    const badgeY = showXpBar ? (-unit.size * 0.7 - 6.0) : (-unit.size * 0.7 - 3.5);
    ctx.translate(badgeX, badgeY);

    // 1. Tactical badge backing shield
    ctx.beginPath();
    ctx.moveTo(-5.5, -5.5);
    ctx.lineTo(5.5, -5.5);
    ctx.lineTo(5.5, 2.5);
    ctx.lineTo(0, 6.5);
    ctx.lineTo(-5.5, 2.5);
    ctx.closePath();

    if (rank === 1) {
      // --- Rank 1: Veteran (Single Silver / Cyan Chevron) ---
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      // Sharp glowing cyan chevron: ^
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 4;

      ctx.beginPath();
      ctx.moveTo(-3.8, 2.2);
      ctx.lineTo(0, -2.5);
      ctx.lineTo(3.8, 2.2);
      ctx.stroke();

      // Central silver illuminated pip
      ctx.fillStyle = '#f0f9ff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
      ctx.fill();

    } else if (rank === 2) {
      // --- Rank 2: Elite (Double Golden Chevron) ---
      ctx.fillStyle = 'rgba(24, 18, 8, 0.95)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 5;

      // Lower golden chevron
      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(-3.8, 3.2);
      ctx.lineTo(0, -0.6);
      ctx.lineTo(3.8, 3.2);
      ctx.stroke();

      // Upper bright gold chevron
      ctx.strokeStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(-3.8, -0.8);
      ctx.lineTo(0, -4.6);
      ctx.lineTo(3.8, -0.8);
      ctx.stroke();

    } else if (rank >= 3) {
      // --- Rank 3: Heroic (Crimson Shield + Winged Chevrons + Pulsating Star) ---
      const pulse = 0.88 + Math.sin(Date.now() / 130) * 0.12;

      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 7 * pulse;
      ctx.fill();
      ctx.stroke();

      // Lower winged golden chevron
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(-4, 3.5);
      ctx.lineTo(0, 0.8);
      ctx.lineTo(4, 3.5);
      ctx.stroke();

      // Brilliant 5-Pointed Heroic Gold Star
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const starY = -1.6;
      for (let i = 0; i < 5; i++) {
        const outerAngle = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const innerAngle = outerAngle + Math.PI / 5;
        const rOuter = 3.6 * pulse;
        const rInner = 1.5 * pulse;
        if (i === 0) {
          ctx.moveTo(Math.cos(outerAngle) * rOuter, starY + Math.sin(outerAngle) * rOuter);
        } else {
          ctx.lineTo(Math.cos(outerAngle) * rOuter, starY + Math.sin(outerAngle) * rOuter);
        }
        ctx.lineTo(Math.cos(innerAngle) * rInner, starY + Math.sin(innerAngle) * rInner);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    for (const p of this.engine.projectiles) {
      // Hide enemy projectiles fired in undiscovered fog
      if (!p.isPlayer && !this.engine.isPositionVisible(p.x, p.y) && !this.engine.isPositionVisible(p.targetX, p.targetY)) {
        continue;
      }

      ctx.save();

      if (p.type === 'laser') {
        // High-energy tactical laser beam with core and outer glow
        // Outer glow beam
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 5.5;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(p.startX, p.startY);
        ctx.lineTo(p.targetX, p.targetY);
        ctx.stroke();

        // Inner beam
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Intense white beam core
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(p.startX, p.startY);
        ctx.lineTo(p.targetX, p.targetY);
        ctx.stroke();

        // Origin and target flare points
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.startX, p.startY, 3.5, 0, Math.PI * 2);
        ctx.arc(p.targetX, p.targetY, 4.5, 0, Math.PI * 2);
        ctx.fill();

      } else if (p.type === 'ion') {
        // Orbital Ion Strike Pillar
        const grad = ctx.createLinearGradient(p.targetX, 0, p.targetX, p.targetY);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 28;
        ctx.beginPath();
        ctx.moveTo(p.targetX, p.targetY - 900);
        ctx.lineTo(p.targetX, p.targetY);
        ctx.stroke();

        // Expanding ground shockwave
        const age = (Date.now() - p.createdAt) / 1000;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(p.targetX, p.targetY, age * 90, 0, Math.PI * 2);
        ctx.stroke();

      } else if (p.type === 'nuke') {
        // Descending ICBM
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();

      } else if (p.type === 'cannon') {
        // High-velocity kinetic tank / turret cannon tracer sabot
        const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
        const tracerLen = 28;
        const tailX = p.x - Math.cos(angle) * tracerLen;
        const tailY = p.y - Math.sin(angle) * tracerLen;

        // Glowing tracer streak
        const grad = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
        grad.addColorStop(0, 'rgba(234, 88, 12, 0)');
        grad.addColorStop(0.3, 'rgba(249, 115, 22, 0.6)');
        grad.addColorStop(0.8, '#fde047');
        grad.addColorStop(1, '#ffffff');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // Incandescent sabot head
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#fef08a';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Outer soft glow halo
        ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();

      } else if (p.type === 'rocket') {
        // Guided rocket / missile with exhaust flame & smoke
        const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);

        // Rocket body
        ctx.fillStyle = '#334155';
        ctx.fillRect(-8, -2, 14, 4);

        // Nosecone warhead
        ctx.fillStyle = p.color || '#ef4444';
        ctx.beginPath();
        ctx.moveTo(6, -2);
        ctx.lineTo(10, 0);
        ctx.lineTo(6, 2);
        ctx.closePath();
        ctx.fill();

        // Tail fins
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-8, -4, 3, 8);

        // Fiery thruster exhaust flame
        const flameLen = 8 + Math.random() * 6;
        const flameGrad = ctx.createLinearGradient(0, 0, -8 - flameLen, 0);
        flameGrad.addColorStop(0, '#ffffff');
        flameGrad.addColorStop(0.3, '#fef08a');
        flameGrad.addColorStop(0.7, '#f97316');
        flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');

        ctx.fillStyle = flameGrad;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(-8, -2.5);
        ctx.lineTo(-8 - flameLen, 0);
        ctx.lineTo(-8, 2.5);
        ctx.closePath();
        ctx.fill();

      } else {
        // High-speed machine gun / defense turret tracer dart
        const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
        const tracerLen = 18;
        const tailX = p.x - Math.cos(angle) * tracerLen;
        const tailY = p.y - Math.sin(angle) * tracerLen;

        const grad = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
        grad.addColorStop(0, 'rgba(254, 240, 138, 0)');
        grad.addColorStop(0.5, p.color);
        grad.addColorStop(1, '#ffffff');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // Bright projectile tip
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.engine.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));

      if (p.type === 'shockwave') {
        // Expanding blast shockwave ring
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 4 * p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'explosion') {
        // Glowing multi-layered fireball
        const r = Math.max(1, p.size);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, p.color);
        grad.addColorStop(0.75, '#ea580c');
        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'smoke') {
        // Soft billowing smoke cloud
        const r = Math.max(1, p.size);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, p.color);
        grad.addColorStop(0.65, p.color);
        grad.addColorStop(1, 'rgba(24, 24, 27, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark') {
        // Fast sharp incandescent ember
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'debris') {
        // Flying spinning shrapnel / jagged shard
        ctx.translate(p.x, p.y);
        if (p.rotation !== undefined) {
          ctx.rotate(p.rotation);
        }
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, Math.max(2, p.size * 0.7));
      } else if (p.type === 'tiberium_spore') {
        // Volatile Tiberium gas spore / crystal fragment
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Default particle
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Updates combat particle spawners (damage tracking for sparks, smoke, and debris on units & structures)
   * and simulates active particles.
   */
  private updateCombatFeedback(dt: number) {
    const activeUnitIds = new Set<string>();
    const activeStructIds = new Set<string>();

    // 1. Units Damage Feedback & Critical Health Smoke
    for (const unit of this.engine.units) {
      if (unit.hp <= 0) continue;
      activeUnitIds.add(unit.id);

      // Damage detection: Chispas, Humo y Escombros al recibir daño
      const prevHp = this.unitHpHistory.get(unit.id);
      if (prevHp !== undefined && unit.hp < prevHp) {
        const damageTaken = prevHp - unit.hp;
        this.spawnUnitDamageParticles(unit, damageTaken);
      }
      this.unitHpHistory.set(unit.id, unit.hp);

      // Persistent critical damage smoke trail for units (< 25% HP)
      const healthRatio = unit.hp / unit.maxHp;
      if (healthRatio < 0.25) {
        let timer = (this.unitSmokeTimers.get(unit.id) || 0) + dt;
        if (timer >= 0.06) {
          timer = 0;
          this.spawnCriticalBlackSmoke(unit);
        }
        this.unitSmokeTimers.set(unit.id, timer);
      }
    }

    // 2. Structures Damage Feedback & Critical Damage Smoke
    for (const struct of this.engine.structures) {
      if (struct.hp <= 0) continue;
      activeStructIds.add(struct.id);

      // Damage detection: Chispas, Humo y Escombros al recibir daño
      const prevHp = this.structureHpHistory.get(struct.id);
      if (prevHp !== undefined && struct.hp < prevHp) {
        const damageTaken = prevHp - struct.hp;
        this.spawnStructureDamageParticles(struct, damageTaken);
      }
      this.structureHpHistory.set(struct.id, struct.hp);

      // Persistent damaged building smoke & short-circuit sparks (< 40% HP)
      const healthRatio = struct.hp / struct.maxHp;
      if (healthRatio < 0.40) {
        let timer = (this.structureSmokeTimers.get(struct.id) || 0) + dt;
        if (timer >= 0.12) {
          timer = 0;
          this.spawnStructureSmokeAndSparks(struct);
        }
        this.structureSmokeTimers.set(struct.id, timer);
      }
    }

    // Clean up tracking for destroyed/removed entities
    for (const id of this.unitHpHistory.keys()) {
      if (!activeUnitIds.has(id)) {
        this.unitHpHistory.delete(id);
        this.unitSmokeTimers.delete(id);
      }
    }
    for (const id of this.structureHpHistory.keys()) {
      if (!activeStructIds.has(id)) {
        this.structureHpHistory.delete(id);
        this.structureSmokeTimers.delete(id);
      }
    }

    // Simulate active combat particles
    const alive: CombatVFXParticle[] = [];
    for (const p of this.combatParticles) {
      p.life += dt;
      if (p.life < p.maxLife) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Apply drag deceleration
        const dragFactor = Math.pow(p.drag, dt * 60);
        p.vx *= dragFactor;
        p.vy *= dragFactor;

        if (p.gravity) {
          p.vy += p.gravity * dt;
        }

        if (p.vRot) {
          p.rotation = (p.rotation || 0) + p.vRot * dt;
        }

        const progress = p.life / p.maxLife;

        if (p.type === 'smoke' || p.type === 'black_smoke') {
          // Billow and expand outward
          p.size += (p.maxSize - p.size) * (dt * 3.2);
          p.alpha = Math.max(0, (1 - progress) * 0.88);
        } else if (p.type === 'debris') {
          // Debris fades as it tumbles to the ground
          p.alpha = Math.max(0, 1 - Math.pow(progress, 2.5));
        } else {
          // Sharp incandescent spark decay
          p.alpha = Math.max(0, 1 - progress);
        }

        alive.push(p);
      }
    }

    // Performance cap
    this.combatParticles = alive.length > 350 ? alive.slice(alive.length - 350) : alive;
  }

  /**
   * Spawns rich combat feedback particles (chispas, humo y escombros) when a unit takes damage.
   */
  public spawnUnitDamageParticles(unit: UnitInstance, damage: number) {
    if (this.combatParticles.length > 340) return;
    const intensity = Math.min(1.8, Math.max(0.6, damage / 40));

    // 1. CHISPAS (Incandescent high-speed sparks)
    const sparkCount = Math.min(22, Math.max(7, Math.floor(damage * 0.4) + 6));
    const sparkColors = ['#ffffff', '#fef08a', '#facc15', '#fb923c', '#ef4444', '#38bdf8'];
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 210 * intensity;
      const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
      const size = 1.6 + Math.random() * 2.0;
      const maxLife = 0.18 + Math.random() * 0.24;

      this.combatParticles.push({
        id: `spk_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: unit.x + (Math.random() - 0.5) * (unit.size * 0.7),
        y: unit.y + (Math.random() - 0.5) * (unit.size * 0.7),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 15,
        size,
        maxSize: size * 0.4,
        alpha: 1.0,
        life: 0,
        maxLife,
        color,
        drag: 0.90,
        gravity: 45,
      });
    }

    // 2. HUMO (Dark expanding smoke puffs from impact explosion)
    const smokeCount = Math.min(6, Math.max(2, Math.floor(damage * 0.12) + 2));
    const smokeColors = ['#09090b', '#18181b', '#27272a', '#1f2937', '#111827'];
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 45;
      const color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
      const initialSize = 4.5 + Math.random() * 3.5;
      const maxSize = 16 + Math.random() * 16 * intensity;
      const maxLife = 0.45 + Math.random() * 0.35;

      this.combatParticles.push({
        id: `smk_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: unit.x + (Math.random() - 0.5) * (unit.size * 0.5),
        y: unit.y + (Math.random() - 0.5) * (unit.size * 0.5),
        vx: Math.cos(angle) * speed,
        vy: -20 - Math.random() * 30, // Upward thermal lift
        size: initialSize,
        maxSize,
        alpha: 0.85,
        life: 0,
        maxLife,
        color,
        drag: 0.92,
      });
    }

    // 3. ESCOMBROS (Shattered armor chunks and tumbling metal fragments)
    const isVehicle = unit.type === 'tank' || unit.type === 'harvester' || unit.type === 'walker' || unit.type === 'apc' || unit.isAir;
    const debrisCount = isVehicle 
      ? Math.min(8, Math.max(3, Math.floor(damage * 0.15) + 3))
      : Math.min(4, Math.max(1, Math.floor(damage * 0.08) + 1));
    const debrisColors = isVehicle 
      ? ['#52525b', '#3f3f46', '#27272a', '#71717a', '#a1a1aa', '#b45309']
      : ['#292524', '#44403c', '#57534e'];

    for (let i = 0; i < debrisCount; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 1.5 - Math.PI / 2; // Upward-biased explosive ejection arc
      const speed = 70 + Math.random() * 150 * intensity;
      const color = debrisColors[Math.floor(Math.random() * debrisColors.length)];
      const size = (isVehicle ? 3.0 : 2.0) + Math.random() * 3.5;
      const maxLife = 0.5 + Math.random() * 0.4;

      this.combatParticles.push({
        id: `deb_${Date.now()}_${Math.random()}`,
        type: 'debris',
        x: unit.x + (Math.random() - 0.5) * (unit.size * 0.5),
        y: unit.y + (Math.random() - 0.5) * (unit.size * 0.5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        maxSize: size,
        alpha: 1.0,
        life: 0,
        maxLife,
        color,
        drag: 0.92,
        gravity: 360,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 16,
        aspectRatio: 0.4 + Math.random() * 0.8,
      });
    }
  }

  /**
   * Spawns rich combat feedback particles (chispas, humo y escombros) when a structure takes damage.
   */
  public spawnStructureDamageParticles(struct: StructureInstance, damage: number) {
    if (this.combatParticles.length > 340) return;
    const intensity = Math.min(2.0, Math.max(0.7, damage / 50));
    const hitX = struct.x + (Math.random() - 0.5) * (struct.width * 0.75);
    const hitY = struct.y + (Math.random() - 0.5) * (struct.height * 0.75);

    // 1. CHISPAS (Electrical short circuits and metal ricochet sparks)
    const sparkCount = Math.min(28, Math.max(10, Math.floor(damage * 0.45) + 8));
    const sparkColors = ['#ffffff', '#fde047', '#facc15', '#f97316', '#ef4444', '#60a5fa'];
    for (let i = 0; i < sparkCount; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 1.6 - Math.PI / 2; // Ejecting upwards from building
      const speed = 100 + Math.random() * 220 * intensity;
      const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
      const size = 1.8 + Math.random() * 2.2;
      const maxLife = 0.2 + Math.random() * 0.26;

      this.combatParticles.push({
        id: `s_spk_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: hitX + (Math.random() - 0.5) * 12,
        y: hitY + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        maxSize: size * 0.4,
        alpha: 1.0,
        life: 0,
        maxLife,
        color,
        drag: 0.90,
        gravity: 50,
      });
    }

    // 2. HUMO (Dense billowing smoke columns bursting from building roof/facade)
    const smokeCount = Math.min(8, Math.max(3, Math.floor(damage * 0.16) + 3));
    const smokeColors = ['#09090b', '#18181b', '#27272a', '#3f3f46', '#111827'];
    for (let i = 0; i < smokeCount; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 1.4 - Math.PI / 2;
      const speed = 25 + Math.random() * 55;
      const color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
      const initialSize = 6 + Math.random() * 5;
      const maxSize = 24 + Math.random() * 24 * intensity;
      const maxLife = 0.6 + Math.random() * 0.45;

      this.combatParticles.push({
        id: `s_smk_${Date.now()}_${Math.random()}`,
        type: 'smoke',
        x: hitX + (Math.random() - 0.5) * 16,
        y: hitY + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 15,
        vy: -28 - Math.random() * 35, // High upward thermal draft
        size: initialSize,
        maxSize,
        alpha: 0.88,
        life: 0,
        maxLife,
        color,
        drag: 0.93,
      });
    }

    // 3. ESCOMBROS (Masonry concrete rubble blocks and reinforced steel rebar fragments)
    const debrisCount = Math.min(12, Math.max(5, Math.floor(damage * 0.22) + 4));
    const debrisColors = ['#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#3f3f46'];
    for (let i = 0; i < debrisCount; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 1.6 - Math.PI / 2; // Upward explosion blast
      const speed = 80 + Math.random() * 190 * intensity;
      const color = debrisColors[Math.floor(Math.random() * debrisColors.length)];
      const size = 3.5 + Math.random() * 5.5;
      const maxLife = 0.6 + Math.random() * 0.5;

      this.combatParticles.push({
        id: `s_deb_${Date.now()}_${Math.random()}`,
        type: 'debris',
        x: hitX + (Math.random() - 0.5) * 14,
        y: hitY + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        maxSize: size,
        alpha: 1.0,
        life: 0,
        maxLife,
        color,
        drag: 0.92,
        gravity: 420,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 18,
        aspectRatio: 0.45 + Math.random() * 0.9,
      });
    }
  }

  /**
   * Spawns sharp incandescent sparks radiating from damaged unit (retained for backward compatibility).
   */
  public spawnDamageSparks(unit: UnitInstance, damage: number) {
    this.spawnUnitDamageParticles(unit, damage);
  }

  /**
   * Spawns dense black smoke puff billowing and trailing behind a critical unit (< 25% HP).
   */
  private spawnCriticalBlackSmoke(unit: UnitInstance) {
    if (this.combatParticles.length > 340) return;

    let emitX = unit.x;
    let emitY = unit.y;
    let vx = (Math.random() - 0.5) * 10;
    let vy = -26 - Math.random() * 20; // Strong upward thermal lift

    if (unit.isAir) {
      // Trail behind fuselage
      const trailAngle = unit.rotation + Math.PI;
      emitX = unit.x + Math.cos(trailAngle) * (unit.size * 0.5);
      emitY = unit.y + Math.sin(trailAngle) * (unit.size * 0.5);
      const fwdSpeed = unit.currentSpeed || unit.speed;
      vx = -Math.cos(unit.rotation) * (fwdSpeed * 0.3) + (Math.random() - 0.5) * 8;
      vy = -Math.sin(unit.rotation) * (fwdSpeed * 0.3) - 20;
    } else if (unit.type === 'tank' || unit.type === 'harvester' || unit.type === 'apc' || unit.type === 'walker') {
      // Trail behind vehicle engine deck / hull
      const rearAngle = unit.rotation + Math.PI;
      emitX = unit.x + Math.cos(rearAngle) * (unit.size * 0.35) + (Math.random() - 0.5) * 6;
      emitY = unit.y + Math.sin(rearAngle) * (unit.size * 0.35) + (Math.random() - 0.5) * 6;
      if (unit.isMoving) {
        const driftSpeed = (unit.currentSpeed || unit.speed) * 0.22;
        vx -= Math.cos(unit.rotation) * driftSpeed;
        vy -= Math.sin(unit.rotation) * driftSpeed;
      }
    } else {
      // Damaged infantry armor
      emitY = unit.y - unit.size * 0.2;
    }

    // Pure black soot and deep charcoal palette
    const blackColors = ['#000000', '#09090b', '#111827', '#18181b', '#1f2937'];
    const color = blackColors[Math.floor(Math.random() * blackColors.length)];
    const initialSize = 4.5 + Math.random() * 3.5;
    const maxSize = 18 + Math.random() * 12;
    const maxLife = 0.75 + Math.random() * 0.45;

    this.combatParticles.push({
      id: `blk_smk_${Date.now()}_${Math.random()}`,
      type: 'black_smoke',
      x: emitX,
      y: emitY,
      vx,
      vy,
      size: initialSize,
      maxSize,
      alpha: 0.88,
      life: 0,
      maxLife,
      color,
      drag: 0.94,
    });

    // 25% chance of burning ember rising with the black smoke
    if (Math.random() < 0.25) {
      this.combatParticles.push({
        id: `blk_embr_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: emitX + (Math.random() - 0.5) * 4,
        y: emitY + (Math.random() - 0.5) * 4,
        vx: vx * 1.2 + (Math.random() - 0.5) * 35,
        vy: vy * 1.2 - Math.random() * 25,
        size: 2.0,
        maxSize: 0.8,
        alpha: 1.0,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.2,
        color: '#f97316',
        drag: 0.92,
      });
    }
  }

  /**
   * Emits burning smoke columns and intermittent generator sparks on heavily damaged structures (< 40% HP).
   */
  private spawnStructureSmokeAndSparks(struct: StructureInstance) {
    if (this.combatParticles.length > 340) return;
    const sx = struct.x + (Math.random() - 0.5) * (struct.width * 0.7);
    const sy = struct.y - struct.height * 0.2 + (Math.random() - 0.5) * (struct.height * 0.4);

    this.combatParticles.push({
      id: `s_dmg_smk_${Date.now()}_${Math.random()}`,
      type: 'smoke',
      x: sx,
      y: sy,
      vx: (Math.random() - 0.5) * 12,
      vy: -24 - Math.random() * 22,
      size: 5 + Math.random() * 4,
      maxSize: 22 + Math.random() * 12,
      alpha: 0.85,
      life: 0,
      maxLife: 0.8 + Math.random() * 0.4,
      color: '#18181b',
      drag: 0.94,
    });

    if (Math.random() < 0.35) {
      this.combatParticles.push({
        id: `s_dmg_spk_${Date.now()}_${Math.random()}`,
        type: 'spark',
        x: sx + (Math.random() - 0.5) * 6,
        y: sy,
        vx: (Math.random() - 0.5) * 45,
        vy: -20 - Math.random() * 35,
        size: 2.0,
        maxSize: 0.8,
        alpha: 1.0,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2,
        color: Math.random() < 0.5 ? '#f97316' : '#60a5fa', // Electrical blue or fire orange
        drag: 0.91,
      });
    }
  }

  /**
   * Draws combat feedback particles: volumetric smoke plumes, incandescent sparks, and tumbling debris.
   */
  private drawCombatParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.combatParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));

      if (p.type === 'smoke' || p.type === 'black_smoke') {
        const r = Math.max(2, p.size);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        // Opaque black soot core transitioning to soft dark charcoal edges
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
        grad.addColorStop(0.35, p.color);
        grad.addColorStop(0.7, 'rgba(24, 24, 27, 0.45)');
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
        ctx.fill();

        // High speed motion tail streak
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 35) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.8, p.size * 0.7);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
          ctx.stroke();
        }
      } else if (p.type === 'debris') {
        ctx.translate(p.x, p.y);
        if (p.rotation !== undefined) {
          ctx.rotate(p.rotation);
        }
        ctx.fillStyle = p.color;
        const w = p.size;
        const h = p.size * (p.aspectRatio || 0.65);
        ctx.fillRect(-w / 2, -h / 2, w, h);

        // Metallic/concrete edge highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-w / 2, h / 2);
        ctx.lineTo(-w / 2, -h / 2);
        ctx.lineTo(w / 2, -h / 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * Renders high-fidelity Fog of War visual mask effect:
   * Masks parts of the map not currently covered by player units or structures.
   * - Unexplored terrain is masked in deep impenetrable black shroud.
   * - Explored terrain outside active line-of-sight is masked in dark atmospheric tactical shadow fog.
   * - Active player units and structures dynamically punch out soft feathered illumination circles.
   */
  private drawFogOfWar(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, camX: number, camY: number) {
    if (this.fogCanvas.width !== vpW || this.fogCanvas.height !== vpH) {
      this.fogCanvas.width = vpW;
      this.fogCanvas.height = vpH;
    }

    const fctx = this.fogCtx;
    fctx.clearRect(0, 0, vpW, vpH);

    // 1. Base Layer: Atmospheric tactical fog masking all explored regions outside active vision
    fctx.fillStyle = 'rgba(6, 11, 22, 0.78)';
    fctx.fillRect(0, 0, vpW, vpH);

    // 2. Unexplored Shroud Layer: Solid pitch-black mask for unvisited territory
    const cellSize = this.engine.fogCellSize;
    const gridW = this.engine.fogGridWidth;
    const gridH = this.engine.fogGridHeight;

    const startX = Math.max(0, Math.floor(camX / cellSize));
    const endX = Math.min(gridW, Math.ceil((camX + vpW) / cellSize) + 1);
    const startY = Math.max(0, Math.floor(camY / cellSize));
    const endY = Math.min(gridH, Math.ceil((camY + vpH) / cellSize) + 1);

    fctx.fillStyle = '#02040a';
    for (let cy = startY; cy < endY; cy++) {
      for (let cx = startX; cx < endX; cx++) {
        const state = this.engine.fogGrid[cy * gridW + cx];
        if (state === 0) {
          const sx = cx * cellSize - camX;
          const sy = cy * cellSize - camY;
          fctx.fillRect(sx, sy, cellSize + 0.8, cellSize + 0.8);
        }
      }
    }

    // 3. Volumetric Line-of-Sight Punch-Out:
    // Carve soft feathered illumination holes for areas actively covered by player units and structures
    fctx.globalCompositeOperation = 'destination-out';
    const visMult = this.engine.weather.visibilityMultiplier;

    // Active vision circles around player structures
    for (const s of this.engine.structures) {
      if (s.isPlayer && s.hp > 0) {
        let baseRadius = 260;
        if (s.type === 'conyard') baseRadius = 400;
        else if (s.type === 'turret' || s.type === 'aaturret') baseRadius = 340;
        else if (s.type === 'techlab' || s.type === 'superweapon') baseRadius = 320;
        const radius = baseRadius * visMult;

        const sx = s.x - camX;
        const sy = s.y - camY;
        if (sx + radius < 0 || sx - radius > vpW || sy + radius < 0 || sy - radius > vpH) continue;

        const grad = fctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.72, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.92, 'rgba(0, 0, 0, 0.45)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        fctx.fillStyle = grad;
        fctx.beginPath();
        fctx.arc(sx, sy, radius, 0, Math.PI * 2);
        fctx.fill();
      }
    }

    // Active vision circles around player units
    for (const u of this.engine.units) {
      if (u.isPlayer && u.hp > 0) {
        let baseRadius = 240;
        if (u.type === 'aircraft') baseRadius = 380;
        else if (u.type === 'zone_trooper' || u.type === 'walker') baseRadius = 280;
        else if (u.type === 'harvester') baseRadius = 200;
        if (u.veterancy && u.veterancy >= 2) baseRadius *= 1.15;
        const radius = baseRadius * visMult;

        const sx = u.x - camX;
        const sy = u.y - camY;
        if (sx + radius < 0 || sx - radius > vpW || sy + radius < 0 || sy - radius > vpH) continue;

        const grad = fctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.70, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.90, 'rgba(0, 0, 0, 0.45)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        fctx.fillStyle = grad;
        fctx.beginPath();
        fctx.arc(sx, sy, radius, 0, Math.PI * 2);
        fctx.fill();
      }
    }

    // 4. Subtle tactical coordinate grid on shroud
    fctx.globalCompositeOperation = 'source-over';
    fctx.save();
    fctx.strokeStyle = 'rgba(56, 189, 248, 0.02)';
    fctx.lineWidth = 1;
    const gridStep = 80;
    const startGridX = Math.floor(camX / gridStep) * gridStep - camX;
    const startGridY = Math.floor(camY / gridStep) * gridStep - camY;
    for (let gx = startGridX; gx < vpW; gx += gridStep) {
      fctx.beginPath();
      fctx.moveTo(gx, 0);
      fctx.lineTo(gx, vpH);
      fctx.stroke();
    }
    for (let gy = startGridY; gy < vpH; gy += gridStep) {
      fctx.beginPath();
      fctx.moveTo(0, gy);
      fctx.lineTo(vpW, gy);
      fctx.stroke();
    }
    fctx.restore();

    // 5. Composite mask onto main world canvas at camera offset
    ctx.drawImage(this.fogCanvas, camX, camY);
  }

  private drawEngineerBeams(ctx: CanvasRenderingContext2D) {
    const time = Date.now();
    for (const unit of this.engine.units) {
      if (unit.type !== 'engineer') continue;

      // 1. Repairing nanite welding arc
      if (unit.engineerAction === 'repairing' && unit.repairTargetId) {
        const struct = this.engine.structures.find(s => s.id === unit.repairTargetId);
        if (struct && struct.hp > 0) {
          const halfW = struct.width / 2;
          const halfH = struct.height / 2;
          const targetX = Math.max(struct.x - halfW, Math.min(struct.x + halfW, unit.x));
          const targetY = Math.max(struct.y - halfH, Math.min(struct.y + halfH, unit.y));

          ctx.save();
          const isLvl2 = (unit.veterancy || 0) >= 2;
          ctx.strokeStyle = isLvl2 ? '#38bdf8' : '#facc15';
          ctx.lineWidth = isLvl2 ? 3 : 2;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 8;

          // Lightning jitter arc
          const midX = (unit.x + targetX) * 0.5 + (Math.random() - 0.5) * 8;
          const midY = (unit.y + targetY) * 0.5 + (Math.random() - 0.5) * 8;
          ctx.beginPath();
          ctx.moveTo(unit.x, unit.y);
          ctx.quadraticCurveTo(midX, midY, targetX, targetY);
          ctx.stroke();

          // Welding impact flash
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(targetX + (Math.random() - 0.5) * 5, targetY + (Math.random() - 0.5) * 5, isLvl2 ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 2. Infiltration cyber-override datastream
      if (unit.engineerAction === 'capturing' && unit.captureTargetId) {
        const struct = this.engine.structures.find(s => s.id === unit.captureTargetId);
        if (struct && struct.hp > 0) {
          ctx.save();
          const streamColor = unit.faction === 'gdi' ? '#38bdf8' : '#ef4444';
          ctx.strokeStyle = streamColor;
          ctx.lineWidth = 2.2;
          ctx.setLineDash([6, 4]);
          ctx.lineDashOffset = -(time / 35);
          ctx.shadowColor = streamColor;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(unit.x, unit.y);
          ctx.lineTo(struct.x, struct.y);
          ctx.stroke();

          // Hacking terminal glow at engineer and structure
          ctx.fillStyle = streamColor;
          ctx.beginPath();
          ctx.arc(struct.x, struct.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 3. Convoy towing cables for moving buildings
      if (unit.engineerAction === 'moving_building' && unit.assignedStructureId) {
        const struct = this.engine.structures.find(s => s.id === unit.assignedStructureId);
        if (struct && struct.hp > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -(time / 50);
          ctx.beginPath();
          ctx.moveTo(unit.x, unit.y);
          ctx.lineTo(struct.x, struct.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  /**
   * Sistema de Renderizado de Texto Flotante (Floating Combat Text)
   * Dibuja los números de daño y curación sobre unidades y estructuras:
   * - Normal: Blanco / carmesí nítido con contorno negro
   * - Crítico: Dorado / ámbar brillante con glow y escala pop
   * - Curación: Verde esmeralda vibrante
   */
  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    if (this.engine.floatingTexts.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const ft of this.engine.floatingTexts) {
      // Si la posición cae en niebla de guerra no explorada, omitir
      if (!this.engine.isPositionVisible(ft.x, ft.y)) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.alpha));

      const size = Math.round(ft.fontSize * ft.scale);
      ctx.font = `900 ${size}px "Chakra Petch", "Consolas", monospace, sans-serif`;

      if (ft.type === 'critical') {
        // Crítico: Dorado / Ámbar brillante con halo y escala de impacto
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#451a03';
        ctx.strokeText(ft.text, ft.x, ft.y);

        ctx.fillStyle = '#fde047';
        ctx.fillText(ft.text, ft.x, ft.y);

        // Resalte interior blanco brillante
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.fillText(ft.text, ft.x, ft.y - 0.5);
      } else if (ft.type === 'heal') {
        // Curación: Verde esmeralda vibrante
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#052e16';
        ctx.strokeText(ft.text, ft.x, ft.y);

        ctx.fillStyle = '#4ade80';
        ctx.fillText(ft.text, ft.x, ft.y);
      } else {
        // Daño normal: Carmesí / blanco nítido
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#18181b';
        ctx.strokeText(ft.text, ft.x, ft.y);

        ctx.fillStyle = '#fca5a5';
        ctx.fillText(ft.text, ft.x, ft.y);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  private drawPlacementPreview(ctx: CanvasRenderingContext2D, worldX: number, worldY: number) {
    if (!this.engine.placementStructure) return;
    const def = STRUCTURE_DEFS[this.engine.placementStructure];
    const canPlace = this.engine.canPlaceStructure(worldX, worldY, def.width, def.height, true);

    ctx.save();
    ctx.translate(worldX, worldY);

    // Build radius indicator
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 360, 0, Math.PI * 2);
    ctx.stroke();

    // Placement box
    ctx.fillStyle = canPlace ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    ctx.strokeStyle = canPlace ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.fillRect(-def.width / 2, -def.height / 2, def.width, def.height);
    ctx.strokeRect(-def.width / 2, -def.height / 2, def.width, def.height);

    ctx.restore();
  }

  private drawRelocationPreview(ctx: CanvasRenderingContext2D, worldX: number, worldY: number) {
    const struct = this.engine.relocatingStructure;
    if (!struct) return;

    const def = STRUCTURE_DEFS[struct.type];
    const canPlace = this.engine.isRelocationTargetValid(struct, worldX, worldY);
    const reqEngineers = getRequiredEngineersToMove(struct.type);

    ctx.save();

    // 1. Draw trajectory line from current position to destination
    ctx.strokeStyle = canPlace ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -(Date.now() / 40);
    ctx.beginPath();
    ctx.moveTo(struct.x, struct.y);
    ctx.lineTo(worldX, worldY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw relocation ghost box at cursor
    ctx.translate(worldX, worldY);
    ctx.fillStyle = canPlace ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    ctx.strokeStyle = canPlace ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-def.width / 2, -def.height / 2, def.width, def.height);
    ctx.strokeRect(-def.width / 2, -def.height / 2, def.width, def.height);

    // Hazard stripes inside ghost
    ctx.strokeStyle = canPlace ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-def.width / 2, 0);
    ctx.lineTo(def.width / 2, 0);
    ctx.moveTo(0, -def.height / 2);
    ctx.lineTo(0, def.height / 2);
    ctx.stroke();

    // 3. Tactical HUD text label above ghost
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#09090b';
    const tagText = canPlace 
      ? `🚚 TRASLADAR ${def.name.toUpperCase()} (${reqEngineers} Ing. Nivel 2)`
      : '⚠ UBICACIÓN OBSTRUIDA / NO VÁLIDA';
    const tagWidth = ctx.measureText(tagText).width + 16;
    ctx.fillRect(-tagWidth / 2, -def.height / 2 - 24, tagWidth, 20);
    ctx.strokeStyle = canPlace ? '#22c55e' : '#ef4444';
    ctx.strokeRect(-tagWidth / 2, -def.height / 2 - 24, tagWidth, 20);

    ctx.fillStyle = canPlace ? '#4ade80' : '#f87171';
    ctx.fillText(tagText, 0, -def.height / 2 - 10);

    ctx.restore();
  }

  private drawSuperweaponTarget(ctx: CanvasRenderingContext2D, worldX: number, worldY: number) {
    ctx.save();
    ctx.translate(worldX, worldY);

    const isGdi = this.engine.playerFaction === 'gdi';
    const color = isGdi ? '#38bdf8' : '#ef4444';

    // Target crosshair
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-100, 0);
    ctx.lineTo(100, 0);
    ctx.moveTo(0, -100);
    ctx.lineTo(0, 100);
    ctx.stroke();

    ctx.restore();
  }

  private drawDragBox(ctx: CanvasRenderingContext2D, box: { x1: number; y1: number; x2: number; y2: number }) {
    ctx.save();
    const minX = Math.min(box.x1, box.x2);
    const minY = Math.min(box.y1, box.y2);
    const width = Math.abs(box.x2 - box.x1);
    const height = Math.abs(box.y2 - box.y1);

    ctx.fillStyle = this.engine.playerFaction === 'gdi' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    ctx.strokeStyle = this.engine.playerFaction === 'gdi' ? '#eab308' : '#ef4444';
    ctx.lineWidth = 1.5;

    ctx.fillRect(minX, minY, width, height);
    ctx.strokeRect(minX, minY, width, height);
    ctx.restore();
  }

  // --- WEATHER & ATMOSPHERIC TOP LAYER ---
  private drawWeatherAtmosphere(ctx: CanvasRenderingContext2D, vpW: number, vpH: number) {
    const camX = this.engine.cameraX;
    const camY = this.engine.cameraY;
    const weather = this.engine.weather;

    // 1. Draw Global Atmospheric Particles
    for (const p of this.engine.weatherParticles) {
      const sx = p.x - camX;
      const sy = p.y - camY;

      // Skip particles outside viewport
      if (sx < -120 || sx > vpW + 120 || sy < -120 || sy > vpH + 120) continue;

      if (p.type === 'fog_wisp') {
        ctx.save();
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.size);
        grad.addColorStop(0, `rgba(148, 163, 184, ${p.alpha * 0.9})`);
        grad.addColorStop(0.5, `rgba(100, 116, 139, ${p.alpha * 0.45})`);
        grad.addColorStop(1, 'rgba(100, 116, 139, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'ion_spark') {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - p.vx * 0.045, sy - p.vy * 0.045);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'rain_drop') {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - p.vx * 0.04, sy - p.vy * 0.04);
        ctx.stroke();

        // Small water droplet splash ring on ground contact near particle lifetime end
        if (p.life > p.maxLife * 0.82) {
          ctx.strokeStyle = 'rgba(191, 219, 254, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sx, sy, 3.5, 1.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      } else if (p.type === 'sun_mote') {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = '#fde047';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 2. Draw Branching Lightning Bolts in Ion Storm
    for (const bolt of this.engine.weatherLightningBolts) {
      if (bolt.points.length < 2) continue;
      ctx.save();
      ctx.globalAlpha = bolt.alpha;

      // Outer energetic cyan glow
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      const p0 = bolt.points[0];
      ctx.moveTo(p0.x - camX, p0.y - camY);
      for (let i = 1; i < bolt.points.length; i++) {
        const pt = bolt.points[i];
        ctx.lineTo(pt.x - camX, pt.y - camY);
      }
      ctx.stroke();

      // White-hot core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Dynamic Screen-Space Atmospheric Color Filters
    // Sunny Warm Wasteland Sunlight
    if (weather.fogDensity < 0.8 && weather.stormIntensity < 0.8) {
      const sunnyFactor = 1 - Math.max(weather.fogDensity, weather.stormIntensity);
      if (sunnyFactor > 0.01) {
        ctx.save();
        const sunGrad = ctx.createLinearGradient(0, 0, 0, vpH);
        sunGrad.addColorStop(0, `rgba(251, 191, 36, ${0.045 * sunnyFactor})`);
        sunGrad.addColorStop(1, `rgba(245, 158, 11, ${0.02 * sunnyFactor})`);
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, vpW, vpH);
        ctx.restore();
      }
    }

    // Fog Veil & Edge Vignette
    if (weather.fogDensity > 0.02) {
      ctx.save();
      const fogAlpha = 0.22 * weather.fogDensity;
      ctx.fillStyle = `rgba(71, 85, 105, ${fogAlpha})`;
      ctx.fillRect(0, 0, vpW, vpH);

      // Misty vignette obscuring screen perimeter
      const vig = ctx.createRadialGradient(vpW * 0.5, vpH * 0.5, vpW * 0.28, vpW * 0.5, vpH * 0.5, vpW * 0.72);
      vig.addColorStop(0, 'rgba(51, 65, 85, 0)');
      vig.addColorStop(1, `rgba(30, 41, 59, ${0.42 * weather.fogDensity})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, vpW, vpH);
      ctx.restore();
    }

    // Rain Combat Weather Atmosphere
    if (weather.rainIntensity > 0.02) {
      ctx.save();
      const rainWashAlpha = 0.12 * weather.rainIntensity;
      ctx.fillStyle = `rgba(30, 58, 138, ${rainWashAlpha})`;
      ctx.fillRect(0, 0, vpW, vpH);
      ctx.restore();
    }

    // Ion Storm Violet/Cyan Pulsating Atmosphere & Lightning Flash
    if (weather.stormIntensity > 0.02) {
      ctx.save();
      const t = Date.now() / 1000;
      const pulse = Math.sin(t * 3.5) * 0.03;
      const violetAlpha = (0.13 + pulse) * weather.stormIntensity;
      const cyanAlpha = (0.07 + pulse * 0.6) * weather.stormIntensity;

      // Violet electromagnetic aura
      ctx.fillStyle = `rgba(147, 51, 234, ${violetAlpha})`;
      ctx.fillRect(0, 0, vpW, vpH);

      // Cyan ion resonance
      ctx.fillStyle = `rgba(6, 182, 212, ${cyanAlpha})`;
      ctx.fillRect(0, 0, vpW, vpH);

      // Atmospheric lightning flash
      if (weather.lightningFlash > 0.02) {
        const flashAlpha = weather.lightningFlash * 0.45;
        ctx.fillStyle = `rgba(224, 242, 254, ${flashAlpha})`;
        ctx.fillRect(0, 0, vpW, vpH);
      }
      ctx.restore();
    }
  }

  // --- MINIMAP RENDERING ---
  public renderMinimap(minimapCanvas: HTMLCanvasElement, viewportWidth: number, viewportHeight: number) {
    const mCtx = minimapCanvas.getContext('2d');
    if (!mCtx) return;

    const mW = minimapCanvas.width;
    const mH = minimapCanvas.height;
    const mapW = this.engine.currentMap.width;
    const mapH = this.engine.currentMap.height;

    const scaleX = mW / mapW;
    const scaleY = mH / mapH;

    // Background
    mCtx.fillStyle = '#0f172a';
    mCtx.fillRect(0, 0, mW, mH);

    // Radar scanlines
    mCtx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    mCtx.lineWidth = 1;
    mCtx.strokeRect(0, 0, mW, mH);

    // Draw Tiberium (only discovered crystals)
    for (const c of this.engine.tiberiumCrystals) {
      if (c.amount > 0 && this.engine.isPositionExplored(c.x, c.y)) {
        mCtx.fillStyle = c.type === 'blue' ? '#38bdf8' : '#22c55e';
        mCtx.fillRect(c.x * scaleX, c.y * scaleY, 2, 2);
      }
    }

    // Draw Structures (player structures always, enemy structures only if explored/visible)
    for (const s of this.engine.structures) {
      if (s.isPlayer || this.engine.isPositionExplored(s.x, s.y)) {
        mCtx.fillStyle = s.isPlayer ? '#22c55e' : (this.engine.isPositionVisible(s.x, s.y) ? '#ef4444' : '#991b1b');
        mCtx.fillRect((s.x - s.width / 2) * scaleX, (s.y - s.height / 2) * scaleY, Math.max(3, s.width * scaleX), Math.max(3, s.height * scaleY));
      }
    }

    // Draw Units (player units always, enemy units ONLY if in active line-of-sight!)
    for (const u of this.engine.units) {
      if (u.isPlayer || this.engine.isPositionVisible(u.x, u.y)) {
        mCtx.fillStyle = u.isPlayer ? '#22c55e' : '#ef4444';
        mCtx.fillRect(u.x * scaleX - 1.5, u.y * scaleY - 1.5, 3, 3);
      }
    }

    // Draw Minimap Fog of War Shroud & Discovery State
    const fogW = this.engine.fogGridWidth;
    const fogH = this.engine.fogGridHeight;
    const cellW = mW / fogW;
    const cellH = mH / fogH;
    for (let cy = 0; cy < fogH; cy++) {
      for (let cx = 0; cx < fogW; cx++) {
        const state = this.engine.fogGrid[cy * fogW + cx];
        if (state === 0) {
          // Unexplored Shroud on minimap
          mCtx.fillStyle = 'rgba(2, 6, 23, 0.92)';
          mCtx.fillRect(cx * cellW, cy * cellH, cellW + 0.6, cellH + 0.6);
        } else if (state === 1) {
          // Explored fog on minimap
          mCtx.fillStyle = 'rgba(15, 23, 42, 0.42)';
          mCtx.fillRect(cx * cellW, cy * cellH, cellW + 0.6, cellH + 0.6);
        }
      }
    }

    // Viewport camera rect
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(
      this.engine.cameraX * scaleX,
      this.engine.cameraY * scaleY,
      viewportWidth * scaleX,
      viewportHeight * scaleY
    );
  }
}
