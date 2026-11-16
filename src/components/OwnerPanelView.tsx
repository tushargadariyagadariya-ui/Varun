import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Banknote,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  Coins,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  IndianRupee,
  Landmark,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Package,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  CentralProductInput,
  changeOwnerPassword,
  DEFAULT_MIN_PAYOUT_AMOUNT,
  deleteCentralProduct,
  deleteSupplier,
  deleteSupplierProduct,
  executeOwnerProviderPayout,
  fetchOwnerSession,
  fetchPayoutProviderStatus,
  formatOrderTypeDisplay,
  getOrderSellerPayable,
  getOrderTisaharaFee,
  inferOrderType,
  isFirebaseOwnerAdmin,
  isSampleTestingProduct,
  LEGACY_DEMO_PRODUCT_IDS,
  linkSupplierProductToOwnerProduct,
  loginOwnerPanel,
  logoutOwnerPanel,
  OWNER_ADMIN_EMAIL,
  OwnerAuthError,
  processReturnDecision,
  processSellerPayout,
  purgeLegacyDemoProducts,
  refreshOwnerFirebaseAuth,
  SAMPLE_OWNER_PRODUCTS,
  saveCentralProduct,
  saveSupplier,
  saveSupplierProduct,
  seedSampleOwnerProducts,
  setSellerStoreLifecycle,
  setupOwnerPassword,
  updateCentralProductFields,
  updateMarketplaceOrderSettings,
  updateOrderStatus,
  updateSellerOwnerControls,
  uploadCentralProductImage,
  verifySellerBankAccount,
} from '../services/marketplaceService';
import {
  CommissionRecord,
  MarketplaceOrder,
  MarketplaceSettings,
  OrderStatus,
  OrderType,
  OwnerSessionStatus,
  PayoutProviderStatus,
  PayoutRecord,
  PayoutStatus,
  PayoutTransactionRecord,
  PRODUCT_CATEGORIES,
  Product,
  ProductCategory,
  RefundRecord,
  ReturnRequest,
  SellerBankAccount,
  SellerProfile,
  StoreProduct,
  StoreStatus,
  SupplierProductRecord,
  SupplierRecord,
  UserProfile,
} from '../types/marketplace';
import { SafeImage } from './SafeImage';

type OwnerTab =
  | 'dashboard'
  | 'dailySheet'
  | 'products'
  | 'stores'
  | 'orders'
  | 'payouts'
  | 'returns'
  | 'suppliers'
  | 'analytics'
  | 'settings';
type AnalyticsRange = 'lifetime' | '7d' | '30d' | '90d' | 'custom';

interface OwnerPanelViewProps {
  userProfile: UserProfile | null;
  products: Product[];
  sellers: SellerProfile[];
  storeProducts: StoreProduct[];
  marketplaceSettings: MarketplaceSettings | null;
  onBackToApp: () => void;
  onOpenStorefront: (sellerId: string) => void;
  onNotify: (msg: string) => void;
}

function getTimestampMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const maybeObj = ts as { toMillis?: () => number; seconds?: number };
  if (typeof maybeObj.toMillis === 'function') return maybeObj.toMillis();
  if (typeof maybeObj.seconds === 'number') return maybeObj.seconds * 1000;
  return 0;
}

