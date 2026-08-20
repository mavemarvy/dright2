import { supabase } from './supabase';

export interface Invoice {
  id: string;
  invoice_number: string;
  user_id: string;
  order_id: string | null;
  subscription_id: string | null;
  amount: number;
  currency: string;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: string;
  invoice_type: string;
  line_items: Array<{
    description: string;
    amount: number;
    quantity?: number;
  }>;
  billing_details: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  payment_reference: string | null;
  payment_provider: string | null;
  paid_at: string | null;
  due_date: string | null;
  created_at: string;
}

export async function createInvoice(
  userId: string,
  params: {
    amount: number;
    currency?: string;
    invoice_type?: string;
    order_id?: string;
    subscription_id?: string;
    line_items?: Array<{ description: string; amount: number; quantity?: number }>;
    billing_details?: { name?: string; email?: string; phone?: string; address?: string };
    discount_amount?: number;
    tax_amount?: number;
  }
): Promise<{ success: boolean; invoice?: Invoice; error?: string }> {
  const { data, error } = await supabase.rpc('create_invoice', {
    p_user_id: userId,
    p_amount: params.amount,
    p_currency: params.currency || 'NGN',
    p_invoice_type: params.invoice_type || 'product',
    p_order_id: params.order_id || null,
    p_subscription_id: params.subscription_id || null,
    p_line_items: params.line_items || [],
    p_billing_details: params.billing_details || {},
    p_discount_amount: params.discount_amount || 0,
    p_tax_amount: params.tax_amount || 0,
  });

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to create invoice' };
  }

  const result = data as { success: boolean; invoice_id: string; invoice_number: string };
  if (!result.success) return { success: false, error: 'Failed to create invoice' };

  const { data: invoiceData } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', result.invoice_id)
    .single();

  return { success: true, invoice: invoiceData as Invoice };
}

export async function markInvoicePaid(
  invoiceId: string,
  paymentReference: string,
  provider: string = 'paystack'
): Promise<void> {
  try {
    await supabase.rpc('mark_invoice_paid', {
      p_invoice_id: invoiceId,
      p_payment_reference: paymentReference,
      p_payment_provider: provider,
    });
  } catch {
    // non-critical
  }
}

export async function fetchUserInvoices(userId: string, limit: number = 20): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as Invoice[];
}

export function generateInvoiceHTML(invoice: Invoice): string {
  const date = new Date(invoice.created_at).toLocaleDateString('en-NG', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const paidDate = invoice.paid_at
    ? new Date(invoice.paid_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Unpaid';

  const lineItemsHTML = invoice.line_items.map(item => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.description}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${item.quantity || 1}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${invoice.currency} ${Number(item.amount).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html><head><title>Invoice ${invoice.invoice_number}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
      .logo { font-size: 24px; font-weight: bold; color: #4f46e5; }
      .invoice-meta { text-align: right; }
      .invoice-number { font-size: 28px; font-weight: bold; color: #1a1a1a; }
      .section { margin-bottom: 30px; }
      .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 4px; }
      .value { font-size: 14px; color: #333; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; padding-bottom: 8px; border-bottom: 2px solid #eee; }
      .totals { margin-left: auto; width: 300px; margin-top: 20px; }
      .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
      .grand-total { border-top: 2px solid #1a1a1a; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: bold; }
      .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
      .status-paid { background: #d1fae5; color: #065f46; }
      .status-pending { background: #fef3c7; color: #92400e; }
      .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
    </style></head><body>
      <div class="header">
        <div>
          <div class="logo">Dright Marketplace</div>
          <p style="font-size: 12px; color: #999; margin-top: 4px;">Lagos, Nigeria</p>
        </div>
        <div class="invoice-meta">
          <div class="invoice-number">${invoice.invoice_number}</div>
          <div style="margin-top: 8px;">
            <span class="status-badge ${invoice.status === 'paid' ? 'status-paid' : 'status-pending'}">${invoice.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 60px; margin-bottom: 30px;">
        <div class="section">
          <div class="label">Bill To</div>
          <div class="value">${invoice.billing_details?.name || 'Customer'}</div>
          <div class="value">${invoice.billing_details?.email || ''}</div>
          <div class="value">${invoice.billing_details?.phone || ''}</div>
        </div>
        <div class="section">
          <div class="label">Invoice Date</div>
          <div class="value">${date}</div>
          <div class="label" style="margin-top: 12px;">Payment Date</div>
          <div class="value">${paidDate}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Qty</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHTML}
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-row">
          <span>Subtotal</span>
          <span>${invoice.currency} ${Number(invoice.amount).toLocaleString()}</span>
        </div>
        ${invoice.discount_amount > 0 ? `
        <div class="totals-row" style="color: #059669;">
          <span>Discount</span>
          <span>-${invoice.currency} ${Number(invoice.discount_amount).toLocaleString()}</span>
        </div>` : ''}
        ${invoice.tax_amount > 0 ? `
        <div class="totals-row">
          <span>Tax</span>
          <span>${invoice.currency} ${Number(invoice.tax_amount).toLocaleString()}</span>
        </div>` : ''}
        <div class="totals-row grand-total">
          <span>Total</span>
          <span>${invoice.currency} ${Number(invoice.total_amount).toLocaleString()}</span>
        </div>
      </div>

      ${invoice.payment_reference ? `
      <div style="margin-top: 30px; padding: 12px; background: #f9fafb; border-radius: 8px;">
        <span class="label">Payment Reference</span>
        <div class="value" style="font-family: monospace;">${invoice.payment_reference}</div>
        <span class="label" style="margin-top: 8px;">Payment Method</span>
        <div class="value" style="text-transform: capitalize;">${invoice.payment_provider || 'Paystack'}</div>
      </div>` : ''}

      <div class="footer">
        <p>This is a computer-generated invoice from Dright Marketplace.</p>
        <p>For support, contact support@dright.com</p>
      </div>
    </body></html>
  `;
}

export function downloadInvoicePDF(invoice: Invoice): void {
  const html = generateInvoiceHTML(invoice);
  const printWin = window.open('', '_blank', 'width=800,height=900');
  if (printWin) {
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    printWin.print();
  }
}

export function generateQRCodeData(text: string): string {
  // Use a public QR code API for the invoice QR
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;
}
