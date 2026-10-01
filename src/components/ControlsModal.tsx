import React from 'react';
import { X, Keyboard, MousePointer, ShieldAlert } from 'lucide-react';

interface ControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsModal: React.FC<ControlsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-xl rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-amber-400" />
            <h2 className="font-scifi text-base font-bold text-neutral-100">
              Controles de Mando Táctico (RTS)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-neutral-300 overflow-y-auto max-h-[75vh]">
          {/* Mouse Controls */}
          <div>
            <h3 className="font-semibold text-neutral-100 mb-2 flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5 text-emerald-400" />
              Acciones con el Ratón o el Dedo
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Click Izquierdo + Arrastre</span>
                <span className="text-neutral-400">Seleccionar múltiples unidades en caja.</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Click Derecho (Suelo)</span>
                <span className="text-neutral-400">Mover tropas en formación táctica.</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Click Derecho (Enemigo)</span>
                <span className="text-neutral-400">Atacar unidad o edificio hostil.</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Click en Minimapa</span>
                <span className="text-neutral-400">Desplazar cámara inmediatamente a ese sector.</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Toque Largo</span>
                <span className="text-neutral-400">En celular: equivale al click derecho (mover o atacar).</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Dos Dedos Arrastrando</span>
                <span className="text-neutral-400">En celular: mueve la cámara por el mapa.</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                <span className="font-bold text-neutral-200 block mb-0.5">Cola de Producción</span>
                <span className="text-neutral-400">Click izquierdo (+1 a cola) · Click derecho (-1 de cola).</span>
              </div>
            </div>
          </div>

          {/* Keyboard Hotkeys */}
          <div>
            <h3 className="font-semibold text-neutral-100 mb-2 flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-amber-400" />
              Atajos de Teclado
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Pestañas de la barra lateral</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">[ / ]</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Pausar / Reanudar partida</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">Espacio</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Desplazar cámara</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">W, A, S, D</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Crear grupo de control</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">Ctrl + 1..9</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Seleccionar grupo guardado</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">1..9</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Centrar cámara en ConYard</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">H</span>
              </div>
              <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex justify-between items-center">
                <span className="text-neutral-300">Descargar cosechador en refinería</span>
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-amber-400">U</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              <strong>Consejo Estratégico:</strong> Mantén siempre tus generadores de energía en positivo. Si tu consumo supera la producción, tu radar táctico se apagará y tus fábricas tardarán el doble de tiempo en construir unidades.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
