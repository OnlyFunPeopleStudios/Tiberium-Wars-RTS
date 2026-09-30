import React, { useState } from 'react';
import { Check, Copy, Globe, Sparkles, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface EmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl: string;
}

export const EmbedModal: React.FC<EmbedModalProps> = ({ isOpen, onClose, appUrl }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'iframe' | 'wordpress' | 'features'>('iframe');

  if (!isOpen) return null;

  // The actual URL or preview URL
  const targetUrl = appUrl || window.location.href;

  const iframeSnippet = `<!-- Código de Integración para OnlyFunPeople Studios -->
<div style="position: relative; width: 100%; height: 85vh; min-height: 650px; background: #0a0a0a; border-radius: 8px; overflow: hidden; border: 1px solid #333;">
  <iframe
    src="${targetUrl}"
    title="Tiberium Wars RTS - Command & Conquer Clone"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allow="fullscreen; autoplay"
    loading="lazy"
  ></iframe>
</div>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(iframeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-text">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="font-scifi text-base font-bold text-neutral-100">
                Integración Gratuita en OnlyFunPeople Studios
              </h2>
              <p className="text-xs text-emerald-400 font-medium">
                100% Funcional · Sin Costo de Servidores · Acceso Ilimitado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-neutral-300">
          {/* Answer Banner */}
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-lg flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-emerald-300 font-bold text-sm">
                ¿Se puede utilizar y desplegar gratis en tu página? ¡SÍ, TOTALMENTE!
              </h3>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                Este clon de Command & Conquer ejecuta todo el motor de simulación, la IA táctica, los gráficos en Canvas y el sintetizador de audio EVA directamente en el navegador del usuario (cliente). No requiere servidores dedicados pagos ni bases de datos de cobro por uso.
              </p>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-neutral-800 gap-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('iframe')}
              className={`pb-2 transition-colors border-b-2 ${
                activeTab === 'iframe'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Código Embed (HTML / Iframe)
            </button>
            <button
              onClick={() => setActiveTab('wordpress')}
              className={`pb-2 transition-colors border-b-2 ${
                activeTab === 'wordpress'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Guía para WordPress / CMS
            </button>
            <button
              onClick={() => setActiveTab('features')}
              className={`pb-2 transition-colors border-b-2 ${
                activeTab === 'features'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Características del Clon
            </button>
          </div>

          {activeTab === 'iframe' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400">
                Copia y pega este bloque en cualquier sección de tu página web (en formato HTML o bloque de código):
              </p>

              <div className="relative">
                <pre className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto">
                  {iframeSnippet}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors border border-neutral-700 shadow"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Código</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-xs text-neutral-400 flex items-center justify-between">
                <span>URL directa del juego:</span>
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-1"
                >
                  <span>Abrir en pestaña nueva</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {activeTab === 'wordpress' && (
            <div className="space-y-3 text-xs leading-relaxed text-neutral-300">
              <h4 className="font-semibold text-neutral-100">Cómo agregarlo en tu sitio WordPress:</h4>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Ve al panel de administración de <strong>OnlyFunPeople Studios</strong>.</li>
                <li>Crea una nueva página llamada por ejemplo <em>/juegos/tiberium-wars</em> o edita la portada.</li>
                <li>Añade un bloque de <strong>HTML Personalizado</strong> (o módulo HTML en Elementor / Divi).</li>
                <li>Pega el código iframe de la pestaña anterior y guarda los cambios.</li>
                <li>¡Listo! Tus visitantes podrán jugar gratis a pantalla completa inmediatamente.</li>
              </ol>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-neutral-950/60 rounded border border-neutral-800 space-y-1">
                <span className="font-bold text-amber-400">Facciones Clásicas</span>
                <p className="text-neutral-400">GDI (Blindaje pesado, Cañón de Iones) y Nod (Velocidad, Láseres, Misil Nuclear).</p>
              </div>
              <div className="p-3 bg-neutral-950/60 rounded border border-neutral-800 space-y-1">
                <span className="font-bold text-emerald-400">Economía de Tiberio</span>
                <p className="text-neutral-400">Cosechadores autónomos recolectando cristales verdes y azules para la refinería.</p>
              </div>
              <div className="p-3 bg-neutral-950/60 rounded border border-neutral-800 space-y-1">
                <span className="font-bold text-sky-400">IA Táctica Autónoma</span>
                <p className="text-neutral-400">El oponente virtual construye su base, defiende y coordina ataques en 3 dificultades.</p>
              </div>
              <div className="p-3 bg-neutral-950/60 rounded border border-neutral-800 space-y-1">
                <span className="font-bold text-purple-400">Audio EVA Sintetizado</span>
                <p className="text-neutral-400">Alertas de voz militar ("Construcción completada", "Unidad lista", explosiones).</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
          >
            Entendido, volver a la batalla
          </button>
        </div>
      </div>
    </div>
  );
};
