import React, { useState, useEffect } from 'react';
import { Faction, AIDifficulty, MapType } from '../game/types';
import { MAP_PRESETS } from '../game/gameData';
import { Play, Shield, Flame, MapPin, Info, User, RotateCcw, AlertTriangle, Download, Edit3, Check, X } from 'lucide-react';
import { sound } from '../audio/soundEngine';
import { storage } from '../game/storage';

interface GameMenuModalProps {
  isOpen: boolean;
  onStartGame: (faction: Faction, difficulty: AIDifficulty, map: MapType) => void;
  onOpenEmbed: () => void;
  onOpenProfile: () => void;
  onLoadSavedGame?: () => void;
}

export const GameMenuModal: React.FC<GameMenuModalProps> = ({
  isOpen,
  onStartGame,
  onOpenEmbed,
  onOpenProfile,
  onLoadSavedGame,
}) => {
  const [selectedFaction, setSelectedFaction] = useState<Faction>('gdi');
  const [selectedDifficulty, setSelectedDifficulty] = useState<AIDifficulty>('medium');
  const [selectedMap, setSelectedMap] = useState<MapType>('wasteland');
  const [isEditingName, setIsEditingName] = useState(false);
  const [commanderNameDraft, setCommanderNameDraft] = useState('');

  if (!isOpen) return null;

  const activeProfile = storage.getActiveProfile();
  const savedGame = storage.getSavedGame();
  const rank = storage.getRank(activeProfile.stats.victories);

  const handleSaveCommanderName = () => {
    const trimmed = commanderNameDraft.trim();
    if (trimmed && trimmed !== activeProfile.name) {
      storage.renameProfile(activeProfile.id, trimmed);
      sound.playClick();
      sound.speakEVA(`Comandante ${trimmed} confirmado`);
    }
    setIsEditingName(false);
  };

  const handleLaunch = () => {
    sound.playClick();
    onStartGame(selectedFaction, selectedDifficulty, selectedMap);
  };

  const handleResumeSaved = () => {
    sound.playClick();
    if (onLoadSavedGame) onLoadSavedGame();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Banner Hero */}
        <div className="relative h-44 sm:h-52 bg-neutral-950 overflow-hidden border-b border-neutral-800">
          <img
            src="/src/assets/images/tiberium_warzone_banner_1790201925900.jpg"
            alt="Tiberium Warzone"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent"></div>

          <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between">
            <div>
              <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase block">
                Motor Táctico en Tiempo Real (RTS) · 100% Client-Side
              </span>
              <h1 className="font-scifi text-2xl sm:text-3xl font-extrabold text-neutral-100 tracking-wider">
                TIBERIUM WARS
              </h1>
              <p className="text-xs text-neutral-300 mt-0.5">
                Clon de Command & Conquer listo para desplegar gratis en OnlyFunPeople Studios
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-900 border border-amber-500 rounded-lg text-xs shadow">
                  <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <input
                    type="text"
                    value={commanderNameDraft}
                    onChange={(e) => setCommanderNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveCommanderName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    placeholder="Tu nombre de comandante..."
                    maxLength={24}
                    autoFocus
                    className="bg-neutral-800 border border-amber-500/50 rounded px-1.5 py-0.5 text-xs text-neutral-100 font-semibold focus:outline-none w-36"
                  />
                  <button
                    onClick={handleSaveCommanderName}
                    className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 transition-colors"
                    title="Confirmar"
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
                    title="Cancelar"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded-lg text-xs font-semibold text-amber-300 shadow">
                  <button
                    onClick={onOpenProfile}
                    className="flex items-center gap-1.5 hover:text-amber-200 cursor-pointer"
                    title="Ver Expediente de Comandante y Medallas"
                  >
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Comandante: {activeProfile.name}</span>
                    <span className="sm:hidden">Perfil</span>
                  </button>
                  <button
                    onClick={() => {
                      setCommanderNameDraft(activeProfile.name);
                      setIsEditingName(true);
                    }}
                    className="p-1 text-amber-400 hover:text-amber-200 hover:bg-amber-500/20 rounded ml-1 cursor-pointer"
                    title="Modificar nombre de comandante"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}

              <button
                onClick={onOpenEmbed}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600 rounded-lg text-xs font-semibold text-emerald-400 transition-colors shadow"
              >
                <span>Guía Web</span>
              </button>
            </div>
          </div>
        </div>

        {/* Prominent Cookie / Local Data Deletion Advisory */}
        <div className="bg-amber-950/50 border-b border-amber-500/30 p-3 px-5 flex items-start gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-bold text-amber-300 block mb-0.5">
              Almacenamiento Local en Navegador (Privado e Independiente):
            </span>
            <span>
              Cada usuario juega sin interferir con otras personas. Todo tu avance (estadísticas, medallas y partidas) se guarda únicamente de forma local en tu explorador actual (sin bases de datos en la nube).
            </span>
            <span className="block mt-0.5 text-amber-100 font-semibold underline decoration-amber-400">
              Aclaración: Si borras las cookies, la caché o los datos de navegación de tu explorador, se perderá tu avance del juego.
            </span>
          </div>
        </div>

        {/* Configuration Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-neutral-200">
          
          {/* Quick Resume Saved Game Option */}
          {savedGame && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-neutral-950 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
              <div className="space-y-0.5 text-left w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded uppercase font-mono-numbers">
                    Partida Guardada
                  </span>
                  <span className="font-bold text-xs text-neutral-100">
                    Sector {savedGame.mapType.toUpperCase()} ({savedGame.playerFaction.toUpperCase()})
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Guardada el {new Date(savedGame.timestamp).toLocaleString()} · ${savedGame.playerCredits.toLocaleString()} créditos
                </p>
              </div>

              <button
                onClick={handleResumeSaved}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-scifi font-bold text-xs rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>CONTINUAR PARTIDA GUARDADA</span>
              </button>
            </div>
          )}

          {/* 1. Faction Selection */}
          <div>
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-2.5">
              1. Selecciona tu Facción de Combate
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* GDI */}
              <div
                onClick={() => { setSelectedFaction('gdi'); sound.playClick(); }}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-3 items-center ${
                  selectedFaction === 'gdi'
                    ? 'border-amber-500 bg-amber-950/25 shadow-lg shadow-amber-900/20'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                }`}
              >
                <img
                  src="/src/assets/images/gdi_faction_emblem_1790201936199.jpg"
                  alt="GDI Crest"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover border border-amber-500/40"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-sm text-neutral-100">GDI</h3>
                  </div>
                  <p className="text-[11px] text-amber-400/90 font-medium">Defensa Global</p>
                  <p className="text-[10px] text-neutral-400">
                    Blindaje superior, tanques Predator y el devastador Cañón de Iones Orbital.
                  </p>
                </div>
              </div>

              {/* Nod */}
              <div
                onClick={() => { setSelectedFaction('nod'); sound.playClick(); }}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-3 items-center ${
                  selectedFaction === 'nod'
                    ? 'border-red-500 bg-red-950/25 shadow-lg shadow-red-900/20'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                }`}
              >
                <img
                  src="/src/assets/images/nod_faction_emblem_1790201945367.jpg"
                  alt="Nod Crest"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover border border-red-500/40"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-red-500" />
                    <h3 className="font-bold text-sm text-neutral-100">Hermandad de Nod</h3>
                  </div>
                  <p className="text-[11px] text-red-400/90 font-medium">Kane Vive</p>
                  <p className="text-[10px] text-neutral-400">
                    Velocidad letal, armamento láser, caminantes Avatar y Misil Nuclear del Templo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Map Selection & Difficulty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Map Selection */}
            <div>
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-2">
                2. Sector de Operaciones (Mapa)
              </label>
              <div className="space-y-2">
                {(Object.keys(MAP_PRESETS) as MapType[]).map(key => {
                  const m = MAP_PRESETS[key];
                  return (
                    <div
                      key={key}
                      onClick={() => { setSelectedMap(key); sound.playClick(); }}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between text-xs ${
                        selectedMap === key
                          ? 'border-amber-500 bg-amber-950/20 text-neutral-100'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-semibold">{m.name}</span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono-numbers">{m.width}x{m.height}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-2">
                3. Dificultad de la IA
              </label>
              <div className="space-y-2">
                {[
                  { id: 'easy', label: 'Fácil (Recluta)', desc: 'Oleadas defensivas ligeras, ritmo calmado' },
                  { id: 'medium', label: 'Medio (Comandante)', desc: 'Expansión equilibrada y asaltos coordinados' },
                  { id: 'hard', label: 'Difícil (General)', desc: 'Economía agresiva, ataques rápidos y tecnología punta' },
                ].map(d => (
                  <div
                    key={d.id}
                    onClick={() => { setSelectedDifficulty(d.id as AIDifficulty); sound.playClick(); }}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer text-xs ${
                      selectedDifficulty === d.id
                        ? 'border-amber-500 bg-amber-950/20 text-neutral-100'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <div className="font-semibold text-neutral-200">{d.label}</div>
                    <div className="text-[10px] text-neutral-500">{d.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={onOpenProfile}
            className="text-xs text-neutral-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span>Perfil: <strong>{activeProfile.name}</strong> ({rank}) · Ver Avance</span>
          </button>

          <button
            onClick={handleLaunch}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-scifi font-bold text-sm rounded-lg transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>DESPLEGAR NUEVA PARTIDA</span>
          </button>
        </div>
      </div>
    </div>
  );
};
