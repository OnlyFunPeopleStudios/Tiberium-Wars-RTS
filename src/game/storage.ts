/**
 * Client-Side Local Storage System for Tiberium Wars RTS
 * 
 * Stores 100% of game progression, commander profiles, battle stats,
 * and quick-saves locally inside the browser's localStorage.
 * No external servers, Firebase, or Supabase.
 * Includes backup export/import (JSON) and warning banners for cookie/cache deletion.
 */

import { Faction, AIDifficulty, MapType, StructureInstance, UnitInstance, TiberiumCrystal, ScorchDecal, BuildQueueItem } from './types';

export interface SavedGameState {
  id: string;
  timestamp: number;
  gameTime: number;
  playerFaction: Faction;
  aiFaction: Faction;
  difficulty: AIDifficulty;
  mapType: MapType;
  playerCredits: number;
  aiCredits: number;
  structures: StructureInstance[];
  units: UnitInstance[];
  tiberiumCrystals: TiberiumCrystal[];
  scorches: ScorchDecal[];
  fog: number[];
  cameraX: number;
  cameraY: number;
  structureQueue: BuildQueueItem[] | BuildQueueItem | null;
  unitQueue: BuildQueueItem[] | BuildQueueItem | null;
  infantryQueue?: BuildQueueItem[];
  vehicleQueue?: BuildQueueItem[];
  playerSuperweaponReady: boolean;
  playerSuperweaponTimer: number;
}

export interface Medal {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlockedAt?: number;
}

export interface CommanderProfile {
  id: string;
  name: string;
  callsign: string;
  avatar: string;
  createdAt: number;
  lastPlayed: number;
  favoriteFaction: Faction;
  stats: {
    victories: number;
    defeats: number;
    totalKills: number;
    tiberiumHarvested: number;
    structuresBuilt: number;
    superweaponsFired: number;
    playTimeSeconds: number;
  };
  medals: Medal[];
  savedGame?: SavedGameState;
}

const DEFAULT_MEDALS: Medal[] = [
  { id: 'first_battle', name: 'Bautismo de Fuego', desc: 'Completa tu primera batalla (victoria o derrota).', icon: 'shield' },
  { id: 'first_win', name: 'Primera Victoria', desc: 'Consigue tu primera victoria táctica.', icon: 'trophy' },
  { id: 'gdi_victor', name: 'Escudo Global', desc: 'Gana una batalla liderando la Iniciativa GDI.', icon: 'award' },
  { id: 'nod_victor', name: 'Profeta de Nod', desc: 'Gana una batalla liderando la Hermandad de Nod.', icon: 'flame' },
  { id: 'tiberium_baron', name: 'Magnate del Tiberio', desc: 'Cosecha más de $20,000 créditos en Tiberio.', icon: 'gem' },
  { id: 'destroyer', name: 'Aniquilador Táctico', desc: 'Elimina 40 o más unidades enemigas en total.', icon: 'target' },
  { id: 'superweapon_strike', name: 'Ira Orbital / Nuclear', desc: 'Dispara una superarma (Cañón de Iones o Misil Nuclear).', icon: 'zap' },
  { id: 'hard_general', name: 'General Supremo', desc: 'Derrota a la IA en dificultad Difícil (General).', icon: 'crown' },
];

const STORAGE_KEY_PROFILES = 'tiberium_wars_profiles_v1';
const STORAGE_KEY_ACTIVE_ID = 'tiberium_wars_active_profile_v1';

export class LocalStorageManager {
  private static instance: LocalStorageManager;

