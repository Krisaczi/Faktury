'use client';

import { useState, useTransition } from 'react';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Send, RefreshCw, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Clock, Loader as Loader2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  sendToKsef,
  checkKsefStatus,
  type KsefActionResult,
  type KsefStatusResult,
} from '@/app/(admin)/admin/invoices/actions';
import type { IssuedInvoiceStatus, KsefStatus } from '@/types/issued-invoice';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KsefPanelProps {
  invoiceId:         string;
  invoiceStatus:     IssuedInvoiceStatus;
  ksefStatus:        KsefStatus | null;
  ksefReferenceNo:   string | null;
  ksefSentAt:        string | null;
  ksefAcceptedAt:    string | null;
  ksefErrorMessage:  string | null;
  /** Whether the current user may send/recheck — false for viewers. */
  canSendToKsef?:    boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy HH:mm', { locale: pl }); } catch { return d; }
}

const KSEF_STATUS_CONFIG: Record<KsefStatus, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  pending:    { label: 'Oczekuje',       color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',       icon: Clock },
  processing: { label: 'Przetwarzanie',  color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',      icon: Loader2 },
  accepted:   { label: 'Zaakceptowana',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800', icon: CheckCircle2 },
  rejected:   { label: 'Odrzucona',      color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',                  icon: AlertCircle },
};

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      title="Skopiuj"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── XML preview ──────────────────────────────────────────────────────────────

function XmlPreview({ xml, label }: { xml: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span>{label}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <pre className="p-4 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 overflow-x-auto max-h-64 leading-relaxed font-mono whitespace-pre-wrap break-all">
          {xml}
        </pre>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KsefPanel({
  invoiceId,
  invoiceStatus,
  ksefStatus:        initialKsefStatus,
  ksefReferenceNo:   initialRefNo,
  ksefSentAt:        initialSentAt,
  ksefAcceptedAt:    initialAcceptedAt,
  ksefErrorMessage:  initialError,
  canSendToKsef:     allowSend = true,
}: KsefPanelProps) {
  // Local state mirrors the server state and updates optimistically after actions
  const [ksefStatus,       setKsefStatus]       = useState(initialKsefStatus);
  const [referenceNo,      setReferenceNo]       = useState(initialRefNo);
  const [sentAt,           setSentAt]            = useState(initialSentAt);
  const [acceptedAt,       setAcceptedAt]        = useState(initialAcceptedAt);
  const [errorMessage,     setErrorMessage]      = useState(initialError);
  const [localInvStatus,   setLocalInvStatus]    = useState(invoiceStatus);
  const [rawXml,           setRawXml]            = useState<string | null>(null);
  const [signedXml,        setSignedXml]         = useState<string | null>(null);
  const [isMock,           setIsMock]            = useState<boolean | null>(null);
  const [actionError,      setActionError]       = useState<string | null>(null);
  const [actionSuccess,    setActionSuccess]     = useState<string | null>(null);

  const [isSending,        startSend]            = useTransition();
  const [isChecking,       startCheck]           = useTransition();

  // ─ Send handler ─────────────────────────────────────────────────────────────

  function handleSend() {
    setActionError(null);
    setActionSuccess(null);
    startSend(async () => {
      const result: KsefActionResult = await sendToKsef(invoiceId);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setRawXml(result.rawXml);
      setSignedXml(result.signedXml);
      setIsMock(result.isMock);
      if (result.referenceNo) {
        setReferenceNo(result.referenceNo);
        setKsefStatus('pending');
        setLocalInvStatus('sent_to_ksef');
        setSentAt(new Date().toISOString());
        setActionSuccess(
          result.isMock
            ? 'XML wygenerowany (tryb testowy — brak poświadczeń KSeF).'
            : `Wysłano do KSeF. Numer ref.: ${result.referenceNo}`,
        );
      } else {
        // No credentials — payload generated but not sent
        setActionSuccess(
          result.isMock
            ? 'XML wygenerowany i podpisany (mock). Skonfiguruj poświadczenia KSeF, aby wysłać.'
            : 'XML podpisany. Skonfiguruj poświadczenia KSeF, aby wysłać.',
        );
      }
    });
  }

  // ─ Status-check handler ─────────────────────────────────────────────────────

  function handleCheck() {
    setActionError(null);
    setActionSuccess(null);
    startCheck(async () => {
      const result: KsefStatusResult = await checkKsefStatus(invoiceId);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setKsefStatus(result.status as KsefStatus);
      if (result.acceptedAt) setAcceptedAt(result.acceptedAt);
      if (result.status === 'accepted') setLocalInvStatus('accepted');
      if (result.status === 'rejected') setLocalInvStatus('rejected');
      setActionSuccess(`Status zaktualizowany: ${KSEF_STATUS_CONFIG[result.status as KsefStatus]?.label ?? result.status}`);
    });
  }

  // ─ Derived state ────────────────────────────────────────────────────────────

  const canSend = allowSend && (localInvStatus === 'issued' || localInvStatus === 'rejected');
  const canCheck = allowSend && !!referenceNo && (ksefStatus === 'pending' || ksefStatus === 'processing');

  const ksefCfg = ksefStatus ? KSEF_STATUS_CONFIG[ksefStatus] : null;

  return (
    <div className="space-y-5">

      {/* Status row */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
        {ksefCfg ? (
          <Badge variant="outline" className={cn('gap-1.5 px-3 py-1.5 text-sm font-semibold', ksefCfg.color)}>
            <ksefCfg.icon className={cn('w-4 h-4', ksefStatus === 'processing' && 'animate-spin')} />
            {ksefCfg.label}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm text-slate-400 border-slate-200 dark:border-slate-700">
            <Clock className="w-4 h-4" />
            Nie wysłano do KSeF
          </Badge>
        )}

        <div className="flex gap-2 ml-auto">
          {!allowSend && (
            <span className="text-xs text-slate-400 dark:text-slate-500 italic">Tryb tylko do odczytu</span>
          )}
          {canSend && (
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isSending || isChecking}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              {isSending ? 'Wysyłanie…' : 'Wyślij do KSeF'}
            </Button>
          )}
          {canCheck && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCheck}
              disabled={isSending || isChecking}
              className="gap-1.5"
            >
              {isChecking
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              {isChecking ? 'Sprawdzanie…' : 'Sprawdź status'}
            </Button>
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionSuccess && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{actionSuccess}</p>
        </div>
      )}
      {actionError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300 break-words">{actionError}</p>
        </div>
      )}

      {/* Details grid */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Numer referencyjny KSeF</dt>
          <dd className="text-sm text-slate-800 dark:text-slate-200 flex items-center">
            {referenceNo
              ? <><span className="font-mono text-xs break-all">{referenceNo}</span><CopyButton value={referenceNo} /></>
              : <span className="text-slate-400">—</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Data wysłania</dt>
          <dd className="text-sm text-slate-800 dark:text-slate-200">{fmtDateTime(sentAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Data akceptacji</dt>
          <dd className="text-sm text-slate-800 dark:text-slate-200">{fmtDateTime(acceptedAt)}</dd>
        </div>
        {isMock !== null && (
          <div>
            <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Tryb podpisu</dt>
            <dd className="text-sm">
              {isMock
                ? <span className="text-amber-600 dark:text-amber-400 font-medium">Mock (brak certyfikatu)</span>
                : <span className="text-emerald-600 dark:text-emerald-400 font-medium">Kwalifikowany</span>}
            </dd>
          </div>
        )}
      </dl>

      {/* Persisted KSeF error */}
      {errorMessage && !actionError && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Ostatni błąd KSeF</p>
            <p className="text-xs text-red-600 dark:text-red-400 font-mono leading-relaxed break-all">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* XML previews (appear after Send) */}
      {rawXml && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Podgląd XML</p>
          <XmlPreview xml={rawXml}    label="FA(2) XML (bez podpisu)" />
          <XmlPreview xml={signedXml!} label="Podpisany XML (z elementem Signature)" />
        </div>
      )}
    </div>
  );
}
