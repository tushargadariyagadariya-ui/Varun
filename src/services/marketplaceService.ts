import { signInWithCustomToken, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, handleFirestoreError, OperationType, storage } from '../firebase';
import {
  AppNotification,
  BankVerificationStatus,
  CartItem,
  CommissionRecord,
  MarketplaceOrder,
  MarketplaceSettings,
  OrderStatus,
  OrderType,
  OwnerSessionStatus,
  PaymentMethod,
  PayoutProviderCode,
  PayoutProviderStatus,
  PayoutRecord,
  PayoutStatus,
  PayoutTransactionRecord,
  Product,
  ProductCategory,
  ProductOwnershipType,
  ProductReview,
  ReferralRecord,
  RefundRecord,
  ReturnRequest,
  SavedAddress,
  SellerBankAccount,
  SellerEarningsRecord,
  SellerFinancialSummary,
  SellerProfile,
  ShippingAddress,
  StoreProduct,
  StoreStatus,
  SupplierProductRecord,
  SupplierRecord,
  UserProfile,
} from '../types/marketplace';

export const OWNER_ADMIN_EMAIL = 'tushargadariyagadariya@gmail.com';
export const OWNER_ADMIN_UID = 'tisahara_owner_admin';
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_MIN_PAYOUT_AMOUNT = 100;
export const OPEN_PAYOUT_STATUS_SET = new Set<PayoutStatus>([
  'Pending',
  'Requested',
  'Under Review',
  'Approved',
  'Processing',
  'On Hold',
]);
export const LEGACY_DEMO_PRODUCT_IDS = [
  'prod_mwes7ohi_eieq3q',
  'prod_mwes7oym_ge1vdi',
  'prod_mwes7p5q_fp4s1e',
  'prod_mwes7phb_q33380',
  'prod_mwes7ppn_g2j4g3',
  'prod_mwes7pvq_2x3qsh',
] as const;

let inMemoryOwnerSessionToken: string | null = null;

export function isFirebaseOwnerAdmin(): boolean {
  const user = auth.currentUser;
  if (!user) return false;
  if (user.uid === OWNER_ADMIN_UID) return true;
  return (
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase()
  );
}

function ownerAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (inMemoryOwnerSessionToken) {
    headers.Authorization = `Bearer ${inMemoryOwnerSessionToken}`;
  }
  return headers;
}

