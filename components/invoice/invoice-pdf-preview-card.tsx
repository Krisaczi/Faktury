'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Eye,
  Maximize2,
  Download,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  FileText,
  Package,
  ListChecks,
  AlertTriangle,
} from 'lucide-react';
import { InvoiceLineItemsSection } from '@/components/invoice/invoice-line-items-section';
import { InvoiceChargesSection } from '@/components/invoice/invoice-charges-section';
import type { BBox } from '@/types/invoice-item';

type TabId = 'pdf' | 'items' | 'charges';

interface InvoicePdfPreviewCardProps {
  invoiceId: string;
  invoiceNumber?: string | null;
  hasRawFile?: boolean;
  userRole: string | null | undefined;
  onHoverItem?: (bbox: BBox | null, pageNumber: number | null) => void;
  onHoverCharge?: (bbox: BBox | null, pageNumber: number | null) => void;
  onDownload?: () => void;
  downloading?: boolean;
}

export function InvoicePdfPreviewCard({
  invoiceId,
  invoiceNumber,
  hasRawFile,
  userRole,
  onHoverItem,
  onHoverCharge,
  onDownload,
  downloading,
}: InvoicePdfPreviewCardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pdf');
  const [zoom, setZoom] = useState(100);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 10, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 10, 50));
  }, []);

  const handleFitWidth = useCallback(() => {
    setZoom(100);
  }, []);

  const handleOpenNewTab = useCallback(() => {
    window.open(`/api/invoices/${invoiceId}/pdf?print=1`, '_blank', 'noopener');
  }, [invoiceId]);

  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeLoading(false);
    setIframeError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setIframeLoading(true);
    setIframeError(false);
    if (iframeRef.current) {
      iframeRef.current.src = `${pdfUrl}?t=${Date.now()}`;
    }
  }, [pdfUrl]);

  const tabs: { id: TabId; label: string; icon: typeof Eye }[] = [
    { id: 'pdf', label: 'Podgląd PDF', icon: Eye },
    { id: 'items', label: 'Pozycje faktury', icon: Package },
    { id: 'charges', label: 'Rozliczenie', icon: ListChecks },
  ];

  return (
    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
        <div className="flex" role="tablist" aria-label="Invoice detail tabs">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                  active
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <CardContent className="p-0">
        {/* PDF Preview tab */}
        {activeTab === 'pdf' && (
          <div className="flex flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 w-12 text-center select-none">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs gap-1.5"
                  onClick={handleFitWidth}
                  aria-label="Fit width"
                >
                  Dopasuj
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1.5"
                  onClick={handleOpenNewTab}
                  aria-label="Open in new tab"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Nowa karta
                </Button>
                {hasRawFile && onDownload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5"
                    onClick={onDownload}
                    disabled={downloading}
                    aria-label="Download file"
                  >
                    {downloading
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    Pobierz
                  </Button>
                )}
              </div>
            </div>

            {/* Iframe container */}
            <div className="relative bg-slate-100 dark:bg-slate-950" style={{ height: '70vh', minHeight: '500px' }}>
              {iframeLoading && !iframeError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin" aria-hidden="true" />
                  <p className="text-sm">Ładowanie podglądu faktury…</p>
                </div>
              )}

              {iframeError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <AlertTriangle className="w-10 h-10 text-amber-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Nie udało się załadować podglądu
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Spróbuj ponownie lub otwórz w nowej karcie.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleRetry}>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Odśwież
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleOpenNewTab}>
                      <Maximize2 className="w-3.5 h-3.5" />
                      Nowa karta
                    </Button>
                  </div>
                </div>
              )}

              {!iframeError && (
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  className="w-full h-full border-0 bg-white dark:bg-slate-900 transition-transform origin-top"
                  style={{ transform: `scale(${zoom / 100})` }}
                  title={`Invoice ${invoiceNumber ?? invoiceId} PDF preview`}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              )}
            </div>
          </div>
        )}

        {/* Invoice items tab */}
        {activeTab === 'items' && (
          <div className="p-4">
            <InvoiceLineItemsSection
              invoiceId={invoiceId}
              userRole={userRole}
              onHoverItem={onHoverItem}
            />
          </div>
        )}

        {/* Charges tab */}
        {activeTab === 'charges' && (
          <div className="p-4">
            <InvoiceChargesSection
              invoiceId={invoiceId}
              userRole={userRole}
              onHoverCharge={onHoverCharge}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