function formatDateShort(ts: unknown): string {
  const ms = getTimestampMillis(ts);
  if (!ms) return 'Recent';
  return new Date(ms).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(ts: unknown): string {
  const ms = getTimestampMillis(ts);
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatINR(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function csvCell(val: unknown): string {
  const str = String(val ?? '').replace(/"/g, '""');
  return `"${str}"`;
}

function isSameLocalDay(ts: unknown): boolean {
  const ms = getTimestampMillis(ts);
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DIRECT_OWNER: 'OWNER_DIRECT (₹0 Fee)',
  SELLER_OWN_PRODUCT: 'SELLER_OWN_PRODUCT (₹10 Fee)',
  SELLER_DROPSHIP: 'OWNER_DROPSHIP_VIA_SELLER (₹5 Fee)',
};

const ALL_PAYOUT_STATUSES: PayoutStatus[] = [
  'Pending',
  'Requested',
  'Under Review',
  'Approved',
  'Processing',
  'Paid',
  'On Hold',
  'Failed',
  'Rejected',
];

const OPEN_PAYOUT_STATUSES = new Set<PayoutStatus>([
  'Pending',
  'Requested',
  'Under Review',
  'Approved',
  'Processing',
  'On Hold',
]);

const PAYOUT_STATUS_STYLES: Record<PayoutStatus, string> = {
  Pending: 'bg-amber-50 border-amber-200 text-amber-800',
  Requested: 'bg-amber-50 border-amber-200 text-amber-800',
  'Under Review': 'bg-sky-50 border-sky-200 text-sky-800',
  Approved: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  Processing: 'bg-violet-50 border-violet-200 text-violet-800',
  Paid: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'On Hold': 'bg-orange-50 border-orange-200 text-orange-800',
  Failed: 'bg-rose-50 border-rose-200 text-rose-800',
  Rejected: 'bg-rose-50 border-rose-200 text-rose-800',
};

const STORE_STATUS_STYLES: Record<StoreStatus, string> = {
  Active: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  Suspended: 'bg-amber-50 border-amber-200 text-amber-800',
  Closed: 'bg-rose-50 border-rose-200 text-rose-800',
};

const STATUS_BADGE_STYLES: Record<OrderStatus, string> = {
  Pending: 'bg-amber-50 text-amber-800 border-amber-200',
  Confirmed: 'bg-sky-50 text-sky-800 border-sky-200',
  Shipped: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const OwnerPanelView: React.FC<OwnerPanelViewProps> = ({
  userProfile,
  products,
  sellers,
  storeProducts,
  marketplaceSettings,
  onBackToApp,
  onOpenStorefront,
  onNotify,
}) => {
  // Backend Single-Password Session State
  const [sessionStatus, setSessionStatus] = useState<OwnerSessionStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [setupConfirmInput, setSetupConfirmInput] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [firebaseSyncing, setFirebaseSyncing] = useState(false);

  // Admin Workspace State
  const [activeTab, setActiveTab] = useState<OwnerTab>('dashboard');
  const [allOrders, setAllOrders] = useState<MarketplaceOrder[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allReturns, setAllReturns] = useState<ReturnRequest[]>([]);
  const [allRefunds, setAllRefunds] = useState<RefundRecord[]>([]);
  const [allPayouts, setAllPayouts] = useState<PayoutRecord[]>([]);
  const [allPayoutRequests, setAllPayoutRequests] = useState<PayoutRecord[]>([]);
  const [allPayoutTransactions, setAllPayoutTransactions] = useState<PayoutTransactionRecord[]>([]);
  const [allBankAccounts, setAllBankAccounts] = useState<SellerBankAccount[]>([]);
  const [allCommissions, setAllCommissions] = useState<CommissionRecord[]>([]);
  const [allPlatformFees, setAllPlatformFees] = useState<CommissionRecord[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<SupplierRecord[]>([]);
  const [allSupplierProducts, setAllSupplierProducts] = useState<SupplierProductRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Product Management State
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<'ALL' | ProductCategory>('ALL');
  const [productScopeFilter, setProductScopeFilter] = useState<'CENTRAL' | 'SELLER_OWNED' | 'ALL'>('CENTRAL');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [purgingDemo, setPurgingDemo] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);

  // Product Form Fields
  const [pTitle, setPTitle] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pCategory, setPCategory] = useState<ProductCategory>('Fashion');
  const [pBasePrice, setPBasePrice] = useState('');
  const [pSellingPrice, setPSellingPrice] = useState('');
  const [pMrp, setPMrp] = useState('');
  const [pMaxMargin, setPMaxMargin] = useState('');
  const [pStock, setPStock] = useState('25');
  const [pImageInput, setPImageInput] = useState('');
  const [pImages, setPImages] = useState<string[]>([]);
  const [pTags, setPTags] = useState('');
  const [pIsActive, setPIsActive] = useState(true);
  const [pAvailableForSellers, setPAvailableForSellers] = useState(true);
  const [pSupplierId, setPSupplierId] = useState('');
  const [pSupplierSku, setPSupplierSku] = useState('');

  // Orders & Daily Sheet Management State
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'ALL' | OrderType>('ALL');
  const [orderStoreFilter, setOrderStoreFilter] = useState<string>('ALL');
  const [orderRangeFilter, setOrderRangeFilter] = useState<'ALL' | '7D' | '30D' | '90D'>('ALL');
  const [dailySheetFilter, setDailySheetFilter] = useState<'ALL' | OrderType>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);
  const [courierInput, setCourierInput] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Analytics State
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('lifetime');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Store Filter & Lifecycle State
  const [storeSearch, setStoreSearch] = useState('');
  const [updatingSellerId, setUpdatingSellerId] = useState<string | null>(null);
  const [confirmCloseSellerId, setConfirmCloseSellerId] = useState<string | null>(null);

  // Payouts, Bank Verification & Commissions State
  const [payoutDecisionId, setPayoutDecisionId] = useState<string | null>(null);
  const [payoutUtrDraft, setPayoutUtrDraft] = useState('');
  const [payoutNoteDraft, setPayoutNoteDraft] = useState('');
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<'ALL' | PayoutStatus>('ALL');
  const [processingPayout, setProcessingPayout] = useState(false);
  const [providerStatus, setProviderStatus] = useState<PayoutProviderStatus | null>(null);
  const [executingProviderPayoutId, setExecutingProviderPayoutId] = useState<string | null>(null);
  const [bankNoteDrafts, setBankNoteDrafts] = useState<Record<string, string>>({});
  const [bankBeneficiaryDrafts, setBankBeneficiaryDrafts] = useState<Record<string, string>>({});
  const [verifyingBankSellerId, setVerifyingBankSellerId] = useState<string | null>(null);

  // Returns & Refunds State
  const [returnNoteDraft, setReturnNoteDraft] = useState<Record<string, string>>({});
  const [processingReturnId, setProcessingReturnId] = useState<string | null>(null);

  // Suppliers & Logistics State
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supCity, setSupCity] = useState('');
  const [supMode, setSupMode] = useState<'Manual' | 'DeoDap_API_Ready'>('Manual');
  const [supNotes, setSupNotes] = useState('');
  const [supActive, setSupActive] = useState(true);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [sprodModalOpen, setSprodModalOpen] = useState(false);
  const [editingSupplierProduct, setEditingSupplierProduct] = useState<SupplierProductRecord | null>(null);
  const [spSupplierId, setSpSupplierId] = useState('');
  const [spSku, setSpSku] = useState('');
  const [spTitle, setSpTitle] = useState('');
  const [spCost, setSpCost] = useState('');
  const [spStock, setSpStock] = useState('50');
  const [spConnectedProdId, setSpConnectedProdId] = useState('');
  const [spNotes, setSpNotes] = useState('');
  const [spActive, setSpActive] = useState(true);
  const [savingSupplierProduct, setSavingSupplierProduct] = useState(false);
  const [linkingProductId, setLinkingProductId] = useState<string | null>(null);

  // Settings State
  const [acceptingOrdersDraft, setAcceptingOrdersDraft] = useState(true);
  const [pauseMessageDraft, setPauseMessageDraft] = useState(
    'Order acceptance is temporarily paused by the marketplace owner. Please check back shortly.'
  );
  const [minPayoutDraft, setMinPayoutDraft] = useState(String(DEFAULT_MIN_PAYOUT_AMOUNT));
  const [savingSettings, setSavingSettings] = useState(false);
  const [currentPwdDraft, setCurrentPwdDraft] = useState('');
  const [newPwdDraft, setNewPwdDraft] = useState('');
  const [confirmNewPwdDraft, setConfirmNewPwdDraft] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState<boolean>(() => isFirebaseOwnerAdmin());

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, () => {
      setIsFirebaseAdmin(isFirebaseOwnerAdmin());
    });
    return () => unsubAuth();
  }, []);

  // Check current backend Owner session on mount
  useEffect(() => {
    let active = true;
    fetchOwnerSession()
      .then((res) => {
        if (!active) return;
        setSessionStatus(res);
        setIsFirebaseAdmin(isFirebaseOwnerAdmin());
        if (res.retryAfterSeconds && res.retryAfterSeconds > 0) {
          setLockoutSeconds(res.retryAfterSeconds);
          setAuthError('Incorrect owner password. Please try again after 1 minute.');
        }
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Countdown timer for 60s lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setAuthError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  // Sync settings form drafts when Firestore settings doc updates
  useEffect(() => {
    if (!marketplaceSettings) return;
    setAcceptingOrdersDraft(marketplaceSettings.acceptingOrders !== false);
    if (marketplaceSettings.pauseMessage) {
      setPauseMessageDraft(marketplaceSettings.pauseMessage);
    }
    setMinPayoutDraft(
      String(marketplaceSettings.minPayoutAmount ?? DEFAULT_MIN_PAYOUT_AMOUNT)
    );
  }, [marketplaceSettings]);

  // Idempotently ensure the 8 SAMPLE – FOR TESTING Owner Catalogue items exist in Firestore
  useEffect(() => {
    if (!sessionStatus?.authenticated || !isFirebaseAdmin) return;
    const sampleIds = new Set(SAMPLE_OWNER_PRODUCTS.map((s) => s.id));
    const existingSampleCount = products.filter((p) => sampleIds.has(p.id)).length;
    if (existingSampleCount >= SAMPLE_OWNER_PRODUCTS.length) return;
    let cancelled = false;
    seedSampleOwnerProducts()
      .then((res) => {
        if (!cancelled && res.createdCount > 0) {
          onNotify(
            `Added ${res.createdCount} sample testing product(s) to Owner Catalogue.`
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus?.authenticated, isFirebaseAdmin]);

  // Attach Owner-only Firestore listeners ONLY when authenticated both by Owner session and verified Firebase admin
  useEffect(() => {
    if (!sessionStatus?.authenticated || !isFirebaseAdmin) {
      setAllOrders([]);
      setAllUsers([]);
      setAllReturns([]);
      setAllRefunds([]);
      setAllPayouts([]);
      setAllPayoutRequests([]);
      setAllPayoutTransactions([]);
      setAllBankAccounts([]);
      setAllCommissions([]);
      setAllPlatformFees([]);
      setAllSuppliers([]);
      setAllSupplierProducts([]);
      setProviderStatus(null);
      return;
    }

    fetchPayoutProviderStatus()
      .then((status) => setProviderStatus(status))
      .catch(() => undefined);

    setOrdersLoading(true);
    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MarketplaceOrder)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllOrders(list);
        setOrdersLoading(false);
      },
      (err) => {
        setOrdersLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setAllUsers(snap.docs.map((d) => d.data() as UserProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubReturns = onSnapshot(
      collection(db, 'returns'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ReturnRequest)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllReturns(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'returns')
    );

    const unsubRefunds = onSnapshot(
      collection(db, 'refunds'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as RefundRecord)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllRefunds(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'refunds')
    );

    const unsubPayouts = onSnapshot(
      collection(db, 'payouts'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PayoutRecord)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllPayouts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payouts')
    );

    const unsubPayoutRequests = onSnapshot(
      collection(db, 'payoutRequests'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PayoutRecord)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllPayoutRequests(list);
      },
      () => setAllPayoutRequests([])
    );

    const unsubPayoutTransactions = onSnapshot(
      collection(db, 'payoutTransactions'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PayoutTransactionRecord)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllPayoutTransactions(list);
      },
      () => setAllPayoutTransactions([])
    );

    const unsubBankAccounts = onSnapshot(
      collection(db, 'sellerBankAccounts'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as SellerBankAccount)
          .sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
        setAllBankAccounts(list);
      },
      () => setAllBankAccounts([])
    );

    const unsubCommissions = onSnapshot(
      collection(db, 'commissions'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as CommissionRecord)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllCommissions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'commissions')
    );

    const unsubPlatformFees = onSnapshot(
      collection(db, 'platformFees'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as CommissionRecord)
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setAllPlatformFees(list);
      },
      () => setAllPlatformFees([])
    );

    const unsubSuppliers = onSnapshot(
      collection(db, 'suppliers'),
      (snap) => setAllSuppliers(snap.docs.map((d) => d.data() as SupplierRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers')
    );

    const unsubSupplierProducts = onSnapshot(
      collection(db, 'supplierProducts'),
      (snap) => setAllSupplierProducts(snap.docs.map((d) => d.data() as SupplierProductRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'supplierProducts')
    );

    return () => {
      unsubOrders();
      unsubUsers();
      unsubReturns();
      unsubRefunds();
      unsubPayouts();
      unsubPayoutRequests();
      unsubPayoutTransactions();
      unsubBankAccounts();
      unsubCommissions();
      unsubPlatformFees();
      unsubSuppliers();
      unsubSupplierProducts();
    };
  }, [sessionStatus?.authenticated, isFirebaseAdmin]);

  const mergedPayouts = useMemo(() => {
    const byId = new Map<string, PayoutRecord>();
    for (const p of allPayouts) byId.set(p.id, p);
    for (const p of allPayoutRequests) byId.set(p.id, p);
    return Array.from(byId.values()).sort(
      (a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
    );
  }, [allPayouts, allPayoutRequests]);

  const mergedCommissions = useMemo(() => {
    const byId = new Map<string, CommissionRecord>();
    for (const c of allCommissions) byId.set(c.id, c);
    for (const c of allPlatformFees) byId.set(c.id, c);
    return Array.from(byId.values()).sort(
      (a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
    );
  }, [allCommissions, allPlatformFees]);

  const bankAccountsBySellerId = useMemo(() => {
    const map = new Map<string, SellerBankAccount>();
    for (const b of allBankAccounts) {
      map.set(b.sellerId, b);
    }
    return map;
  }, [allBankAccounts]);

  const sellersById = useMemo(() => {
    const map = new Map<string, SellerProfile>();
    for (const s of sellers) {
      map.set(s.uid, s);
    }
    return map;
  }, [sellers]);

  // Keep selectedOrder synced with live Firestore updates
  useEffect(() => {
    if (!selectedOrder) return;
    const updated = allOrders.find((o) => o.id === selectedOrder.id);
    if (updated) {
      setSelectedOrder(updated);
    }
  }, [allOrders, selectedOrder]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of allUsers) {
      map.set(u.uid, u);
    }
    return map;
  }, [allUsers]);

  const ordersById = useMemo(() => {
    const map = new Map<string, MarketplaceOrder>();
    for (const o of allOrders) {
      map.set(o.id, o);
    }
    return map;
  }, [allOrders]);

  const legacyDemoProductsFound = useMemo(() => {
    const legacySet = new Set<string>(LEGACY_DEMO_PRODUCT_IDS);
    return products.filter((p) => legacySet.has(p.id));
  }, [products]);

  const centralOwnerProducts = useMemo(
    () => products.filter((p) => p.ownershipType !== 'SELLER_OWNED' && p.sellerId === 'tisahara_owner'),
    [products]
  );

  const sampleProductsInCatalogue = useMemo(() => {
    const sampleIds = new Set(SAMPLE_OWNER_PRODUCTS.map((s) => s.id));
    return products.filter((p) => sampleIds.has(p.id)).length;
  }, [products]);

  // Store-wise performance computed strictly from real Firestore sellers + orders
  const storeMetrics = useMemo(() => {
    const map = new Map<
      string,
      {
        sellerId: string;
        storeName: string;
        ownerName: string;
        city: string;
        state: string;
        isVerified: boolean;
        isActive: boolean;
        storeStatus: StoreStatus;
        listedProductsCount: number;
        ownProductsCount: number;
        totalOrders: number;
        completedOrders: number;
        pendingOrders: number;
        cancelledOrders: number;
        totalSales: number;
        totalSellerMargin: number;
        tisaharaFees: number;
        netSellerPayable: number;
      }
    >();

    for (const seller of sellers) {
      const storeStatus: StoreStatus =
        seller.storeStatus || (seller.isActive === false ? 'Suspended' : 'Active');
      map.set(seller.uid, {
        sellerId: seller.uid,
        storeName: seller.storeName,
        ownerName: seller.ownerName,
        city: seller.city,
        state: seller.state,
        isVerified: Boolean(seller.isVerified),
        isActive: seller.isActive !== false && storeStatus === 'Active',
        storeStatus,
        listedProductsCount: storeProducts.filter((sp) => sp.sellerId === seller.uid).length,
        ownProductsCount: products.filter(
          (p) => p.ownershipType === 'SELLER_OWNED' && p.sellerId === seller.uid
        ).length,
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        totalSales: 0,
        totalSellerMargin: 0,
        tisaharaFees: 0,
        netSellerPayable: 0,
      });
    }

    for (const ord of allOrders) {
      const existing = map.get(ord.sellerId) || {
        sellerId: ord.sellerId,
        storeName: ord.sellerStoreName || 'Direct Central Store',
        ownerName: ord.sellerId === 'tisahara_owner' ? 'TISAHARA Central' : 'Marketplace Store',
        city: '-',
        state: '-',
        isVerified: true,
        isActive: true,
        storeStatus: 'Active' as StoreStatus,
        listedProductsCount: 0,
        ownProductsCount: 0,
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        totalSales: 0,
        totalSellerMargin: 0,
        tisaharaFees: 0,
        netSellerPayable: 0,
      };

      existing.totalOrders += 1;
      if (ord.status === 'Delivered') {
        existing.completedOrders += 1;
        if (ord.returnStatus !== 'Refunded' && ord.paymentStatus !== 'Refunded') {
          existing.tisaharaFees += getOrderTisaharaFee(ord);
          existing.netSellerPayable += getOrderSellerPayable(ord);
        }
      } else if (ord.status === 'Cancelled') {
        existing.cancelledOrders += 1;
      } else {
        existing.pendingOrders += 1;
      }

      if (ord.status !== 'Cancelled') {
        existing.totalSales += Number(ord.totalAmount || 0);
        existing.totalSellerMargin += Number(ord.totalSellerMargin || 0);
      }

      map.set(ord.sellerId, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
  }, [sellers, storeProducts, products, allOrders]);

  // Overall Marketplace KPIs computed from actual Firebase collections
  const dashboardStats = useMemo(() => {
    let completed = 0;
    let pending = 0;
    let cancelled = 0;
    let totalRevenue = 0;
    let totalSellerMargins = 0;
    let totalTisaharaFees = 0;
    let todayOrdersCount = 0;

    for (const ord of allOrders) {
      if (isSameLocalDay(ord.createdAt)) todayOrdersCount += 1;
      if (ord.status === 'Delivered') {
        completed += 1;
        if (ord.returnStatus !== 'Refunded' && ord.paymentStatus !== 'Refunded') {
          totalTisaharaFees += getOrderTisaharaFee(ord);
        }
      } else if (ord.status === 'Cancelled') {
        cancelled += 1;
      } else {
        pending += 1;
      }

      if (ord.status !== 'Cancelled') {
        totalRevenue += Number(ord.totalAmount || 0);
        totalSellerMargins += Number(ord.totalSellerMargin || 0);
      }
    }

    const pendingPayoutsCount = mergedPayouts.filter((p) =>
      OPEN_PAYOUT_STATUSES.has(p.status)
    ).length;
    const openReturnsCount = allReturns.filter(
      (r) => r.status === 'Requested' || r.status === 'Approved'
    ).length;

    return {
      totalStores: sellers.length,
      totalProducts: products.length,
      centralProductsCount: centralOwnerProducts.length,
      sellerOwnProductsCount: products.length - centralOwnerProducts.length,
      totalOrders: allOrders.length,
      completedOrders: completed,
      pendingOrders: pending,
      cancelledOrders: cancelled,
      totalRevenue,
      totalSellerMargins,
      totalTisaharaFees,
      todayOrdersCount,
      pendingPayoutsCount,
      openReturnsCount,
      activeProducts: products.filter((p) => p.isActive).length,
      totalCustomers: allUsers.length,
    };
  }, [sellers.length, products, centralOwnerProducts.length, allOrders, allUsers.length, mergedPayouts, allReturns]);

  const todaysOrders = useMemo(() => {
    return allOrders.filter((ord) => {
      if (!isSameLocalDay(ord.createdAt)) return false;
      if (dailySheetFilter !== 'ALL' && inferOrderType(ord) !== dailySheetFilter) return false;
      return true;
    });
  }, [allOrders, dailySheetFilter]);

  const filteredCentralProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      const isSellerOwn = p.ownershipType === 'SELLER_OWNED' && p.sellerId !== 'tisahara_owner';
      if (productScopeFilter === 'CENTRAL' && isSellerOwn) return false;
      if (productScopeFilter === 'SELLER_OWNED' && !isSellerOwn) return false;
      if (productCategoryFilter !== 'ALL' && p.category !== productCategoryFilter) return false;
      if (q) {
        const hay = `${p.title} ${p.description} ${p.category} ${p.sellerStoreName} ${p.supplierSku || ''} ${p.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, productSearch, productCategoryFilter, productScopeFilter]);

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    if (!q) return storeMetrics;
    return storeMetrics.filter((s) =>
      `${s.storeName} ${s.ownerName} ${s.city} ${s.state} ${s.sellerId}`.toLowerCase().includes(q)
    );
  }, [storeMetrics, storeSearch]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const now = Date.now();
    const minMs =
      orderRangeFilter === '7D'
        ? now - 7 * 86400000
        : orderRangeFilter === '30D'
        ? now - 30 * 86400000
        : orderRangeFilter === '90D'
        ? now - 90 * 86400000
        : 0;

    return allOrders.filter((ord) => {
      if (orderStatusFilter !== 'ALL' && ord.status !== orderStatusFilter) return false;
      if (orderTypeFilter !== 'ALL' && inferOrderType(ord) !== orderTypeFilter) return false;
      if (orderStoreFilter !== 'ALL' && ord.sellerId !== orderStoreFilter) return false;
      if (minMs > 0) {
        const createdMs = getTimestampMillis(ord.createdAt);
        if (createdMs && createdMs < minMs) return false;
      }
      if (q) {
        const itemNames = ord.items.map((i) => i.title).join(' ');
        const customerProfile = usersById.get(ord.customerId);
        const hay = `${ord.id} ${ord.shippingAddress.fullName} ${ord.shippingAddress.phone} ${
          ord.shippingAddress.city
        } ${ord.sellerStoreName} ${itemNames} ${customerProfile?.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allOrders, orderStatusFilter, orderTypeFilter, orderStoreFilter, orderRangeFilter, orderSearch, usersById]);

  // Analytics filtered orders & derived charts data
  const analyticsData = useMemo(() => {
    const now = Date.now();
    let startMs = 0;
    let endMs = Number.MAX_SAFE_INTEGER;

    if (analyticsRange === '7d') startMs = now - 7 * 86400000;
    else if (analyticsRange === '30d') startMs = now - 30 * 86400000;
    else if (analyticsRange === '90d') startMs = now - 90 * 86400000;
    else if (analyticsRange === 'custom') {
      if (customStartDate) {
        const parsedStart = Date.parse(customStartDate);
        if (!Number.isNaN(parsedStart)) startMs = parsedStart;
      }
      if (customEndDate) {
        const parsedEnd = Date.parse(customEndDate);
        if (!Number.isNaN(parsedEnd)) endMs = parsedEnd + 86399999;
      }
    }

    const scoped = allOrders.filter((ord) => {
      const ms = getTimestampMillis(ord.createdAt);
      if (!ms) return analyticsRange === 'lifetime';
      return ms >= startMs && ms <= endMs;
    });

    const storeBreakdown = new Map<
      string,
      { storeName: string; sales: number; orders: number; completed: number; margin: number }
    >();
    const statusCounts: Record<OrderStatus, number> = {
      Pending: 0,
      Confirmed: 0,
      Shipped: 0,
      Delivered: 0,
      Cancelled: 0,
    };
    const revenueByDay = new Map<string, { label: string; sortKey: number; revenue: number; orders: number }>();

    let totalSales = 0;
    let totalMargins = 0;

    for (const ord of scoped) {
      statusCounts[ord.status] = (statusCounts[ord.status] || 0) + 1;

      const sKey = ord.sellerId;
      const prev = storeBreakdown.get(sKey) || {
        storeName: ord.sellerStoreName || 'Store',
        sales: 0,
        orders: 0,
        completed: 0,
        margin: 0,
      };
      prev.orders += 1;
      if (ord.status === 'Delivered') prev.completed += 1;
      if (ord.status !== 'Cancelled') {
        prev.sales += Number(ord.totalAmount || 0);
        prev.margin += Number(ord.totalSellerMargin || 0);
        totalSales += Number(ord.totalAmount || 0);
        totalMargins += Number(ord.totalSellerMargin || 0);
      }
      storeBreakdown.set(sKey, prev);

      const ms = getTimestampMillis(ord.createdAt) || now;
      const d = new Date(ms);
      const dayKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const dayEntry = revenueByDay.get(dayKey) || {
        label,
        sortKey: Date.parse(dayKey),
        revenue: 0,
        orders: 0,
      };
      dayEntry.orders += 1;
      if (ord.status !== 'Cancelled') {
        dayEntry.revenue += Number(ord.totalAmount || 0);
      }
      revenueByDay.set(dayKey, dayEntry);
    }

    const storeRows = Array.from(storeBreakdown.values()).sort((a, b) => b.sales - a.sales);
    const timeline = Array.from(revenueByDay.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14);

    return {
      scopedOrders: scoped,
      totalSales,
      totalMargins,
      storeRows,
      statusCounts,
      timeline,
    };
  }, [allOrders, analyticsRange, customStartDate, customEndDate]);

  // Handlers
  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0 || !passwordInput) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const next = await loginOwnerPanel(passwordInput);
      setSessionStatus(next);
      setIsFirebaseAdmin(isFirebaseOwnerAdmin());
      setPasswordInput('');
      onNotify('Owner Panel unlocked.');
    } catch (err) {
      if (err instanceof OwnerAuthError) {
        setAuthError(err.message);
        if (err.retryAfterSeconds && err.retryAfterSeconds > 0) {
          setLockoutSeconds(err.retryAfterSeconds);
        }
      } else {
        setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleFirstTimeSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.length < 8) {
      setAuthError('Owner password must be at least 8 characters.');
      return;
    }
    if (passwordInput !== setupConfirmInput) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const next = await setupOwnerPassword(passwordInput);
      setSessionStatus(next);
      setIsFirebaseAdmin(isFirebaseOwnerAdmin());
      setPasswordInput('');
      setSetupConfirmInput('');
      onNotify('Single Owner Panel password configured and unlocked.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleConnectFirebaseAdmin = async () => {
    setFirebaseSyncing(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setIsFirebaseAdmin(isFirebaseOwnerAdmin());
      onNotify('Firebase Admin credentials verified.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setFirebaseSyncing(false);
    }
  };

  const handleRefreshOwnerFirebaseToken = async () => {
    setFirebaseSyncing(true);
    setAuthError(null);
    try {
      const ok = await refreshOwnerFirebaseAuth();
      setIsFirebaseAdmin(isFirebaseOwnerAdmin());
      if (ok) {
        onNotify('Owner database session synchronized.');
      } else {
        setAuthError(
          `Automatic custom token is not configured on the server yet. Sign in with ${OWNER_ADMIN_EMAIL} below or configure FIREBASE_SERVICE_ACCOUNT_JSON.`
        );
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sync database session.');
    } finally {
      setFirebaseSyncing(false);
    }
  };

  const handleOwnerLogout = async () => {
    await logoutOwnerPanel();
    setSessionStatus((prev) => (prev ? { ...prev, authenticated: false } : null));
    setIsFirebaseAdmin(isFirebaseOwnerAdmin());
    setPasswordInput('');
    onNotify('Logged out of Owner Panel.');
  };

  const openCreateProductModal = () => {
    setEditingProduct(null);
    setPTitle('');
    setPDescription('');
    setPCategory('Fashion');
    setPBasePrice('');
    setPSellingPrice('');
    setPMrp('');
    setPMaxMargin('');
    setPStock('25');
    setPImageInput('');
    setPImages([]);
    setPTags('');
    setPIsActive(true);
    setPAvailableForSellers(true);
    setPSupplierId('');
    setPSupplierSku('');
    setProductFormError(null);
    setProductModalOpen(true);
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setPTitle(prod.title);
    setPDescription(prod.description);
    setPCategory(prod.category);
    setPBasePrice(String(prod.basePrice));
    setPSellingPrice(String(prod.sellingPrice));
    setPMrp(String(prod.mrp));
    setPMaxMargin(typeof prod.maxSellerMargin === 'number' ? String(prod.maxSellerMargin) : '');
    setPStock(String(prod.stock));
    setPImageInput('');
    setPImages(prod.images || []);
    setPTags((prod.tags || []).join(', '));
    setPIsActive(prod.isActive);
    setPAvailableForSellers(prod.availableForSellers !== false);
    setPSupplierId(prod.supplierId || '');
    setPSupplierSku(prod.supplierSku || '');
    setProductFormError(null);
    setProductModalOpen(true);
  };

  const handleUploadImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setProductFormError(null);
    try {
      const url = await uploadCentralProductImage(file);
      setPImages((prev) => [...prev, url].slice(0, 5));
      onNotify('Product image uploaded.');
    } catch (err) {
      setProductFormError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleAddImageUrl = () => {
    const clean = pImageInput.trim();
    if (!clean) return;
    setPImages((prev) => [...prev, clean].slice(0, 5));
    setPImageInput('');
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError(null);

    const base = Number(pBasePrice);
    const selling = Number(pSellingPrice || pBasePrice);
    const mrp = Number(pMrp || pSellingPrice || pBasePrice);
    const stock = Number(pStock);
    const maxMargin = pMaxMargin.trim() !== '' ? Number(pMaxMargin) : undefined;

    if (pTitle.trim().length < 2) {
      setProductFormError('Product title must be at least 2 characters.');
      return;
    }
    if (!Number.isFinite(base) || base < 0) {
      setProductFormError('Please enter a valid Base Price.');
      return;
    }
    if (!Number.isFinite(selling) || selling < base) {
      setProductFormError('Default Selling Price must be at least the Base Price.');
      return;
    }
    if (!Number.isFinite(mrp) || mrp < selling) {
      setProductFormError('MRP must be equal to or greater than Selling Price.');
      return;
    }
    if (pImages.length === 0) {
      setProductFormError('Upload or paste at least one product image.');
      return;
    }

    const chosenSupplier = allSuppliers.find((s) => s.id === pSupplierId);

    const input: CentralProductInput = {
      title: pTitle.trim(),
      description: pDescription.trim() || `${pTitle.trim()} - Verified central catalogue product.`,
      category: pCategory,
      basePrice: base,
      sellingPrice: selling,
      mrp,
      ...(maxMargin !== undefined && Number.isFinite(maxMargin) ? { maxSellerMargin: maxMargin } : {}),
      stock: Number.isFinite(stock) ? stock : 0,
      images: pImages,
      tags: pTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isActive: pIsActive,
      availableForSellers: pAvailableForSellers,
      ...(chosenSupplier ? { supplierId: chosenSupplier.id, supplierName: chosenSupplier.name } : {}),
      ...(pSupplierSku.trim() ? { supplierSku: pSupplierSku.trim() } : {}),
    };

    setSavingProduct(true);
    try {
      await saveCentralProduct(input, editingProduct || undefined);
      setProductModalOpen(false);
      onNotify(editingProduct ? 'Central product updated.' : 'Central product added to marketplace.');
    } catch (err) {
      setProductFormError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductActive = async (prod: Product) => {
    try {
      await updateCentralProductFields(prod.id, { isActive: !prod.isActive });
      onNotify(`"${prod.title}" ${!prod.isActive ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update product.');
    }
  };

  const handleToggleAvailableForSellers = async (prod: Product) => {
    const nextVal = prod.availableForSellers === false;
    try {
      await updateCentralProductFields(prod.id, { availableForSellers: nextVal });
      onNotify(
        `"${prod.title}" ${nextVal ? 'enabled' : 'disabled'} for store owner dropshipping.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update availability.');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteCentralProduct(productId);
      setConfirmDeleteProductId(null);
      onNotify('Product permanently removed from central & store catalogues.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete product.');
    }
  };

  const handlePurgeDemoProducts = async () => {
    setPurgingDemo(true);
    try {
      const removed = await purgeLegacyDemoProducts();
      onNotify(
        removed > 0
          ? `Removed ${removed} legacy demo product(s). Real customers, stores, and orders are untouched.`
          : 'No legacy demo products remaining.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to purge legacy demo products.');
    } finally {
      setPurgingDemo(false);
    }
  };

  const handleSeedSampleProducts = async () => {
    setSeedingSample(true);
    try {
      const { createdCount, skippedCount } = await seedSampleOwnerProducts();
      onNotify(
        createdCount > 0
          ? `Added ${createdCount} sample testing product(s) to Firestore Owner Catalogue (${skippedCount} already present).`
          : `All ${SAMPLE_OWNER_PRODUCTS.length} sample testing products already exist in Firestore (no duplicates created).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to load sample testing products.');
    } finally {
      setSeedingSample(false);
    }
  };

  const handleToggleSellerFlag = async (
    sellerId: string,
    field: 'isVerified' | 'isActive',
    nextVal: boolean
  ) => {
    setUpdatingSellerId(sellerId);
    try {
      if (field === 'isActive') {
        await setSellerStoreLifecycle(sellerId, nextVal ? 'Active' : 'Suspended');
        onNotify(`Store ${nextVal ? 'reactivated' : 'suspended'}.`);
      } else {
        await updateSellerOwnerControls(sellerId, { isVerified: nextVal });
        onNotify(`Store ${nextVal ? 'verified' : 'unverified'}.`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update store permissions.');
    } finally {
      setUpdatingSellerId(null);
    }
  };

  const handlePermanentCloseStore = async (sellerId: string) => {
    setUpdatingSellerId(sellerId);
    try {
      await setSellerStoreLifecycle(sellerId, 'Closed');
      setConfirmCloseSellerId(null);
      onNotify('Store permanently closed. Historical orders and ledger records remain preserved.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to close store.');
    } finally {
      setUpdatingSellerId(null);
    }
  };

  const handleSaveOrderAcceptance = async (nextAccepting: boolean, messageOverride?: string) => {
    const parsedMinPayout = Math.max(
      0,
      Math.round(Number(minPayoutDraft) || DEFAULT_MIN_PAYOUT_AMOUNT)
    );
    setSavingSettings(true);
    try {
      await updateMarketplaceOrderSettings(
        nextAccepting,
        messageOverride ?? pauseMessageDraft,
        auth.currentUser?.email || 'owner',
        parsedMinPayout
      );
      setAcceptingOrdersDraft(nextAccepting);
      setMinPayoutDraft(String(parsedMinPayout));
      onNotify(
        `Marketplace settings saved (Orders: ${
          nextAccepting ? 'Accepting' : 'Paused'
        }, Min Payout: ₹${parsedMinPayout}).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update order settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOwnerUpdateOrderStatus = async (order: MarketplaceOrder, nextStatus: OrderStatus) => {
    setUpdatingOrderId(order.id);
    try {
      await updateOrderStatus(order, nextStatus, {
        courierPartner: courierInput || order.courierPartner,
        trackingNumber: trackingInput || order.trackingNumber,
      });
      onNotify(`Order ${order.id} updated to ${nextStatus}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Order update failed.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleVerifyBankAccount = async (
    account: SellerBankAccount,
    decision: 'Verified' | 'Rejected'
  ) => {
    const note = (bankNoteDrafts[account.sellerId] || '').trim();
    if (decision === 'Rejected' && !note) {
      onNotify('Enter a clear rejection reason before rejecting bank details.');
      return;
    }
    setVerifyingBankSellerId(account.sellerId);
    try {
      await verifySellerBankAccount({
        bankAccount: account,
        decision,
        verificationNote: note || undefined,
        beneficiaryId: (bankBeneficiaryDrafts[account.sellerId] || '').trim() || undefined,
      });
      onNotify(
        `Bank account ${account.maskedAccountNumber} (${account.ifscCode}) marked ${decision}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update bank verification.');
    } finally {
      setVerifyingBankSellerId(null);
    }
  };

  const handleProcessPayoutDecision = async (payout: PayoutRecord, decision: PayoutStatus) => {
    if (payout.status === 'Paid') {
      onNotify('Completed Paid payouts are locked and cannot be edited.');
      return;
    }
    const cleanRef = payoutUtrDraft.trim();
    if (decision === 'Paid' && !cleanRef) {
      onNotify('Enter a valid UTR / Bank Transaction Reference before marking Paid.');
      return;
    }
    setProcessingPayout(true);
    try {
      await processSellerPayout({
        payout,
        decision,
        transactionRef: cleanRef || undefined,
        adminNote: payoutNoteDraft.trim() || undefined,
        paymentProvider: payout.paymentProvider || providerStatus?.provider || 'manual',
      });
      setPayoutDecisionId(null);
      setPayoutUtrDraft('');
      setPayoutNoteDraft('');
      onNotify(
        decision === 'Paid'
          ? `Payout ${payout.id} marked Paid (Ref: ${cleanRef}).`
          : decision === 'Rejected' || decision === 'Failed'
          ? `Payout ${payout.id} marked ${decision}; linked orders returned to Eligible.`
          : `Payout ${payout.id} updated to ${decision}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to process payout.');
    } finally {
      setProcessingPayout(false);
    }
  };

  const handleExecuteProviderPayout = async (payout: PayoutRecord) => {
    if (!providerStatus?.connected || !providerStatus.supportsAutoPayout) {
      onNotify('Configure RazorpayX or Cashfree Payout secrets on backend before executing live transfers.');
      return;
    }
    const bankAccount = bankAccountsBySellerId.get(payout.sellerId);
    if (!bankAccount || !bankAccount.isVerified) {
      onNotify('Seller must have a verified bank account before executing a provider transfer.');
      return;
    }
    setExecutingProviderPayoutId(payout.id);
    try {
      const result = await executeOwnerProviderPayout({ payout, bankAccount });
      const nextStatus: PayoutStatus = result.status === 'Paid' ? 'Paid' : 'Processing';
      await processSellerPayout({
        payout,
        decision: nextStatus,
        transactionRef: result.paymentReference,
        adminNote: `Provider ${result.paymentProvider} transfer initiated (${result.paymentReference}).`,
        paymentProvider: result.paymentProvider,
      });
      onNotify(
        `Provider transfer executed via ${result.paymentProvider}: ${nextStatus} (Ref: ${result.paymentReference}).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Provider payout failed.');
    } finally {
      setExecutingProviderPayoutId(null);
    }
  };

  const handleOwnerReturnDecision = async (
    ret: ReturnRequest,
    decision: 'Approve_Refund' | 'Approved' | 'Rejected'
  ) => {
    setProcessingReturnId(ret.id);
    try {
      await processReturnDecision({
        returnRequest: ret,
        order: ordersById.get(ret.orderId),
        decision,
        adminNote: returnNoteDraft[ret.id] || undefined,
      });
      onNotify(
        decision === 'Approve_Refund'
          ? `Refund processed for Order ${ret.orderId} & commission voided.`
          : `Return ${ret.orderId} marked ${decision}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to process return.');
    } finally {
      setProcessingReturnId(null);
    }
  };

  const openSupplierModal = (sup?: SupplierRecord) => {
    setEditingSupplier(sup || null);
    setSupName(sup?.name || '');
    setSupContact(sup?.contactPerson || '');
    setSupPhone(sup?.phone || '');
    setSupEmail(sup?.email || '');
    setSupCity(sup?.city || '');
    setSupMode(sup?.integrationMode || 'Manual');
    setSupNotes(sup?.notes || '');
    setSupActive(sup ? sup.isActive : true);
    setSupModalOpen(true);
  };

  const handleSaveSupplierForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supName.trim().length < 2) {
      onNotify('Supplier name is required.');
      return;
    }
    setSavingSupplier(true);
    try {
      await saveSupplier(
        {
          name: supName.trim(),
          contactPerson: supContact.trim() || undefined,
          phone: supPhone.trim() || undefined,
          email: supEmail.trim() || undefined,
          city: supCity.trim() || undefined,
          integrationMode: supMode,
          notes: supNotes.trim() || undefined,
          isActive: supActive,
        },
        editingSupplier || undefined
      );
      setSupModalOpen(false);
      onNotify(editingSupplier ? 'Supplier updated.' : 'Supplier added.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save supplier.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const openSupplierProductModal = (sp?: SupplierProductRecord) => {
    setEditingSupplierProduct(sp || null);
    setSpSupplierId(sp?.supplierId || allSuppliers[0]?.id || '');
    setSpSku(sp?.sku || '');
    setSpTitle(sp?.title || '');
    setSpCost(sp ? String(sp.costPrice) : '');
    setSpStock(sp ? String(sp.stock) : '50');
    setSpConnectedProdId(sp?.connectedOwnerProductId || '');
    setSpNotes(sp?.notes || '');
    setSpActive(sp ? sp.isActive : true);
    setSprodModalOpen(true);
  };

  const handleSaveSupplierProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = allSuppliers.find((s) => s.id === spSupplierId);
    if (!sup) {
      onNotify('Select an active supplier first.');
      return;
    }
    if (!spSku.trim() || spTitle.trim().length < 2) {
      onNotify('Supplier SKU and product title are required.');
      return;
    }
    setSavingSupplierProduct(true);
    try {
      await saveSupplierProduct(
        {
          supplierId: sup.id,
          supplierName: sup.name,
          sku: spSku.trim(),
          title: spTitle.trim(),
          costPrice: Number(spCost || 0),
          stock: Number(spStock || 0),
          connectedOwnerProductId: spConnectedProdId || undefined,
          notes: spNotes.trim() || undefined,
          isActive: spActive,
        },
        editingSupplierProduct || undefined
      );
      setSprodModalOpen(false);
      onNotify(editingSupplierProduct ? 'Supplier SKU updated.' : 'Supplier SKU added.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save supplier product.');
    } finally {
      setSavingSupplierProduct(false);
    }
  };

  const handleLinkSupplierToCentralProduct = async (
    sp: SupplierProductRecord,
    ownerProdId: string
  ) => {
    if (!ownerProdId) return;
    setLinkingProductId(sp.id);
    try {
      await linkSupplierProductToOwnerProduct(sp, ownerProdId);
      onNotify(`Linked SKU ${sp.sku} to central product ${ownerProdId}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to link supplier SKU.');
    } finally {
      setLinkingProductId(null);
    }
  };

  const exportCsvRows = (filename: string, header: string[], rows: unknown[][]) => {
    const csv = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportOrdersCsv = (list: MarketplaceOrder[] = filteredOrders, prefix = 'tisahara-orders') => {
    const header = [
      'Order ID',
      'Date',
      'Order Type',
      'Customer Name',
      'Customer Phone',
      'City',
      'State',
      'Pincode',
      'Store Name',
      'Products',
      'Base Value',
      'Selling Subtotal',
      'Store Margin',
      'TISAHARA Fee',
      'Seller Payable',
      'Delivery Fee',
      'Total Order Value',
      'Payment Method',
      'Status',
      'Return Status',
      'Payout Status',
    ];
    const rows = list.map((ord) => {
      const baseSum = ord.items.reduce((s, i) => s + Number(i.basePrice || 0) * i.quantity, 0);
      const productsSummary = ord.items.map((i) => `${i.title} x${i.quantity}`).join('; ');
      return [
        ord.id,
        formatDateShort(ord.createdAt),
        formatOrderTypeDisplay(inferOrderType(ord)),
        ord.shippingAddress.fullName,
        ord.shippingAddress.phone,
        ord.shippingAddress.city,
        ord.shippingAddress.state,
        ord.shippingAddress.pincode,
        ord.sellerStoreName,
        productsSummary,
        baseSum,
        ord.subtotal,
        ord.totalSellerMargin,
        getOrderTisaharaFee(ord),
        getOrderSellerPayable(ord),
        ord.deliveryFee,
        ord.totalAmount,
        ord.paymentMethod,
        ord.status,
        ord.returnStatus || 'None',
        ord.payoutStatus || 'Pending',
      ];
    });
    exportCsvRows(`${prefix}-${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
    onNotify(`Exported ${list.length} order(s) to CSV.`);
  };

  const handleChangeOwnerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwdDraft.length < 8) {
      onNotify('New owner password must be at least 8 characters.');
      return;
    }
    if (newPwdDraft !== confirmNewPwdDraft) {
      onNotify('New password and confirmation do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await changeOwnerPassword(currentPwdDraft, newPwdDraft);
      setCurrentPwdDraft('');
      setNewPwdDraft('');
      setConfirmNewPwdDraft('');
      onNotify('Owner Panel password updated securely.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // Loading state
  if (sessionLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-[#F8FAFC] px-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-sm w-full text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-900">Verifying Owner Session…</p>
          <p className="text-xs text-slate-500">Checking secure backend session state</p>
        </div>
      </div>
    );
  }

  // Gate 1: Single-Password Owner Authentication
  if (!sessionStatus?.authenticated) {
    const needsSetup = !sessionStatus?.configured;

    return (
      <div className="min-h-[80vh] bg-[#F8FAFC] py-10 px-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Account
            </button>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-900" />
              Owner Access
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-3">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              {needsSetup ? 'Initialize Owner Panel Password' : 'TISAHARA Owner Panel'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              {needsSetup
                ? 'Set your single Owner Panel password on the backend to protect marketplace administration.'
                : 'Enter your Owner Panel password to manage central products, stores, orders, and analytics.'}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="space-y-1 flex-1">
                <p className="font-semibold">{authError}</p>
                {lockoutSeconds > 0 && (
                  <p className="font-mono-num text-rose-700">
                    Retry available in <strong>{lockoutSeconds}s</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {needsSetup ? (
            !isFirebaseAdmin ? (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">
                    One-Time Owner Identity Verification
                  </p>
                  <p>
                    To initialize your single Owner Panel password (or set{' '}
                    <code className="font-mono bg-white px-1.5 py-0.5 border border-slate-200 rounded">
                      OWNER_PANEL_PASSWORD
                    </code>{' '}
                    in Secrets), sign in once with your authorized Google account.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={firebaseSyncing}
                  onClick={handleConnectFirebaseAdmin}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {firebaseSyncing ? 'Verifying Google Account…' : 'Verify Owner Google Account'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleFirstTimeSetup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Create Single Owner Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoFocus
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm Owner Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={setupConfirmInput}
                    onChange={(e) => setSetupConfirmInput(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {authSubmitting ? 'Saving Password…' : 'Save & Open Owner Panel'}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleOwnerLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Owner Panel Password
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  disabled={lockoutSeconds > 0}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter owner password"
                  className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={authSubmitting || lockoutSeconds > 0 || !passwordInput}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {lockoutSeconds > 0
                  ? `Locked (${lockoutSeconds}s)`
                  : authSubmitting
                  ? 'Verifying…'
                  : 'Open Owner Panel'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Gate 2: Ensure Firebase Admin token matches authorized owner so Firestore Security Rules permit writes
  if (!isFirebaseAdmin) {
    return (
      <div className="min-h-[80vh] bg-[#F8FAFC] py-10 px-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleOwnerLogout}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Lock Panel
            </button>
          </div>

          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>

          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-bold text-slate-900">
              Owner Session Ready — Sync Firestore Admin Access
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Your single Owner Panel password is verified. Firestore Security Rules require an
              authenticated admin claim to read and manage marketplace collections.
            </p>
          </div>

          {authError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-medium">
              {authError}
            </div>
          )}

          <div className="space-y-2.5">
            {sessionStatus?.firebaseAdminConfigured && (
              <button
                type="button"
                disabled={firebaseSyncing}
                onClick={handleRefreshOwnerFirebaseToken}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                {firebaseSyncing ? 'Syncing Owner Database Session…' : 'Open Owner Dashboard'}
              </button>
            )}
            <button
              type="button"
              disabled={firebaseSyncing}
              onClick={handleConnectFirebaseAdmin}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                sessionStatus?.firebaseAdminConfigured
                  ? 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {firebaseSyncing
                ? 'Authorizing Firebase Admin…'
                : `Verify with Owner Google (${OWNER_ADMIN_EMAIL})`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const acceptingOrders = marketplaceSettings?.acceptingOrders !== false;

  const navItems: Array<{
    id: OwnerTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'dailySheet',
      label: "Today's Sheet",
      icon: Calendar,
      badge: dashboardStats.todayOrdersCount > 0 ? dashboardStats.todayOrdersCount : undefined,
    },
    { id: 'products', label: 'Products', icon: Package, badge: products.length },
    { id: 'stores', label: 'Stores', icon: Store, badge: sellers.length },
    {
      id: 'orders',
      label: 'Orders',
      icon: ShoppingBag,
      badge: dashboardStats.pendingOrders > 0 ? dashboardStats.pendingOrders : undefined,
    },
    {
      id: 'payouts',
      label: 'Payouts & Fees',
      icon: Wallet,
      badge: dashboardStats.pendingPayoutsCount > 0 ? dashboardStats.pendingPayoutsCount : undefined,
    },
    {
      id: 'returns',
      label: 'Returns (7d)',
      icon: RotateCcw,
      badge: dashboardStats.openReturnsCount > 0 ? dashboardStats.openReturnsCount : undefined,
    },
    { id: 'suppliers', label: 'Suppliers', icon: Truck, badge: allSuppliers.length || undefined },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // SVG Chart helper metrics
  const maxStoreSales = Math.max(1, ...analyticsData.storeRows.map((s) => s.sales));
  const maxStoreOrders = Math.max(1, ...analyticsData.storeRows.map((s) => s.orders));
  const maxTimelineRev = Math.max(1, ...analyticsData.timeline.map((t) => t.revenue));
  const totalStatusCount = Math.max(
    1,
    Object.values(analyticsData.statusCounts).reduce((s, n) => s + n, 0)
  );

  const donutSegments: Array<{ label: OrderStatus; count: number; color: string }> = [
    { label: 'Delivered', count: analyticsData.statusCounts.Delivered, color: '#059669' },
    { label: 'Pending', count: analyticsData.statusCounts.Pending, color: '#D97706' },
    { label: 'Confirmed', count: analyticsData.statusCounts.Confirmed, color: '#0284C7' },
    { label: 'Shipped', count: analyticsData.statusCounts.Shipped, color: '#4F46E5' },
    { label: 'Cancelled', count: analyticsData.statusCounts.Cancelled, color: '#E11D48' },
  ];

  let cumulativeFraction = 0;

  return (
    <div className="min-h-[85vh] bg-[#F8FAFC] text-slate-900">
      {/* Compact Top Workspace Header */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Storefront</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-sm sm:text-base font-bold text-slate-900 truncate">
                  TISAHARA Owner Panel
                </h1>
                <span className="hidden md:inline-block text-xs text-slate-500 truncate">
                  · {userProfile?.name || 'Marketplace Owner'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => handleSaveOrderAcceptance(!acceptingOrders)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                acceptingOrders
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
              }`}
            >
              {acceptingOrders ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Orders: Accepting</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>Orders: Paused</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOwnerLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Section Switcher */}
        <div className="lg:hidden border-t border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`font-mono-num text-[10px] px-1.5 py-0.5 rounded ${
                      active ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Desktop Sidebar + Workspace Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6 items-start">
        <aside className="hidden lg:block w-56 shrink-0 sticky top-36 space-y-1.5">
          <div className="bg-white border border-slate-200 rounded-xl p-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`font-mono-num text-[11px] px-1.5 py-0.5 rounded ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs space-y-2">
            <p className="font-semibold text-slate-900">Marketplace Status</p>
            <div className="flex items-center justify-between text-slate-600">
              <span>Order Gate</span>
              <span className={`font-semibold ${acceptingOrders ? 'text-emerald-700' : 'text-rose-700'}`}>
                {acceptingOrders ? 'Open' : 'Paused'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Registered Users</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {dashboardStats.totalCustomers}
              </span>
            </div>
          </div>
        </aside>

        {/* Active Section Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* =========================================================
              1. DASHBOARD OVERVIEW
              ========================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                    Marketplace Overview
                  </h2>
                  <p className="text-xs text-slate-500">
                    Live operational totals synced directly from Firestore collections.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openCreateProductModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Central Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Manage Orders
                  </button>
                </div>
              </div>

              {legacyDemoProductsFound.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-amber-950">
                      {legacyDemoProductsFound.length} legacy demo product(s) detected in catalog
                    </p>
                    <p className="text-amber-800">
                      Remove them in one click to leave only real owner-added products. Customers,
                      stores, and existing orders are untouched.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={purgingDemo}
                    onClick={handlePurgeDemoProducts}
                    className="px-3.5 py-2 rounded-lg bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {purgingDemo ? 'Removing…' : 'Remove Demo Products'}
                  </button>
                </div>
              )}

              {/* Primary KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Marketplace Revenue
                  </p>
                  <p className="font-mono-num text-xl sm:text-2xl font-bold text-slate-900">
                    {formatINR(dashboardStats.totalRevenue)}
                  </p>
                  <p className="text-[11px] text-slate-500">Excludes cancelled orders</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    TISAHARA Platform Fees
                  </p>
                  <p className="font-mono-num text-xl sm:text-2xl font-bold text-emerald-700">
                    {formatINR(dashboardStats.totalTisaharaFees)}
                  </p>
                  <p className="text-[11px] text-slate-500">₹10 Type A · ₹5 Type B (Delivered)</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Registered Stores
                  </p>
                  <p className="font-mono-num text-xl sm:text-2xl font-bold text-slate-900">
                    {dashboardStats.totalStores}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {sellers.filter((s) => s.isActive !== false && s.storeStatus !== 'Suspended' && s.storeStatus !== 'Closed').length} active storefronts
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Total Products
                  </p>
                  <p className="font-mono-num text-xl sm:text-2xl font-bold text-slate-900">
                    {dashboardStats.totalProducts}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {dashboardStats.centralProductsCount} Owner · {dashboardStats.sellerOwnProductsCount} Seller Own
                  </p>
                </div>
              </div>

              {/* Order Status & Action Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Completed Orders</p>
                    <p className="font-mono-num text-xl font-bold text-emerald-700 mt-0.5">
                      {dashboardStats.completedOrders}
                    </p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Pending / Active Orders</p>
                    <p className="font-mono-num text-xl font-bold text-amber-700 mt-0.5">
                      {dashboardStats.pendingOrders}
                    </p>
                  </div>
                  <Truck className="w-5 h-5 text-amber-600" />
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('payouts')}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 flex items-center justify-between text-left cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-500">Payout Requests</p>
                    <p className="font-mono-num text-xl font-bold text-slate-900 mt-0.5">
                      {dashboardStats.pendingPayoutsCount}
                    </p>
                  </div>
                  <Wallet className="w-5 h-5 text-slate-700" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('returns')}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 flex items-center justify-between text-left cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-500">7-Day Returns Open</p>
                    <p className="font-mono-num text-xl font-bold text-rose-700 mt-0.5">
                      {dashboardStats.openReturnsCount}
                    </p>
                  </div>
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                </button>
              </div>

              {/* Store-wise Earnings & Order Count Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Store-Wise Earnings & Orders
                    </h3>
                    <p className="text-xs text-slate-500">
                      Real-time performance generated by each registered store.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('stores')}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    View all stores →
                  </button>
                </div>

                {storeMetrics.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No registered stores found in Firestore yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Store</th>
                          <th className="px-4 py-3 text-right">Orders</th>
                          <th className="px-4 py-3 text-right">Completed</th>
                          <th className="px-4 py-3 text-right">Pending</th>
                          <th className="px-4 py-3 text-right">Store Earnings (Margin)</th>
                          <th className="px-4 py-3 text-right">Gross Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {storeMetrics.map((s) => (
                          <tr key={s.sellerId} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{s.storeName}</p>
                              <p className="text-[11px] text-slate-500">
                                {s.ownerName} · {s.city}, {s.state}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num font-semibold">
                              {s.totalOrders}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num text-emerald-700">
                              {s.completedOrders}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num text-amber-700">
                              {s.pendingOrders}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num font-semibold text-slate-900">
                              {formatINR(s.totalSellerMargin)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num font-semibold text-slate-900">
                              {formatINR(s.totalSales)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent Orders Preview */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
                  <h3 className="font-display text-sm font-bold text-slate-900">Recent Orders</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    Open order manager →
                  </button>
                </div>
                {ordersLoading ? (
                  <div className="p-8 text-center text-xs text-slate-500">Loading orders…</div>
                ) : allOrders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No customer orders placed yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {allOrders.slice(0, 6).map((ord) => (
                      <div
                        key={ord.id}
                        className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num text-xs font-bold text-slate-900">
                              {ord.id}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                STATUS_BADGE_STYLES[ord.status]
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5 truncate">
                            {ord.shippingAddress.fullName} · {ord.sellerStoreName} ·{' '}
                            {formatDateShort(ord.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono-num text-sm font-bold text-slate-900">
                            {formatINR(ord.totalAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(ord);
                              setCourierInput(ord.courierPartner || '');
                              setTrackingInput(ord.trackingNumber || '');
                              setActiveTab('orders');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              1B. TODAY'S DAILY ORDER SHEET (FULFILLMENT DISPATCH)
              ========================================================= */}
          {activeTab === 'dailySheet' && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Today&apos;s Daily Order Sheet (
                    {new Date().toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    )
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pack-list & dispatch sheet for today&apos;s orders across Owner Direct, Type A
                    Seller Own, and Type B Dropship channels.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportOrdersCsv(todaysOrders, 'tisahara-daily-order-sheet')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Today CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Sheet
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'ALL', label: `All Today (${dashboardStats.todayOrdersCount})` },
                    { id: 'DIRECT_OWNER', label: 'Owner Direct' },
                    { id: 'SELLER_DROPSHIP', label: 'Type B Dropship (Owner Packs)' },
                    { id: 'SELLER_OWN_PRODUCT', label: 'Type A Own (Seller Packs)' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDailySheetFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      dailySheetFilter === tab.id
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {todaysOrders.length === 0 ? (
                  <div className="p-10 text-center space-y-2 text-xs text-slate-500">
                    <Calendar className="w-7 h-7 text-slate-400 mx-auto" />
                    <p className="font-semibold text-slate-800">No orders placed today yet</p>
                    <p>Orders placed today will appear automatically here for packing & dispatch.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3.5 py-3">Order & Time</th>
                          <th className="px-3.5 py-3">Channel</th>
                          <th className="px-3.5 py-3">Customer & Delivery Address</th>
                          <th className="px-3.5 py-3">Items to Pack</th>
                          <th className="px-3.5 py-3 text-right">Amount</th>
                          <th className="px-3.5 py-3">Status</th>
                          <th className="px-3.5 py-3 text-right">Quick Dispatch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {todaysOrders.map((ord) => {
                          const ot = inferOrderType(ord);
                          return (
                            <tr key={ord.id} className="hover:bg-slate-50/70">
                              <td className="px-3.5 py-3 whitespace-nowrap">
                                <p className="font-mono-num font-bold text-slate-900">{ord.id}</p>
                                <p className="text-[11px] text-slate-500">
                                  {formatDateTime(ord.createdAt)}
                                </p>
                              </td>
                              <td className="px-3.5 py-3">
                                <p className="font-semibold text-slate-800">
                                  {ORDER_TYPE_LABELS[ot]}
                                </p>
                                <p className="text-[11px] text-slate-500">{ord.sellerStoreName}</p>
                              </td>
                              <td className="px-3.5 py-3">
                                <p className="font-semibold text-slate-900">
                                  {ord.shippingAddress.fullName} · {ord.shippingAddress.phone}
                                </p>
                                <p className="text-[11px] text-slate-600 max-w-[240px]">
                                  {ord.shippingAddress.street}, {ord.shippingAddress.city},{' '}
                                  {ord.shippingAddress.state} - {ord.shippingAddress.pincode}
                                </p>
                              </td>
                              <td className="px-3.5 py-3">
                                {ord.items.map((item, idx) => (
                                  <p key={idx} className="text-slate-800">
                                    <span className="font-mono-num font-bold">
                                      {item.quantity}×
                                    </span>{' '}
                                    {item.title}
                                  </p>
                                ))}
                              </td>
                              <td className="px-3.5 py-3 text-right font-mono-num font-bold text-slate-900">
                                {formatINR(ord.totalAmount)}
                                <p className="text-[10px] font-normal text-slate-500">
                                  {ord.paymentMethod === 'COD' ? 'COD' : 'Online'}
                                </p>
                              </td>
                              <td className="px-3.5 py-3 whitespace-nowrap">
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                    STATUS_BADGE_STYLES[ord.status]
                                  }`}
                                >
                                  {ord.status}
                                </span>
                              </td>
                              <td className="px-3.5 py-3 text-right whitespace-nowrap space-x-1.5">
                                {ord.status === 'Pending' && (
                                  <button
                                    type="button"
                                    disabled={updatingOrderId === ord.id}
                                    onClick={() => handleOwnerUpdateOrderStatus(ord, 'Confirmed')}
                                    className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                )}
                                {(ord.status === 'Pending' || ord.status === 'Confirmed') && (
                                  <button
                                    type="button"
                                    disabled={updatingOrderId === ord.id}
                                    onClick={() => handleOwnerUpdateOrderStatus(ord, 'Shipped')}
                                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    Ship
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOrder(ord);
                                    setCourierInput(ord.courierPartner || '');
                                    setTrackingInput(ord.trackingNumber || '');
                                  }}
                                  className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                                >
                                  Inspect
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
            </div>
          )}

          {/* =========================================================
              2. CENTRAL & SELLER PRODUCTS CATALOGUE
              ========================================================= */}
          {activeTab === 'products' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                    Central & Marketplace Products
                  </h2>
                  <p className="text-xs text-slate-500">
                    Manage Owner central products (dropshipping enabled for Type B sellers) and
                    inspect Type A Seller-owned products.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={seedingSample}
                    onClick={handleSeedSampleProducts}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    <Package className="w-3.5 h-3.5" />
                    {seedingSample
                      ? 'Saving Samples…'
                      : sampleProductsInCatalogue >= SAMPLE_OWNER_PRODUCTS.length
                      ? `Sample Testing Products (${sampleProductsInCatalogue}/8)`
                      : `Add 8 Sample Testing Products (${sampleProductsInCatalogue}/8)`}
                  </button>
                  <button
                    type="button"
                    onClick={openCreateProductModal}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Central Product
                  </button>
                </div>
              </div>

              {legacyDemoProductsFound.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-amber-950">
                      Clean Legacy Demo Products ({legacyDemoProductsFound.length} found)
                    </p>
                    <p className="text-amber-800">
                      Delete seeded demo items and their store links while preserving real customer
                      profiles, stores, and orders.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={purgingDemo}
                    onClick={handlePurgeDemoProducts}
                    className="px-3.5 py-2 rounded-lg bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {purgingDemo ? 'Removing…' : 'Remove All Demo Products'}
                  </button>
                </div>
              )}

              {/* Search & Scope Filter */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products by title, store, SKU, ID…"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <select
                  value={productScopeFilter}
                  onChange={(e) =>
                    setProductScopeFilter(e.target.value as 'CENTRAL' | 'SELLER_OWNED' | 'ALL')
                  }
                  aria-label="Filter product ownership"
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                >
                  <option value="CENTRAL">
                    Owner Central ({dashboardStats.centralProductsCount})
                  </option>
                  <option value="SELLER_OWNED">
                    Type A Seller Own ({dashboardStats.sellerOwnProductsCount})
                  </option>
                  <option value="ALL">All Products ({products.length})</option>
                </select>
                <select
                  value={productCategoryFilter}
                  onChange={(e) =>
                    setProductCategoryFilter(e.target.value as 'ALL' | ProductCategory)
                  }
                  aria-label="Filter products by category"
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Products Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {filteredCentralProducts.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <Package className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">No products found</p>
                      <p className="text-xs text-slate-500">
                        Add central products for direct sale and Type B dropshipping.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openCreateProductModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Central Product
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">Owner / Channel</th>
                          <th className="px-4 py-3 text-right">Base Price</th>
                          <th className="px-4 py-3 text-right">Selling / MRP</th>
                          <th className="px-4 py-3 text-right">Stock</th>
                          <th className="px-4 py-3">Dropship</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredCentralProducts.map((prod) => {
                          const isSellerOwn =
                            prod.ownershipType === 'SELLER_OWNED' &&
                            prod.sellerId !== 'tisahara_owner';
                          return (
                            <tr key={prod.id} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3 min-w-[200px]">
                                  <SafeImage
                                    src={prod.images[0]}
                                    alt={prod.title}
                                    className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="font-semibold text-slate-900 truncate max-w-[200px]">
                                        {prod.title}
                                      </p>
                                      {isSampleTestingProduct(prod) && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-extrabold uppercase tracking-wide shrink-0">
                                          SAMPLE – FOR TESTING
                                        </span>
                                      )}
                                    </div>
                                    <p className="font-mono-num text-[11px] text-slate-400">
                                      {prod.category}
                                      {prod.supplierSku ? ` · SKU: ${prod.supplierSku}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {isSellerOwn ? (
                                  <span className="text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                    Type A: {prod.sellerStoreName}
                                  </span>
                                ) : (
                                  <div>
                                    <span className="text-[11px] font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                      Owner Central
                                    </span>
                                    {prod.supplierName && (
                                      <p className="text-[10px] text-slate-500 mt-0.5">
                                        Supplier: {prod.supplierName}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num font-semibold text-slate-900">
                                {formatINR(prod.basePrice)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num">
                                <span className="font-semibold text-slate-900">
                                  {formatINR(prod.sellingPrice)}
                                </span>{' '}
                                <span className="text-slate-400 line-through">
                                  {formatINR(prod.mrp)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num font-semibold">
                                <span className={prod.stock <= 5 ? 'text-rose-700' : 'text-slate-900'}>
                                  {prod.stock}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {!isSellerOwn ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAvailableForSellers(prod)}
                                    className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                      prod.availableForSellers !== false
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-slate-100 border-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {prod.availableForSellers !== false ? 'For Sellers' : 'Owner Only'}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Own Store Only</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => handleToggleProductActive(prod)}
                                  className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                    prod.isActive
                                      ? 'bg-slate-900 border-slate-900 text-white'
                                      : 'bg-white border-slate-300 text-slate-600'
                                  }`}
                                >
                                  {prod.isActive ? 'Active' : 'Inactive'}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditProductModal(prod)}
                                    title="Edit product"
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  {confirmDeleteProductId === prod.id ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteProduct(prod.id)}
                                        className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteProductId(null)}
                                        className="px-2 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteProductId(prod.id)}
                                      title="Delete product"
                                      className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
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
          )}

          {/* =========================================================
              3. STORE PERFORMANCE, SUSPENSION & LIFECYCLE
              ========================================================= */}
          {activeTab === 'stores' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                    Store Performance & Lifecycle Controls
                  </h2>
                  <p className="text-xs text-slate-500">
                    Suspend, reactivate, or permanently close seller stores while preserving
                    historical orders & payout ledgers.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="Filter stores by name or city…"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Combined Store Totals Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Combined Store Sales
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {formatINR(dashboardStats.totalRevenue)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    TISAHARA Fees Earned
                  </p>
                  <p className="font-mono-num text-xl font-bold text-emerald-700 mt-1">
                    {formatINR(dashboardStats.totalTisaharaFees)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Combined Store Orders
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {dashboardStats.totalOrders}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Active Type B / Type A Listings
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {storeProducts.filter((sp) => sp.isActive).length} /{' '}
                    {dashboardStats.sellerOwnProductsCount}
                  </p>
                </div>
              </div>

              {/* Store Performance Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {filteredStores.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No matching stores found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Store Name & Owner</th>
                          <th className="px-4 py-3 text-right">Type A / B</th>
                          <th className="px-4 py-3 text-right">Orders</th>
                          <th className="px-4 py-3 text-right">Gross Sales</th>
                          <th className="px-4 py-3 text-right">TISAHARA Fee</th>
                          <th className="px-4 py-3 text-right">Net Payable</th>
                          <th className="px-4 py-3">Lifecycle & Verify</th>
                          <th className="px-4 py-3 text-right">Storefront</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStores.map((st) => {
                          const isRegisteredSeller = sellers.some((s) => s.uid === st.sellerId);
                          return (
                            <tr key={st.sellerId} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-slate-900">{st.storeName}</p>
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                      STORE_STATUS_STYLES[st.storeStatus]
                                    }`}
                                  >
                                    {st.storeStatus}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  {st.ownerName} · {st.city}, {st.state}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num">
                                <span className="text-indigo-700 font-semibold">
                                  {st.ownProductsCount}
                                </span>{' '}
                                /{' '}
                                <span className="text-slate-700">{st.listedProductsCount}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num">
                                <strong className="text-slate-900">{st.totalOrders}</strong>
                                <span className="block text-[10px] text-slate-500">
                                  {st.completedOrders} del · {st.pendingOrders} act
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num font-semibold text-slate-900">
                                {formatINR(st.totalSales)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num font-semibold text-slate-700">
                                {formatINR(st.tisaharaFees)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono-num font-semibold text-emerald-700">
                                {formatINR(st.netSellerPayable)}
                              </td>
                              <td className="px-4 py-3">
                                {isRegisteredSeller ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {st.storeStatus !== 'Closed' && (
                                      <button
                                        type="button"
                                        disabled={updatingSellerId === st.sellerId}
                                        onClick={() =>
                                          handleToggleSellerFlag(
                                            st.sellerId,
                                            'isActive',
                                            st.storeStatus !== 'Active'
                                          )
                                        }
                                        className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                          st.storeStatus === 'Active'
                                            ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                        }`}
                                      >
                                        {st.storeStatus === 'Active' ? 'Suspend' : 'Reactivate'}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={updatingSellerId === st.sellerId}
                                      onClick={() =>
                                        handleToggleSellerFlag(
                                          st.sellerId,
                                          'isVerified',
                                          !st.isVerified
                                        )
                                      }
                                      className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                        st.isVerified
                                          ? 'bg-slate-900 border-slate-900 text-white'
                                          : 'bg-white border-slate-200 text-slate-600'
                                      }`}
                                    >
                                      {st.isVerified ? 'Verified' : 'Verify'}
                                    </button>
                                    {st.storeStatus !== 'Closed' &&
                                      (confirmCloseSellerId === st.sellerId ? (
                                        <span className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            disabled={updatingSellerId === st.sellerId}
                                            onClick={() => handlePermanentCloseStore(st.sellerId)}
                                            className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                                          >
                                            Confirm Close
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmCloseSellerId(null)}
                                            className="px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmCloseSellerId(st.sellerId)}
                                          title="Permanently Close Store"
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                                        >
                                          <Ban className="w-3 h-3" />
                                          Close
                                        </button>
                                      ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-500">Central</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {isRegisteredSeller && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenStorefront(st.sellerId)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <span>Visit</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
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
            </div>
          )}

          {/* =========================================================
              4. COMPLETE ORDER MANAGEMENT (ROUTED & FEE-TRACKED)
              ========================================================= */}
          {activeTab === 'orders' && (
            <div className="space-y-5">
              {/* Owner Master Order Acceptance Gate */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Complete Order Management
                    </h2>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        acceptingOrders
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {acceptingOrders ? 'Accepting Orders' : 'Orders Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Strict non-mixed order routing: Owner Direct (₹0 fee), Type A Seller Own (₹10
                    fee), Type B Dropship (₹5 fee).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => handleSaveOrderAcceptance(!acceptingOrders)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      acceptingOrders
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {acceptingOrders ? 'Pause New Orders' : 'Resume Order Acceptance'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportOrdersCsv(filteredOrders, 'tisahara-orders')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Order ID, customer, phone…"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <select
                  value={orderTypeFilter}
                  onChange={(e) => setOrderTypeFilter(e.target.value as 'ALL' | OrderType)}
                  aria-label="Filter orders by fulfillment channel"
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Channels</option>
                  <option value="DIRECT_OWNER">Owner Direct (₹0 Fee)</option>
                  <option value="SELLER_DROPSHIP">Type B Dropship (₹5 Fee)</option>
                  <option value="SELLER_OWN_PRODUCT">Type A Own Product (₹10 Fee)</option>
                </select>

                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value as 'ALL' | OrderStatus)}
                  aria-label="Filter orders by status"
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Statuses ({allOrders.length})</option>
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                <select
                  value={orderStoreFilter}
                  onChange={(e) => setOrderStoreFilter(e.target.value)}
                  aria-label="Filter orders by store"
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Stores</option>
                  {storeMetrics.map((st) => (
                    <option key={st.sellerId} value={st.sellerId}>
                      {st.storeName}
                    </option>
                  ))}
                </select>

                <select
                  value={orderRangeFilter}
                  onChange={(e) =>
                    setOrderRangeFilter(e.target.value as 'ALL' | '7D' | '30D' | '90D')
                  }
                  aria-label="Filter orders by time period"
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                >
                  <option value="ALL">Lifetime</option>
                  <option value="7D">Last 7 Days</option>
                  <option value="30D">Last 30 Days</option>
                  <option value="90D">Last 90 Days</option>
                </select>
              </div>

              {/* Orders Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {ordersLoading ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    Loading marketplace orders…
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No orders match the current filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3.5 py-3">Order ID & Date</th>
                          <th className="px-3.5 py-3">Channel & Store</th>
                          <th className="px-3.5 py-3">Customer</th>
                          <th className="px-3.5 py-3">Items</th>
                          <th className="px-3.5 py-3 text-right">Total</th>
                          <th className="px-3.5 py-3 text-right">Fee / Payable</th>
                          <th className="px-3.5 py-3">Return / Payout</th>
                          <th className="px-3.5 py-3">Status</th>
                          <th className="px-3.5 py-3 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map((ord) => {
                          const totalQty = ord.items.reduce((s, item) => s + item.quantity, 0);
                          const primaryItem = ord.items[0];
                          const ot = inferOrderType(ord);
                          const fee = getOrderTisaharaFee(ord);
                          const payable = getOrderSellerPayable(ord);
                          return (
                            <tr
                              key={ord.id}
                              onClick={() => {
                                setSelectedOrder(ord);
                                setCourierInput(ord.courierPartner || '');
                                setTrackingInput(ord.trackingNumber || '');
                              }}
                              className="hover:bg-slate-50 cursor-pointer"
                            >
                              <td className="px-3.5 py-3 whitespace-nowrap">
                                <p className="font-mono-num font-bold text-slate-900">{ord.id}</p>
                                <p className="text-[11px] text-slate-500">
                                  {formatDateShort(ord.createdAt)}
                                </p>
                              </td>
                              <td className="px-3.5 py-3">
                                <p className="font-semibold text-slate-900">{ord.sellerStoreName}</p>
                                <p className="text-[10px] text-slate-500">
                                  {ORDER_TYPE_LABELS[ot]}
                                </p>
                              </td>
                              <td className="px-3.5 py-3">
                                <p className="font-semibold text-slate-900">
                                  {ord.shippingAddress.fullName}
                                </p>
                                <p className="font-mono-num text-[11px] text-slate-500">
                                  {ord.shippingAddress.phone}
                                </p>
                              </td>
                              <td className="px-3.5 py-3 max-w-[180px]">
                                <p className="font-medium text-slate-900 truncate">
                                  {primaryItem?.title || 'Item'}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono-num">
                                  Qty: {totalQty}
                                  {ord.items.length > 1 ? ` (${ord.items.length} items)` : ''}
                                </p>
                              </td>
                              <td className="px-3.5 py-3 text-right font-mono-num font-bold text-slate-900">
                                {formatINR(ord.totalAmount)}
                              </td>
                              <td className="px-3.5 py-3 text-right font-mono-num">
                                <span className="text-slate-600">Fee {formatINR(fee)}</span>
                                <span className="block text-[11px] font-semibold text-emerald-700">
                                  Net {formatINR(payable)}
                                </span>
                              </td>
                              <td className="px-3.5 py-3 text-[11px]">
                                <span className="block text-slate-700">
                                  Ret: {ord.returnStatus || 'None'}
                                </span>
                                <span className="text-slate-500">
                                  {ord.payoutStatus || 'Pending'}
                                </span>
                              </td>
                              <td className="px-3.5 py-3 whitespace-nowrap">
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                    STATUS_BADGE_STYLES[ord.status]
                                  }`}
                                >
                                  {ord.status}
                                </span>
                              </td>
                              <td className="px-3.5 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOrder(ord);
                                    setCourierInput(ord.courierPartner || '');
                                    setTrackingInput(ord.trackingNumber || '');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  Open
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
            </div>
          )}

          {/* =========================================================
              4B. PAYOUTS & COMMISSIONS MANAGEMENT
              ========================================================= */}
          {activeTab === 'payouts' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                    Bank Verification, Payouts &amp; TISAHARA Fees
                  </h2>
                  <p className="text-xs text-slate-500">
                    Verify seller bank accounts, approve/settle payouts after 7-day return clearance, and audit all ₹10 (Type A) &amp; ₹5 (Type B) fee records.
                  </p>
                </div>
                <div className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs">
                  <span className="text-slate-500">Settlement Mode: </span>
                  <strong className="text-slate-900">
                    {providerStatus?.label || 'Manual Bank Transfer & Owner UTR'}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-emerald-700" />
                    TISAHARA Fees Earned
                  </p>
                  <p className="font-mono-num text-xl font-bold text-emerald-700 mt-1">
                    {formatINR(dashboardStats.totalTisaharaFees)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-amber-700" />
                    Pending Payout Requests
                  </p>
                  <p className="font-mono-num text-xl font-bold text-amber-700 mt-1">
                    {formatINR(
                      mergedPayouts
                        .filter((p) => OPEN_PAYOUT_STATUSES.has(p.status))
                        .reduce((s, p) => s + Number(p.netPayableAmount || 0), 0)
                    )}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-slate-800" />
                    Total Settled Paid
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {formatINR(
                      mergedPayouts
                        .filter((p) => p.status === 'Paid')
                        .reduce((s, p) => s + Number(p.netPayableAmount || 0), 0)
                    )}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-slate-700" />
                    Seller Bank Accounts
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {allBankAccounts.filter((b) => b.isVerified).length} / {allBankAccounts.length} Verified
                  </p>
                </div>
              </div>

              {/* Seller Bank Account Verifications */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Seller Bank Account Verifications ({allBankAccounts.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Only masked last-4 account numbers are displayed in UI; vault tokens remain encrypted.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono-num text-slate-600">
                    Min Payout Threshold: {formatINR(marketplaceSettings?.minPayoutAmount ?? DEFAULT_MIN_PAYOUT_AMOUNT)}
                  </span>
                </div>
                {allBankAccounts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No seller bank accounts submitted yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {allBankAccounts.map((acc) => {
                      const sellerDoc = sellersById.get(acc.sellerId);
                      const isVerifying = verifyingBankSellerId === acc.sellerId;
                      return (
                        <div key={acc.sellerId} className="p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  {acc.sellerStoreName || sellerDoc?.storeName || 'Seller Store'}
                                </span>
                                <span className="font-mono-num text-[11px] text-slate-500">
                                  ID: {acc.sellerId}
                                </span>
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                    acc.verificationStatus === 'Verified'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : acc.verificationStatus === 'Rejected'
                                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                                      : 'bg-amber-50 border-amber-200 text-amber-800'
                                  }`}
                                >
                                  {acc.verificationStatus === 'Pending_Verification'
                                    ? 'Pending Verification'
                                    : acc.verificationStatus}
                                </span>
                              </div>
                              <div className="text-slate-700">
                                Holder: <strong>{acc.accountHolderName}</strong> ·{' '}
                                <span className="font-mono-num font-bold">
                                  {acc.maskedAccountNumber}
                                </span>{' '}
                                · IFSC <span className="font-mono-num font-semibold">{acc.ifscCode}</span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {acc.bankName}
                                {acc.branchName ? ` (${acc.branchName})` : ''} ·{' '}
                                <span className="font-mono-num">
                                  {acc.encryptedVaultToken ? 'Encrypted Vault Active' : 'Token Pending'}
                                </span>
                                {acc.beneficiaryId ? ` · Beneficiary: ${acc.beneficiaryId}` : ''}
                              </div>
                              {acc.verificationNote && (
                                <p className="text-[11px] text-slate-600">
                                  Note: {acc.verificationNote}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                              <input
                                type="text"
                                value={bankBeneficiaryDrafts[acc.sellerId] ?? acc.beneficiaryId ?? ''}
                                onChange={(e) =>
                                  setBankBeneficiaryDrafts((prev) => ({
                                    ...prev,
                                    [acc.sellerId]: e.target.value,
                                  }))
                                }
                                placeholder="Beneficiary ID (optional)"
                                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-num"
                              />
                              <input
                                type="text"
                                value={bankNoteDrafts[acc.sellerId] ?? acc.verificationNote ?? ''}
                                onChange={(e) =>
                                  setBankNoteDrafts((prev) => ({
                                    ...prev,
                                    [acc.sellerId]: e.target.value,
                                  }))
                                }
                                placeholder="Verification note / rejection reason"
                                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                              />
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isVerifying}
                                  onClick={() => handleVerifyBankAccount(acc, 'Verified')}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Verify Bank
                                </button>
                                <button
                                  type="button"
                                  disabled={isVerifying}
                                  onClick={() => handleVerifyBankAccount(acc, 'Rejected')}
                                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Seller Payout Requests Queue */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Seller Payout Requests ({mergedPayouts.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <label htmlFor="owner-payout-filter" className="text-[11px] font-semibold text-slate-500">
                      Status:
                    </label>
                    <select
                      id="owner-payout-filter"
                      value={payoutStatusFilter}
                      onChange={(e) => setPayoutStatusFilter(e.target.value as 'ALL' | PayoutStatus)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
                    >
                      <option value="ALL">All ({mergedPayouts.length})</option>
                      {ALL_PAYOUT_STATUSES.map((st) => {
                        const cnt = mergedPayouts.filter((p) => p.status === st).length;
                        return (
                          <option key={st} value={st}>
                            {st} ({cnt})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                {mergedPayouts.filter((p) => payoutStatusFilter === 'ALL' || p.status === payoutStatusFilter).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {mergedPayouts.length === 0
                      ? 'No seller payout requests submitted yet.'
                      : `No payout requests with status "${payoutStatusFilter}".`}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {mergedPayouts
                      .filter((p) => payoutStatusFilter === 'ALL' || p.status === payoutStatusFilter)
                      .map((pay) => {
                        const isDeciding = payoutDecisionId === pay.id;
                        const isFinalized = pay.status === 'Paid' || pay.status === 'Rejected';
                        const sellerInfo = sellersById.get(pay.sellerId);
                        const bankInfo = bankAccountsBySellerId.get(pay.sellerId);
                        const sellerDisplayName =
                          pay.sellerName || sellerInfo?.ownerName || 'Registered Seller';
                        const maskedBankText =
                          pay.maskedAccountNumber || bankInfo?.maskedAccountNumber || '';
                        const bankIfsc = pay.ifscCode || bankInfo?.ifscCode || '';
                        const bankLabel = pay.bankName || bankInfo?.bankName || '';
                        return (
                          <div key={pay.id} className="p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono-num text-xs font-bold text-slate-900">
                                    {pay.id}
                                  </span>
                                  <span
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                      PAYOUT_STATUS_STYLES[pay.status] ||
                                      'bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {pay.status}
                                  </span>
                                  {pay.status === 'Paid' && (
                                    <span className="text-[10px] font-semibold text-emerald-700">
                                      Locked (Completed)
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-800 font-semibold">
                                  {pay.sellerStoreName} · Seller: {sellerDisplayName} (
                                  <span className="font-mono-num text-slate-600">{pay.sellerId}</span>)
                                </p>
                                <p className="text-xs text-slate-600">
                                  Requested: {formatDateTime(pay.createdAt)} · {pay.orderIds.length}{' '}
                                  cleared order(s) · Eligible Earnings: {formatINR(pay.eligibleEarnings ?? pay.netPayableAmount)}
                                </p>
                                <p className="text-[11px] font-mono-num text-slate-600">
                                  {maskedBankText
                                    ? `Bank: ${bankLabel ? `${bankLabel} · ` : ''}${maskedBankText}${
                                        bankIfsc ? ` · IFSC ${bankIfsc}` : ''
                                      }`
                                    : pay.bankDetails || 'No masked bank details'}
                                  {pay.upiId ? ` · UPI: ${pay.upiId}` : ''}
                                </p>
                                {pay.adminNote && (
                                  <p className="text-[11px] text-slate-600">
                                    Note: {pay.adminNote}
                                  </p>
                                )}
                              </div>

                              <div className="text-right font-mono-num">
                                <p className="text-sm font-bold text-emerald-700">
                                  Requested {formatINR(pay.requestedAmount ?? pay.netPayableAmount)}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Gross {formatINR(pay.grossAmount)} − Fee{' '}
                                  {formatINR(pay.tisaharaFeeTotal)}
                                </p>
                                {(pay.transactionRef || pay.paymentReference) && (
                                  <p className="text-[11px] text-slate-700">
                                    Ref: {pay.transactionRef || pay.paymentReference}
                                  </p>
                                )}
                              </div>
                            </div>

                            {!isFinalized &&
                              (isDeciding ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <input
                                      type="text"
                                      value={payoutUtrDraft}
                                      onChange={(e) => setPayoutUtrDraft(e.target.value)}
                                      placeholder="UTR / Bank Reference Number (required for Paid)"
                                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono-num"
                                    />
                                    <input
                                      type="text"
                                      value={payoutNoteDraft}
                                      onChange={(e) => setPayoutNoteDraft(e.target.value)}
                                      placeholder="Optional admin note / hold / failure reason"
                                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'Under Review')}
                                      className="px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Under Review
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'Approved')}
                                      className="px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'Processing')}
                                      className="px-2.5 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Processing
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'Paid')}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Mark Paid
                                    </button>
                                    {providerStatus?.connected && providerStatus.supportsAutoPayout && (
                                      <button
                                        type="button"
                                        disabled={processingPayout || executingProviderPayoutId === pay.id}
                                        onClick={() => handleExecuteProviderPayout(pay)}
                                        className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                      >
                                        {executingProviderPayoutId === pay.id
                                          ? 'Executing...'
                                          : `Transfer via ${providerStatus.label}`}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'On Hold')}
                                      className="px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      On Hold
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'Failed')}
                                      className="px-2.5 py-1.5 rounded bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Failed
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingPayout}
                                      onClick={() => handleProcessPayoutDecision(pay, 'Rejected')}
                                      className="px-2.5 py-1.5 rounded bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Reject
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPayoutDecisionId(null)}
                                      className="px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 text-xs font-semibold cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayoutDecisionId(pay.id);
                                      setPayoutUtrDraft(pay.transactionRef || '');
                                      setPayoutNoteDraft(pay.adminNote || '');
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Update / Settle Payout
                                  </button>
                                </div>
                              ))}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Payout Transaction Audit Log */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Payout Transactions Audit Log ({allPayoutTransactions.length})
                  </h3>
                </div>
                {allPayoutTransactions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No payout audit transactions logged yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Tx ID</th>
                          <th className="px-4 py-3">Payout / Seller</th>
                          <th className="px-4 py-3">Provider &amp; Bank</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3">Status &amp; Ref</th>
                          <th className="px-4 py-3">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allPayoutTransactions.slice(0, 60).map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-2.5 font-mono-num font-semibold text-slate-900">
                              {tx.id}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-mono-num font-semibold text-slate-800 block">
                                {tx.payoutId}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {tx.sellerStoreName || tx.sellerId}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono-num text-slate-700">
                              {tx.paymentProvider || 'manual'}{' '}
                              {tx.maskedAccountNumber ? `· ${tx.maskedAccountNumber}` : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-bold text-slate-900">
                              {formatINR(tx.amount)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-semibold text-slate-800">{tx.status}</span>
                              {tx.paymentReference && (
                                <span className="block font-mono-num text-[11px] text-slate-500">
                                  Ref: {tx.paymentReference}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {formatDateTime(tx.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Commission Ledger Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Platform Commission &amp; Fee Ledger ({mergedCommissions.length})
                  </h3>
                </div>
                {mergedCommissions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No commission ledger entries recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Order ID</th>
                          <th className="px-4 py-3">Channel</th>
                          <th className="px-4 py-3 text-right">Order Subtotal</th>
                          <th className="px-4 py-3 text-right">Seller Margin</th>
                          <th className="px-4 py-3 text-right">TISAHARA Fee</th>
                          <th className="px-4 py-3 text-right">Seller Payable</th>
                          <th className="px-4 py-3">Ledger Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {mergedCommissions.slice(0, 50).map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-2.5 font-mono-num font-semibold text-slate-900">
                              {c.orderId}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700">
                              {ORDER_TYPE_LABELS[c.orderType]}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono-num">
                              {formatINR(c.orderSubtotal)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono-num">
                              {formatINR(c.sellerMargin)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-bold text-slate-900">
                              {formatINR(c.feeAmount)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-emerald-700">
                              {formatINR(c.sellerPayableAmount)}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] font-semibold text-slate-700">
                              {c.status}
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

          {/* =========================================================
              4C. 7-DAY RETURNS & REFUNDS MANAGEMENT
              ========================================================= */}
          {activeTab === 'returns' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                  7-Day Returns & Refunds Queue
                </h2>
                <p className="text-xs text-slate-500">
                  Every order with an open return holds seller payout automatically. Processing a
                  refund voids the TISAHARA fee and closes seller payout eligibility.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Return Requests ({allReturns.length})
                  </h3>
                  <span className="text-xs text-slate-500">
                    Refunds processed: {allRefunds.length}
                  </span>
                </div>
                {allReturns.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No 7-day return requests filed yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {allReturns.map((ret) => {
                      const ord = ordersById.get(ret.orderId);
                      const isPending = ret.status === 'Requested' || ret.status === 'Approved';
                      return (
                        <div key={ret.id} className="p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono-num text-xs font-bold text-slate-900">
                                  Order {ret.orderId}
                                </span>
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                    ret.status === 'Refunded'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : ret.status === 'Rejected'
                                      ? 'bg-slate-100 border-slate-200 text-slate-700'
                                      : 'bg-amber-50 border-amber-200 text-amber-800'
                                  }`}
                                >
                                  {ret.status}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-slate-800 mt-1">
                                Reason: {ret.reason}
                              </p>
                              {ret.comments && (
                                <p className="text-xs text-slate-600 mt-0.5">{ret.comments}</p>
                              )}
                              <p className="text-[11px] text-slate-500 mt-1">
                                Store: {ord?.sellerStoreName || ret.sellerId} · Requested{' '}
                                {formatDateShort(ret.createdAt)}
                              </p>
                            </div>
                            <div className="text-right font-mono-num">
                              <p className="text-sm font-bold text-slate-900">
                                {formatINR(ret.amount)}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {ret.orderType || 'MARKETPLACE'}
                              </p>
                            </div>
                          </div>

                          {isPending && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row gap-2.5">
                              <input
                                type="text"
                                value={returnNoteDraft[ret.id] || ''}
                                onChange={(e) =>
                                  setReturnNoteDraft((prev) => ({
                                    ...prev,
                                    [ret.id]: e.target.value,
                                  }))
                                }
                                placeholder="Resolution / pickup / refund note…"
                                className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={processingReturnId === ret.id}
                                  onClick={() => handleOwnerReturnDecision(ret, 'Approve_Refund')}
                                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Approve & Process Refund
                                </button>
                                {ret.status === 'Requested' && (
                                  <button
                                    type="button"
                                    disabled={processingReturnId === ret.id}
                                    onClick={() => handleOwnerReturnDecision(ret, 'Approved')}
                                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                  >
                                    Approve Pickup
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={processingReturnId === ret.id}
                                  onClick={() => handleOwnerReturnDecision(ret, 'Rejected')}
                                  className="px-3 py-1.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Reject Return
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              4D. SUPPLIERS & LOGISTICS (MODULAR MANUAL / DEODAP API READY)
              ========================================================= */}
          {activeTab === 'suppliers' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Suppliers & Logistics Management
                  </h2>
                  <p className="text-xs text-slate-600">
                    Operating in <strong>Manual Inventory & Shipment Mode</strong> — structured SKU
                    and supplier schema ready for official DeoDap / courier API connection.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openSupplierModal()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Supplier
                  </button>
                  <button
                    type="button"
                    disabled={allSuppliers.length === 0}
                    onClick={() => openSupplierProductModal()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Supplier SKU
                  </button>
                </div>
              </div>

              {/* Suppliers Directory */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Registered Suppliers ({allSuppliers.length})
                  </h3>
                </div>
                {allSuppliers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No suppliers added yet. Add wholesale suppliers or DeoDap vendor accounts to
                    map SKUs to your central products.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Supplier</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-4 py-3">Mode</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allSuppliers.map((sup) => (
                          <tr key={sup.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{sup.name}</p>
                              <p className="text-[11px] text-slate-500">{sup.city || 'India'}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <p>{sup.contactPerson || '—'}</p>
                              <p className="font-mono-num text-[11px]">{sup.phone || sup.email || ''}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                                {sup.integrationMode === 'DeoDap_API_Ready'
                                  ? 'DeoDap API Ready'
                                  : 'Manual Mode'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                  sup.isActive
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-slate-100 border-slate-200 text-slate-600'
                                }`}
                              >
                                {sup.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1.5">
                              <button
                                type="button"
                                onClick={() => openSupplierModal(sup)}
                                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  deleteSupplier(sup.id).then(() => onNotify('Supplier removed.'))
                                }
                                className="px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Supplier SKUs & Central Product Linking */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Supplier Product SKUs ({allSupplierProducts.length})
                  </h3>
                </div>
                {allSupplierProducts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No supplier SKUs tracked yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">SKU & Title</th>
                          <th className="px-4 py-3">Supplier</th>
                          <th className="px-4 py-3 text-right">Cost</th>
                          <th className="px-4 py-3 text-right">Stock</th>
                          <th className="px-4 py-3">Connected Owner Product</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allSupplierProducts.map((sp) => (
                          <tr key={sp.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{sp.title}</p>
                              <p className="font-mono-num text-[11px] text-slate-500">
                                SKU: {sp.sku}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{sp.supplierName}</td>
                            <td className="px-4 py-3 text-right font-mono-num font-semibold">
                              {formatINR(sp.costPrice)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num">{sp.stock}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <select
                                  disabled={linkingProductId === sp.id}
                                  value={sp.connectedOwnerProductId || ''}
                                  onChange={(e) =>
                                    handleLinkSupplierToCentralProduct(sp, e.target.value)
                                  }
                                  className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded max-w-[190px]"
                                >
                                  <option value="">Link central product…</option>
                                  {centralOwnerProducts.map((op) => (
                                    <option key={op.id} value={op.id}>
                                      {op.title}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1.5">
                              <button
                                type="button"
                                onClick={() => openSupplierProductModal(sp)}
                                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  deleteSupplierProduct(sp.id).then(() =>
                                    onNotify('Supplier SKU deleted.')
                                  )
                                }
                                className="px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                              >
                                Delete
                              </button>
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

          {/* =========================================================
              5. VISUAL ANALYTICS & REPORTS (REAL FIREBASE DATA)
              ========================================================= */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                    Marketplace Analytics & Reports
                  </h2>
                  <p className="text-xs text-slate-500">
                    Lifetime and date-filtered visualizations computed directly from live orders.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'lifetime', label: 'Lifetime' },
                      { id: '7d', label: '7D' },
                      { id: '30d', label: '30D' },
                      { id: '90d', label: '90D' },
                      { id: 'custom', label: 'Custom' },
                    ] as const
                  ).map((range) => (
                    <button
                      key={range.id}
                      type="button"
                      onClick={() => setAnalyticsRange(range.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        analyticsRange === range.id
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {analyticsRange === 'custom' && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Period Totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Period Revenue
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {formatINR(analyticsData.totalSales)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Store Margins
                  </p>
                  <p className="font-mono-num text-xl font-bold text-emerald-700 mt-1">
                    {formatINR(analyticsData.totalMargins)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Orders in Range
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {analyticsData.scopedOrders.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Completion Rate
                  </p>
                  <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
                    {analyticsData.scopedOrders.length > 0
                      ? `${Math.round(
                          (analyticsData.statusCounts.Delivered /
                            analyticsData.scopedOrders.length) *
                            100
                        )}%`
                      : '0%'}
                  </p>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Chart 1: Overall Marketplace Revenue Timeline (SVG Area/Bar Chart) */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        Overall Marketplace Revenue
                      </h3>
                      <p className="text-[11px] text-slate-500">Daily non-cancelled revenue trend</p>
                    </div>
                    <IndianRupee className="w-4 h-4 text-slate-400" />
                  </div>

                  {analyticsData.timeline.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-xs text-slate-400">
                      No order revenue recorded in this period.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <svg
                        viewBox="0 0 520 190"
                        className="w-full h-48 overflow-visible"
                        role="img"
                        aria-label="Marketplace revenue trend chart"
                      >
                        <line x1="0" y1="160" x2="520" y2="160" stroke="#E2E8F0" strokeWidth="1" />
                        <line
                          x1="0"
                          y1="85"
                          x2="520"
                          y2="85"
                          stroke="#F1F5F9"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        {analyticsData.timeline.map((pt, idx) => {
                          const count = analyticsData.timeline.length;
                          const slotW = 520 / count;
                          const barW = Math.min(36, Math.max(10, slotW * 0.56));
                          const x = idx * slotW + (slotW - barW) / 2;
                          const barH = Math.max(4, Math.round((pt.revenue / maxTimelineRev) * 135));
                          const y = 160 - barH;
                          return (
                            <g key={pt.sortKey}>
                              <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={barH}
                                rx="4"
                                fill="#0F172A"
                              />
                              <text
                                x={x + barW / 2}
                                y={Math.max(12, y - 5)}
                                textAnchor="middle"
                                fontSize="9"
                                fill="#475569"
                              >
                                {pt.revenue > 0 ? `₹${Math.round(pt.revenue)}` : ''}
                              </text>
                              <text
                                x={x + barW / 2}
                                y="176"
                                textAnchor="middle"
                                fontSize="9"
                                fill="#64748B"
                              >
                                {pt.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  )}
                </div>

                {/* Chart 2: Order Status Distribution (SVG Donut + Breakdown) */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        Order Status Distribution
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Completed vs Pending vs Cancelled orders
                      </p>
                    </div>
                    <Filter className="w-4 h-4 text-slate-400" />
                  </div>

                  {analyticsData.scopedOrders.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-xs text-slate-400">
                      No orders recorded in this period.
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0">
                        <circle
                          cx="70"
                          cy="70"
                          r="52"
                          fill="none"
                          stroke="#F1F5F9"
                          strokeWidth="18"
                        />
                        {donutSegments.map((seg) => {
                          if (seg.count === 0) return null;
                          const fraction = seg.count / totalStatusCount;
                          const circumference = 2 * Math.PI * 52;
                          const dashLength = fraction * circumference;
                          const offset = -cumulativeFraction * circumference;
                          cumulativeFraction += fraction;
                          return (
                            <circle
                              key={seg.label}
                              cx="70"
                              cy="70"
                              r="52"
                              fill="none"
                              stroke={seg.color}
                              strokeWidth="18"
                              strokeDasharray={`${dashLength} ${circumference}`}
                              strokeDashoffset={offset}
                              transform="rotate(-90 70 70)"
                            />
                          );
                        })}
                        <text
                          x="70"
                          y="67"
                          textAnchor="middle"
                          fontSize="18"
                          fontWeight="700"
                          fill="#0F172A"
                        >
                          {analyticsData.scopedOrders.length}
                        </text>
                        <text x="70" y="83" textAnchor="middle" fontSize="10" fill="#64748B">
                          Orders
                        </text>
                      </svg>

                      <div className="flex-1 w-full space-y-2 text-xs">
                        {donutSegments.map((seg) => {
                          const pct = Math.round(
                            (seg.count / Math.max(1, analyticsData.scopedOrders.length)) * 100
                          );
                          return (
                            <div key={seg.label} className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: seg.color }}
                                />
                                <span>{seg.label}</span>
                              </span>
                              <span className="font-mono-num font-semibold text-slate-900">
                                {seg.count} ({pct}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Chart 3: Store-wise Sales Comparison */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Store-Wise Sales Comparison
                    </h3>
                    <p className="text-[11px] text-slate-500">Gross sales revenue per store</p>
                  </div>

                  {analyticsData.storeRows.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                      No store sales data in this period.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analyticsData.storeRows.slice(0, 8).map((row) => {
                        const widthPct = Math.max(3, Math.round((row.sales / maxStoreSales) * 100));
                        return (
                          <div key={row.storeName} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 truncate pr-2">
                                {row.storeName}
                              </span>
                              <span className="font-mono-num font-bold text-slate-900 shrink-0">
                                {formatINR(row.sales)}
                              </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-slate-900"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Chart 4: Store-wise Order Count Chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Store-Wise Order Volume
                    </h3>
                    <p className="text-[11px] text-slate-500">Total orders & completed orders</p>
                  </div>

                  {analyticsData.storeRows.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                      No store order volume in this period.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analyticsData.storeRows.slice(0, 8).map((row) => {
                        const totalPct = Math.max(
                          4,
                          Math.round((row.orders / maxStoreOrders) * 100)
                        );
                        const completedPct = Math.round(
                          (row.completed / Math.max(1, row.orders)) * totalPct
                        );
                        return (
                          <div key={row.storeName} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 truncate pr-2">
                                {row.storeName}
                              </span>
                              <span className="font-mono-num text-slate-700 shrink-0">
                                <strong className="text-slate-900">{row.orders}</strong> orders (
                                {row.completed} completed)
                              </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
                              <div
                                className="h-full rounded-full bg-indigo-200"
                                style={{ width: `${totalPct}%` }}
                              />
                              <div
                                className="h-full rounded-full bg-emerald-600 absolute top-0 left-0"
                                style={{ width: `${completedPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              6. OWNER SETTINGS & PASSWORD SECURITY
              ========================================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                  Owner Panel Settings
                </h2>
                <p className="text-xs text-slate-500">
                  Configure global marketplace order acceptance and Owner Panel password security.
                </p>
              </div>

              {/* Global Marketplace Order Acceptance Settings */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Global Marketplace Order Acceptance
                    </h3>
                    <p className="text-xs text-slate-500">
                      Controls customer checkout across all stores in real time via Firestore rules.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => handleSaveOrderAcceptance(!acceptingOrdersDraft)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      acceptingOrdersDraft
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-rose-600 text-white hover:bg-rose-700'
                    }`}
                  >
                    {acceptingOrdersDraft ? 'Enabled (Accepting)' : 'Disabled (Paused)'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Minimum Seller Payout Amount (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={minPayoutDraft}
                      onChange={(e) => setMinPayoutDraft(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono-num bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Default ₹100. Enforced on seller payout requests and Firestore security rules.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Buyer Notice When Orders Are Paused
                    </label>
                    <textarea
                      rows={2}
                      value={pauseMessageDraft}
                      onChange={(e) => setPauseMessageDraft(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => handleSaveOrderAcceptance(acceptingOrdersDraft, pauseMessageDraft)}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingSettings ? 'Saving…' : 'Save Marketplace & Payout Settings'}
                  </button>
                </div>
              </div>

              {/* Single Owner Password Security */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Owner Panel Password
                  </h3>
                  <p className="text-xs text-slate-500">
                    {sessionStatus.authSource === 'env'
                      ? 'Currently managed via the backend OWNER_PANEL_PASSWORD environment secret.'
                      : 'Update your single backend-hashed Owner Panel password.'}
                  </p>
                </div>

                {sessionStatus.authSource === 'hash' && (
                  <form onSubmit={handleChangeOwnerPassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Current Owner Password
                      </label>
                      <input
                        type="password"
                        required
                        value={currentPwdDraft}
                        onChange={(e) => setCurrentPwdDraft(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          New Password (min 8 chars)
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={newPwdDraft}
                          onChange={(e) => setNewPwdDraft(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={confirmNewPwdDraft}
                          onChange={(e) => setConfirmNewPwdDraft(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={changingPassword}
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {changingPassword ? 'Updating…' : 'Update Owner Password'}
                    </button>
                  </form>
                )}
              </div>

              {/* Admin Identity & Session */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-slate-900">Verified Firebase Admin</p>
                  <p className="text-slate-600">{auth.currentUser?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleOwnerLogout}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out of Owner Panel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          MODAL 1: ADD / EDIT CENTRAL PRODUCT
          ========================================================= */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingProduct ? 'Edit Central Product' : 'Add New Central Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-4 text-xs">
              {productFormError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 font-medium">
                  {productFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    value={pTitle}
                    onChange={(e) => setPTitle(e.target.value)}
                    placeholder="e.g. Cotton Printed Kurti Set"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
                  >
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Stock Availability
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pStock}
                    onChange={(e) => setPStock(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Original / Base Price (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pBasePrice}
                    onChange={(e) => setPBasePrice(e.target.value)}
                    placeholder="e.g. 450"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Default Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pSellingPrice}
                    onChange={(e) => setPSellingPrice(e.target.value)}
                    placeholder="e.g. 599"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pMrp}
                    onChange={(e) => setPMrp(e.target.value)}
                    placeholder="e.g. 999"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Max Permitted Seller Margin (₹, optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pMaxMargin}
                    onChange={(e) => setPMaxMargin(e.target.value)}
                    placeholder="Leave empty for any margin up to MRP"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={pDescription}
                  onChange={(e) => setPDescription(e.target.value)}
                  placeholder="Material, sizing, features, and warranty details…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              {/* Image Upload & URLs */}
              <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Product Images ({pImages.length}/5)
                  </span>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingImage ? 'Uploading…' : 'Upload Image File'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingImage || pImages.length >= 5}
                      onChange={handleUploadImageFile}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={pImageInput}
                    onChange={(e) => setPImageInput(e.target.value)}
                    placeholder="Or paste image URL (https://…)"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-semibold cursor-pointer"
                  >
                    Add URL
                  </button>
                </div>

                {pImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {pImages.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <SafeImage
                          src={img}
                          alt={`Product ${idx + 1}`}
                          className="w-16 h-16 rounded-lg object-cover border border-slate-200 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remove image"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Search Tags (comma-separated, optional)
                </label>
                <input
                  type="text"
                  value={pTags}
                  onChange={(e) => setPTags(e.target.value)}
                  placeholder="cotton, summer, bestseller"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Linked Supplier (optional)
                  </label>
                  <select
                    value={pSupplierId}
                    onChange={(e) => setPSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                  >
                    <option value="">None / In-house stock</option>
                    {allSuppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} ({sup.integrationMode === 'DeoDap_API_Ready' ? 'DeoDap' : 'Manual'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Supplier SKU (optional)
                  </label>
                  <input
                    type="text"
                    value={pSupplierSku}
                    onChange={(e) => setPSupplierSku(e.target.value)}
                    placeholder="e.g. DD-SKU-1042"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pIsActive}
                    onChange={(e) => setPIsActive(e.target.checked)}
                    className="accent-slate-900"
                  />
                  <span>Active in Marketplace</span>
                </label>

                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pAvailableForSellers}
                    onChange={(e) => setPAvailableForSellers(e.target.checked)}
                    className="accent-slate-900"
                  />
                  <span>Available for Store Owners (Dropshipping)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingProduct
                    ? 'Saving…'
                    : editingProduct
                    ? 'Save Changes'
                    : 'Publish Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: ORDER DETAIL & OWNER STATUS ACTIONS
          ========================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono-num text-sm font-bold text-slate-900">
                    {selectedOrder.id}
                  </h3>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                      STATUS_BADGE_STYLES[selectedOrder.status]
                    }`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Placed {formatDateTime(selectedOrder.createdAt)} · Store:{' '}
                  {selectedOrder.sellerStoreName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs">
              {/* Customer & Shipping Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Customer</p>
                  <p className="font-semibold text-slate-900">
                    {selectedOrder.shippingAddress.fullName}
                  </p>
                  <p className="font-mono-num text-slate-700">
                    {selectedOrder.shippingAddress.phone}
                  </p>
                  <p className="text-slate-600">
                    {usersById.get(selectedOrder.customerId)?.email ||
                      (selectedOrder.customerId === 'guest'
                        ? 'Guest Checkout'
                        : selectedOrder.customerId)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Delivery Address
                  </p>
                  <p className="text-slate-800">{selectedOrder.shippingAddress.street}</p>
                  <p className="text-slate-800">
                    {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} –{' '}
                    <span className="font-mono-num font-semibold">
                      {selectedOrder.shippingAddress.pincode}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Payment:{' '}
                    <strong className="text-slate-900">
                      {selectedOrder.paymentMethod === 'COD'
                        ? 'Cash on Delivery'
                        : 'Online Payment'}
                    </strong>{' '}
                    ({selectedOrder.paymentStatus})
                  </p>
                </div>
              </div>

              {/* Line Items Breakdown */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-semibold text-slate-700">
                  Ordered Items & Margin Breakdown
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center gap-3">
                      <SafeImage
                        src={item.image}
                        alt={item.title}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-500 font-mono-num">
                          Qty {item.quantity} · Base {formatINR(item.basePrice)} · Selling{' '}
                          {formatINR(item.sellingPrice)} · Store Margin {formatINR(item.sellerMargin)}
                        </p>
                      </div>
                      <p className="font-mono-num font-bold text-slate-900 shrink-0">
                        {formatINR(item.sellingPrice * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 font-mono-num">
                    <span>Subtotal: {formatINR(selectedOrder.subtotal)}</span>
                    <span>Delivery: {formatINR(selectedOrder.deliveryFee)}</span>
                    <span>TISAHARA Fee: {formatINR(getOrderTisaharaFee(selectedOrder))}</span>
                    <span className="text-emerald-700 font-semibold">
                      Seller Payable: {formatINR(getOrderSellerPayable(selectedOrder))}
                    </span>
                  </div>
                  <div className="font-mono-num text-sm font-bold text-slate-900">
                    Total: {formatINR(selectedOrder.totalAmount)}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  Channel: <strong>{ORDER_TYPE_LABELS[inferOrderType(selectedOrder)]}</strong>
                </span>
                <span>
                  Return: <strong>{selectedOrder.returnStatus || 'None'}</strong> · Payout:{' '}
                  <strong>{selectedOrder.payoutStatus || 'Pending'}</strong>
                </span>
              </div>

              {/* Owner-Only Order Actions */}
              {selectedOrder.status !== 'Delivered' && selectedOrder.status !== 'Cancelled' ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="font-semibold text-slate-900">Owner Fulfillment Actions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={courierInput}
                      onChange={(e) => setCourierInput(e.target.value)}
                      placeholder="Courier Partner (e.g. Delhivery, BlueDart)"
                      className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder="AWB / Tracking Number"
                      className="px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-num text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedOrder.status === 'Pending' && (
                      <button
                        type="button"
                        disabled={updatingOrderId === selectedOrder.id}
                        onClick={() => handleOwnerUpdateOrderStatus(selectedOrder, 'Confirmed')}
                        className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Confirm Order
                      </button>
                    )}
                    {(selectedOrder.status === 'Pending' ||
                      selectedOrder.status === 'Confirmed') && (
                      <button
                        type="button"
                        disabled={updatingOrderId === selectedOrder.id}
                        onClick={() => handleOwnerUpdateOrderStatus(selectedOrder, 'Shipped')}
                        className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Mark Shipped
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={updatingOrderId === selectedOrder.id}
                      onClick={() => handleOwnerUpdateOrderStatus(selectedOrder, 'Delivered')}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Mark Delivered
                    </button>
                    <button
                      type="button"
                      disabled={updatingOrderId === selectedOrder.id}
                      onClick={() => handleOwnerUpdateOrderStatus(selectedOrder, 'Cancelled')}
                      className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-50 ml-auto"
                    >
                      Cancel & Restore Stock
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-600">
                  Order is finalized as <strong>{selectedOrder.status}</strong>.
                  {selectedOrder.courierPartner && (
                    <span className="ml-2">
                      Courier: <strong>{selectedOrder.courierPartner}</strong>{' '}
                      {selectedOrder.trackingNumber ? `(${selectedOrder.trackingNumber})` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: ADD / EDIT SUPPLIER
          ========================================================= */}
      {supModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => setSupModalOpen(false)}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSupplierForm} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="e.g. DeoDap Wholesale Rajkot"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={supCity}
                    onChange={(e) => setSupCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Integration Mode</label>
                  <select
                    value={supMode}
                    onChange={(e) => setSupMode(e.target.value as 'Manual' | 'DeoDap_API_Ready')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Manual">Manual Mode</option>
                    <option value="DeoDap_API_Ready">DeoDap API Ready</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={supActive}
                  onChange={(e) => setSupActive(e.target.checked)}
                />
                <span>Active Supplier</span>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSupModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingSupplier ? 'Saving…' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 4: ADD / EDIT SUPPLIER PRODUCT SKU
          ========================================================= */}
      {sprodModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingSupplierProduct ? 'Edit Supplier SKU' : 'Add Supplier Product SKU'}
              </h3>
              <button
                type="button"
                onClick={() => setSprodModalOpen(false)}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSupplierProductForm} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Supplier *</label>
                <select
                  required
                  value={spSupplierId}
                  onChange={(e) => setSpSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select supplier…</option>
                  {allSuppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier SKU *</label>
                  <input
                    type="text"
                    required
                    value={spSku}
                    onChange={(e) => setSpSku(e.target.value)}
                    placeholder="DD-1002"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cost Price (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={spCost}
                    onChange={(e) => setSpCost(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Title *</label>
                <input
                  type="text"
                  required
                  value={spTitle}
                  onChange={(e) => setSpTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier Stock</label>
                  <input
                    type="number"
                    min={0}
                    value={spStock}
                    onChange={(e) => setSpStock(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Connect Central Product
                  </label>
                  <select
                    value={spConnectedProdId}
                    onChange={(e) => setSpConnectedProdId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {centralOwnerProducts.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={spNotes}
                  onChange={(e) => setSpNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={spActive}
                  onChange={(e) => setSpActive(e.target.checked)}
                />
                <span>Active SKU</span>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSprodModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplierProduct}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingSupplierProduct ? 'Saving…' : 'Save SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
