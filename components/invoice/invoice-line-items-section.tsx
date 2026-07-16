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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Check,
  Pencil,
  ChevronDown,
  Package,
  Sparkles,
} from 'lucide-react';
import {
  useInvoiceItems,
  type InvoiceLineItem,
} from '@/hooks/use-invoice-detail';
import {
  SOURCE_LABELS,
  CONFIDENCE_LABELS,
  CONFIDENCE_COLORS,
  type BBox,
} from '@/types/invoice-item';

interface InvoiceLineItemsSectionProps {
  invoiceId: string;
  userRole: string | null | undefined;
  onHoverItem?: (bbox: BBox | null, pageNumber: number | null) => void;
}

export function InvoiceLineItemsSection({
  invoiceId,
  userRole,
  onHoverItem,
}: InvoiceLineItemsSectionProps) {
  const { items, isLoading, error, parseItems, confirmItems, updateItem, mutate } = useInvoiceItems(invoiceId);
  const [isOpen, setIsOpen] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<InvoiceLineItem | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    quantity: '',
    unit: '',
    unit_price: '',
    net_amount: '',
    vat_rate: '23',
    vat_amount: '',
    gross_amount: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = ['owner', 'admin', 'accountant'].includes(userRole ?? '');
  const canConfirm = ['owner', 'admin'].includes(userRole ?? '');
  const allConfirmed = items.length > 0 && items.every(i => i.confirmed);

  const handleParse = useCallback(async () => {
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseItems();
      if (result.items.length === 0) {
        setParseError(result.message ?? 'No line items detected. You can add them manually.');
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse items');
    } finally {
      setParsing(false);
    }
  }, [parseItems]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      await confirmItems();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to confirm items');
    } finally {
      setConfirming(false);
    }
  }, [confirmItems]);

  const handleStartEdit = useCallback((item: InvoiceLineItem) => {
    setEditingItem(item);
    setEditForm({
      description: item.description ?? '',
      quantity: item.quantity?.toString() ?? '',
      unit: item.unit ?? '',
      unit_price: item.unit_price?.toString() ?? '',
      net_amount: item.net_amount?.toString() ?? '',
      vat_rate: item.vat_rate ?? '23',
      vat_amount: item.vat_amount?.toString() ?? '',
      gross_amount: item.gross_amount?.toString() ?? '',
    });
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingItem) return;
    setSaving(true);
    setEditError(null);
    try {
      const qty = parseFloat(editForm.quantity);
      const unitPrice = parseFloat(editForm.unit_price);
      const net = parseFloat(editForm.net_amount);
      const vatAmt = parseFloat(editForm.vat_amount);
      const gross = parseFloat(editForm.gross_amount);

      if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be a positive number');
      if (isNaN(net) || net < 0) throw new Error('Net amount must be a non-negative number');
      if (isNaN(gross) || gross < 0) throw new Error('Gross amount must be a non-negative number');

      await updateItem(editingItem.id, {
        position: editingItem.position,
        description: editForm.description.trim(),
        quantity: qty,
        unit: editForm.unit.trim() || 'szt.',
        unit_price: isNaN(unitPrice) ? 0 : unitPrice,
        net_amount: net,
        vat_rate: editForm.vat_rate,
        vat_amount: isNaN(vatAmt) ? 0 : vatAmt,
        gross_amount: gross,
      });
      setEditingItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editingItem, editForm, updateItem]);

  const handleHover = useCallback(
    (item: InvoiceLineItem | null) => {
      if (onHoverItem) {
        onHoverItem(item?.bbox ?? null, item?.page_number ?? null);
      }
    },
    [onHoverItem]
  );

  function fmtNum(n: number | null | undefined): string {
    if (n == null) return '—';
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-slate-200 dark:border-slate-700">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Package className="w-4 h-4 text-slate-500" aria-hidden="true" />
                Pozycje faktury ({items.length})
                {allConfirmed && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    Potwierdzono
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {canEdit && items.length === 0 && !parsing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); handleParse(); }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Parsuj pozycje
                  </Button>
                )}
                {canEdit && items.length > 0 && !parsing && (
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
                {canConfirm && items.length > 0 && !allConfirmed && (
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
            {parseError && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-400">
                {parseError}
              </div>
            )}

            {parsing && (
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Parsing invoice line items...
              </div>
            )}

            {isLoading ? (
              <div className="text-sm text-slate-400 py-4 text-center">Loading line items...</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-slate-400 py-4 text-center">
                No line items parsed yet.{' '}
                {canEdit && 'Click "Parsuj pozycje" to extract them from the invoice file.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8 text-xs">#</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Unit Price</TableHead>
                      <TableHead className="text-xs text-right">Net</TableHead>
                      <TableHead className="text-xs text-right">VAT%</TableHead>
                      <TableHead className="text-xs text-right">VAT Amt</TableHead>
                      <TableHead className="text-xs text-right">Gross</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      {canEdit && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        className={cn(
                          'transition-colors',
                          item.bbox && 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        )}
                        onMouseEnter={() => handleHover(item)}
                        onMouseLeave={() => handleHover(null)}
                      >
                        <TableCell className="text-xs text-slate-400">{item.position}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {item.description ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {item.quantity != null ? item.quantity.toLocaleString('pl-PL', { maximumFractionDigits: 3 }) : '—'}
                          {item.unit && <span className="text-slate-400 ml-1">{item.unit}</span>}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{fmtNum(item.unit_price)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{fmtNum(item.net_amount)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{item.vat_rate ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{fmtNum(item.vat_amount)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">{fmtNum(item.gross_amount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] py-0 px-1">
                              {SOURCE_LABELS[item.source as keyof typeof SOURCE_LABELS] ?? item.source}
                            </Badge>
                            {item.confidence != null && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] py-0 px-1 border',
                                  CONFIDENCE_COLORS(item.confidence)
                                )}
                                title={`Confidence: ${(item.confidence * 100).toFixed(0)}%`}
                              >
                                {CONFIDENCE_LABELS(item.confidence)}
                              </Badge>
                            )}
                            {item.confirmed && (
                              <Check className="w-3 h-3 text-emerald-500" />
                            )}
                          </div>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => handleStartEdit(item)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {error && (
              <div className="mt-2 text-xs text-rose-500">
                Error loading items: {error.message}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Line Item #{editingItem?.position}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Input
                id="edit-desc"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-qty">Quantity</Label>
              <Input
                id="edit-qty"
                type="number"
                step="0.001"
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-unit">Unit</Label>
              <Input
                id="edit-unit"
                value={editForm.unit}
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-price">Unit Price (Net)</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={editForm.unit_price}
                onChange={(e) => setEditForm({ ...editForm, unit_price: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-net">Net Amount</Label>
              <Input
                id="edit-net"
                type="number"
                step="0.01"
                value={editForm.net_amount}
                onChange={(e) => setEditForm({ ...editForm, net_amount: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-vat-rate">VAT Rate</Label>
              <Select
                value={editForm.vat_rate}
                onValueChange={(v) => setEditForm({ ...editForm, vat_rate: v })}
              >
                <SelectTrigger id="edit-vat-rate" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['23', '8', '5', '0', 'zw', 'np', 'oo'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-vat-amt">VAT Amount</Label>
              <Input
                id="edit-vat-amt"
                type="number"
                step="0.01"
                value={editForm.vat_amount}
                onChange={(e) => setEditForm({ ...editForm, vat_amount: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="edit-gross">Gross Amount</Label>
              <Input
                id="edit-gross"
                type="number"
                step="0.01"
                value={editForm.gross_amount}
                onChange={(e) => setEditForm({ ...editForm, gross_amount: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          {editError && (
            <div className="text-xs text-rose-500 mb-2">{editError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
