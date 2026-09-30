/**
 * Procedural Web Audio API Sound Engine & EVA Voice Synthesizer
 * No external sound files required; fully standalone and reliable.
 * Includes Spatial Combat Sound Manager with camera-distance attenuation,
 * stereo panning, low-pass air dampening, and procedural vocal screams.
 */

import { UnitType } from '../game/types';

export interface SpatialAudioParams {
  audible: boolean;
  volumeFactor: number;
  pan: number;
  filterFreq: number;
  dist: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxVolume: number = 0.7;
  private voiceVolume: number = 0.9;
  private isMuted: boolean = false;
  private voiceEnabled: boolean = true;
  private lastVoiceTime: number = 0;
  private lastUnitVoiceTime: number = 0;
  private evaVoice: SpeechSynthesisVoice | null = null;

  // --- SPATIAL CAMERA & LISTENER TRACKING ---
  public listenerX: number = 1200;
  public listenerY: number = 1200;
  public viewportW: number = 1200;
  public viewportH: number = 800;
  public maxAudibleDist: number = 2200; // max hearing range in world pixels

  // Audio rate-limiting throttle map (prevents audio clipping in mass battles)
  private soundThrottle: Record<string, number> = {};

  // Tactical combat sound manager instance
  public readonly combat: CombatSoundManager;

