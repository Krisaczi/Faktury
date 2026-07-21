import { NextRequest, NextResponse } from 'next/server';
import {
  listCompanyBankAccounts,
  createCompanyBankAccount,
} from '@/lib/bank-accounts/actions';
import type { CreateBankAccountInput } from '@/lib/bank-accounts/types';

export async function GET() {
  try {
    const accounts = await listCompanyBankAccounts();
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateBankAccountInput;
    const result = await createCompanyBankAccount(body);

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
