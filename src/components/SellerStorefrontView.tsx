import React from 'react';
import { AlertTriangle, ArrowLeft, MapPin, Share2, ShieldCheck, Store } from 'lucide-react';
import { Product, SellerProfile } from '../types/marketplace';
import { ProductCard } from './ProductCard';

interface SellerStorefrontViewProps {
  seller: SellerProfile | null;
  sellerId: string;
  products: Product[];
  wishlistIds: Set<string>;
  onBack: () => void;
  onShareStore: (sellerId: string, storeName: string) => void;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
  onShareProduct: (product: Product) => void;
}

export const SellerStorefrontView: React.FC<SellerStorefrontViewProps> = ({
  seller,
  sellerId,
  products,
  wishlistIds,
  onBack,
  onShareStore,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
  onOpenProduct,
  onShareProduct,
}) => {
  const storeName = seller?.storeName || products[0]?.sellerStoreName || 'TISAHARA Seller Store';
  const isSuspendedOrClosed =
    seller?.isActive === false ||
    seller?.storeStatus === 'Suspended' ||
    seller?.storeStatus === 'Closed';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 bg-[#FFFFFF]">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#6B21A8] hover:underline cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Marketplace</span>
      </button>

      {/* Storefront Banner */}
      <div className="bg-gradient-to-br from-[#FAF5FF] via-white to-[#F3E8FF] rounded-2xl border border-purple-200 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#6B21A8]">
              <Store className="w-4 h-4 text-[#7E22CE]" />
              <span>TISAHARA Seller Storefront</span>
            </span>
            {seller?.isVerified && !isSuspendedOrClosed && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#059669] font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Verified Seller
                </span>
              </>
            )}
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            {storeName}
          </h1>

          {seller && (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#7E22CE]" />
                {seller.city}, {seller.state}
              </span>
              <span aria-hidden="true">·</span>
              <span>Owner: {seller.ownerName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num font-semibold text-[#6B21A8]">
                {seller.totalSales} Completed Orders
              </span>
            </div>
          )}

          {seller?.description && (
            <p className="text-sm text-slate-700 max-w-2xl leading-relaxed pt-1">
              {seller.description}
            </p>
          )}
        </div>

        {!isSuspendedOrClosed && (
          <button
            type="button"
            onClick={() => onShareStore(sellerId, storeName)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Store Link</span>
          </button>
        )}
      </div>

      {/* Storefront Catalog or Unavailable Notice */}
      {isSuspendedOrClosed ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-amber-700 mx-auto" />
          <h2 className="font-display text-lg font-bold text-amber-950">
            Store Currently {seller?.storeStatus || 'Unavailable'}
          </h2>
          <p className="text-xs sm:text-sm text-amber-900 max-w-md mx-auto">
            This storefront is not accepting new orders right now. Existing customer orders and 7-day return protections remain active in My Orders.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Store Catalog ({products.length})
          </h2>

          {products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-purple-100 p-10 text-center text-sm text-slate-600">
              This store has not published active products yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isWishlisted={wishlistIds.has(product.id)}
                  onToggleWishlist={onToggleWishlist}
                  onAddToCart={onAddToCart}
                  onBuyNow={onBuyNow}
                  onOpenProduct={onOpenProduct}
                  onOpenStore={() => undefined}
                  onShare={onShareProduct}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