export class OwnerAuthError extends Error {
  retryAfterSeconds?: number;
  status?: number;
  constructor(message: string, retryAfterSeconds?: number, status?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

export async function fetchOwnerSession(): Promise<OwnerSessionStatus> {
  const res = await fetch('/api/owner/session', {
    method: 'GET',
    credentials: 'include',
    headers: inMemoryOwnerSessionToken
      ? { Authorization: `Bearer ${inMemoryOwnerSessionToken}` }
      : undefined,
  });
  if (!res.ok) {
    return { authenticated: false, configured: true, authSource: 'none' };
  }
  const data = (await res.json()) as OwnerSessionStatus;
  if (!data.authenticated) {
    inMemoryOwnerSessionToken = null;
  } else if (data.firebaseAdminConfigured && !isFirebaseOwnerAdmin()) {
    await refreshOwnerFirebaseAuth().catch(() => undefined);
  }
  return data;
}

export async function refreshOwnerFirebaseAuth(): Promise<boolean> {
  if (isFirebaseOwnerAdmin()) return true;
  const res = await fetch('/api/owner/firebase-token', {
    method: 'POST',
    credentials: 'include',
    headers: ownerAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = (await res.json().catch(() => ({}))) as { customToken?: string | null };
  if (data.customToken) {
    await signInWithCustomToken(auth, data.customToken);
    return true;
  }
  return false;
}

export async function setupOwnerPassword(password: string): Promise<OwnerSessionStatus> {
  const idToken = await auth.currentUser?.getIdToken(true);
  if (!idToken) {
    throw new OwnerAuthError(
      `Sign in with your verified Google account (${OWNER_ADMIN_EMAIL}) to set up the Owner Panel password.`,
      undefined,
      403
    );
  }
  const res = await fetch('/api/owner/setup', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as OwnerSessionStatus & {
    token?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new OwnerAuthError(data.error || 'Failed to configure owner password.', undefined, res.status);
  }
  if (data.token) {
    inMemoryOwnerSessionToken = data.token;
  }
  if (data.customToken && !isFirebaseOwnerAdmin()) {
    await signInWithCustomToken(auth, data.customToken).catch(() => undefined);
  }
  return data;
}

export async function loginOwnerPanel(password: string): Promise<OwnerSessionStatus> {
  const res = await fetch('/api/owner/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as OwnerSessionStatus & {
    token?: string;
    error?: string;
    retryAfterSeconds?: number;
  };
  if (!res.ok) {
    throw new OwnerAuthError(
      data.error || 'Incorrect owner password.',
      data.retryAfterSeconds,
      res.status
    );
  }
  if (data.token) {
    inMemoryOwnerSessionToken = data.token;
  }
  if (data.customToken && !isFirebaseOwnerAdmin()) {
    await signInWithCustomToken(auth, data.customToken).catch(() => undefined);
  }
  return data;
}

export async function changeOwnerPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch('/api/owner/change-password', {
    method: 'POST',
    credentials: 'include',
    headers: ownerAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new OwnerAuthError(data.error || 'Unable to update owner password.', undefined, res.status);
  }
}

export async function logoutOwnerPanel(): Promise<void> {
  await fetch('/api/owner/logout', {
    method: 'POST',
    credentials: 'include',
    headers: ownerAuthHeaders(),
  }).catch(() => undefined);
  inMemoryOwnerSessionToken = null;
  if (auth.currentUser?.uid === OWNER_ADMIN_UID) {
    await signOut(auth).catch(() => undefined);
  }
}

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function generateReferralCode(name: string, uid: string): string {
  const clean = (name || 'TISA')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const suffix = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || '2026';
  return `${clean}${suffix}`;
}

export function getGuestSessionId(): string {
  const key = 'tisahara_guest_session_id';
  let id = localStorage.getItem(key);
  if (!id || id.length < 10) {
    id = generateId('guest');
    localStorage.setItem(key, id);
  }
  return id;
}

export function inferOrderType(order: Partial<MarketplaceOrder>): OrderType {
  if (
    order.orderType === 'DIRECT_OWNER' ||
    order.orderType === 'SELLER_OWN_PRODUCT' ||
    order.orderType === 'SELLER_DROPSHIP'
  ) {
    return order.orderType;
  }
  if (order.ownershipType === 'SELLER_OWNED' && order.sellerId !== 'tisahara_owner') {
    return 'SELLER_OWN_PRODUCT';
  }
  if (!order.sellerId || order.sellerId === 'tisahara_owner') {
    return 'DIRECT_OWNER';
  }
  return 'SELLER_DROPSHIP';
}

export function formatOrderTypeDisplay(
  orderType: OrderType
): 'OWNER_DIRECT' | 'SELLER_OWN_PRODUCT' | 'OWNER_DROPSHIP_VIA_SELLER' {
  if (orderType === 'DIRECT_OWNER') return 'OWNER_DIRECT';
  if (orderType === 'SELLER_OWN_PRODUCT') return 'SELLER_OWN_PRODUCT';
  return 'OWNER_DROPSHIP_VIA_SELLER';
}

export function getOrderTisaharaFee(order: Partial<MarketplaceOrder>): number {
  if (typeof order.tisaharaFee === 'number') return order.tisaharaFee;
  const ot = inferOrderType(order);
  return ot === 'SELLER_OWN_PRODUCT' ? 10 : ot === 'SELLER_DROPSHIP' ? 5 : 0;
}

export function getOrderSellerPayable(order: Partial<MarketplaceOrder>): number {
  if (typeof order.sellerPayableAmount === 'number') return order.sellerPayableAmount;
  const ot = inferOrderType(order);
  if (ot === 'DIRECT_OWNER') return 0;
  if (ot === 'SELLER_OWN_PRODUCT') {
    return Math.max(0, Number(order.subtotal || 0) - 10);
  }
  return Math.max(0, Number(order.totalSellerMargin || 0) - 5);
}

/**
 * Ensures a single canonical UserProfile document exists at users/{uid}.
 * Never overwrites existing profiles or creates duplicates on repeat logins.
 */
export async function ensureUserProfile(
  firebaseUser: User,
  customName?: string,
  pendingReferralCode?: string | null
): Promise<UserProfile> {
  const path = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existingData = snap.data() as Partial<UserProfile>;
      const resolvedName = existingData.name || firebaseUser.displayName || 'TISAHARA Shopper';
      const resolvedReferralCode =
        existingData.referralCode || generateReferralCode(resolvedName, firebaseUser.uid);

      const missingPatch: Record<string, unknown> = {};
      if (!existingData.uid) missingPatch.uid = firebaseUser.uid;
      if (!existingData.name) missingPatch.name = resolvedName.slice(0, 120);
      if (existingData.email === undefined) missingPatch.email = (firebaseUser.email || '').slice(0, 200);
      if (!existingData.role) missingPatch.role = 'customer';
      if (!existingData.referralCode) missingPatch.referralCode = resolvedReferralCode;
      if (typeof existingData.rewardPoints !== 'number') missingPatch.rewardPoints = 0;

      if (Object.keys(missingPatch).length > 0) {
        missingPatch.updatedAt = serverTimestamp();
        await updateDoc(userRef, missingPatch).catch(() => undefined);
      }

      setDoc(doc(db, 'referralCodes', resolvedReferralCode), {
        code: resolvedReferralCode,
        userId: firebaseUser.uid,
        createdAt: serverTimestamp(),
      }).catch(() => undefined);

      return {
        uid: firebaseUser.uid,
        name: resolvedName,
        email: existingData.email || firebaseUser.email || '',
        phone: existingData.phone || '',
        role: existingData.role || 'customer',
        photoURL: existingData.photoURL || firebaseUser.photoURL || '',
        referralCode: resolvedReferralCode,
        referredBy: existingData.referredBy,
        rewardPoints: typeof existingData.rewardPoints === 'number' ? existingData.rewardPoints : 0,
        preferredLanguage: existingData.preferredLanguage || 'en',
        upiId: existingData.upiId || '',
        addresses: Array.isArray(existingData.addresses) ? existingData.addresses : [],
        createdAt: existingData.createdAt,
        updatedAt: existingData.updatedAt,
      };
    }

    const displayName = (
      customName ||
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'TISAHARA User'
    ).slice(0, 120);
    const referralCode = generateReferralCode(displayName, firebaseUser.uid);

    const newProfile: Record<string, unknown> = {
      uid: firebaseUser.uid,
      name: displayName,
      email: (firebaseUser.email || '').slice(0, 200),
      phone: '',
      role: 'customer',
      photoURL: (firebaseUser.photoURL || '').slice(0, 500),
      referralCode,
      rewardPoints: 0,
      preferredLanguage: 'en',
      addresses: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (pendingReferralCode && pendingReferralCode.trim().length >= 4) {
      newProfile.referredBy = pendingReferralCode.trim().toUpperCase().slice(0, 32);
    }

    await setDoc(userRef, newProfile);
    await setDoc(doc(db, 'referralCodes', referralCode), {
      code: referralCode,
      userId: firebaseUser.uid,
      createdAt: serverTimestamp(),
    }).catch(() => undefined);

    return {
      ...(newProfile as unknown as UserProfile),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      'name' | 'phone' | 'addresses' | 'preferredLanguage' | 'upiId' | 'role' | 'rewardPoints' | 'referredBy'
    >
  >
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const cleanUpdates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim().slice(0, 120);
    if (updates.phone !== undefined) cleanUpdates.phone = updates.phone.trim().slice(0, 20);
    if (updates.addresses !== undefined) cleanUpdates.addresses = updates.addresses.slice(0, 10);
    if (updates.preferredLanguage !== undefined) cleanUpdates.preferredLanguage = updates.preferredLanguage;
    if (updates.upiId !== undefined) cleanUpdates.upiId = updates.upiId.trim().slice(0, 100);
    if (updates.role !== undefined && (updates.role === 'customer' || updates.role === 'seller')) {
      cleanUpdates.role = updates.role;
    }
    if (updates.rewardPoints !== undefined) cleanUpdates.rewardPoints = Math.max(0, Number(updates.rewardPoints));
    if (updates.referredBy !== undefined) cleanUpdates.referredBy = updates.referredBy.trim().slice(0, 32);

    await updateDoc(doc(db, 'users', uid), cleanUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncCartToFirestore(uid: string, items: CartItem[]): Promise<void> {
  try {
    await setDoc(doc(db, 'carts', uid), {
      userId: uid,
      items: items.slice(0, 50),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Cart localStorage remains primary fallback
  }
}

export async function loadCartFromFirestore(uid: string): Promise<CartItem[] | null> {
  try {
    const snap = await getDoc(doc(db, 'carts', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as { items?: CartItem[] };
    return Array.isArray(data.items) ? data.items : null;
  } catch {
    return null;
  }
}

export async function registerOrUpdateSeller(
  uid: string,
  input: {
    storeName: string;
    ownerName: string;
    city: string;
    state: string;
    description: string;
  }
): Promise<SellerProfile> {
  const path = `sellers/${uid}`;
  const sellerRef = doc(db, 'sellers', uid);
  const storeRef = doc(db, 'stores', uid);
  const slug =
    input.storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || `store-${uid.slice(0, 6)}`;

  try {
    const snap = await getDoc(sellerRef);
    if (snap.exists()) {
      const existingData = snap.data() as SellerProfile;
      if (existingData.storeStatus === 'Suspended' || existingData.storeStatus === 'Closed' || existingData.isActive === false) {
        throw new Error(`Your store is currently ${existingData.storeStatus || 'Paused'} by marketplace administration.`);
      }
      await updateDoc(sellerRef, {
        storeName: input.storeName.trim().slice(0, 100),
        storeSlug: slug,
        ownerName: input.ownerName.trim().slice(0, 100),
        city: input.city.trim().slice(0, 80),
        state: input.state.trim().slice(0, 80),
        description: input.description.trim().slice(0, 600),
        updatedAt: serverTimestamp(),
      });
      await setDoc(
        storeRef,
        {
          id: uid,
          sellerId: uid,
          storeName: input.storeName.trim().slice(0, 100),
          storeSlug: slug,
          description: input.description.trim().slice(0, 600),
          city: input.city.trim().slice(0, 80),
          state: input.state.trim().slice(0, 80),
          isVerified: existingData.isVerified,
          isActive: Boolean(existingData.isActive ?? true),
          storeStatus: existingData.storeStatus || 'Active',
          createdAt: existingData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => undefined);

      const updated = await getDoc(sellerRef);
      return updated.data() as SellerProfile;
    }

    const sellerDoc = {
      uid,
      storeName: input.storeName.trim().slice(0, 100),
      storeSlug: slug,
      ownerName: input.ownerName.trim().slice(0, 100),
      city: input.city.trim().slice(0, 80),
      state: input.state.trim().slice(0, 80),
      description: input.description.trim().slice(0, 600),
      isVerified: false,
      isActive: true,
      storeStatus: 'Active' as StoreStatus,
      totalSales: 0,
      totalEarnings: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(sellerRef, sellerDoc);
    await setDoc(storeRef, {
      id: uid,
      sellerId: uid,
      storeName: sellerDoc.storeName,
      storeSlug: slug,
      description: sellerDoc.description,
      city: sellerDoc.city,
      state: sellerDoc.state,
      isVerified: false,
      isActive: true,
      storeStatus: 'Active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
    await updateUserProfile(uid, { role: 'seller' });
    return sellerDoc as unknown as SellerProfile;
  } catch (error) {
    if (error instanceof Error && error.message.includes('marketplace administration')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function pushProductToSellerStore(
  seller: SellerProfile,
  product: Product,
  customSellingPrice?: number
): Promise<StoreProduct> {
  if (seller.isActive === false || seller.storeStatus === 'Suspended' || seller.storeStatus === 'Closed') {
    throw new Error(`Your store is currently ${seller.storeStatus || 'paused'} by the marketplace owner.`);
  }
  if (product.ownershipType === 'SELLER_OWNED' || product.sellerId !== 'tisahara_owner') {
    throw new Error('Only Owner central products can be added via dropshipping.');
  }
  if (!product.isActive || product.availableForSellers === false) {
    throw new Error('This product is currently unavailable for seller stores.');
  }

  const storeProductId = `${seller.uid}_${product.id}`;
  const path = `storeProducts/${storeProductId}`;
  const refDoc = doc(db, 'storeProducts', storeProductId);

  try {
    const existing = await getDoc(refDoc);
    if (existing.exists()) {
      throw new Error(`"${product.title}" is already added to your store.`);
    }

    const basePrice = Math.max(0, Number(product.basePrice));
    const requestedPrice =
      customSellingPrice !== undefined && Number.isFinite(customSellingPrice)
        ? Math.round(Number(customSellingPrice))
        : Math.round(Number(product.sellingPrice));

    if (requestedPrice < basePrice) {
      throw new Error(`Selling price must be at least the Base Price (₹${basePrice}).`);
    }
    if (requestedPrice > Number(product.mrp)) {
      throw new Error(`Selling price cannot exceed the product MRP (₹${product.mrp}).`);
    }

    const sellerMargin = Math.max(0, requestedPrice - basePrice);
    if (
      typeof product.maxSellerMargin === 'number' &&
      sellerMargin > product.maxSellerMargin
    ) {
      throw new Error(
        `Maximum permitted seller margin for this product is ₹${product.maxSellerMargin}.`
      );
    }

    const payload: StoreProduct = {
      id: storeProductId,
      sellerId: seller.uid,
      storeId: seller.uid,
      sellerStoreName: seller.storeName.slice(0, 100),
      productId: product.id,
      basePrice,
      sellingPrice: requestedPrice,
      sellerMargin,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(refDoc, payload);
    await setDoc(doc(db, 'sellerStoreProducts', storeProductId), payload).catch(() => undefined);
    return payload;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already added') ||
        error.message.includes('Base Price') ||
        error.message.includes('MRP') ||
        error.message.includes('margin') ||
        error.message.includes('unavailable') ||
        error.message.includes('dropshipping') ||
        error.message.includes('currently'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize image compressor.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 210000 && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 240000) {
          reject(new Error('Image is too large even after compression. Please choose a smaller image.'));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Invalid image file selected.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadProductImageForScope(file: File, scope = 'tisahara_owner'): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storageRef = ref(storage, `products/${scope}/${Date.now()}_${cleanName}`);
  try {
    await uploadBytes(storageRef, file, { contentType: file.type });
    return await getDownloadURL(storageRef);
  } catch {
    return compressImageToDataUrl(file);
  }
}

export async function uploadCentralProductImage(file: File): Promise<string> {
  return uploadProductImageForScope(file, 'tisahara_owner');
}

export interface CentralProductInput {
  title: string;
  description: string;
  category: ProductCategory;
  basePrice: number;
  sellingPrice: number;
  mrp: number;
  maxSellerMargin?: number;
  stock: number;
  images: string[];
  tags?: string[];
  isActive: boolean;
  availableForSellers: boolean;
  supplierId?: string;
  supplierName?: string;
  supplierSku?: string;
  supplierProductId?: string;
}

export async function saveCentralProduct(
  input: CentralProductInput,
  existingProduct?: Product
): Promise<Product> {
  const productId = existingProduct?.id || generateId('prod');
  const path = `products/${productId}`;
  const cleanImages = input.images.map((u) => u.trim()).filter(Boolean).slice(0, 5);
  if (cleanImages.length === 0) {
    throw new Error('Please upload or provide at least one product image.');
  }

  const basePrice = Math.max(0, Math.round(Number(input.basePrice)));
  const sellingPrice = Math.max(basePrice, Math.round(Number(input.sellingPrice)));
  const mrp = Math.max(sellingPrice, Math.round(Number(input.mrp)));
  const sellerMargin = Math.max(0, sellingPrice - basePrice);
  const stock = Math.max(0, Math.floor(Number(input.stock)));
  const cleanTags = (input.tags || [])
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);

  const payload: Record<string, unknown> = {
    id: productId,
    sellerId: existingProduct?.sellerId || 'tisahara_owner',
    storeId: existingProduct?.storeId || 'tisahara_owner',
    sellerStoreName: existingProduct?.sellerStoreName || 'TISAHARA Central',
    ownershipType: existingProduct?.ownershipType || 'OWNER',
    title: input.title.trim().slice(0, 140),
    description: input.description.trim().slice(0, 2000),
    category: input.category,
    basePrice,
    sellingPrice,
    mrp,
    sellerMargin,
    stock,
    images: cleanImages,
    ratingAvg: existingProduct?.ratingAvg ?? 0,
    ratingCount: existingProduct?.ratingCount ?? 0,
    isActive: input.isActive,
    availableForSellers: input.availableForSellers,
    updatedAt: serverTimestamp(),
  };

  if (
    input.maxSellerMargin !== undefined &&
    Number.isFinite(input.maxSellerMargin) &&
    input.maxSellerMargin >= 0
  ) {
    payload.maxSellerMargin = Math.round(input.maxSellerMargin);
  }
  if (cleanTags.length > 0) {
    payload.tags = cleanTags;
  }
  if (input.supplierId) payload.supplierId = input.supplierId.slice(0, 128);
  if (input.supplierName) payload.supplierName = input.supplierName.slice(0, 120);
  if (input.supplierSku) payload.supplierSku = input.supplierSku.slice(0, 80);
  if (input.supplierProductId) payload.supplierProductId = input.supplierProductId.slice(0, 128);

  try {
    if (existingProduct) {
      await updateDoc(doc(db, 'products', productId), payload);
      if (payload.ownershipType === 'OWNER') {
        await setDoc(
          doc(db, 'ownerProducts', productId),
          { ...payload, createdAt: existingProduct.createdAt || serverTimestamp() },
          { merge: true }
        ).catch(() => undefined);
      }
    } else {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'products', productId), payload);
      await setDoc(doc(db, 'ownerProducts', productId), payload).catch(() => undefined);
    }
    return payload as unknown as Product;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface SellerOwnProductInput {
  title: string;
  description: string;
  category: ProductCategory;
  sellingPrice: number;
  mrp: number;
  stock: number;
  images: string[];
  tags?: string[];
  isActive: boolean;
}

export async function saveSellerOwnProduct(
  seller: SellerProfile,
  input: SellerOwnProductInput,
  existingProduct?: Product
): Promise<Product> {
  if (seller.isActive === false || seller.storeStatus === 'Suspended' || seller.storeStatus === 'Closed') {
    throw new Error(`Your store is currently ${seller.storeStatus || 'paused'} by marketplace administration.`);
  }
  const productId = existingProduct?.id || generateId('ownprod');
  const path = `products/${productId}`;
  const cleanImages = input.images.map((u) => u.trim()).filter(Boolean).slice(0, 5);
  if (cleanImages.length === 0) {
    throw new Error('Please upload or provide at least one product image.');
  }

  const sellingPrice = Math.max(1, Math.round(Number(input.sellingPrice)));
  const mrp = Math.max(sellingPrice, Math.round(Number(input.mrp)));
  const stock = Math.max(0, Math.floor(Number(input.stock)));
  const cleanTags = (input.tags || [])
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);

  const payload: Record<string, unknown> = {
    id: productId,
    sellerId: seller.uid,
    storeId: seller.uid,
    sellerStoreName: seller.storeName.slice(0, 100),
    ownershipType: 'SELLER_OWNED' as ProductOwnershipType,
    title: input.title.trim().slice(0, 140),
    description: input.description.trim().slice(0, 2000),
    category: input.category,
    basePrice: sellingPrice,
    sellingPrice,
    mrp,
    sellerMargin: sellingPrice,
    stock,
    images: cleanImages,
    ratingAvg: existingProduct?.ratingAvg ?? 0,
    ratingCount: existingProduct?.ratingCount ?? 0,
    isActive: input.isActive,
    availableForSellers: false,
    updatedAt: serverTimestamp(),
  };

  if (cleanTags.length > 0) {
    payload.tags = cleanTags;
  }

  try {
    if (existingProduct) {
      const updatePayload: Record<string, unknown> = {
        title: payload.title,
        description: payload.description,
        category: payload.category,
        basePrice: sellingPrice,
        sellingPrice,
        mrp,
        sellerMargin: sellingPrice,
        stock,
        images: cleanImages,
        isActive: input.isActive,
        updatedAt: serverTimestamp(),
      };
      if (cleanTags.length > 0) {
        updatePayload.tags = cleanTags;
      }
      await updateDoc(doc(db, 'products', productId), updatePayload);
    } else {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'products', productId), payload);
    }
    return payload as unknown as Product;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSellerOwnProduct(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateCentralProductFields(
  productId: string,
  updates: Partial<Pick<Product, 'isActive' | 'availableForSellers' | 'stock'>>
): Promise<void> {
  const path = `products/${productId}`;
  try {
    await updateDoc(doc(db, 'products', productId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCentralProduct(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    const linkedSnap = await getDocs(
      query(collection(db, 'storeProducts'), where('productId', '==', productId))
    );
    await Promise.all(linkedSnap.docs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
    await deleteDoc(doc(db, 'ownerProducts', productId)).catch(() => undefined);
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function purgeLegacyDemoProducts(): Promise<number> {
  let deleted = 0;
  for (const prodId of LEGACY_DEMO_PRODUCT_IDS) {
    try {
      const snap = await getDoc(doc(db, 'products', prodId));
      if (snap.exists()) {
        await deleteCentralProduct(prodId);
        deleted += 1;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${prodId}`);
    }
  }
  return deleted;
}

export async function updateMarketplaceOrderSettings(
  acceptingOrders: boolean,
  pauseMessage: string,
  updatedBy = 'owner',
  minPayoutAmount?: number
): Promise<MarketplaceSettings> {
  const path = 'settings/marketplace';
  const payload: Record<string, unknown> = {
    id: 'marketplace',
    acceptingOrders,
    pauseMessage: pauseMessage.trim().slice(0, 300),
    updatedBy: updatedBy.slice(0, 128),
    updatedAt: serverTimestamp(),
  };
  if (minPayoutAmount !== undefined && Number.isFinite(minPayoutAmount)) {
    payload.minPayoutAmount = Math.max(10, Math.min(100000, Math.round(minPayoutAmount)));
  }
  try {
    await setDoc(doc(db, 'settings', 'marketplace'), payload, { merge: true });
    return payload as unknown as MarketplaceSettings;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateSellerOwnerControls(
  sellerId: string,
  updates: { isVerified?: boolean; isActive?: boolean; storeStatus?: StoreStatus; closedAt?: string }
): Promise<void> {
  const path = `sellers/${sellerId}`;
  try {
    await updateDoc(doc(db, 'sellers', sellerId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    const storePatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.isVerified !== undefined) storePatch.isVerified = updates.isVerified;
    if (updates.isActive !== undefined) storePatch.isActive = updates.isActive;
    if (updates.storeStatus !== undefined) storePatch.storeStatus = updates.storeStatus;
    await updateDoc(doc(db, 'stores', sellerId), storePatch).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setSellerStoreLifecycle(
  sellerId: string,
  nextStatus: StoreStatus
): Promise<void> {
  const isActive = nextStatus === 'Active';
  const updates: { isActive: boolean; storeStatus: StoreStatus; closedAt?: string } = {
    isActive,
    storeStatus: nextStatus,
  };
  if (nextStatus === 'Closed') {
    updates.closedAt = new Date().toISOString();
  }
  await updateSellerOwnerControls(sellerId, updates);
}

export async function updateSellerStoreProductPrice(
  storeProduct: StoreProduct,
  centralProduct: Product,
  nextSellingPrice: number,
  nextIsActive = storeProduct.isActive
): Promise<void> {
  const cleanPrice = Math.round(Number(nextSellingPrice));
  if (cleanPrice < centralProduct.basePrice || cleanPrice > centralProduct.mrp) {
    throw new Error(
      `Selling price must be between ₹${centralProduct.basePrice} (Base) and ₹${centralProduct.mrp} (MRP).`
    );
  }
  const margin = cleanPrice - centralProduct.basePrice;
  if (typeof centralProduct.maxSellerMargin === 'number' && margin > centralProduct.maxSellerMargin) {
    throw new Error(
      `Owner maximum permitted seller margin for this product is ₹${centralProduct.maxSellerMargin}.`
    );
  }

  const path = `storeProducts/${storeProduct.id}`;
  try {
    const patch = {
      sellingPrice: cleanPrice,
      sellerMargin: margin,
      isActive: nextIsActive,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'storeProducts', storeProduct.id), patch);
    await updateDoc(doc(db, 'sellerStoreProducts', storeProduct.id), patch).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeProductFromSellerStore(storeProductId: string): Promise<void> {
  const path = `storeProducts/${storeProductId}`;
  try {
    await deleteDoc(doc(db, 'storeProducts', storeProductId));
    await deleteDoc(doc(db, 'sellerStoreProducts', storeProductId)).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleWishlistItem(
  userId: string,
  productId: string,
  currentlySaved: boolean
): Promise<void> {
  const docId = `${userId}_${productId}`;
  const path = `wishlist/${docId}`;
  const refDoc = doc(db, 'wishlist', docId);
  try {
    if (currentlySaved) {
      await deleteDoc(refDoc);
    } else {
      await setDoc(refDoc, {
        userId,
        productId,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function submitProductReview(
  productId: string,
  user: { uid: string; name: string },
  rating: number,
  comment: string
): Promise<void> {
  const reviewId = generateId('rev');
  const reviewRef = doc(db, 'reviews', reviewId);
  const productRef = doc(db, 'products', productId);

  try {
    await runTransaction(db, async (tx) => {
      const prodSnap = await tx.get(productRef);
      if (!prodSnap.exists()) {
        throw new Error('Product does not exist.');
      }
      const prodData = prodSnap.data() as Product;
      const prevCount = Number(prodData.ratingCount || 0);
      const prevAvg = Number(prodData.ratingAvg || 0);
      const nextCount = prevCount + 1;
      const nextAvg = Number((((prevAvg * prevCount) + rating) / nextCount).toFixed(2));

      tx.set(reviewRef, {
        id: reviewId,
        productId,
        userId: user.uid,
        userName: user.name.trim().slice(0, 100) || 'TISAHARA Buyer',
        rating: Math.min(5, Math.max(1, Math.round(rating))),
        comment: comment.trim().slice(0, 1000),
        createdAt: serverTimestamp(),
      });

      tx.update(productRef, {
        ratingAvg: nextAvg,
        ratingCount: nextCount,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reviews/${reviewId}`);
  }
}

export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const path = `reviews?productId=${productId}`;
  try {
    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ProductReview);
  } catch (error) {
    try {
      const qFallback = query(collection(db, 'reviews'), where('productId', '==', productId), limit(30));
      const snap = await getDocs(qFallback);
      return snap.docs.map((d) => d.data() as ProductReview);
    } catch (innerErr) {
      handleFirestoreError(innerErr ?? error, OperationType.LIST, path);
    }
  }
}

export interface CheckoutPriceIssue {
  code: 'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
  productId: string;
  title: string;
  oldPrice?: number;
  newPrice?: number;
  availableStock?: number;
}

export class CheckoutValidationError extends Error {
  issue: CheckoutPriceIssue;
  constructor(message: string, issue: CheckoutPriceIssue) {
    super(message);
    this.issue = issue;
  }
}

export interface PreparedOrderGroup {
  groupKey: string;
  sellerId: string;
  sellerStoreName: string;
  ownershipType: ProductOwnershipType;
  orderType: OrderType;
  items: Array<{
    productId: string;
    storeProductId?: string;
    sellerId: string;
    sellerStoreName: string;
    title: string;
    image: string;
    basePrice: number;
    sellingPrice: number;
    sellerMargin: number;
    ownershipType: ProductOwnershipType;
    orderType: OrderType;
    quantity: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  totalSellerMargin: number;
  tisaharaFee: number;
  sellerPayableAmount: number;
}

export async function prepareOrdersOnServer(
  items: CartItem[],
  idempotencyKey: string
): Promise<{ checkoutGroupId: string; orderGroups: PreparedOrderGroup[]; grandTotal: number }> {
  try {
    const res = await fetch('/api/orders/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey, items }),
    });
    if (res.status === 409) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'Duplicate checkout submission prevented.');
    }
    if (res.ok) {
      return (await res.json()) as {
        checkoutGroupId: string;
        orderGroups: PreparedOrderGroup[];
        grandTotal: number;
      };
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Duplicate')) {
      throw err;
    }
  }

  // Deterministic mirror fallback
  const byGroup = new Map<string, CartItem[]>();
  for (const item of items) {
    const orderType: OrderType = item.storeProductId
      ? 'SELLER_DROPSHIP'
      : item.ownershipType === 'SELLER_OWNED' && item.sellerId !== 'tisahara_owner'
      ? 'SELLER_OWN_PRODUCT'
      : item.sellerId === 'tisahara_owner'
      ? 'DIRECT_OWNER'
      : 'SELLER_DROPSHIP';
    const key = `${item.sellerId}__${orderType}`;
    const list = byGroup.get(key) || [];
    list.push(item);
    byGroup.set(key, list);
  }
  const checkoutGroupId = generateId('grp');
  const orderGroups: PreparedOrderGroup[] = Array.from(byGroup.entries()).map(([groupKey, grp]) => {
    const first = grp[0];
    const orderType: OrderType = first.storeProductId
      ? 'SELLER_DROPSHIP'
      : first.ownershipType === 'SELLER_OWNED' && first.sellerId !== 'tisahara_owner'
      ? 'SELLER_OWN_PRODUCT'
      : first.sellerId === 'tisahara_owner'
      ? 'DIRECT_OWNER'
      : 'SELLER_DROPSHIP';
    const ownershipType: ProductOwnershipType =
      orderType === 'SELLER_OWN_PRODUCT' ? 'SELLER_OWNED' : 'OWNER';
    const subtotal = grp.reduce((s, i) => s + i.sellingPrice * i.quantity, 0);
    const totalSellerMargin =
      orderType === 'DIRECT_OWNER'
        ? 0
        : orderType === 'SELLER_OWN_PRODUCT'
        ? subtotal
        : grp.reduce((s, i) => s + Math.max(0, i.sellingPrice - i.basePrice) * i.quantity, 0);
    const deliveryFee = subtotal >= 499 ? 0 : 49;
    const tisaharaFee = orderType === 'SELLER_OWN_PRODUCT' ? 10 : orderType === 'SELLER_DROPSHIP' ? 5 : 0;
    const sellerPayableAmount =
      orderType === 'DIRECT_OWNER'
        ? 0
        : orderType === 'SELLER_OWN_PRODUCT'
        ? Math.max(0, subtotal - 10)
        : Math.max(0, totalSellerMargin - 5);

    return {
      groupKey,
      sellerId: first.sellerId,
      sellerStoreName: first.sellerStoreName,
      ownershipType,
      orderType,
      items: grp.map((i) => ({
        ...i,
        ownershipType,
        orderType,
        sellerMargin:
          orderType === 'DIRECT_OWNER'
            ? 0
            : orderType === 'SELLER_OWN_PRODUCT'
            ? i.sellingPrice
            : Math.max(0, i.sellingPrice - i.basePrice),
      })),
      subtotal,
      deliveryFee,
      discountAmount: 0,
      totalAmount: subtotal + deliveryFee,
      totalSellerMargin,
      tisaharaFee,
      sellerPayableAmount,
    };
  });
  return {
    checkoutGroupId,
    orderGroups,
    grandTotal: orderGroups.reduce((s, g) => s + g.totalAmount, 0),
  };
}

/**
 * Atomic multi-vendor checkout:
 * - Calls /api/orders/prepare for authoritative order routing, fee & idempotency check.
 * - Rechecks live product price, stock, and seller active/suspended/closed status inside Firestore transaction.
 * - Splits orders strictly by `${sellerId}__${orderType}` (never mixes Owner Direct, Own Product, and Dropship).
 * - Writes orders, normalized orderItems, and commissions (when signed in) atomically.
 */
export async function placeMarketplaceOrders(params: {
  items: CartItem[];
  customerId: string | null;
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
}): Promise<MarketplaceOrder[]> {
  const { items, customerId, shippingAddress, paymentMethod, idempotencyKey } = params;
  if (items.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const cleanFullName = shippingAddress.fullName.trim();
  const cleanPhone = shippingAddress.phone.trim();
  const cleanPhoneDigits = cleanPhone.replace(/\D/g, '');
  const cleanStreet = shippingAddress.street.trim();
  const cleanCity = shippingAddress.city.trim();
  const cleanState = shippingAddress.state.trim();
  const cleanPincode = shippingAddress.pincode.trim();

  if (cleanFullName.length < 2) {
    throw new Error('Please enter a valid recipient full name.');
  }
  if (cleanPhoneDigits.length < 10 || cleanPhone.length > 20) {
    throw new Error('Please enter a valid 10-digit mobile phone number.');
  }
  if (cleanStreet.length < 5) {
    throw new Error('Please enter a complete house/flat/street delivery address.');
  }
  if (cleanCity.length < 2 || cleanState.length < 2) {
    throw new Error('Please enter valid city and state names.');
  }
  if (!/^[a-zA-Z0-9\- ]{4,12}$/.test(cleanPincode)) {
    throw new Error('Please enter a valid 6-digit PIN code.');
  }

  const effectiveKey = idempotencyKey || generateId('chk');
  const prepared = await prepareOrdersOnServer(items, effectiveKey);
  const checkoutGroupId = prepared.checkoutGroupId || generateId('grp');
  const effectiveCustomerId = customerId || 'guest';
  const guestSessionId = customerId ? undefined : getGuestSessionId();

  // Re-group items strictly by sellerId + live orderType
  const createdOrders: MarketplaceOrder[] = [];

  try {
    await runTransaction(db, async (tx) => {
      // 0. Check global Owner order acceptance setting
      const settingsSnap = await tx.get(doc(db, 'settings', 'marketplace'));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data() as Partial<MarketplaceSettings>;
        if (settingsData.acceptingOrders === false) {
          throw new CheckoutValidationError(
            settingsData.pauseMessage ||
              'Marketplace order acceptance is currently paused by the Owner. Please try again later.',
            {
              code: 'UNAVAILABLE',
              productId: items[0].productId,
              title: items[0].title,
            }
          );
        }
      }

      // 1. Read all products, linked storeProducts, and involved sellers FIRST
      const liveProducts = new Map<string, Product>();
      const liveStoreProducts = new Map<string, StoreProduct>();
      const liveSellers = new Map<string, SellerProfile>();

      const uniqueSellerIds = Array.from(new Set(items.map((i) => i.sellerId).filter((sid) => sid !== 'tisahara_owner')));
      for (const sid of uniqueSellerIds) {
        const sSnap = await tx.get(doc(db, 'sellers', sid));
        if (!sSnap.exists()) {
          throw new CheckoutValidationError('This seller store does not exist.', {
            code: 'UNAVAILABLE',
            productId: items[0].productId,
            title: items[0].title,
          });
        }
        const sData = sSnap.data() as SellerProfile;
        if (sData.isActive === false || sData.storeStatus === 'Suspended' || sData.storeStatus === 'Closed') {
          throw new CheckoutValidationError(
            `Store "${sData.storeName}" is currently ${sData.storeStatus || 'paused'} and cannot accept orders.`,
            {
              code: 'UNAVAILABLE',
              productId: items[0].productId,
              title: items[0].title,
            }
          );
        }
        liveSellers.set(sid, sData);
      }

      for (const item of items) {
        const prodRef = doc(db, 'products', item.productId);
        const snap = await tx.get(prodRef);
        if (!snap.exists()) {
          throw new CheckoutValidationError(`"${item.title}" is no longer available.`, {
            code: 'UNAVAILABLE',
            productId: item.productId,
            title: item.title,
          });
        }
        const live = snap.data() as Product;
        if (!live.isActive) {
          throw new CheckoutValidationError(`"${live.title}" is currently paused by marketplace administration.`, {
            code: 'UNAVAILABLE',
            productId: live.id,
            title: live.title,
          });
        }

        let effectivePrice = live.sellingPrice;
        if (item.storeProductId) {
          const spRef = doc(db, 'storeProducts', item.storeProductId);
          const spSnap = await tx.get(spRef);
          if (!spSnap.exists()) {
            throw new CheckoutValidationError(`"${live.title}" was removed from this seller's store.`, {
              code: 'UNAVAILABLE',
              productId: live.id,
              title: live.title,
            });
          }
          const liveSp = spSnap.data() as StoreProduct;
          if (!liveSp.isActive || live.availableForSellers === false) {
            throw new CheckoutValidationError(`"${live.title}" is currently unavailable in this store.`, {
              code: 'UNAVAILABLE',
              productId: live.id,
              title: live.title,
            });
          }
          effectivePrice = liveSp.sellingPrice;
          liveStoreProducts.set(item.storeProductId, liveSp);
        }

        if (effectivePrice !== item.sellingPrice) {
          throw new CheckoutValidationError(
            `Price updated for "${live.title}": ₹${item.sellingPrice} -> ₹${effectivePrice}. Please review your cart.`,
            {
              code: 'PRICE_CHANGED',
              productId: live.id,
              title: live.title,
              oldPrice: item.sellingPrice,
              newPrice: effectivePrice,
            }
          );
        }
        if (live.stock < item.quantity) {
          throw new CheckoutValidationError(
            `Only ${live.stock} unit(s) left for "${live.title}".`,
            {
              code: 'OUT_OF_STOCK',
              productId: live.id,
              title: live.title,
              availableStock: live.stock,
            }
          );
        }
        liveProducts.set(live.id, live);
      }

      // 2. Stock decrements
      const qtyByProduct = new Map<string, number>();
      for (const item of items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
      }
      for (const [productId, totalQty] of qtyByProduct.entries()) {
        const live = liveProducts.get(productId)!;
        if (live.stock < totalQty) {
          throw new CheckoutValidationError(
            `Only ${live.stock} unit(s) left for "${live.title}".`,
            {
              code: 'OUT_OF_STOCK',
              productId: live.id,
              title: live.title,
              availableStock: live.stock,
            }
          );
        }
        const prodRef = doc(db, 'products', productId);
        tx.update(prodRef, {
          stock: live.stock - totalQty,
          updatedAt: serverTimestamp(),
        });
      }

      // 3. Group verified items strictly by sellerId + live orderType (never mixed)
      const splitGroups = new Map<string, { sellerId: string; orderType: OrderType; ownershipType: ProductOwnershipType; items: CartItem[] }>();
      for (const ci of items) {
        const live = liveProducts.get(ci.productId)!;
        const orderType: OrderType = ci.storeProductId
          ? 'SELLER_DROPSHIP'
          : live.ownershipType === 'SELLER_OWNED' && live.sellerId !== 'tisahara_owner'
          ? 'SELLER_OWN_PRODUCT'
          : ci.sellerId === 'tisahara_owner'
          ? 'DIRECT_OWNER'
          : 'SELLER_DROPSHIP';
        const ownershipType: ProductOwnershipType =
          orderType === 'SELLER_OWN_PRODUCT' ? 'SELLER_OWNED' : 'OWNER';
        const resolvedSellerId = orderType === 'DIRECT_OWNER' ? 'tisahara_owner' : ci.sellerId;
        const key = `${resolvedSellerId}__${orderType}`;
        const existingGroup = splitGroups.get(key) || {
          sellerId: resolvedSellerId,
          orderType,
          ownershipType,
          items: [],
        };
        existingGroup.items.push(ci);
        splitGroups.set(key, existingGroup);
      }

      // 4. Create orders, orderItems, and commissions
      for (const group of splitGroups.values()) {
        const orderId = generateId('ord');
        const orderRef = doc(db, 'orders', orderId);

        const orderLineItems = group.items.map((ci) => {
          const live = liveProducts.get(ci.productId)!;
          const liveSp = ci.storeProductId ? liveStoreProducts.get(ci.storeProductId) : undefined;
          const sellingPrice = liveSp ? liveSp.sellingPrice : live.sellingPrice;
          const basePrice = liveSp ? liveSp.basePrice : live.basePrice;
          const itemMargin =
            group.orderType === 'DIRECT_OWNER'
              ? 0
              : group.orderType === 'SELLER_OWN_PRODUCT'
              ? sellingPrice
              : liveSp
              ? liveSp.sellerMargin
              : Math.max(0, sellingPrice - basePrice);

          return {
            productId: live.id,
            title: live.title,
            image: live.images[0] || ci.image,
            quantity: ci.quantity,
            basePrice,
            sellingPrice,
            sellerMargin: itemMargin,
          };
        });

        const subtotal = orderLineItems.reduce((sum, li) => sum + li.sellingPrice * li.quantity, 0);
        const totalSellerMargin =
          group.orderType === 'DIRECT_OWNER'
            ? 0
            : orderLineItems.reduce((sum, li) => sum + li.sellerMargin * li.quantity, 0);
        const deliveryFee = subtotal >= 499 ? 0 : 49;
        const discountAmount = 0;
        const totalAmount = subtotal + deliveryFee - discountAmount;
        const tisaharaFee =
          group.orderType === 'SELLER_OWN_PRODUCT'
            ? 10
            : group.orderType === 'SELLER_DROPSHIP'
            ? 5
            : 0;
        const sellerPayableAmount =
          group.orderType === 'DIRECT_OWNER'
            ? 0
            : group.orderType === 'SELLER_OWN_PRODUCT'
            ? Math.max(0, subtotal - 10)
            : Math.max(0, totalSellerMargin - 5);

        const firstSp = group.items[0].storeProductId
          ? liveStoreProducts.get(group.items[0].storeProductId)
          : undefined;
        const liveSeller = liveSellers.get(group.sellerId);
        const storeName =
          group.orderType === 'DIRECT_OWNER'
            ? 'TISAHARA Central'
            : liveSeller?.storeName ||
              firstSp?.sellerStoreName ||
              liveProducts.get(group.items[0].productId)?.sellerStoreName ||
              group.items[0].sellerStoreName;

        const orderPayload: Record<string, unknown> = {
          id: orderId,
          checkoutGroupId,
          customerId: effectiveCustomerId,
          sellerId: group.sellerId,
          storeId: group.sellerId,
          sellerStoreName: storeName.slice(0, 100),
          ownershipType: group.ownershipType,
          orderType: group.orderType,
          items: orderLineItems,
          subtotal,
          deliveryFee,
          discountAmount,
          totalAmount,
          totalSellerMargin,
          tisaharaFee,
          sellerPayableAmount,
          paymentMethod,
          paymentStatus: 'Pending',
          status: 'Pending',
          returnStatus: 'None',
          payoutStatus: 'Pending',
          shippingAddress: {
            fullName: shippingAddress.fullName.trim().slice(0, 120),
            phone: shippingAddress.phone.trim().slice(0, 20),
            street: shippingAddress.street.trim().slice(0, 250),
            city: shippingAddress.city.trim().slice(0, 80),
            state: shippingAddress.state.trim().slice(0, 80),
            pincode: shippingAddress.pincode.trim().slice(0, 12),
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (guestSessionId) {
          orderPayload.guestSessionId = guestSessionId;
        }

        tx.set(orderRef, orderPayload);

        // Normalized orderItems records
        orderLineItems.forEach((li, idx) => {
          const itemId = `${orderId}_${idx}`;
          tx.set(doc(db, 'orderItems', itemId), {
            id: itemId,
            orderId,
            customerId: effectiveCustomerId,
            sellerId: group.sellerId,
            productId: li.productId,
            title: li.title.slice(0, 140),
            quantity: li.quantity,
            basePrice: li.basePrice,
            sellingPrice: li.sellingPrice,
            sellerMargin: li.sellerMargin,
            orderType: group.orderType,
            createdAt: serverTimestamp(),
          });
        });

        // Create deterministic commission & platformFees ledger entries when signed in
        if (customerId) {
          const feeEntry = {
            id: orderId,
            orderId,
            sellerId: group.sellerId,
            storeId: group.sellerId,
            orderType: group.orderType,
            feeAmount: tisaharaFee,
            orderSubtotal: subtotal,
            sellerMargin: totalSellerMargin,
            sellerPayableAmount,
            status: 'Pending_Delivery',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          tx.set(doc(db, 'commissions', orderId), feeEntry);
          tx.set(doc(db, 'platformFees', orderId), feeEntry);
        }

        createdOrders.push(orderPayload as unknown as MarketplaceOrder);
      }
    });

    if (!customerId && createdOrders.length > 0) {
      const existingRaw = localStorage.getItem('tisahara_guest_orders');
      const existingList: MarketplaceOrder[] = existingRaw ? JSON.parse(existingRaw) : [];
      const stamped = createdOrders.map((o) => ({
        ...o,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      localStorage.setItem('tisahara_guest_orders', JSON.stringify([...stamped, ...existingList].slice(0, 30)));
    }

    if (customerId) {
      for (const ord of createdOrders) {
        if (ord.sellerId !== 'tisahara_owner') {
          await createNotification({
            userId: ord.sellerId,
            title:
              ord.orderType === 'SELLER_OWN_PRODUCT'
                ? 'New Own-Product Order (Action Required)'
                : 'New Dropship Store Order',
            message: `Order ${ord.id} · ₹${ord.totalAmount} · Est. Net Payable ₹${ord.sellerPayableAmount ?? 0} (${ord.shippingAddress.city}).`,
            type: 'seller',
            relatedId: ord.id,
          }).catch(() => undefined);
        }

        await createNotification({
          userId: customerId,
          title: 'Order Placed Successfully',
          message: `Your order ${ord.id} with ${ord.sellerStoreName} for ₹${ord.totalAmount} is Pending confirmation.`,
          type: 'order',
          relatedId: ord.id,
        }).catch(() => undefined);
      }
    }

    return createdOrders;
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'orders');
  }
}

export async function updateOrderStatus(
  order: MarketplaceOrder,
  nextStatus: OrderStatus,
  tracking?: { courierPartner?: string; trackingNumber?: string }
): Promise<void> {
  const path = `orders/${order.id}`;
  const orderRef = doc(db, 'orders', order.id);
  const commRef = doc(db, 'commissions', order.id);
  const feeRef = doc(db, 'platformFees', order.id);
  const callerIsAdmin = isFirebaseOwnerAdmin();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const liveOrder = snap.data() as MarketplaceOrder;

      if (liveOrder.status === 'Delivered' || liveOrder.status === 'Cancelled') {
        throw new Error(`Order is already ${liveOrder.status} and cannot be modified.`);
      }

      // All reads MUST execute before writes in Firestore transactions
      const commSnap = await tx.get(commRef);
      const feeSnap = await tx.get(feeRef);
      const sellerSnap =
        nextStatus === 'Delivered' && callerIsAdmin && liveOrder.sellerId !== 'tisahara_owner'
          ? await tx.get(doc(db, 'sellers', liveOrder.sellerId))
          : null;

      const productSnaps = new Map<string, number>();
      if (nextStatus === 'Cancelled') {
        for (const item of liveOrder.items) {
          if (productSnaps.has(item.productId)) continue;
          const pSnap = await tx.get(doc(db, 'products', item.productId));
          if (pSnap.exists()) {
            productSnaps.set(item.productId, Number((pSnap.data() as Product).stock || 0));
          }
        }
      }

      const nowMs = Date.now();
      const deadlineMs = nowMs + SEVEN_DAYS_MS;
      const orderType = inferOrderType(liveOrder);
      const feeAmount = getOrderTisaharaFee(liveOrder);
      const payableAmount = getOrderSellerPayable(liveOrder);

      const updates: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      };

      if (nextStatus === 'Delivered') {
        updates.paymentStatus = 'Paid';
        updates.deliveredAt = serverTimestamp();
        updates.deliveredAtMs = nowMs;
        updates.returnDeadlineMs = deadlineMs;
        updates.returnDeadline = new Date(deadlineMs).toISOString();
        updates.payoutStatus = orderType === 'DIRECT_OWNER' ? 'Paid' : 'In_Return_Window';
      } else if (nextStatus === 'Cancelled') {
        if (liveOrder.paymentStatus === 'Paid') {
          updates.paymentStatus = 'Refunded';
        }
        updates.payoutStatus = 'Forfeited_Cancelled';
      }

      if (tracking?.courierPartner !== undefined) {
        updates.courierPartner = tracking.courierPartner.trim().slice(0, 80);
      }
      if (tracking?.trackingNumber !== undefined) {
        updates.trackingNumber = tracking.trackingNumber.trim().slice(0, 80);
      }

      if (nextStatus === 'Cancelled') {
        const qtyRestoreByProd = new Map<string, number>();
        for (const item of liveOrder.items) {
          qtyRestoreByProd.set(item.productId, (qtyRestoreByProd.get(item.productId) || 0) + item.quantity);
        }
        for (const [productId, restoreQty] of qtyRestoreByProd.entries()) {
          const currentStock = productSnaps.get(productId);
          if (currentStock !== undefined) {
            tx.update(doc(db, 'products', productId), {
              stock: currentStock + restoreQty,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      if (nextStatus === 'Delivered' && sellerSnap && sellerSnap.exists()) {
        const s = sellerSnap.data() as SellerProfile;
        tx.update(doc(db, 'sellers', liveOrder.sellerId), {
          totalSales: Number(s.totalSales || 0) + 1,
          totalEarnings: Number(s.totalEarnings || 0) + payableAmount,
          updatedAt: serverTimestamp(),
        });
      }

      if (nextStatus === 'Delivered' || nextStatus === 'Cancelled') {
        const nextCommStatus =
          nextStatus === 'Delivered' ? 'In_Return_Window' : 'Voided_Cancelled';
        const ledgerPayload = {
          id: liveOrder.id,
          orderId: liveOrder.id,
          sellerId: liveOrder.sellerId,
          storeId: liveOrder.sellerId,
          orderType,
          feeAmount: nextStatus === 'Cancelled' ? 0 : feeAmount,
          orderSubtotal: liveOrder.subtotal,
          sellerMargin: liveOrder.totalSellerMargin,
          sellerPayableAmount: nextStatus === 'Cancelled' ? 0 : payableAmount,
          status: nextCommStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (commSnap.exists()) {
          tx.update(commRef, {
            status: nextCommStatus,
            ...(nextStatus === 'Cancelled' ? { feeAmount: 0, sellerPayableAmount: 0 } : {}),
            updatedAt: serverTimestamp(),
          });
        } else if (callerIsAdmin || orderType === 'SELLER_OWN_PRODUCT') {
          tx.set(commRef, ledgerPayload);
        }

        if (feeSnap.exists()) {
          tx.update(feeRef, {
            status: nextCommStatus,
            ...(nextStatus === 'Cancelled' ? { feeAmount: 0, sellerPayableAmount: 0 } : {}),
            updatedAt: serverTimestamp(),
          });
        } else if (callerIsAdmin || orderType === 'SELLER_OWN_PRODUCT') {
          tx.set(feeRef, ledgerPayload);
        }
      }

      tx.update(orderRef, updates);
    });

    if (order.customerId && order.customerId !== 'guest') {
      await createNotification({
        userId: order.customerId,
        title: `Order ${nextStatus}`,
        message: `Your order ${order.id} from ${order.sellerStoreName} is now ${nextStatus}.`,
        type: 'order',
        relatedId: order.id,
      }).catch(() => undefined);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitReturnRequest(params: {
  order: MarketplaceOrder;
  customerId: string;
  reason: string;
  comments?: string;
}): Promise<ReturnRequest> {
  const { order, customerId, reason, comments } = params;
  if (order.status !== 'Delivered') {
    throw new Error('Returns can only be requested after delivery.');
  }
  if (order.returnDeadlineMs && Date.now() > order.returnDeadlineMs) {
    throw new Error('The 7-day return window for this order has expired.');
  }
  if (order.returnStatus && order.returnStatus !== 'None') {
    throw new Error(`A return request already exists (${order.returnStatus}).`);
  }

  const returnId = order.id;
  const returnRef = doc(db, 'returns', returnId);
  const orderRef = doc(db, 'orders', order.id);
  const orderType = inferOrderType(order);

  const payload: Record<string, unknown> = {
    id: returnId,
    orderId: order.id,
    customerId,
    sellerId: order.sellerId,
    storeId: order.sellerId,
    orderType,
    reason: reason.trim().slice(0, 120),
    ...(comments && comments.trim() ? { comments: comments.trim().slice(0, 800) } : {}),
    amount: order.totalAmount,
    status: 'Requested',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await runTransaction(db, async (tx) => {
      const existingReturn = await tx.get(returnRef);
      if (existingReturn.exists()) {
        throw new Error('A return request has already been submitted for this order.');
      }
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Order not found.');
      }
      tx.set(returnRef, payload);
      tx.update(orderRef, {
        returnStatus: 'Requested',
        payoutStatus: 'Held_Return',
        updatedAt: serverTimestamp(),
      });
    });

    if (order.sellerId && order.sellerId !== 'tisahara_owner') {
      await createNotification({
        userId: order.sellerId,
        title: '7-Day Return Requested',
        message: `Return requested for Order ${order.id} (${reason}). Seller payout for this order is held pending resolution.`,
        type: 'order',
        relatedId: order.id,
      }).catch(() => undefined);
    }

    return payload as unknown as ReturnRequest;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already') || error.message.includes('window'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `returns/${returnId}`);
  }
}

export async function processReturnDecision(params: {
  returnRequest: ReturnRequest;
  order?: MarketplaceOrder;
  decision: 'Approve_Refund' | 'Approved' | 'Rejected';
  adminNote?: string;
}): Promise<void> {
  const { returnRequest, order, decision, adminNote } = params;
  const returnRef = doc(db, 'returns', returnRequest.id);
  const orderRef = doc(db, 'orders', returnRequest.orderId);
  const commRef = doc(db, 'commissions', returnRequest.orderId);
  const feeRef = doc(db, 'platformFees', returnRequest.orderId);
  const refundRef = doc(db, 'refunds', returnRequest.orderId);

  const callerIsAdmin = isFirebaseOwnerAdmin();

  try {
    await runTransaction(db, async (tx) => {
      const retSnap = await tx.get(returnRef);
      if (!retSnap.exists()) throw new Error('Return request not found.');
      const ordSnap = await tx.get(orderRef);
      const commSnap = callerIsAdmin ? await tx.get(commRef) : null;
      const feeSnap = callerIsAdmin ? await tx.get(feeRef) : null;

      if (!callerIsAdmin) {
        // Seller Type A reviewing own-product return request
        const sellerNextStatus = decision === 'Rejected' ? 'Rejected' : 'Approved';
        tx.update(returnRef, {
          status: sellerNextStatus,
          ...(adminNote ? { adminNote: adminNote.trim().slice(0, 400) } : {}),
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return;
      }

      // Admin full decision path
      const liveOrder = ordSnap.exists() ? (ordSnap.data() as MarketplaceOrder) : order;
      const nowMs = Date.now();

      if (decision === 'Approve_Refund') {
        tx.update(returnRef, {
          status: 'Refunded',
          ...(adminNote ? { adminNote: adminNote.trim().slice(0, 400) } : {}),
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(refundRef, {
          id: returnRequest.orderId,
          orderId: returnRequest.orderId,
          returnId: returnRequest.id,
          customerId: returnRequest.customerId,
          sellerId: returnRequest.sellerId,
          amount: returnRequest.amount,
          method: liveOrder?.paymentMethod === 'COD' ? 'UPI / Bank Refund' : 'Gateway Refund',
          status: 'Processed',
          ...(adminNote ? { note: adminNote.trim().slice(0, 400) } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (ordSnap.exists()) {
          tx.update(orderRef, {
            returnStatus: 'Refunded',
            paymentStatus: 'Refunded',
            payoutStatus: 'Forfeited_Refunded',
            updatedAt: serverTimestamp(),
          });
        }

        if (commSnap && commSnap.exists()) {
          tx.update(commRef, {
            feeAmount: 0,
            sellerPayableAmount: 0,
            status: 'Voided_Refunded',
            updatedAt: serverTimestamp(),
          });
        }
        if (feeSnap && feeSnap.exists()) {
          tx.update(feeRef, {
            feeAmount: 0,
            sellerPayableAmount: 0,
            status: 'Voided_Refunded',
            updatedAt: serverTimestamp(),
          });
        }
      } else if (decision === 'Approved') {
        tx.update(returnRef, {
          status: 'Approved',
          ...(adminNote ? { adminNote: adminNote.trim().slice(0, 400) } : {}),
          updatedAt: serverTimestamp(),
        });
        if (ordSnap.exists()) {
          tx.update(orderRef, {
            returnStatus: 'Approved',
            payoutStatus: 'Held_Return',
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        tx.update(returnRef, {
          status: 'Rejected',
          ...(adminNote ? { adminNote: adminNote.trim().slice(0, 400) } : {}),
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (ordSnap.exists() && liveOrder) {
          const pastWindow = !liveOrder.returnDeadlineMs || nowMs >= liveOrder.returnDeadlineMs;
          tx.update(orderRef, {
            returnStatus: 'Rejected',
            payoutStatus:
              inferOrderType(liveOrder) === 'DIRECT_OWNER'
                ? 'Paid'
                : pastWindow
                ? 'Eligible'
                : 'In_Return_Window',
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    await createNotification({
      userId: returnRequest.customerId,
      title:
        decision === 'Approve_Refund'
          ? 'Return Refund Processed'
          : decision === 'Approved'
          ? 'Return Request Approved'
          : 'Return Request Closed',
      message: `Your return request for order ${returnRequest.orderId} is now ${
        decision === 'Approve_Refund' ? 'Refunded' : decision
      }.`,
      type: 'order',
      relatedId: returnRequest.orderId,
    }).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `returns/${returnRequest.id}`);
  }
}

export async function calculateSellerFinancialsOnServer(params: {
  sellerId: string;
  orders: MarketplaceOrder[];
  returns: ReturnRequest[];
  payouts: PayoutRecord[];
}): Promise<SellerFinancialSummary> {
  try {
    const res = await fetch('/api/payouts/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      return (await res.json()) as SellerFinancialSummary;
    }
  } catch {
    // Fallback mirror
  }

  const nowMs = Date.now();
  const activeReturnByOrder = new Map<string, string>();
  for (const r of params.returns) {
    activeReturnByOrder.set(r.orderId, r.status);
  }

  let totalSales = 0;
  let ownProductGross = 0;
  let dropshipMarginGross = 0;
  let totalTisaharaFees = 0;
  let totalEarnings = 0;
  let pendingEarnings = 0;
  let heldReturnWindowAmount = 0;
  let heldDisputeAmount = 0;
  let availableBalance = 0;
  let grossForAvailableOrders = 0;
  let feesForAvailableOrders = 0;
  const eligibleOrderIds: string[] = [];

  for (const ord of params.orders) {
    if (ord.sellerId !== params.sellerId || ord.status === 'Cancelled') continue;
    const orderType = inferOrderType(ord);
    if (orderType === 'DIRECT_OWNER') continue;

    const subtotal = Math.max(0, Number(ord.subtotal || 0));
    const margin = Math.max(0, Number(ord.totalSellerMargin || 0));
    const fee = getOrderTisaharaFee(ord);
    const payable = getOrderSellerPayable(ord);

    totalSales += Math.max(0, Number(ord.totalAmount || subtotal));
    if (orderType === 'SELLER_OWN_PRODUCT') ownProductGross += subtotal;
    else dropshipMarginGross += margin;

    if (ord.status !== 'Delivered') {
      pendingEarnings += payable;
      continue;
    }
    const retStatus = activeReturnByOrder.get(ord.id) || ord.returnStatus || 'None';
    if (retStatus === 'Refunded' || ord.paymentStatus === 'Refunded' || ord.payoutStatus === 'Forfeited_Refunded') {
      continue;
    }

    totalTisaharaFees += fee;
    totalEarnings += payable;
    if (ord.payoutStatus === 'Paid' || ord.payoutStatus === 'Payout_Requested') continue;
    if (retStatus === 'Requested' || retStatus === 'Approved' || ord.payoutStatus === 'Held_Return') {
      heldDisputeAmount += payable;
      continue;
    }

    const deadlineMs = ord.returnDeadlineMs || ((ord.deliveredAtMs || 0) > 0 ? (ord.deliveredAtMs || 0) + SEVEN_DAYS_MS : 0);
    if (deadlineMs > nowMs && ord.payoutStatus !== 'Eligible') {
      heldReturnWindowAmount += payable;
    } else {
      availableBalance += payable;
      grossForAvailableOrders += orderType === 'SELLER_OWN_PRODUCT' ? subtotal : margin;
      feesForAvailableOrders += fee;
      eligibleOrderIds.push(ord.id);
    }
  }

  const paidOutTotal = params.payouts
    .filter((p) => p.sellerId === params.sellerId && p.status === 'Paid')
    .reduce((s, p) => s + Number(p.netPayableAmount || 0), 0);
  const pendingPayoutRequestTotal = params.payouts
    .filter((p) => p.sellerId === params.sellerId && OPEN_PAYOUT_STATUS_SET.has(p.status))
    .reduce((s, p) => s + Number(p.netPayableAmount || 0), 0);

  return {
    sellerId: params.sellerId,
    totalSales,
    ownProductGross,
    dropshipMarginGross,
    totalTisaharaFees,
    totalEarnings,
    pendingEarnings,
    returnPeriodHold: heldReturnWindowAmount + heldDisputeAmount,
    heldReturnWindowAmount,
    heldDisputeAmount,
    availableBalance,
    grossForAvailableOrders,
    feesForAvailableOrders,
    eligibleOrderIds,
    paidOutTotal,
    pendingPayoutRequestTotal,
  };
}

export interface SellerBankAccountInput {
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName?: string;
}

export async function fetchPayoutProviderStatus(): Promise<PayoutProviderStatus> {
  try {
    const res = await fetch('/api/payout-provider/status');
    if (res.ok) {
      return (await res.json()) as PayoutProviderStatus;
    }
  } catch {
    // Fallback below
  }
  return {
    provider: 'manual',
    connected: false,
    label: 'Manual Bank Transfer & Owner UTR Verification',
    supportsAutoPayout: false,
    supportsBeneficiaryVerification: false,
  };
}

export function validateSellerBankAccountInput(input: SellerBankAccountInput): {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName?: string;
} {
  const accountHolderName = input.accountHolderName.trim();
  const accountNumber = input.accountNumber.replace(/\s+/g, '');
  const confirmAccountNumber = input.confirmAccountNumber.replace(/\s+/g, '');
  const ifscCode = input.ifscCode.trim().toUpperCase();
  const bankName = input.bankName.trim();
  const branchName = input.branchName?.trim() || '';

  if (accountHolderName.length < 2 || accountHolderName.length > 120) {
    throw new Error('Account Holder Name must be between 2 and 120 characters.');
  }
  if (!/^\d{9,18}$/.test(accountNumber)) {
    throw new Error('Bank Account Number must be 9 to 18 numeric digits.');
  }
  if (accountNumber !== confirmAccountNumber) {
    throw new Error('Bank Account Number and Confirm Bank Account Number must match.');
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
    throw new Error(
      'Enter a valid 11-character IFSC Code (e.g. SBIN0001234 — 4 letters, 0, then 6 alphanumeric characters).'
    );
  }
  if (bankName.length < 2 || bankName.length > 120) {
    throw new Error('Bank Name must be between 2 and 120 characters.');
  }
  if (branchName.length > 120) {
    throw new Error('Branch Name cannot exceed 120 characters.');
  }

  return {
    accountHolderName: accountHolderName.slice(0, 120),
    accountNumber,
    ifscCode,
    bankName: bankName.slice(0, 120),
    ...(branchName ? { branchName: branchName.slice(0, 120) } : {}),
  };
}

export async function saveSellerBankAccount(
  seller: SellerProfile,
  input: SellerBankAccountInput
): Promise<SellerBankAccount> {
  const validated = validateSellerBankAccountInput(input);
  const path = `sellerBankAccounts/${seller.uid}`;
  const bankRef = doc(db, 'sellerBankAccounts', seller.uid);

  const prepRes = await fetch('/api/bank-accounts/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sellerId: seller.uid,
      accountHolderName: validated.accountHolderName,
      accountNumber: validated.accountNumber,
      confirmAccountNumber: validated.accountNumber,
      ifscCode: validated.ifscCode,
      bankName: validated.bankName,
      branchName: validated.branchName || '',
    }),
  });
  const prepData = (await prepRes.json().catch(() => ({}))) as {
    error?: string;
    accountHolderName?: string;
    maskedAccountNumber?: string;
    accountLast4?: string;
    accountNumberHash?: string;
    encryptedVaultToken?: string;
    ifscCode?: string;
    bankName?: string;
    branchName?: string;
    provider?: PayoutProviderCode;
  };

  if (!prepRes.ok || !prepData.maskedAccountNumber || !prepData.accountLast4) {
    throw new Error(prepData.error || 'Failed to tokenize bank account details securely on server.');
  }

  try {
    const existingSnap = await getDoc(bankRef);
    if (existingSnap.exists()) {
      const updatePayload: Record<string, unknown> = {
        sellerStoreName: seller.storeName.slice(0, 100),
        accountHolderName: prepData.accountHolderName || validated.accountHolderName,
        maskedAccountNumber: prepData.maskedAccountNumber,
        accountLast4: prepData.accountLast4,
        ifscCode: prepData.ifscCode || validated.ifscCode,
        bankName: prepData.bankName || validated.bankName,
        branchName: prepData.branchName || '',
        provider: prepData.provider || 'manual',
        verificationStatus: 'Pending_Verification' as BankVerificationStatus,
        isVerified: false,
        verificationNote: 'Bank details updated by seller — Owner re-verification required.',
        updatedAt: serverTimestamp(),
      };
      if (prepData.accountNumberHash) updatePayload.accountNumberHash = prepData.accountNumberHash;
      if (prepData.encryptedVaultToken) updatePayload.encryptedVaultToken = prepData.encryptedVaultToken;

      await updateDoc(bankRef, updatePayload);
      return {
        ...(existingSnap.data() as SellerBankAccount),
        ...(updatePayload as Partial<SellerBankAccount>),
      };
    }

    const createPayload: Record<string, unknown> = {
      id: seller.uid,
      sellerId: seller.uid,
      sellerStoreName: seller.storeName.slice(0, 100),
      accountHolderName: prepData.accountHolderName || validated.accountHolderName,
      maskedAccountNumber: prepData.maskedAccountNumber,
      accountLast4: prepData.accountLast4,
      ...(prepData.accountNumberHash ? { accountNumberHash: prepData.accountNumberHash } : {}),
      ...(prepData.encryptedVaultToken ? { encryptedVaultToken: prepData.encryptedVaultToken } : {}),
      ifscCode: prepData.ifscCode || validated.ifscCode,
      bankName: prepData.bankName || validated.bankName,
      ...(prepData.branchName ? { branchName: prepData.branchName } : {}),
      provider: prepData.provider || 'manual',
      verificationStatus: 'Pending_Verification' as BankVerificationStatus,
      isVerified: false,
      verificationNote: 'Submitted — awaiting Owner verification.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(bankRef, createPayload);
    return createPayload as unknown as SellerBankAccount;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function verifySellerBankAccount(params: {
  bankAccount: SellerBankAccount;
  decision: 'Verified' | 'Rejected';
  verificationNote?: string;
  beneficiaryId?: string;
}): Promise<void> {
  const { bankAccount, decision, verificationNote, beneficiaryId } = params;
  const path = `sellerBankAccounts/${bankAccount.sellerId}`;
  const cleanNote = verificationNote?.trim() || '';
  if (decision === 'Rejected' && !cleanNote) {
    throw new Error('Please provide a clear reason when rejecting seller bank details.');
  }

  try {
    const patch: Record<string, unknown> = {
      verificationStatus: decision,
      isVerified: decision === 'Verified',
      verifiedBy: (auth.currentUser?.email || OWNER_ADMIN_EMAIL).slice(0, 128),
      verifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanNote) {
      patch.verificationNote = cleanNote.slice(0, 300);
    } else if (decision === 'Verified') {
      patch.verificationNote = 'Verified by TISAHARA Owner Admin.';
    }
    if (beneficiaryId && beneficiaryId.trim()) {
      patch.beneficiaryId = beneficiaryId.trim().slice(0, 128);
    }

    await updateDoc(doc(db, 'sellerBankAccounts', bankAccount.sellerId), patch);

    await createNotification({
      userId: bankAccount.sellerId,
      title: `Bank Account ${decision}`,
      message:
        decision === 'Verified'
          ? `Your bank account (${bankAccount.maskedAccountNumber} · ${bankAccount.ifscCode}) is verified. You can now request seller payouts.`
          : `Your bank account (${bankAccount.maskedAccountNumber}) verification was rejected: ${cleanNote}. Please update and resubmit.`,
      type: 'seller',
      relatedId: bankAccount.sellerId,
    }).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncSellerEarningsRecord(
  seller: SellerProfile,
  summary: SellerFinancialSummary
): Promise<void> {
  const path = `sellerEarnings/${seller.uid}`;
  try {
    const payload: SellerEarningsRecord = {
      sellerId: seller.uid,
      sellerStoreName: seller.storeName.slice(0, 100),
      totalEarnings: Math.max(0, Number(summary.totalEarnings ?? summary.totalSales - summary.totalTisaharaFees)),
      pendingEarnings: Math.max(0, Number(summary.pendingEarnings ?? 0)),
      returnPeriodHold: Math.max(
        0,
        Number(summary.returnPeriodHold ?? summary.heldReturnWindowAmount + summary.heldDisputeAmount)
      ),
      availableForPayout: Math.max(0, Number(summary.availableBalance || 0)),
      totalTisaharaFees: Math.max(0, Number(summary.totalTisaharaFees || 0)),
      totalPaid: Math.max(0, Number(summary.paidOutTotal || 0)),
      pendingPayoutRequestTotal: Math.max(0, Number(summary.pendingPayoutRequestTotal || 0)),
      eligibleOrderIds: summary.eligibleOrderIds.slice(0, 200),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'sellerEarnings', seller.uid), payload);
  } catch {
    // Non-blocking sync; UI reads authoritative summary
  }
}

export async function executeOwnerProviderPayout(params: {
  payout: PayoutRecord;
  bankAccount: SellerBankAccount;
}): Promise<{
  paymentProvider: string;
  paymentReference: string;
  status: PayoutStatus;
  beneficiaryId?: string;
}> {
  const res = await fetch('/api/owner/payout-provider/execute', {
    method: 'POST',
    credentials: 'include',
    headers: ownerAuthHeaders(),
    body: JSON.stringify({
      payoutId: params.payout.id,
      amount: params.payout.netPayableAmount,
      encryptedVaultToken: params.bankAccount.encryptedVaultToken || '',
      beneficiaryId: params.bankAccount.beneficiaryId || params.payout.beneficiaryId || '',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    paymentProvider?: string;
    paymentReference?: string;
    status?: PayoutStatus;
    beneficiaryId?: string;
  };
  if (!res.ok || !data.paymentReference) {
    throw new Error(data.error || 'Unable to execute automatic payout via payment provider.');
  }
  return {
    paymentProvider: data.paymentProvider || 'manual',
    paymentReference: data.paymentReference,
    status: data.status || 'Processing',
    beneficiaryId: data.beneficiaryId,
  };
}

export async function requestSellerPayout(params: {
  seller: SellerProfile;
  summary: SellerFinancialSummary;
  bankAccount: SellerBankAccount | null;
  existingPayouts?: PayoutRecord[];
  minPayoutAmount?: number;
  upiId?: string;
  bankDetails?: string;
}): Promise<PayoutRecord> {
  const {
    seller,
    summary,
    bankAccount,
    existingPayouts = [],
    minPayoutAmount = DEFAULT_MIN_PAYOUT_AMOUNT,
    upiId,
  } = params;

  if (!bankAccount || !bankAccount.isVerified || bankAccount.verificationStatus !== 'Verified') {
    throw new Error(
      'A verified Bank Account is required before requesting a payout. Please submit your bank details and wait for Owner verification.'
    );
  }

  const effectiveMin = Math.max(10, Number(minPayoutAmount || DEFAULT_MIN_PAYOUT_AMOUNT));
  if (summary.availableBalance <= 0 || summary.eligibleOrderIds.length === 0) {
    throw new Error('No cleared balance is currently eligible for payout.');
  }
  if (summary.availableBalance < effectiveMin) {
    throw new Error(
      `Minimum payout amount is ₹${effectiveMin.toLocaleString('en-IN')}. Your available cleared balance is ₹${summary.availableBalance.toLocaleString('en-IN')}.`
    );
  }

  const openRequests = existingPayouts.filter(
    (p) => p.sellerId === seller.uid && OPEN_PAYOUT_STATUS_SET.has(p.status)
  );
  if (openRequests.length > 0) {
    throw new Error(
      `You already have an active payout request (${openRequests[0].id} · ${openRequests[0].status}). Duplicate payout requests are blocked until it is resolved.`
    );
  }

  const lockedOrderIds = new Set<string>();
  for (const p of openRequests) {
    for (const oid of p.orderIds) lockedOrderIds.add(oid);
  }
  const orderIds = summary.eligibleOrderIds.filter((oid) => !lockedOrderIds.has(oid)).slice(0, 200);
  if (orderIds.length === 0) {
    throw new Error('All eligible orders are already attached to an existing payout request.');
  }

  const payoutId = generateId('pay');
  const txId = generateId('ptx');

  const payload: Record<string, unknown> = {
    id: payoutId,
    sellerId: seller.uid,
    sellerName: seller.ownerName.slice(0, 120),
    sellerStoreName: seller.storeName.slice(0, 100),
    orderIds,
    grossAmount: summary.grossForAvailableOrders,
    eligibleEarnings: summary.availableBalance,
    tisaharaFeeTotal: summary.feesForAvailableOrders,
    requestedAmount: summary.availableBalance,
    netPayableAmount: summary.availableBalance,
    maskedAccountNumber: bankAccount.maskedAccountNumber,
    ifscCode: bankAccount.ifscCode,
    bankName: bankAccount.bankName,
    accountHolderName: bankAccount.accountHolderName,
    ...(bankAccount.branchName ? { branchName: bankAccount.branchName } : {}),
    ...(bankAccount.beneficiaryId ? { beneficiaryId: bankAccount.beneficiaryId } : {}),
    paymentProvider: bankAccount.provider || 'manual',
    ...(upiId && upiId.trim() ? { upiId: upiId.trim().slice(0, 100) } : {}),
    bankDetails: `${bankAccount.bankName} · ${bankAccount.maskedAccountNumber} · ${bankAccount.ifscCode}`.slice(0, 240),
    status: 'Pending',
    requestedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'payoutRequests', payoutId), payload);
    batch.set(doc(db, 'payouts', payoutId), payload);
    batch.set(doc(db, 'payoutTransactions', txId), {
      id: txId,
      payoutId,
      sellerId: seller.uid,
      sellerStoreName: seller.storeName.slice(0, 100),
      status: 'Pending',
      amount: summary.availableBalance,
      tisaharaFeeTotal: summary.feesForAvailableOrders,
      maskedAccountNumber: bankAccount.maskedAccountNumber,
      ifscCode: bankAccount.ifscCode,
      paymentProvider: bankAccount.provider || 'manual',
      note: 'Seller payout request submitted.',
      actorUid: seller.uid,
      actorRole: 'seller',
      createdAt: serverTimestamp(),
    });
    for (const ordId of orderIds) {
      batch.update(doc(db, 'orders', ordId), {
        payoutStatus: 'Payout_Requested',
        payoutId,
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(doc(db, 'sellerEarnings', seller.uid), {
      sellerId: seller.uid,
      sellerStoreName: seller.storeName.slice(0, 100),
      totalEarnings: Math.max(0, Number(summary.totalEarnings ?? 0)),
      pendingEarnings: Math.max(0, Number(summary.pendingEarnings ?? 0)),
      returnPeriodHold: Math.max(
        0,
        Number(summary.returnPeriodHold ?? summary.heldReturnWindowAmount + summary.heldDisputeAmount)
      ),
      availableForPayout: 0,
      totalTisaharaFees: Math.max(0, Number(summary.totalTisaharaFees || 0)),
      totalPaid: Math.max(0, Number(summary.paidOutTotal || 0)),
      pendingPayoutRequestTotal: Math.max(
        0,
        Number(summary.pendingPayoutRequestTotal || 0) + summary.availableBalance
      ),
      eligibleOrderIds: [],
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return payload as unknown as PayoutRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payoutRequests/${payoutId}`);
  }
}

export async function processSellerPayout(params: {
  payout: PayoutRecord;
  decision: PayoutStatus;
  transactionRef?: string;
  adminNote?: string;
  paymentProvider?: string;
}): Promise<void> {
  const { payout, decision, transactionRef, adminNote, paymentProvider } = params;
  if (payout.status === 'Paid') {
    throw new Error('Completed payouts are immutable and cannot be modified.');
  }
  const cleanRef = transactionRef?.trim() || '';
  if (decision === 'Paid' && !cleanRef) {
    throw new Error(
      'Real transaction confirmation reference (UTR / Bank Txn ID) is required before marking a payout Paid.'
    );
  }
  const payoutReqRef = doc(db, 'payoutRequests', payout.id);
  const payoutLegacyRef = doc(db, 'payouts', payout.id);
  const txId = generateId('ptx');
  const releasesOrders = decision === 'Rejected' || decision === 'Failed';

  try {
    const existingLedgerRefs =
      decision === 'Paid'
        ? await Promise.all(
            payout.orderIds.map(async (ordId) => {
              const [cSnap, fSnap] = await Promise.all([
                getDoc(doc(db, 'commissions', ordId)).catch(() => null),
                getDoc(doc(db, 'platformFees', ordId)).catch(() => null),
              ]);
              return {
                ordId,
                hasComm: Boolean(cSnap && cSnap.exists()),
                hasFee: Boolean(fSnap && fSnap.exists()),
              };
            })
          )
        : [];

    const baseSafeRecord: Record<string, unknown> = {
      id: payout.id,
      sellerId: payout.sellerId,
      ...(payout.sellerName ? { sellerName: payout.sellerName } : {}),
      sellerStoreName: payout.sellerStoreName,
      orderIds: payout.orderIds,
      grossAmount: payout.grossAmount,
      ...(payout.eligibleEarnings !== undefined ? { eligibleEarnings: payout.eligibleEarnings } : {}),
      tisaharaFeeTotal: payout.tisaharaFeeTotal,
      ...(payout.requestedAmount !== undefined ? { requestedAmount: payout.requestedAmount } : {}),
      netPayableAmount: payout.netPayableAmount,
      ...(payout.upiId ? { upiId: payout.upiId } : {}),
      ...(payout.bankDetails ? { bankDetails: payout.bankDetails } : {}),
      ...(payout.maskedAccountNumber ? { maskedAccountNumber: payout.maskedAccountNumber } : {}),
      ...(payout.ifscCode ? { ifscCode: payout.ifscCode } : {}),
      ...(payout.bankName ? { bankName: payout.bankName } : {}),
      ...(payout.accountHolderName ? { accountHolderName: payout.accountHolderName } : {}),
      ...(payout.branchName ? { branchName: payout.branchName } : {}),
      ...(payout.beneficiaryId ? { beneficiaryId: payout.beneficiaryId } : {}),
      paymentProvider: paymentProvider || payout.paymentProvider || 'manual',
      status: decision,
      ...(cleanRef
        ? { transactionRef: cleanRef.slice(0, 128), paymentReference: cleanRef.slice(0, 128) }
        : {}),
      ...(adminNote && adminNote.trim() ? { adminNote: adminNote.trim().slice(0, 300) } : {}),
      ...(decision === 'Paid' || releasesOrders ? { processedAt: serverTimestamp() } : {}),
      createdAt: payout.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    batch.set(payoutReqRef, baseSafeRecord, { merge: true });
    batch.set(payoutLegacyRef, baseSafeRecord, { merge: true });
    batch.set(doc(db, 'payoutTransactions', txId), {
      id: txId,
      payoutId: payout.id,
      sellerId: payout.sellerId,
      sellerStoreName: payout.sellerStoreName.slice(0, 100),
      status: decision,
      amount: payout.netPayableAmount,
      tisaharaFeeTotal: payout.tisaharaFeeTotal,
      ...(payout.maskedAccountNumber ? { maskedAccountNumber: payout.maskedAccountNumber } : {}),
      ...(payout.ifscCode ? { ifscCode: payout.ifscCode } : {}),
      paymentProvider: paymentProvider || payout.paymentProvider || 'manual',
      ...(cleanRef ? { paymentReference: cleanRef.slice(0, 128) } : {}),
      ...(adminNote && adminNote.trim() ? { note: adminNote.trim().slice(0, 300) } : {}),
      actorUid: (auth.currentUser?.uid || OWNER_ADMIN_UID).slice(0, 128),
      actorRole: 'admin',
      createdAt: serverTimestamp(),
    });

    for (const ordId of payout.orderIds) {
      batch.update(doc(db, 'orders', ordId), {
        payoutStatus:
          decision === 'Paid'
            ? 'Paid'
            : releasesOrders
            ? 'Eligible'
            : 'Payout_Requested',
        ...(releasesOrders ? { payoutId: '' } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    for (const entry of existingLedgerRefs) {
      if (entry.hasComm) {
        batch.update(doc(db, 'commissions', entry.ordId), {
          status: 'Settled',
          updatedAt: serverTimestamp(),
        });
      }
      if (entry.hasFee) {
        batch.update(doc(db, 'platformFees', entry.ordId), {
          status: 'Settled',
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();

    await createNotification({
      userId: payout.sellerId,
      title: `Payout Status: ${decision}`,
      message:
        decision === 'Paid'
          ? `Payout ${payout.id} of ₹${payout.netPayableAmount} marked Paid (Ref: ${cleanRef}).`
          : releasesOrders
          ? `Payout ${payout.id} marked ${decision}${adminNote ? `: ${adminNote}` : ''}. Eligible orders returned to Available Balance.`
          : `Payout ${payout.id} status updated to ${decision}${adminNote ? `: ${adminNote}` : ''}.`,
      type: 'seller',
      relatedId: payout.id,
    }).catch(() => undefined);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('UTR') || error.message.includes('immutable'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `payoutRequests/${payout.id}`);
  }
}

export async function saveSupplier(
  input: Omit<SupplierRecord, 'id' | 'createdAt' | 'updatedAt'>,
  existing?: SupplierRecord
): Promise<SupplierRecord> {
  const id = existing?.id || generateId('sup');
  const payload: Record<string, unknown> = {
    id,
    name: input.name.trim().slice(0, 120),
    ...(input.contactPerson ? { contactPerson: input.contactPerson.trim().slice(0, 100) } : {}),
    ...(input.phone ? { phone: input.phone.trim().slice(0, 20) } : {}),
    ...(input.email ? { email: input.email.trim().slice(0, 160) } : {}),
    ...(input.city ? { city: input.city.trim().slice(0, 80) } : {}),
    integrationMode: input.integrationMode,
    ...(input.notes ? { notes: input.notes.trim().slice(0, 500) } : {}),
    isActive: input.isActive,
    updatedAt: serverTimestamp(),
  };
  try {
    if (existing) {
      await updateDoc(doc(db, 'suppliers', id), payload);
    } else {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'suppliers', id), payload);
    }
    return payload as unknown as SupplierRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `suppliers/${id}`);
  }
}

export async function deleteSupplier(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'suppliers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
  }
}

export async function saveSupplierProduct(
  input: Omit<SupplierProductRecord, 'id' | 'createdAt' | 'updatedAt'>,
  existing?: SupplierProductRecord
): Promise<SupplierProductRecord> {
  const id = existing?.id || generateId('sprod');
  const payload: Record<string, unknown> = {
    id,
    supplierId: input.supplierId,
    supplierName: input.supplierName.trim().slice(0, 120),
    sku: input.sku.trim().slice(0, 80),
    title: input.title.trim().slice(0, 140),
    costPrice: Math.max(0, Math.round(Number(input.costPrice))),
    stock: Math.max(0, Math.floor(Number(input.stock))),
    ...(input.connectedOwnerProductId ? { connectedOwnerProductId: input.connectedOwnerProductId.trim() } : {}),
    ...(input.notes ? { notes: input.notes.trim().slice(0, 400) } : {}),
    isActive: input.isActive,
    updatedAt: serverTimestamp(),
  };
  try {
    if (existing) {
      await updateDoc(doc(db, 'supplierProducts', id), payload);
    } else {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'supplierProducts', id), payload);
    }
    return payload as unknown as SupplierProductRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `supplierProducts/${id}`);
  }
}

export async function deleteSupplierProduct(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'supplierProducts', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `supplierProducts/${id}`);
  }
}

export async function linkSupplierProductToOwnerProduct(
  supplierProduct: SupplierProductRecord,
  ownerProductId: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'supplierProducts', supplierProduct.id), {
      connectedOwnerProductId: ownerProductId,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'products', ownerProductId), {
      supplierId: supplierProduct.supplierId,
      supplierName: supplierProduct.supplierName,
      supplierSku: supplierProduct.sku,
      supplierProductId: supplierProduct.id,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `supplierProducts/${supplierProduct.id}`);
  }
}

export async function createNotification(input: {
  userId: string;
  title: string;
  message: string;
  type: AppNotification['type'];
  relatedId?: string;
}): Promise<void> {
  const id = generateId('notif');
  const path = `notifications/${id}`;
  try {
    const payload: Record<string, unknown> = {
      userId: input.userId,
      title: input.title.slice(0, 140),
      message: input.message.slice(0, 500),
      type: input.type,
      isRead: false,
      createdAt: serverTimestamp(),
    };
    if (input.relatedId) {
      payload.relatedId = input.relatedId.slice(0, 128);
    }
    await setDoc(doc(db, 'notifications', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function lookupReferrerByCode(
  code: string
): Promise<{ userId: string; code: string } | null> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (clean.length < 4 || clean.length > 32) return null;
  try {
    const snap = await getDoc(doc(db, 'referralCodes', clean));
    if (!snap.exists()) return null;
    const data = snap.data() as { userId?: string; code?: string };
    if (!data.userId || !data.code) return null;
    return { userId: data.userId, code: data.code };
  } catch {
    return null;
  }
}

export async function recordReferralRedemption(
  referredUser: UserProfile,
  referrerUserId: string,
  referrerCode: string
): Promise<void> {
  const id = `${referrerUserId}_${referredUser.uid}`;
  const path = `referrals/${id}`;
  try {
    await setDoc(doc(db, 'referrals', id), {
      referrerUserId,
      referrerCode,
      referredUserId: referredUser.uid,
      referredUserName: referredUser.name.slice(0, 120),
      rewardAmount: 50,
      status: 'Credited',
      createdAt: serverTimestamp(),
    });
    await updateUserProfile(referredUser.uid, {
      referredBy: referrerCode,
      rewardPoints: (referredUser.rewardPoints || 0) + 50,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserReferrals(uid: string): Promise<ReferralRecord[]> {
  const path = `referrals?userId=${uid}`;
  try {
    const q = query(collection(db, 'referrals'), where('referrerUserId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReferralRecord, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveAddressToProfile(
  user: UserProfile,
  address: Omit<SavedAddress, 'id'> & { id?: string }
): Promise<SavedAddress[]> {
  const existing = user.addresses || [];
  const addrId = address.id || generateId('addr');
  const nextEntry: SavedAddress = { ...address, id: addrId };

  let nextList = address.id
    ? existing.map((a) => (a.id === addrId ? nextEntry : a))
    : [...existing, nextEntry];

  if (nextEntry.isDefault || nextList.length === 1) {
    nextList = nextList.map((a) => ({ ...a, isDefault: a.id === addrId }));
  }

  await updateUserProfile(user.uid, { addresses: nextList });

  // Also sync normalized addresses collection doc when signed in
  setDoc(doc(db, 'addresses', addrId), {
    id: addrId,
    userId: user.uid,
    label: nextEntry.label.slice(0, 40),
    fullName: nextEntry.fullName.slice(0, 120),
    phone: nextEntry.phone.slice(0, 20),
    street: nextEntry.street.slice(0, 250),
    city: nextEntry.city.slice(0, 80),
    state: nextEntry.state.slice(0, 80),
    pincode: nextEntry.pincode.slice(0, 12),
    isDefault: Boolean(nextEntry.isDefault),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);

  return nextList;
}

export const SAMPLE_TESTING_PRODUCT_TAG = 'SAMPLE – FOR TESTING';

export interface SampleOwnerProductSeed {
  id: string;
  title: string;
  description: string;
  category: ProductCategory;
  basePrice: number;
  sellingPrice: number;
  mrp: number;
  stock: number;
  image: string;
  tags: string[];
}

export const SAMPLE_OWNER_PRODUCTS: readonly SampleOwnerProductSeed[] = [
  {
    id: 'sample_owner_mens_casual_tshirt',
    title: "Men's Casual T-Shirt",
    description:
      "[SAMPLE – FOR TESTING] Classic navy combed-cotton crew-neck casual t-shirt with breathable 180 GSM jersey fabric. Sample testing item in the Owner Catalogue for seller margin & dropship testing.",
    category: 'Fashion',
    basePrice: 300,
    sellingPrice: 300,
    mrp: 599,
    stock: 50,
    image: '/sample-products/mens_casual_tshirt.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'cotton', 'tshirt', 'menswear'],
  },
  {
    id: 'sample_owner_womens_kurti',
    title: "Women's Kurti",
    description:
      "[SAMPLE – FOR TESTING] Elegant lavender block-printed cotton straight kurti with subtle neckline embroidery and 3/4th sleeves. Sample testing item in the Owner Catalogue.",
    category: 'Fashion',
    basePrice: 450,
    sellingPrice: 450,
    mrp: 899,
    stock: 50,
    image: '/sample-products/womens_kurti.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'kurti', 'ethnic', 'womenswear'],
  },
  {
    id: 'sample_owner_sports_shoes',
    title: 'Sports Shoes',
    description:
      '[SAMPLE – FOR TESTING] Lightweight breathable mesh running and training sports shoes with cushioned EVA sole for everyday fitness. Sample testing item in the Owner Catalogue.',
    category: 'Footwear',
    basePrice: 600,
    sellingPrice: 600,
    mrp: 1299,
    stock: 50,
    image: '/sample-products/sports_shoes.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'shoes', 'running', 'footwear'],
  },
  {
    id: 'sample_owner_smart_watch',
    title: 'Smart Watch',
    description:
      '[SAMPLE – FOR TESTING] Sleek rectangular AMOLED fitness smart watch with step counter, heart-rate monitor, notifications, and matte silicone strap. Sample testing item in the Owner Catalogue.',
    category: 'Electronics',
    basePrice: 800,
    sellingPrice: 800,
    mrp: 1699,
    stock: 50,
    image: '/sample-products/smart_watch.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'smartwatch', 'fitness', 'electronics'],
  },
  {
    id: 'sample_owner_wireless_earbuds',
    title: 'Wireless Earbuds',
    description:
      '[SAMPLE – FOR TESTING] Pearl-white True Wireless Bluetooth earbuds with pocket charging case, clear mic calls, and stereo audio. Sample testing item in the Owner Catalogue.',
    category: 'Electronics',
    basePrice: 500,
    sellingPrice: 500,
    mrp: 1199,
    stock: 50,
    image: '/sample-products/wireless_earbuds.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'earbuds', 'bluetooth', 'audio'],
  },
  {
    id: 'sample_owner_ladies_handbag',
    title: 'Ladies Handbag',
    description:
      "[SAMPLE – FOR TESTING] Structured tan faux-leather ladies tote shoulder handbag with twin top handles and detachable sling strap. Sample testing item in the Owner Catalogue.",
    category: 'Accessories',
    basePrice: 400,
    sellingPrice: 400,
    mrp: 999,
    stock: 50,
    image: '/sample-products/ladies_handbag.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'handbag', 'tote', 'accessories'],
  },
  {
    id: 'sample_owner_kitchen_storage_set',
    title: 'Kitchen Storage Set',
    description:
      '[SAMPLE – FOR TESTING] Modular 6-piece airtight clear food-grade pantry storage containers with stackable white seal lids. Sample testing item in the Owner Catalogue.',
    category: 'Home & Kitchen',
    basePrice: 350,
    sellingPrice: 350,
    mrp: 799,
    stock: 50,
    image: '/sample-products/kitchen_storage_set.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'kitchen', 'storage', 'home'],
  },
  {
    id: 'sample_owner_mens_casual_shirt',
    title: "Men's Casual Shirt",
    description:
      "[SAMPLE – FOR TESTING] Sage green washed cotton full-sleeve casual button-down shirt crafted for comfort across everyday and weekend wear. Sample testing item in the Owner Catalogue.",
    category: 'Fashion',
    basePrice: 550,
    sellingPrice: 550,
    mrp: 1099,
    stock: 50,
    image: '/sample-products/mens_casual_shirt.jpg',
    tags: [SAMPLE_TESTING_PRODUCT_TAG, 'shirt', 'cotton', 'menswear'],
  },
] as const;

export function isSampleTestingProduct(
  product: Pick<Product, 'id' | 'tags' | 'description'>
): boolean {
  if (product.id.startsWith('sample_owner_')) return true;
  if (Array.isArray(product.tags) && product.tags.includes(SAMPLE_TESTING_PRODUCT_TAG)) {
    return true;
  }
  return typeof product.description === 'string' && product.description.includes(SAMPLE_TESTING_PRODUCT_TAG);
}

export async function seedSampleOwnerProducts(): Promise<{
  createdCount: number;
  skippedCount: number;
}> {
  if (!isFirebaseOwnerAdmin()) {
    throw new Error(
      `Sign in with verified Owner Admin email (${OWNER_ADMIN_EMAIL}) to save sample products to Firebase.`
    );
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const sample of SAMPLE_OWNER_PRODUCTS) {
    const productRef = doc(db, 'products', sample.id);
    const ownerProductRef = doc(db, 'ownerProducts', sample.id);
    try {
      const existingSnap = await getDoc(productRef);
      if (existingSnap.exists()) {
        skippedCount += 1;
        const ownerMirrorSnap = await getDoc(ownerProductRef).catch(() => null);
        if (ownerMirrorSnap && !ownerMirrorSnap.exists()) {
          await setDoc(ownerProductRef, existingSnap.data()).catch(() => undefined);
        }
        continue;
      }

      const payload: Record<string, unknown> = {
        id: sample.id,
        sellerId: 'tisahara_owner',
        storeId: 'tisahara_owner',
        sellerStoreName: 'TISAHARA Central',
        ownershipType: 'OWNER',
        title: sample.title,
        description: sample.description,
        category: sample.category,
        basePrice: sample.basePrice,
        sellingPrice: sample.sellingPrice,
        mrp: sample.mrp,
        sellerMargin: 0,
        stock: sample.stock,
        images: [sample.image],
        tags: sample.tags,
        ratingAvg: 0,
        ratingCount: 0,
        isActive: true,
        availableForSellers: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(productRef, payload);
      await setDoc(ownerProductRef, payload).catch(() => undefined);
      createdCount += 1;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${sample.id}`);
    }
  }

  return { createdCount, skippedCount };
}

