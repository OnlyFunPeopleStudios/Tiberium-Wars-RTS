import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Pause, Play, Share2, HelpCircle, RotateCcw, Save, User, Check, Sun, CloudFog, CloudRain, Zap, Edit3, X } from 'lucide-react';
import { sound } from '../audio/soundEngine';
import { WeatherControllerState } from '../game/types';

interface TopBarProps {
  isMuted: boolean;
  onToggleMute: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onOpenEmbedModal: () => void;
  onOpenControlsModal: () => void;
  onOpenProfileModal: () => void;
  onQuickSave: () => void;
  onRestart: () => void;
  gameTime: number;
  commanderName: string;
  commanderRank: string;
  onUpdateCommanderName?: (newName: string) => void;
  weather?: WeatherControllerState;
  onCycleWeather?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isMuted,
  onToggleMute,
  isPaused,
  onTogglePause,
  onOpenEmbedModal,
  onOpenControlsModal,
  onOpenProfileModal,
  onQuickSave,
  onRestart,
  gameTime,
  commanderName,
  commanderRank,
  onUpdateCommanderName,
  weather,
  onCycleWeather,
}) => {
  const [justSaved, setJustSaved] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(commanderName);

  useEffect(() => {
    setNameDraft(commanderName);
  }, [commanderName]);

  const handleSaveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== commanderName && onUpdateCommanderName) {
      onUpdateCommanderName(trimmed);
    }
    setIsEditingName(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveClick = () => {
    onQuickSave();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  return (
    <header className="h-12 bg-neutral-900/95 border-b border-neutral-800 px-3 sm:px-4 flex items-center justify-between gap-2 text-neutral-200 z-30 select-none backdrop-blur-sm overflow-x-auto [&>*]:shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <span className="font-scifi text-base sm:text-lg font-bold tracking-wider text-amber-500 hover:text-amber-400 transition-colors cursor-pointer" onClick={onRestart}>
          TIBERIUM WARS
        </span>
        <span className="text-[11px] text-neutral-500 hidden xl:inline">
          Edición Web para onlyfunpeople.com.ar
        </span>
      </div>

      {/* Zone 2: Navigation & Status Links */}
      <nav className="flex items-center gap-2 sm:gap-3 text-xs font-medium text-neutral-400">
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-neutral-950/80 rounded border border-neutral-800">
          <span className="text-neutral-500">TIEMPO:</span>
          <span className="font-mono-numbers text-neutral-200 font-semibold">{formatTime(gameTime)}</span>
        </div>

        {/* Weather Indicator & Cycle Control */}
        {weather && (
          <button
            onClick={() => {
              if (onCycleWeather) onCycleWeather();
              sound.playClick();
            }}
            className={`px-2.5 py-1 rounded border flex items-center gap-1.5 transition-all cursor-pointer font-mono-numbers text-xs ${
              weather.current === 'ion_storm'
                ? 'bg-purple-950/70 border-purple-500/60 text-purple-300 hover:bg-purple-900/60 shadow-[0_0_12px_rgba(147,51,234,0.3)]'
                : weather.current === 'rain'
                ? 'bg-sky-950/70 border-sky-500/60 text-sky-300 hover:bg-sky-900/60 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : weather.current === 'fog'
                ? 'bg-slate-900/80 border-slate-600 text-slate-300 hover:bg-slate-800/80'
                : 'bg-amber-950/40 border-amber-600/40 text-amber-400 hover:bg-amber-900/40'
            }`}
            title={`Clima actual: ${
              weather.current === 'ion_storm'
                ? 'Tormenta Iónica de Tiberio (+35% Daño Láser/Eléctrico, Recarga Cañón Iones +25%)'
                : weather.current === 'rain'
                ? 'Lluvia Ácida (+20% Velocidad Terrestre, +10% Cadencia de Fuego)'
                : weather.current === 'fog'
                ? 'Niebla Densa (Línea de visión reducida 30%)'
                : 'Soleado (Condiciones normales 100%)'
            }. Haz click para alternar clima.`}
          >
            {weather.current === 'ion_storm' ? (
              <Zap className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            ) : weather.current === 'rain' ? (
              <CloudRain className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
            ) : weather.current === 'fog' ? (
              <CloudFog className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-semibold hidden md:inline">
              {weather.current === 'ion_storm'
                ? 'Tormenta Ión'
                : weather.current === 'rain'
                ? 'Lluvia'
                : weather.current === 'fog'
                ? 'Niebla'
                : 'Soleado'}
            </span>
            {weather.isTransitioning ? (
              <span className="text-[10px] text-amber-300 animate-pulse font-normal">
                (Cambio...)
              </span>
            ) : (
              <span className="text-[10px] opacity-75 hidden sm:inline">
                {Math.max(0, Math.ceil(weather.duration - weather.timer))}s
              </span>
            )}
          </button>
        )}

        {/* Commander Profile & Name Editor */}
        {isEditingName ? (
          <div className="px-2 py-0.5 bg-neutral-950 border border-amber-500 rounded flex items-center gap-1.5 shadow-md shadow-amber-500/10">
            <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setNameDraft(commanderName);
                  setIsEditingName(false);
                }
              }}
              placeholder="Tu nombre..."
              maxLength={24}
              autoFocus
              className="bg-neutral-900 border border-amber-500/60 rounded px-1.5 py-0.5 text-xs text-neutral-100 font-semibold focus:outline-none w-28 sm:w-36"
            />
            <button
              onClick={handleSaveName}
              className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 transition-colors cursor-pointer"
              title="Guardar nombre de Comandante"
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </button>
            <button
              onClick={() => {
                setNameDraft(commanderName);
                setIsEditingName(false);
              }}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              title="Cancelar"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded flex items-center gap-1.5 transition-colors group">
            <button
              onClick={onOpenProfileModal}
              className="flex items-center gap-1.5 cursor-pointer hover:text-amber-300"
              title="Ver Expediente de Comandante y Medallas"
            >
              <User className="w-3.5 h-3.5" />
              <span className="font-semibold hidden sm:inline max-w-[130px] truncate">{commanderName}</span>
              <span className="text-[10px] px-1 bg-amber-500/20 rounded uppercase text-amber-300 hidden md:inline">
                {commanderRank}
              </span>
            </button>

            {/* Quick Edit Name Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNameDraft(commanderName);
                setIsEditingName(true);
              }}
              className="p-1 text-amber-500/60 hover:text-amber-300 hover:bg-amber-500/20 rounded transition-colors cursor-pointer"
              title="Modificar nombre de usuario"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Quick Save Button */}
        <button
          onClick={handleSaveClick}
          className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors border cursor-pointer ${
            justSaved
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
          }`}
          title="Guardar estado de partida actual localmente en tu explorador"
        >
          {justSaved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{justSaved ? '¡Guardado!' : 'Guardar'}</span>
        </button>

        <button
          onClick={onOpenEmbedModal}
          className="hover:text-emerald-400 transition-colors hidden lg:flex items-center gap-1.5 whitespace-nowrap text-emerald-500 font-semibold"
          title="Instrucciones para desplegar gratis en tu sitio web"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Desplegar</span>
        </button>

        <button
          onClick={onOpenControlsModal}
          className="hover:text-neutral-200 transition-colors hidden sm:flex items-center gap-1.5 whitespace-nowrap"
          title="Ver controles y atajos de teclado"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Ayuda</span>
        </button>
      </nav>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onToggleMute}
          className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
        </button>

        <button
          onClick={onTogglePause}
          className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          title={isPaused ? 'Reanudar partida' : 'Pausar partida'}
        >
          {isPaused ? <Play className="w-4 h-4 text-amber-400" /> : <Pause className="w-4 h-4" />}
        </button>

        <button
          onClick={onRestart}
          className="px-2.5 sm:px-3 py-1 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
          title="Nueva Partida"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Nueva Partida</span>
          <span className="sm:hidden">Menú</span>
        </button>
      </div>
    </header>
  );
};
