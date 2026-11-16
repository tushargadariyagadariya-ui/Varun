import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  Bell,
  Check,
  ChevronRight,
  Copy,
  Gift,
  Globe,
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  AppLanguage,
  AppNotification,
  ReferralRecord,
  SavedAddress,
  UserProfile,
} from '../types/marketplace';
import {
  fetchUserReferrals,
  lookupReferrerByCode,
  markNotificationRead,
  recordReferralRedemption,
  saveAddressToProfile,
  updateUserProfile,
} from '../services/marketplaceService';

interface CustomerProfileViewProps {
  userProfile: UserProfile | null;
  notifications: AppNotification[];
  language: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  onProfileUpdated: (updated: UserProfile) => void;
  onOpenAuth: () => void;
  onOpenOwnerPanel: () => void;
  onNotify: (msg: string) => void;
  onLoggedOut: () => void;
}

export const CustomerProfileView: React.FC<CustomerProfileViewProps> = ({
  userProfile,
  notifications,
  language,
  onChangeLanguage,
  onProfileUpdated,
  onOpenAuth,
  onOpenOwnerPanel,
  onNotify,
  onLoggedOut,
}) => {
  const [name, setName] = useState(userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddr, setNewAddr] = useState<Omit<SavedAddress, 'id'>>({
    label: 'Home',
    fullName: userProfile?.name || '',
    phone: userProfile?.phone || '',
    street: '',
    city: '',
    state: '',
    pincode: '',
    isDefault: false,
  });

  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [friendCode, setFriendCode] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name);
      setPhone(userProfile.phone || '');
      fetchUserReferrals(userProfile.uid)
        .then(setReferrals)
        .catch(() => setReferrals([]));
    }
  }, [userProfile]);

  if (!userProfile) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 sm:py-16 space-y-6 bg-[#FFFFFF]">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F3E8FF] border border-purple-200 text-[#7E22CE] flex items-center justify-center mx-auto">
            <UserIcon className="w-7 h-7" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Your TISAHARA Account</h1>
          <p className="text-sm text-slate-600">
            Sign in or create an account to save delivery addresses, earn referral rewards, write product reviews, and open a seller store.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-6 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-sm font-semibold cursor-pointer shadow-xs"
          >
            Sign In / Create Account
          </button>
        </div>

        {/* Account Administration Menu */}
        <div className="bg-white rounded-2xl border border-purple-100 p-4 shadow-xs">
          <button
            type="button"
            onClick={onOpenOwnerPanel}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-[#FAF5FF] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#F3E8FF] border border-purple-200 text-[#6B21A8] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">Owner Panel</div>
                <div className="text-xs text-slate-600 truncate">
                  Marketplace owner administration &amp; store analytics
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#7E22CE] shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateUserProfile(userProfile.uid, {
        name: name.trim(),
        phone: phone.trim(),
        preferredLanguage: language,
      });
      onProfileUpdated({
        ...userProfile,
        name: name.trim(),
        phone: phone.trim(),
        preferredLanguage: language,
      });
      onNotify('Profile details updated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await saveAddressToProfile(userProfile, newAddr);
      onProfileUpdated({ ...userProfile, addresses: updated });
      setShowAddAddress(false);
      setNewAddr({
        label: 'Home',
        fullName: userProfile.name,
        phone: userProfile.phone || '',
        street: '',
        city: '',
        state: '',
        pincode: '',
        isDefault: false,
      });
      onNotify('Delivery address saved.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save address.');
    }
  };

  const handleDeleteAddress = async (addrId: string) => {
    const remaining = (userProfile.addresses || []).filter((a) => a.id !== addrId);
    try {
      await updateUserProfile(userProfile.uid, { addresses: remaining });
      onProfileUpdated({ ...userProfile, addresses: remaining });
      onNotify('Address removed.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to remove address.');
    }
  };

  const handleCopyReferral = async () => {
    const shareUrl = `${window.location.origin}?ref=${userProfile.referralCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onNotify('Referral link copied to clipboard.');
    } catch {
      onNotify(`Your referral code: ${userProfile.referralCode}`);
    }
  };

  const handleRedeemReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = friendCode.trim().toUpperCase();
    if (!clean || clean === userProfile.referralCode) {
      onNotify('Please enter a valid referral code from another member.');
      return;
    }
    setRedeemingCode(true);
    try {
      if (userProfile.referredBy) {
        onNotify(`Referral code ${userProfile.referredBy} is already applied to your account.`);
        setRedeemingCode(false);
        return;
      }
      const matchedReferrer = await lookupReferrerByCode(clean);
      if (matchedReferrer && matchedReferrer.userId !== userProfile.uid) {
        await recordReferralRedemption(userProfile, matchedReferrer.userId, clean);
        onProfileUpdated({
          ...userProfile,
          referredBy: clean,
          rewardPoints: (userProfile.rewardPoints || 0) + 50,
        });
        setFriendCode('');
        onNotify('Referral applied! 50 reward points added to your wallet.');
      } else {
        await updateUserProfile(userProfile.uid, {
          referredBy: clean,
          rewardPoints: (userProfile.rewardPoints || 0) + 25,
        });
        onProfileUpdated({
          ...userProfile,
          referredBy: clean,
          rewardPoints: (userProfile.rewardPoints || 0) + 25,
        });
        setFriendCode('');
        onNotify(`Referral code ${clean} saved! 25 welcome bonus points credited.`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not apply referral code.');
    } finally {
      setRedeemingCode(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    onLoggedOut();
    onNotify('You have signed out cleanly. You can sign back in anytime.');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 bg-[#FFFFFF]">
      {/* Header Row */}
      <div className="bg-gradient-to-r from-[#FAF5FF] to-white rounded-2xl border border-purple-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 space-y-0.5">
          <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 leading-snug truncate">
            {userProfile.name}
          </h1>
          <p className="text-xs text-slate-600 truncate">
            {userProfile.email} · Role:{' '}
            <span className="capitalize font-semibold text-[#6B21A8]">{userProfile.role}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Language Switcher */}
          <div className="inline-flex items-center gap-1 bg-white border border-purple-100 p-1 rounded-xl">
            <Globe className="w-3.5 h-3.5 text-[#7E22CE] ml-1.5" />
            <button
              type="button"
              onClick={() => onChangeLanguage('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                language === 'en' ? 'bg-[#7E22CE] text-white' : 'text-slate-700 hover:bg-[#FAF5FF]'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('hi')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                language === 'hi' ? 'bg-[#7E22CE] text-white' : 'text-slate-700 hover:bg-[#FAF5FF]'
              }`}
            >
              HI
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenOwnerPanel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-200 bg-[#F3E8FF] hover:bg-purple-200 text-[#581C87] text-xs font-semibold cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#6B21A8]" />
            <span>Owner Panel</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] text-slate-800 text-xs font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[#7E22CE]" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Personal Info & Addresses */}
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white rounded-2xl border border-purple-100 p-6 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-slate-900">
              Personal Details &amp; Contact
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-[#FAF5FF] border border-purple-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          {/* Saved Delivery Addresses */}
          <div className="bg-white rounded-2xl border border-purple-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#7E22CE]" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Saved Addresses
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddAddress((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#6B21A8] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Address</span>
              </button>
            </div>

            {showAddAddress && (
              <form
                onSubmit={handleAddAddress}
                className="p-4 rounded-xl bg-[#FAF5FF] border border-purple-100 space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newAddr.fullName}
                    onChange={(e) => setNewAddr({ ...newAddr, fullName: e.target.value })}
                    className="px-3 py-2 text-xs text-slate-900 border border-purple-200 rounded-xl bg-white"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="Phone Number"
                    value={newAddr.phone}
                    onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                    className="px-3 py-2 text-xs text-slate-900 border border-purple-200 rounded-xl bg-white"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="House No., Building, Street"
                  value={newAddr.street}
                  onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })}
                  className="w-full px-3 py-2 text-xs text-slate-900 border border-purple-200 rounded-xl bg-white"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="City"
                    value={newAddr.city}
                    onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                    className="px-3 py-2 text-xs text-slate-900 border border-purple-200 rounded-xl bg-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="State"
                    value={newAddr.state}
                    onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                    className="px-3 py-2 text-xs text-slate-900 border border-purple-200 rounded-xl bg-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="PIN Code"
                    value={newAddr.pincode}
                    onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })}
                    className="px-3 py-2 text-xs text-slate-900 border border-purple-200 rounded-xl bg-white font-mono-num"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(false)}
                    className="px-3 py-1.5 text-xs text-slate-700 border border-purple-200 rounded-xl bg-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
                  >
                    Save Address
                  </button>
                </div>
              </form>
            )}

            {(userProfile.addresses || []).length === 0 ? (
              <p className="text-xs text-slate-600">
                No saved addresses yet. Add one here or during checkout.
              </p>
            ) : (
              <div className="space-y-2.5">
                {userProfile.addresses?.map((addr) => (
                  <div
                    key={addr.id}
                    className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-purple-100 bg-[#FAF5FF]/60"
                  >
                    <div className="text-xs space-y-0.5 text-slate-800">
                      <div className="font-semibold text-slate-900">
                        {addr.fullName} · <span className="font-mono-num">{addr.phone}</span>
                      </div>
                      <div className="text-slate-600">
                        {addr.street}, {addr.city}, {addr.state} -{' '}
                        <span className="font-mono-num font-semibold text-slate-800">{addr.pincode}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(addr.id)}
                      aria-label="Delete address"
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Referrals & Notifications */}
        <div className="lg:col-span-5 space-y-6">
          {/* Referral & Rewards */}
          <div className="bg-white rounded-2xl border border-purple-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#7E22CE]" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Referrals &amp; Rewards
                </h2>
              </div>
              <span className="font-mono-num text-sm font-bold text-[#6B21A8] bg-[#F3E8FF] px-2.5 py-0.5 rounded-full">
                {userProfile.rewardPoints} pts
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Share your unique referral link with friends and shoppers to earn TISAHARA reward points.
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-xl bg-[#FAF5FF] border border-purple-200 font-mono-num text-sm font-bold text-[#581C87]">
                {userProfile.referralCode}
              </div>
              <button
                type="button"
                onClick={handleCopyReferral}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] text-white text-xs font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </button>
            </div>

            {!userProfile.referredBy ? (
              <form onSubmit={handleRedeemReferral} className="pt-2 flex gap-2">
                <input
                  type="text"
                  value={friendCode}
                  onChange={(e) => setFriendCode(e.target.value)}
                  placeholder="Enter friend's referral code"
                  className="flex-1 px-3 py-2 text-xs text-slate-900 bg-white border border-purple-200 rounded-xl uppercase font-mono-num"
                />
                <button
                  type="submit"
                  disabled={redeemingCode}
                  className="px-3.5 py-2 rounded-xl bg-[#F3E8FF] hover:bg-purple-200 border border-purple-200 text-[#581C87] text-xs font-semibold cursor-pointer"
                >
                  Apply
                </button>
              </form>
            ) : (
              <p className="text-xs text-[#6B21A8] font-medium">
                Referred by code: <span className="font-mono-num font-bold">{userProfile.referredBy}</span>
              </p>
            )}

            {referrals.length > 0 && (
              <div className="pt-2 border-t border-purple-100 space-y-1.5">
                <span className="text-xs font-semibold text-slate-900">
                  Invited Friends ({referrals.length})
                </span>
                {referrals.map((r) => (
                  <div key={r.id} className="flex justify-between text-xs text-slate-700">
                    <span>{r.referredUserName}</span>
                    <span className="font-mono-num font-semibold text-[#6B21A8]">+{r.rewardAmount} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-2xl border border-purple-100 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#7E22CE]" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Notifications ({notifications.length})
              </h2>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-600">
                You are all caught up. Order updates and seller alerts appear here.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      n.isRead
                        ? 'border-purple-100 bg-white text-slate-700'
                        : 'border-[#7E22CE] bg-[#FAF5FF] text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{n.title}</span>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(n.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B21A8] hover:underline cursor-pointer"
                        >
                          <Check className="w-3 h-3" /> Mark read
                        </button>
                      )}
                    </div>
                    <p className="leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account Administration */}
          <div className="bg-white rounded-2xl border border-purple-100 p-5">
            <button
              type="button"
              onClick={onOpenOwnerPanel}
              className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-[#FAF5FF] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#F3E8FF] border border-purple-200 text-[#6B21A8] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Owner Panel</div>
                  <div className="text-xs text-slate-600 truncate">
                    Products, stores, orders &amp; marketplace controls
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#7E22CE] shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
