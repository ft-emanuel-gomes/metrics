"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

interface ShareModalProps {
  squadSlug: string;
  onClose: () => void;
}

export default function ShareModal({ squadSlug, onClose }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Construir URL absoluta para o board
    const url = `${window.location.origin}/retrospectiva/${squadSlug}`;
    setShareUrl(url);
  }, [squadSlug]);

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl theme-modal p-6 shadow-2xl">
        <h3 className="text-sm font-bold text-[color:var(--ds-color-content-title)] mb-4">Compartilhar Board</h3>

        <p className="text-[10px] text-[color:var(--ds-color-content-caption)] mb-4">
          Compartilhe o link ou QR Code com os participantes.
          O acesso requer login via Jira.
        </p>

        {/* QR Code */}
        <div className="flex justify-center mb-4">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={shareUrl} size={160} />
          </div>
        </div>

        {/* Link */}
        <div className="flex items-center gap-2 mb-4">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 rounded-md border border-[color:var(--ds-color-container-divider-card)] bg-[var(--ds-color-input-surface)] px-3 py-2 text-[11px] text-[color:var(--ds-color-content-body)] outline-none"
          />
          <button
            onClick={handleCopy}
            className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${
              copied
                ? "btn-primary"
                : "btn-primary"
            }`}
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>

        {/* Close */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-[var(--ds-color-input-surface)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)] transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
