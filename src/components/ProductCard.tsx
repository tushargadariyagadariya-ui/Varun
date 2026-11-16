import React from 'react';
import { Heart, Share2, ShoppingCart, Star, Zap } from 'lucide-react';
import { Product } from '../types/marketplace';
import { isSampleTestingProduct } from '../services/marketplaceService';
import { SafeImage } from './SafeImage';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
  onOpenStore: (sellerId: string) => void;
  onShare: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
  onOpenProduct,
  onOpenStore,
  onShare,
}) => {
  const discountPct =
    product.mrp > product.sellingPrice
      ? Math.round(((product.mrp - product.sellingPrice) / product.mrp) * 100)
      : 0;
  const isOutOfStock = product.stock <= 0;

  return (
    <article className="group bg-white rounded-2xl border border-purple-100 overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-purple-300">
      {/* Large Product Image Area */}
      <div className="relative aspect-[4/5] sm:aspect-square bg-[#FAF5FF] overflow-hidden">
        <button
          type="button"
          onClick={() => onOpenProduct(product)}
          className="w-full h-full block text-left cursor-pointer focus-visible:outline-none"
          aria-label={`View ${product.title}`}
        >
          <SafeImage
            src={product.images[0]}
            alt={product.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>

        {/* Single Clean Discount / Stock Tag */}
        {discountPct > 0 && !isOutOfStock && (
          <span className="absolute top-2.5 left-2.5 bg-[#7E22CE] text-white text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md font-mono-num shadow-xs">
            {discountPct}% OFF
          </span>
        )}
        {isOutOfStock && (
          <span className="absolute top-2.5 left-2.5 bg-slate-900/85 text-white text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md">
            Out of Stock
          </span>
        )}

        {/* Quick Wishlist & Share Buttons */}
        <div className="absolute top-2 right-2 flex flex-col sm:flex-row items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist(product);
            }}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-xs border ${
              isWishlisted
                ? 'bg-[#F3E8FF] border-[#7E22CE] text-[#7E22CE]'
                : 'bg-white/95 border-purple-100 text-slate-700 hover:border-[#7E22CE] hover:text-[#7E22CE]'
            }`}
          >
            <Heart
              className={`w-4 h-4 ${
                isWishlisted ? 'fill-[#7E22CE] text-[#7E22CE]' : 'text-slate-700'
              }`}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShare(product);
            }}
            aria-label={`Share ${product.title}`}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 border border-purple-100 text-slate-700 hover:border-[#7E22CE] hover:text-[#7E22CE] flex items-center justify-center transition-colors cursor-pointer shadow-xs"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Product Details Body */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col bg-white">
        {/* Category & Storefront Attribution */}
        <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1 truncate">
          <span className="font-semibold text-[#6B21A8] uppercase tracking-wide shrink-0">
            {product.category}
          </span>
          <span aria-hidden="true">·</span>
          {product.sellerId === 'tisahara_owner' ? (
            <span className="text-slate-600 truncate">TISAHARA Direct</span>
          ) : (
            <button
              type="button"
              onClick={() => onOpenStore(product.sellerId)}
              className="text-slate-600 hover:text-[#6B21A8] hover:underline truncate cursor-pointer"
            >
              {product.sellerStoreName}
            </button>
          )}
        </div>

        {/* Product Title */}
        <button
          type="button"
          onClick={() => onOpenProduct(product)}
          className="text-left cursor-pointer focus-visible:outline-none"
        >
          {isSampleTestingProduct(product) && (
            <span className="inline-flex items-center mb-1 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-extrabold uppercase tracking-wide">
              SAMPLE – FOR TESTING
            </span>
          )}
          <h3 className="font-display text-xs sm:text-sm font-semibold text-slate-900 leading-snug line-clamp-2 min-h-[2.4em]">
            {product.title}
          </h3>
        </button>

        {/* Price, MRP & Discount */}
        <div className="mt-2 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
          <span className="font-mono-num text-base sm:text-lg font-extrabold text-slate-900">
            ₹{product.sellingPrice.toLocaleString('en-IN')}
          </span>
          {product.mrp > product.sellingPrice && (
            <span className="font-mono-num text-[11px] sm:text-xs text-slate-400 line-through">
              ₹{product.mrp.toLocaleString('en-IN')}
            </span>
          )}
          {discountPct > 0 && (
            <span className="text-[11px] font-bold text-[#059669]">
              {discountPct}% off
            </span>
          )}
        </div>

        {/* Rating & Delivery */}
        <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px]">
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FAF5FF] text-[#581C87] font-semibold">
            <Star className="w-3 h-3 text-[#7E22CE] fill-[#7E22CE]" />
            <span className="font-mono-num">
              {product.ratingCount > 0 ? product.ratingAvg.toFixed(1) : 'New'}
            </span>
            {product.ratingCount > 0 && (
              <span className="text-slate-500 font-normal">({product.ratingCount})</span>
            )}
          </div>
          <span className="text-slate-500 truncate">
            {product.sellingPrice >= 499 ? 'Free Delivery · 7d Return' : 'COD · 7d Return'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="mt-auto pt-3 grid grid-cols-1 min-[420px]:grid-cols-2 gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => onAddToCart(product)}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-purple-200 bg-white hover:bg-purple-50 disabled:opacity-45 disabled:cursor-not-allowed text-[#6B21A8] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer min-h-[38px]"
          >
            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
            <span>Add to Cart</span>
          </button>
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => onBuyNow(product)}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer min-h-[38px]"
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Buy Now</span>
          </button>
        </div>
      </div>
    </article>
  );
};
