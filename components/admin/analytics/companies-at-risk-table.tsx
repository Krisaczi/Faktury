'use client';

import { Building2, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const COMPANIES_AT_RISK = [
  { name: 'Nexus Holding Sp. z o.o.', total: 1842, highRisk: 143, lastSync: '2026-04-15' },
  { name: 'Acme Logistics S.A.', total: 3201, highRisk: 214, lastSync: '2026-04-15' },
  { name: 'Primero Tech Sp. k.', total: 978, highRisk: 87, lastSync: '2026-04-14' },
  { name: 'Zeta Commerce Sp. z o.o.', total: 2150, highRisk: 167, lastSync: '2026-04-15' },
  { name: 'Alpha Industries S.A.', total: 4312, highRisk: 298, lastSync: '2026-04-13' },
  { name: 'Merkury Partners Sp. z o.o.', total: 760, highRisk: 44, lastSync: '2026-04-15' },
  { name: 'Orion Usługi Sp. k.', total: 522, highRisk: 27, lastSync: '2026-04-12' },
];

function riskLevel(pct: number): { label: string; variant: 'destructive' | 'outline' | 'secondary' } {
  if (pct >= 10) return { label: 'Krytyczny', variant: 'destructive' };
  if (pct >= 6) return { label: 'Wysoki', variant: 'outline' };
  return { label: 'Umiarkowany', variant: 'secondary' };
}

export function CompaniesAtRiskTable() {
  const sorted = [...COMPANIES_AT_RISK].sort((a, b) => b.highRisk / b.total - a.highRisk / a.total);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 text-red-500" />
          <CardTitle className="text-base">Firmy podwyższonego ryzyka</CardTitle>
        </div>
        <CardDescription>Ranking firm wg odsetka faktur wysokiego ryzyka</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Firma</TableHead>
              <TableHead className="text-right">Faktury ogółem</TableHead>
              <TableHead className="text-right">Wysokie ryzyko</TableHead>
              <TableHead className="text-right">% ryzyka</TableHead>
              <TableHead>Poziom</TableHead>
              <TableHead>Ostatnia synch.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              const pct = (c.highRisk / c.total) * 100;
              const level = riskLevel(pct);
              return (
                <TableRow key={c.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {c.total.toLocaleString('pl-PL')}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-red-600">
                    {c.highRisk.toLocaleString('pl-PL')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500"
                          style={{ width: `${Math.min(pct * 4, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums font-semibold w-10 text-right">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={level.variant} className="text-[10px]">
                      {level.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.lastSync).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
