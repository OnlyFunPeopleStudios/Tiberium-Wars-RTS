import React, { useState, useRef, useEffect } from 'react';
import { 
  User, Trophy, Award, Flame, Shield, Gem, Target, Zap, Crown, 
  Download, Upload, AlertTriangle, Trash2, Edit3, Plus, Check, 
  Clock, Save, RotateCcw, X, Info
} from 'lucide-react';
import { storage, CommanderProfile, Medal } from '../game/storage';
import { sound } from '../audio/soundEngine';
import { GameEngine } from '../game/engine';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: GameEngine;
  onLoadSavedGame: () => boolean;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  engine,
  onLoadSavedGame,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'saves' | 'medals' | 'profiles'>('profile');
  const [profiles, setProfiles] = useState<CommanderProfile[]>(() => storage.getProfiles());
  const [activeProfile, setActiveProfile] = useState<CommanderProfile>(() => storage.getActiveProfile());
  const [newProfileName, setNewProfileName] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lazy useState initializers above ran once at app boot, so without this the
  // modal shows pre-match stats while the TopBar (which re-reads) shows current.
  // Must sit above the early return below or hook order changes between renders.
  useEffect(() => {
    if (!isOpen) return;
    setProfiles(storage.getProfiles());
    setActiveProfile(storage.getActiveProfile());
  }, [isOpen]);

  if (!isOpen) return null;

  const refreshData = () => {
    setProfiles(storage.getProfiles());
    setActiveProfile(storage.getActiveProfile());
  };

  const handleSaveCurrentMatch = () => {
    if (engine.gameState !== 'PLAYING' && engine.gameState !== 'PAUSED') {
      setFeedbackMsg({ type: 'error', text: 'Solo puedes guardar cuando una partida está en curso.' });
      return;
    }
    const saveState = engine.exportSaveState();
    storage.saveCurrentGame(saveState);
    sound.speakEVA('Partida guardada en el explorador', true);
    setFeedbackMsg({ type: 'success', text: '¡Partida guardada localmente con éxito en tu explorador!' });
    refreshData();
  };

  const handleLoadSavedMatch = () => {
    const saved = storage.getSavedGame();
    if (!saved) {
      setFeedbackMsg({ type: 'error', text: 'No hay ninguna partida guardada disponible.' });
      return;
    }
    const success = onLoadSavedGame();
    if (success) {
      sound.playClick();
      onClose();
    } else {
      setFeedbackMsg({ type: 'error', text: 'Error al reanudar la partida guardada.' });
    }
  };

  const handleDeleteSave = () => {
    storage.clearSavedGame();
    sound.playClick();
    setFeedbackMsg({ type: 'success', text: 'Partida guardada eliminada.' });
    refreshData();
  };

  const handleSelectProfile = (id: string) => {
    storage.setActiveProfile(id);
    sound.playClick();
    refreshData();
  };

  const handleCreateProfile = () => {
    if (!newProfileName.trim()) return;
    storage.createNewProfile(newProfileName.trim(), 'gdi');
    sound.playClick();
    setNewProfileName('');
    setIsCreatingProfile(false);
    refreshData();
    setFeedbackMsg({ type: 'success', text: 'Nuevo perfil de Comandante creado.' });
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) {
      setFeedbackMsg({ type: 'error', text: 'No puedes borrar el único perfil activo.' });
      return;
    }
    storage.deleteProfile(id);
    sound.playClick();
    refreshData();
    setFeedbackMsg({ type: 'success', text: 'Perfil eliminado.' });
  };

  const handleSaveName = () => {
    if (!tempName.trim()) return;
    storage.renameProfile(activeProfile.id, tempName.trim());
    setEditingName(false);
    refreshData();
  };

  // Export progress as JSON file
  const handleExportJSON = () => {
    const jsonStr = storage.exportBackupJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tiberium_wars_backup_${activeProfile.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    sound.playClick();
    setFeedbackMsg({ type: 'success', text: 'Archivo de respaldo JSON descargado en tu equipo.' });
  };

  // Import progress from JSON file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = storage.importBackupJSON(content);
        if (result.success) {
          refreshData();
          sound.speakEVA('Datos restaurados correctamente', true);
          setFeedbackMsg({ type: 'success', text: result.message });
        } else {
          setFeedbackMsg({ type: 'error', text: result.message });
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const rank = storage.getRank(activeProfile.stats.victories);
  const totalMatches = activeProfile.stats.victories + activeProfile.stats.defeats;
  const winRate = totalMatches > 0 ? Math.round((activeProfile.stats.victories / totalMatches) * 100) : 0;
  const playTimeMins = Math.round(activeProfile.stats.playTimeSeconds / 60);

  const getMedalIcon = (iconName: string) => {
    switch (iconName) {
      case 'shield': return <Shield className="w-5 h-5 text-blue-400" />;
      case 'trophy': return <Trophy className="w-5 h-5 text-amber-400" />;
      case 'award': return <Award className="w-5 h-5 text-amber-500" />;
      case 'flame': return <Flame className="w-5 h-5 text-red-500" />;
      case 'gem': return <Gem className="w-5 h-5 text-emerald-400" />;
      case 'target': return <Target className="w-5 h-5 text-cyan-400" />;
      case 'zap': return <Zap className="w-5 h-5 text-purple-400" />;
      case 'crown': return <Crown className="w-5 h-5 text-yellow-400" />;
      default: return <Award className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-xl">
              <User className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-scifi font-bold text-base text-neutral-100">
                  EXPEDIENTE DEL COMANDANTE & AVANCE
                </h2>
                <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full font-mono-numbers uppercase font-semibold">
                  {rank}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Almacenamiento 100% local en tu explorador · Cada jugador juega por separado
              </p>
            </div>
          </div>

          <button
            onClick={() => { sound.playClick(); onClose(); }}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prominent Cookie & Data Loss Warning Banner */}
        <div className="bg-amber-950/40 border-b border-amber-600/30 p-3 px-4 flex items-start gap-2.5 text-xs text-amber-200/95">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-tight">
            <span className="font-bold text-amber-300 uppercase tracking-wide text-[11px] block">
              Aviso Importante sobre tu Avance:
            </span>
            <p className="text-[11px] text-amber-200/90">
              Tu progreso, medallas y partidas guardadas se conservan <strong>únicamente en la memoria local de tu navegador</strong>.
              <span className="text-amber-100 font-semibold underline decoration-amber-400 ml-1">
                Si borras las cookies o los datos de navegación de este sitio, perderás tu avance.
              </span>
              {' '}Usa la opción <em>"Exportar Respaldo (JSON)"</em> para respaldar tu partida en un archivo.
            </p>
          </div>
        </div>

        {/* Notification Toast */}
        {feedbackMsg && (
          <div className={`p-2.5 px-4 text-xs font-semibold flex items-center justify-between ${
            feedbackMsg.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-800' : 'bg-red-950/80 text-red-300 border-b border-red-800'
          }`}>
            <span>{feedbackMsg.text}</span>
            <button onClick={() => setFeedbackMsg(null)} className="text-neutral-400 hover:text-neutral-200 text-xs">✕</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/60 px-4 text-xs font-medium">
          <button
            onClick={() => { sound.playClick(); setActiveTab('profile'); }}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Perfil & Estadísticas</span>
          </button>

          <button
            onClick={() => { sound.playClick(); setActiveTab('saves'); }}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'saves'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar / Cargar Partida</span>
            {activeProfile.savedGame && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5"></span>
            )}
          </button>

          <button
            onClick={() => { sound.playClick(); setActiveTab('medals'); }}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'medals'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Medallas ({activeProfile.medals.filter(m => m.unlockedAt).length}/{activeProfile.medals.length})</span>
          </button>

          <button
            onClick={() => { sound.playClick(); setActiveTab('profiles'); }}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'profiles'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Cambiar Comandante ({profiles.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-neutral-200 text-xs flex-1">
          
          {/* TAB 1: Profile & Career Stats */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Profile Card */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-xl bg-neutral-900 border border-amber-500/40 flex items-center justify-center text-amber-400 font-scifi font-bold text-xl shadow-inner">
                    {activeProfile.favoriteFaction === 'gdi' ? 'GDI' : 'NOD'}
                  </div>

                  <div>
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="px-2 py-1 bg-neutral-800 border border-amber-500/60 rounded text-xs text-neutral-100 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveName}
                          className="p-1 bg-amber-500 text-neutral-950 rounded hover:bg-amber-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-neutral-100">{activeProfile.name}</h3>
                        <button
                          onClick={() => { setTempName(activeProfile.name); setEditingName(true); }}
                          className="text-neutral-500 hover:text-neutral-300"
                          title="Cambiar nombre"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                      <span>Rango: <strong className="text-amber-400">{rank}</strong></span>
                      <span>·</span>
                      <span>Identificador: <strong className="font-mono-numbers text-neutral-300">{activeProfile.callsign}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleExportJSON}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg flex items-center justify-center gap-1.5 transition-colors font-medium text-[11px]"
                    title="Descargar archivo .json con tu progreso"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Exportar Respaldo</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg flex items-center justify-center gap-1.5 transition-colors font-medium text-[11px]"
                    title="Restaurar progreso desde un archivo .json"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Importar Respaldo</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    accept=".json"
                    className="hidden"
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div>
                <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                  Estadísticas de Batalla Acumuladas
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono-numbers">
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Victorias</span>
                    <span className="text-lg font-bold text-emerald-400">{activeProfile.stats.victories}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Derrotas</span>
                    <span className="text-lg font-bold text-red-400">{activeProfile.stats.defeats}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">% Eficacia</span>
                    <span className="text-lg font-bold text-amber-400">{winRate}%</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Bajas Enemigas</span>
                    <span className="text-lg font-bold text-cyan-400">{activeProfile.stats.totalKills}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Tiberio Cosechado</span>
                    <span className="text-base font-bold text-emerald-400">${activeProfile.stats.tiberiumHarvested.toLocaleString()}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Estructuras Creadas</span>
                    <span className="text-base font-bold text-neutral-200">{activeProfile.stats.structuresBuilt}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Superarmas Disparadas</span>
                    <span className="text-base font-bold text-purple-400">{activeProfile.stats.superweaponsFired}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <span className="text-[10px] text-neutral-500 uppercase block font-sans">Tiempo en Combate</span>
                    <span className="text-base font-bold text-neutral-300">{playTimeMins} min</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Saves & Match Load */}
          {activeTab === 'saves' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-neutral-100 text-sm">Estado de la Partida en Curso</h4>
                    <p className="text-[11px] text-neutral-400">
                      Guarda el estado actual del campo de batalla para continuar en cualquier momento en este explorador.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveCurrentMatch}
                    disabled={engine.gameState !== 'PLAYING' && engine.gameState !== 'PAUSED'}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Partida Actual</span>
                  </button>
                </div>
              </div>

              {/* Saved game slot */}
              <div>
                <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                  Partida Guardada en la Memoria Local
                </h4>

                {activeProfile.savedGame ? (
                  <div className="p-4 rounded-xl bg-neutral-950 border border-amber-500/40 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-100 text-sm">
                            Sector {activeProfile.savedGame.mapType.toUpperCase()}
                          </span>
                          <span className="px-2 py-0.5 bg-neutral-800 text-amber-400 rounded text-[10px] font-bold uppercase font-mono-numbers">
                            {activeProfile.savedGame.playerFaction}
                          </span>
                          <span className="px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded text-[10px] uppercase font-mono-numbers">
                            Dificultad: {activeProfile.savedGame.difficulty}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Guardado el: {new Date(activeProfile.savedGame.timestamp).toLocaleString()}</span>
                          <span>·</span>
                          <span>Tiempo de combate: {Math.floor(activeProfile.savedGame.gameTime / 60)}m {activeProfile.savedGame.gameTime % 60}s</span>
                        </div>
                      </div>

                      <button
                        onClick={handleDeleteSave}
                        className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                        title="Eliminar partida guardada"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono-numbers bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800">
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Créditos</span>
                        <span className="text-emerald-400 font-bold">${activeProfile.savedGame.playerCredits.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Estructuras</span>
                        <span className="text-neutral-200 font-bold">{activeProfile.savedGame.structures.filter(s => s.isPlayer).length}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Unidades</span>
                        <span className="text-neutral-200 font-bold">{activeProfile.savedGame.units.filter(u => u.isPlayer).length}</span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={handleLoadSavedMatch}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-950 font-scifi font-bold text-xs rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>REANUDAR ESTA PARTIDA</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center rounded-xl bg-neutral-950/60 border border-neutral-800 text-neutral-500 space-y-1">
                    <Save className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                    <p className="font-semibold text-neutral-400">No hay ninguna partida guardada actualmente.</p>
                    <p className="text-[11px]">Inicia una batalla y pulsa "Guardar Partida" para almacenar tu avance.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Medals & Accolades */}
          {activeTab === 'medals' && (
            <div className="space-y-3">
              <p className="text-[11px] text-neutral-400">
                Las medallas reconocen tus hitos tácticos y victorias en el campo de batalla.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeProfile.medals.map((medal: Medal) => {
                  const isUnlocked = !!medal.unlockedAt;
                  return (
                    <div
                      key={medal.id}
                      className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                        isUnlocked
                          ? 'bg-neutral-950 border-amber-500/40 shadow-sm shadow-amber-500/10'
                          : 'bg-neutral-950/40 border-neutral-800 opacity-50'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${
                        isUnlocked ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-neutral-900 border border-neutral-800'
                      }`}>
                        {getMedalIcon(medal.icon)}
                      </div>

                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center justify-between">
                          <h5 className={`font-bold text-xs ${isUnlocked ? 'text-neutral-100' : 'text-neutral-400'}`}>
                            {medal.name}
                          </h5>
                          {isUnlocked && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                              DESBLOQUEADA
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-normal">{medal.desc}</p>
                        {isUnlocked && medal.unlockedAt && (
                          <span className="text-[9px] text-neutral-500 block">
                            Obtenida: {new Date(medal.unlockedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: Commander Profile Manager (Multi-profile) */}
          {activeTab === 'profiles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-neutral-100 text-sm">Comandantes Locales en este Equipo</h4>
                  <p className="text-[11px] text-neutral-400">
                    Permite que diferentes personas jueguen en este mismo navegador sin interferir con el avance del otro.
                  </p>
                </div>

                <button
                  onClick={() => setIsCreatingProfile(true)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Comandante</span>
                </button>
              </div>

              {/* Create new profile input */}
              {isCreatingProfile && (
                <div className="p-3 bg-neutral-950 border border-amber-500/40 rounded-xl flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del nuevo Comandante..."
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateProfile}
                    className="px-3 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg text-xs hover:bg-amber-400"
                  >
                    Crear
                  </button>
                  <button
                    onClick={() => setIsCreatingProfile(false)}
                    className="px-2.5 py-1.5 bg-neutral-800 text-neutral-400 rounded-lg text-xs hover:text-neutral-200"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* List of profiles */}
              <div className="space-y-2">
                {profiles.map((p) => {
                  const isActive = p.id === activeProfile.id;
                  const pRank = storage.getRank(p.stats.victories);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProfile(p.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isActive
                          ? 'bg-amber-950/20 border-amber-500/60 shadow-sm shadow-amber-500/10'
                          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isActive ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                        }`}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-200">{p.name}</span>
                            {isActive && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-semibold">
                                ACTIVO
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                            <span>Rango: <strong className="text-neutral-300">{pRank}</strong></span>
                            <span>·</span>
                            <span>{p.stats.victories} Victorias / {p.stats.defeats} Derrotas</span>
                          </div>
                        </div>
                      </div>

                      {profiles.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProfile(p.id);
                          }}
                          className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                          title="Eliminar este perfil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1 text-[11px] text-neutral-500">
            <Info className="w-3.5 h-3.5" />
            <span>Los datos residen en <strong>localStorage</strong> de este navegador.</span>
          </div>

          <button
            onClick={() => { sound.playClick(); onClose(); }}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
