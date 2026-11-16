import React from 'react';
import {
  Heart,
  Home,
  LayoutGrid,
  PackageCheck,
  ShoppingCart,
  Store,
  User,
} from 'lucide-react';
import { AppLanguage, AppView, UserProfile } from '../types/marketplace';
import { TRANSLATIONS } from '../services/futureArchitecture';

interface HeaderNavProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenCategories?: () => void;
  mobileCategoryFocused?: boolean;
  cartCount: number;
  wishlistCount: number;
  unreadNotifications: number;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  userProfile: UserProfile | null;
  language: AppLanguage;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeView,
  onNavigate,
  onOpenCategories,
  mobileCategoryFocused = false,
  cartCount,
  wishlistCount,
  unreadNotifications,
  onOpenCart,
  onOpenAuth,
  userProfile,
  language,
}) => {
  const t = TRANSLATIONS[language];

  const navLinkClass = (active: boolean) =>
    `relative text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1.5 cursor-pointer ${
      active
        ? 'text-[#6B21A8] font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-[#7E22CE]'
        : 'text-slate-700 hover:text-[#6B21A8]'
    }`;

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Professional TISAHARA Logo */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E22CE] rounded-lg"
            aria-label="TISAHARA Home"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7E22CE] via-[#9333EA] to-[#9F2089] flex items-center justify-center shadow-xs shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 7h12l1 12H5L6 7z" />
                <path d="M9 7a3 3 0 0 1 6 0" />
                <path d="M9.5 11.5h5M12 11.5v5" />
              </svg>
            </span>
            <span className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              TISAHARA
            </span>
          </button>

          {/* Zone 2: Concise Single-Line Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-7" aria-label="Primary">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={navLinkClass(
                activeView === 'home' || activeView === 'product' || activeView === 'store'
              )}
            >
              {t.navShop}
            </button>
            <button
              type="button"
              onClick={() => (onOpenCategories ? onOpenCategories() : onNavigate('home'))}
              className={navLinkClass(false)}
            >
              {t.navCategories}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className={navLinkClass(activeView === 'orders')}
            >
              {t.navOrders}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('seller')}
              className={navLinkClass(activeView === 'seller')}
            >
              Seller Hub
            </button>
          </nav>

          {/* Zone 3: Wishlist, Account & Cart Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">

            <button
              type="button"
              onClick={() => onNavigate('orders')}
              aria-label="My Orders"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 text-slate-800 cursor-pointer"
            >
              <PackageCheck className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('wishlist')}
              aria-label="Saved Wishlist"
              className={`relative inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
                activeView === 'wishlist'
                  ? 'border-[#7E22CE] bg-purple-50 text-[#6B21A8]'
                  : 'border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-200 text-slate-800'
              }`}
            >
              <Heart
                className={`w-4 h-4 ${
                  activeView === 'wishlist' ? 'fill-[#7E22CE] text-[#7E22CE]' : ''
                }`}
              />
              {wishlistCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7E22CE] text-white font-mono-num text-[10px] font-bold flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => (userProfile ? onNavigate('profile') : onOpenAuth())}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-200 text-slate-800 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <User className="w-4 h-4 text-[#6B21A8]" />
              <span>
                {userProfile
                  ? `${userProfile.name.split(' ')[0]}${unreadNotifications > 0 ? ` (${unreadNotifications})` : ''}`
                  : 'Sign In'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label="Open Cart"
              className="relative inline-flex items-center gap-2 px-3 sm:px-4 h-10 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E22CE] focus-visible:ring-offset-2"
            >
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Cart</span>
              <span className="font-mono-num text-xs bg-white text-[#6B21A8] font-bold px-1.5 py-0.5 rounded-md min-w-[20px] text-center">
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation: Home, Categories, Cart, Seller Hub, Profile */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-purple-100 grid grid-cols-5 items-center h-16 px-1 shadow-[0_-4px_16px_rgba(107,33,168,0.06)]"
        aria-label="Mobile Navigation"
      >
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] text-[10px] cursor-pointer transition-colors ${
            activeView === 'home' && !mobileCategoryFocused
              ? 'text-[#6B21A8] font-bold'
              : 'text-slate-600 font-medium'
          }`}
        >
          <Home
            className={`w-5 h-5 ${
              activeView === 'home' && !mobileCategoryFocused ? 'text-[#7E22CE]' : ''
            }`}
          />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => (onOpenCategories ? onOpenCategories() : onNavigate('home'))}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] text-[10px] cursor-pointer transition-colors ${
            mobileCategoryFocused && activeView === 'home'
              ? 'text-[#6B21A8] font-bold'
              : 'text-slate-600 font-medium'
          }`}
        >
          <LayoutGrid
            className={`w-5 h-5 ${
              mobileCategoryFocused && activeView === 'home' ? 'text-[#7E22CE]' : ''
            }`}
          />
          <span>Categories</span>
        </button>

        <button
          type="button"
          onClick={onOpenCart}
          className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] text-[10px] font-medium text-slate-600 hover:text-[#6B21A8] cursor-pointer transition-colors"
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#7E22CE] text-white font-mono-num text-[9px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span>Cart</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('seller')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] text-[10px] cursor-pointer transition-colors ${
            activeView === 'seller' ? 'text-[#6B21A8] font-bold' : 'text-slate-600 font-medium'
          }`}
        >
          <Store className={`w-5 h-5 ${activeView === 'seller' ? 'text-[#7E22CE]' : ''}`} />
          <span>Seller Hub</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] text-[10px] cursor-pointer transition-colors ${
            activeView === 'profile' ? 'text-[#6B21A8] font-bold' : 'text-slate-600 font-medium'
          }`}
        >
          <User className={`w-5 h-5 ${activeView === 'profile' ? 'text-[#7E22CE]' : ''}`} />
          <span>{userProfile ? 'Profile' : 'Account'}</span>
        </button>
      </nav>
    </>
  );
};
