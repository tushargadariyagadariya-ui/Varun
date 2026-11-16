# TISAHARA — Indian Multi-Vendor Marketplace

TISAHARA is a full-stack Indian multi-vendor and dropshipping marketplace built with React, TypeScript, Tailwind CSS, Express (`server.ts`), and Firebase (Authentication, Cloud Firestore, and Cloud Storage).

---

## Core Marketplace Architecture

### 1. Customer Shopping App
- **Public Catalog Browsing**: Shoppers can browse products, filter by category/offers/stock, sort results, and inspect product or store pages without logging in.
- **Cart & Multi-Device Sync**: Cart state persists in `localStorage` for guests and automatically hydrates/syncs to `carts/{uid}` in Firestore for signed-in users.
- **Strict Non-Mixed Checkout Routing**: Checkout (`/api/orders/prepare` + Firestore transaction) automatically splits cart items by `${sellerId}__${orderType}` into separate orders so Type A and Type B settlements, stock decrements, and tracking stay isolated:
  - `DIRECT_OWNER`: Products bought directly from TISAHARA Owner (`₹0` platform fee).
  - `SELLER_OWN_PRODUCT`: Type A seller's own inventory (`₹10` platform fee deducted upon successful non-refunded delivery).
  - `SELLER_DROPSHIP`: Type B seller dropshipping an Owner Central Catalogue product (`₹5` platform fee deducted from seller's profit margin upon successful non-refunded delivery).
- **Payments**: Supports Cash on Delivery (COD) and a prepared Online Payment Gateway adapter flow ready for Razorpay/Cashfree merchant credentials.
- **Order Tracking & 7-Day Return Policy**: Real-time order status timeline (`Pending` → `Confirmed` → `Shipped` → `Delivered` / `Cancelled`) plus 7-day return request submission (`returns/{returnId}`).

---

### 2. Two Types of Sellers

#### Seller Type A — Own Products (`SELLER_OWNED`)
- Sellers register a storefront and manage their own inventory (`title`, description, images, base/selling price, MRP, stock, category).
- Sellers manage packing, courier tracking, and delivery updates (`Confirmed` → `Shipped` → `Delivered`) for their `SELLER_OWN_PRODUCT` orders.
- **Platform Fee**: TISAHARA deducts **₹10 per successfully delivered, non-refunded order** (`sellerPayableAmount = max(0, subtotal - 10)`).

#### Seller Type B — Owner Product Dropshipping (`OWNER` + `storeProducts`)
- Sellers browse the Owner's Central Catalogue and add items to their store with a custom profit margin (`sellingPrice = basePrice + sellerMargin`, capped at `mrp` and optional `maxSellerMargin`).
- Sellers **cannot** alter the Owner's base price, description, images, or central stock.
- Owner handles packing, shipping, and delivery for `SELLER_DROPSHIP` orders; orders appear in both the Seller Dashboard and Owner Panel (`Today's Daily Order Sheet`).
- **Platform Fee**: TISAHARA deducts **₹5 per successfully delivered, non-refunded order** from the seller's earned margin (`sellerPayableAmount = max(0, totalSellerMargin - 5)`).

---

### 3. Seven-Day Return Policy & Payout Hold Rules
- Marking an order as `Delivered` stamps `deliveredAtMs` and sets `returnDeadlineMs = deliveredAtMs + 7 days`.
- **Return Requests**: Customers can request a return within 7 days of delivery.
- **Payout Hold**: Delivered order earnings stay **Held inside the 7-day return window** or whenever an order has an **open/approved return dispute** (`returnStatus: Requested | Approved`).
- **Eligible Payout Balance**: Earnings move to **Available for Payout** only after the 7-day return window expires with no refund or open return dispute (`POST /api/payouts/calculate`).

---

### 4. Owner Admin Panel & Authentication
- Accessible inside **Account → Owner Panel** when signed in as the configured Owner admin account.
- **Single-Password Backend Verification**: Verified server-side (`server.ts`) against `OWNER_PANEL_PASSWORD` / `OWNER_PANEL_SECRET` environment variables (or hashed credentials stored in `.tisahara-owner-auth.json`), never stored or compared in frontend code.
- **Lockout Security**: 5 failed attempts trigger a 60-second server-enforced lockout with live countdown UI and automatic re-enablement at `0s`.
- **Owner Capabilities**:
  - **Overview KPIs**: Active stores, total products, orders, completion/cancellation counts, marketplace revenue, TISAHARA fees, and store breakdowns.
  - **Today's Daily Order Sheet**: Channel-filtered order fulfillment sheet with CSV export and print view (`window.print()`).
  - **Central & Seller Product Management**: Add/edit/activate/deactivate products, upload images, link supplier SKUs, inspect Seller Type A listings.
  - **Store Governance**: Verify, suspend, reactivate, or permanently close seller storefronts.
  - **Payouts & Commissions Ledger**: Review seller payout requests, record UTR transfer references, approve/reject payouts, audit ₹5/₹10 fees.
  - **7-Day Returns & Refunds Queue**: Approve pickups, issue refunds (automatically updating order `Refunded` status & commission voiding), or reject invalid claims.
  - **Suppliers & Logistics**: Manual Inventory & Shipment Mode with DeoDap-ready SKU mapping fields (`supplierId`, `supplierSku`, `supplierCost`).

---

## Local Development & Environment Setup

### Prerequisites
- Node.js 18+
- Firebase project configured in `firebase-applet-config.json`

### Environment Variables
Copy `.env.example` to `.env` if setting backend overrides locally:
- `OWNER_PANEL_PASSWORD` (recommended backend password for Owner Panel login)
- `OWNER_SESSION_SECRET` (HMAC signing secret for HTTP-only owner session cookies)
- `SESSION_COOKIE_SECURE` (`true` in HTTPS production environments)

### Commands
```bash
# Install dependencies
npm install

# Run full-stack Express + Vite development server on port 3000
npm run dev

# TypeScript check
npm run lint

# Build production bundle
npm run build

# Run production server
npm start
```

---

## PWA & Android Packaging

### Progressive Web App (PWA)
- `public/manifest.webmanifest` and `public/icon.svg` are linked in `index.html`, enabling "Install App" / "Add to Home Screen" in Chrome, Edge, and Android browsers.

### Android App Packaging Options
1. **Trusted Web Activity (TWA via Bubblewrap)**:
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest=https://<your-deployed-domain>/manifest.webmanifest
   bubblewrap build
   ```
2. **Capacitor Native Wrapper**:
   ```bash
   npm run build
   npx cap init TISAHARA com.tisahara.marketplace --web-dir=dist
   npx cap add android
   npx cap sync android
   ```
   Build and sign the release APK/AAB in Android Studio.
