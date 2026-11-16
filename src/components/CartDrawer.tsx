import React from 'react';
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { CartItem } from '../types/marketplace';
import { SafeImage } from './SafeImage';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  acceptingOrders?: boolean;
  orderPauseMessage?: string;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  acceptingOrders = true,
  orderPauseMessage,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const deliveryFee = subtotal >= 499 || subtotal === 0 ? 0 : 49;
  const total = subtotal + deliveryFee;
  const freeDeliveryRemaining = Math.max(0, 499 - subtotal);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs">
      <div
        className="bg-[#FFFFFF] w-full max-w-md h-full flex flex-col shadow-2xl border-l border-purple-100"
        role="dialog"
        aria-modal="true"
        aria-label="Shopping Cart"
      >
        <div className="px-6 py-4 border-b border-purple-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Shopping Cart ({items.reduce((s, i) => s + i.quantity, 0)})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shopping cart"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-[#FAF5FF] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {items.length > 0 && (
          <div className="px-6 py-2.5 bg-[#FAF5FF] border-b border-purple-100 text-xs text-[#581C87]">
            {freeDeliveryRemaining === 0 ? (
              <span className="font-semibold">
                Free Delivery unlocked on this order.
              </span>
            ) : (
              <span>
                Add <strong className="font-mono-num">₹{freeDeliveryRemaining}</strong> more for Free Delivery.
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FFFFFF]">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Your cart is empty</p>
              <p className="text-xs text-slate-600 max-w-xs">
                Browse affordable deals from Indian sellers and tap Add to Cart or Buy Now.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            items.map((item) => {
              const itemKey = item.storeProductId || item.productId;
              return (
              <div
                key={itemKey}
                className="flex gap-3.5 pb-4 border-b border-purple-50 last:border-b-0"
              >
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#FAF5FF] shrink-0 border border-purple-100">
                  <SafeImage src={item.image} alt={item.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[#6B21A8] truncate">{item.sellerStoreName}</p>
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
                    {item.title}
                  </h3>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-mono-num text-sm font-bold text-slate-900">
                      ₹{(item.sellingPrice * item.quantity).toLocaleString('en-IN')}
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-500">
                      (₹{item.sellingPrice} each)
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="inline-flex items-center border border-purple-200 rounded-lg bg-white">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(itemKey, -1)}
                        aria-label="Decrease quantity"
                        className="p-1.5 text-slate-700 hover:bg-[#FAF5FF] cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono-num w-7 text-center text-xs font-semibold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= item.maxStock}
                        onClick={() => onUpdateQty(itemKey, 1)}
                        aria-label="Increase quantity"
                        className="p-1.5 text-slate-700 hover:bg-[#FAF5FF] disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(itemKey)}
                      aria-label={`Remove ${item.title}`}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-purple-100 bg-[#FAF5FF] space-y-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono-num font-medium text-slate-900">
                  ₹{subtotal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery</span>
                <span className="font-mono-num font-medium text-[#059669]">
                  {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-purple-200 text-base font-bold text-slate-900">
                <span>Total</span>
                <span className="font-mono-num">₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>
            {!acceptingOrders && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
                {orderPauseMessage ||
                  'Order acceptance is currently paused by the marketplace Owner. Please check back shortly.'}
              </div>
            )}
            <button
              type="button"
              disabled={!acceptingOrders}
              onClick={onCheckout}
              className="w-full py-3.5 px-4 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              {acceptingOrders ? 'Proceed to Checkout (COD)' : 'Checkout Temporarily Paused'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
