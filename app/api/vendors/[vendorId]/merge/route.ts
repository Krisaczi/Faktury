import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { vendorId: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Merge is admin/owner only
    if (!['owner', 'admin'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const body = await req.json();
    const { sourceVendorId } = body as { sourceVendorId: string };

    if (!sourceVendorId) {
      return NextResponse.json({ error: 'sourceVendorId is required' }, { status: 400 });
    }

    if (sourceVendorId === params.vendorId) {
      return NextResponse.json({ error: 'Cannot merge a vendor with itself' }, { status: 400 });
    }

    // Verify both vendors belong to this company
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, name, company_id')
      .in('id', [params.vendorId, sourceVendorId]);

    const targetVendor = vendors?.find((v) => v.id === params.vendorId);
    const sourceVendor = vendors?.find((v) => v.id === sourceVendorId);

    if (!targetVendor || !sourceVendor) {
      return NextResponse.json({ error: 'One or both vendors not found' }, { status: 404 });
    }

    if (targetVendor.company_id !== userRecord.company_id || sourceVendor.company_id !== userRecord.company_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Reassign all invoices from source to target
    const { error: reassignError } = await supabase
      .from('invoices')
      .update({ vendor_id: params.vendorId } as never)
      .eq('vendor_id', sourceVendorId)
      .eq('company_id', userRecord.company_id);

    if (reassignError) {
      return NextResponse.json({ error: reassignError.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id:    user.id,
      action:     'vendor_merged',
      metadata:   {
        target_vendor_id:   params.vendorId,
        target_vendor_name: targetVendor.name,
        source_vendor_id:   sourceVendorId,
        source_vendor_name: sourceVendor.name,
      },
    });

    return NextResponse.json({
      message: `Merged "${sourceVendor.name}" into "${targetVendor.name}"`,
      targetVendorId: params.vendorId,
      sourceVendorId,
    });
  } catch (err) {
    console.error('[api/vendors/[vendorId]/merge]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
