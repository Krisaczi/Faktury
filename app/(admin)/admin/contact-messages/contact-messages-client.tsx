'use client';

import { useState, useMemo, useTransition } from 'react';
import { Mail, MailOpen, Archive, Trash2, Search, Paperclip, Download, Loader as Loader2, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  markContactMessageRead,
  updateContactMessageStatus,
  deleteContactMessage,
  type ContactMessage,
} from '@/app/(admin)/admin/contact-messages/actions';

interface Props {
  initialMessages: ContactMessage[];
  totalCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  new:      'Nowa',
  read:     'Przeczytana',
  archived: 'Zarchiwizowana',
  deleted:  'Usunięta',
};

const STATUS_COLORS: Record<string, string> = {
  new:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  read:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  deleted:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ContactMessagesClient({ initialMessages, totalCount }: Props) {
  const [messages] = useState(initialMessages);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'read' | 'archived'>('all');
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          m.sender_name.toLowerCase().includes(q) ||
          m.sender_email.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [messages, filter, search]);

  const newCount = messages.filter((m) => m.status === 'new').length;

  function handleOpen(msg: ContactMessage) {
    setSelected(msg);
    if (msg.status === 'new') {
      startTransition(async () => {
        const res = await markContactMessageRead(msg.id);
        if (res.ok) {
          setSelected({ ...msg, status: 'read' });
        }
      });
    }
  }

  async function handleArchive(msg: ContactMessage) {
    startTransition(async () => {
      const res = await updateContactMessageStatus(msg.id, 'archived');
      if (res.ok) {
        toast.success('Wiadomość zarchiwizowana');
        setSelected(null);
        // Force refresh
        window.location.reload();
      } else {
        toast.error(res.error ?? 'Błąd');
      }
    });
  }

  async function handleDelete(msg: ContactMessage) {
    if (!confirm('Czy na pewno trwale usunąć tę wiadomość? Tej operacji nie można cofnąć.')) return;
    startTransition(async () => {
      const res = await deleteContactMessage(msg.id);
      if (res.ok) {
        toast.success('Wiadomość usunięta');
        setSelected(null);
        window.location.reload();
      } else {
        toast.error(res.error ?? 'Błąd');
      }
    });
  }

  const filterTabs: { key: typeof filter; label: string; count?: number }[] = [
    { key: 'all',      label: 'Wszystkie' },
    { key: 'new',      label: 'Nowe',      count: newCount },
    { key: 'read',     label: 'Przeczytane' },
    { key: 'archived', label: 'Zarchiwizowane' },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po nadawcy, e-mailu lub temacie..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-white dark:bg-slate-800">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  filter === tab.key ? 'bg-white/20' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Message list */}
      {filtered.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Brak wiadomości</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Wiadomości z formularza kontaktowego pojawią się tutaj.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((msg) => (
            <Card
              key={msg.id}
              className={`p-4 cursor-pointer hover:shadow-md transition-all border-l-4 ${
                msg.status === 'new'
                  ? 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10'
                  : 'border-l-transparent'
              }`}
              onClick={() => handleOpen(msg)}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.status === 'new'
                    ? 'bg-blue-100 dark:bg-blue-900/40'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}>
                  {msg.status === 'new' ? (
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <MailOpen className="w-4 h-4 text-slate-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      {msg.sender_name}
                    </span>
                    <Badge className={STATUS_COLORS[msg.status] ?? ''} variant="secondary">
                      {STATUS_LABELS[msg.status] ?? msg.status}
                    </Badge>
                    {msg.attachment_url && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Paperclip className="w-3 h-3" />
                        Załącznik
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                    {msg.subject}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {msg.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    <span>{msg.sender_email}</span>
                    <span>•</span>
                    <span>{formatDate(msg.created_at)}</span>
                    {msg.delivered ? (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" /> Dostarczono
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertCircle className="w-3 h-3" /> Nie dostarczono
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
                  {selected.subject}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {formatDate(selected.created_at)}
                </DialogDescription>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Od</p>
                  <p className="text-slate-900 dark:text-white font-medium">{selected.sender_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">E-mail</p>
                  <a
                    href={`mailto:${selected.sender_email}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {selected.sender_email}
                  </a>
                </div>
                {selected.sender_phone && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold">Telefon</p>
                    <p className="text-slate-900 dark:text-white font-medium">{selected.sender_phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Status</p>
                  <Badge className={STATUS_COLORS[selected.status] ?? ''} variant="secondary">
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Wiadomość</p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {selected.message}
                </div>
              </div>

              {selected.attachment_url && selected.attachment_meta && (
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Załącznik</p>
                  <a
                    href={`/api/contact/attachment?id=${encodeURIComponent(selected.id)}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                    {selected.attachment_meta.filename}
                    <span className="text-xs text-slate-400">
                      ({formatFileSize(selected.attachment_meta.size)})
                    </span>
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              )}

              {selected.delivery_error && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Błąd dostarczenia e-mail
                  </p>
                  <p className="mt-1 text-xs">{selected.delivery_error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchive(selected)}
                  disabled={pending}
                >
                  <Archive className="w-4 h-4" />
                  Archiwizuj
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(selected)}
                  disabled={pending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Usuń trwale
                </Button>
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    window.location.href = `mailto:${selected.sender_email}?subject=Re: ${encodeURIComponent(selected.subject)}`;
                  }}
                >
                  <Mail className="w-4 h-4" />
                  Odpowiedz
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
