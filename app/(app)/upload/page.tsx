'use client';

import { useCallback, useState } from 'react';
import {
  Upload,
  X,
  FileText,
  FileArchive,
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle2,
  RefreshCw,
  CloudDownload,
  ChevronDown,
  ChevronUp,
  Info,
  FileCode2,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useUpload, useJobStatus, type UploadFile } from '@/hooks/use-upload';
import { InlineLoader } from '@/components/ui/skeleton-loaders';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { DemoGuard } from '@/components/layout/demo-banner';

const ACCEPTED        = '.csv,.pdf,.zip,.xml';
const ACCEPTED_LABELS = ['CSV', 'PDF', 'ZIP', 'XML'];
const MAX_MB          = 50;

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xml') return FileCode2;
  if (ext === 'zip') return FileArchive;
  return FileText;
}

function fileStatusBadge(status: UploadFile['status']) {
  switch (status) {
    case 'pending':   return <Badge variant="outline" className="text-slate-500 border-slate-300 dark:border-slate-600">Queued</Badge>;
    case 'uploading': return <Badge variant="outline" className="text-blue-600 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">Uploading</Badge>;
    case 'parsing':   return <Badge variant="outline" className="text-amber-600 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">Parsing</Badge>;
    case 'done':      return <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">Complete</Badge>;
    case 'error':     return <Badge variant="outline" className="text-red-600 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20">Error</Badge>;
  }
}

