import { useState } from 'react';
import { Download, Printer, Share2, Check, Loader2, X, FileText, QrCode, Headphones } from 'lucide-react';
import { generateInvoiceHTML, generateQRCodeData } from '../lib/invoiceLib';
import type { Invoice } from '../lib/invoiceLib';
import { formatCurrency } from '../lib/currency';

export interface ReceiptData {
  receiptNumber: string;
  reference: string;
  product: string;
  buyer: string;
  seller: string;
  amount: number;
  status: string;
  gateway: string;
  date: string;
  currency?: string;
  discount?: number;
  couponCode?: string;
  referralDiscount?: number;
  escrowFee?: number;
  platformFee?: number;
  productPrice?: number;
  orderId?: string;
  sellerId?: string;
}

interface Props {
  data: ReceiptData;
  onClose?: () => void;
  invoice?: Invoice | null;
}

export default function Receipt({ data, onClose, invoice }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [shared, setShared] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const currency = data.currency || 'NGN';
  const fmt = (n: number) => formatCurrency(n, currency);

  const formattedDate = new Date(data.date).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const qrUrl = generateQRCodeData(
    `Dright Receipt ${data.receiptNumber} | ${data.product} | ${fmt(data.amount)} | Ref: ${data.reference}`
  );

  const handlePrint = () => {
    if (invoice) {
      const html = generateInvoiceHTML(invoice);
      const printWin = window.open('', '_blank', 'width=800,height=900');
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      }
      return;
    }

    const receiptHtml = `
      <!DOCTYPE html>
      <html><head><title>Receipt ${data.receiptNumber}</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px; color: #1a1a1a; }
        .header { text-align: center; margin-bottom: 24px; }
        .logo { font-size: 22px; font-weight: bold; color: #4f46e5; margin-bottom: 4px; }
        .receipt-title { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd; font-size: 13px; }
        .row.total { font-size: 18px; font-weight: bold; border-bottom: 2px solid #1a1a1a; padding-top: 12px; margin-top: 8px; }
        .qr { text-align: center; margin: 20px 0; }
        .qr img { width: 120px; height: 120px; }
        .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #999; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin: 8px 0; }
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-failed { background: #fee2e2; color: #991b1b; }
      </style></head><body>
        <div class="header">
          <div class="logo">Dright Marketplace</div>
          <div class="receipt-title">Payment Receipt</div>
          <div class="badge ${data.status === 'success' ? 'badge-success' : 'badge-failed'}">${data.status.toUpperCase()}</div>
        </div>
        <div class="row"><span>Receipt #</span><span>${data.receiptNumber}</span></div>
        <div class="row"><span>Reference</span><span>${data.reference}</span></div>
        <div class="row"><span>Date</span><span>${formattedDate}</span></div>
        <div class="row"><span>Product</span><span>${data.product}</span></div>
        <div class="row"><span>Buyer</span><span>${data.buyer}</span></div>
        <div class="row"><span>Seller</span><span>${data.seller}</span></div>
        <div class="row"><span>Gateway</span><span style="text-transform: capitalize;">${data.gateway}</span></div>
        ${data.productPrice !== undefined ? `<div class="row"><span>Product Price</span><span>${fmt(data.productPrice)}</span></div>` : ''}
        ${data.discount ? `<div class="row" style="color: #059669;"><span>Discount</span><span>-${fmt(data.discount)}</span></div>` : ''}
        ${data.couponCode ? `<div class="row" style="color: #059669;"><span>Coupon (${data.couponCode})</span><span>-${fmt(data.couponCode ? data.discount || 0 : 0)}</span></div>` : ''}
        ${data.referralDiscount ? `<div class="row" style="color: #059669;"><span>Referral Reward</span><span>-${fmt(data.referralDiscount)}</span></div>` : ''}
        ${data.escrowFee !== undefined ? `<div class="row"><span>Escrow Fee</span><span>${data.escrowFee === 0 ? 'Free' : fmt(data.escrowFee)}</span></div>` : ''}
        ${data.platformFee !== undefined ? `<div class="row"><span>Platform Fee</span><span>${data.platformFee === 0 ? 'Included' : fmt(data.platformFee)}</span></div>` : ''}
        <div class="row total"><span>Total</span><span>${fmt(data.amount)}</span></div>
        <div class="qr">
          <img src="${qrUrl}" alt="QR Code" />
          <p style="font-size: 11px; color: #999; margin-top: 8px;">Scan to verify receipt</p>
        </div>
        <div class="footer">
          <p>Thank you for your purchase.</p>
          <p>For support: support@dright.com</p>
          <p>This receipt was generated electronically by Dright Marketplace.</p>
        </div>
      </body></html>
    `;
    const printWin = window.open('', '_blank', 'width=500,height=700');
    if (printWin) {
      printWin.document.write(receiptHtml);
      printWin.document.close();
      printWin.focus();
      printWin.print();
    }
  };

  const handleDownload = () => {
    setDownloading(true);
    if (invoice) {
      const html = generateInvoiceHTML(invoice);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoice.invoice_number}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const receiptText = `
Dright Marketplace — Payment Receipt
=====================================
Receipt #:    ${data.receiptNumber}
Reference:    ${data.reference}
Date:         ${formattedDate}
Product:      ${data.product}
Buyer:        ${data.buyer}
Seller:       ${data.seller}
Gateway:      ${data.gateway}
Status:       ${data.status}
-------------------------------------
${data.productPrice !== undefined ? `Product Price:  ${fmt(data.productPrice)}\n` : ''}${data.discount ? `Discount:       -${fmt(data.discount)}\n` : ''}${data.referralDiscount ? `Referral Reward: -${fmt(data.referralDiscount)}\n` : ''}${data.escrowFee !== undefined ? `Escrow Fee:     ${data.escrowFee === 0 ? 'Free' : fmt(data.escrowFee)}\n` : ''}${data.platformFee !== undefined ? `Platform Fee:   ${data.platformFee === 0 ? 'Included' : fmt(data.platformFee)}\n` : ''}-------------------------------------
Total:        ${fmt(data.amount)}
=====================================
Thank you for your purchase.
This receipt was generated electronically by Dright Marketplace.
For support: support@dright.com
`;
      const blob = new Blob([receiptText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${data.receiptNumber}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setTimeout(() => setDownloading(false), 800);
  };

  const handleShare = async () => {
    const shareText = `Dright Receipt #${data.receiptNumber} — ${data.product} — ${fmt(data.amount)} — Ref: ${data.reference}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Payment Receipt', text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // user dismissed share sheet
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary-600" />
          {invoice ? 'Invoice' : 'Receipt'}
        </h3>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      <div className="p-5 space-y-2 text-sm">
        {/* Status badge */}
        <div className="mb-3">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
            data.status === 'success' || data.status === 'paid'
              ? 'bg-emerald-100 text-emerald-700'
              : data.status === 'failed'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
          }`}>
            {data.status === 'success' || data.status === 'paid' ? <Check className="w-3 h-3" /> : null}
            {data.status.toUpperCase()}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">{invoice ? 'Invoice #' : 'Receipt #'}</span>
          <span className="text-gray-900 font-mono font-medium">{data.receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Reference</span>
          <span className="text-gray-900 font-mono text-xs">{data.reference}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Date</span>
          <span className="text-gray-900">{formattedDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Product</span>
          <span className="text-gray-900 font-medium truncate max-w-[180px]">{data.product}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Buyer</span>
          <span className="text-gray-900">{data.buyer}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Seller</span>
          <span className="text-gray-900">{data.seller}</span>
        </div>

        {/* Price breakdown */}
        {data.productPrice !== undefined && (
          <div className="pt-3 mt-2 border-t border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Product Price</span>
              <span className="text-gray-700">{fmt(data.productPrice)}</span>
            </div>
            {data.discount ? (
              <div className="flex justify-between text-xs text-emerald-600">
                <span>Discount</span>
                <span>-{fmt(data.discount)}</span>
              </div>
            ) : null}
            {data.referralDiscount ? (
              <div className="flex justify-between text-xs text-emerald-600">
                <span>Referral Reward</span>
                <span>-{fmt(data.referralDiscount)}</span>
              </div>
            ) : null}
            {data.escrowFee !== undefined && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Escrow Fee</span>
                <span className="text-gray-700">{data.escrowFee === 0 ? 'Free' : fmt(data.escrowFee)}</span>
              </div>
            )}
            {data.platformFee !== undefined && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Platform Fee</span>
                <span className="text-gray-700">{data.platformFee === 0 ? 'Included' : fmt(data.platformFee)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-3 mt-2 border-t border-gray-100">
          <span className="font-bold text-gray-900">Total</span>
          <span className="text-lg font-bold text-primary-600">{fmt(data.amount)}</span>
        </div>

        {/* QR Code */}
        {showQR && (
          <div className="flex flex-col items-center py-3 bg-gray-50 rounded-xl mt-3">
            <img src={qrUrl} alt="QR Code" className="w-32 h-32" />
            <p className="text-xs text-gray-400 mt-2">Scan to verify receipt</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 p-4 bg-gray-50 border-t border-gray-100">
        <button onClick={handleDownload} disabled={downloading}
          className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download
        </button>
        <button onClick={handlePrint}
          className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 transition-colors">
          <Printer className="w-4 h-4" />
          Print
        </button>
        <button onClick={() => setShowQR(!showQR)}
          className={`py-2.5 px-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
            showQR ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
          }`}>
          <QrCode className="w-4 h-4" />
        </button>
        <button onClick={handleShare}
          className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 transition-colors">
          {shared ? <><Check className="w-4 h-4 text-emerald-600" />Copied</> : <><Share2 className="w-4 h-4" />Share</>}
        </button>
      </div>

      {/* Support / Contact Seller links */}
      <div className="px-4 pb-4 flex items-center gap-3 text-xs">
        <a href="/support" className="flex items-center gap-1 text-gray-500 hover:text-primary-600">
          <Headphones className="w-3 h-3" /> Contact Support
        </a>
        {data.sellerId && (
          <a href={`/chat?user=${data.sellerId}`} className="flex items-center gap-1 text-gray-500 hover:text-primary-600">
            Contact Seller
          </a>
        )}
        {data.orderId && (
          <a href={`/orders/${data.orderId}`} className="flex items-center gap-1 text-gray-500 hover:text-primary-600 ml-auto">
            View Transaction →
          </a>
        )}
      </div>
    </div>
  );
}
