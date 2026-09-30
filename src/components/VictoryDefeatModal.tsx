import React from 'react';
import { Trophy, Skull, RotateCcw, Share2, Award, User, AlertTriangle } from 'lucide-react';
import { GameEngine } from '../game/engine';
import { storage } from '../game/storage';

interface VictoryDefeatModalProps {
  engine: GameEngine;
  onRestart: () => void;
  onOpenEmbed: () => void;
  onOpenProfile: () => void;
}

export const VictoryDefeatModal: React.FC<VictoryDefeatModalProps> = ({
  engine,
  onRestart,
  onOpenEmbed,
  onOpenProfile,
}) => {
  if (engine.gameState !== 'VICTORY' && engine.gameState !== 'DEFEAT') {
    return null;
  }

  const isVictory = engine.gameState === 'VICTORY';
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const activeProfile = storage.getActiveProfile();
  const rank = storage.getRank(activeProfile.stats.victories);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-300">
      <div className={`w-full max-w-md bg-neutral-900 border-2 rounded-2xl shadow-2xl overflow-hidden text-neutral-100 ${
        isVictory ? 'border-amber-500 shadow-amber-500/20' : 'border-red-600 shadow-red-600/20'
      }`}>
        {/* Banner */}
        <div className={`p-5 text-center ${
          isVictory ? 'bg-gradient-to-b from-amber-500/20 to-neutral-900' : 'bg-gradient-to-b from-red-600/20 to-neutral-900'
        }`}>
          {isVictory ? (
            <div className="inline-flex p-3 bg-amber-500/20 border border-amber-500/50 rounded-2xl mb-2">
              <Trophy className="w-9 h-9 text-amber-400" />
            </div>
          ) : (
            <div className="inline-flex p-3 bg-red-500/20 border border-red-500/50 rounded-2xl mb-2">
              <Skull className="w-9 h-9 text-red-400" />
            </div>
          )}

          <h2 className="font-scifi text-2xl font-black tracking-wider">
            {isVictory ? '¡VICTORIA TÁCTICA!' : 'MISIÓN FALLIDA'}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            {isVictory
              ? 'Todas las fuerzas enemigas han sido aniquiladas. El sector está bajo control.'
              : 'Nuestras defensas colapsaron ante el embate enemigo. Retirada táctica ordenada.'}
          </p>
        </div>

        {/* Debriefing Stats */}
        <div className="p-5 pt-1 space-y-3 text-xs">
          
          {/* Commander Card */}
          <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-neutral-200">{activeProfile.name}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-semibold uppercase">
              {rank}
            </span>
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 space-y-1.5 font-mono-numbers">
            <div className="flex justify-between text-neutral-400">
              <span>Tiempo de Operación:</span>
              <span className="text-neutral-200 font-bold">{formatTime(engine.gameTime)}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Facción:</span>
              <span className="text-neutral-200 font-bold uppercase">{engine.playerFaction}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Bajas Enemigas Logradas:</span>
              <span className="text-cyan-400 font-bold">{engine.matchKills}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Tiberio Cosechado:</span>
              <span className="text-emerald-400 font-bold">${engine.matchTiberiumHarvested.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Balance Victorias / Derrotas:</span>
              <span className="text-amber-400 font-bold">{activeProfile.stats.victories}V - {activeProfile.stats.defeats}D</span>
            </div>
          </div>

          {/* Cookie Notice Reminder */}
          <div className="p-2.5 bg-amber-950/30 rounded-lg border border-amber-500/20 flex items-start gap-2 text-[11px] text-amber-200/90 leading-tight">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Guardado automático local:</strong> Tu avance se guardó en este navegador. Recuerda que si borras las cookies y datos del explorador, se perderá tu progreso.
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onRestart}
              className={`flex-1 py-2.5 text-xs font-bold font-scifi rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isVictory
                  ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-md shadow-amber-500/20'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/20'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>NUEVA BATALLA</span>
            </button>

            <button
              onClick={onOpenProfile}
              className="px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-neutral-700"
              title="Ver Expediente y Medallas"
            >
              <Award className="w-4 h-4" />
              <span>Medallas</span>
            </button>

            <button
              onClick={onOpenEmbed}
              className="px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-neutral-700"
              title="Integrar este juego en OnlyFunPeople Studios"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
