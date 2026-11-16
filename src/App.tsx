import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Footprints,
  Heart,
  LayoutGrid,
  MapPin,
  Search,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  Truck,
  Watch,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType, testFirestoreConnection } from './firebase';
import {
  AppLanguage,
  AppNotification,
  AppView,
  CartItem,
  MarketplaceOrder,
  MarketplaceSettings,
  PRODUCT_CATEGORIES,
  PayoutRecord,
  PayoutTransactionRecord,
  Product,
  ProductCategory,
  ReturnRequest,
  SellerBankAccount,
  SellerEarningsRecord,
  SellerProfile,
  StoreProduct,
  UserProfile,
} from './types/marketplace';
import {
  ensureUserProfile,
  isFirebaseOwnerAdmin,
  loadCartFromFirestore,
  SAMPLE_OWNER_PRODUCTS,
  seedSampleOwnerProducts,
  syncCartToFirestore,
  toggleWishlistItem,
} from './services/marketplaceService';
import { TRANSLATIONS } from './services/futureArchitecture';
import { HeaderNav } from './components/HeaderNav';
import { ProductCard } from './components/ProductCard';
import { ProductDetailView } from './components/ProductDetailView';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthModal } from './components/AuthModal';
import { OrdersView } from './components/OrdersView';
import { CustomerProfileView } from './components/CustomerProfileView';
import { SellerStorefrontView } from './components/SellerStorefrontView';
import { SellerDashboardView } from './components/SellerDashboardView';
import { OwnerPanelView } from './components/OwnerPanelView';
import { SafeImage } from './components/SafeImage';

import heroBannerImg from './assets/images/tisahara_hero_banner_1794544833168.jpg';
import fashionImg from './assets/images/cat_fashion_kurta_1794544832888.jpg';
import electronicsImg from './assets/images/cat_electronics_audio_1794544833061.jpg';
import homeKitchenImg from './assets/images/cat_home_kitchen_1794544833199.jpg';
import beautyImg from './assets/images/cat_beauty_skincare_1794544834811.jpg';
import footwearImg from './assets/images/cat_footwear_accessories_1794544834697.jpg';

