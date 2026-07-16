'use client';

import { useState, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Check,
  Pencil,
  ChevronDown,
  Receipt,
  Sparkles,
  Plus,
  Trash2,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import {
  useInvoiceCharges,
  type InvoiceCharge,
  type ChargeReconciliation,
} from '@/hooks/use-invoice-detail';
import {
  CHARGE_SOURCE_LABELS,
} from '@/types/invoice-charge';
import type { BBox as ItemBBox } from '@/types/invoice-item';

interface InvoiceChargesSectionProps {
  invoiceId: string;
  userRole: string | null | undefined;
  onHoverCharge?: (bbox: ItemBBox | null, pageNumber: number | null) => void;
}

export function InvoiceChargesSection({
  invoiceId,
  userRole,
  onHoverCharge,
}: InvoiceChargesSectionProps) {
  const {
    charges, isLoading, error,
    parseCharges, confirmCharges, updateCharge, deleteCharge, addCharge,
  } = useInvoiceCharges(invoiceId);
  const [isOpen, setIsOpen] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingCharge, setEditingCharge] = useState<InvoiceCharge | null>(null);
  const [editForm, setEditForm] = useState({ amount: '', reason: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ amount: '', reason: '' });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<ChargeReconciliation | null>(null);

  const canEdit = ['owner', 'admin', 'accountant'].includes(userRole ?? '');
  const canConfirm = ['owner', 'admin'].includes(userRole ?? '');
  const canDelete = ['owner', 'admin'].includes(userRole ?? '');
  const allConfirmed = charges.length > 0 && charges.every(c => c.confirmed);

  const handleParse = useCallback(async () => {
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseCharges();
      if (result.reconciliation) setReconciliation(result.reconciliation);
      if (result.charges.length === 0) {
        setParseError(result.message ?? 'No Rozliczenie charges detected.');
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse charges');
    } finally {
      setParsing(false);
    }
  }, [parseCharges]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      await confirmCharges();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to confirm charges');
    } finally {
      setConfirming(false);
    }
  }, [confirmCharges]);

  const handleStartEdit = useCallback((charge: InvoiceCharge) => {
    setEditingCharge(charge);
    setEditForm({
      amount: charge.amount.toString(),
      reason: charge.reason,
    });
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingCharge) return;
    setSaving(true);
    setEditError(null);
    try {
      const amt = parseFloat(editForm.amount);
      if (isNaN(amt) || amt < 0) throw new Error('Amount must be a non-negative number');
      if (!editForm.reason.trim()) throw new Error('Reason is required');
      await updateCharge(editingCharge.id, {
        amount: amt,
        reason: editForm.reason.trim(),
      });
      setEditingCharge(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editingCharge, editForm, updateCharge]);

  const handleDelete = useCallback(async (chargeId: string) => {
    setDeletingId(chargeId);
    try {
      await deleteCharge(chargeId);
    } catch {
      // SWR will show stale data; error surfaces via mutate
    } finally {
      setDeletingId(null);
    }
  }, [deleteCharge]);

  const handleAdd = useCallback(async () => {
    setAdding(true);
    setAddError(null);
    try {
      const amt = parseFloat(addForm.amount);
      if (isNaN(amt) || amt < 0) throw new Error('Amount must be a non-negative number');
      if (!addForm.reason.trim()) throw new Error('Reason is required');
      await addCharge({ amount: amt, reason: addForm.reason.trim() });
      setAddDialogOpen(false);
      setAddForm({ amount: '', reason: '' });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add charge');
    } finally {
      setAdding(false);
    }
  }, [addForm, addCharge]);

  const handleHover = useCallback(
    (charge: InvoiceCharge | null) => {
      if (onHoverCharge && charge?.bbox) {
        onHoverCharge(charge.bbox as ItemBBox, charge.page_number);
      } else if (onHoverCharge) {
        onHoverCharge(null, null);
      }
    },
    [onHoverCharge]
  );

  function fmtNum(n: number | null | undefined): string {
    if (n == null) return '—';
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Compute reconciliation from current charges if not set from parse
  const sumOfCharges = charges.reduce((s, c) => s + c.amount, 0);
  const hasReconciliationWarning = reconciliation?.mismatch === true;
  const mappedCount = charges.filter(c => c.bbox != null).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-slate-200 dark:border-slate-700">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Receipt className="w-4 h-4 text-slate-500" aria-hidden="true" />
                Rozliczenie — Obciążenia ({charges.length})
                {mappedCount > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1 text-blue-600 border-blue-200">
                    <MapPin className="w-3 h-3 mr-0.5" />
                    {mappedCount} mapped
                  </Badge>
                )}
                {allConfirmed && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    Potwierdzono
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {canEdit && charges.length === 0 && !parsing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); handleParse(); }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Parsuj obciążenia
                  </Button>
                )}
                {canEdit && charges.length > 0 && !parsing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-slate-500"
                    onClick={(e) => { e.stopPropagation(); handleParse(); }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-parse
                  </Button>
                )}
                {canConfirm && charges.length > 0 && !allConfirmed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                    disabled={confirming}
                  >
                    <Check className="w-3 h-3" />
                    {confirming ? 'Potwierdzanie...' : 'Potwierdź wszystkie'}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); setAddDialogOpen(true); }}
                  >
                    <Plus className="w-3 h-3" />
                    Dodaj
                  </Button>
                )}
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-slate-400 transition-transform',
                    isOpen && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Reconciliation warning */}
            {hasReconciliationWarning && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-xs text-amber-800 dark:text-amber-400"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Reconciliation Mismatch</p>
                    <p className="mt-1">
                      Sum of charges ({fmtNum(reconciliation!.sumOfCharges)}) does not
                      match SumaObciazen ({fmtNum(reconciliation!.chargesTotal)}).
                      Difference: {fmtNum(reconciliation!.difference)}.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {parseError && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-400">
                {parseError}
              </div>
            )}

            {parsing && (
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-500" aria-live="polite">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Parsing Rozliczenie charges...
              </div>
            )}

            {isLoading ? (
              <div className="text-sm text-slate-400 py-4 text-center">Loading charges...</div>
            ) : charges.length === 0 ? (
              <div className="text-sm text-slate-400 py-4 text-center">
                No charges parsed yet.{' '}
                {canEdit && 'Click "Parsuj obciążenia" to extract them from the KSeF XML.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Confidence</TableHead>
                      <TableHead className="text-xs">Mapping</TableHead>
                      {canEdit && <TableHead className="w-16" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map((charge) => (
                      <TableRow
                        key={charge.id}
                        className={cn(
                          'transition-colors',
                          charge.bbox && 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        )}
                        onMouseEnter={() => handleHover(charge)}
                        onMouseLeave={() => handleHover(null)}
                        onFocus={() => handleHover(charge)}
                        onBlur={() => handleHover(null)}
                        tabIndex={charge.bbox ? 0 : undefined}
                      >
                        <TableCell className="text-xs text-right tabular-nums font-medium">
                          {fmtNum(charge.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                          {charge.reason}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] py-0 px-1">
                            {CHARGE_SOURCE_LABELS[charge.source as keyof typeof CHARGE_SOURCE_LABELS] ?? charge.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {charge.confidence != null
                            ? `${(charge.confidence * 100).toFixed(0)}%`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {charge.bbox ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 text-blue-600 border-blue-200">
                              <MapPin className="w-3 h-3 mr-0.5" />
                              p.{charge.page_number}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">Unmapped</span>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleStartEdit(charge)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              {canDelete && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-red-500 hover:text-red-600"
                                  onClick={() => handleDelete(charge.id)}
                                  disabled={deletingId === charge.id}
                                >
                                  {deletingId === charge.id
                                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                                    : <Trash2 className="w-3 h-3" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Charges Total + Amount Due summary */}
            {(charges.length > 0 || reconciliation) && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-6" aria-live="polite">
                <div className="flex items-center justify-between sm:gap-4">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Suma Obciążeń
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtNum(reconciliation?.chargesTotal ?? sumOfCharges)}
                  </span>
                </div>
                {reconciliation?.amountDue != null && (
                  <div className="flex items-center justify-between sm:gap-4">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Do Zapłaty
                    </span>
                    <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtNum(reconciliation.amountDue)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-2 text-xs text-rose-500">
                Error loading charges: {error.message}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingCharge} onOpenChange={(open) => !open && setEditingCharge(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Charge</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="edit-charge-amount">Amount</Label>
              <Input
                id="edit-charge-amount"
                type="number"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-charge-reason">Reason</Label>
              <Input
                id="edit-charge-reason"
                value={editForm.reason}
                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          {editError && (
            <div className="text-xs text-rose-500 mb-2">{editError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCharge(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Charge</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="add-charge-amount">Amount</Label>
              <Input
                id="add-charge-amount"
                type="number"
                step="0.01"
                value={addForm.amount}
                onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="add-charge-reason">Reason</Label>
              <Input
                id="add-charge-reason"
                value={addForm.reason}
                onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          {addError && (
            <div className="text-xs text-rose-500 mb-2">{addError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
