'use client';

import { useState, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

function getClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type FileStatus = 'pending' | 'uploading' | 'parsing' | 'done' | 'error';

export interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  jobId?: string;
  storagePath?: string;
}

export interface ParseSummary {
  invoicesCreated: number;
  flagsCreated: number;
  errorCount: number;
  errors: { message: string; context?: string }[];
}

export interface JobStatusResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result: ParseSummary & { error?: string; total?: number };
}

// ─── Job status polling hook ──────────────────────────────────────────────────
export function useJobStatus(jobId: string | null) {
  return useSWR<JobStatusResult>(
    jobId ? `/api/job-status?jobId=${jobId}` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch job status');
      return res.json();
    },
    {
      refreshInterval: (data) =>
        data?.status === 'completed' || data?.status === 'failed' ? 0 : 2000,
      revalidateOnFocus: false,
    }
  );
}

// ─── Upload session hook ──────────────────────────────────────────────────────
async function createUploadSession(fileCount: number, source = 'manual') {
  const res = await fetch('/api/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileCount, source }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to create upload session');
  }
  return res.json() as Promise<{
    uploadSessionId: string;
    storagePath: string;
    companyId: string;
  }>;
}

// ─── Main upload hook ─────────────────────────────────────────────────────────
export function useUpload() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [globalJobId, setGlobalJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ksefLoading, setKsefLoading] = useState(false);
  const [ksefError, setKsefError] = useState<string | null>(null);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const addFiles = useCallback((newFiles: File[]) => {
    const allowed = ['csv', 'pdf', 'zip', 'xml'];
    const valid = newFiles.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      return allowed.includes(ext) && f.size <= 50 * 1024 * 1024;
    });
    setFiles((prev) => [
      ...prev,
      ...valid.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        status: 'pending' as FileStatus,
        progress: 0,
      })),
    ]);
  }, []);

  const removeFile = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    abortControllers.current.forEach((c) => c.abort());
    abortControllers.current.clear();
    setFiles([]);
    setSessionId(null);
    setGlobalJobId(null);
  }, []);

  const uploadAll = useCallback(async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    setIsUploading(true);

    try {
      const { uploadSessionId, storagePath, companyId } = await createUploadSession(pending.length);
      setSessionId(uploadSessionId);

      const supabase = getClient();
      const lastJobIds: string[] = [];

      for (const uf of pending) {
        const controller = new AbortController();
        abortControllers.current.set(uf.id, controller);

        setFiles((prev) =>
          prev.map((f) => (f.id === uf.id ? { ...f, status: 'uploading', progress: 0 } : f))
        );

        try {
          const filePath = `${storagePath}/${uf.file.name}`;

          // Use XMLHttpRequest for progress tracking
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                setFiles((prev) =>
                  prev.map((f) => (f.id === uf.id ? { ...f, progress: pct } : f))
                );
              }
            });

            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Upload failed: ${xhr.statusText}`));
              }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Cancelled')));

            controller.signal.addEventListener('abort', () => xhr.abort());

            xhr.open(
              'POST',
              `${supabaseUrl}/storage/v1/object/invoices/${filePath}`
            );
            xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
            xhr.setRequestHeader('x-upsert', 'true');
            xhr.send(uf.file);
          });

          // Get signed URL for parsing
          const { data: urlData } = await supabase.storage
            .from('invoices')
            .createSignedUrl(filePath, 3600);

          if (!urlData?.signedUrl) throw new Error('Could not get signed URL');

          setFiles((prev) =>
            prev.map((f) =>
              f.id === uf.id ? { ...f, status: 'parsing', progress: 100, storagePath: filePath } : f
            )
          );

          // Trigger parsing
          const parseRes = await fetch('/api/parse-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileUrl: urlData.signedUrl,
              uploadSessionId,
              companyId,
              fileType: uf.file.name.split('.').pop()?.toLowerCase() ?? '',
            }),
          });

          if (!parseRes.ok) {
            const err = await parseRes.json();
            throw new Error(err.error ?? 'Parsing failed');
          }

          const { jobId } = await parseRes.json();
          lastJobIds.push(jobId);

          setFiles((prev) =>
            prev.map((f) => (f.id === uf.id ? { ...f, jobId, status: 'done' } : f))
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          if (message !== 'Cancelled') {
            setFiles((prev) =>
              prev.map((f) => (f.id === uf.id ? { ...f, status: 'error', error: message } : f))
            );
          }
        }

        abortControllers.current.delete(uf.id);
      }

      if (lastJobIds.length > 0) {
        setGlobalJobId(lastJobIds[lastJobIds.length - 1]);
      }
    } finally {
      setIsUploading(false);
    }
  }, [files]);

  const fetchFromKSeF = useCallback(async (since?: string) => {
    setKsefLoading(true);
    setKsefError(null);
    try {
      const supabase = getClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: userRecord } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!userRecord?.company_id) throw new Error('No company found for your account');

      const res = await fetch('/api/ksef/fetch-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: userRecord.company_id, since }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'KSeF fetch failed');
      setGlobalJobId(data.jobId);
      setSessionId(data.uploadSessionId);
    } catch (err) {
      setKsefError(err instanceof Error ? err.message : 'KSeF fetch failed');
    } finally {
      setKsefLoading(false);
    }
  }, []);

  return {
    files,
    sessionId,
    globalJobId,
    isUploading,
    ksefLoading,
    ksefError,
    addFiles,
    removeFile,
    clearAll,
    uploadAll,
    fetchFromKSeF,
  };
}
