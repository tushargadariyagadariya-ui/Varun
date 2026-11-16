import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeIndianRupee,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  IndianRupee,
  Landmark,
  Lock,
  Package,
  Plus,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  MarketplaceOrder,
  OrderStatus,
  PRODUCT_CATEGORIES,
  PayoutProviderStatus,
  PayoutRecord,
  PayoutTransactionRecord,
  Product,
  ProductCategory,
  ReturnRequest,
  SellerBankAccount,
  SellerEarningsRecord,
  SellerFinancialSummary,
  SellerProfile,
  StoreProduct,
  UserProfile,
} from '../types/marketplace';
import {
  calculateSellerFinancialsOnServer,
  DEFAULT_MIN_PAYOUT_AMOUNT,
  deleteSellerOwnProduct,
  fetchPayoutProviderStatus,
  getOrderSellerPayable,
  getOrderTisaharaFee,
  inferOrderType,
  isSampleTestingProduct,
  OPEN_PAYOUT_STATUS_SET,
  processReturnDecision,
  pushProductToSellerStore,
  registerOrUpdateSeller,
  removeProductFromSellerStore,
  requestSellerPayout,
  saveSellerBankAccount,
  saveSellerOwnProduct,
  SellerOwnProductInput,
  syncSellerEarningsRecord,
  updateOrderStatus,
  updateSellerStoreProductPrice,
  uploadProductImageForScope,
  validateSellerBankAccountInput,
} from '../services/marketplaceService';
import { exportSellerOrdersCsv } from '../services/futureArchitecture';
import { SafeImage } from './SafeImage';

interface SellerDashboardViewProps {
  userProfile: UserProfile | null;
  sellerProfile: SellerProfile | null;
  centralProducts: Product[];
  storeProducts: StoreProduct[];
  sellerOrders: MarketplaceOrder[];
  sellerReturns?: ReturnRequest[];
  sellerPayouts?: PayoutRecord[];
  sellerBankAccount?: SellerBankAccount | null;
  sellerEarnings?: SellerEarningsRecord | null;
  sellerPayoutTransactions?: PayoutTransactionRecord[];
  minPayoutAmount?: number;
  onOpenAuth: () => void;
  onSellerUpdated: (seller: SellerProfile) => void;
  onOpenStorefront: (sellerId: string) => void;
  onShareStore: (sellerId: string, storeName: string) => void;
  onNotify: (msg: string) => void;
}

type SellerTab =
  | 'overview'
  | 'ownProducts'
  | 'catalog'
  | 'dropship'
  | 'orders'
  | 'returns'
  | 'earnings'
  | 'settings';

function getTsMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const obj = ts as { toMillis?: () => number; seconds?: number };
  if (typeof obj.toMillis === 'function') return obj.toMillis();
  if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  return 0;
}

