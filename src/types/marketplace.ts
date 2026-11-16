export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Home & Kitchen',
  'Beauty',
  'Footwear',
  'Fashion',
  'Accessories',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductOwnershipType = 'OWNER' | 'SELLER_OWNED';
export type OrderType = 'DIRECT_OWNER' | 'SELLER_OWN_PRODUCT' | 'SELLER_DROPSHIP';
export type StoreStatus = 'Active' | 'Suspended' | 'Closed';

export type OrderStatus = 'Pending' | 'Confirmed' | 'Shipped' | 'Delivered' | 'Cancelled';
export type PaymentMethod = 'COD' | 'ONLINE_PENDING';
export type PaymentStatus = 'Pending' | 'Paid' | 'Refunded';
export type ReturnStatus = 'None' | 'Requested' | 'Approved' | 'Rejected' | 'Refunded';
export type PayoutLifecycleStatus =
  | 'Pending'
  | 'In_Return_Window'
  | 'Held_Return'
  | 'Eligible'
  | 'Payout_Requested'
  | 'Paid'
  | 'Forfeited_Cancelled'
  | 'Forfeited_Refunded';
export type UserRole = 'customer' | 'seller' | 'admin';
export type AppLanguage = 'en' | 'hi';

export interface SavedAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  photoURL?: string;
  referralCode: string;
  referredBy?: string;
  rewardPoints: number;
  preferredLanguage?: AppLanguage;
  upiId?: string;
  addresses?: SavedAddress[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SellerProfile {
  uid: string;
  storeName: string;
  storeSlug: string;
  ownerName: string;
  city: string;
  state: string;
  description?: string;
  isVerified: boolean;
  isActive?: boolean;
  storeStatus?: StoreStatus;
  closedAt?: string;
  totalSales: number;
  totalEarnings: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  sellerId: string;
  storeId?: string;
  sellerStoreName: string;
  ownershipType?: ProductOwnershipType;
  title: string;
  description: string;
  category: ProductCategory;
  basePrice: number;
  sellingPrice: number;
  mrp: number;
  sellerMargin: number;
  maxSellerMargin?: number;
  stock: number;
  images: string[];
  tags?: string[];
  ratingAvg: number;
  ratingCount: number;
  isActive: boolean;
  availableForSellers?: boolean;
  supplierId?: string;
  supplierName?: string;
  supplierSku?: string;
  supplierProductId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoreProduct {
  id: string;
  sellerId: string;
  storeId?: string;
  sellerStoreName: string;
  productId: string;
  basePrice: number;
  sellingPrice: number;
  sellerMargin: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  storeProductId?: string;
  sellerId: string;
  sellerStoreName: string;
  ownershipType?: ProductOwnershipType;
  title: string;
  image: string;
  category: ProductCategory;
  basePrice: number;
  sellingPrice: number;
  mrp: number;
  sellerMargin: number;
  quantity: number;
  maxStock: number;
}

export interface OrderItem {
  productId: string;
  title: string;
  image: string;
  quantity: number;
  basePrice: number;
  sellingPrice: number;
  sellerMargin: number;
}

export interface MarketplaceOrder {
  id: string;
  checkoutGroupId: string;
  customerId: string;
  guestSessionId?: string;
  sellerId: string;
  storeId?: string;
  sellerStoreName: string;
  ownershipType?: ProductOwnershipType;
  orderType?: OrderType;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  totalSellerMargin: number;
  tisaharaFee?: number;
  sellerPayableAmount?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  returnStatus?: ReturnStatus;
  payoutStatus?: PayoutLifecycleStatus;
  payoutId?: string;
  deliveredAt?: unknown;
  deliveredAtMs?: number;
  returnDeadline?: string;
  returnDeadlineMs?: number;
  shippingAddress: ShippingAddress;
  courierPartner?: string;
  trackingNumber?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  customerId: string;
  sellerId: string;
  storeId?: string;
  orderType?: OrderType;
  reason: string;
  comments?: string;
  amount: number;
  status: Exclude<ReturnStatus, 'None'>;
  adminNote?: string;
  resolvedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  returnId?: string;
  customerId: string;
  sellerId: string;
  amount: number;
  method: string;
  status: 'Pending' | 'Processed' | 'Failed';
  note?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PayoutStatus =
  | 'Pending'
  | 'Requested'
  | 'Under Review'
  | 'Approved'
  | 'Processing'
  | 'Paid'
  | 'Failed'
  | 'On Hold'
  | 'Rejected';

export type BankVerificationStatus = 'Pending_Verification' | 'Verified' | 'Rejected';

export type PayoutProviderCode = 'manual' | 'razorpayx' | 'cashfree';

export interface SellerBankAccount {
  id: string;
  sellerId: string;
  sellerStoreName: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  accountLast4: string;
  accountNumberHash?: string;
  encryptedVaultToken?: string;
  ifscCode: string;
  bankName: string;
  branchName?: string;
  provider?: PayoutProviderCode;
  beneficiaryId?: string;
  verificationStatus: BankVerificationStatus;
  isVerified: boolean;
  verificationNote?: string;
  verifiedBy?: string;
  verifiedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PayoutRecord {
  id: string;
  sellerId: string;
  sellerName?: string;
  sellerStoreName: string;
  orderIds: string[];
  grossAmount: number;
  eligibleEarnings?: number;
  tisaharaFeeTotal: number;
  requestedAmount?: number;
  netPayableAmount: number;
  upiId?: string;
  bankDetails?: string;
  maskedAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  accountHolderName?: string;
  branchName?: string;
  beneficiaryId?: string;
  paymentProvider?: string;
  paymentReference?: string;
  status: PayoutStatus;
  transactionRef?: string;
  adminNote?: string;
  requestedAt?: unknown;
  processedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PayoutTransactionRecord {
  id: string;
  payoutId: string;
  sellerId: string;
  sellerStoreName?: string;
  status: PayoutStatus;
  amount: number;
  tisaharaFeeTotal?: number;
  maskedAccountNumber?: string;
  ifscCode?: string;
  paymentProvider?: string;
  paymentReference?: string;
  note?: string;
  actorUid: string;
  actorRole: 'seller' | 'admin' | 'provider';
  createdAt?: unknown;
}

export interface SellerEarningsRecord {
  sellerId: string;
  sellerStoreName?: string;
  totalEarnings: number;
  pendingEarnings: number;
  returnPeriodHold: number;
  availableForPayout: number;
  totalTisaharaFees: number;
  totalPaid: number;
  pendingPayoutRequestTotal?: number;
  eligibleOrderIds?: string[];
  updatedAt?: unknown;
}

export interface PayoutProviderStatus {
  provider: PayoutProviderCode;
  connected: boolean;
  label: string;
  supportsAutoPayout: boolean;
  supportsBeneficiaryVerification: boolean;
}

export interface CommissionRecord {
  id: string;
  orderId: string;
  sellerId: string;
  storeId?: string;
  orderType: OrderType;
  feeAmount: number;
  orderSubtotal: number;
  sellerMargin: number;
  sellerPayableAmount: number;
  status:
    | 'Pending_Delivery'
    | 'In_Return_Window'
    | 'Settled'
    | 'Voided_Cancelled'
    | 'Voided_Refunded';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupplierRecord {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  integrationMode: 'Manual' | 'DeoDap_API_Ready';
  notes?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupplierProductRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  sku: string;
  title: string;
  costPrice: number;
  stock: number;
  connectedOwnerProductId?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SellerFinancialSummary {
  sellerId: string;
  totalSales: number;
  ownProductGross: number;
  dropshipMarginGross: number;
  totalTisaharaFees: number;
  heldReturnWindowAmount: number;
  heldDisputeAmount: number;
  availableBalance: number;
  grossForAvailableOrders: number;
  feesForAvailableOrders: number;
  eligibleOrderIds: string[];
  paidOutTotal: number;
  pendingPayoutRequestTotal: number;
  totalEarnings?: number;
  pendingEarnings?: number;
  returnPeriodHold?: number;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: unknown;
}

export interface WishlistEntry {
  id: string;
  userId: string;
  productId: string;
  createdAt?: unknown;
}

export interface ReferralRecord {
  id: string;
  referrerUserId: string;
  referrerCode: string;
  referredUserId: string;
  referredUserName: string;
  rewardAmount: number;
  status: 'Pending' | 'Credited';
  createdAt?: unknown;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'order' | 'seller' | 'referral' | 'system';
  relatedId?: string;
  isRead: boolean;
  createdAt?: unknown;
}

export interface MarketplaceSettings {
  id: string;
  acceptingOrders: boolean;
  pauseMessage?: string;
  minPayoutAmount?: number;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface OwnerSessionStatus {
  authenticated: boolean;
  configured: boolean;
  authSource: 'env' | 'hash' | 'none';
  expiresAt?: number | null;
  retryAfterSeconds?: number;
  firebaseAdminConfigured?: boolean;
  ownerAdminEmail?: string;
  customToken?: string | null;
}

export type AppView =
  | 'home'
  | 'product'
  | 'store'
  | 'orders'
  | 'profile'
  | 'wishlist'
  | 'seller'
  | 'owner';