  constructor() {
    this.combat = new CombatSoundManager(this);
    // Lazy init audio context on first user interaction
    this.initVoice();
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private initVoice() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const findVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Try finding English or Spanish robotic/clear female/military voice
      const preferred = voices.find(v => (v.lang.startsWith('es') || v.lang.startsWith('en')) && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Female')));
      this.evaVoice = preferred || voices[0] || null;
    };
    findVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    } else if (!muted && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVoiceEnabled(enabled: boolean) {
    this.voiceEnabled = enabled;
  }

  public getVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public setVolume(sfx: number, voice: number) {
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.voiceVolume = Math.max(0, Math.min(1, voice));
  }

  // --- EVA VOICE ALERTS ---
  public speakEVA(text: string, priority: boolean = false) {
    if (this.isMuted || !this.voiceEnabled) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const now = Date.now();
    // Prevent overlapping voice spam unless high priority
    if (!priority && now - this.lastVoiceTime < 2400) return;
    this.lastVoiceTime = now;

    try {
      if (priority) {
        window.speechSynthesis.cancel();
      }
      const utter = new SpeechSynthesisUtterance(text);
      if (this.evaVoice) utter.voice = this.evaVoice;
      utter.rate = 1.05; // slightly swift military pace
      utter.pitch = 0.95; // slightly deeper command synth tone
      utter.volume = this.voiceVolume;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore synthesis errors
    }
  }

  // --- SOUND EFFECTS (SYNTHESIZED WEB AUDIO) ---

  /** C&C classic click / select button */
  public playClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.15 * this.sfxVolume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  /** Tactical unit selection radio chirp */
  public playUnitSelect() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.setValueAtTime(680, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.2 * this.sfxVolume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  /** Order acknowledged chirp */
  public playCommandAck() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(450, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.22 * this.sfxVolume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  /** Construction placement clank */
  public playBuildPlaced() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Metallic heavy clank
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Procedural military radio squawk (noise burst + dual tone chirp) */
  public playRadioSquawk() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const t = ctx.currentTime;

    // Filtered burst of radio static noise
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.Q.setValueAtTime(3.0, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12 * this.sfxVolume, t);
    noiseGain.gain.linearRampToValueAtTime(0, t + 0.04);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);

    // High-frequency dual chirp tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t + 0.01);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.06);

    gain.gain.setValueAtTime(0.08 * this.sfxVolume, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + 0.01);
    osc.stop(t + 0.07);
  }

  /** Mechanical engine roar, jet whine, or hydraulic servo sound */
  public playMechanicalResponse(unitType: UnitType) {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const t = ctx.currentTime;

    if (unitType === 'tank' || unitType === 'harvester') {
      // Low diesel rumble rev
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(unitType === 'tank' ? 75 : 55, t);
      osc.frequency.linearRampToValueAtTime(unitType === 'tank' ? 110 : 85, t + 0.12);
      osc.frequency.linearRampToValueAtTime(65, t + 0.25);

      gain.gain.setValueAtTime(0.18 * this.sfxVolume, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    } else if (unitType === 'aircraft') {
      // High-pitched jet turbine spool
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.2);

      gain.gain.setValueAtTime(0.14 * this.sfxVolume, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    } else if (unitType === 'walker') {
      // Heavy hydraulic servo hiss
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.linearRampToValueAtTime(260, t + 0.08);
      osc.frequency.linearRampToValueAtTime(90, t + 0.2);

      gain.gain.setValueAtTime(0.2 * this.sfxVolume, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /**
   * Tactical unit-specific voice lines & sound effects hook.
   * Plays a random unit-specific callout whenever a player selects a unit,
   * orders a move or attack, or when a newly trained unit is ready.
   */
  public playUnitResponse(unitType: UnitType, action: 'select' | 'move' | 'attack' | 'ready') {
    // 1. Immediate tactile sound feedback
    this.playRadioSquawk();
    this.playMechanicalResponse(unitType);

    // 2. Debounce voice lines to avoid overlapping chaos when clicking repeatedly
    const now = Date.now();
    const cooldown = action === 'ready' ? 1200 : 700;
    if (now - this.lastUnitVoiceTime < cooldown && action !== 'ready') return;
    this.lastUnitVoiceTime = now;

    // 3. Authentic randomized unit-specific voice responses
    const responses: Record<UnitType, Record<'select' | 'move' | 'attack' | 'ready', string[] | string>> = {
      rifleman: {
        select: ['¡Fusilero listo!', '¡A la orden, comandante!', '¡Esperando órdenes!', '¡Sí, comandante!'],
        move: ['¡En marcha!', '¡Avanzando a la posición!', '¡Entendido, moviéndonos!', '¡Copiado, en camino!'],
        attack: ['¡Al ataque!', '¡Fuego a discreción!', '¡Hostiles en la mira!', '¡Abran fuego!'],
        ready: '¡Pelotón de fusileros listo para el combate!',
      },
      missile: {
        select: ['¡Lanzacohetes listo!', '¡Misiles antiblindaje preparados!', '¡Dénos un blanco!', '¡Armas pesadas listas!'],
        move: ['¡Posición fijada, avanzando!', '¡Moviendo lanzadores!', '¡En marcha con misiles!', '¡Rumbo fijado!'],
        attack: ['¡Fuego de misiles!', '¡Destruyan ese blanco!', '¡Lanzando cohetes!', '¡Impacto asegurado!'],
        ready: '¡Escuadrón de lanzacohetes preparado!',
      },
      zone_trooper: {
        select: ['¡Zone Trooper en posición!', '¡Armadura electromagnética cargada!', '¡Cañón de riel listo!', '¡Tropas de choque preparadas!'],
        move: ['¡Propulsores activados!', '¡Desplegando zona de asalto!', '¡Avanzando a paso pesado!', '¡En ruta!'],
        attack: ['¡Apertura de fuego electromagnético!', '¡Pulvericen al enemigo!', '¡Fuego concentrado!'],
        ready: '¡Zone Trooper exoesqueleto desplegado!',
      },
      engineer: {
        select: ['¡Ingeniero de combate listo!', '¡Herramientas y nanites en línea!', '¿Qué estructura necesita reparar?', '¡Listo para el servicio!'],
        move: ['¡Ingeniero en camino!', '¡Herramientas listas, avanzando!', '¡Me dirijo a las coordenadas!', '¡En ruta!'],
        attack: ['¡Infiltrando terminal enemiga!', '¡Ocupando estructura!', '¡Accediendo a sistemas enemigos!'],
        ready: '¡Ingeniero de combate listo para el servicio!',
      },
      harvester: {
        select: ['Cosechador listo', 'Sistemas de carga de Tiberio operativos', 'A la espera de coordenadas de cosecha'],
        move: ['Rumbo fijado', 'Avanzando a velocidad de cosecha', 'Coordenadas de recolección recibidas'],
        attack: ['Defendiendo el blindaje', 'Maniobra de emergencia'],
        ready: 'Cosechador de Tiberio fabricado y listo para operar',
      },
      tank: {
        select: ['¡Tanque blindado preparado!', '¡Cañones cargados!', '¡Tripulación de combate lista!', '¡Blindado a la espera!'],
        move: ['¡Rodando al frente!', '¡Tanque en movimiento!', '¡Avanzando a posición!', '¡Coordenadas recibidas!'],
        attack: ['¡Abran fuego de cañón!', '¡Blanco fijado, disparen!', '¡Fuego directo al objetivo!'],
        ready: '¡Tanque de combate construido y listo para la acción!',
      },
      apc: {
        select: ['¡Transporte blindado listo!', '¡A toda máquina!', '¡Listo para transportar tropas!'],
        move: ['¡Acelerando a fondo!', '¡En camino a toda máquina!', '¡Transporte en ruta!'],
        attack: ['¡Fuego de ametralladoras!', '¡Cubriendo avance!'],
        ready: '¡Vehículo blindado de transporte desplegado!',
      },
      aircraft: {
        select: ['¡Aeronave lista para el despegue!', '¡Vector de vuelo despejado!', '¡Sistemas aéreos al 100%!'],
        move: ['¡Vector de vuelo fijado!', '¡Volando a coordenadas!', '¡Rumbo confirmado a toda velocidad!'],
        attack: ['¡Ataque aéreo en curso!', '¡Descargando misiles!', '¡Blanco a la vista, disparando!'],
        ready: '¡Aeronave de combate completada y lista!',
      },
      walker: {
        select: ['¡Caminante Titán listo!', '¡Artillería pesada en línea!', '¡Sistemas de asedio activados!'],
        move: ['¡Avanzando paso a paso!', '¡Moviendo artillería colosal!', '¡Posición fijada!'],
        attack: ['¡Fuego de artillería pesada!', '¡Andanada destructiva activada!'],
        ready: '¡Caminante Titán pesado ensamblado y listo!',
      },
    };

    const unitCategory = responses[unitType];
    if (!unitCategory) return;

    const phrases = unitCategory[action];
    let selectedPhrase = '';
    if (Array.isArray(phrases)) {
      selectedPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    } else if (typeof phrases === 'string') {
      selectedPhrase = phrases;
    }

    if (selectedPhrase) {
      this.speakEVA(selectedPhrase);
    }
  }

  // --- SPATIAL AUDIO CALCULATIONS & NODE CHAIN ---

  /**
   * Computes spatial parameters based on distance and direction from camera center:
   * - volumeFactor: Smooth acoustic falloff with distance
   * - pan: Left/right stereo panning (-1 to 1) based on horizontal offset
   * - filterFreq: High-frequency air absorption low-pass filter (muffled distant sounds)
   */
  public getSpatialParams(worldX?: number, worldY?: number): SpatialAudioParams {
    if (worldX === undefined || worldY === undefined) {
      return { audible: true, volumeFactor: 1.0, pan: 0, filterFreq: 12000, dist: 0 };
    }

    const dx = worldX - this.listenerX;
    const dy = worldY - this.listenerY;
    const dist = Math.hypot(dx, dy);

    if (dist > this.maxAudibleDist) {
      return { audible: false, volumeFactor: 0, pan: 0, filterFreq: 400, dist };
    }

    // Horizontal stereo panning based on viewport width
    const halfW = (this.viewportW || 1200) * 0.55;
    const pan = Math.max(-0.95, Math.min(0.95, dx / Math.max(150, halfW)));

    // Distance volume attenuation (realistic acoustic falloff)
    let volumeFactor = 1.0;
    if (dist > 180) {
      const norm = (dist - 180) / (this.maxAudibleDist - 180);
      volumeFactor = Math.max(0.04, Math.pow(1 - Math.min(1, norm), 1.55));
    }

    // Distance low-pass filter (air dampening of high frequencies)
    // Close: 11,500 Hz (crisp, present, full detail)
    // Distant: 450 Hz (muffled distant artillery/rumbles)
    const normDist = Math.min(1, dist / this.maxAudibleDist);
    const filterFreq = Math.max(450, 11500 * Math.pow(1 - normDist * 0.88, 2));

    return {
      audible: volumeFactor > 0.02,
      volumeFactor,
      pan,
      filterFreq,
      dist,
    };
  }

  public setCameraListener(x: number, y: number, vpW: number = 1200, vpH: number = 800) {
    this.listenerX = x;
    this.listenerY = y;
    this.viewportW = vpW;
    this.viewportH = vpH;
  }

  private canPlay(key: string, minIntervalMs: number): boolean {
    const now = Date.now();
    const last = this.soundThrottle[key] || 0;
    if (now - last < minIntervalMs) return false;
    this.soundThrottle[key] = now;
    return true;
  }

  private createSpatialChain(
    ctx: AudioContext,
    baseGain: number,
    spatial: SpatialAudioParams
  ): { inputNode: AudioNode; gainNode: GainNode } {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(spatial.filterFreq, ctx.currentTime);

    const gain = ctx.createGain();
    const finalVolume = baseGain * spatial.volumeFactor * this.sfxVolume;
    gain.gain.setValueAtTime(finalVolume, ctx.currentTime);

    filter.connect(gain);

    // Stereo Panning
    if (typeof ctx.createStereoPanner === 'function') {
      try {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, ctx.currentTime);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } catch {
        gain.connect(ctx.destination);
      }
    } else {
      gain.connect(ctx.destination);
    }

    return { inputNode: filter, gainNode: gain };
  }

  // --- SPATIAL COMBAT SOUND EFFECTS ---

  /** Spatial rifle squad gunfire burst with distance filtering and panning */
  public playSpatialRifleFire(worldX: number, worldY: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('rifle', 35)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    const chain = this.createSpatialChain(ctx, 0.22, spatial);

    for (let i = 0; i < 3; i++) {
      const delay = i * 0.055;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const roundGain = ctx.createGain();

      osc.type = 'sawtooth';
      const baseFreq = 340 + Math.random() * 80;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.045);

      roundGain.gain.setValueAtTime(1.0, t);
      roundGain.gain.linearRampToValueAtTime(0, t + 0.048);

      osc.connect(roundGain);
      roundGain.connect(chain.inputNode);

      osc.start(t);
      osc.stop(t + 0.048);
    }
  }

  /** Legacy / wrapper for playSpatialRifleFire */
  public playRifleFire(worldX?: number, worldY?: number) {
    this.playSpatialRifleFire(worldX ?? this.listenerX, worldY ?? this.listenerY);
  }

  /** Spatial heavy cannon shot (tank 120mm / walker artillery) with low-end punch & distant rumble */
  public playSpatialCannonFire(worldX: number, worldY: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('cannon', 45)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    const chain = this.createSpatialChain(ctx, 0.45, spatial);
    const t = ctx.currentTime;

    // Sub-bass heavy thump
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(175, t);
    subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.35);

    subGain.gain.setValueAtTime(1.0, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    subOsc.connect(subGain);
    subGain.connect(chain.inputNode);
    subOsc.start(t);
    subOsc.stop(t + 0.38);

    // Kinetic muzzle crack
    const crackOsc = ctx.createOscillator();
    const crackGain = ctx.createGain();
    crackOsc.type = 'sawtooth';
    crackOsc.frequency.setValueAtTime(450, t);
    crackOsc.frequency.exponentialRampToValueAtTime(80, t + 0.09);

    crackGain.gain.setValueAtTime(0.65, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    crackOsc.connect(crackGain);
    crackGain.connect(chain.inputNode);
    crackOsc.start(t);
    crackOsc.stop(t + 0.1);
  }

  /** Legacy / wrapper for playSpatialCannonFire */
  public playCannonFire(worldX?: number, worldY?: number) {
    this.playSpatialCannonFire(worldX ?? this.listenerX, worldY ?? this.listenerY);
  }

  /** Spatial rocket / missile launch whoosh */
  public playSpatialMissileLaunch(worldX: number, worldY: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('missile', 40)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    const chain = this.createSpatialChain(ctx, 0.3, spatial);
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);

    chain.gainNode.gain.setValueAtTime(0.3 * spatial.volumeFactor * this.sfxVolume, t);
    chain.gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(chain.inputNode);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  /** Legacy / wrapper for playSpatialMissileLaunch */
  public playMissileLaunch(worldX?: number, worldY?: number) {
    this.playSpatialMissileLaunch(worldX ?? this.listenerX, worldY ?? this.listenerY);
  }

  /** Spatial high-energy laser beam / Obelisk discharge */
  public playSpatialLaserFire(worldX: number, worldY: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('laser', 40)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    const chain = this.createSpatialChain(ctx, 0.35, spatial);
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1450, t);
    osc.frequency.linearRampToValueAtTime(280, t + 0.24);

    chain.gainNode.gain.setValueAtTime(0.35 * spatial.volumeFactor * this.sfxVolume, t);
    chain.gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

    osc.connect(chain.inputNode);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  /** Legacy / wrapper for playSpatialLaserFire */
  public playLaserFire(worldX?: number, worldY?: number) {
    this.playSpatialLaserFire(worldX ?? this.listenerX, worldY ?? this.listenerY);
  }

  /** Spatial explosion impact with acoustic depth and rumble */
  public playSpatialExplosion(worldX: number, worldY: number, size: 'small' | 'medium' | 'large' = 'medium') {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('explosion_' + size, 35)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    const baseGain = size === 'large' ? 0.6 : size === 'medium' ? 0.38 : 0.22;
    const chain = this.createSpatialChain(ctx, baseGain, spatial);
    const t = ctx.currentTime;

    const duration = size === 'large' ? 0.75 : size === 'medium' ? 0.42 : 0.26;
    const startFreq = size === 'large' ? 85 : size === 'medium' ? 120 : 160;
    const endFreq = size === 'large' ? 18 : size === 'medium' ? 24 : 35;

    // Sub detonation body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    // Rumble distortion component
    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumble.type = 'triangle';
    rumble.frequency.setValueAtTime(startFreq * 1.5, t);
    rumble.frequency.exponentialRampToValueAtTime(25, t + duration * 0.7);

    rumbleGain.gain.setValueAtTime(0.4, t);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.7);

    rumble.connect(rumbleGain);
    rumbleGain.connect(chain.inputNode);
    rumble.start(t);
    rumble.stop(t + duration * 0.7);

    osc.connect(chain.inputNode);
    osc.start(t);
    osc.stop(t + duration);
  }

  /** Legacy / wrapper for playSpatialExplosion */
  public playExplosion(largeOrSize: boolean | 'small' | 'medium' | 'large' = false, worldX?: number, worldY?: number) {
    const size = typeof largeOrSize === 'string' ? largeOrSize : (largeOrSize ? 'large' : 'medium');
    this.playSpatialExplosion(worldX ?? this.listenerX, worldY ?? this.listenerY, size);
  }

  /**
   * Procedural human vocal scream/casualty cry when infantry takes fatal combat damage.
   * Synthesizes resonant vowel formants with falling pitch and breath expulsion.
   */
  public playSpatialInfantryScream(worldX: number, worldY: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('infantry_scream', 85)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    // 4 distinct vocal formant & pitch profiles for variety
    const variant = Math.floor(Math.random() * 4);
    let startPitch = 480;
    let endPitch = 160;
    let formantFreq = 880;
    let duration = 0.42;

    switch (variant) {
      case 0: // Classic high battle cry: "Aaaargh!"
        startPitch = 490;
        endPitch = 175;
        formantFreq = 920;
        duration = 0.44;
        break;
      case 1: // Deep painful groan: "Uuuugh!"
        startPitch = 330;
        endPitch = 120;
        formantFreq = 620;
        duration = 0.38;
        break;
      case 2: // Sharp sudden casualty yell: "Aaagh!"
        startPitch = 530;
        endPitch = 210;
        formantFreq = 1080;
        duration = 0.32;
        break;
      case 3: // Breath knocked out / falling yell: "Ooouugh!"
        startPitch = 380;
        endPitch = 135;
        formantFreq = 740;
        duration = 0.4;
        break;
    }

    const chain = this.createSpatialChain(ctx, 0.42, spatial);
    const t = ctx.currentTime;

    // Vocal cord oscillator (sawtooth for rich harmonic formants)
    const vocalOsc = ctx.createOscillator();
    vocalOsc.type = 'sawtooth';
    vocalOsc.frequency.setValueAtTime(startPitch, t);
    // Sudden steep pitch drop as soldier is struck down
    vocalOsc.frequency.exponentialRampToValueAtTime(endPitch, t + duration * 0.9);

    // Human Vocal Tract Formant Filter (Bandpass resonance)
    const formantFilter = ctx.createBiquadFilter();
    formantFilter.type = 'bandpass';
    formantFilter.frequency.setValueAtTime(formantFreq, t);
    formantFilter.frequency.linearRampToValueAtTime(formantFreq * 0.7, t + duration);
    formantFilter.Q.setValueAtTime(3.8, t);

    // Vocal gain envelope: quick attack, sustained yell, exponential decay
    const vocalGain = ctx.createGain();
    vocalGain.gain.setValueAtTime(0, t);
    vocalGain.gain.linearRampToValueAtTime(1.0, t + 0.025);
    vocalGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    vocalOsc.connect(formantFilter);
    formantFilter.connect(vocalGain);
    vocalGain.connect(chain.inputNode);

    vocalOsc.start(t);
    vocalOsc.stop(t + duration);
  }

  /** Short combat impact grunt / shout when infantry takes heavy damage */
  public playSpatialInfantryGrunt(worldX: number, worldY: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('infantry_grunt', 140)) return;

    const spatial = this.getSpatialParams(worldX, worldY);
    if (!spatial.audible) return;

    const chain = this.createSpatialChain(ctx, 0.28, spatial);
    const t = ctx.currentTime;
    const duration = 0.16;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(290, t);
    osc.frequency.exponentialRampToValueAtTime(130, t + duration);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(650, t);
    formant.Q.setValueAtTime(3.2, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(chain.inputNode);

    osc.start(t);
    osc.stop(t + duration);
  }

  /** Tiberium crystal harvesting sound */
  public playHarvestCrystals() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450 + Math.random() * 80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12 * this.sfxVolume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  }

  /** Tiberium deposit / cash earned chime */
  public playCreditsDeposited() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    
    // Bright 3-tone cash register chime
    [660, 880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.08);
      gain.gain.setValueAtTime(0.22 * this.sfxVolume, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.25);
    });
  }

  /** Superweapon Ion Cannon or Nuke charge */
  public playSuperweaponCharge() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 1.8);

    gain.gain.setValueAtTime(0.1 * this.sfxVolume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.45 * this.sfxVolume, ctx.currentTime + 1.7);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 2.0);
  }

  /** Tactical alarm beep */
  public playAlert() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3 * this.sfxVolume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  /** Unit Veterancy Promotion chime */
  public playPromotion() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5 arpeggio
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0, t + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.28 * this.sfxVolume, t + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.35);
    });
  }

  /** Ion Storm thunder crackle and low rumble */
  public playIonStormThunder() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Low frequency rumble
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 1.2);

    gain.gain.setValueAtTime(0.4 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 1.2);
  }

  /** Ambient combat rain shower whoosh and droplet patter sound */
  public playRainStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const dur = 2.0;

    // Filtered pink/white noise simulating sudden rain precipitation
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02; // Pink noise filter
      lastOut = data[i];
      data[i] *= 3.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.Q.setValueAtTime(0.8, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.22 * this.sfxVolume, t + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(t);
    noise.stop(t + dur);
  }

  /** Engineer welding torch and nanite repair tool sound */
  public playRepairTool(worldX?: number, worldY?: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.canPlay('repair_tool', 180)) return;

    const spatial = this.getSpatialParams(worldX ?? this.listenerX, worldY ?? this.listenerY);
    if (!spatial.audible) return;

    const chain = this.createSpatialChain(ctx, 0.25, spatial);
    const t = ctx.currentTime;

    // High frequency sizzle and electric repair hum
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620 + Math.random() * 120, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(chain.inputNode);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Enemy building captured by engineer sound */
  public playBuildingCaptured() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Triumphant cyber-override chords
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);

      gain.gain.setValueAtTime(0, t + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.32 * this.sfxVolume, t + idx * 0.06 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.48);
    });
  }

  /** Building relocation start (hydraulic lifts & transport engine) */
  public playBuildingRelocationStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.6);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35 * this.sfxVolume, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.7);
  }

  /** Building relocation complete (pneumatic clamp and anchor) */
  public playBuildingRelocationComplete() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.4);

    gain.gain.setValueAtTime(0.4 * this.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.45);
  }
}