function ProgressBar({ value, status }: { value: number; status: UploadFile['status'] }) {
  const color =
    status === 'error'   ? 'bg-red-500' :
    status === 'done'    ? 'bg-emerald-500' :
    status === 'parsing' ? 'bg-amber-400' :
    'bg-blue-500';

  return (
    <div
      className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300', color)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ParseSummaryCard({ jobId }: { jobId: string }) {
  const { data: job } = useJobStatus(jobId);
  const [open, setOpen] = useState(true);

  if (!job) return null;

  const r          = job.result;
  const isComplete = job.status === 'completed' || job.status === 'failed';
  const hasErrors  = (r.errorCount ?? 0) > 0;

  return (
    <Card className="border-slate-200 dark:border-slate-800 animate-fade-up">
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {job.status === 'failed' ? (
              <ShieldAlert className="w-4 h-4 text-red-500" />
            ) : isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <InlineLoader size="sm" className="text-blue-500" />
            )}
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">
              {isComplete ? 'Parse complete' : 'Parsing…'}
            </CardTitle>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
        {!isComplete && (
          <div
            className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={job.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Parsing progress"
          >
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
      </CardHeader>

      {open && isComplete && (
        <CardContent className="pt-0 animate-fade-in">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Invoices created', value: r.invoicesCreated ?? 0, color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Risk flags',       value: r.flagsCreated ?? 0,   color: 'text-amber-600 dark:text-amber-400' },
              {
                label: 'Errors',
                value: r.errorCount ?? 0,
                color: (r.errorCount ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <p className={cn('text-2xl font-bold tabular', color)}>{value}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          {hasErrors && r.errors && r.errors.length > 0 && (
            <div className="space-y-1.5 mt-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Parsing errors:</p>
              <div className="max-h-32 overflow-y-auto space-y-1 rounded-lg border border-red-100 dark:border-red-900/30">
                {r.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-900/20 px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-red-700 dark:text-red-300 leading-snug">
                      {e.context && <span className="font-mono text-red-500 mr-1">[{e.context}]</span>}
                      {e.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function UploadPage() {
  const {
    files, globalJobId, isUploading, ksefLoading, ksefError,
    addFiles, removeFile, clearAll, uploadAll, fetchFromKSeF,
  } = useUpload();

  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  }, [addFiles]);

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const doneCount    = files.filter((f) => f.status === 'done').length;
  const errorCount   = files.filter((f) => f.status === 'error').length;
  const totalProgress =
    files.length > 0
      ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
      : 0;

  const allJobIds    = Array.from(new Set(files.filter((f) => f.jobId).map((f) => f.jobId!)));
  const summaryJobId = globalJobId ?? allJobIds[allJobIds.length - 1] ?? null;

  return (
    <Stack gap="6" className="max-w-3xl mx-auto">
      <PageHeader
        title="Upload Invoices"
        description={`Upload invoice files or fetch directly from KSeF. Supported: ${ACCEPTED_LABELS.join(', ')}.`}
      />

      {/* Drop Zone */}
      <DemoGuard message="File uploads are disabled in Demo Mode. Sign up to upload your own invoices.">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer group w-full',
            dragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 scale-[1.005]'
              : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
          )}
        >
          <label className="flex flex-col items-center justify-center py-14 px-6 cursor-pointer" htmlFor="file-upload">
            <input
              id="file-upload"
              type="file"
              multiple
              accept={ACCEPTED}
              className="sr-only"
              onChange={handleFileInput}
            />
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors',
              dragging
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20'
            )}>
              <Upload className={cn('w-6 h-6 transition-colors', dragging ? 'text-blue-600' : 'text-slate-500 group-hover:text-blue-500')} />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {dragging ? 'Drop files here' : 'Drag & drop files, or click to browse'}
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              {ACCEPTED_LABELS.join(', ')} · max {MAX_MB} MB per file
            </p>
          </label>
        </div>
      </DemoGuard>

      {/* KSeF Action */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <CloudDownload className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Fetch from KSeF</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Automatically retrieve XML invoices from the Krajowy System e-Faktur using your stored credentials.
              </p>
              {ksefError && (
                <div role="alert" className="flex items-center gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{ksefError}</span>
                </div>
              )}
            </div>
            <DemoGuard message="KSeF fetch is disabled in Demo Mode.">
              <Button
                variant="outline"
                size="sm"
                disabled={ksefLoading || isUploading}
                onClick={() => fetchFromKSeF()}
                className="shrink-0 border-slate-200 dark:border-slate-700"
              >
                {ksefLoading
                  ? <><InlineLoader size="xs" className="mr-1.5 text-slate-500" />Fetching…</>
                  : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Fetch now</>}
              </Button>
            </DemoGuard>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 animate-fade-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">
                  Files ({files.length})
                </CardTitle>
                <CardDescription className="mt-0.5">
                  {doneCount} done · {errorCount} error{errorCount !== 1 ? 's' : ''} · {pendingCount} queued
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 h-8 px-2"
              >
                <X className="w-4 h-4 mr-1" />
                Clear all
              </Button>
            </div>

            {isUploading && (
              <div className="mt-2 space-y-1" aria-live="polite" aria-label="Upload progress">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Overall progress</span>
                  <span className="tabular font-medium">{totalProgress}%</span>
                </div>
                <ProgressBar value={totalProgress} status="uploading" />
              </div>
            )}
          </CardHeader>

          <Separator />

          <CardContent className="pt-3 space-y-3" aria-label="File list" aria-busy={isUploading}>
            {files.map((uf) => {
              const Icon = fileIcon(uf.file.name);
              return (
                <div key={uf.id} className="space-y-1.5 group">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      uf.status === 'done'    ? 'bg-emerald-50 dark:bg-emerald-900/20' :
                      uf.status === 'error'   ? 'bg-red-50 dark:bg-red-900/20' :
                      uf.status === 'parsing' ? 'bg-amber-50 dark:bg-amber-900/20' :
                      'bg-slate-100 dark:bg-slate-800'
                    )}>
                      <Icon className={cn(
                        'w-4 h-4',
                        uf.status === 'done'    ? 'text-emerald-500' :
                        uf.status === 'error'   ? 'text-red-400' :
                        uf.status === 'parsing' ? 'text-amber-500' :
                        'text-slate-500'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {uf.file.name}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {fileStatusBadge(uf.status)}
                          {uf.status === 'done' && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                          {uf.status === 'error' && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                          {(uf.status === 'uploading' || uf.status === 'parsing') && (
                            <InlineLoader size="sm" className="text-blue-500" />
                          )}
                          {uf.status === 'pending' && (
                            <button
                              onClick={() => removeFile(uf.id)}
                              className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                              aria-label={`Remove ${uf.file.name}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 tabular">
                        {(uf.file.size / 1024 / 1024).toFixed(2)} MB
                        {uf.error && (
                          <span className="text-red-500 ml-2">{uf.error}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {(uf.status === 'uploading' || uf.status === 'parsing') && (
                    <ProgressBar value={uf.progress} status={uf.status} />
                  )}
                </div>
              );
            })}
          </CardContent>

          {pendingCount > 0 && (
            <>
              <Separator />
              <CardContent className="pt-3 pb-4">
                <DemoGuard message="File uploads are disabled in Demo Mode." className="w-full">
                  <Button
                    onClick={uploadAll}
                    disabled={isUploading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
                  >
                    {isUploading ? (
                      <><InlineLoader size="sm" className="mr-2 text-white" />Uploading…</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" />Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''}</>
                    )}
                  </Button>
                </DemoGuard>
              </CardContent>
            </>
          )}
        </Card>
      )}

      {/* Parse Summary */}
      {summaryJobId && <ParseSummaryCard jobId={summaryJobId} />}

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: FileCode2,
            title: 'XML / KSeF',
            body:  'FA (Faktura) and UBL 2.1 formats are detected automatically. Multiple invoices per file are supported.',
          },
          {
            icon: Info,
            title: 'Other formats',
            body:  'CSV, PDF, and ZIP files are stored and catalogued. Manual field review may be needed.',
          },
          {
            icon: ShieldAlert,
            title: 'Risk analysis',
            body:  'Each parsed invoice is automatically checked for missing NIP, high value, and suspicious bank accounts.',
          },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 hover:shadow-sm transition-shadow duration-150"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
              <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </Stack>
  );
}
