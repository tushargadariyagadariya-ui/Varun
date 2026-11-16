import { AppLanguage, MarketplaceOrder, Product } from '../types/marketplace';

/**
 * 1. Multi-Language Translation Registry (Architecture-Ready for Full Localization)
 */
export const TRANSLATIONS: Record<
  AppLanguage,
  {
    navShop: string;
    navCategories: string;
    navSell: string;
    navOrders: string;
    heroTag: string;
    heroTitle: string;
    heroSubtitle: string;
    exploreCatalog: string;
    startSelling: string;
    searchPlaceholder: string;
    addToCart: string;
    buyNow: string;
    outOfStock: string;
    freeDeliveryNote: string;
  }
> = {
  en: {
    navShop: 'Shop',
    navCategories: 'Categories',
    navSell: 'Sell on TISAHARA',
    navOrders: 'Orders',
    heroTag: 'Direct from Indian Sellers',
    heroTitle: 'Curated Everyday Goods, Fair Seller Margins',
    heroSubtitle:
      'Discover fashion, electronics, handcrafted homeware, beauty, and accessories directly from independent Indian businesses with Cash on Delivery across India.',
    exploreCatalog: 'Explore Collections',
    startSelling: 'Become a Seller',
    searchPlaceholder: 'Search kurtas, earbuds, cookware, sellers...',
    addToCart: 'Add to Cart',
    buyNow: 'Buy Now',
    outOfStock: 'Out of Stock',
    freeDeliveryNote: 'Free delivery on orders above ₹499 · Cash on Delivery available',
  },
  hi: {
    navShop: 'शॉप',
    navCategories: 'श्रेणियां',
    navSell: 'TISAHARA पर बेचें',
    navOrders: 'ऑर्डर',
    heroTag: 'भारतीय विक्रेताओं से सीधे',
    heroTitle: 'चुनिंदा उत्पाद, पारदर्शी विक्रेता मुनाफा',
    heroSubtitle:
      'फैशन, इलेक्ट्रॉनिक्स, होम और किचन, ब्यूटी और एक्सेसरीज़ सीधे भारतीय विक्रेताओं से खरीदें — कैश ऑन डिलीवरी के साथ।',
    exploreCatalog: 'कलेक्शन देखें',
    startSelling: 'विक्रेता बनें',
    searchPlaceholder: 'उत्पाद, श्रेणी या स्टोर खोजें...',
    addToCart: 'कार्ट में जोड़ें',
    buyNow: 'अभी खरीदें',
    outOfStock: 'स्टॉक समाप्त',
    freeDeliveryNote: '₹499 से ऊपर मुफ्त डिलीवरी · कैश ऑन डिलीवरी उपलब्ध',
  },
};

/**
 * 2. Product Recommendation Engine (Content-based similarity on real catalog)
 */
export function getRecommendedProducts(
  target: Product,
  catalog: Product[],
  limitCount = 4
): Product[] {
  return catalog
    .filter((p) => p.id !== target.id && p.isActive && p.stock > 0)
    .map((candidate) => {
      let score = 0;
      if (candidate.category === target.category) score += 5;
      if (candidate.sellerId === target.sellerId) score += 2;
      const targetTags = new Set((target.tags || []).map((t) => t.toLowerCase()));
      (candidate.tags || []).forEach((tag) => {
        if (targetTags.has(tag.toLowerCase())) score += 2;
      });
      score += candidate.ratingAvg * 0.5;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limitCount)
    .map((entry) => entry.candidate);
}

/**
 * 3. Online Payment Gateway Adapter Architecture (Razorpay / UPI Ready)
 */
export interface PaymentGatewayIntent {
  gateway: 'RAZORPAY' | 'CASHFREE' | 'UPI_INTENT';
  amountInPaise: number;
  currency: 'INR';
  receiptId: string;
  customerPhone: string;
  customerEmail?: string;
}

export interface PaymentGatewayConfig {
  isConfigured: boolean;
  supportedMethods: ('COD' | 'UPI' | 'CARD' | 'NETBANKING')[];
  activeGatewayLabel: string;
}

export const PAYMENT_ARCHITECTURE_STATUS: PaymentGatewayConfig = {
  isConfigured: false,
  supportedMethods: ['COD'],
  activeGatewayLabel: 'Cash on Delivery (Online UPI/Card Gateway Adapter Ready)',
};

/**
 * 4. Courier & Delivery Integration Adapter
 */
export const COURIER_PARTNERS = [
  'Delhivery Surface',
  'Bluedart Express',
  'Xpressbees Air',
  'India Post Speed',
  'Shiprocket Aggregator',
] as const;

export function buildCourierTrackingUrl(partner?: string, trackingNumber?: string): string | null {
  if (!trackingNumber) return null;
  const code = encodeURIComponent(trackingNumber.trim());
  if (partner?.toLowerCase().includes('delhivery')) {
    return `https://www.delhivery.com/track/package/${code}`;
  }
  if (partner?.toLowerCase().includes('bluedart')) {
    return `https://www.bluedart.com/tracking?trackFor=0&trackNo=${code}`;
  }
  return `https://shiprocket.co/tracking/${code}`;
}

/**
 * 5. Seller Sales CSV Report Generator
 */
export function exportSellerOrdersCsv(orders: MarketplaceOrder[], storeName: string): void {
  const headers = [
    'Order ID',
    'Date',
    'Status',
    'Customer Name',
    'City',
    'Payment Method',
    'Items Count',
    'Order Total (INR)',
    'Seller Margin (INR)',
  ];
  const rows = orders.map((o) => {
    const dateStr = o.createdAt && typeof (o.createdAt as { toDate?: () => Date }).toDate === 'function'
      ? (o.createdAt as { toDate: () => Date }).toDate().toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const itemsQty = o.items.reduce((sum, item) => sum + item.quantity, 0);
    return [
      o.id,
      dateStr,
      o.status,
      `"${o.shippingAddress.fullName.replace(/"/g, '""')}"`,
      `"${o.shippingAddress.city.replace(/"/g, '""')}"`,
      o.paymentMethod,
      itemsQty,
      o.totalAmount,
      o.totalSellerMargin,
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-sales-report.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 6. Push Notification & Android Wrapper Readiness Metadata
 */
export const PLATFORM_READINESS = {
  pwaInstallable: true,
  androidPackageId: 'com.tisahara.marketplace',
  fcmPushReady: typeof window !== 'undefined' && 'Notification' in window,
};
