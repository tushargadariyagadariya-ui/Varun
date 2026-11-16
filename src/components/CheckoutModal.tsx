import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  CartItem,
  MarketplaceOrder,
  PaymentMethod,
  ShippingAddress,
  UserProfile,
} from '../types/marketplace';
import {
  CheckoutValidationError,
  placeMarketplaceOrders,
  saveAddressToProfile,
} from '../services/marketplaceService';
import { PAYMENT_ARCHITECTURE_STATUS } from '../services/futureArchitecture';
import { SafeImage } from './SafeImage';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  userProfile: UserProfile | null;
  acceptingOrders?: boolean;
  orderPauseMessage?: string;
  onSyncCartItemPrice: (productId: string, newPrice: number) => void;
  onOrderSuccess: (orders: MarketplaceOrder[]) => void;
  onUserUpdated: (addresses: UserProfile['addresses']) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  userProfile,
  acceptingOrders = true,
  orderPauseMessage,
  onSyncCartItemPrice,
  onOrderSuccess,
  onUserUpdated,
}) => {
  const [address, setAddress] = useState<ShippingAddress>({
    fullName: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [saveAddress, setSaveAddress] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrders, setConfirmedOrders] = useState<MarketplaceOrder[] | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setConfirmedOrders(null);
      setIdempotencyKey('');
      return;
    }
    setIdempotencyKey(`chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    if (userProfile) {
      const def =
        userProfile.addresses?.find((a) => a.isDefault) || userProfile.addresses?.[0];
      if (def) {
        setAddress({
          fullName: def.fullName,
          phone: def.phone,
          street: def.street,
          city: def.city,
          state: def.state,
          pincode: def.pincode,
        });
      } else {
        setAddress((prev) => ({
          ...prev,
          fullName: prev.fullName || userProfile.name || '',
          phone: prev.phone || userProfile.phone || '',
        }));
      }
    }
  }, [isOpen, userProfile]);

  if (!isOpen) return null;

  const subtotal = items.reduce((s, i) => s + i.sellingPrice * i.quantity, 0);
  const groupKeys = new Set(
    items.map((i) => {
      const ot = i.storeProductId
        ? 'SELLER_DROPSHIP'
        : i.ownershipType === 'SELLER_OWNED' && i.sellerId !== 'tisahara_owner'
        ? 'SELLER_OWN_PRODUCT'
        : 'DIRECT_OWNER';
      return `${i.sellerId}__${ot}`;
    })
  );
  const deliveryFee = Array.from(groupKeys).reduce((feeSum, gk) => {
    const grpSub = items
      .filter((i) => {
        const ot = i.storeProductId
          ? 'SELLER_DROPSHIP'
          : i.ownershipType === 'SELLER_OWNED' && i.sellerId !== 'tisahara_owner'
          ? 'SELLER_OWN_PRODUCT'
          : 'DIRECT_OWNER';
        return `${i.sellerId}__${ot}` === gk;
      })
      .reduce((s, i) => s + i.sellingPrice * i.quantity, 0);
    return feeSum + (grpSub >= 499 ? 0 : 49);
  }, 0);
  const total = subtotal + deliveryFee;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptingOrders) {
      setError(
        orderPauseMessage ||
          'Marketplace order acceptance is currently paused by the Owner. Please try again later.'
      );
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const orders = await placeMarketplaceOrders({
        items,
        customerId: userProfile?.uid || null,
        shippingAddress: address,
        paymentMethod,
        idempotencyKey,
      });

      if (userProfile && saveAddress) {
        const nextAddresses = await saveAddressToProfile(userProfile, {
          label: 'Primary',
          ...address,
          isDefault: (userProfile.addresses?.length || 0) === 0,
        }).catch(() => userProfile.addresses);
        if (nextAddresses) onUserUpdated(nextAddresses);
      }

      setConfirmedOrders(orders);
      onOrderSuccess(orders);
    } catch (err) {
      if (err instanceof CheckoutValidationError) {
        if (err.issue.code === 'PRICE_CHANGED' && err.issue.newPrice !== undefined) {
          onSyncCartItemPrice(err.issue.productId, err.issue.newPrice);
        }
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <div className="bg-[#FFFFFF] rounded-2xl border border-purple-200 w-full max-w-3xl shadow-2xl overflow-hidden my-8">
        <div className="px-6 py-4 bg-[#FAF5FF] border-b border-purple-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              {confirmedOrders ? 'Order Confirmed' : 'Express Checkout'}
            </h2>
            <p className="text-xs text-slate-600">
              {confirmedOrders
                ? 'Thank you for shopping with TISAHARA'
                : userProfile
                ? `Checking out as ${userProfile.name}`
                : 'Guest Checkout enabled — no account required'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-purple-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {confirmedOrders ? (
          <div className="p-6 sm:p-8 space-y-6 bg-[#FFFFFF]">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {confirmedOrders.length > 1
                    ? `${confirmedOrders.length} Seller Orders Placed Successfully`
                    : `Order #${confirmedOrders[0].id} Confirmed — Pending Seller Confirmation`}
                </h3>
                <p className="text-xs text-slate-700 mt-1">
                  Payable via Cash on Delivery upon arrival. Live product stock has been reserved.
                </p>
              </div>
            </div>

            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              {confirmedOrders.map((ord) => (
                <div key={ord.id} className="border border-purple-100 rounded-xl p-4 space-y-2 bg-white">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono-num font-semibold text-slate-900">{ord.id}</span>
                    <span className="font-medium text-[#6B21A8]">
                      Seller: {ord.sellerStoreName} · {ord.status}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {ord.items.map((it) => (
                      <div key={it.productId} className="flex justify-between text-sm text-slate-800">
                        <span className="truncate pr-4">
                          {it.title} × {it.quantity}
                        </span>
                        <span className="font-mono-num font-semibold text-slate-900 shrink-0">
                          ₹{(it.sellingPrice * it.quantity).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-purple-50 flex justify-between text-sm font-bold text-slate-900">
                    <span>Total (incl. delivery ₹{ord.deliveryFee})</span>
                    <span className="font-mono-num">₹{ord.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-sm font-semibold cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 bg-[#FFFFFF]">
            {/* Left: Delivery Address & Payment */}
            <div className="lg:col-span-7 p-6 space-y-5 border-b lg:border-b-0 lg:border-r border-purple-100 bg-white">
              {!acceptingOrders && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    {orderPauseMessage ||
                      'Order acceptance is currently paused across the marketplace by the Owner.'}
                  </span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                  <span>{error}</span>
                </div>
              )}

              {userProfile && (userProfile.addresses?.length || 0) > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-800">Saved Addresses</span>
                  <div className="flex flex-wrap gap-2">
                    {userProfile.addresses?.map((saved) => (
                      <button
                        key={saved.id}
                        type="button"
                        onClick={() =>
                          setAddress({
                            fullName: saved.fullName,
                            phone: saved.phone,
                            street: saved.street,
                            city: saved.city,
                            state: saved.state,
                            pincode: saved.pincode,
                          })
                        }
                        className="text-left px-3 py-2 rounded-xl border border-purple-200 hover:border-[#7E22CE] hover:bg-[#FAF5FF] text-xs bg-white text-slate-900 cursor-pointer"
                      >
                        <div className="font-semibold">{saved.fullName}</div>
                        <div className="text-slate-600">
                          {saved.city}, {saved.pincode}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <MapPin className="w-4 h-4 text-[#7E22CE]" />
                  <span>Delivery Address</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={address.fullName}
                      onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                      placeholder="Recipient name"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      minLength={8}
                      maxLength={15}
                      value={address.phone}
                      onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                      placeholder="10-digit mobile number"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    House / Flat / Street Address
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    placeholder="House no., street, landmark"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      required
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      placeholder="Jaipur"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      required
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                      placeholder="Rajasthan"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">PIN Code</label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      maxLength={10}
                      value={address.pincode}
                      onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                      placeholder="302001"
                      className="w-full px-3 py-2 text-sm font-mono-num text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                </div>

                {userProfile && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                      className="rounded border-purple-300 accent-[#7E22CE]"
                    />
                    <span>Save this address to my profile</span>
                  </label>
                )}
              </div>

              {/* Payment Options */}
              <div className="space-y-2.5 pt-2">
                <span className="block text-sm font-bold text-slate-900">Payment Method</span>
                <label className="flex items-start gap-3 p-3.5 rounded-xl border-2 border-[#7E22CE] bg-[#FAF5FF] cursor-pointer">
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'COD'}
                    onChange={() => setPaymentMethod('COD')}
                    className="mt-1 accent-[#7E22CE]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Banknote className="w-4 h-4 text-[#7E22CE]" />
                      <span>Cash on Delivery (COD)</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Pay in cash or UPI to the courier partner when your order arrives.
                    </p>
                  </div>
                </label>

                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white opacity-75">
                  <CreditCard className="w-4 h-4 text-slate-600 mt-1 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      Online Payment (UPI / Cards / NetBanking)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {PAYMENT_ARCHITECTURE_STATUS.activeGatewayLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Order Summary */}
            <div className="lg:col-span-5 p-6 bg-[#FAF5FF] flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Order Summary ({items.length})
                </h3>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div key={item.productId} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-purple-100 shrink-0">
                        <SafeImage src={item.image} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-600">
                          Qty {item.quantity} · {item.sellerStoreName}
                        </p>
                      </div>
                      <span className="font-mono-num text-xs font-bold text-slate-900 shrink-0">
                        ₹{(item.sellingPrice * item.quantity).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5 text-sm border-t border-purple-200 pt-4">
                  <div className="flex justify-between text-slate-600">
                    <span>Items Subtotal</span>
                    <span className="font-mono-num text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Delivery ({groupKeys.size} {groupKeys.size === 1 ? 'shipment' : 'shipments'})</span>
                    <span className="font-mono-num font-medium text-[#059669]">
                      {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-purple-200 text-base font-bold text-slate-900">
                    <span>Amount Payable</span>
                    <span className="font-mono-num">₹{total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[11px] text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-[#7E22CE] shrink-0" />
                  <span>
                    Price and live inventory are atomically rechecked against Firestore before confirming.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting || items.length === 0 || !acceptingOrders}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  {!acceptingOrders
                    ? 'Orders Paused by Marketplace Owner'
                    : submitting
                    ? 'Verifying Stock & Placing Order...'
                    : `Confirm COD Order · ₹${total.toLocaleString('en-IN')}`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
