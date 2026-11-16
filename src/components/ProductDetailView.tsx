import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Zap,
} from 'lucide-react';
import { Product, ProductReview, UserProfile } from '../types/marketplace';
import { getRecommendedProducts } from '../services/futureArchitecture';
import {
  getProductReviews,
  isSampleTestingProduct,
  submitProductReview,
} from '../services/marketplaceService';
import { SafeImage } from './SafeImage';
import { ProductCard } from './ProductCard';

interface ProductDetailViewProps {
  product: Product;
  allProducts: Product[];
  userProfile: UserProfile | null;
  wishlistIds: Set<string>;
  onBack: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
  onToggleWishlist: (product: Product) => void;
  onOpenStore: (sellerId: string) => void;
  onOpenProduct: (product: Product) => void;
  onShareProduct: (product: Product) => void;
  onOpenAuth: () => void;
  onNotify: (msg: string) => void;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  allProducts,
  userProfile,
  wishlistIds,
  onBack,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
  onOpenStore,
  onOpenProduct,
  onShareProduct,
  onOpenAuth,
  onNotify,
}) => {
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    setActiveImgIdx(0);
    setQty(1);
    setLoadingReviews(true);
    getProductReviews(product.id)
      .then((list) => setReviews(list))
      .catch(() => setReviews([]))
      .finally(() => setLoadingReviews(false));
  }, [product.id]);

  const isWishlisted = wishlistIds.has(product.id);
  const isOutOfStock = product.stock <= 0;
  const discountPct =
    product.mrp > product.sellingPrice
      ? Math.round(((product.mrp - product.sellingPrice) / product.mrp) * 100)
      : 0;
  const recommendations = getRecommendedProducts(product, allProducts, 4);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) {
      onOpenAuth();
      return;
    }
    if (commentInput.trim().length < 2) return;
    setSubmittingReview(true);
    try {
      await submitProductReview(
        product.id,
        { uid: userProfile.uid, name: userProfile.name },
        ratingInput,
        commentInput.trim()
      );
      setCommentInput('');
      setRatingInput(5);
      const refreshed = await getProductReviews(product.id);
      setReviews(refreshed);
      onNotify('Thank you! Your review has been published.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10 bg-[#FFFFFF]">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#6B21A8] hover:underline cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Marketplace</span>
      </button>

      {/* Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left: Product Gallery */}
        <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-24">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-[#FAF5FF] border border-purple-100">
            <SafeImage
              src={product.images[activeImgIdx] || product.images[0]}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {product.images.map((imgUrl, idx) => (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => setActiveImgIdx(idx)}
                  className={`w-20 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                    activeImgIdx === idx ? 'border-[#7E22CE]' : 'border-purple-100'
                  }`}
                >
                  <SafeImage src={imgUrl} alt={`${product.title} ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Contiguous Purchase Panel */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-purple-100 p-6 sm:p-8 space-y-6 shadow-xs">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#F3E8FF] text-[#6B21A8] font-semibold">
                {product.category}
              </span>
              <span aria-hidden="true">·</span>
              {product.sellerId === 'tisahara_owner' ? (
                <span className="inline-flex items-center gap-1 text-[#6B21A8] font-semibold">
                  <Store className="w-3.5 h-3.5" />
                  <span>Sold directly by TISAHARA Central</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenStore(product.sellerId)}
                  className="inline-flex items-center gap-1 text-[#6B21A8] font-semibold hover:underline cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Sold by {product.sellerStoreName}</span>
                </button>
              )}
              {isSampleTestingProduct(product) && (
                <span className="px-2.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-extrabold uppercase tracking-wide">
                  SAMPLE – FOR TESTING
                </span>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 leading-tight text-balance">
              {product.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF5FF] border border-purple-100">
                <Star className="w-4 h-4 text-[#7E22CE] fill-[#7E22CE]" />
                <span className="font-mono-num font-bold text-[#581C87]">
                  {product.ratingCount > 0 ? product.ratingAvg.toFixed(1) : 'New'}
                </span>
                <span className="text-slate-600 text-xs">
                  ({product.ratingCount} {product.ratingCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>
              <span className="font-semibold text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                {isOutOfStock ? 'Out of Stock' : `${product.stock} in stock`}
              </span>
            </div>
          </div>

          <div className="py-4 border-y border-purple-100 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono-num text-3xl font-extrabold text-slate-900">
                ₹{product.sellingPrice.toLocaleString('en-IN')}
              </span>
              {product.mrp > product.sellingPrice && (
                <>
                  <span className="font-mono-num text-base text-slate-400 line-through">
                    ₹{product.mrp.toLocaleString('en-IN')}
                  </span>
                  <span className="font-mono-num text-sm font-bold text-[#059669]">
                    {discountPct}% off (Save ₹{(product.mrp - product.sellingPrice).toLocaleString('en-IN')})
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-600">
              {product.sellingPrice >= 499 ? 'Free Delivery' : 'Fast Delivery'} · Cash on Delivery · 7-Day Easy Return Policy
            </p>
          </div>

          <p className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>

          {/* Quantity Selector */}
          {!isOutOfStock && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-900">Quantity</span>
              <div className="inline-flex items-center border border-purple-200 rounded-xl bg-white">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="p-2 text-slate-800 hover:bg-[#FAF5FF] rounded-l-xl cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-mono-num w-10 text-center text-sm font-semibold text-slate-900">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                  aria-label="Increase quantity"
                  className="p-2 text-slate-800 hover:bg-[#FAF5FF] rounded-r-xl cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Primary Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => onAddToCart(product, qty)}
              className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] disabled:opacity-45 text-[#6B21A8] text-sm font-semibold transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Add to Cart</span>
            </button>
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => onBuyNow(product, qty)}
              className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-45 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Zap className="w-4 h-4" />
              <span>Buy Now</span>
            </button>
          </div>

          <div className="flex items-center gap-5 pt-1">
            <button
              type="button"
              onClick={() => onToggleWishlist(product)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B21A8] hover:underline cursor-pointer"
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-[#7E22CE] text-[#7E22CE]' : 'text-[#7E22CE]'}`} />
              <span>{isWishlisted ? 'Saved in Wishlist' : 'Wishlist'}</span>
            </button>
            <button
              type="button"
              onClick={() => onShareProduct(product)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B21A8] hover:underline cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Product</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-purple-100 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#7E22CE] shrink-0" />
              <span>Free delivery above ₹499</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#7E22CE] shrink-0" />
              <span>Live stock &amp; price verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Reviews Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 border-t border-purple-100">
        <div className="lg:col-span-5 space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Product Ratings &amp; Reviews</h2>
            <p className="text-sm text-slate-600 mt-1">
              Verified feedback from TISAHARA shoppers
            </p>
          </div>

          <form
            onSubmit={handleSubmitReview}
            className="bg-white rounded-2xl border border-purple-100 p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">Write a Review</h3>
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">Your Rating</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingInput(star)}
                    className="p-1 cursor-pointer"
                    aria-label={`Rate ${star} stars`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= ratingInput
                          ? 'text-[#7E22CE] fill-[#7E22CE]'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Review Comment
              </label>
              <textarea
                rows={3}
                required
                minLength={2}
                maxLength={1000}
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Share quality, fit, delivery speed, or packaging thoughts..."
                className="w-full px-3 py-2 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
              />
            </div>
            <button
              type="submit"
              disabled={submittingReview}
              className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {userProfile
                ? submittingReview
                  ? 'Publishing...'
                  : 'Submit Review'
                : 'Sign In to Review'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {loadingReviews ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-[#FAF5FF] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="bg-white rounded-2xl border border-purple-100 p-8 text-center text-sm text-slate-600">
              No reviews yet for this product. Be the first shopper to review it!
            </div>
          ) : (
            reviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-white rounded-2xl border border-purple-100 p-5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{rev.userName}</span>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`w-3.5 h-3.5 ${
                          idx < rev.rating ? 'text-[#7E22CE] fill-[#7E22CE]' : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recommended Products */}
      {recommendations.length > 0 && (
        <section className="pt-6 border-t border-purple-100 space-y-6">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Products For You
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {recommendations.map((rec) => (
              <ProductCard
                key={rec.id}
                product={rec}
                isWishlisted={wishlistIds.has(rec.id)}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={(p) => onAddToCart(p, 1)}
                onBuyNow={(p) => onBuyNow(p, 1)}
                onOpenProduct={onOpenProduct}
                onOpenStore={onOpenStore}
                onShare={onShareProduct}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
