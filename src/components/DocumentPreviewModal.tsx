import React, { useEffect, useState } from 'react';
import { X, Download, Share2, FileText, ShieldCheck, Loader2 } from 'lucide-react';
import { formatBytes } from '../lib/trackingAndCalendar';

export interface PreviewTarget {
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  categoryLabel: string;
  loadBlob: () => Promise<Blob>;
}

interface DocumentPreviewModalProps {
  target: PreviewTarget | null;
  onClose: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  target,
  onClose,
}) => {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setBlob(null);
      setObjectUrl(null);
      setTextContent(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setTextContent(null);
      try {
        const fetchedBlob = await target.loadBlob();
        if (cancelled) return;
        setBlob(fetchedBlob);
        createdUrl = URL.createObjectURL(fetchedBlob);
        setObjectUrl(createdUrl);

        if (
          target.mimeType.startsWith('text/') ||
          target.mimeType.includes('json') ||
          target.name.toLowerCase().endsWith('.txt') ||
          target.name.toLowerCase().endsWith('.csv')
        ) {
          const text = await fetchedBlob.text();
          if (!cancelled) setTextContent(text);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Doküman yüklenirken hata oluştu.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [target]);

  if (!target) return null;

  const handleDownload = () => {
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = target.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!blob || !navigator.share) return;
    try {
      const file = new File([blob], target.name, { type: target.mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: target.name,
          text: `${target.categoryLabel} — ${target.name}`,
          files: [file],
        });
      }
    } catch {
      // User cancelled share sheet
    }
  };

  const isPdf =
    target.mimeType === 'application/pdf' || target.name.toLowerCase().endsWith('.pdf');
  const isImage = target.mimeType.startsWith('image/');

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Doküman Önizleme"
    >
      <div className="bg-white w-full sm:max-w-4xl h-[92vh] sm:h-[85vh] rounded-t-2xl sm:rounded-xl border border-[#DCE3EC] flex flex-col overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-[#DCE3EC] rounded-full" />
        </div>

        <div className="px-4 sm:px-6 py-3.5 border-b border-[#DCE3EC] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-sm sm:text-base font-bold text-[#0B2239] truncate">
              {target.name}
            </h3>
            <p className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{target.categoryLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatBytes(target.sizeBytes)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[#007A53] font-mono text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                SHA-256: {target.sha256.slice(0, 12)}…
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {typeof navigator.share === 'function' && blob && (
              <button
                type="button"
                onClick={handleShare}
                className="min-h-[44px] min-w-[44px] sm:px-3 inline-flex items-center justify-center gap-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                title="Paylaş"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Paylaş</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={!objectUrl || loading}
              className="min-h-[44px] px-3.5 inline-flex items-center justify-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>İndir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[#4E5D6C] hover:text-[#0B2239] hover:bg-[#F3F6FA] rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#F3F6FA] overflow-auto p-3 sm:p-6 flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-[#4E5D6C]">
              <Loader2 className="w-6 h-6 animate-spin text-[#0066B3]" />
              <span className="text-sm font-medium">Güvenli kasadan doküman çözülüyor…</span>
            </div>
          ) : error ? (
            <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md text-center">
              <p className="text-sm font-semibold text-red-700">Doküman açılamadı</p>
              <p className="text-xs text-[#4E5D6C] mt-1">{error}</p>
            </div>
          ) : textContent !== null ? (
            <pre className="w-full h-full bg-white border border-[#DCE3EC] rounded-lg p-4 sm:p-6 text-xs sm:text-sm font-mono text-[#0B2239] whitespace-pre-wrap overflow-auto">
              {textContent}
            </pre>
          ) : isImage && objectUrl ? (
            <img
              src={objectUrl}
              alt={target.name}
              className="max-w-full max-h-full object-contain rounded-lg border border-[#DCE3EC] bg-white"
            />
          ) : isPdf && objectUrl ? (
            <iframe
              src={objectUrl}
              title={target.name}
              className="w-full h-full bg-white rounded-lg border border-[#DCE3EC]"
            />
          ) : (
            <div className="bg-white border border-[#DCE3EC] rounded-xl p-8 max-w-md text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-lg bg-[#F3F6FA] flex items-center justify-center text-[#0B2239]">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-display text-sm font-bold text-[#0B2239]">
                  Bu dosya formatı tarayıcı içi önizlemeyi desteklemiyor
                </h4>
                <p className="text-xs text-[#4E5D6C] mt-1">
                  Dosyayı cihazınıza indirerek Word, Excel veya ilgili uygulama ile açabilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Cihaza İndir ({formatBytes(target.sizeBytes)})</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