  private profiles: CommanderProfile[] = [];
  private activeProfileId: string = '';

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): LocalStorageManager {
    if (!LocalStorageManager.instance) {
      LocalStorageManager.instance = new LocalStorageManager();
    }
    return LocalStorageManager.instance;
  }

  private loadFromStorage() {
    try {
      const rawProfiles = localStorage.getItem(STORAGE_KEY_PROFILES);
      if (rawProfiles) {
        this.profiles = JSON.parse(rawProfiles);
      }

      if (!this.profiles || this.profiles.length === 0) {
        // Create initial default profile
        const defaultProf = this.createNewProfile('Comandante 1', 'gdi');
        this.profiles = [defaultProf];
        this.activeProfileId = defaultProf.id;
      } else {
        const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
        if (activeId && this.profiles.some(p => p.id === activeId)) {
          this.activeProfileId = activeId;
        } else {
          this.activeProfileId = this.profiles[0].id;
        }
      }

      // Ensure all medals are present in profiles
      this.profiles.forEach(p => {
        if (!p.medals || p.medals.length === 0) {
          p.medals = [...DEFAULT_MEDALS];
        } else {
          DEFAULT_MEDALS.forEach(dm => {
            if (!p.medals.some(m => m.id === dm.id)) {
              p.medals.push({ ...dm });
            }
          });
        }
      });

      this.saveToStorage();
    } catch (err) {
      console.warn('Error reading from localStorage, creating fallback session profile', err);
      const fallback = this.createNewProfile('Comandante 1', 'gdi');
      this.profiles = [fallback];
      this.activeProfileId = fallback.id;
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(this.profiles));
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, this.activeProfileId);
    } catch (err) {
      console.error('Error saving to localStorage', err);
    }
  }

  public getProfiles(): CommanderProfile[] {
    return [...this.profiles];
  }

  public getActiveProfile(): CommanderProfile {
    const prof = this.profiles.find(p => p.id === this.activeProfileId);
    if (prof) return prof;
    return this.profiles[0];
  }

  public setActiveProfile(id: string) {
    if (this.profiles.some(p => p.id === id)) {
      this.activeProfileId = id;
      this.saveToStorage();
    }
  }

  public createNewProfile(name: string, favoriteFaction: Faction = 'gdi'): CommanderProfile {
    const cleanName = name.trim() || `Comandante ${this.profiles.length + 1}`;
    const newProf: CommanderProfile = {
      id: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      callsign: `TAC-${Math.floor(100 + Math.random() * 900)}`,
      avatar: favoriteFaction === 'gdi' ? 'gdi_commander' : 'nod_commander',
      createdAt: Date.now(),
      lastPlayed: Date.now(),
      favoriteFaction,
      stats: {
        victories: 0,
        defeats: 0,
        totalKills: 0,
        tiberiumHarvested: 0,
        structuresBuilt: 0,
        superweaponsFired: 0,
        playTimeSeconds: 0,
      },
      medals: JSON.parse(JSON.stringify(DEFAULT_MEDALS)),
    };

    this.profiles.push(newProf);
    this.activeProfileId = newProf.id;
    this.saveToStorage();
    return newProf;
  }

  public renameProfile(id: string, newName: string) {
    const prof = this.profiles.find(p => p.id === id);
    if (prof && newName.trim()) {
      prof.name = newName.trim();
      this.saveToStorage();
    }
  }

  public deleteProfile(id: string): boolean {
    if (this.profiles.length <= 1) return false; // Prevent deleting only profile
    this.profiles = this.profiles.filter(p => p.id !== id);
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles[0].id;
    }
    this.saveToStorage();
    return true;
  }

  public recordMatchEnd(data: {
    isVictory: boolean;
    faction: Faction;
    difficulty: AIDifficulty;
    gameDuration: number;
    kills: number;
    tiberiumHarvested: number;
    structuresBuilt: number;
    superweaponFired: boolean;
  }) {
    const prof = this.getActiveProfile();
    prof.lastPlayed = Date.now();
    prof.stats.playTimeSeconds += Math.floor(data.gameDuration);
    prof.stats.totalKills += data.kills;
    prof.stats.tiberiumHarvested += Math.floor(data.tiberiumHarvested);
    prof.stats.structuresBuilt += data.structuresBuilt;
    if (data.superweaponFired) {
      prof.stats.superweaponsFired += 1;
    }

    if (data.isVictory) {
      prof.stats.victories += 1;
    } else {
      prof.stats.defeats += 1;
    }

    // Check & unlock medals
    this.checkMedalUnlocks(prof, data);

    // If game ended, clear saved game in progress
    prof.savedGame = undefined;

    this.saveToStorage();
  }

  private checkMedalUnlocks(
    prof: CommanderProfile,
    data: {
      isVictory: boolean;
      faction: Faction;
      difficulty: AIDifficulty;
      superweaponFired: boolean;
    }
  ) {
    const now = Date.now();
    const unlock = (medalId: string) => {
      const m = prof.medals.find(item => item.id === medalId);
      if (m && !m.unlockedAt) {
        m.unlockedAt = now;
      }
    };

    unlock('first_battle');
    if (data.isVictory) {
      unlock('first_win');
      if (data.faction === 'gdi') unlock('gdi_victor');
      if (data.faction === 'nod') unlock('nod_victor');
      if (data.difficulty === 'hard') unlock('hard_general');
    }

    if (prof.stats.tiberiumHarvested >= 20000) unlock('tiberium_baron');
    if (prof.stats.totalKills >= 40) unlock('destroyer');
    if (data.superweaponFired || prof.stats.superweaponsFired >= 1) unlock('superweapon_strike');
  }

  public saveCurrentGame(save: SavedGameState) {
    const prof = this.getActiveProfile();
    prof.savedGame = save;
    prof.lastPlayed = Date.now();
    this.saveToStorage();
  }

  public getSavedGame(): SavedGameState | undefined {
    return this.getActiveProfile().savedGame;
  }

  public clearSavedGame() {
    const prof = this.getActiveProfile();
    prof.savedGame = undefined;
    this.saveToStorage();
  }

  public getRank(victories: number): string {
    if (victories >= 25) return 'Comandante Supremo';
    if (victories >= 18) return 'General';
    if (victories >= 12) return 'Coronel';
    if (victories >= 8) return 'Mayor';
    if (victories >= 5) return 'Capitán';
    if (victories >= 3) return 'Teniente';
    if (victories >= 1) return 'Sargento';
    return 'Recluta';
  }

  // Backup Export to JSON file
  public exportBackupJSON(): string {
    const data = {
      exportVersion: '1.0',
      exportDate: new Date().toISOString(),
      activeProfileId: this.activeProfileId,
      profiles: this.profiles,
    };
    return JSON.stringify(data, null, 2);
  }

  // Backup Import from JSON string
  public importBackupJSON(jsonStr: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.profiles || !Array.isArray(parsed.profiles)) {
        return { success: false, message: 'El archivo no contiene un formato de perfil de Tiberium Wars válido.' };
      }

      this.profiles = parsed.profiles;
      this.activeProfileId = parsed.activeProfileId || this.profiles[0].id;
      this.saveToStorage();
      return { success: true, message: `Se importaron ${this.profiles.length} perfil(es) con éxito.` };
    } catch (err: any) {
      return { success: false, message: `Error al leer el archivo JSON: ${err.message}` };
    }
  }
}

export const storage = LocalStorageManager.getInstance();
