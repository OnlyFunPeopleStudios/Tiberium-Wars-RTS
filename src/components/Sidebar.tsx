import React, { useRef, useEffect } from 'react';
import { GameEngine } from '../game/engine';
import { StructureCategory, StructureType, UnitType } from '../game/types';
import { STRUCTURE_DEFS, UNIT_DEFS, getRequiredEngineersToMove } from '../game/gameData';
import { Shield, Zap, DollarSign, Crosshair, AlertTriangle, Wrench, Truck, Award } from 'lucide-react';
import { sound } from '../audio/soundEngine';

interface SidebarProps {
  engine: GameEngine;
  activeCategory: StructureCategory;
  onSelectCategory: (cat: StructureCategory) => void;
  onMinimapClick: (worldX: number, worldY: number) => void;
  onStartBuild: (type: StructureType | UnitType, cat: StructureCategory) => void;
  onCancelBuild: (cat: StructureCategory) => void;
  onSelectPlacement: (type: StructureType) => void;
  onActivateSuperweapon: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  engine,
  activeCategory,
  onSelectCategory,
  onMinimapClick,
  onStartBuild,
  onCancelBuild,
  onSelectPlacement,
  onActivateSuperweapon,
}) => {
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Minimap click & drag to move camera
  const handleMinimapMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = engine.currentMap.width / canvas.width;
    const scaleY = engine.currentMap.height / canvas.height;

    onMinimapClick(clickX * scaleX, clickY * scaleY);
  };

  const power = engine.getPlayerPower();
  const powerPercent = power.produced > 0 ? Math.min(100, Math.max(0, (power.consumed / power.produced) * 100)) : 100;
  const isGdi = engine.playerFaction === 'gdi';
  const factionBorder = isGdi ? 'border-amber-600/40' : 'border-red-600/40';

  // Check structure prerequisites
  const playerStructures = engine.structures.filter(s => s.isPlayer);
  const hasStructure = (type: StructureType) => playerStructures.some(s => s.type === type);

  // List of buildable structures
  const structureList: StructureType[] = ['conyard', 'powerplant', 'refinery', 'barracks', 'warfactory', 'techlab', 'superweapon'];
  const defenseList: StructureType[] = ['turret', 'aaturret'];
  const infantryList: UnitType[] = ['rifleman', 'missile', 'zone_trooper', 'engineer'];
  const vehicleList: UnitType[] = ['harvester', 'tank', 'apc', 'aircraft', 'walker'];

  return (
    <aside className={`w-80 h-[calc(100vh-3rem)] bg-neutral-900 border-l ${factionBorder} flex flex-col z-20 text-neutral-200 select-none shadow-2xl`}>
      {/* 1. EVA Tactical Radar Minimap */}
      <div className="relative p-2.5 bg-neutral-950 border-b border-neutral-800 flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-1 text-[11px] font-mono-numbers text-neutral-400">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            RADAR TÁCTICO
          </span>
          <span>MAPA: {engine.currentMap.width}x{engine.currentMap.height}</span>
        </div>

        <div className="relative w-64 h-48 bg-neutral-900 border border-neutral-700 rounded overflow-hidden cursor-crosshair">
          <canvas
            ref={minimapCanvasRef}
            width={256}
            height={192}
            className="w-full h-full"
            onMouseDown={handleMinimapMouseDown}
          />
          {/* Tactical Radar Sweep Effect & Scanning Overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            {/* Rotating Radar Sweep Cone & Laser Beam */}
            <div 
              className="w-[340px] h-[340px] shrink-0 rounded-full animate-radar-sweep origin-center opacity-50 relative pointer-events-none"
              style={{
                background: 'conic-gradient(from 0deg, rgba(34, 197, 94, 0.55) 0deg, rgba(34, 197, 94, 0.22) 28deg, rgba(34, 197, 94, 0.04) 65deg, transparent 90deg, transparent 360deg)'
              }}
            >
              {/* High-intensity radar sweep leading edge needle */}
              <div className="absolute top-1/2 left-1/2 w-[170px] h-[1.5px] bg-gradient-to-r from-emerald-300 via-emerald-400 to-transparent shadow-[0_0_8px_#22c55e] origin-left -translate-y-1/2"></div>
            </div>

            {/* Tactical Circular Range Rings & Reticle Crosshairs */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
              <div className="w-16 h-16 rounded-full border border-emerald-500/40"></div>
              <div className="absolute w-32 h-32 rounded-full border border-emerald-500/30"></div>
              <div className="absolute w-48 h-48 rounded-full border border-dashed border-emerald-500/25"></div>
              <div className="absolute w-full h-[1px] bg-emerald-500/20"></div>
              <div className="absolute h-full w-[1px] bg-emerald-500/20"></div>
            </div>
          </div>

          {/* Low power offline overlay */}
          {engine.isLowPower && (
            <div className="absolute inset-0 bg-neutral-950/85 flex flex-col items-center justify-center text-red-400 text-xs font-semibold gap-1">
              <AlertTriangle className="w-6 h-6 text-red-500 animate-bounce" />
              <span>RADAR DESCONECTADO</span>
              <span className="text-[10px] text-neutral-400">ENERGÍA INSUFICIENTE</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Resource & Power Header */}
      <div className="p-3 bg-neutral-900 border-b border-neutral-800 flex flex-col gap-2">
        {/* Credits */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span className="text-xl font-mono-numbers tracking-tight">
              ${engine.playerCredits.toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] text-neutral-400 font-mono-numbers">
            TIBERIO: +800 / viaje
          </span>
        </div>

        {/* Power Meter */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono-numbers">
            <span className="flex items-center gap-1 text-neutral-300">
              <Zap className={`w-3.5 h-3.5 ${engine.isLowPower ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />
              ENERGÍA
            </span>
            <span className={engine.isLowPower ? 'text-red-400 font-bold' : 'text-emerald-400'}>
              {power.consumed} / {power.produced} MW
            </span>
          </div>
          {/* Power Bar */}
          <div className="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 flex">
            <div
              className={`h-full transition-all duration-300 ${
                engine.isLowPower ? 'bg-red-500' : powerPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (power.consumed / Math.max(1, power.produced)) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2.5 Selected Structure or Engineer Action Inspector */}
      {(() => {
        const selectedStruct = engine.structures.find(s => s.id === engine.selectedStructureId);
        const selectedPlayerUnits = engine.units.filter(u => u.isPlayer && u.selected);
        const selectedEngineers = selectedPlayerUnits.filter(u => u.type === 'engineer');

        if (selectedStruct) {
          const structDef = STRUCTURE_DEFS[selectedStruct.type];
          const isDamaged = selectedStruct.hp < selectedStruct.maxHp;
          const hpPercent = Math.max(0, Math.min(100, (selectedStruct.hp / selectedStruct.maxHp) * 100));
          const reqEngineers = getRequiredEngineersToMove(selectedStruct.type);
          const availLvl2 = engine.getAvailableLevel2EngineersCount();
          const canMove = availLvl2 >= reqEngineers && !selectedStruct.isBeingMoved && selectedStruct.isPlayer;

          return (
            <div className="bg-neutral-950 border-b border-amber-500/40 p-3 flex flex-col gap-2 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="font-bold text-xs text-amber-300">{structDef.name}</span>
                </div>
                <button
                  onClick={() => engine.selectStructure(null)}
                  className="text-neutral-400 hover:text-neutral-200 text-xs px-1 cursor-pointer"
                  title="Cerrar panel de estructura"
                >
                  ✕
                </button>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-1 text-[10px]">
                {selectedStruct.veterancy && selectedStruct.veterancy > 0 && (
                  <span className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-1 ${
                    selectedStruct.veterancy >= 3
                      ? 'bg-amber-950 text-amber-300 border border-amber-500'
                      : selectedStruct.veterancy === 2
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                      : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                  }`}>
                    <Award className="w-3 h-3" />
                    {selectedStruct.veterancy >= 3 ? '★★★ HEROICO' : selectedStruct.veterancy === 2 ? '★★ ÉLITE' : '★ VETERANO'}
                  </span>
                )}
                {selectedStruct.isCaptured && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold flex items-center gap-1">
                    ★ OCUPADO / CAPTURADO
                  </span>
                )}
                {selectedStruct.isBeingMoved ? (
                  <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 font-bold animate-pulse flex items-center gap-1">
                    🚚 EN CONVOY DE TRASLADO
                  </span>
                ) : isDamaged ? (
                  <span className="px-1.5 py-0.5 rounded bg-red-950 border border-red-500 text-red-300 font-semibold">
                    ⚠ DAÑADO ({Math.floor(selectedStruct.hp)}/{selectedStruct.maxHp} HP)
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                    OPERATIVO ({selectedStruct.maxHp} HP)
                  </span>
                )}
                {(() => {
                  const sRank = selectedStruct.veterancy || 0;
                  if (sRank < 2 || !isDamaged) return null;
                  const now = Date.now() / 1000;
                  const lastCombat = Math.max(selectedStruct.lastCombatTime || 0, selectedStruct.lastFired || 0);
                  const isOutOfCombat = (now - lastCombat) > 4.0;
                  return isOutOfCombat ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold flex items-center gap-1 animate-pulse">
                      💚 AUTO-REPARACIÓN ÉLITE ACTIVA
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600 text-amber-300 font-semibold">
                      ⚠️ EN COMBATE (Reparación en espera)
                    </span>
                  );
                })()}
                {engine.weather.stormIntensity > 0.15 && (selectedStruct.type === 'turret' || selectedStruct.type === 'aaturret') && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-950 border border-purple-500 text-purple-300 font-semibold flex items-center gap-1">
                    ⚡ +35% DAÑO ENERGÍA (TORMENTA)
                  </span>
                )}
              </div>

              {/* HP Bar */}
              <div className="w-full h-2 bg-neutral-900 rounded-sm overflow-hidden border border-neutral-800">
                <div
                  className={`h-full transition-all duration-200 ${
                    hpPercent > 50 ? 'bg-emerald-500' : hpPercent > 25 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${hpPercent}%` }}
                />
              </div>

              {/* Captured Benefits details */}
              {selectedStruct.isCaptured && selectedStruct.isPlayer && (
                <div className="bg-neutral-900/90 border border-emerald-500/30 rounded p-1.5 text-[10px] text-emerald-300">
                  {selectedStruct.type === 'refinery' && '💰 Extracción de Tiberio: +150 créditos siphoned cada 6s.'}
                  {selectedStruct.type === 'techlab' && '🔬 Datos de armamento descargados: +100 créditos cada 10s.'}
                  {(selectedStruct.type === 'turret' || selectedStruct.type === 'aaturret') && '🎯 Torreta reprogramada: Cadencia de fuego +25% contra enemigos.'}
                  {selectedStruct.type !== 'refinery' && selectedStruct.type !== 'techlab' && selectedStruct.type !== 'turret' && selectedStruct.type !== 'aaturret' && (
                    '🛡️ Guarnición de ingenieros: Puerto de rifles defensivos activo contra atacantes.'
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-1.5 mt-1">
                {/* 1. Repair Button */}
                {selectedStruct.isPlayer && isDamaged && !selectedStruct.isBeingMoved && (
                  <button
                    onClick={() => {
                      engine.commandRepairStructure(selectedStruct.id);
                    }}
                    className="w-full py-1.5 px-2 bg-sky-700 hover:bg-sky-600 text-white rounded text-xs font-bold flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer"
                    title="Envía al ingeniero más cercano para soldar y reparar con nanites (+XP)"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>REPARAR CON INGENIERO [T]</span>
                  </button>
                )}

                {/* 2. Relocate Button (Level 2 Engineers) */}
                {selectedStruct.isPlayer && !selectedStruct.isBeingMoved && (
                  canMove ? (
                    <button
                      onClick={() => {
                        engine.startStructureRelocation(selectedStruct.id);
                      }}
                      className="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-neutral-950 rounded text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer animate-pulse"
                      title="Seleccionar nueva posición para trasladar con ingenieros Nivel 2"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>MOVER EDIFICIO ({reqEngineers} Ing. Nivel 2) [M]</span>
                    </button>
                  ) : (
                    <div className="p-1.5 rounded bg-neutral-900/80 border border-neutral-800 text-[10px] text-neutral-400 flex flex-col gap-0.5">
                      <div className="flex justify-between items-center text-neutral-300 font-semibold">
                        <span>🚚 Traslado de edificio:</span>
                        <span className="text-amber-400">Nivel 2 req: {reqEngineers} (Tienes {availLvl2})</span>
                      </div>
                      <span className="text-neutral-500 leading-tight">
                        Repara edificios con tus ingenieros para que asciendan a Nivel 2 (Élite) y puedan mover esta estructura.
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        }

        if (selectedEngineers.length > 0) {
          const leadEng = selectedEngineers[0];
          const rank = leadEng.veterancy || 0;
          const rankName = rank >= 3 ? 'Heroico (Nivel 3)' : rank === 2 ? 'Élite (Nivel 2)' : rank === 1 ? 'Veterano (Nivel 1)' : 'Recluta (Nivel 0)';
          const xp = Math.floor(leadEng.engineerXp || 0);

          return (
            <div className="bg-neutral-950 border-b border-sky-500/40 p-3 flex flex-col gap-2 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Award className={`w-4 h-4 ${rank >= 2 ? 'text-amber-400' : 'text-sky-400'}`} />
                  <span className="font-bold text-xs text-sky-300">
                    Ingeniero de Combate {selectedEngineers.length > 1 ? `(x${selectedEngineers.length})` : ''}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  rank >= 2 ? 'bg-amber-950 text-amber-300 border border-amber-600' : 'bg-sky-950 text-sky-300 border border-sky-700'
                }`}>
                  {rankName}
                </span>
              </div>

              {/* Field XP Progress */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-mono-numbers text-neutral-400">
                  <span>Progreso reparación / ascenso:</span>
                  <span className="text-sky-300 font-bold">{xp} / 300 HP</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                  <div
                    className="h-full bg-sky-400 transition-all duration-200"
                    style={{ width: `${Math.min(100, (xp / 300) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Status and Abilities */}
              <div className="bg-neutral-900/90 border border-neutral-800 rounded p-1.5 text-[10px] text-neutral-300 space-y-1">
                <p>• <strong>Reparar:</strong> Click derecho en cualquier edificio aliado dañado.</p>
                <p>• <strong>Ocupar / Capturar:</strong> Click derecho en edificio enemigo para tomar control de sus recursos y armas.</p>
                {rank >= 2 ? (
                  <p className="text-amber-300 font-bold">
                    ⭐ ¡Nivel 2 Activo! Puede mover edificios según su tamaño (selecciona un edificio aliado y pulsa Mover).
                  </p>
                ) : (
                  <p className="text-neutral-500">
                    Al alcanzar Nivel 2 (Élite), este ingeniero podrá reubicar edificios de tu base.
                  </p>
                )}
              </div>
            </div>
          );
        }

        if (selectedPlayerUnits.length > 0) {
          const leadUnit = selectedPlayerUnits[0];
          const uDef = UNIT_DEFS[leadUnit.type];
          const rank = leadUnit.veterancy || 0;
          const rankName = rank >= 3 ? 'Heroico (Nivel 3)' : rank === 2 ? 'Élite (Nivel 2)' : rank === 1 ? 'Veterano (Nivel 1)' : 'Recluta';
          const hpPercent = Math.max(0, Math.min(100, (leadUnit.hp / leadUnit.maxHp) * 100));
          const isDamaged = leadUnit.hp < leadUnit.maxHp;
          const now = Date.now() / 1000;
          const lastCombat = Math.max(leadUnit.lastCombatTime || 0, leadUnit.lastFired || 0);
          const isOutOfCombat = (now - lastCombat) > 3.5;
          const isRegenActive = rank >= 2 && isDamaged && isOutOfCombat;
          const isElectrical = leadUnit.type === 'zone_trooper' || leadUnit.type === 'walker' || leadUnit.damageType === 'laser';

          return (
            <div className="bg-neutral-950 border-b border-amber-500/40 p-3 flex flex-col gap-2 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-xs text-amber-300">
                    {uDef.name} {selectedPlayerUnits.length > 1 ? `(x${selectedPlayerUnits.length})` : ''}
                  </span>
                </div>
                {rank > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                    rank >= 3 ? 'bg-amber-950 text-amber-300 border border-amber-500' : rank === 2 ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : 'bg-neutral-900 text-neutral-300 border border-neutral-700'
                  }`}>
                    <Award className="w-3 h-3" />
                    {rankName}
                  </span>
                )}
              </div>

              {/* Status and Veterancy / HP */}
              <div className="flex flex-wrap gap-1 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono-numbers">
                  HP: {Math.floor(leadUnit.hp)} / {leadUnit.maxHp}
                </span>
                {(leadUnit.kills || 0) > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-red-950/80 border border-red-600/40 text-red-300 font-semibold font-mono-numbers">
                    ⚔️ {leadUnit.kills} bajas
                  </span>
                )}
                {rank >= 2 && (
                  isRegenActive ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold flex items-center gap-1 animate-pulse">
                      💚 Auto-Regeneración Activa
                    </span>
                  ) : isDamaged ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600 text-amber-300 font-semibold">
                      ⚠️ En combate (Regen en espera)
                    </span>
                  ) : null
                )}
              </div>

              {/* HP Bar */}
              <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                <div
                  className={`h-full transition-all duration-200 ${
                    hpPercent > 50 ? 'bg-emerald-500' : hpPercent > 25 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${hpPercent}%` }}
                />
              </div>

              {/* Active Weather Stat Modifiers Tag */}
              <div className="bg-neutral-900/90 border border-neutral-800 rounded p-1.5 text-[10px] space-y-0.5">
                {engine.weather.rainIntensity > 0.15 && !leadUnit.isAir && (
                  <p className="text-sky-300 flex items-center gap-1">
                    🌧️ <strong>Clima Lluvia:</strong> +20% Velocidad de avance y +10% enfriamiento.
                  </p>
                )}
                {engine.weather.stormIntensity > 0.15 && isElectrical && (
                  <p className="text-purple-300 flex items-center gap-1">
                    ⚡ <strong>Tormenta Iónica:</strong> +35% Daño sobrecargado electromagnético/láser.
                  </p>
                )}
                {engine.weather.stormIntensity > 0.35 && leadUnit.isAir && (
                  <p className="text-amber-400 flex items-center gap-1">
                    🌪️ <strong>Turbulencia Iónica:</strong> -15% Velocidad de vuelo de aeronaves.
                  </p>
                )}
                {rank >= 2 && (
                  <p className="text-emerald-400">
                    ⭐ <strong>Supervivencia Élite:</strong> Se regenera automáticamente fuera de combate.
                  </p>
                )}
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* 3. Category Switcher Tabs */}
      <div className="grid grid-cols-4 bg-neutral-950 border-b border-neutral-800 text-[11px] font-semibold text-neutral-400">
        <button
          onClick={() => { onSelectCategory('structures'); sound.playClick(); }}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeCategory === 'structures'
              ? 'border-amber-500 text-amber-400 bg-neutral-900/60'
              : 'border-transparent hover:text-neutral-200'
          }`}
          title="Edificios principales [Q]"
        >
          <span>Edificios</span>
          <span className="text-[9px] text-neutral-500">[Q]</span>
        </button>

        <button
          onClick={() => { onSelectCategory('defenses'); sound.playClick(); }}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeCategory === 'defenses'
              ? 'border-amber-500 text-amber-400 bg-neutral-900/60'
              : 'border-transparent hover:text-neutral-200'
          }`}
          title="Torretas y Defensas [W]"
        >
          <span>Defensas</span>
          <span className="text-[9px] text-neutral-500">[W]</span>
        </button>

        <button
          onClick={() => { onSelectCategory('infantry'); sound.playClick(); }}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeCategory === 'infantry'
              ? 'border-amber-500 text-amber-400 bg-neutral-900/60'
              : 'border-transparent hover:text-neutral-200'
          }`}
          title="Infantería de combate [E]"
        >
          <span>Infantería</span>
          <span className="text-[9px] text-neutral-500">[E]</span>
        </button>

        <button
          onClick={() => { onSelectCategory('vehicles'); sound.playClick(); }}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeCategory === 'vehicles'
              ? 'border-amber-500 text-amber-400 bg-neutral-900/60'
              : 'border-transparent hover:text-neutral-200'
          }`}
          title="Blindados y Aéreo [R]"
        >
          <span>Vehículos</span>
          <span className="text-[9px] text-neutral-500">[R]</span>
        </button>
      </div>

      {/* 4. Active Category Production Queue Pipeline Strip */}
      {(() => {
        const currentQueue = (activeCategory === 'structures' || activeCategory === 'defenses')
          ? engine.structureQueue
          : activeCategory === 'infantry'
            ? engine.infantryQueue
            : engine.vehicleQueue;

        if (currentQueue.length === 0) return null;

        return (
          <div className="bg-neutral-950/95 border-b border-neutral-800 p-2 text-xs select-none">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                COLA ACTIVA ({currentQueue.length})
              </span>
              <button
                onClick={() => engine.cancelBuild(activeCategory)}
                className="text-[10px] text-red-400 hover:text-red-300 hover:underline cursor-pointer"
                title="Cancelar elemento activo y reembolsar créditos"
              >
                Cancelar actual
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {currentQueue.map((item, index) => {
                const isStructure = item.category === 'structures' || item.category === 'defenses';
                const def = isStructure 
                  ? STRUCTURE_DEFS[item.itemType as StructureType] 
                  : UNIT_DEFS[item.itemType as UnitType];
                const isFirst = index === 0;

                return (
                  <div
                    key={item.id}
                    className={`shrink-0 px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${
                      isFirst
                        ? item.ready
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 animate-pulse font-bold'
                          : 'bg-amber-950/70 border-amber-500/80 text-amber-200'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <span className="font-mono text-[9px] opacity-60">#{index + 1}</span>
                    <span className="font-medium truncate max-w-[80px]">{def?.name || item.itemType}</span>
                    {isFirst && !item.ready && (
                      <span className="font-mono-numbers text-[9px] text-amber-400 font-bold">
                        {Math.floor(item.progress * 100)}%
                      </span>
                    )}
                    {isFirst && item.ready && (
                      <span className="font-mono-numbers text-[9px] text-emerald-400 font-bold">LISTO</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.cancelBuildItem(activeCategory, item.itemType, false);
                      }}
                      className="hover:text-red-400 text-neutral-500 text-[10px] px-0.5 cursor-pointer"
                      title="Cancelar este elemento"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 5. Build Queue Slot Cards */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {/* Render relevant item cards */}
        {activeCategory === 'structures' &&
          structureList.map(type => {
            const def = STRUCTURE_DEFS[type];
            const currentQueue = engine.structureQueue;
            const queuedCount = currentQueue.filter(q => q.itemType === type).length;
            const isCurrentlyBuilding = currentQueue[0]?.itemType === type;
            const isReady = isCurrentlyBuilding && currentQueue[0]?.ready;
            const progress = isCurrentlyBuilding ? currentQueue[0].progress : 0;
            const queuePosition = currentQueue.findIndex(q => q.itemType === type);
            const isLocked = def.prereq && !def.prereq.every(p => hasStructure(p));

            return (
              <BuildCard
                key={type}
                name={def.name}
                cost={def.cost}
                buildTime={def.buildTime}
                description={def.description}
                queuedCount={queuedCount}
                isCurrentlyBuilding={isCurrentlyBuilding}
                isReady={isReady}
                isLocked={!!isLocked}
                progress={progress}
                queuePosition={queuePosition}
                onAdd={() => engine.startBuild(type, 'structures')}
                onRemoveOne={() => engine.cancelBuildItem('structures', type, false)}
                onRemoveAll={() => engine.cancelBuildItem('structures', type, true)}
                onPlace={() => onSelectPlacement(type)}
              />
            );
          })}

        {activeCategory === 'defenses' &&
          defenseList.map(type => {
            const def = STRUCTURE_DEFS[type];
            const currentQueue = engine.structureQueue;
            const queuedCount = currentQueue.filter(q => q.itemType === type).length;
            const isCurrentlyBuilding = currentQueue[0]?.itemType === type;
            const isReady = isCurrentlyBuilding && currentQueue[0]?.ready;
            const progress = isCurrentlyBuilding ? currentQueue[0].progress : 0;
            const queuePosition = currentQueue.findIndex(q => q.itemType === type);
            const isLocked = def.prereq && !def.prereq.every(p => hasStructure(p));

            return (
              <BuildCard
                key={type}
                name={def.name}
                cost={def.cost}
                buildTime={def.buildTime}
                description={def.description}
                queuedCount={queuedCount}
                isCurrentlyBuilding={isCurrentlyBuilding}
                isReady={isReady}
                isLocked={!!isLocked}
                progress={progress}
                queuePosition={queuePosition}
                onAdd={() => engine.startBuild(type, 'defenses')}
                onRemoveOne={() => engine.cancelBuildItem('defenses', type, false)}
                onRemoveAll={() => engine.cancelBuildItem('defenses', type, true)}
                onPlace={() => onSelectPlacement(type)}
              />
            );
          })}

        {activeCategory === 'infantry' &&
          infantryList.map(type => {
            const def = UNIT_DEFS[type];
            const currentQueue = engine.infantryQueue;
            const queuedCount = currentQueue.filter(q => q.itemType === type).length;
            const isCurrentlyBuilding = currentQueue[0]?.itemType === type;
            const isReady = isCurrentlyBuilding && currentQueue[0]?.ready;
            const progress = isCurrentlyBuilding ? currentQueue[0].progress : 0;
            const queuePosition = currentQueue.findIndex(q => q.itemType === type);
            const isLocked = def.prereq && !def.prereq.every(p => hasStructure(p));

            return (
              <BuildCard
                key={type}
                name={def.name}
                cost={def.cost}
                buildTime={def.buildTime}
                description={def.description}
                queuedCount={queuedCount}
                isCurrentlyBuilding={isCurrentlyBuilding}
                isReady={isReady}
                isLocked={!!isLocked}
                progress={progress}
                queuePosition={queuePosition}
                onAdd={() => engine.startBuild(type, 'infantry')}
                onRemoveOne={() => engine.cancelBuildItem('infantry', type, false)}
                onRemoveAll={() => engine.cancelBuildItem('infantry', type, true)}
                onPlace={() => {}}
              />
            );
          })}

        {activeCategory === 'vehicles' &&
          vehicleList.map(type => {
            const def = UNIT_DEFS[type];
            const currentQueue = engine.vehicleQueue;
            const queuedCount = currentQueue.filter(q => q.itemType === type).length;
            const isCurrentlyBuilding = currentQueue[0]?.itemType === type;
            const isReady = isCurrentlyBuilding && currentQueue[0]?.ready;
            const progress = isCurrentlyBuilding ? currentQueue[0].progress : 0;
            const queuePosition = currentQueue.findIndex(q => q.itemType === type);
            const isLocked = def.prereq && !def.prereq.every(p => hasStructure(p));

            return (
              <BuildCard
                key={type}
                name={def.name}
                cost={def.cost}
                buildTime={def.buildTime}
                description={def.description}
                queuedCount={queuedCount}
                isCurrentlyBuilding={isCurrentlyBuilding}
                isReady={isReady}
                isLocked={!!isLocked}
                progress={progress}
                queuePosition={queuePosition}
                onAdd={() => engine.startBuild(type, 'vehicles')}
                onRemoveOne={() => engine.cancelBuildItem('vehicles', type, false)}
                onRemoveAll={() => engine.cancelBuildItem('vehicles', type, true)}
                onPlace={() => {}}
              />
            );
          })}
      </div>

      {/* 6. Superweapon Strike Dock */}
      {hasStructure('superweapon') && (
        <div className="p-2.5 bg-neutral-950 border-t border-neutral-800">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-scifi font-bold text-amber-400 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" />
              {isGdi ? 'CAÑÓN DE IONES' : 'MISIL NUCLEAR'}
            </span>
            <span className="font-mono-numbers text-xs font-semibold text-neutral-300">
              {engine.playerSuperweaponReady
                ? 'LISTO'
                : `${Math.ceil(engine.playerSuperweaponTimer)}s`}
            </span>
          </div>

          <button
            onClick={onActivateSuperweapon}
            disabled={!engine.playerSuperweaponReady}
            className={`w-full py-2 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-all ${
              engine.playerSuperweaponReady
                ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-lg shadow-red-900/40 cursor-pointer'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>
              {engine.playerSuperweaponReady ? 'ACTIVAR OBJETIVO DE IMPACTO' : 'CARGANDO SISTEMA ORBITAL'}
            </span>
          </button>
        </div>
      )}
    </aside>
  );
};

interface BuildCardProps {
  name: string;
  cost: number;
  buildTime: number;
  description: string;
  queuedCount: number;
  isCurrentlyBuilding: boolean;
  isReady?: boolean;
  isLocked: boolean;
  progress: number;
  queuePosition: number;
  onAdd: () => void;
  onRemoveOne: () => void;
  onRemoveAll: () => void;
  onPlace: () => void;
}

const BuildCard: React.FC<BuildCardProps> = ({
  name,
  cost,
  buildTime,
  description,
  queuedCount,
  isCurrentlyBuilding,
  isReady,
  isLocked,
  progress,
  queuePosition,
  onAdd,
  onRemoveOne,
  onRemoveAll,
  onPlace,
}) => {
  if (isLocked) {
    return (
      <div className="p-2.5 bg-neutral-950/60 border border-neutral-800 rounded opacity-50 cursor-not-allowed select-none">
        <div className="flex justify-between items-center text-xs text-neutral-500">
          <span className="font-medium">{name}</span>
          <span className="text-[10px] uppercase">Bloqueado</span>
        </div>
        <p className="text-[10px] text-neutral-600 mt-1">Requiere estructura previa</p>
      </div>
    );
  }

  if (isReady) {
    return (
      <div className="p-2.5 bg-emerald-950/40 border-2 border-emerald-500 rounded relative overflow-hidden shadow-lg shadow-emerald-950/50">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-400">{name}</span>
            {queuedCount > 1 && (
              <span className="px-1.5 py-0.5 bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-bold text-[10px] rounded-full">
                +{queuedCount - 1} en cola
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-emerald-300 animate-pulse">¡LISTO!</span>
        </div>
        <p className="text-[10px] text-neutral-300 my-1">{description}</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onPlace}
            className="flex-1 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors text-center cursor-pointer shadow"
          >
            COLOCAR EN MAPA
          </button>
          <button
            onClick={onRemoveOne}
            className="px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors cursor-pointer"
            title="Cancelar y reembolsar créditos"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (isCurrentlyBuilding) {
    const timeLeft = Math.max(0, buildTime * (1 - progress)).toFixed(1);

    return (
      <div
        onClick={onAdd}
        onContextMenu={(e) => {
          e.preventDefault();
          onRemoveOne();
          sound.playClick();
        }}
        className="p-2.5 bg-neutral-950 border border-amber-500 hover:border-amber-400 rounded relative overflow-hidden shadow-md shadow-amber-950/30 cursor-pointer transition-all group select-none"
        title="Click: Añadir +1 a la cola (hasta 5) | Click derecho: Cancelar 1"
      >
        <div className="flex justify-between items-center text-xs mb-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-amber-400 group-hover:text-amber-300 transition-colors">{name}</span>
            <span className="px-1.5 py-0.5 bg-amber-500 text-neutral-950 font-bold text-[10px] rounded-full shadow-sm">
              x{queuedCount} / 5
            </span>
          </div>

          {/* Quick Queue Controls */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveOne(); sound.playClick(); }}
              className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded flex items-center justify-center text-xs font-bold cursor-pointer"
              title="Quitar 1 de la cola (Click derecho)"
            >
              -
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              disabled={queuedCount >= 5}
              className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold cursor-pointer ${
                queuedCount >= 5
                  ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-500 text-neutral-950'
              }`}
              title={queuedCount >= 5 ? "Límite de cola alcanzado (5 máx)" : "Añadir +1 a la cola"}
            >
              +
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveAll(); }}
              className="text-[10px] text-red-400 hover:text-red-300 ml-1 underline cursor-pointer"
              title="Cancelar todas las unidades de este tipo"
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* 5-slot queue visual pips */}
        <div className="flex gap-1 my-1">
          {[1, 2, 3, 4, 5].map((slot) => (
            <div
              key={slot}
              className={`h-1 flex-1 rounded-full transition-colors ${
                slot <= queuedCount ? 'bg-amber-400' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>

        {/* Animated Progress Bar */}
        <div className="w-full h-2 bg-neutral-900 border border-neutral-800 rounded-sm overflow-hidden my-1 relative">
          <div
            className="h-full bg-amber-500 transition-all duration-100 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
            style={{ width: `${Math.floor(progress * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono-numbers text-neutral-400">
          <span className="text-amber-300 font-semibold">{Math.floor(progress * 100)}%</span>
          <span>{timeLeft}s restante · Click para +1</span>
        </div>
      </div>
    );
  }

  if (queuedCount > 0) {
    return (
      <div
        onClick={onAdd}
        onContextMenu={(e) => {
          e.preventDefault();
          onRemoveOne();
          sound.playClick();
        }}
        className="p-2.5 bg-neutral-950/80 hover:bg-neutral-900/80 border border-neutral-700 hover:border-neutral-500 rounded relative overflow-hidden cursor-pointer transition-all group select-none"
        title="Click: Añadir +1 a la cola (hasta 5) | Click derecho: Cancelar 1"
      >
        <div className="flex justify-between items-center text-xs mb-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-neutral-200 group-hover:text-amber-300 transition-colors">{name}</span>
            <span className="px-1.5 py-0.5 bg-sky-600/80 text-sky-100 font-bold text-[10px] rounded-full">
              x{queuedCount} / 5
            </span>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveOne(); sound.playClick(); }}
              className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded flex items-center justify-center text-xs font-bold cursor-pointer"
              title="Quitar 1 de la cola (Click derecho)"
            >
              -
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              disabled={queuedCount >= 5}
              className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold cursor-pointer ${
                queuedCount >= 5
                  ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              }`}
              title={queuedCount >= 5 ? "Límite de cola alcanzado (5 máx)" : "Añadir +1 a la cola"}
            >
              +
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveAll(); }}
              className="text-[10px] text-red-400 hover:text-red-300 ml-1 cursor-pointer"
              title="Cancelar todas las unidades de este tipo"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 5-slot queue visual pips */}
        <div className="flex gap-1 my-1">
          {[1, 2, 3, 4, 5].map((slot) => (
            <div
              key={slot}
              className={`h-1 flex-1 rounded-full transition-colors ${
                slot <= queuedCount ? 'bg-sky-400' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between items-center text-[10px] text-neutral-400 mt-1">
          <span className="text-sky-400 font-medium">En espera (#{queuePosition + 1}) · Click para +1</span>
          <span className="font-mono-numbers text-emerald-400 font-bold">${cost}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onAdd}
      onContextMenu={(e) => e.preventDefault()}
      className="p-2.5 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 rounded transition-all cursor-pointer group select-none"
    >
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-neutral-200 group-hover:text-amber-400 transition-colors">
          {name}
        </span>
        <span className="font-mono-numbers font-bold text-emerald-400">${cost}</span>
      </div>
      <p className="text-[10px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
        {description}
      </p>
      <div className="flex justify-between items-center mt-2 text-[10px] text-neutral-500 font-mono-numbers">
        <span>Tiempo: {buildTime}s</span>
        <span className="text-amber-500 group-hover:underline flex items-center gap-0.5">
          <span>+ Cola</span>
          <span className="text-[8px] opacity-75">→</span>
        </span>
      </div>
    </div>
  );
};
