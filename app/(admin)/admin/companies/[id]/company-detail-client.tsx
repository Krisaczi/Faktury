'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, User, Loader as Loader2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CompanyFormModal } from '@/components/admin/company-form';
import type {
  BuyerCompanyContact,
  BuyerCompanyFormValues,
  ContactFormValues,
} from '@/app/(admin)/admin/companies/types';
import { upsertBuyerCompanyContact, deleteBuyerCompanyContact } from '@/app/(admin)/admin/companies/actions';

// ─── Contact form ─────────────────────────────────────────────────────────────

const ContactSchema = z.object({
  name:  z.string().min(1, 'Imię i nazwisko jest wymagane'),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().optional(),
  role:  z.string().optional(),
});

function ContactForm({
  onSave, onCancel, defaultValues,
}: {
  onSave:        (values: ContactFormValues) => void;
  onCancel:      () => void;
  defaultValues?: Partial<ContactFormValues>;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<ContactFormValues>({
    resolver: zodResolver(ContactSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Imię i nazwisko *</Label>
          <Input {...register('name')} placeholder="Jan Kowalski" className={cn('h-8 text-sm', errors.name && 'border-red-400')} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Stanowisko</Label>
          <Input {...register('role')} placeholder="Prezes" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">E-mail</Label>
          <Input {...register('email')} type="email" placeholder="jan@firma.pl" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Telefon</Label>
          <Input {...register('phone')} placeholder="+48 000 000 000" className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Zapisz</Button>
      </div>
    </form>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buyerCompanyId:  string;
  initialContacts: BuyerCompanyContact[];
  isOwner:         boolean;
  showEditButton?: boolean;
  editDefaults?:   Partial<BuyerCompanyFormValues>;
}

export function CompanyDetailClient({
  buyerCompanyId, initialContacts, isOwner, showEditButton, editDefaults,
}: Props) {
  const router = useRouter();
  const [contacts, setContacts]       = useState(initialContacts);
  const [adding, setAdding]           = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [showEdit, setShowEdit]       = useState(false);
  const [isPending, startTransition]  = useTransition();

  function handleSaveContact(values: ContactFormValues, contactId?: string) {
    startTransition(async () => {
      const res = await upsertBuyerCompanyContact(buyerCompanyId, values, contactId);
      if (res.ok) {
        if (contactId) {
          setContacts((prev) => prev.map((c) => (c.id === contactId ? res.data : c)));
        } else {
          setContacts((prev) => [...prev, res.data]);
        }
        setAdding(false);
        setEditingId(null);
      }
    });
  }

  function handleDeleteContact(contactId: string) {
    if (!confirm('Usunąć ten kontakt?')) return;
    startTransition(async () => {
      await deleteBuyerCompanyContact(buyerCompanyId, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    });
  }

  // If used as edit-button-only mode (inside actions sidebar)
  if (showEditButton) {
    return (
      <>
        <button
          onClick={() => setShowEdit(true)}
          className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Edytuj kontrahenta
        </button>
        {showEdit && (
          <CompanyFormModal
            mode="edit"
            companyId={buyerCompanyId}
            defaultValues={editDefaults}
            onSuccess={() => { setShowEdit(false); router.refresh(); }}
            onClose={() => setShowEdit(false)}
          />
        )}
      </>
    );
  }

  // Contact list view
  return (
    <div className="px-5 py-4 space-y-3">
      {contacts.length === 0 && !adding && (
        <p className="text-sm text-slate-400 text-center py-4">Brak kontaktów</p>
      )}

      {contacts.map((contact) => (
        <div key={contact.id}>
          {editingId === contact.id ? (
            <ContactForm
              defaultValues={contact}
              onSave={(v) => handleSaveContact(v, contact.id)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex items-start justify-between gap-3 py-2 group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{contact.name}</p>
                  {contact.role && <p className="text-xs text-slate-400">{contact.role}</p>}
                  {contact.email && <p className="text-xs text-slate-500 mt-0.5">{contact.email}</p>}
                  {contact.phone && <p className="text-xs text-slate-500">{contact.phone}</p>}
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingId(contact.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    aria-label="Edytuj kontakt"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(contact.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Usuń kontakt"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {adding && (
        <ContactForm
          onSave={(v) => handleSaveContact(v)}
          onCancel={() => setAdding(false)}
        />
      )}

      {isOwner && !adding && !editingId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={isPending}
          className="gap-2 text-xs h-8"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Dodaj kontakt
        </Button>
      )}
    </div>
  );
}
