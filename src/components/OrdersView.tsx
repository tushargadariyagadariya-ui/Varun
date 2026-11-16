import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Package,
  PackageCheck,
  RotateCcw,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import {
  MarketplaceOrder,
  OrderStatus,
  ReturnRequest,
} from '../types/marketplace';
import { buildCourierTrackingUrl } from '../services/futureArchitecture';
import {
  inferOrderType,
  SEVEN_DAYS_MS,
  submitReturnRequest,
  updateOrderStatus,
} from '../services/marketplaceService';
import { SafeImage } from './SafeImage';

interface OrdersViewProps {
  orders: MarketplaceOrder[];
  returns?: ReturnRequest[];
  customerId?: string | null;
  isSignedIn: boolean;
  onOpenAuth: () => void;
  onOpenStore: (sellerId: string) => void;
  onNotify: (msg: string) => void;
}

const ORDER_STEPS: OrderStatus[] = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];
const RETURN_REASONS = [
  'Damaged or defective item received',
  'Wrong item, size, or variant delivered',
  'Quality did not match product description',
  'Missing parts or accessories',
  'Other reason',
] as const;

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  returns = [],
  customerId,
  isSignedIn,
  onOpenAuth,
  onOpenStore,
  onNotify,
}) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');

  const [returnTargetOrder, setReturnTargetOrder] = useState<MarketplaceOrder | null>(null);
  const [returnReason, setReturnReason] = useState<string>(RETURN_REASONS[0]);
  const [returnComments, setReturnComments] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  const returnByOrderId = new Map<string, ReturnRequest>();
  for (const r of returns) {
    returnByOrderId.set(r.orderId, r);
  }

  const filtered =
    statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter);

  const handleCancelOrder = async (order: MarketplaceOrder) => {
    setCancellingId(order.id);
    try {
      await updateOrderStatus(order, 'Cancelled');
      onNotify(`Order ${order.id} cancelled and stock restored.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to cancel order.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetOrder || !customerId) return;
    setSubmittingReturn(true);
    try {
      await submitReturnRequest({
        order: returnTargetOrder,
        customerId,
        reason: returnReason,
        comments: returnComments,
      });
      onNotify(`7-day return request submitted for order ${returnTargetOrder.id}.`);
      setReturnTargetOrder(null);
      setReturnComments('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to submit return request.');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const formatTimestamp = (ts: unknown): string => {
    if (!ts) return 'Just now';
    if (typeof ts === 'string') return new Date(ts).toLocaleDateString('en-IN');
    if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    return 'Recent';
  };

  const getReturnWindowLabel = (order: MarketplaceOrder): { eligible: boolean; label: string } => {
    if (order.status !== 'Delivered') {
      return { eligible: false, label: '' };
    }
    const now = Date.now();
    const deadlineMs =
      order.returnDeadlineMs ||
      (order.deliveredAtMs ? order.deliveredAtMs + SEVEN_DAYS_MS : 0);

    if (!deadlineMs) {
      return {
        eligible: true,
        label: '7-day return policy active',
      };
    }
    const diff = deadlineMs - now;
    if (diff <= 0) {
      return {
        eligible: false,
        label: '7-day return window closed',
      };
    }
    const daysLeft = Math.floor(diff / 86400000);
    const hoursLeft = Math.floor((diff % 86400000) / 3600000);
    return {
      eligible: true,
      label:
        daysLeft > 0
          ? `Eligible for return (${daysLeft}d ${hoursLeft}h left)`
          : `Eligible for return (${Math.max(1, hoursLeft)}h left)`,
    };
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 bg-[#FFFFFF]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">My Orders</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {isSignedIn
              ? 'Live order tracking, delivery updates, and 7-day return requests across TISAHARA'
              : 'Showing guest orders placed on this device. Sign in to sync orders and submit 7-day returns.'}
          </p>
        </div>
        {!isSignedIn && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-4 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer self-start"
          >
            Sign In to Sync Orders
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(['ALL', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] as const).map(
          (st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                statusFilter === st
                  ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                  : 'bg-white border-purple-200 text-slate-700 hover:bg-[#FAF5FF]'
              }`}
            >
              {st === 'ALL' ? `All (${orders.length})` : st}
            </button>
          )
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-purple-100 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-900">No orders found</p>
          <p className="text-xs text-slate-600">
            Orders you place via Cash on Delivery will appear here with real-time tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((order) => {
            const isCancelled = order.status === 'Cancelled';
            const currentStepIdx = ORDER_STEPS.indexOf(order.status);
            const trackingUrl = buildCourierTrackingUrl(
              order.courierPartner,
              order.trackingNumber
            );
            const orderType = inferOrderType(order);
            const linkedReturn = returnByOrderId.get(order.id);
            const effectiveReturnStatus = linkedReturn?.status || order.returnStatus || 'None';
            const returnWin = getReturnWindowLabel(order);

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-purple-100 p-5 sm:p-6 space-y-5 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-purple-50">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-mono-num font-bold text-slate-900">
                        {order.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimestamp(order.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      {order.sellerId === 'tisahara_owner' ? (
                        <span className="font-semibold text-[#6B21A8]">TISAHARA Direct</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenStore(order.sellerId)}
                          className="text-[#6B21A8] font-semibold hover:underline cursor-pointer"
                        >
                          {order.sellerStoreName}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      Deliver to: {order.shippingAddress.fullName}, {order.shippingAddress.city} -{' '}
                      {order.shippingAddress.pincode} ·{' '}
                      {orderType === 'SELLER_OWN_PRODUCT'
                        ? 'Fulfilled by Seller Store'
                        : 'Fulfilled by TISAHARA Central'}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono-num text-lg font-bold text-slate-900">
                      ₹{order.totalAmount.toLocaleString('en-IN')}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6B21A8]">
                      {isCancelled ? (
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                      ) : order.status === 'Delivered' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-[#7E22CE]" />
                      )}
                      <span>{order.status}</span>
                    </span>
                  </div>
                </div>

                {/* Visual Order Tracker */}
                {!isCancelled && (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {ORDER_STEPS.map((step, idx) => {
                      const reached = idx <= currentStepIdx;
                      const Icon =
                        step === 'Pending'
                          ? Clock
                          : step === 'Confirmed'
                          ? PackageCheck
                          : step === 'Shipped'
                          ? Truck
                          : CheckCircle2;
                      return (
                        <div key={step} className="space-y-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              reached ? 'bg-[#7E22CE]' : 'bg-purple-100'
                            }`}
                          />
                          <div
                            className={`flex items-center gap-1 text-[11px] ${
                              reached ? 'font-bold text-[#581C87]' : 'font-normal text-slate-400'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{step}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Order Line Items */}
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.productId} className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#FAF5FF] border border-purple-100 shrink-0">
                        <SafeImage
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {item.title}
                        </p>
                        <p className="font-mono-num text-xs text-slate-600">
                          Qty {item.quantity} × ₹{item.sellingPrice.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <span className="font-mono-num text-sm font-semibold text-slate-900 shrink-0">
                        ₹{(item.sellingPrice * item.quantity).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Return Status Strip */}
                {effectiveReturnStatus !== 'None' && (
                  <div className="rounded-xl bg-[#FAF5FF] border border-purple-200 p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-[#581C87]">
                      <span className="inline-flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" />
                        Return Status: {effectiveReturnStatus}
                      </span>
                      {order.paymentStatus === 'Refunded' && (
                        <span className="text-emerald-700 font-bold">Refund Processed</span>
                      )}
                    </div>
                    {linkedReturn?.reason && (
                      <p className="text-slate-600">Reason: {linkedReturn.reason}</p>
                    )}
                    {linkedReturn?.adminNote && (
                      <p className="text-slate-700 font-medium">Update: {linkedReturn.adminNote}</p>
                    )}
                  </div>
                )}

                {/* Tracking, Cancel & 7-Day Return Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-purple-50">
                  <div className="text-xs text-slate-600 space-y-0.5">
                    {order.trackingNumber ? (
                      <span className="inline-flex items-center gap-2">
                        <span>
                          Courier: <strong className="text-slate-900">{order.courierPartner || 'Partner'}</strong> · AWB:{' '}
                          <span className="font-mono-num">{order.trackingNumber}</span>
                        </span>
                        {trackingUrl && (
                          <a
                            href={trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#6B21A8] hover:underline font-semibold"
                          >
                            <span>Track</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    ) : (
                      <span>
                        Payment: {order.paymentStatus} ({order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online'})
                      </span>
                    )}
                    {order.status === 'Delivered' && returnWin.label && effectiveReturnStatus === 'None' && (
                      <div className="text-[11px] text-slate-500 font-medium">
                        {returnWin.label}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isSignedIn &&
                      (order.status === 'Pending' || order.status === 'Confirmed') && (
                        <button
                          type="button"
                          disabled={cancellingId === order.id}
                          onClick={() => handleCancelOrder(order)}
                          className="px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold cursor-pointer"
                        >
                          {cancellingId === order.id ? 'Cancelling...' : 'Cancel Order'}
                        </button>
                      )}

                    {isSignedIn &&
                      order.status === 'Delivered' &&
                      effectiveReturnStatus === 'None' &&
                      returnWin.eligible && (
                        <button
                          type="button"
                          onClick={() => {
                            setReturnTargetOrder(order);
                            setReturnReason(RETURN_REASONS[0]);
                            setReturnComments('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-purple-200 bg-[#FAF5FF] hover:bg-[#F3E8FF] text-[#6B21A8] text-xs font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Request 7-Day Return
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7-Day Return Request Modal */}
      {returnTargetOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Request 7-Day Return"
        >
          <div className="bg-white border border-purple-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  7-Day Return Request
                </h2>
                <p className="text-xs text-slate-600 font-mono-num">
                  Order {returnTargetOrder.id} · ₹{returnTargetOrder.totalAmount.toLocaleString('en-IN')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnTargetOrder(null)}
                aria-label="Close return modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-purple-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  Reason for Return
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-purple-200 rounded-xl text-slate-900"
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  Additional Details (optional)
                </label>
                <textarea
                  rows={3}
                  maxLength={800}
                  value={returnComments}
                  onChange={(e) => setReturnComments(e.target.value)}
                  placeholder="Describe the issue briefly to help speed up pickup & refund…"
                  className="w-full px-3 py-2 bg-[#FAF5FF] border border-purple-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnTargetOrder(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-5 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingReturn ? 'Submitting…' : 'Submit Return Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
