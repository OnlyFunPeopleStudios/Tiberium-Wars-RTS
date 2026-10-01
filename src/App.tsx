/**
 * Tiberium Wars RTS - Command & Conquer Clone
 * Developed for web integration & free deployment on OnlyFunPeople Studios
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from './game/engine';
import { CanvasRenderer } from './game/renderer';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { GameMenuModal } from './components/GameMenuModal';
import { EmbedModal } from './components/EmbedModal';
import { ControlsModal } from './components/ControlsModal';
import { VictoryDefeatModal } from './components/VictoryDefeatModal';
import { ProfileModal } from './components/ProfileModal';
import { Faction, AIDifficulty, MapType, StructureCategory, StructureType, UnitType } from './game/types';
import { UNIT_DEFS } from './game/gameData';
import { sound } from './audio/soundEngine';
import { storage } from './game/storage';
import { Maximize2, Minimize2, Tv, PanelRight, X, Smartphone } from 'lucide-react';

const CATEGORIES: StructureCategory[] = ['structures', 'defenses', 'infantry', 'vehicles'];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Lazy init: `useRef(new GameEngine())` would build a whole engine on every render
// (pathfinder typed arrays + fog grid + weather particles) and throw it away.
const engineRef = useRef<GameEngine>(null!);
if (!engineRef.current) engineRef.current = new GameEngine();
  const rendererRef = useRef<CanvasRenderer | null>(null);

  // UI States
  const [, setTick] = useState(0); // trigger re-render on engine state change
  const [activeCategory, setActiveCategory] = useState<StructureCategory>('structures');
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isEmbedOpen, setIsEmbedOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [crtEnabled, setCrtEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [needsRotate, setNeedsRotate] = useState(false);

  // Mouse & Selection tracking
  const mousePosRef = useRef({ x: 0, y: 0, worldX: 0, worldY: 0 });
  const isDraggingBoxRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, worldX: 0, worldY: 0 });
  const dragBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Keyboard navigation tracking
  const keysDownRef = useRef<Record<string, boolean>>({});
  // Read by the rAF loop, which must not re-subscribe on every pause toggle.
  const isPausedRef = useRef(isPaused);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Esc exits fullscreen on its own, so sync the button icon to reality.
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Landscape-only on phones: track it so we can nag when the device is upright.
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    const sync = () => setNeedsRotate(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Initialize engine UI listener
  useEffect(() => {
    const engine = engineRef.current;
    engine.setOnStateChange(() => {
      setTick(t => t + 1);
    });
  }, []);

  // Initialize Canvas & Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = engineRef.current;
    const renderer = new CanvasRenderer(engine, canvas);
    rendererRef.current = renderer;

    let animationFrameId: number;
    let lastTime = performance.now();
    // Queried fresh each frame would mean a DOM query 60x/sec; the node is stable.
    const minimapCanvas = document.querySelector('aside canvas') as HTMLCanvasElement | null;

    const gameLoop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1); // clamp dt
      lastTime = currentTime;

      // Handle smooth camera movement with WASD / Arrow keys
      const camSpeed = 800 * dt;
      if (keysDownRef.current['KeyW'] || keysDownRef.current['ArrowUp']) {
        engine.cameraY = Math.max(0, engine.cameraY - camSpeed);
      }
      if (keysDownRef.current['KeyS'] || keysDownRef.current['ArrowDown']) {
        const maxY = engine.currentMap.height - canvas.height;
        engine.cameraY = Math.min(maxY, engine.cameraY + camSpeed);
      }
      if (keysDownRef.current['KeyA'] || keysDownRef.current['ArrowLeft']) {
        engine.cameraX = Math.max(0, engine.cameraX - camSpeed);
      }
      if (keysDownRef.current['KeyD'] || keysDownRef.current['ArrowRight']) {
        const maxX = engine.currentMap.width - canvas.width;
        engine.cameraX = Math.min(maxX, engine.cameraX + camSpeed);
      }

      // Update simulation if playing
      if (!isPausedRef.current && engine.gameState === 'PLAYING') {
        engine.update(dt);
      }

      // Repaint React UI. Without this the clock, weather timer and build-progress
      // bars only refresh on discrete engine events, so they visibly stall.
      engine.notifyUI();

      // Render world
      const mouseW = mousePosRef.current.worldX;
      const mouseH = mousePosRef.current.worldY;
      renderer.render(canvas.width, canvas.height, dragBoxRef.current, mouseW, mouseH);

      // Render sidebar minimap
      if (minimapCanvas) {
        renderer.renderMinimap(minimapCanvas, canvas.width, canvas.height);
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Window Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs/modals. e.target is null when the focused
      // element was unmounted mid-keystroke (closing a modal with autoFocus).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      keysDownRef.current[e.code] = true;

      const engine = engineRef.current;

      // Space: Pause/Resume
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused(p => !p);
        sound.playClick();
        return;
      }

      // Sidebar tab cycle. Was Q/W/E/R, but W also pans the camera north — one key, two meanings.
      if (!e.repeat && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        const step = e.code === 'BracketRight' ? 1 : -1;
        setActiveCategory(c => CATEGORIES[(CATEGORIES.indexOf(c) + step + CATEGORIES.length) % CATEGORIES.length]);
        sound.playClick();
      }

      // H: Center on ConYard
      if (e.code === 'KeyH') {
        const conyard = engine.structures.find(s => s.isPlayer && s.type === 'conyard');
        if (conyard && canvasRef.current) {
          engine.cameraX = Math.max(0, conyard.x - canvasRef.current.width / 2);
          engine.cameraY = Math.max(0, conyard.y - canvasRef.current.height / 2);
          sound.playUnitSelect();
        }
      }

      // U: Order selected harvester(s) to return and unload at the nearest refinery
      if (e.code === 'KeyU') {
        const hasHarvesters = engine.units.some(u => u.isPlayer && u.selected && u.type === 'harvester');
        if (hasHarvesters) {
          engine.commandHarvesterUnload();
        }
      }

      // T: Repair selected structure with engineer
      if (e.code === 'KeyT') {
        if (engine.selectedStructureId) {
          engine.commandRepairStructure(engine.selectedStructureId);
        }
      }

      // M: Relocate selected structure with Level 2 engineers
      if (e.code === 'KeyM') {
        if (engine.selectedStructureId) {
          engine.startStructureRelocation(engine.selectedStructureId);
        }
      }

      // Escape: Cancel placement, relocation, targeting, or selection
      if (e.code === 'Escape') {
        if (engine.placementStructure) {
          engine.placementStructure = null;
          sound.playClick();
        }
        if (engine.relocatingStructure) {
          engine.cancelStructureRelocation();
          sound.playClick();
        }
        if (engine.superweaponTargeting) {
          engine.superweaponTargeting = false;
          sound.playClick();
        }
        engine.selectStructure(null);
        // Deselect units
        engine.units.forEach(u => u.selected = false);
        engine.notifyUI();
      }

      // 1..9 Control groups
      if (e.key >= '1' && e.key <= '9') {
        const groupNum = parseInt(e.key, 10);
        if (e.ctrlKey) {
          engine.createControlGroup(groupNum);
        } else {
          engine.recallControlGroup(groupNum);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mouse Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const engine = engineRef.current;
    const worldX = clientX + engine.cameraX;
    const worldY = clientY + engine.cameraY;

    mousePosRef.current = { x: clientX, y: clientY, worldX, worldY };

    if (isDraggingBoxRef.current) {
      dragBoxRef.current = {
        x1: dragStartRef.current.x,
        y1: dragStartRef.current.y,
        x2: clientX,
        y2: clientY,
      };
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const engine = engineRef.current;
    const worldX = clientX + engine.cameraX;
    const worldY = clientY + engine.cameraY;

    // LEFT CLICK
    if (e.button === 0) {
      // 1. Placement mode active
      if (engine.placementStructure) {
        engine.placeStructure(worldX, worldY);
        return;
      }

      // 1.5 Relocation mode active (Level 2 Engineers)
      if (engine.relocatingStructure) {
        engine.confirmStructureRelocation(worldX, worldY);
        return;
      }

      // 2. Superweapon targeting mode active
      if (engine.superweaponTargeting) {
        engine.fireSuperweapon(worldX, worldY);
        return;
      }

      // 3. Normal selection box start
      isDraggingBoxRef.current = true;
      dragStartRef.current = { x: clientX, y: clientY, worldX, worldY };
      dragBoxRef.current = { x1: clientX, y1: clientY, x2: clientX, y2: clientY };
    } 
    // RIGHT CLICK: Move or Attack Command
    else if (e.button === 2) {
      e.preventDefault();
      issueCommandAt(e.clientX, e.clientY);
    }
  };

  // Move / attack / cancel — shared by right click (PC) and long press (mobile).
  const issueCommandAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const engine = engineRef.current;
    const worldX = clientX - rect.left + engine.cameraX;
    const worldY = clientY - rect.top + engine.cameraY;

    // Cancel placement, relocation, or superweapon on right click
    if (engine.placementStructure) {
      engine.placementStructure = null;
      engine.notifyUI();
      sound.playClick();
      return;
    }
    if (engine.relocatingStructure) {
      engine.cancelStructureRelocation();
      sound.playClick();
      return;
    }
    if (engine.superweaponTargeting) {
      engine.superweaponTargeting = false;
      engine.notifyUI();
      sound.playClick();
      return;
    }

    // Check if clicking on enemy unit or structure
    let targetUnitId: string | undefined;
    let targetStructureId: string | undefined;

    // Enemy unit check (must be visible in player's line of sight)
    for (const u of engine.units) {
      if (!u.isPlayer && engine.isPositionVisible(u.x, u.y) && Math.hypot(u.x - worldX, u.y - worldY) < u.size) {
        targetUnitId = u.id;
        break;
      }
    }

    // Structure check (enemy attack target OR friendly structure such as refinery for harvesters)
    if (!targetUnitId) {
      for (const s of engine.structures) {
        if (s.hp > 0 && Math.abs(s.x - worldX) < s.width / 2 && Math.abs(s.y - worldY) < s.height / 2) {
          if (s.isPlayer || engine.isPositionVisible(s.x, s.y)) {
            targetStructureId = s.id;
            break;
          }
        }
      }
    }

    engine.issueCommandToSelected(worldX, worldY, targetUnitId, targetStructureId);
  };

  // --- Touch: tap/drag already work via synthesized mouse events (see touch-none below).
  // Long press stands in for right click, since touch has no button 2.
  const LONG_PRESS_MS = 450;
  const touchTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);

  const clearTouchTimer = () => {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    suppressClickRef.current = false;
    const { clientX, clientY } = e.touches[0];
    clearTouchTimer();
    touchTimerRef.current = window.setTimeout(() => {
      touchTimerRef.current = null;
      suppressClickRef.current = true;
      issueCommandAt(clientX, clientY);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Any movement cancels the long press (that gesture is a drag-select or pan).
    clearTouchTimer();

    // Two fingers = pan camera (the only camera control a phone has besides the minimap).
    if (e.touches.length !== 2) {
      panRef.current = null;
      return;
    }
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const prev = panRef.current;
    if (prev) {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (canvas) {
        engine.cameraX = Math.max(0, Math.min(engine.currentMap.width - canvas.width, engine.cameraX - (cx - prev.x)));
        engine.cameraY = Math.max(0, Math.min(engine.currentMap.height - canvas.height, engine.cameraY - (cy - prev.y)));
      }
    }
    panRef.current = { x: cx, y: cy };
    suppressClickRef.current = true;
  };

  const handleTouchEnd = () => {
    clearTouchTimer();
    panRef.current = null;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // A long press already issued the command; eat the synthesized click so it doesn't deselect.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (e.button === 0 && isDraggingBoxRef.current) {
      isDraggingBoxRef.current = false;
      const engine = engineRef.current;
      const startW = dragStartRef.current.worldX;
      const startH = dragStartRef.current.worldY;
      const endW = mousePosRef.current.worldX;
      const endH = mousePosRef.current.worldY;

      const dist = Math.hypot(endW - startW, endH - startH);
      if (dist > 10) {
        // Drag box selection
        engine.selectUnitsInBox(startW, startH, endW, endH, e.shiftKey);
        engine.selectStructure(null);
      } else {
        // Single unit click selection
        let clickedUnit = null;
        for (const u of engine.units) {
          if (u.isPlayer && Math.hypot(u.x - endW, u.y - endH) < u.size + 6) {
            clickedUnit = u;
            break;
          }
        }
        if (clickedUnit) {
          engine.selectSingleUnit(clickedUnit, e.shiftKey);
          engine.selectStructure(null);
        } else {
          // Check if clicking on a structure
          let clickedStruct = null;
          for (const s of engine.structures) {
            if (s.hp > 0 && Math.abs(s.x - endW) < s.width / 2 && Math.abs(s.y - endH) < s.height / 2) {
              if (s.isPlayer || engine.isPositionVisible(s.x, s.y)) {
                clickedStruct = s;
                break;
              }
            }
          }
          if (clickedStruct) {
            engine.selectStructure(clickedStruct);
          } else {
            if (!e.shiftKey) {
              engine.units.forEach(u => u.selected = false);
              engine.selectStructure(null);
              engine.notifyUI();
            }
          }
        }
      }

      dragBoxRef.current = null;
    }
  };

  // Prevent browser context menu on right click
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const isTouchDevice = () => matchMedia('(pointer: coarse)').matches;

  // Fullscreen + landscape lock. Must run inside a user gesture (start-battle click).
  // ponytail: orientation.lock() only resolves while fullscreen and is unsupported on iOS
  // Safari entirely — needsRotate covers those cases, so no fallback needed here.
  const enterImmersive = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
    // Phones only: locking is meaningless on desktop and can throw.
    if (isTouchDevice()) await screen.orientation.lock('landscape');
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      enterImmersive().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Game Start Handler
  const handleStartGame = (faction: Faction, difficulty: AIDifficulty, map: MapType) => {
    setIsMenuOpen(false);
    setIsPaused(false);
    engineRef.current.startNewGame(faction, difficulty, map);
    // Phones only: this click is the user gesture fullscreen/orientation require.
    if (isTouchDevice()) enterImmersive().catch(() => {});
  };

  // Local Save / Load Handlers
  const handleQuickSave = useCallback(() => {
    const engine = engineRef.current;
    if (engine.gameState !== 'PLAYING' && engine.gameState !== 'PAUSED') {
      return;
    }
    const saveState = engine.exportSaveState();
    storage.saveCurrentGame(saveState);
    sound.speakEVA('Partida guardada en el explorador', true);
    setTick(t => t + 1);
  }, []);

// Reinicia completamente el juego (se usa desde el modal de Victoria/Derrota)
  const restartGame = useCallback((faction: Faction, difficulty: AIDifficulty, map: MapType) => {
    engineRef.current.startNewGame(faction, difficulty, map);
    setIsPaused(false);
    setIsMenuOpen(true);
    setTick(t => t + 1);
    sound.speakEVA('Nueva batalla inicializando...', true);
  }, []);

  // Single loader: ProfileModal used to also call loadSaveState itself, so every
  // resume paid twice (pathfinder rebuild + grid + AI commander + EVA line).
  const handleResumeSavedGame = useCallback((): boolean => {
    const saved = storage.getSavedGame();
    if (!saved) return false;
    if (!engineRef.current.loadSaveState(saved)) return false;
    setIsMenuOpen(false);
    setIsPaused(false);
    setTick(t => t + 1);
    return true;
  }, []);

  const activeProfile = storage.getActiveProfile();
  const commanderRank = storage.getRank(activeProfile.stats.victories);

  return (
    <div className="w-screen h-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden select-none">
      {/* Top Header Navigation Bar */}
      <TopBar
        isMuted={isMuted}
        onToggleMute={() => {
          const next = !isMuted;
          setIsMuted(next);
          sound.setMuted(next);
        }}
        isPaused={isPaused}
        onTogglePause={() => {
          setIsPaused(p => !p);
          sound.playClick();
        }}
        onOpenEmbedModal={() => setIsEmbedOpen(true)}
        onOpenControlsModal={() => setIsControlsOpen(true)}
        onOpenProfileModal={() => setIsProfileOpen(true)}
        onQuickSave={handleQuickSave}
        onRestart={() => setIsMenuOpen(true)}
        gameTime={engineRef.current.gameTime}
        commanderName={activeProfile.name}
        commanderRank={commanderRank}
        onUpdateCommanderName={(newName) => {
          storage.renameProfile(activeProfile.id, newName);
          sound.playClick();
          sound.speakEVA(`Comandante ${newName} en línea`);
          setTick(t => t + 1);
        }}
        weather={engineRef.current.weather}
        onCycleWeather={() => {
          engineRef.current.cycleWeather();
          setTick(t => t + 1);
        }}
      />

      {/* Main RTS Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas World Viewport */}
        <main className="flex-1 relative overflow-hidden bg-neutral-950">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full h-full cursor-crosshair block touch-none"
          />

          {/* CRT Retro Scanline Overlay */}
          {crtEnabled && <div className="absolute inset-0 crt-scanlines pointer-events-none z-10" />}

          {/* Tactical Floating Controls Overlay */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 bg-neutral-950/80 p-1.5 rounded-lg border border-neutral-800 backdrop-blur-sm">
            <button
              onClick={() => setCrtEnabled(c => !c)}
              className={`p-1.5 rounded text-xs transition-colors flex items-center gap-1 font-mono-numbers ${
                crtEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Alternar filtro retro CRT Scanlines"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CRT</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded text-xs text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1 font-mono-numbers"
              title="Pantalla completa"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Pantalla</span>
            </button>
          </div>

          {/* Mobile: toggle build panel (drawer) */}
          <button
            onClick={() => {
              setIsSidebarOpen(o => !o);
              sound.playClick();
            }}
            className="absolute bottom-3 right-3 z-30 md:hidden p-2.5 rounded-lg bg-amber-500 text-neutral-950 shadow-xl"
            title={isSidebarOpen ? 'Cerrar panel' : 'Abrir panel de construcción'}
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
          </button>

          {/* Selected Unit Veterancy & Experience HUD */}
          {(() => {
            const selectedUnits = engineRef.current.units.filter(u => u.isPlayer && u.selected);
            if (selectedUnits.length === 0) return null;

            if (selectedUnits.length === 1) {
              const u = selectedUnits[0];
              const kills = u.kills || 0;
              const rank = u.veterancy || 0;
              const rankNames = ['Recluta', 'Veterano', 'Élite', 'Heroico'];
              const rankColors = ['text-cyan-400', 'text-sky-400', 'text-amber-400', 'text-yellow-300'];

              let xpProgress = 0;
              let nextTarget = 3;
              if (rank >= 3 || kills >= 12) {
                xpProgress = 1;
                nextTarget = 12;
              } else if (rank === 2 || kills >= 7) {
                nextTarget = 12;
                xpProgress = Math.min(1, Math.max(0, kills - 7) / 5);
              } else if (rank === 1 || kills >= 3) {
                nextTarget = 7;
                xpProgress = Math.min(1, Math.max(0, kills - 3) / 4);
              } else {
                nextTarget = 3;
                xpProgress = Math.min(1, kills / 3);
              }

              return (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-neutral-950/90 border border-neutral-700/80 rounded-lg px-3.5 py-2 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 min-w-[280px]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-100">{UNIT_DEFS[u.type]?.name || u.type.toUpperCase()}</span>
                    <span className={`font-semibold text-[11px] ${rankColors[rank]}`}>
                      ★ {rankNames[rank]}
                    </span>
                  </div>

                  {/* HP Bar */}
                  <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span className="w-5 font-mono text-emerald-400">HP</span>
                    <div className="flex-1 h-2 bg-neutral-800 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-150"
                        style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%` }}
                      />
                    </div>
                    <span className="font-mono-numbers text-[10px] text-neutral-300">{Math.ceil(u.hp)}/{u.maxHp}</span>
                  </div>

                  {/* Engineer Field XP / Rank & Action HUD */}
                  {u.type === 'engineer' ? (
                    <div className="space-y-1 pt-1 border-t border-neutral-800">
                      <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                        <span className="w-5 font-mono text-sky-400 font-bold">XP</span>
                        <div className="flex-1 h-2 bg-neutral-900 border border-neutral-700 rounded-sm overflow-hidden relative">
                          <div
                            className="h-full bg-sky-400 transition-all duration-150"
                            style={{ width: `${Math.max(0, Math.min(100, ((u.engineerXp || 0) / 300) * 100))}%` }}
                          />
                        </div>
                        <span className="font-mono-numbers text-[10px] text-sky-300 font-semibold">
                          {rank >= 3 ? 'MAX' : `${Math.floor(u.engineerXp || 0)}/300 HP`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={rank >= 2 ? 'text-amber-400 font-semibold' : 'text-neutral-400'}>
                          {rank >= 2 ? '⭐ Nivel 2: Mover edificios activo' : 'Repara edificios para ganar XP'}
                        </span>
                        <span className="text-sky-400 font-mono text-[9px]">
                          {u.engineerAction === 'repairing' ? 'Reparando' : u.engineerAction === 'capturing' ? 'Ocupando' : u.engineerAction === 'moving_building' ? 'Escoltando' : 'Listo'}
                        </span>
                      </div>
                    </div>
                  ) : u.type === 'harvester' ? (
                    <div className="space-y-1.5 pt-1 border-t border-neutral-800">
                      <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                        <span className="w-5 font-mono text-green-400 font-bold">ORE</span>
                        <div className="flex-1 h-2.5 bg-neutral-900 border border-neutral-700 rounded-sm overflow-hidden relative">
                          <div
                            className="h-full bg-green-500 transition-all duration-150 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                            style={{ width: `${Math.max(0, Math.min(100, (u.tiberiumCargo || 0)))}%` }}
                          />
                        </div>
                        <span className="font-mono-numbers text-[10px] text-emerald-300 font-semibold">
                          {Math.round(u.tiberiumCargo || 0)}% (${Math.round(((u.tiberiumCargo || 0) / 100) * 800)})
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] gap-2 pt-0.5">
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            u.harvestState === 'unloading' ? 'bg-amber-400 animate-ping' :
                            u.harvestState === 'harvesting' ? 'bg-green-400 animate-pulse' :
                            u.harvestState === 'returning_to_refinery' ? 'bg-amber-500' : 'bg-neutral-500'
                          }`}></span>
                          {u.harvestState === 'unloading' ? 'Descargando en Refinería...' :
                           u.harvestState === 'harvesting' ? 'Cosechando Tiberio' :
                           u.harvestState === 'returning_to_refinery' ? 'En ruta a Refinería' :
                           u.harvestState === 'moving_to_field' ? 'En ruta al campo' : 'Listo / Esperando'}
                        </span>

                        <button
                          onClick={() => engineRef.current.commandHarvesterUnload(u.id)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-neutral-950 font-bold text-[10px] rounded transition-colors shadow flex items-center gap-1 cursor-pointer"
                          title="Enviar cosechador a la refinería para vender tiberio y sumar créditos (Tecla U)"
                        >
                          <span>DESCARGAR</span>
                          <span className="opacity-75 font-mono text-[9px]">(U)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Experience (XP) Bar */
                    <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                      <span className="w-5 font-mono text-cyan-400">XP</span>
                      <div className="flex-1 h-2 bg-neutral-900 border border-neutral-700 rounded-sm overflow-hidden relative">
                        <div
                          className={`h-full transition-all duration-150 ${
                            rank >= 3 ? 'bg-amber-400 animate-pulse' : rank === 2 ? 'bg-amber-500' : rank === 1 ? 'bg-sky-400' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, xpProgress * 100))}%` }}
                        />
                      </div>
                      <span className="font-mono-numbers text-[10px] text-neutral-300">
                        {rank >= 3 ? 'MAX' : `${kills}/${nextTarget} Kills`}
                      </span>
                    </div>
                  )}
                </div>
              );
            }

            const harvestersCount = selectedUnits.filter(u => u.type === 'harvester').length;

            return (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-neutral-950/90 border border-neutral-700/80 rounded-lg px-4 py-2 shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs">
                <span className="text-neutral-200 font-bold">{selectedUnits.length} Unidades Seleccionadas</span>
                <span className="text-amber-400 font-mono-numbers text-[11px]">
                  {selectedUnits.filter(u => (u.veterancy || 0) > 0).length} Veteranos
                </span>
                {harvestersCount > 0 && (
                  <button
                    onClick={() => engineRef.current.commandHarvesterUnload()}
                    className="ml-2 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold text-[10px] rounded transition-colors shadow flex items-center gap-1 cursor-pointer"
                    title="Enviar todos los cosechadores seleccionados a descargar en la refinería (Tecla U)"
                  >
                    <span>DESCARGAR ({harvestersCount})</span>
                    <span className="opacity-75 font-mono text-[9px]">(U)</span>
                  </button>
                )}
              </div>
            );
          })()}

          {/* Placement Notice Overlay */}
          {engineRef.current.placementStructure && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-emerald-950/90 border border-emerald-500 text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold shadow-xl animate-bounce">
              MODO CONSTRUCCIÓN: Haz click en el terreno para colocar la estructura · Click derecho para cancelar
            </div>
          )}

          {/* Relocation Notice Overlay (Level 2 Engineers) */}
          {engineRef.current.relocatingStructure && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-950/90 border border-amber-500 text-amber-300 px-4 py-2 rounded-lg text-xs font-bold shadow-xl animate-pulse flex items-center gap-2">
              <span>🚚 MODO TRASLADO: Haz click en el terreno despejado para reubicar la estructura · Click derecho para cancelar</span>
            </div>
          )}

          {/* Superweapon Targeting Notice Overlay */}
          {engineRef.current.superweaponTargeting && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-950/90 border border-red-500 text-red-300 px-4 py-2 rounded-lg text-xs font-bold shadow-xl animate-pulse">
              ¡SISTEMA ORBITAL LISTO! Haz click en el sector objetivo para disparar · Click derecho para cancelar
            </div>
          )}

          {/* Tactical Pause Banner */}
          {isPaused && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-amber-400">
              <h2 className="font-scifi text-4xl font-extrabold tracking-widest mb-2">
                PAUSA TÁCTICA
              </h2>
              <p className="text-xs text-neutral-300">
                Presiona <strong>Espacio</strong> o el botón de la barra superior para continuar la batalla
              </p>
            </div>
          )}
        </main>

        {/* Mobile drawer backdrop */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Command & Conquer EVA Sidebar */}
        <Sidebar
          engine={engineRef.current}
          mobileOpen={isSidebarOpen}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          onMinimapClick={(worldX, worldY) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            engineRef.current.cameraX = Math.max(0, Math.min(engineRef.current.currentMap.width - canvas.width, worldX - canvas.width / 2));
            engineRef.current.cameraY = Math.max(0, Math.min(engineRef.current.currentMap.height - canvas.height, worldY - canvas.height / 2));
          }}
          onStartBuild={(type, cat) => engineRef.current.startBuild(type, cat)}
          onCancelBuild={(cat) => engineRef.current.cancelBuild(cat)}
          onSelectPlacement={(type) => engineRef.current.selectStructureForPlacement(type)}
          onActivateSuperweapon={() => {
            engineRef.current.superweaponTargeting = true;
            sound.speakEVA('Selecciona las coordenadas de impacto', true);
            engineRef.current.notifyUI();
          }}
        />
      </div>

      {/* Modals */}
      <GameMenuModal
        isOpen={isMenuOpen}
        onStartGame={handleStartGame}
        onOpenEmbed={() => setIsEmbedOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onLoadSavedGame={handleResumeSavedGame}
      />

      <EmbedModal
        isOpen={isEmbedOpen}
        onClose={() => setIsEmbedOpen(false)}
        appUrl={window.location.origin}
      />

      <ControlsModal
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
      />

      <VictoryDefeatModal
        engine={engineRef.current}
        onRestart={() => restartGame(engineRef.current.playerFaction, engineRef.current.difficulty, engineRef.current.mapType)}
        onOpenEmbed={() => setIsEmbedOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        engine={engineRef.current}
        onLoadSavedGame={handleResumeSavedGame}
      />

      {/* Upright phone: the game only plays in landscape */}
      {needsRotate && (
        <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col items-center justify-center gap-5 px-10 text-center">
          <Smartphone className="w-14 h-14 text-amber-400 animate-rotate-hint" />
          <h2 className="text-lg font-scifi font-bold text-neutral-100 tracking-wide">
            GIRÁ EL CELULAR
          </h2>
          <p className="text-xs text-neutral-400 max-w-[15rem] leading-relaxed">
            Tiberium Wars se juega en horizontal. Rotá el dispositivo para ver el campo de batalla completo.
          </p>
        </div>
      )}
    </div>
  );
}