const CATEGORY_ICONS: Array<{
  category: 'ALL' | ProductCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  image?: string;
}> = [
  { category: 'ALL', label: 'All Deals', icon: LayoutGrid },
  { category: 'Fashion', label: 'Fashion', icon: Shirt, image: fashionImg },
  { category: 'Electronics', label: 'Electronics', icon: Smartphone, image: electronicsImg },
  { category: 'Home & Kitchen', label: 'Home & Kitchen', icon: ChefHat, image: homeKitchenImg },
  { category: 'Beauty', label: 'Beauty', icon: Sparkles, image: beautyImg },
  { category: 'Footwear', label: 'Footwear', icon: Footprints, image: footwearImg },
  { category: 'Accessories', label: 'Accessories', icon: Watch },
];

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'discount';
type OfferFilter = 'NONE' | 'UNDER_999' | 'DISCOUNT_30' | 'TOP_RATED';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Auth & Profile State
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(null);

  // Marketplace Catalog State (Real Firestore Data)
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [sellersMap, setSellersMap] = useState<Record<string, SellerProfile>>({});
  const [allStoreProducts, setAllStoreProducts] = useState<StoreProduct[]>([]);
  const [marketplaceSettings, setMarketplaceSettings] = useState<MarketplaceSettings | null>(null);

  // Orders & Notifications State
  const [customerOrders, setCustomerOrders] = useState<MarketplaceOrder[]>([]);
  const [guestOrders, setGuestOrders] = useState<MarketplaceOrder[]>(() => {
    try {
      const raw = localStorage.getItem('tisahara_guest_orders');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [sellerOrders, setSellerOrders] = useState<MarketplaceOrder[]>([]);
  const [customerReturns, setCustomerReturns] = useState<ReturnRequest[]>([]);
  const [sellerReturns, setSellerReturns] = useState<ReturnRequest[]>([]);
  const [sellerPayouts, setSellerPayouts] = useState<PayoutRecord[]>([]);
  const [sellerPayoutRequests, setSellerPayoutRequests] = useState<PayoutRecord[]>([]);
  const [sellerPayoutTransactions, setSellerPayoutTransactions] = useState<PayoutTransactionRecord[]>([]);
  const [sellerBankAccount, setSellerBankAccount] = useState<SellerBankAccount | null>(null);
  const [sellerEarnings, setSellerEarnings] = useState<SellerEarningsRecord | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const cartHydratedUidRef = useRef<string | null>(null);
  const sampleSeedAttemptedRef = useRef(false);

  // Cart & Wishlist State
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem('tisahara_cart');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [guestWishlist, setGuestWishlist] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('tisahara_guest_wishlist');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [firestoreWishlist, setFirestoreWishlist] = useState<string[]>([]);

  // Drawers & Modals
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([]);
  const [checkoutFromCart, setCheckoutFromCart] = useState(false);

  // Search, Filters & UI Preferences
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductCategory>('ALL');
  const [offerFilter, setOfferFilter] = useState<OfferFilter>('NONE');
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileCategoryFocused, setMobileCategoryFocused] = useState(false);
  const [showPromoBanner, setShowPromoBanner] = useState(true);
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem('tisahara_cart', JSON.stringify(cart));
    if (!userProfile || cartHydratedUidRef.current !== userProfile.uid) return;
    const timer = window.setTimeout(() => {
      syncCartToFirestore(userProfile.uid, cart).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [cart, userProfile]);

  useEffect(() => {
    localStorage.setItem('tisahara_guest_wishlist', JSON.stringify(guestWishlist));
  }, [guestWishlist]);

  // Parse shareable links (?product=, ?store=, ?ref=) on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get('product');
    const storeId = params.get('store');
    const refCode = params.get('ref');

    if (refCode) {
      setPendingReferralCode(refCode.toUpperCase());
    }
    if (prodId) {
      setSelectedProductId(prodId);
      setActiveView('product');
    } else if (storeId) {
      setSelectedStoreId(storeId);
      setActiveView('store');
    }
  }, []);

  // Boot Firestore connection check & Auth state listener
  useEffect(() => {
    testFirestoreConnection();

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUserProfile(null);
        setSellerProfile(null);
        setCustomerOrders([]);
        setSellerOrders([]);
        setCustomerReturns([]);
        setSellerReturns([]);
        setSellerPayouts([]);
        setSellerPayoutRequests([]);
        setSellerPayoutTransactions([]);
        setSellerBankAccount(null);
        setSellerEarnings(null);
        setFirestoreWishlist([]);
        setNotifications([]);
        cartHydratedUidRef.current = null;
        setAuthReady(true);
        return;
      }

      try {
        const profile = await ensureUserProfile(fbUser, undefined, pendingReferralCode);
        setUserProfile(profile);
        if (profile.preferredLanguage) {
          setLanguage(profile.preferredLanguage);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubAuth();
  }, [pendingReferralCode]);

  // Idempotently ensure the 8 SAMPLE – FOR TESTING Owner Catalogue products exist when Owner Admin signs in
  useEffect(() => {
    if (!authReady || productsLoading || sampleSeedAttemptedRef.current) return;
    if (!isFirebaseOwnerAdmin()) {
      return;
    }
    const sampleIds = new Set(SAMPLE_OWNER_PRODUCTS.map((s) => s.id));
    const existingCount = products.filter((p) => sampleIds.has(p.id)).length;
    sampleSeedAttemptedRef.current = true;
    if (existingCount >= SAMPLE_OWNER_PRODUCTS.length) return;
    seedSampleOwnerProducts()
      .then((res) => {
        if (res.createdCount > 0) {
          showToast(`Added ${res.createdCount} sample testing product(s) to Owner Catalogue.`);
        }
      })
      .catch(() => undefined);
  }, [authReady, productsLoading, products, userProfile]);

  // Sync guest wishlist into Firestore once authenticated & products loaded
  useEffect(() => {
    if (!userProfile || guestWishlist.length === 0 || products.length === 0) return;
    const validIds = new Set(products.map((p) => p.id));
    const toSync = guestWishlist.filter((id) => validIds.has(id) && !firestoreWishlist.includes(id));
    if (toSync.length > 0) {
      Promise.all(
        toSync.map((pid) => toggleWishlistItem(userProfile.uid, pid, false).catch(() => undefined))
      ).then(() => setGuestWishlist([]));
    } else {
      setGuestWishlist([]);
    }
  }, [userProfile, guestWishlist, products, firestoreWishlist]);

  // Public Catalog Listeners (products & sellers)
  useEffect(() => {
    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Product);
        setProducts(list);
        setProductsLoading(false);
      },
      (err) => {
        setProductsLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'products');
      }
    );

    const unsubSellers = onSnapshot(
      collection(db, 'sellers'),
      (snap) => {
        const map: Record<string, SellerProfile> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as SellerProfile;
        });
        setSellersMap(map);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'sellers');
      }
    );

    const unsubStoreProducts = onSnapshot(
      collection(db, 'storeProducts'),
      (snap) => {
        setAllStoreProducts(snap.docs.map((d) => d.data() as StoreProduct));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'storeProducts');
      }
    );

    const unsubMarketplaceSettings = onSnapshot(
      doc(db, 'settings', 'marketplace'),
      (snap) => {
        setMarketplaceSettings(
          snap.exists() ? (snap.data() as MarketplaceSettings) : { id: 'marketplace', acceptingOrders: true }
        );
      },
      () => {
        setMarketplaceSettings({ id: 'marketplace', acceptingOrders: true });
      }
    );

    return () => {
      unsubProducts();
      unsubSellers();
      unsubStoreProducts();
      unsubMarketplaceSettings();
    };
  }, []);

  // Authenticated User-Scoped Listeners
  useEffect(() => {
    if (!authReady || !userProfile) return;
    const uid = userProfile.uid;

    if (cartHydratedUidRef.current !== uid) {
      loadCartFromFirestore(uid)
        .then((remoteItems) => {
          if (remoteItems && remoteItems.length > 0) {
            setCart((prev) => {
              const merged = [...prev];
              for (const remote of remoteItems) {
                const exists = merged.some(
                  (local) =>
                    local.productId === remote.productId &&
                    (local.storeProductId || '') === (remote.storeProductId || '')
                );
                if (!exists) merged.push(remote);
              }
              return merged;
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          cartHydratedUidRef.current = uid;
        });
    }

    const unsubSellerDoc = onSnapshot(
      doc(db, 'sellers', uid),
      (snap) => {
        setSellerProfile(snap.exists() ? (snap.data() as SellerProfile) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `sellers/${uid}`)
    );

    const unsubCustomerOrders = onSnapshot(
      query(collection(db, 'orders'), where('customerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MarketplaceOrder)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setCustomerOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders?customerId')
    );

    const unsubSellerOrders = onSnapshot(
      query(collection(db, 'orders'), where('sellerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MarketplaceOrder)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setSellerOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders?sellerId')
    );

    const unsubCustomerReturns = onSnapshot(
      query(collection(db, 'returns'), where('customerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ReturnRequest)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setCustomerReturns(list);
      },
      () => setCustomerReturns([])
    );

    const unsubSellerReturns = onSnapshot(
      query(collection(db, 'returns'), where('sellerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ReturnRequest)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setSellerReturns(list);
      },
      () => setSellerReturns([])
    );

    const unsubSellerPayouts = onSnapshot(
      query(collection(db, 'payouts'), where('sellerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PayoutRecord)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setSellerPayouts(list);
      },
      () => setSellerPayouts([])
    );

    const unsubSellerPayoutRequests = onSnapshot(
      query(collection(db, 'payoutRequests'), where('sellerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PayoutRecord)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setSellerPayoutRequests(list);
      },
      () => setSellerPayoutRequests([])
    );

    const unsubSellerPayoutTransactions = onSnapshot(
      query(collection(db, 'payoutTransactions'), where('sellerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PayoutTransactionRecord)
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setSellerPayoutTransactions(list);
      },
      () => setSellerPayoutTransactions([])
    );

    const unsubSellerBankAccount = onSnapshot(
      doc(db, 'sellerBankAccounts', uid),
      (snap) => {
        setSellerBankAccount(snap.exists() ? (snap.data() as SellerBankAccount) : null);
      },
      () => setSellerBankAccount(null)
    );

    const unsubSellerEarnings = onSnapshot(
      doc(db, 'sellerEarnings', uid),
      (snap) => {
        setSellerEarnings(snap.exists() ? (snap.data() as SellerEarningsRecord) : null);
      },
      () => setSellerEarnings(null)
    );

    const unsubWishlist = onSnapshot(
      query(collection(db, 'wishlist'), where('userId', '==', uid)),
      (snap) => {
        setFirestoreWishlist(snap.docs.map((d) => (d.data() as { productId: string }).productId));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'wishlist')
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }))
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
            return tb - ta;
          });
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubSellerDoc();
      unsubCustomerOrders();
      unsubSellerOrders();
      unsubCustomerReturns();
      unsubSellerReturns();
      unsubSellerPayouts();
      unsubSellerPayoutRequests();
      unsubSellerPayoutTransactions();
      unsubSellerBankAccount();
      unsubSellerEarnings();
      unsubWishlist();
      unsubNotifs();
    };
  }, [authReady, userProfile]);

  const mergedSellerPayouts = useMemo(() => {
    const byId = new Map<string, PayoutRecord>();
    for (const p of sellerPayouts) {
      byId.set(p.id, p);
    }
    for (const p of sellerPayoutRequests) {
      byId.set(p.id, p);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return tb - ta;
    });
  }, [sellerPayouts, sellerPayoutRequests]);

  const wishlistSet = useMemo(() => {
    return new Set(userProfile ? firestoreWishlist : guestWishlist);
  }, [userProfile, firestoreWishlist, guestWishlist]);

  const activeProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (p.ownershipType === 'SELLER_OWNED' && p.sellerId !== 'tisahara_owner') {
        const seller = sellersMap[p.sellerId];
        if (
          seller &&
          (seller.isActive === false ||
            seller.storeStatus === 'Suspended' ||
            seller.storeStatus === 'Closed')
        ) {
          return false;
        }
      }
      return true;
    });
  }, [products, sellersMap]);

  const sellerOwnStoreProducts = useMemo(() => {
    if (!userProfile) return [];
    return allStoreProducts.filter((sp) => sp.sellerId === userProfile.uid);
  }, [allStoreProducts, userProfile]);

  const selectedStoreProducts = useMemo(() => {
    if (!selectedStoreId) return [];
    const seller = sellersMap[selectedStoreId];
    if (
      seller &&
      (seller.isActive === false ||
        seller.storeStatus === 'Suspended' ||
        seller.storeStatus === 'Closed')
    ) {
      return [];
    }

    const ownItems = activeProducts.filter(
      (p) => p.ownershipType === 'SELLER_OWNED' && p.sellerId === selectedStoreId
    );

    const centralById = new Map<string, Product>();
    for (const p of activeProducts) {
      if (p.ownershipType !== 'SELLER_OWNED' && p.availableForSellers !== false) {
        centralById.set(p.id, p);
      }
    }

    const dropshipItems = allStoreProducts
      .filter((sp) => sp.sellerId === selectedStoreId && sp.isActive)
      .map((sp) => {
        const central = centralById.get(sp.productId);
        if (!central) return null;
        return {
          ...central,
          sellerId: sp.sellerId,
          sellerStoreName: sp.sellerStoreName,
          basePrice: sp.basePrice,
          sellingPrice: sp.sellingPrice,
          sellerMargin: sp.sellerMargin,
          ownershipType: 'OWNER',
          storeProductId: sp.id,
        } as Product & { storeProductId?: string };
      })
      .filter((x): x is Product & { storeProductId?: string } => x !== null);

    return [...ownItems, ...dropshipItems];
  }, [allStoreProducts, activeProducts, selectedStoreId, sellersMap]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = activeProducts.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
      if (inStockOnly && p.stock <= 0) return false;
      if (offerFilter === 'UNDER_999' && p.sellingPrice > 999) return false;
      if (offerFilter === 'TOP_RATED' && p.ratingCount > 0 && p.ratingAvg < 4) return false;
      if (offerFilter === 'DISCOUNT_30') {
        const pct = p.mrp > 0 ? ((p.mrp - p.sellingPrice) / p.mrp) * 100 : 0;
        if (pct < 30) return false;
      }
      if (q) {
        const hay = `${p.title} ${p.description} ${p.category} ${p.sellerStoreName} ${(p.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price-asc') return a.sellingPrice - b.sellingPrice;
      if (sortBy === 'price-desc') return b.sellingPrice - a.sellingPrice;
      if (sortBy === 'rating') return b.ratingAvg - a.ratingAvg;
      if (sortBy === 'discount') {
        const da = a.mrp > 0 ? (a.mrp - a.sellingPrice) / a.mrp : 0;
        const dbPct = b.mrp > 0 ? (b.mrp - b.sellingPrice) / b.mrp : 0;
        return dbPct - da;
      }
      return 0;
    });
  }, [activeProducts, selectedCategory, inStockOnly, offerFilter, searchQuery, sortBy]);

  const activeProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const wishlistedProducts = useMemo(
    () => activeProducts.filter((p) => wishlistSet.has(p.id)),
    [activeProducts, wishlistSet]
  );

  const visibleOrders = userProfile ? customerOrders : guestOrders;
  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;
  const totalCartQty = cart.reduce((s, i) => s + i.quantity, 0);
  const t = TRANSLATIONS[language];

  const defaultAddress =
    userProfile?.addresses?.find((a) => a.isDefault) || userProfile?.addresses?.[0];
  const activeFilterCount =
    (sortBy !== 'featured' ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (offerFilter !== 'NONE' ? 1 : 0) +
    (selectedCategory !== 'ALL' ? 1 : 0);

  // Handlers
  const handleAddToCart = (
    product: Product & { storeProductId?: string },
    qty = 1
  ) => {
    const seller = sellersMap[product.sellerId];
    if (
      product.sellerId !== 'tisahara_owner' &&
      seller &&
      (seller.isActive === false ||
        seller.storeStatus === 'Suspended' ||
        seller.storeStatus === 'Closed')
    ) {
      showToast('This store is currently unavailable for orders.');
      return;
    }
    if (product.stock <= 0) {
      showToast('This item is currently out of stock.');
      return;
    }
    const itemOwnership = product.ownershipType || 'OWNER';
    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          i.productId === product.id &&
          (i.storeProductId || '') === (product.storeProductId || '')
      );
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + qty);
        return prev.map((i) =>
          i.productId === product.id &&
          (i.storeProductId || '') === (product.storeProductId || '')
            ? {
                ...i,
                quantity: nextQty,
                sellingPrice: product.sellingPrice,
                maxStock: product.stock,
                ownershipType: itemOwnership,
              }
            : i
        );
      }
      const newItem: CartItem = {
        productId: product.id,
        ...(product.storeProductId ? { storeProductId: product.storeProductId } : {}),
        ownershipType: itemOwnership,
        sellerId: product.sellerId,
        sellerStoreName: product.sellerStoreName,
        title: product.title,
        image: product.images[0] || '',
        category: product.category,
        basePrice: product.basePrice,
        sellingPrice: product.sellingPrice,
        mrp: product.mrp,
        sellerMargin: product.sellerMargin,
        quantity: Math.min(product.stock, qty),
        maxStock: product.stock,
      };
      return [...prev, newItem];
    });
    showToast(`Added "${product.title}" to cart.`);
  };

  const handleBuyNow = (
    product: Product & { storeProductId?: string },
    qty = 1
  ) => {
    const seller = sellersMap[product.sellerId];
    if (
      product.sellerId !== 'tisahara_owner' &&
      seller &&
      (seller.isActive === false ||
        seller.storeStatus === 'Suspended' ||
        seller.storeStatus === 'Closed')
    ) {
      showToast('This store is currently unavailable for orders.');
      return;
    }
    if (product.stock <= 0) {
      showToast('This item is currently out of stock.');
      return;
    }
    const directItem: CartItem = {
      productId: product.id,
      ...(product.storeProductId ? { storeProductId: product.storeProductId } : {}),
      ownershipType: product.ownershipType || 'OWNER',
      sellerId: product.sellerId,
      sellerStoreName: product.sellerStoreName,
      title: product.title,
      image: product.images[0] || '',
      category: product.category,
      basePrice: product.basePrice,
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
      sellerMargin: product.sellerMargin,
      quantity: Math.min(product.stock, qty),
      maxStock: product.stock,
    };
    setCheckoutItems([directItem]);
    setCheckoutFromCart(false);
    setCheckoutOpen(true);
  };

  const handleUpdateCartQty = (itemKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          const key = item.storeProductId || item.productId;
          if (key !== itemKey) return item;
          const next = item.quantity + delta;
          if (next <= 0) return null;
          return { ...item, quantity: Math.min(item.maxStock, next) };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const handleToggleWishlist = async (product: Product) => {
    const currentlySaved = wishlistSet.has(product.id);
    if (userProfile) {
      try {
        await toggleWishlistItem(userProfile.uid, product.id, currentlySaved);
        showToast(currentlySaved ? 'Removed from wishlist.' : 'Saved to wishlist.');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to update wishlist.');
      }
    } else {
      setGuestWishlist((prev) =>
        currentlySaved ? prev.filter((id) => id !== product.id) : [...prev, product.id]
      );
      showToast(currentlySaved ? 'Removed from wishlist.' : 'Saved to wishlist.');
    }
  };

  const handleShareProduct = async (product: Product) => {
    const shareUrl = `${window.location.origin}?product=${product.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${product.title} on TISAHARA`,
          text: `Check out ${product.title} for ₹${product.sellingPrice} on TISAHARA`,
          url: shareUrl,
        });
        return;
      }
    } catch {
      // Clipboard fallback
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Shareable product link copied to clipboard.');
    } catch {
      showToast(`Share link: ${shareUrl}`);
    }
  };

  const handleShareStore = async (sellerId: string, storeName: string) => {
    const shareUrl = `${window.location.origin}?store=${sellerId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast(`Shareable store link for ${storeName} copied.`);
    } catch {
      showToast(`Store link: ${shareUrl}`);
    }
  };

  const openProductPage = (product: Product) => {
    setSelectedProductId(product.id);
    setActiveView('product');
    setMobileCategoryFocused(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openStorePage = (sellerId: string) => {
    setSelectedStoreId(sellerId);
    setActiveView('store');
    setMobileCategoryFocused(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };



  const handleOpenCategories = () => {
    setActiveView('home');
    setMobileCategoryFocused(true);
    window.setTimeout(() => {
      document.getElementById('categories-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-slate-900 pb-16 md:pb-0">
      {/* Slim Dismissible Purple Announcement Strip */}
      {showPromoBanner && (
        <div className="bg-[#6B21A8] text-white text-xs h-9 px-4 flex items-center justify-center relative">
          <p className="truncate pr-6 font-medium text-white">{t.freeDeliveryNote}</p>
          <button
            type="button"
            onClick={() => setShowPromoBanner(false)}
            aria-label="Dismiss announcement"
            className="absolute right-3 p-1 text-white/90 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 3-Zone Header Navigation */}
      <HeaderNav
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          setMobileCategoryFocused(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenCategories={handleOpenCategories}
        mobileCategoryFocused={mobileCategoryFocused}
        cartCount={totalCartQty}
        wishlistCount={wishlistSet.size}
        unreadNotifications={unreadNotifCount}
        onOpenCart={() => setCartOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        userProfile={userProfile}
        language={language}
      />

      {/* Main Content Router */}
      <main className="flex-1">
        {activeView === 'home' && (
          <div className="space-y-6 sm:space-y-8 pb-16">
            {/* Delivery Location Strip + Large Search Bar & Filter Panel */}
            <div className="bg-white border-b border-purple-100">
              {/* Delivery Location Section */}
              <div className="bg-[#FAF5FF] border-b border-purple-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => (userProfile ? setActiveView('profile') : setAuthModalOpen(true))}
                    className="inline-flex items-center gap-2 text-xs text-slate-800 hover:text-[#6B21A8] truncate cursor-pointer text-left"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
                    <span className="truncate">
                      {defaultAddress ? (
                        <>
                          Deliver to{' '}
                          <strong className="font-semibold text-slate-900">
                            {defaultAddress.city} - {defaultAddress.pincode}
                          </strong>
                        </>
                      ) : (
                        <>
                          Delivering across India ·{' '}
                          <span className="font-semibold text-[#6B21A8]">Add delivery location</span>
                        </>
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
                  </button>

                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6B21A8] shrink-0">
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Cash on Delivery Across India</span>
                  </span>
                </div>
              </div>

              {/* Large Search Bar + Filter Button */}
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 space-y-3">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 sm:w-5 sm:h-5 text-[#7E22CE] absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.searchPlaceholder}
                      className="w-full pl-10 sm:pl-11 pr-10 py-3 text-sm bg-[#FAF5FF] text-slate-900 placeholder:text-slate-500 border border-purple-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE] focus:border-[#7E22CE] transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-purple-100 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-expanded={filtersOpen}
                    className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-3 rounded-2xl border text-xs sm:text-sm font-semibold transition-colors shrink-0 cursor-pointer ${
                      filtersOpen || activeFilterCount > 0
                        ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                        : 'bg-white border-purple-200 hover:bg-[#FAF5FF] text-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="hidden sm:inline">Filters</span>
                    {activeFilterCount > 0 && (
                      <span
                        className={`font-mono-num text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                          filtersOpen || activeFilterCount > 0
                            ? 'bg-white text-[#6B21A8]'
                            : 'bg-purple-100 text-[#6B21A8]'
                        }`}
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* Collapsible Filter & Sort Bar */}
                {filtersOpen && (
                  <div className="bg-[#FAF5FF] border border-purple-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        aria-label="Sort products"
                        className="px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE] cursor-pointer"
                      >
                        <option value="featured">Sort: Featured</option>
                        <option value="price-asc">Price: Low to High</option>
                        <option value="price-desc">Price: High to Low</option>
                        <option value="rating">Top Rated</option>
                        <option value="discount">Biggest Discount</option>
                      </select>

                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-200 bg-white text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inStockOnly}
                          onChange={(e) => setInStockOnly(e.target.checked)}
                          className="rounded border-purple-300 accent-[#7E22CE]"
                        />
                        <span>In Stock Only</span>
                      </label>

                      {(
                        [
                          { id: 'UNDER_999', label: 'Under ₹999' },
                          { id: 'DISCOUNT_30', label: '30%+ Off' },
                          { id: 'TOP_RATED', label: '4★+ Rated' },
                        ] as const
                      ).map((chip) => {
                        const active = offerFilter === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setOfferFilter(active ? 'NONE' : chip.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                                : 'bg-white border-purple-200 text-slate-700 hover:border-[#7E22CE]'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('ALL');
                          setOfferFilter('NONE');
                          setSortBy('featured');
                          setInStockOnly(false);
                        }}
                        className="text-xs font-semibold text-[#6B21A8] hover:underline cursor-pointer"
                      >
                        Reset all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Category Showcase Strip */}
            <section id="categories-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-white rounded-2xl border border-purple-100 p-3.5 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Shop by Category
                  </h2>
                  {selectedCategory !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      className="text-xs font-semibold text-[#7E22CE] hover:underline cursor-pointer"
                    >
                      View All
                    </button>
                  )}
                </div>

                <div className="flex sm:grid sm:grid-cols-7 gap-3 overflow-x-auto no-scrollbar pb-1">
                  {CATEGORY_ICONS.map((item) => {
                    const Icon = item.icon;
                    const active = selectedCategory === item.category;
                    return (
                      <button
                        key={item.category}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(item.category);
                          setMobileCategoryFocused(false);
                          document
                            .getElementById('marketplace-catalog')
                            ?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="flex flex-col items-center gap-2 p-2 rounded-2xl min-w-[74px] sm:min-w-0 transition-colors hover:bg-[#FAF5FF] cursor-pointer shrink-0"
                      >
                        <div
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden flex items-center justify-center transition-all border-2 ${
                            active
                              ? 'border-[#7E22CE] ring-4 ring-purple-100 bg-[#F3E8FF]'
                              : 'border-purple-100 bg-[#FAF5FF]'
                          }`}
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.label}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Icon
                              className={`w-6 h-6 ${
                                active ? 'text-[#7E22CE]' : 'text-[#6B21A8]'
                              }`}
                            />
                          )}
                        </div>
                        <span
                          className={`text-[11px] sm:text-xs text-center leading-tight ${
                            active ? 'font-bold text-[#6B21A8]' : 'font-medium text-slate-800'
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Promotional Hero Banner */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch bg-gradient-to-br from-white via-[#FAF5FF] to-[#F3E8FF] rounded-2xl border border-purple-200 overflow-hidden shadow-xs">
                <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-center space-y-5">
                  <span className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-[#F3E8FF] border border-purple-200 text-[11px] font-bold tracking-wide text-[#6B21A8] uppercase">
                    <Sparkles className="w-3.5 h-3.5 text-[#7E22CE]" />
                    <span>{t.heroTag}</span>
                  </span>
                  <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-slate-900 leading-[1.15] text-balance">
                    {t.heroTitle}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                    {t.heroSubtitle}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <a
                      href="#marketplace-catalog"
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-sm font-semibold transition-colors shadow-xs"
                    >
                      <span>{t.exploreCatalog}</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveView('seller')}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] text-[#6B21A8] text-sm font-semibold transition-colors cursor-pointer"
                    >
                      <Store className="w-4 h-4 text-[#7E22CE]" />
                      <span>{t.startSelling}</span>
                    </button>
                  </div>

                  {/* Clean Trust Strip */}
                  <div className="pt-4 border-t border-purple-200/70 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-[#7E22CE]" />
                      <span>Free Delivery ₹499+</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-[#7E22CE]" />
                      <span>Cash on Delivery</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#7E22CE]" />
                      <span>0% Seller Commission</span>
                    </span>
                  </div>
                </div>

                <div className="lg:col-span-6 relative min-h-[220px] lg:min-h-[380px]">
                  <SafeImage
                    src={heroBannerImg}
                    alt="TISAHARA marketplace featured products"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </section>

            {/* Quick Offer Deal Cards */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {[
                  {
                    id: 'UNDER_999' as const,
                    title: 'Budget Picks Under ₹999',
                    sub: 'Everyday fashion, beauty & home',
                  },
                  {
                    id: 'DISCOUNT_30' as const,
                    title: 'Mega Savings 30%+ Off',
                    sub: 'Direct wholesale-style pricing',
                  },
                  {
                    id: 'TOP_RATED' as const,
                    title: 'Top Rated 4★+ Products',
                    sub: 'Loved by Indian shoppers',
                  },
                ].map((offer) => {
                  const isActive = offerFilter === offer.id;
                  return (
                    <button
                      key={offer.id}
                      type="button"
                      onClick={() => {
                        setOfferFilter(isActive ? 'NONE' : offer.id);
                        document
                          .getElementById('marketplace-catalog')
                          ?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-[#F3E8FF] border-[#7E22CE] shadow-xs'
                          : 'bg-white border-purple-100 hover:border-purple-300 hover:bg-[#FAF5FF]'
                      }`}
                    >
                      <div>
                        <div
                          className={`font-display text-sm font-bold ${
                            isActive ? 'text-[#581C87]' : 'text-slate-900'
                          }`}
                        >
                          {offer.title}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{offer.sub}</div>
                      </div>
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-[#7E22CE] text-white' : 'bg-[#FAF5FF] text-[#7E22CE]'
                        }`}
                      >
                        <Tag className="w-4 h-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Live Marketplace Product Grid */}
            <section
              id="marketplace-catalog"
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                    Products For You
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Showing {filteredProducts.length} of {activeProducts.length} live products
                    {selectedCategory !== 'ALL' ? ` in ${selectedCategory}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-200 bg-white">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#7E22CE]" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label="Sort products"
                      className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="featured">Sort: Featured</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                      <option value="rating">Top Rated</option>
                      <option value="discount">Biggest Discount</option>
                    </select>
                  </div>

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-200 bg-white text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="rounded border-purple-300 accent-[#7E22CE]"
                    />
                    <span>In Stock Only</span>
                  </label>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setOfferFilter('NONE');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                    selectedCategory === 'ALL' && offerFilter === 'NONE'
                      ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                      : 'bg-white border-purple-200 text-slate-700 hover:bg-[#FAF5FF]'
                  }`}
                >
                  All ({activeProducts.length})
                </button>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                      selectedCategory === cat
                        ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                        : 'bg-white border-purple-200 text-slate-700 hover:bg-[#FAF5FF]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Product Grid States (2 columns on mobile, 3 on md, 4 on lg) */}
              {productsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="h-72 sm:h-80 rounded-2xl bg-[#FAF5FF] border border-purple-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white rounded-2xl border border-purple-100 p-8 sm:p-14 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center mx-auto">
                    <Store className="w-6 h-6" />
                  </div>
                  {activeProducts.length === 0 ? (
                    <>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        TISAHARA Marketplace Catalog is Empty
                      </h3>
                      <p className="text-sm text-slate-600 max-w-lg mx-auto">
                        Browse seller stores or visit Seller Hub to list products in your store.
                      </p>
                      <div className="flex flex-wrap justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveView('seller')}
                          className="px-5 py-2.5 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] text-[#6B21A8] text-xs font-semibold cursor-pointer"
                        >
                          Open Seller Hub
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        No products match your filters
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategory('ALL');
                          setOfferFilter('NONE');
                          setInStockOnly(false);
                          setSortBy('featured');
                        }}
                        className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
                      >
                        Reset All Filters
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isWishlisted={wishlistSet.has(product.id)}
                      onToggleWishlist={handleToggleWishlist}
                      onAddToCart={(p) => handleAddToCart(p, 1)}
                      onBuyNow={(p) => handleBuyNow(p, 1)}
                      onOpenProduct={openProductPage}
                      onOpenStore={openStorePage}
                      onShare={handleShareProduct}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeView === 'product' && activeProduct && (
          <ProductDetailView
            product={activeProduct}
            allProducts={activeProducts}
            userProfile={userProfile}
            wishlistIds={wishlistSet}
            onBack={() => setActiveView('home')}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onToggleWishlist={handleToggleWishlist}
            onOpenStore={openStorePage}
            onOpenProduct={openProductPage}
            onShareProduct={handleShareProduct}
            onOpenAuth={() => setAuthModalOpen(true)}
            onNotify={showToast}
          />
        )}

        {activeView === 'product' && !activeProduct && (
          <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
            <h2 className="font-display text-xl font-bold text-slate-900">Product Not Found</h2>
            <p className="text-sm text-slate-600">
              This product may have been removed or is still loading from Firestore.
            </p>
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
            >
              Return to Shop
            </button>
          </div>
        )}

        {activeView === 'store' && selectedStoreId && (
          <SellerStorefrontView
            seller={sellersMap[selectedStoreId] || null}
            sellerId={selectedStoreId}
            products={selectedStoreProducts}
            wishlistIds={wishlistSet}
            onBack={() => setActiveView('home')}
            onShareStore={handleShareStore}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={(p) => handleAddToCart(p, 1)}
            onBuyNow={(p) => handleBuyNow(p, 1)}
            onOpenProduct={openProductPage}
            onShareProduct={handleShareProduct}
          />
        )}

        {activeView === 'wishlist' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">Saved Wishlist</h1>
              <p className="text-sm text-slate-600 mt-0.5">
                {userProfile
                  ? 'Synced across devices with your TISAHARA account'
                  : 'Saved locally on this browser — sign in to sync'}
              </p>
            </div>
            {wishlistedProducts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-purple-100 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center mx-auto">
                  <Heart className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-900">No items saved yet</p>
                <button
                  type="button"
                  onClick={() => setActiveView('home')}
                  className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
                >
                  Browse Marketplace
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {wishlistedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isWishlisted={true}
                    onToggleWishlist={handleToggleWishlist}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onBuyNow={(p) => handleBuyNow(p, 1)}
                    onOpenProduct={openProductPage}
                    onOpenStore={openStorePage}
                    onShare={handleShareProduct}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'orders' && (
          <OrdersView
            orders={visibleOrders}
            returns={customerReturns}
            customerId={userProfile?.uid || null}
            isSignedIn={Boolean(userProfile)}
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenStore={openStorePage}
            onNotify={showToast}
          />
        )}

        {activeView === 'profile' && (
          <CustomerProfileView
            userProfile={userProfile}
            notifications={notifications}
            language={language}
            onChangeLanguage={setLanguage}
            onProfileUpdated={setUserProfile}
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenOwnerPanel={() => {
              setActiveView('owner');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNotify={showToast}
            onLoggedOut={() => {
              setUserProfile(null);
              setSellerProfile(null);
              setActiveView('home');
            }}
          />
        )}

        {activeView === 'seller' && (
          <SellerDashboardView
            userProfile={userProfile}
            sellerProfile={sellerProfile}
            centralProducts={products}
            storeProducts={sellerOwnStoreProducts}
            sellerOrders={sellerOrders}
            sellerReturns={sellerReturns}
            sellerPayouts={mergedSellerPayouts}
            sellerBankAccount={sellerBankAccount}
            sellerEarnings={sellerEarnings}
            sellerPayoutTransactions={sellerPayoutTransactions}
            minPayoutAmount={marketplaceSettings?.minPayoutAmount ?? 100}
            onOpenAuth={() => setAuthModalOpen(true)}
            onSellerUpdated={setSellerProfile}
            onOpenStorefront={openStorePage}
            onShareStore={handleShareStore}
            onNotify={showToast}
          />
        )}

        {activeView === 'owner' && (
          <OwnerPanelView
            userProfile={userProfile}
            products={products}
            sellers={Object.values(sellersMap)}
            storeProducts={allStoreProducts}
            marketplaceSettings={marketplaceSettings}
            onBackToApp={() => setActiveView('profile')}
            onOpenStorefront={openStorePage}
            onNotify={showToast}
          />
        )}
      </main>

      {/* Clean White & Lavender Footer */}
      <footer className="bg-[#FAF5FF] border-t border-purple-100 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span className="font-display font-extrabold text-[#6B21A8]">TISAHARA</span>
            <span aria-hidden="true">·</span>
            <span>Indian Multi-Vendor Marketplace</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="text-slate-700 hover:text-[#6B21A8] font-medium cursor-pointer"
            >
              Shop
            </button>
            <button
              type="button"
              onClick={() => setActiveView('seller')}
              className="text-slate-700 hover:text-[#6B21A8] font-medium cursor-pointer"
            >
              Seller Hub
            </button>
            <button
              type="button"
              onClick={() => setActiveView('orders')}
              className="text-slate-700 hover:text-[#6B21A8] font-medium cursor-pointer"
            >
              Track Orders
            </button>
            <button
              type="button"
              onClick={() => setLanguage((l) => (l === 'en' ? 'hi' : 'en'))}
              className="font-semibold text-[#6B21A8] hover:underline cursor-pointer"
            >
              {language === 'en' ? 'हिन्दी' : 'English'}
            </button>
          </div>
        </div>
      </footer>

      {/* Slide-Over Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        acceptingOrders={marketplaceSettings?.acceptingOrders !== false}
        orderPauseMessage={marketplaceSettings?.pauseMessage}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={(itemKey) =>
          setCart((prev) => prev.filter((i) => (i.storeProductId || i.productId) !== itemKey))
        }
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutItems(cart);
          setCheckoutFromCart(true);
          setCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        items={checkoutItems}
        userProfile={userProfile}
        acceptingOrders={marketplaceSettings?.acceptingOrders !== false}
        orderPauseMessage={marketplaceSettings?.pauseMessage}
        onSyncCartItemPrice={(productId, newPrice) => {
          setCart((prev) =>
            prev.map((i) =>
              i.productId === productId ? { ...i, sellingPrice: newPrice } : i
            )
          );
          setCheckoutItems((prev) =>
            prev.map((i) =>
              i.productId === productId ? { ...i, sellingPrice: newPrice } : i
            )
          );
        }}
        onOrderSuccess={(orders) => {
          if (checkoutFromCart) {
            setCart([]);
          }
          if (!userProfile) {
            setGuestOrders((prev) => [...orders, ...prev]);
          }
        }}
        onUserUpdated={(addresses) => {
          if (userProfile) {
            setUserProfile({ ...userProfile, addresses });
          }
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        pendingReferralCode={pendingReferralCode}
        onSuccessMessage={showToast}
      />

      {/* Non-blocking Feedback Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm bg-white border-2 border-[#7E22CE] text-slate-900 px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2.5 text-xs font-semibold"
        >
          <CheckCircle2 className="w-4 h-4 text-[#7E22CE] shrink-0" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