/**
 * Gestor de Sonido de Combate Táctico
 * Maneja efectos espaciales de armas, explosiones y gritos de infantería
 * orientados y atenuados en base a la distancia al centro de la cámara para inmersión 3D/estéreo.
 */
export class CombatSoundManager {
  constructor(private engine: SoundEngine) {}

  public setCamera(x: number, y: number, w: number, h: number) {
    this.engine.setCameraListener(x, y, w, h);
  }

  public playGunfire(type: 'rifle' | 'cannon' | 'rocket' | 'laser', worldX: number, worldY: number) {
    switch (type) {
      case 'cannon':
        this.engine.playSpatialCannonFire(worldX, worldY);
        break;
      case 'rocket':
        this.engine.playSpatialMissileLaunch(worldX, worldY);
        break;
      case 'laser':
        this.engine.playSpatialLaserFire(worldX, worldY);
        break;
      case 'rifle':
      default:
        this.engine.playSpatialRifleFire(worldX, worldY);
        break;
    }
  }

  public playRifleFire(worldX: number, worldY: number) {
    this.engine.playSpatialRifleFire(worldX, worldY);
  }

  public playCannonFire(worldX: number, worldY: number) {
    this.engine.playSpatialCannonFire(worldX, worldY);
  }

  public playMissileLaunch(worldX: number, worldY: number) {
    this.engine.playSpatialMissileLaunch(worldX, worldY);
  }

  public playLaserFire(worldX: number, worldY: number) {
    this.engine.playSpatialLaserFire(worldX, worldY);
  }

  public playExplosion(worldX: number, worldY: number, size: 'small' | 'medium' | 'large' = 'medium') {
    this.engine.playSpatialExplosion(worldX, worldY, size);
  }

  public playInfantryScream(worldX: number, worldY: number) {
    this.engine.playSpatialInfantryScream(worldX, worldY);
  }

  public playInfantryGrunt(worldX: number, worldY: number) {
    this.engine.playSpatialInfantryGrunt(worldX, worldY);
  }
}

export const sound = new SoundEngine();
export const combatSound = sound.combat;

