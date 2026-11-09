'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Image as ImageIcon, Loader as Loader2, Trash2, Upload, Info, CircleCheck as CheckCircle } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCompanySettings } from '@/hooks/use-settings';

const LOGO_BUCKET = 'company-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function CompanyLogoCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, updateCompany } = useCompanySettings();
  const company = data?.company;
  const logoPath = company?.logo_path ?? null;
  const supabase = getSupabaseBrowserClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!logoPath) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(logoPath, 3600)
      .then(({ data: signed, error: signErr }) => {
        if (cancelled) return;
        setPreviewUrl(signErr || !signed ? null : signed.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [logoPath, supabase]);

  async function handleFile(file: File) {
    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Dozwolone formaty logo to PNG, JPG lub WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo może mieć maksymalnie 2 MB.');
      return;
    }
    if (!company) return;

    setBusy(true);
    try {
      const path = `${company.id}/logo.${EXTENSIONS[file.type]}`;
      const { error: uploadErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw new Error('Nie udało się przesłać logo.');

      if (logoPath && logoPath !== path) {
        await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
      }
      await updateCompany({ logo_path: path });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać logo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!logoPath) return;
    setError('');
    setBusy(true);
    try {
      const { error: removeErr } = await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
      if (removeErr) throw new Error('Nie udało się usunąć logo.');
      await updateCompany({ logo_path: null });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć logo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Logo firmy</CardTitle>
        </div>
        <CardDescription>Logo pojawi się na wszystkich wygenerowanych fakturach PDF.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {saved && (
          <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">
              Logo zostało zapisane.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-4">
          <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Logo firmy" className="max-h-20 max-w-[9rem] object-contain" />
            ) : (
              <span className="text-xs text-slate-400">Brak logo</span>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-2">
              <input
                ref={inputRef}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                onClick={() => inputRef.current?.click()}
                disabled={busy || isLoading || !company}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {logoPath ? 'Zmień logo' : 'Prześlij logo'}
              </Button>
              {logoPath && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleRemove}
                  disabled={busy}
                >
                  <Trash2 className="w-4 h-4" />
                  Usuń logo
                </Button>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">PNG, JPG lub WebP, maks. 2 MB. Najlepiej wygląda logo o proporcjach zbliżonych do poziomych.</p>
        {!isAdmin && (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Tylko właściciel może zmienić logo firmy.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
