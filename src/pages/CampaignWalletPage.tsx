import { useState } from 'react';
import { Wallet, ArrowDownToLine, ArrowUpFromLine, History, Lock } from 'lucide-react';
import { useCampaignWallet } from '../lib/campaignHooks';

export default function CampaignWalletPage() {
  const { wallet, transactions, loading, deposit, withdraw } = useCampaignWallet();
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    setError(null);
    try { await deposit(amt); setShowDeposit(false); setAmount(''); } catch (e) { setError(e instanceof Error ? e.message : 'Deposit failed'); }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    setError(null);
    try { await withdraw(amt); setShowWithdraw(false); setAmount(''); } catch (e) { setError(e instanceof Error ? e.message : 'Withdrawal failed'); }
  };

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><div className="bg-gray-100 rounded-2xl h-64 animate-pulse" /></div>;

  const balance = Number(wallet?.balance || 0);
  const escrow = Number(wallet?.escrow_balance || 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Campaign Wallet</h1>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-primary-500 to-blue-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-2 mb-2"><Wallet className="w-5 h-5" /><span className="text-sm text-white/80">Available Balance</span></div>
          <p className="text-3xl font-bold">${balance.toFixed(2)}</p>
          <p className="text-xs text-white/60 mt-1">Available for new campaigns</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-2"><Lock className="w-5 h-5 text-amber-500" /><span className="text-sm text-gray-500">Escrow Balance</span></div>
          <p className="text-3xl font-bold text-amber-600">${escrow.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Locked in active campaigns</p>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center"><p className="text-sm font-bold text-gray-900">${Number(wallet?.total_deposited || 0).toFixed(2)}</p><p className="text-xs text-gray-400">Deposited</p></div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center"><p className="text-sm font-bold text-gray-900">${Number(wallet?.total_withdrawn || 0).toFixed(2)}</p><p className="text-xs text-gray-400">Withdrawn</p></div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center"><p className="text-sm font-bold text-gray-900">${Number(wallet?.total_paid_out || 0).toFixed(2)}</p><p className="text-xs text-gray-400">Paid Out</p></div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => { setShowDeposit(true); setShowWithdraw(false); setAmount(''); setError(null); }} className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 flex items-center justify-center gap-1">
          <ArrowDownToLine className="w-4 h-4" /> Deposit
        </button>
        <button onClick={() => { setShowWithdraw(true); setShowDeposit(false); setAmount(''); setError(null); }} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-1">
          <ArrowUpFromLine className="w-4 h-4" /> Withdraw
        </button>
      </div>

      {showDeposit && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
          <h3 className="font-bold text-gray-900 mb-3">Deposit Funds</h3>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm mb-3 focus:outline-none focus:border-primary-500" />
          {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
          <button onClick={handleDeposit} className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700">Confirm Deposit</button>
        </div>
      )}

      {showWithdraw && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
          <h3 className="font-bold text-gray-900 mb-3">Withdraw Funds</h3>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm mb-3 focus:outline-none focus:border-primary-500" />
          {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
          <button onClick={handleWithdraw} className="w-full py-2.5 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900">Confirm Withdrawal</button>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-1"><History className="w-4 h-4" /> Transaction History</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{tx.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleString()}{tx.description ? ` • ${tx.description}` : ''}</p>
                </div>
                <span className={`text-sm font-bold ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {Number(tx.amount) >= 0 ? '+' : ''}${Number(tx.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
