'use client';

import { useState } from 'react';
import { Users, Search, UserCog, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  onboarded: boolean | null;
  company_id: string | null;
  company_name: string | null;
  is_demo: boolean | null;
};

function formatDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function AdminUsersView({ users }: { users: UserRow[] }) {
  const [search, setSearch] = useState('');
  const realUsers = users.filter((u) => !u.is_demo);
  const filtered = realUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.company_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Użytkownicy</h1>
          <p className="text-sm text-muted-foreground mt-1">{realUsers.length} kont w systemie</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Lista użytkowników</CardTitle>
              <CardDescription>Zarządzaj kontami i uprawnieniami</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj użytkownika..."
                className="pl-9 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zarejestrowany</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p>Brak użytkowników</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === 'admin' ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {u.role === 'admin' ? 'Admin' : 'Użytkownik'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.company_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.onboarded ? 'outline' : 'secondary'}>
                        {u.onboarded ? 'Aktywny' : 'Nowy'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" disabled>
                          <UserCog className="mr-1.5 h-3.5 w-3.5" />
                          Zmień rolę
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled>
                          <UserX className="mr-1.5 h-3.5 w-3.5" />
                          Dezaktywuj
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
