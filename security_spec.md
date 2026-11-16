# TISAHARA Security Specification

## 1. Data Invariants
1. **User Ownership**: Documents in `/users/{userId}`, `/carts/{userId}`, and `/addresses/{addressId}` can only be read or mutated by the owning `request.auth.uid == userId` (or verified admin). Users cannot self-escalate `role` to `'admin'`.
2. **Seller Store Integrity & Lifecycle**: `/sellers/{sellerId}` is keyed by `sellerId == request.auth.uid`. Only `isAdmin()` can suspend (`isActive: false, storeStatus: 'Suspended'`), reactivate (`isActive: true, storeStatus: 'Active'`), verify (`isVerified`), or permanently close (`isActive: false, storeStatus: 'Closed'`) a store. Suspended/closed stores cannot receive new orders (`isSellerActive(sellerId)`) or publish new products, while historical orders, returns, payouts, and commissions remain readable.
3. **Dual Product Ownership & Dropshipping Rules**:
   - **Owner Products (`ownershipType: 'OWNER'`, `sellerId: 'tisahara_owner'`)**: Managed solely by `isAdmin()` in `/products` and `/ownerProducts`.
   - **Seller Type A Own Products (`ownershipType: 'SELLER_OWNED'`, `sellerId: request.auth.uid`)**: Created, edited, and deleted only by their owning active seller (`sellerId == request.auth.uid`) or `isAdmin()`.
   - **Seller Type B Dropship Listings (`/storeProducts/{sellerId}_{productId}` & `/sellerStoreProducts/...`)**: Reference an active Owner central product with `basePrice` locked to the Owner's `basePrice` and `sellerMargin == sellingPrice - basePrice`. Sellers cannot alter the Owner's product description, images, base price, or master stock.
4. **Strict Order Routing & Anti-Mixing Fee Invariants**:
   - Every `/orders/{orderId}` belongs to exactly one `orderType`:
     - `DIRECT_OWNER`: `tisaharaFee == 0`, `totalSellerMargin == 0`, `sellerPayableAmount == 0`. Owner manages packing and delivery.
     - `SELLER_OWN_PRODUCT` (Type A): `tisaharaFee == 10` per delivered non-refunded order, `sellerPayableAmount == max(0, subtotal - 10)`. Owning seller manages packing/delivery (`Pending -> Confirmed -> Shipped -> Delivered`), and `isAdmin()` retains oversight.
     - `SELLER_DROPSHIP` (Type B): `tisaharaFee == 5` per delivered non-refunded order, `sellerPayableAmount == max(0, totalSellerMargin - 5)`. Owner manages packing/delivery; seller view is read-only for status transitions.
5. **Seven-Day Return Policy & Duplicate Prevention**:
   - `/returns/{orderId}` uses deterministic document ID `orderId` so a customer can submit at most one return request per delivered order, and only when `status == 'Delivered'` and `request.time` is within `returnDeadlineMs`.
   - `/commissions/{orderId}` uses deterministic document ID `orderId` to prevent duplicate ₹10 / ₹5 fee deductions. Voided if cancelled or refunded.
   - `/payouts/{payoutId}`: Sellers can create payout requests (`status == 'Requested'`) referencing their own UID; only `isAdmin()` can approve, reject, or mark paid.
6. **Supplier & Logistics Security**: `/suppliers` and `/supplierProducts` are strictly `isAdmin()` read/write.
7. **Temporal Integrity**: `createdAt == request.time` on creation and `updatedAt == request.time` on updates; `createdAt` and identity keys are immutable after creation.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated User PII Read**: `GET /users/user_123` while signed out -> `PERMISSION_DENIED`.
2. **Cross-User Address Read**: `GET /addresses/addr_victim` signed in as `attacker_uid` -> `PERMISSION_DENIED`.
3. **Self-Admin Role Escalation**: `CREATE /users/attacker_uid` with `role: "admin"` -> `PERMISSION_DENIED`.
4. **Seller Tampering with Another Seller's Own Product**: `UPDATE /products/sellerA_prod` by `seller_B` -> `PERMISSION_DENIED`.
5. **Seller Type B Modifying Owner Base Price in Dropship Link**: `CREATE /storeProducts/sellerB_ownerProd` with tampered `basePrice: 1` -> `PERMISSION_DENIED`.
6. **Seller Type B Accepting/Shipping Own Dropship Order**: `UPDATE /orders/ord_dropship` by `seller_B` changing `status: "Delivered"` -> `PERMISSION_DENIED`.
7. **Duplicate / Spoofed Fee Tampering on Order Creation**: `CREATE /orders/ord_1` with `orderType: "SELLER_OWN_PRODUCT"` and `tisaharaFee: 0` -> `PERMISSION_DENIED`.
8. **Suspended/Closed Store Receiving New Order**: `CREATE /orders/ord_2` targeting a store with `isActive: false` -> `PERMISSION_DENIED`.
9. **Late Return Request After 7-Day Window**: `CREATE /returns/ord_old` where `request.time > order.returnDeadlineMs` -> `PERMISSION_DENIED`.
10. **Seller Self-Approving Payout**: `UPDATE /payouts/pay_1` by `seller_A` setting `status: "Paid"` -> `PERMISSION_DENIED`.
11. **Non-Admin Accessing Supplier Records**: `LIST /suppliers` by customer or seller -> `PERMISSION_DENIED`.
12. **Admin Email Spoof Without Verification**: Request claiming admin email with `email_verified == false` -> `PERMISSION_DENIED`.
