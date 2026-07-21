import { NextRequest, NextResponse } from 'next/server';
import {
  updateCompanyBankAccount,
  deleteCompanyBankAccount,
  verifyCompanyBankAccount,
} from '@/lib/bank-accounts/actions';
import type { UpdateBankAccountPatch } from '@/lib/bank-accounts/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await req.json()) as UpdateBankAccountPatch & {
      action?: 'verify';
    };

    if (body.action === 'verify') {
      const result = await verifyCompanyBankAccount(params.id);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ account: result.account });
    }

    const { action: _action, ...patch } = body;
    const result = await updateCompanyBankAccount(params.id, patch);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, fieldErrors: result.fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json({ account: result.account });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    const result = await deleteCompanyBankAccount(params.id, force);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          requiresOwnerConfirm: result.requiresOwnerConfirm,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
