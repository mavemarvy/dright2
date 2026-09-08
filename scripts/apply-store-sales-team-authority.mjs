import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/StorePage.tsx');
let text = fs.readFileSync(file, 'utf8');
const original = text;

function replaceRequired(from, to, label) {
  if (text.includes(to)) return;
  if (!text.includes(from)) throw new Error(`[store-sales-team-authority] Missing anchor: ${label}`);
  text = text.replace(from, to);
}

replaceRequired(
  "  calculateSubscriptionTotal,\n  getTaskPercentForTier,\n  ALL_TIERS,",
  "  calculateSubscriptionTotal,\n  ALL_TIERS,",
  'remove obsolete pricing mutation helper',
);

replaceRequired(
`  const handleCreateContract = async () => {
    if (!teamModalProduct || !user || !systemConfig) return;
    setTeamSubmitting(true);
    setTeamError(null);

    try {
      let query = supabase
        .from('users')
        .select('id')
        .eq('is_admin', false);

      if (selectedTier.startsWith('Mkt')) {
        const level = parseInt(selectedTier.replace('Mkt L', ''));
        query = query.eq('marketer_status', 'approved').eq('marketer_level', level);
      } else {
        const grade = selectedTier.replace('Adv ', '');
        query = query.eq('advertiser_status', 'approved').eq('advertiser_grade', grade);
      }

      query = query.limit(1);
      const { data: teamMembers, error: teamErr } = await query.maybeSingle();
      if (teamErr) throw teamErr;
      if (!teamMembers) {
        setTeamError(\`No \${selectedTier} available. Try a different tier.\`);
        setTeamSubmitting(false);
        return;
      }

      const totalAmount = calculateSubscriptionTotal(selectedTier, selectedDuration, systemConfig);
      const expiresAt = getExpiryDate(selectedDuration);

      const { error: contractErr } = await supabase.from('sales_team_contracts').insert({
        seller_id: user.id,
        sales_team_id: teamMembers.id,
        product_id: teamModalProduct.id,
        duration: selectedDuration,
        total_amount: totalAmount,
        status: 'active',
        admin_cut_applied: false,
        expires_at: expiresAt,
      });

      if (contractErr) throw contractErr;

      await supabase
        .from('products')
        .update({
          sales_team_tier: selectedTier,
          sales_team_task_percent: getTaskPercentForTier(selectedTier, systemConfig),
        })
        .eq('id', teamModalProduct.id);

      setTeamSuccess(true);
      setTimeout(() => closeTeamModal(), 2500);
      fetchProducts();
    } catch (err) {
      console.error('Contract creation error:', err);
      setTeamError('Failed to create contract. Please try again.');
    } finally {
      setTeamSubmitting(false);
    }
  };`,
`  const handleCreateContract = async () => {
    if (!teamModalProduct || !user || !systemConfig) return;
    setTeamSubmitting(true);
    setTeamError(null);

    try {
      const { data: contract, error: contractError } = await supabase.rpc('create_sales_team_contract_request', {
        p_product_id: teamModalProduct.id,
        p_selected_tier: selectedTier,
        p_duration: selectedDuration,
      });
      if (contractError) throw contractError;

      const contractId = contract?.contract_id as string | undefined;
      if (!contractId) throw new Error('Unable to create a canonical sales team contract');

      const { data: payment, error: paymentError } = await supabase.functions.invoke('sales-team-contract-initialize', {
        body: { contract_id: contractId },
      });
      if (paymentError) throw paymentError;
      if (!payment?.authorization_url) throw new Error(payment?.error || 'Unable to initialize secure payment');

      setTeamSuccess(true);
      window.location.assign(payment.authorization_url);
    } catch (err) {
      console.error('Contract creation error:', err);
      setTeamError(err instanceof Error ? err.message : 'Failed to prepare the sales team contract. Please try again.');
    } finally {
      setTeamSubmitting(false);
    }
  };`,
  'replace browser contract mutation with canonical authority flow',
);

replaceRequired(
  '<Check className="w-4 h-4" />Sales team contract created!',
  '<Check className="w-4 h-4" />Secure contract payment initialized. Redirecting...',
  'update contract success status',
);

replaceRequired(
`\nfunction getExpiryDate(duration: Duration): string {
  const now = new Date();
  if (duration === '1_week') now.setDate(now.getDate() + 7);
  else if (duration === '2_weeks') now.setDate(now.getDate() + 14);
  else now.setMonth(now.getMonth() + 1);
  return now.toISOString();
}`,
  '',
  'remove obsolete client expiry helper',
);

if (text === original) {
  console.log('[store-sales-team-authority] no changes required');
} else {
  fs.writeFileSync(file, text);
  console.log('[store-sales-team-authority] updated src/pages/StorePage.tsx');
}
