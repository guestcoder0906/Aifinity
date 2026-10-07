import React, { useState } from 'react';
import {
  X,
  Printer,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  Crown,
  Zap,
  Calendar,
  CreditCard,
  Receipt as ReceiptIcon
} from 'lucide-react';
import { PaymentTransactionRecord, UserProfile } from '../services/authService';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: PaymentTransactionRecord | null;
  currentUser?: UserProfile | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
  currentUser
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !transaction) return null;

  const invoiceNumber = `INV-${(transaction.id || '00000000').slice(-8).toUpperCase()}`;
  const formattedDate = transaction.createdAt
    ? new Date(transaction.createdAt).toLocaleString(undefined, {
        dateStyle: 'full',
        timeStyle: 'medium'
      })
    : new Date().toLocaleString();

  const handleCopySummary = () => {
    const text = [
      '====================================================',
      '        AIFINITY RPG — PAYMENT RECEIPT & INVOICE    ',
      '====================================================',
      `Invoice #:       ${invoiceNumber}`,
      `Transaction ID:  ${transaction.id}`,
      `Date & Time:     ${formattedDate}`,
      `Customer:        ${currentUser?.username || transaction.recipient || 'Player'} (${currentUser?.email || 'N/A'})`,
      `Item Purchased:  ${transaction.itemName}`,
      `Amount Paid:     $${(Number(transaction.amount) || 0).toFixed(2)} USD`,
      `Payment Method:  ${transaction.paymentMethod}`,
      `Status:          ${transaction.status.toUpperCase()} (DELIVERED)`,
      transaction.actionDelta ? `Action Credits:  +${transaction.actionDelta} Actions Added` : '',
      transaction.newTier ? `Membership Tier: ${transaction.newTier} Activated` : '',
      '====================================================',
      'Thank you for supporting Aifinity RPG!',
      'https://www.aifinity-rpg.com'
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200 font-sans max-h-[92dvh] sm:max-h-[90vh] my-auto">
        {/* Modal Top Controls (Hidden in Print) */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center shrink-0 print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <ReceiptIcon size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white tracking-tight truncate">Official Order Receipt</h3>
              <p className="text-[11px] font-mono text-neutral-400 truncate">{invoiceNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              title="Print Receipt"
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-mono px-2.5"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-4 sm:p-7 overflow-y-auto space-y-4 sm:space-y-5 bg-gradient-to-b from-neutral-900 to-neutral-950 print:bg-white print:text-black print:p-8">
          
          {/* Brand Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5 sm:gap-2 border-b border-neutral-800 print:border-black pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-black tracking-tight text-white print:text-black">
                  AIFINITY RPG
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 print:border-black print:text-black font-bold">
                  Verified Paid
                </span>
              </div>
              <p className="text-xs text-neutral-400 print:text-gray-600 mt-0.5">
                Infinite Worlds & AI Adventure Engine
              </p>
              <p className="text-[11px] text-neutral-500 print:text-gray-500 font-mono">
                https://www.aifinity-rpg.com
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 print:text-gray-700 block font-semibold">
                Tax Invoice
              </span>
              <span className="text-sm font-bold font-mono text-white print:text-black block">
                {invoiceNumber}
              </span>
              <span className="text-[11px] text-neutral-400 print:text-gray-600 block mt-0.5">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Customer & Payment Method Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-black/40 print:bg-gray-50 rounded-xl border border-neutral-800 print:border-gray-300">
              <span className="text-[10px] uppercase font-mono text-neutral-400 print:text-gray-600 block mb-1">
                Billed To
              </span>
              <div className="font-bold text-white print:text-black text-sm">
                {transaction.customerName || transaction.attachedUsername || currentUser?.username || transaction.recipient || 'Adventurer'}
              </div>
              <div className="text-neutral-400 print:text-gray-600 text-[11px]">
                {transaction.email || currentUser?.email || 'Customer'}
              </div>
              <div className="text-[10px] text-neutral-400 font-mono mt-1 truncate">
                Attached Account: <span className="text-amber-400 font-semibold">{transaction.attachedUsername || transaction.recipient || currentUser?.username || 'User'}</span>
                {transaction.userId && (
                  <span className="text-neutral-500 block text-[9px]">UID: {transaction.userId}</span>
                )}
              </div>
            </div>

            <div className="p-3 bg-black/40 print:bg-gray-50 rounded-xl border border-neutral-800 print:border-gray-300">
              <span className="text-[10px] uppercase font-mono text-neutral-400 print:text-gray-600 block mb-1">
                Payment Info
              </span>
              <div className="font-semibold text-white print:text-black flex items-center gap-1.5">
                <CreditCard size={13} className="text-amber-400 print:text-black" />
                <span>{transaction.paymentMethod}</span>
              </div>
              <div className="text-[11px] text-emerald-400 print:text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                <CheckCircle2 size={12} />
                <span>Status: Completed & Applied</span>
              </div>
              <div className="text-[10px] text-neutral-500 font-mono mt-1 truncate">
                Ref: {transaction.id}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-neutral-800 print:border-gray-300 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-black/60 print:bg-gray-100 border-b border-neutral-800 print:border-gray-300 flex justify-between text-[11px] uppercase font-mono text-neutral-400 print:text-gray-700">
              <span>Item & Description</span>
              <span>Amount</span>
            </div>

            <div className="p-4 space-y-2">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-bold text-white print:text-black text-sm">
                    {transaction.itemName}
                  </div>
                  <div className="text-xs text-neutral-400 print:text-gray-600">
                    {transaction.itemType === 'pack' ? (
                      <span className="flex items-center gap-1 text-amber-300/90 print:text-gray-800">
                        <Zap size={12} className="text-amber-400 print:text-black" />
                        Action Pack: +{transaction.actionDelta || 'Permanent'} Turn Credits
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-300/90 print:text-gray-800">
                        <Crown size={12} className="text-yellow-400 print:text-black" />
                        Membership Tier: {transaction.newTier || transaction.itemName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-bold font-mono text-white print:text-black">
                  ${(Number(transaction.amount) || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-neutral-800 print:border-gray-300 bg-black/40 print:bg-gray-50 p-3.5 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-neutral-400 print:text-gray-600">
                <span>Subtotal</span>
                <span>${(Number(transaction.amount) || 0).toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between text-neutral-400 print:text-gray-600">
                <span>Tax (0.00%)</span>
                <span>$0.00 USD</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-neutral-800 print:border-gray-300 text-sm font-bold text-white print:text-black">
                <span>Total Paid</span>
                <span className="text-emerald-400 print:text-black font-black">
                  ${(Number(transaction.amount) || 0).toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>

          {/* Delivery & Security Note */}
          <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-xs flex items-start gap-2.5 print:border-gray-400">
            <ShieldCheck size={16} className="text-emerald-400 print:text-black shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-emerald-300 print:text-black block text-xs">
                Product Delivered to Account
              </span>
              <p className="text-[11px] text-neutral-400 print:text-gray-600">
                Action credits never expire and apply directly to your adventure session. 
                Keep this receipt for your records.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden in Print) */}
        <div className="px-5 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <button
            onClick={handleCopySummary}
            className="text-xs text-neutral-300 hover:text-white flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied Receipt!' : 'Copy Summary'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