function isSameLocalDay(ms: number): boolean {
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export const SellerDashboardView: React.FC<SellerDashboardViewProps> = ({
  userProfile,
  sellerProfile,
  centralProducts,
  storeProducts,
  sellerOrders,
  sellerReturns = [],
  sellerPayouts = [],
  sellerBankAccount = null,
  sellerEarnings = null,
  sellerPayoutTransactions = [],
  minPayoutAmount = DEFAULT_MIN_PAYOUT_AMOUNT,
  onOpenAuth,
  onSellerUpdated,
  onOpenStorefront,
  onShareStore,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<SellerTab>('overview');

  // Store registration / settings fields
  const [storeName, setStoreName] = useState(sellerProfile?.storeName || '');
  const [ownerName, setOwnerName] = useState(
    sellerProfile?.ownerName || userProfile?.name || ''
  );
  const [city, setCity] = useState(sellerProfile?.city || '');
  const [stateName, setStateName] = useState(sellerProfile?.state || '');
  const [description, setDescription] = useState(sellerProfile?.description || '');
  const [savingStore, setSavingStore] = useState(false);

  // Type B Dropship Catalog State
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'ALL' | ProductCategory>('ALL');
  const [pushingProductId, setPushingProductId] = useState<string | null>(null);
  const [catalogSellingDrafts, setCatalogSellingDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  // Type A Own Product State
  const [ownModalOpen, setOwnModalOpen] = useState(false);
  const [editingOwnProduct, setEditingOwnProduct] = useState<Product | null>(null);
  const [confirmDeleteOwnId, setConfirmDeleteOwnId] = useState<string | null>(null);
  const [ownTitle, setOwnTitle] = useState('');
  const [ownDesc, setOwnDesc] = useState('');
  const [ownCat, setOwnCat] = useState<ProductCategory>('Fashion');
  const [ownPrice, setOwnPrice] = useState('');
  const [ownMrp, setOwnMrp] = useState('');
  const [ownStock, setOwnStock] = useState('20');
  const [ownImgInput, setOwnImgInput] = useState('');
  const [ownImages, setOwnImages] = useState<string[]>([]);
  const [ownTags, setOwnTags] = useState('');
  const [ownActive, setOwnActive] = useState(true);
  const [uploadingOwnImg, setUploadingOwnImg] = useState(false);
  const [savingOwnProduct, setSavingOwnProduct] = useState(false);
  const [ownFormError, setOwnFormError] = useState<string | null>(null);

  // Orders Tab Filters & Fulfillment
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    'ALL' | 'TODAY' | 'SELLER_OWN_PRODUCT' | 'SELLER_DROPSHIP'
  >('ALL');
  const [courierDrafts, setCourierDrafts] = useState<Record<string, string>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Return Response State
  const [returnNoteDrafts, setReturnNoteDrafts] = useState<Record<string, string>>({});
  const [updatingReturnId, setUpdatingReturnId] = useState<string | null>(null);

  // Bank Account & Payout Request State
  const [financialSummary, setFinancialSummary] = useState<SellerFinancialSummary | null>(null);
  const [payoutProviderStatus, setPayoutProviderStatus] = useState<PayoutProviderStatus | null>(null);
  const [upiDraft, setUpiDraft] = useState(userProfile?.upiId || '');
  const [requestingPayout, setRequestingPayout] = useState(false);

  const [bankHolderName, setBankHolderName] = useState(sellerBankAccount?.accountHolderName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankConfirmAccountNumber, setBankConfirmAccountNumber] = useState('');
  const [bankIfscCode, setBankIfscCode] = useState(sellerBankAccount?.ifscCode || '');
  const [bankName, setBankName] = useState(sellerBankAccount?.bankName || '');
  const [bankBranchName, setBankBranchName] = useState(sellerBankAccount?.branchName || '');
  const [editingBank, setEditingBank] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  const isStoreBlocked =
    sellerProfile?.isActive === false ||
    sellerProfile?.storeStatus === 'Suspended' ||
    sellerProfile?.storeStatus === 'Closed';

  const effectiveMinPayout = Math.max(100, Number(minPayoutAmount || DEFAULT_MIN_PAYOUT_AMOUNT));

  useEffect(() => {
    if (!sellerProfile) return;
    setStoreName(sellerProfile.storeName);
    setOwnerName(sellerProfile.ownerName);
    setCity(sellerProfile.city);
    setStateName(sellerProfile.state);
    setDescription(sellerProfile.description || '');
  }, [sellerProfile]);

  useEffect(() => {
    if (!sellerBankAccount) {
      setEditingBank(false);
      return;
    }
    setBankHolderName(sellerBankAccount.accountHolderName || '');
    setBankIfscCode(sellerBankAccount.ifscCode || '');
    setBankName(sellerBankAccount.bankName || '');
    setBankBranchName(sellerBankAccount.branchName || '');
  }, [sellerBankAccount]);

  useEffect(() => {
    let active = true;
    fetchPayoutProviderStatus()
      .then((status) => {
        if (active) setPayoutProviderStatus(status);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (userProfile?.upiId && !upiDraft) {
      setUpiDraft(userProfile.upiId);
    }
  }, [userProfile?.upiId, upiDraft]);

  useEffect(() => {
    if (!sellerProfile) {
      setFinancialSummary(null);
      return;
    }
    let active = true;
    calculateSellerFinancialsOnServer({
      sellerId: sellerProfile.uid,
      orders: sellerOrders,
      returns: sellerReturns,
      payouts: sellerPayouts,
    }).then((res) => {
      if (!active) return;
      setFinancialSummary(res);
      syncSellerEarningsRecord(sellerProfile, res).catch(() => undefined);
    });
    return () => {
      active = false;
    };
  }, [sellerProfile, sellerOrders, sellerReturns, sellerPayouts]);

  // Seller Type A own products & Owner central products separation
  const sellerOwnProducts = useMemo(() => {
    if (!sellerProfile) return [];
    return centralProducts.filter(
      (p) => p.sellerId === sellerProfile.uid && p.ownershipType === 'SELLER_OWNED'
    );
  }, [centralProducts, sellerProfile]);

  const ownerCentralProducts = useMemo(
    () =>
      centralProducts.filter(
        (p) => p.ownershipType !== 'SELLER_OWNED' && p.sellerId === 'tisahara_owner'
      ),
    [centralProducts]
  );

  const centralMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of ownerCentralProducts) {
      map.set(p.id, p);
    }
    return map;
  }, [ownerCentralProducts]);

  const pushedProductIds = useMemo(
    () => new Set(storeProducts.map((sp) => sp.productId)),
    [storeProducts]
  );

  const ownerApprovedCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return ownerCentralProducts.filter((p) => {
      if (!p.isActive || p.availableForSellers === false) return false;
      if (catalogCategory !== 'ALL' && p.category !== catalogCategory) return false;
      if (q) {
        const hay = `${p.title} ${p.description} ${p.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ownerCentralProducts, catalogSearch, catalogCategory]);

  const filteredSellerOrders = useMemo(() => {
    return sellerOrders.filter((ord) => {
      if (orderTypeFilter === 'TODAY') return isSameLocalDay(getTsMillis(ord.createdAt));
      if (orderTypeFilter === 'SELLER_OWN_PRODUCT') {
        return inferOrderType(ord) === 'SELLER_OWN_PRODUCT';
      }
      if (orderTypeFilter === 'SELLER_DROPSHIP') {
        return inferOrderType(ord) === 'SELLER_DROPSHIP';
      }
      return true;
    });
  }, [sellerOrders, orderTypeFilter]);

  const zeroInvestmentBanner = (
    <div className="bg-gradient-to-r from-[#6B21A8] via-[#7E22CE] to-[#9333EA] text-white rounded-2xl p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[11px] font-bold uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Two Ways to Sell on TISAHARA</span>
          </span>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold leading-snug">
            Sell Your Own Products (₹10/order) or Dropship Owner Products (₹5/order)
          </h2>
          <p className="text-xs sm:text-sm text-purple-100 max-w-2xl leading-relaxed">
            List your own inventory with self-managed delivery, or add TISAHARA Central products to your store with custom margins while the Owner packs and ships across India.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-1 gap-2 shrink-0 text-xs font-semibold">
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <BadgeIndianRupee className="w-4 h-4 shrink-0" />
            <span>₹0 Setup Cost</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>7-Day Return Shield</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <Truck className="w-4 h-4 shrink-0" />
            <span>Pan-India COD</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!userProfile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 space-y-6 bg-[#FFFFFF]">
        {zeroInvestmentBanner}

        <div className="bg-white rounded-2xl border border-purple-100 p-8 sm:p-10 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#F3E8FF] border border-purple-200 text-[#7E22CE] flex items-center justify-center mx-auto">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Launch Your Independent Seller Hub
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
            Register your store to list your own products, dropship central catalogue products with your margin, track 7-day return clearances, and request payouts.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-6 py-3 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-sm font-semibold cursor-pointer shadow-xs transition-colors"
          >
            Sign In or Register to Open Your Store
          </button>
        </div>
      </div>
    );
  }

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStore(true);
    try {
      const saved = await registerOrUpdateSeller(userProfile.uid, {
        storeName,
        ownerName: ownerName || userProfile.name,
        city,
        state: stateName,
        description,
      });
      onSellerUpdated(saved);
      onNotify(
        sellerProfile
          ? 'Store details updated successfully.'
          : `Congratulations! ${saved.storeName} is now live on TISAHARA.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save seller store.');
    } finally {
      setSavingStore(false);
    }
  };

  if (!sellerProfile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10 space-y-6 bg-[#FFFFFF]">
        {zeroInvestmentBanner}

        <div className="bg-white rounded-2xl border border-purple-100 p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Store Information Form
              </h1>
              <p className="text-xs sm:text-sm text-slate-600">
                Enter your storefront details below to launch your TISAHARA seller account in under a minute.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveStore} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">Store Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. Jaipur Loom Studio"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">Owner Name</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">City</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Surat"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">State</label>
                <input
                  type="text"
                  required
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  placeholder="e.g. Gujarat"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                About Your Store
              </label>
              <textarea
                rows={3}
                maxLength={600}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you craft or curate for TISAHARA shoppers..."
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
              />
            </div>

            <button
              type="submit"
              disabled={savingStore}
              className="w-full py-3.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer shadow-xs transition-colors"
            >
              {savingStore ? 'Creating Store...' : 'Create & Launch Seller Store'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard Metrics
  const todayOrders = sellerOrders.filter((o) => isSameLocalDay(getTsMillis(o.createdAt)));
  const pendingOrders = sellerOrders.filter(
    (o) => o.status !== 'Delivered' && o.status !== 'Cancelled'
  );
  const deliveredOrders = sellerOrders.filter((o) => o.status === 'Delivered');
  const cancelledOrders = sellerOrders.filter((o) => o.status === 'Cancelled');
  const grossSales = sellerOrders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((s, o) => s + o.totalAmount, 0);

  // Own product modal handlers
  const openCreateOwnModal = () => {
    setEditingOwnProduct(null);
    setOwnTitle('');
    setOwnDesc('');
    setOwnCat('Fashion');
    setOwnPrice('');
    setOwnMrp('');
    setOwnStock('20');
    setOwnImgInput('');
    setOwnImages([]);
    setOwnTags('');
    setOwnActive(true);
    setOwnFormError(null);
    setOwnModalOpen(true);
  };

  const openEditOwnModal = (prod: Product) => {
    setEditingOwnProduct(prod);
    setOwnTitle(prod.title);
    setOwnDesc(prod.description);
    setOwnCat(prod.category);
    setOwnPrice(String(prod.sellingPrice));
    setOwnMrp(String(prod.mrp));
    setOwnStock(String(prod.stock));
    setOwnImgInput('');
    setOwnImages(prod.images || []);
    setOwnTags((prod.tags || []).join(', '));
    setOwnActive(prod.isActive);
    setOwnFormError(null);
    setOwnModalOpen(true);
  };

  const handleUploadOwnImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOwnImg(true);
    setOwnFormError(null);
    try {
      const url = await uploadProductImageForScope(file, sellerProfile.uid);
      setOwnImages((prev) => [...prev, url].slice(0, 5));
      onNotify('Product image uploaded.');
    } catch (err) {
      setOwnFormError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingOwnImg(false);
      e.target.value = '';
    }
  };

  const handleSaveOwnProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnFormError(null);
    const price = Number(ownPrice);
    const mrp = Number(ownMrp || ownPrice);
    const stock = Number(ownStock);

    if (ownTitle.trim().length < 2) {
      setOwnFormError('Product title must be at least 2 characters.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setOwnFormError('Please enter a valid selling price.');
      return;
    }
    if (!Number.isFinite(mrp) || mrp < price) {
      setOwnFormError('MRP must be greater than or equal to selling price.');
      return;
    }
    if (ownImages.length === 0) {
      setOwnFormError('Upload or paste at least one product image.');
      return;
    }

    const input: SellerOwnProductInput = {
      title: ownTitle.trim(),
      description: ownDesc.trim() || `${ownTitle.trim()} - Sold directly by ${sellerProfile.storeName}.`,
      category: ownCat,
      sellingPrice: price,
      mrp,
      stock: Number.isFinite(stock) ? stock : 0,
      images: ownImages,
      tags: ownTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isActive: ownActive,
    };

    setSavingOwnProduct(true);
    try {
      await saveSellerOwnProduct(sellerProfile, input, editingOwnProduct || undefined);
      setOwnModalOpen(false);
      onNotify(
        editingOwnProduct
          ? 'Own product updated.'
          : 'Own product published to marketplace & your store.'
      );
    } catch (err) {
      setOwnFormError(err instanceof Error ? err.message : 'Failed to save own product.');
    } finally {
      setSavingOwnProduct(false);
    }
  };

  const handleDeleteOwnProduct = async (productId: string) => {
    try {
      await deleteSellerOwnProduct(productId);
      setConfirmDeleteOwnId(null);
      onNotify('Own product deleted.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete product.');
    }
  };

  const handlePushSingleProduct = async (product: Product) => {
    if (pushedProductIds.has(product.id)) {
      onNotify(`"${product.title}" is already added to your store.`);
      return;
    }
    const rawDraft = catalogSellingDrafts[product.id];
    const customSellingPrice =
      rawDraft !== undefined && rawDraft.trim() !== ''
        ? Number(rawDraft)
        : product.sellingPrice;

    setPushingProductId(product.id);
    try {
      const created = await pushProductToSellerStore(sellerProfile, product, customSellingPrice);
      onNotify(
        `Added "${product.title}" to ${sellerProfile.storeName} at ₹${created.sellingPrice} (Margin +₹${created.sellerMargin}).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to push product to your store.');
    } finally {
      setPushingProductId(null);
    }
  };

  const handleUpdateStorePrice = async (sp: StoreProduct, central: Product) => {
    const draft = priceDrafts[sp.id];
    if (draft === undefined) return;
    try {
      await updateSellerStoreProductPrice(sp, central, Number(draft), sp.isActive);
      onNotify(`Updated store price for "${central.title}" to ₹${Math.round(Number(draft))}.`);
      setPriceDrafts((prev) => {
        const copy = { ...prev };
        delete copy[sp.id];
        return copy;
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update store price.');
    }
  };

  const handleToggleStoreItemActive = async (sp: StoreProduct, central: Product) => {
    try {
      await updateSellerStoreProductPrice(sp, central, sp.sellingPrice, !sp.isActive);
      onNotify(
        sp.isActive
          ? `Paused "${central.title}" in your store.`
          : `Activated "${central.title}" in your store.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update store item.');
    }
  };

  const handleRemoveFromStore = async (sp: StoreProduct, title: string) => {
    try {
      await removeProductFromSellerStore(sp.id);
      onNotify(`Removed "${title}" from your store.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to remove product from store.');
    }
  };

  const handleSellerUpdateOwnOrder = async (
    order: MarketplaceOrder,
    nextStatus: OrderStatus
  ) => {
    setUpdatingOrderId(order.id);
    try {
      await updateOrderStatus(order, nextStatus, {
        courierPartner: courierDrafts[order.id] ?? order.courierPartner,
        trackingNumber: trackingDrafts[order.id] ?? order.trackingNumber,
      });
      onNotify(`Order ${order.id} updated to ${nextStatus}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Order update failed.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleSellerReturnDecision = async (
    ret: ReturnRequest,
    decision: 'Approved' | 'Rejected'
  ) => {
    setUpdatingReturnId(ret.id);
    try {
      await processReturnDecision({
        returnRequest: ret,
        decision,
        adminNote: returnNoteDrafts[ret.id],
      });
      onNotify(`Return ${ret.orderId} marked ${decision}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update return request.');
    } finally {
      setUpdatingReturnId(null);
    }
  };

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(null);
    const input = {
      accountHolderName: bankHolderName,
      accountNumber: bankAccountNumber,
      confirmAccountNumber: bankConfirmAccountNumber,
      ifscCode: bankIfscCode,
      bankName,
      branchName: bankBranchName,
    };
    setSavingBank(true);
    try {
      validateSellerBankAccountInput(input);
      const saved = await saveSellerBankAccount(sellerProfile, input);
      setBankAccountNumber('');
      setBankConfirmAccountNumber('');
      setEditingBank(false);
      onNotify(
        `Bank account ending in ${saved.accountLast4} saved securely and submitted for Owner verification.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save bank account details.';
      setBankError(msg);
      onNotify(msg);
    } finally {
      setSavingBank(false);
    }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!financialSummary) return;
    setRequestingPayout(true);
    try {
      const created = await requestSellerPayout({
        seller: sellerProfile,
        summary: financialSummary,
        bankAccount: sellerBankAccount ?? null,
        existingPayouts: sellerPayouts,
        minPayoutAmount: effectiveMinPayout,
        upiId: upiDraft,
      });
      onNotify(
        `Payout request ${created.id} for ₹${created.netPayableAmount.toLocaleString('en-IN')} submitted for Owner approval.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to submit payout request.');
    } finally {
      setRequestingPayout(false);
    }
  };

  const pendingReturnsCount = sellerReturns.filter(
    (r) => r.status === 'Requested' || r.status === 'Approved'
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-7 bg-[#FFFFFF]">
      {isStoreBlocked && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
          <div>
            <strong>
              Store {sellerProfile.storeStatus || 'Paused'}:
            </strong>{' '}
            Your storefront is currently prevented from receiving new customer orders by the TISAHARA Owner. Historical orders, payouts, and 7-day return tracking remain accessible below.
          </div>
        </div>
      )}

      {/* Top Seller Header */}
      <div className="bg-gradient-to-r from-[#FAF5FF] to-white rounded-2xl border border-purple-100 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B21A8]">
            <Store className="w-3.5 h-3.5" />
            <span>
              Seller Hub · {sellerProfile.city}, {sellerProfile.state} · Status:{' '}
              {sellerProfile.storeStatus || (sellerProfile.isActive === false ? 'Suspended' : 'Active')}
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 mt-1">
            {sellerProfile.storeName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenStorefront(sellerProfile.uid)}
            className="px-3.5 py-2 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
          >
            View Storefront
          </button>
          <button
            type="button"
            onClick={() => onShareStore(sellerProfile.uid, sellerProfile.storeName)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-200 bg-[#F3E8FF] hover:bg-purple-200 text-xs font-semibold text-[#581C87] cursor-pointer transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share Store</span>
          </button>
          <button
            type="button"
            disabled={isStoreBlocked}
            onClick={() => {
              setActiveTab('ownProducts');
              openCreateOwnModal();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Own Product</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#FAF5FF] border border-purple-100 rounded-2xl overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'ownProducts', label: `My Products (${sellerOwnProducts.length})`, icon: Package },
            { id: 'catalog', label: `Owner Catalogue (${ownerApprovedCatalog.length})`, icon: Sparkles },
            { id: 'dropship', label: `Dropship Items (${storeProducts.length})`, icon: Store },
            { id: 'orders', label: `Orders (${sellerOrders.length})`, icon: ShoppingBag },
            { id: 'returns', label: `Returns (${sellerReturns.length})`, icon: RotateCcw },
            { id: 'earnings', label: 'Earnings & Payouts', icon: Wallet },
            { id: 'settings', label: 'Settings', icon: IndianRupee },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-[#7E22CE] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white hover:text-[#6B21A8]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-2xl border border-purple-100 p-4 space-y-1">
              <span className="text-[11px] text-slate-600">Total Orders</span>
              <div className="font-mono-num text-xl font-bold text-slate-900">
                {sellerOrders.length}
              </div>
              <span className="text-[11px] text-[#6B21A8] font-medium">
                {todayOrders.length} today
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-purple-100 p-4 space-y-1">
              <span className="text-[11px] text-slate-600">Completed / Pending</span>
              <div className="font-mono-num text-xl font-bold text-slate-900">
                {deliveredOrders.length} / {pendingOrders.length}
              </div>
              <span className="text-[11px] text-slate-500">
                {cancelledOrders.length} cancelled
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-purple-100 p-4 space-y-1">
              <span className="text-[11px] text-slate-600">Total Sales</span>
              <div className="font-mono-num text-xl font-bold text-slate-900">
                ₹{grossSales.toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-slate-500">Non-cancelled</span>
            </div>
            <div className="bg-white rounded-2xl border border-purple-100 p-4 space-y-1">
              <span className="text-[11px] text-slate-600">TISAHARA Fees</span>
              <div className="font-mono-num text-xl font-bold text-slate-900">
                ₹{(financialSummary?.totalTisaharaFees || 0).toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-slate-500">₹10 own / ₹5 dropship</span>
            </div>
            <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 space-y-1">
              <span className="text-[11px] text-amber-900 font-medium">7d Window / Held</span>
              <div className="font-mono-num text-xl font-bold text-amber-950">
                ₹
                {(
                  (financialSummary?.heldReturnWindowAmount || 0) +
                  (financialSummary?.heldDisputeAmount || 0)
                ).toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-amber-800">
                {pendingReturnsCount} active return(s)
              </span>
            </div>
            <div className="bg-[#FAF5FF] rounded-2xl border border-purple-200 p-4 space-y-1">
              <span className="text-[11px] text-[#6B21A8] font-medium">Available Balance</span>
              <div className="font-mono-num text-xl font-bold text-[#581C87]">
                ₹{(financialSummary?.availableBalance || 0).toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-[#6B21A8]">Ready for payout</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-purple-100 p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Seller Type A — My Own Products
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload and price your own products, pack and ship orders directly to customers, and pay a flat <strong>₹10 TISAHARA fee</strong> only on delivered, non-refunded orders.
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-purple-50 text-xs">
                <span className="font-mono-num font-bold text-slate-900">
                  Own Gross Sales: ₹{(financialSummary?.ownProductGross || 0).toLocaleString('en-IN')}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('ownProducts')}
                  className="font-semibold text-[#7E22CE] hover:underline cursor-pointer"
                >
                  Manage Own Products →
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-purple-100 p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Seller Type B — Owner Product Dropshipping
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Browse the Owner Central Catalogue, add products with your custom margin, and let TISAHARA Central handle packing and delivery for just <strong>₹5 per delivered order</strong>.
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-purple-50 text-xs">
                <span className="font-mono-num font-bold text-slate-900">
                  Dropship Margins: ₹{(financialSummary?.dropshipMarginGross || 0).toLocaleString('en-IN')}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="font-semibold text-[#7E22CE] hover:underline cursor-pointer"
                >
                  Browse Owner Catalogue →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MY OWN PRODUCTS (SELLER TYPE A) */}
      {activeTab === 'ownProducts' && (
        <div className="space-y-4">
          <div className="bg-[#FAF5FF] border border-purple-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-700 space-y-0.5">
              <p className="font-bold text-slate-900">Seller Type A — Self-Fulfilled Products</p>
              <p>
                You control price, stock, packing, and shipping. TISAHARA deducts ₹10 per delivered &amp; non-refunded order before payout.
              </p>
            </div>
            <button
              type="button"
              disabled={isStoreBlocked}
              onClick={openCreateOwnModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Own Product
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-purple-100 overflow-hidden">
            {sellerOwnProducts.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Package className="w-9 h-9 text-[#7E22CE] mx-auto" />
                <p className="text-sm font-semibold text-slate-900">No own products added yet</p>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  List products you source or manufacture yourself. Buyers will see them on the TISAHARA homepage and your store page.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF5FF] border-b border-purple-100 text-slate-700 font-semibold">
                    <tr>
                      <th className="py-3.5 px-4">Product</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4 text-right">Selling / MRP</th>
                      <th className="py-3.5 px-4 text-right">Stock</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50">
                    {sellerOwnProducts.map((prod) => (
                      <tr key={prod.id} className="hover:bg-[#FAF5FF]/60">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <SafeImage
                              src={prod.images[0]}
                              alt={prod.title}
                              className="w-11 h-11 rounded-xl object-cover border border-purple-100 shrink-0"
                            />
                            <div className="min-w-0 max-w-xs">
                              <div className="font-semibold text-slate-900 truncate">{prod.title}</div>
                              <div className="text-[11px] text-slate-500 font-mono-num">{prod.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{prod.category}</td>
                        <td className="py-3 px-4 text-right font-mono-num">
                          <span className="font-bold text-slate-900">₹{prod.sellingPrice}</span>{' '}
                          <span className="text-slate-400 line-through">₹{prod.mrp}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                          {prod.stock}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                              prod.isActive
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                          >
                            {prod.isActive ? 'Live' : 'Paused'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isStoreBlocked}
                              onClick={() => openEditOwnModal(prod)}
                              className="p-1.5 rounded-lg border border-purple-200 hover:bg-[#FAF5FF] text-slate-700 cursor-pointer disabled:opacity-40"
                              title="Edit product"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteOwnId === prod.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOwnProduct(prod.id)}
                                  className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteOwnId(null)}
                                  className="px-2 py-1 rounded border border-slate-200 text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOwnId(prod.id)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                title="Delete product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. OWNER CATALOGUE TAB (SELLER TYPE B DROPSHIPPING) */}
      {activeTab === 'catalog' && (
        <div className="space-y-5">
          <div className="bg-[#FAF5FF] border border-purple-100 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#7E22CE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search Owner Central products..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setCatalogCategory('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer shrink-0 ${
                    catalogCategory === 'ALL'
                      ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                      : 'bg-white border-purple-200 text-slate-700'
                  }`}
                >
                  All
                </button>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatalogCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer shrink-0 ${
                      catalogCategory === cat
                        ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                        : 'bg-white border-purple-200 text-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-600">
              Owner base price, description, images, and stock stay locked by the Owner. Set your own profit margin; TISAHARA packs &amp; delivers and charges ₹5 per delivered non-refunded order.
            </p>
          </div>

          {ownerApprovedCatalog.length === 0 ? (
            <div className="bg-white rounded-2xl border border-purple-100 p-10 text-center text-sm text-slate-600">
              No central catalogue products match your filter right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownerApprovedCatalog.map((prod) => {
                const alreadyAdded = pushedProductIds.has(prod.id);
                const isPushing = pushingProductId === prod.id;
                const maxAllowedPrice =
                  prod.maxSellerMargin !== undefined
                    ? Math.min(prod.mrp, prod.basePrice + prod.maxSellerMargin)
                    : prod.mrp;
                const draftPriceStr =
                  catalogSellingDrafts[prod.id] !== undefined
                    ? catalogSellingDrafts[prod.id]
                    : String(prod.sellingPrice);
                const parsedSelling = Math.round(Number(draftPriceStr || 0));
                const estimatedMargin = parsedSelling - prod.basePrice;
                const priceValid =
                  Number.isFinite(parsedSelling) &&
                  parsedSelling >= prod.basePrice &&
                  parsedSelling <= maxAllowedPrice;

                return (
                  <div
                    key={prod.id}
                    className="bg-white rounded-2xl border border-purple-100 overflow-hidden flex flex-col shadow-xs"
                  >
                    <div className="aspect-[4/3] bg-[#FAF5FF] relative overflow-hidden">
                      <SafeImage
                        src={prod.images[0]}
                        alt={prod.title}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-white/95 text-[11px] font-semibold text-[#6B21A8] border border-purple-100">
                        {prod.category}
                      </span>
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-white/95 font-mono-num text-[11px] font-bold text-slate-800 border border-purple-100">
                        {prod.stock > 0 ? `${prod.stock} in stock` : 'Out of Stock'}
                      </span>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        {isSampleTestingProduct(prod) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-extrabold uppercase tracking-wide">
                            SAMPLE – FOR TESTING
                          </span>
                        )}
                        <h3 className="font-display text-sm font-bold text-slate-900 line-clamp-2">
                          {prod.title}
                        </h3>
                        <p className="text-xs text-slate-600 line-clamp-2">{prod.description}</p>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#FAF5FF] border border-purple-100 text-xs">
                          <div>
                            <span className="block text-[10px] text-slate-500">Owner Base</span>
                            <span className="font-mono-num font-bold text-slate-900">
                              ₹{prod.basePrice}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500">Max Cap</span>
                            <span className="font-mono-num font-bold text-slate-900">
                              ₹{maxAllowedPrice}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-[#6B21A8]">Your Margin</span>
                            <span
                              className={`font-mono-num font-bold ${
                                estimatedMargin >= 0 ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              +₹{Math.max(0, estimatedMargin)}
                            </span>
                          </div>
                        </div>

                        {!alreadyAdded && (
                          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Customer Price (₹)
                              </label>
                              <input
                                type="number"
                                min={prod.basePrice}
                                max={maxAllowedPrice}
                                value={draftPriceStr}
                                onChange={(e) =>
                                  setCatalogSellingDrafts((prev) => ({
                                    ...prev,
                                    [prod.id]: e.target.value,
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 text-xs font-mono-num font-semibold text-slate-900 bg-white border border-purple-200 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Profit Margin (₹)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={Math.max(0, maxAllowedPrice - prod.basePrice)}
                                value={String(Math.max(0, estimatedMargin))}
                                onChange={(e) => {
                                  const m = Math.max(0, Math.round(Number(e.target.value || 0)));
                                  setCatalogSellingDrafts((prev) => ({
                                    ...prev,
                                    [prod.id]: String(prod.basePrice + m),
                                  }));
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono-num font-semibold text-[#6B21A8] bg-white border border-purple-200 rounded-lg"
                              />
                            </div>
                          </div>
                        )}

                        {alreadyAdded ? (
                          <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Added to My Store</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              isPushing ||
                              prod.stock <= 0 ||
                              !priceValid ||
                              isStoreBlocked
                            }
                            onClick={() => handlePushSingleProduct(prod)}
                            className="w-full py-2.5 px-4 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            <span>
                              {isPushing
                                ? 'Adding...'
                                : prod.stock <= 0
                                ? 'Out of Stock'
                                : `Add to My Store (+₹${Math.max(0, estimatedMargin)})`}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. DROPSHIP STORE ITEMS TAB */}
      {activeTab === 'dropship' && (
        <div className="bg-white rounded-2xl border border-purple-100 overflow-hidden">
          {storeProducts.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Package className="w-10 h-10 text-[#7E22CE] mx-auto" />
              <p className="text-sm font-semibold text-slate-900">No dropship products in your store yet</p>
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
              >
                Browse Owner Catalogue
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF5FF] border-b border-purple-100 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">Product (Owner-Locked Specs)</th>
                    <th className="py-3.5 px-4 text-right">Owner Base</th>
                    <th className="py-3.5 px-4">Your Price (₹)</th>
                    <th className="py-3.5 px-4 text-right">Margin</th>
                    <th className="py-3.5 px-4 text-right">Stock</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-50">
                  {storeProducts.map((sp) => {
                    const central = centralMap.get(sp.productId);
                    if (!central) return null;
                    const draftVal = priceDrafts[sp.id];
                    const maxCap =
                      central.maxSellerMargin !== undefined
                        ? Math.min(central.mrp, central.basePrice + central.maxSellerMargin)
                        : central.mrp;

                    return (
                      <tr key={sp.id} className="hover:bg-[#FAF5FF]/70">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <SafeImage
                              src={central.images[0]}
                              alt={central.title}
                              className="w-11 h-11 rounded-xl object-cover border border-purple-100 shrink-0"
                            />
                            <div className="min-w-0 max-w-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-900 truncate">
                                  {central.title}
                                </span>
                                {isSampleTestingProduct(central) && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-extrabold uppercase tracking-wide">
                                    SAMPLE – FOR TESTING
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {central.category} · MRP ₹{central.mrp}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-slate-600">
                          ₹{central.basePrice}
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={central.basePrice}
                              max={maxCap}
                              disabled={isStoreBlocked}
                              value={draftVal !== undefined ? draftVal : String(sp.sellingPrice)}
                              onChange={(e) =>
                                setPriceDrafts((prev) => ({ ...prev, [sp.id]: e.target.value }))
                              }
                              className="w-20 px-2 py-1 text-xs font-mono-num text-slate-900 bg-white border border-purple-200 rounded-lg"
                            />
                            {draftVal !== undefined && Number(draftVal) !== sp.sellingPrice && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStorePrice(sp, central)}
                                className="px-2 py-1 rounded-lg bg-[#7E22CE] text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Save
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-bold text-[#6B21A8]">
                          +₹{sp.sellerMargin}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                          {central.stock}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            disabled={isStoreBlocked}
                            onClick={() => handleToggleStoreItemActive(sp, central)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                              sp.isActive && central.isActive
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                          >
                            {!central.isActive || !sp.isActive ? 'Paused' : 'Live'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveFromStore(sp, central.title)}
                            className="p-1.5 text-slate-600 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. ORDERS TAB (Type A Self-Fulfilled + Type B Owner-Fulfilled) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'ALL', label: `All (${sellerOrders.length})` },
                  { id: 'TODAY', label: `Today (${todayOrders.length})` },
                  { id: 'SELLER_OWN_PRODUCT', label: 'Own Products (Type A)' },
                  { id: 'SELLER_DROPSHIP', label: 'Dropshipping (Type B)' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOrderTypeFilter(f.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer shrink-0 ${
                    orderTypeFilter === f.id
                      ? 'bg-[#7E22CE] border-[#7E22CE] text-white'
                      : 'bg-white border-purple-200 text-slate-700 hover:bg-[#FAF5FF]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => exportSellerOrdersCsv(sellerOrders, sellerProfile.storeName)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          {filteredSellerOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-purple-100 p-10 text-center text-sm text-slate-600">
              No orders match this filter.
            </div>
          ) : (
            filteredSellerOrders.map((order) => {
              const ot = inferOrderType(order);
              const fee = getOrderTisaharaFee(order);
              const payable = getOrderSellerPayable(order);
              const isOwnOrder = ot === 'SELLER_OWN_PRODUCT';
              const canManageOwn =
                isOwnOrder &&
                !isStoreBlocked &&
                order.status !== 'Delivered' &&
                order.status !== 'Cancelled';

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-purple-100 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-purple-50">
                    <div className="text-xs space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-num font-bold text-slate-900">{order.id}</span>
                        <span className="px-2 py-0.5 rounded bg-[#FAF5FF] border border-purple-200 text-[#6B21A8] font-semibold">
                          {isOwnOrder ? 'Type A · Own Product' : 'Type B · Owner Dropship'}
                        </span>
                        <span className="font-semibold text-slate-700">· {order.status}</span>
                      </div>
                      <div className="text-slate-600">
                        Buyer: {order.shippingAddress.fullName} · {order.shippingAddress.phone} ·{' '}
                        {order.shippingAddress.city}, {order.shippingAddress.state} -{' '}
                        {order.shippingAddress.pincode}
                      </div>
                    </div>

                    <div className="text-right text-xs space-y-0.5 font-mono-num">
                      <div className="text-base font-bold text-slate-900">
                        Order ₹{order.totalAmount.toLocaleString('en-IN')}
                      </div>
                      <div className="text-slate-600">
                        {isOwnOrder
                          ? `Subtotal ₹${order.subtotal} − TISAHARA Fee ₹${fee}`
                          : `Margin ₹${order.totalSellerMargin} − TISAHARA Fee ₹${fee}`}
                      </div>
                      <div className="font-bold text-emerald-700">
                        Net Settlement: ₹{payable.toLocaleString('en-IN')} ({order.payoutStatus || 'Pending'})
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {order.items.map((item) => (
                      <div key={item.productId} className="flex justify-between text-xs text-slate-700">
                        <span>
                          {item.title} × {item.quantity} (₹{item.sellingPrice})
                        </span>
                        <span className="font-mono-num font-semibold text-slate-900">
                          ₹{(item.sellingPrice * item.quantity).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Type A Seller Packing & Delivery Controls */}
                  {canManageOwn ? (
                    <div className="bg-[#FAF5FF] border border-purple-100 rounded-xl p-3.5 space-y-3 text-xs">
                      <div className="font-semibold text-slate-900">
                        Seller Packing &amp; Delivery Controls (Type A)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          value={courierDrafts[order.id] ?? order.courierPartner ?? ''}
                          onChange={(e) =>
                            setCourierDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                          }
                          placeholder="Courier Partner (e.g. Delhivery)"
                          className="px-3 py-1.5 bg-white border border-purple-200 rounded-lg"
                        />
                        <input
                          type="text"
                          value={trackingDrafts[order.id] ?? order.trackingNumber ?? ''}
                          onChange={(e) =>
                            setTrackingDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                          }
                          placeholder="Tracking / AWB Number"
                          className="px-3 py-1.5 bg-white border border-purple-200 rounded-lg font-mono-num"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {order.status === 'Pending' && (
                          <button
                            type="button"
                            disabled={updatingOrderId === order.id}
                            onClick={() => handleSellerUpdateOwnOrder(order, 'Confirmed')}
                            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                          >
                            Confirm Order
                          </button>
                        )}
                        {(order.status === 'Pending' || order.status === 'Confirmed') && (
                          <button
                            type="button"
                            disabled={updatingOrderId === order.id}
                            onClick={() => handleSellerUpdateOwnOrder(order, 'Shipped')}
                            className="px-3 py-1.5 rounded-lg bg-[#7E22CE] hover:bg-[#6B21A8] text-white font-semibold cursor-pointer"
                          >
                            Mark Shipped
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleSellerUpdateOwnOrder(order, 'Delivered')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                        >
                          Mark Delivered (Starts 7d Window)
                        </button>
                        <button
                          type="button"
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleSellerUpdateOwnOrder(order, 'Cancelled')}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer ml-auto"
                        >
                          Cancel Order
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-50 text-xs text-slate-600">
                      <span>
                        {isOwnOrder
                          ? `Self-fulfilled · Status: ${order.status}`
                          : `Packed & Delivered by TISAHARA Owner · Status: ${order.status}`}
                      </span>
                      {order.returnStatus && order.returnStatus !== 'None' && (
                        <span className="font-semibold text-amber-800">
                          Return: {order.returnStatus}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 6. RETURNS TAB */}
      {activeTab === 'returns' && (
        <div className="space-y-4">
          <div className="bg-[#FAF5FF] border border-purple-100 rounded-2xl p-4 text-xs text-slate-700">
            <strong>7-Day Return &amp; Payout Shield:</strong> Any order with an open or approved 7-day return request holds seller settlement until the return is resolved or rejected.
          </div>

          {sellerReturns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-purple-100 p-10 text-center text-sm text-slate-600">
              No return requests on your orders.
            </div>
          ) : (
            sellerReturns.map((ret) => (
              <div
                key={ret.id}
                className="bg-white rounded-2xl border border-purple-100 p-5 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono-num font-bold text-slate-900">Order {ret.orderId}</span>
                    <span className="text-slate-500 ml-2">
                      ({ret.orderType === 'SELLER_OWN_PRODUCT' ? 'Type A Own Product' : 'Type B Dropship'})
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#FAF5FF] border border-purple-200 font-semibold text-[#581C87]">
                    {ret.status} · ₹{ret.amount.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-slate-800 font-medium">Reason: {ret.reason}</p>
                {ret.comments && <p className="text-slate-600">{ret.comments}</p>}
                {ret.adminNote && <p className="text-slate-700">Note: {ret.adminNote}</p>}

                {ret.orderType === 'SELLER_OWN_PRODUCT' && ret.status === 'Requested' && (
                  <div className="pt-2 border-t border-purple-50 space-y-2.5">
                    <input
                      type="text"
                      value={returnNoteDrafts[ret.id] || ''}
                      onChange={(e) =>
                        setReturnNoteDrafts((prev) => ({ ...prev, [ret.id]: e.target.value }))
                      }
                      placeholder="Add seller resolution note (optional)"
                      className="w-full px-3 py-2 border border-purple-200 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={updatingReturnId === ret.id}
                        onClick={() => handleSellerReturnDecision(ret, 'Approved')}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                      >
                        Accept Return Pickup
                      </button>
                      <button
                        type="button"
                        disabled={updatingReturnId === ret.id}
                        onClick={() => handleSellerReturnDecision(ret, 'Rejected')}
                        className="px-3.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold cursor-pointer"
                      >
                        Dispute / Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 7. EARNINGS & PAYOUTS TAB */}
      {activeTab === 'earnings' && (() => {
        const totalEarnings =
          financialSummary?.totalEarnings ??
          sellerEarnings?.totalEarnings ??
          0;
        const pendingEarnings =
          financialSummary?.pendingEarnings ??
          sellerEarnings?.pendingEarnings ??
          0;
        const returnPeriodHold =
          financialSummary?.returnPeriodHold ??
          sellerEarnings?.returnPeriodHold ??
          (financialSummary?.heldReturnWindowAmount || 0) +
            (financialSummary?.heldDisputeAmount || 0);
        const availableForPayout =
          financialSummary?.availableBalance ??
          sellerEarnings?.availableForPayout ??
          0;
        const totalTisaharaFees =
          financialSummary?.totalTisaharaFees ??
          sellerEarnings?.totalTisaharaFees ??
          0;
        const totalPaid =
          financialSummary?.paidOutTotal ??
          sellerEarnings?.totalPaid ??
          0;
        const hasOpenRequest = sellerPayouts.some((p) => OPEN_PAYOUT_STATUS_SET.has(p.status));
        const isBankVerified = Boolean(
          sellerBankAccount &&
            sellerBankAccount.isVerified &&
            sellerBankAccount.verificationStatus === 'Verified'
        );
        const meetsMinPayout = availableForPayout >= effectiveMinPayout;
        const canSubmitPayout =
          !isStoreBlocked &&
          !requestingPayout &&
          isBankVerified &&
          !hasOpenRequest &&
          meetsMinPayout &&
          (financialSummary?.eligibleOrderIds.length || 0) > 0;

        const bankDetailsCard = (
          <div className="bg-white rounded-2xl border border-purple-100 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Bank Account Details
                  </h3>
                  <p className="text-xs text-slate-600">
                    Encrypted vault storage · Masked display · Never shared with buyers or other sellers
                  </p>
                </div>
              </div>
              {sellerBankAccount && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                    sellerBankAccount.verificationStatus === 'Verified'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : sellerBankAccount.verificationStatus === 'Rejected'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {sellerBankAccount.verificationStatus === 'Verified' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {sellerBankAccount.verificationStatus === 'Pending_Verification'
                      ? 'Pending Owner Verification'
                      : sellerBankAccount.verificationStatus}
                  </span>
                </span>
              )}
            </div>

            {sellerBankAccount && !editingBank ? (
              <div className="bg-[#FAF5FF] border border-purple-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-500">Account Holder Name</span>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {sellerBankAccount.accountHolderName}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">Masked Account Number</span>
                    <div className="font-mono-num font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#7E22CE]" />
                      <span>{sellerBankAccount.maskedAccountNumber}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">IFSC Code</span>
                    <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                      {sellerBankAccount.ifscCode}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">Bank Name</span>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {sellerBankAccount.bankName}
                    </div>
                  </div>
                  {sellerBankAccount.branchName && (
                    <div>
                      <span className="text-[11px] text-slate-500">Branch Name</span>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {sellerBankAccount.branchName}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-[11px] text-slate-500">Settlement Provider</span>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {payoutProviderStatus?.label || 'Manual Bank Transfer & Owner UTR'}
                    </div>
                  </div>
                </div>

                {sellerBankAccount.verificationNote && (
                  <div className="p-2.5 rounded-lg bg-white border border-purple-100 text-slate-700">
                    <strong>Verification Note:</strong> {sellerBankAccount.verificationNote}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-purple-100">
                  <span className="text-[11px] text-slate-600">
                    Updating bank details automatically requires Owner re-verification before the next payout.
                  </span>
                  <button
                    type="button"
                    disabled={isStoreBlocked}
                    onClick={() => {
                      setBankAccountNumber('');
                      setBankConfirmAccountNumber('');
                      setBankError(null);
                      setEditingBank(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-300 bg-white hover:bg-purple-50 text-xs font-semibold text-[#6B21A8] cursor-pointer disabled:opacity-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Update Bank Details</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveBankAccount} className="space-y-4 text-xs">
                {bankError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                    {bankError}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#FAF5FF] border border-purple-100 text-slate-700 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#7E22CE] shrink-0 mt-0.5" />
                  <span>
                    For your security, TISAHARA <strong>never</strong> asks for ATM PIN, UPI PIN, banking password, card CVV, or OTP. Only masked last 4 digits are displayed once saved.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isStoreBlocked}
                      value={bankHolderName}
                      onChange={(e) => setBankHolderName(e.target.value)}
                      placeholder="As per bank passbook"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      disabled={isStoreBlocked}
                      value={bankIfscCode}
                      onChange={(e) => setBankIfscCode(e.target.value.toUpperCase())}
                      placeholder="e.g. SBIN0001234"
                      className="w-full px-3.5 py-2.5 text-sm font-mono-num uppercase bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={9}
                      maxLength={18}
                      disabled={isStoreBlocked}
                      value={bankAccountNumber}
                      onChange={(e) =>
                        setBankAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))
                      }
                      placeholder="9 to 18 numeric digits"
                      className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Confirm Bank Account Number
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={9}
                      maxLength={18}
                      disabled={isStoreBlocked}
                      value={bankConfirmAccountNumber}
                      onChange={(e) =>
                        setBankConfirmAccountNumber(
                          e.target.value.replace(/\D/g, '').slice(0, 18)
                        )
                      }
                      placeholder="Re-enter bank account number"
                      className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Bank Name</label>
                    <input
                      type="text"
                      required
                      disabled={isStoreBlocked}
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Branch Name (optional)
                    </label>
                    <input
                      type="text"
                      disabled={isStoreBlocked}
                      value={bankBranchName}
                      onChange={(e) => setBankBranchName(e.target.value)}
                      placeholder="e.g. MI Road Jaipur"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={savingBank || isStoreBlocked}
                    className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white font-semibold cursor-pointer transition-colors"
                  >
                    {savingBank
                      ? 'Encrypting & Saving...'
                      : sellerBankAccount
                      ? 'Save Updated Bank Details (Re-verify)'
                      : 'Save Bank Account Details'}
                  </button>
                  {sellerBankAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBank(false);
                        setBankError(null);
                      }}
                      className="px-4 py-2.5 rounded-xl border border-purple-200 bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        );

        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-purple-100 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Seller Earnings &amp; Payout Ledger
                  </h2>
                  <p className="text-xs text-slate-600">
                    Delivered orders clear after the 7-day return period with ₹10 (Own Product) or ₹5 (Dropship) TISAHARA fee deducted. Minimum payout: ₹{effectiveMinPayout.toLocaleString('en-IN')}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => exportSellerOrdersCsv(sellerOrders, sellerProfile.storeName)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-200 bg-[#FAF5FF] text-[#6B21A8] text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 rounded-xl bg-white border border-purple-100">
                  <span className="text-[11px] text-slate-500">Total Earnings</span>
                  <div className="font-mono-num text-lg font-bold text-slate-900 mt-1">
                    ₹{totalEarnings.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-500">Net after fees</span>
                </div>
                <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200">
                  <span className="text-[11px] text-sky-900">Pending Earnings</span>
                  <div className="font-mono-num text-lg font-bold text-sky-950 mt-1">
                    ₹{pendingEarnings.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-sky-800">Open payouts / active</span>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[11px] text-amber-900">Return Period Hold</span>
                  <div className="font-mono-num text-lg font-bold text-amber-950 mt-1">
                    ₹{returnPeriodHold.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-amber-800">7d window &amp; disputes</span>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF5FF] border border-purple-200">
                  <span className="text-[11px] text-[#6B21A8] font-semibold">Available for Payout</span>
                  <div className="font-mono-num text-lg font-bold text-[#581C87] mt-1">
                    ₹{availableForPayout.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-[#6B21A8]">
                    Min ₹{effectiveMinPayout.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-white border border-purple-100">
                  <span className="text-[11px] text-slate-500">Total TISAHARA Fees</span>
                  <div className="font-mono-num text-lg font-bold text-rose-700 mt-1">
                    -₹{totalTisaharaFees.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-500">₹10 Own · ₹5 Dropship</span>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <span className="text-[11px] text-emerald-900">Total Paid</span>
                  <div className="font-mono-num text-lg font-bold text-emerald-950 mt-1">
                    ₹{totalPaid.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-emerald-800">Settled to bank</span>
                </div>
              </div>

              {/* Request Payout Form */}
              <form
                onSubmit={handleRequestPayout}
                className="bg-[#FAF5FF] border border-purple-200 rounded-xl p-4 sm:p-5 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Request Seller Payout
                  </h3>
                  <span className="font-mono-num text-slate-600">
                    Eligible orders: {financialSummary?.eligibleOrderIds.length || 0} · Mode:{' '}
                    {payoutProviderStatus?.label || 'Manual Bank Transfer'}
                  </span>
                </div>

                {!sellerBankAccount ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-medium">
                    Add and verify your Bank Account Details below before requesting a payout.
                  </div>
                ) : !isBankVerified ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-medium">
                    Your bank account ({sellerBankAccount.maskedAccountNumber} · {sellerBankAccount.ifscCode}) is currently{' '}
                    <strong>
                      {sellerBankAccount.verificationStatus === 'Pending_Verification'
                        ? 'Pending Owner Verification'
                        : sellerBankAccount.verificationStatus}
                    </strong>
                    . Payout requests unlock once verified.
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white border border-purple-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">
                        Verified Settlement Destination:
                      </span>{' '}
                      <span className="font-mono-num text-slate-800">
                        {sellerBankAccount.bankName} · {sellerBankAccount.maskedAccountNumber} · IFSC {sellerBankAccount.ifscCode}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700">Verified</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <input
                    type="text"
                    value={upiDraft}
                    onChange={(e) => setUpiDraft(e.target.value)}
                    placeholder="Optional UPI ID for settlement receipt (e.g. store@okaxis)"
                    className="px-3 py-2 bg-white border border-purple-200 rounded-xl"
                  />
                  <div className="text-[11px] text-slate-600">
                    {hasOpenRequest
                      ? 'An open payout request is already being processed. Wait for completion before raising another.'
                      : !meetsMinPayout
                      ? `Available payout balance must be at least ₹${effectiveMinPayout.toLocaleString('en-IN')}.`
                      : 'All eligible delivered orders past the 7-day return period will be batched.'}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmitPayout}
                  className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white font-semibold cursor-pointer transition-colors"
                >
                  {requestingPayout
                    ? 'Submitting Payout Request...'
                    : `Request Payout · ₹${availableForPayout.toLocaleString('en-IN')}`}
                </button>
              </form>
            </div>

            {/* Bank Account Management Card */}
            {bankDetailsCard}

            {/* Payout History Table */}
            <div className="bg-white rounded-2xl border border-purple-100 overflow-hidden">
              <div className="px-5 py-3.5 bg-[#FAF5FF] border-b border-purple-100 font-display text-sm font-bold text-slate-900">
                Payout History ({sellerPayouts.length})
              </div>
              {sellerPayouts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No payout requests submitted yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-purple-100 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Payout ID &amp; Date</th>
                        <th className="py-3 px-4 text-right">Orders</th>
                        <th className="py-3 px-4 text-right">Gross</th>
                        <th className="py-3 px-4 text-right">TISAHARA Fee</th>
                        <th className="py-3 px-4 text-right">Net Payable</th>
                        <th className="py-3 px-4">Bank Destination</th>
                        <th className="py-3 px-4">Status / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {sellerPayouts.map((p) => {
                        const createdMs = getTsMillis(p.createdAt);
                        return (
                          <tr key={p.id}>
                            <td className="py-3 px-4">
                              <span className="font-mono-num font-bold text-slate-900 block">
                                {p.id}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {createdMs
                                  ? new Date(createdMs).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : 'Recent'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num">{p.orderIds.length}</td>
                            <td className="py-3 px-4 text-right font-mono-num">₹{p.grossAmount}</td>
                            <td className="py-3 px-4 text-right font-mono-num text-rose-700">
                              -₹{p.tisaharaFeeTotal}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num font-bold text-emerald-700">
                              ₹{p.netPayableAmount}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-mono-num">
                              {p.maskedAccountNumber ? (
                                <span>
                                  {p.bankName ? `${p.bankName} · ` : ''}
                                  {p.maskedAccountNumber}
                                  {p.ifscCode ? ` (${p.ifscCode})` : ''}
                                </span>
                              ) : (
                                p.upiId || p.bankDetails || '-'
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${
                                  p.status === 'Paid'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : p.status === 'Rejected' || p.status === 'Failed'
                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                    : p.status === 'Approved' || p.status === 'Processing'
                                    ? 'bg-sky-50 border-sky-200 text-sky-800'
                                    : 'bg-amber-50 border-amber-200 text-amber-800'
                                }`}
                              >
                                {p.status}
                              </span>
                              {(p.transactionRef || p.paymentReference) && (
                                <span className="block font-mono-num text-[11px] text-slate-500 mt-0.5">
                                  Ref: {p.transactionRef || p.paymentReference}
                                </span>
                              )}
                              {p.adminNote && (
                                <span className="block text-[11px] text-slate-500 mt-0.5">
                                  {p.adminNote}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payout Transactions Audit Log */}
            <div className="bg-white rounded-2xl border border-purple-100 overflow-hidden">
              <div className="px-5 py-3.5 bg-[#FAF5FF] border-b border-purple-100 font-display text-sm font-bold text-slate-900">
                Payout Transactions Audit Log ({sellerPayoutTransactions.length})
              </div>
              {sellerPayoutTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No payout audit events logged yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-purple-100 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Transaction ID</th>
                        <th className="py-3 px-4">Payout ID</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4">Bank / Ref</th>
                        <th className="py-3 px-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {sellerPayoutTransactions.map((tx) => {
                        const txMs = getTsMillis(tx.createdAt);
                        return (
                          <tr key={tx.id}>
                            <td className="py-3 px-4 font-mono-num font-semibold text-slate-900">
                              {tx.id}
                            </td>
                            <td className="py-3 px-4 font-mono-num text-slate-700">{tx.payoutId}</td>
                            <td className="py-3 px-4 font-semibold text-slate-800">{tx.status}</td>
                            <td className="py-3 px-4 text-right font-mono-num font-bold text-slate-900">
                              ₹{Number(tx.amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 font-mono-num text-slate-600">
                              {tx.maskedAccountNumber || '-'}
                              {tx.paymentReference ? ` · Ref: ${tx.paymentReference}` : ''}
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {txMs
                                ? new Date(txMs).toLocaleString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Recent'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 8. SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-3xl">
          <form
            onSubmit={handleSaveStore}
            className="bg-white rounded-2xl border border-purple-100 p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">Store Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Store Name</label>
                <input
                  type="text"
                  required
                  disabled={isStoreBlocked}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Owner Name</label>
                <input
                  type="text"
                  required
                  disabled={isStoreBlocked}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">City</label>
                <input
                  type="text"
                  required
                  disabled={isStoreBlocked}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">State</label>
                <input
                  type="text"
                  required
                  disabled={isStoreBlocked}
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Store Description</label>
              <textarea
                rows={3}
                disabled={isStoreBlocked}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
              />
            </div>
            <button
              type="submit"
              disabled={savingStore || isStoreBlocked}
              className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              {savingStore ? 'Saving...' : 'Update Store Details'}
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-purple-100 p-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Bank Account &amp; Settlement Settings
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {sellerBankAccount
                  ? `${sellerBankAccount.bankName} · ${sellerBankAccount.maskedAccountNumber} (${sellerBankAccount.verificationStatus === 'Pending_Verification' ? 'Pending Verification' : sellerBankAccount.verificationStatus})`
                  : 'No bank account added yet.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('earnings')}
              className="px-4 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
            >
              Manage Bank Account &amp; Payouts
            </button>
          </div>
        </div>
      )}

      {/* ADD / EDIT SELLER OWN PRODUCT MODAL (TYPE A) */}
      {ownModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-purple-200 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-purple-100 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingOwnProduct ? 'Edit Own Product' : 'Add Own Product (Seller Type A)'}
              </h3>
              <button
                type="button"
                onClick={() => setOwnModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-purple-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOwnProduct} className="p-5 space-y-4 text-xs">
              {ownFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {ownFormError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-800 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={ownTitle}
                  onChange={(e) => setOwnTitle(e.target.value)}
                  placeholder="e.g. Handcrafted Block Print Stole"
                  className="w-full px-3 py-2 border border-purple-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Category</label>
                  <select
                    value={ownCat}
                    onChange={(e) => setOwnCat(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-xl bg-white text-sm"
                  >
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Stock Qty</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={ownStock}
                    onChange={(e) => setOwnStock(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-xl font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={ownPrice}
                    onChange={(e) => setOwnPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-xl font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={ownMrp}
                    onChange={(e) => setOwnMrp(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-xl font-mono-num text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={ownDesc}
                  onChange={(e) => setOwnDesc(e.target.value)}
                  placeholder="Material, dimensions, care instructions…"
                  className="w-full px-3 py-2 border border-purple-200 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-2.5 bg-[#FAF5FF] border border-purple-100 rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Images ({ownImages.length}/5)</span>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7E22CE] text-white font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingOwnImg ? 'Uploading…' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingOwnImg || ownImages.length >= 5}
                      onChange={handleUploadOwnImage}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={ownImgInput}
                    onChange={(e) => setOwnImgInput(e.target.value)}
                    placeholder="Or paste image URL (https://…)"
                    className="flex-1 px-3 py-2 border border-purple-200 rounded-xl bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!ownImgInput.trim()) return;
                      setOwnImages((prev) => [...prev, ownImgInput.trim()].slice(0, 5));
                      setOwnImgInput('');
                    }}
                    className="px-3 py-2 rounded-xl border border-purple-200 bg-white font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {ownImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {ownImages.map((img, idx) => (
                      <div key={idx} className="relative">
                        <SafeImage
                          src={img}
                          alt={`Own ${idx + 1}`}
                          className="w-14 h-14 rounded-lg object-cover border border-purple-200"
                        />
                        <button
                          type="button"
                          onClick={() => setOwnImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={ownTags}
                  onChange={(e) => setOwnTags(e.target.value)}
                  placeholder="handmade, festive, cotton"
                  className="w-full px-3 py-2 border border-purple-200 rounded-xl"
                />
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ownActive}
                  onChange={(e) => setOwnActive(e.target.checked)}
                  className="accent-[#7E22CE]"
                />
                <span>Active in Marketplace &amp; Store</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-purple-100">
                <button
                  type="button"
                  onClick={() => setOwnModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOwnProduct}
                  className="px-5 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingOwnProduct ? 'Saving…' : editingOwnProduct ? 'Save Changes' : 'Publish Own Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
