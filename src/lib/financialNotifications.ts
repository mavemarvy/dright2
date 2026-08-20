import { supabase } from './supabase';
import { formatCurrency } from './currency';

export type NotificationCategory = 'wallet' | 'subscriptions' | 'escrow' | 'withdrawal';

interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  notificationType: string;
  category: NotificationCategory;
  priority?: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
  actorId?: string;
}

async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      user_id: payload.userId,
      title: payload.title,
      message: payload.message,
      notification_type: payload.notificationType,
      category: payload.category,
      priority: payload.priority || 'medium',
      metadata: {
        ...payload.metadata,
        action_url: payload.metadata?.['action_url'] || null,
        event_module: payload.category,
        event_type: payload.notificationType,
        count: 1,
      },
      actor_id: payload.actorId || null,
      is_read: false,
      is_archived: false,
      is_deleted: false,
    });
  } catch {
    // notifications are non-critical — fail silently
  }
}

export async function notifyWithdrawalRequested(
  userId: string,
  amount: number,
  reference: string
): Promise<void> {
  await sendNotification({
    userId,
    title: 'Withdrawal Requested',
    message: `Your withdrawal of ${formatCurrency(amount)} is being processed. Reference: ${reference}`,
    notificationType: 'withdrawal_requested',
    category: 'withdrawal',
    priority: 'high',
    metadata: { amount, reference, action_url: '/wallet' },
  });
}

export async function notifyWithdrawalApproved(
  userId: string,
  amount: number,
  reference: string
): Promise<void> {
  await sendNotification({
    userId,
    title: 'Withdrawal Approved',
    message: `Your withdrawal of ${formatCurrency(amount)} has been approved and is being transferred. Reference: ${reference}`,
    notificationType: 'withdrawal_approved',
    category: 'withdrawal',
    priority: 'high',
    metadata: { amount, reference, action_url: '/wallet' },
  });
}

export async function notifyWithdrawalFailed(
  userId: string,
  amount: number,
  reference: string,
  reason?: string
): Promise<void> {
  await sendNotification({
    userId,
    title: 'Withdrawal Failed',
    message: `Your withdrawal of ${formatCurrency(amount)} could not be processed. ${reason || 'Please try again or contact support.'} Reference: ${reference}`,
    notificationType: 'withdrawal_failed',
    category: 'withdrawal',
    priority: 'high',
    metadata: { amount, reference, reason, action_url: '/wallet' },
  });
}

export async function notifySubscriptionActivated(
  userId: string,
  planName: string,
  planId: string
): Promise<void> {
  await sendNotification({
    userId,
    title: 'Subscription Activated',
    message: `Your ${planName} subscription is now active. Enjoy your benefits!`,
    notificationType: 'subscription_activated',
    category: 'subscriptions',
    priority: 'high',
    metadata: { plan_id: planId, plan_name: planName, action_url: '/subscriptions' },
  });
}

export async function notifySubscriptionRenewed(
  userId: string,
  planName: string,
  amount: number
): Promise<void> {
  await sendNotification({
    userId,
    title: 'Subscription Renewed',
    message: `Your ${planName} subscription has been renewed for ${formatCurrency(amount)}.`,
    notificationType: 'subscription_renewed',
    category: 'subscriptions',
    priority: 'medium',
    metadata: { plan_name: planName, amount, action_url: '/subscriptions' },
  });
}

export async function notifySubscriptionFailed(
  userId: string,
  planName: string
): Promise<void> {
  await sendNotification({
    userId,
    title: 'Subscription Payment Failed',
    message: `We could not process the payment for your ${planName} subscription. Please update your payment method.`,
    notificationType: 'subscription_failed',
    category: 'subscriptions',
    priority: 'high',
    metadata: { plan_name: planName, action_url: '/subscriptions' },
  });
}

export async function notifyEscrowReleased(
  buyerId: string,
  sellerId: string,
  amount: number,
  orderId: string
): Promise<void> {
  await Promise.all([
    sendNotification({
      userId: sellerId,
      title: 'Payment Released',
      message: `${formatCurrency(amount)} from order ${orderId.slice(0, 8)} has been released to your wallet.`,
      notificationType: 'escrow_released',
      category: 'escrow',
      priority: 'high',
      metadata: { amount, order_id: orderId, action_url: '/wallet' },
    }),
    sendNotification({
      userId: buyerId,
      title: 'Order Completed',
      message: `Your payment of ${formatCurrency(amount)} for order ${orderId.slice(0, 8)} has been released to the seller.`,
      notificationType: 'escrow_released',
      category: 'escrow',
      priority: 'medium',
      metadata: { amount, order_id: orderId, action_url: '/my-orders' },
    }),
  ]);
}

export async function notifyRefund(
  buyerId: string,
  amount: number,
  orderId: string,
  isPartial: boolean = false
): Promise<void> {
  await sendNotification({
    userId: buyerId,
    title: isPartial ? 'Partial Refund Processed' : 'Refund Processed',
    message: `${isPartial ? 'A partial refund of' : 'A refund of'} ${formatCurrency(amount)} has been credited to your wallet for order ${orderId.slice(0, 8)}.`,
    notificationType: 'refund',
    category: 'escrow',
    priority: 'high',
    metadata: { amount, order_id: orderId, is_partial: isPartial, action_url: '/wallet' },
  });
}

export async function notifyAdminWithdrawalRequest(
  adminIds: string[],
  userId: string,
  amount: number,
  reference: string
): Promise<void> {
  await Promise.all(
    adminIds.map((adminId) =>
      sendNotification({
        userId: adminId,
        title: 'New Withdrawal Request',
        message: `A withdrawal request for ${formatCurrency(amount)} requires approval. Reference: ${reference}`,
        notificationType: 'admin_withdrawal_request',
        category: 'withdrawal',
        priority: 'high',
        metadata: { user_id: userId, amount, reference, action_url: '/admin/withdrawals' },
      })
    )
  );
}
