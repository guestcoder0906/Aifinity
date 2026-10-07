import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  UserRole,
  isDefaultAdmin,
  updateCachedProfile,
  PaymentTransactionRecord
} from '../services/authService';
import {
  searchUsers,
  grantActionsToUser,
  setInfiniteActionsForUser,
  resetUserActions,
  setUserRole,
  grantAdventurePermissions,
  setGlowingNamePreference
} from '../services/adminService';
import ActionLimitService, { ActionStatus } from '../services/actionLimitService';
import {
  cancelStripeSubscription,
  createStripeCustomerPortalSession
} from '../services/stripeCheckoutService';
import GoldenName from './GoldenName';
import { ReceiptModal } from './ReceiptModal';
import { ReceiptsList } from './ReceiptsList';
import {
  X,
  User,
  Sparkles,
  Shield,
  Infinity,
  Zap,
  CheckCircle2,
  AlertCircle,
  Search,
  Settings,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  UserCheck,
  Award,
  Crown,
  Share2,
  Bookmark,
  Receipt,
  FileText
} from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  actionStatus: ActionStatus;
  onProfileUpdated: (updatedUser: UserProfile) => void;
  onStatusUpdated?: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  actionStatus,
  onProfileUpdated,
  onStatusUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'staff'>('profile');
  const [selectedReceiptForInvoice, setSelectedReceiptForInvoice] = useState<PaymentTransactionRecord | null>(null);

  // Glowing name state
  const [glowingEnabled, setGlowingEnabled] = useState<boolean>(
    currentUser?.showGlowingName !== false
  );

  // Subscription cancellation state
  const [cancelSubConfirm, setCancelSubConfirm] = useState(false);
  const [cancelSubLoading, setCancelSubLoading] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [cancelSubMessage, setCancelSubMessage] = useState<string | null>(null);

  // Staff search & target state
  const [userQuery, setUserQuery] = useState('');
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionsToGrant, setActionsToGrant] = useState<number>(50);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || isDefaultAdmin(currentUser?.email, currentUser?.username);
  const isMod = (currentUser?.role === 'mod') && !isAdmin;
  const isStaff = isAdmin || isMod;

  const loadUsers = async (queryTerm: string) => {
    setLoadingUsers(true);
    try {
      const results = await searchUsers(queryTerm);
      setUserList(results);
      if (selectedUser) {
        const updatedSelected = results.find((u) => u.uid === selectedUser.uid);
        if (updatedSelected) setSelectedUser(updatedSelected);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setGlowingEnabled(currentUser.showGlowingName !== false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && isStaff) {
      loadUsers('');
    }
  }, [isOpen, isStaff]);

  if (!isOpen || !currentUser) return null;

  const handleToggleGlowing = async () => {
    const next = !glowingEnabled;
    setGlowingEnabled(next);
    await setGlowingNamePreference(currentUser, next);
    const updated = { ...currentUser, showGlowingName: next };
    onProfileUpdated(updated);
  };

  const handleCancelSubscription = async () => {
    if (!currentUser) return;
    setCancelSubLoading(true);
    setCancelSubMessage(null);
    let stripeRes: any = null;
    try {
      stripeRes = await cancelStripeSubscription(
        currentUser.uid,
        currentUser.stripeSubscriptionId,
        currentUser.email || undefined,
        currentUser.username || undefined,
        currentUser.stripeCustomerId || undefined
      );
    } catch (e) {
      console.warn('Stripe cancellation call warning:', e);
    }

    try {
      const updatedUser = await ActionLimitService.cancelSubscription(currentUser);
      onProfileUpdated(updatedUser);
      if (onStatusUpdated) onStatusUpdated();
      setCancelSubConfirm(false);
      setCancelSubMessage(
        stripeRes?.notFoundOnStripe
          ? 'Your subscription has been cancelled and your account has returned to the Free Tier.'
          : stripeRes?.message || 'Your subscription has been cancelled successfully. Your account has returned to the Free Tier.'
      );
    } catch (err: any) {
      console.error('Failed to update local subscription status:', err);
      const fallbackUser: UserProfile = {
        ...currentUser,
        tier: 'free',
        subscriptionExpiresAt: undefined,
        stripeSubscriptionId: null,
        subscriptionStatus: 'canceled',
        ...(currentUser.role !== 'admin' && currentUser.role !== 'mod' ? {
          canSaveMultipleAdventures: false,
          canPostCommunityAdventures: false,
          showGlowingName: false
        } : {})
      };
      onProfileUpdated(fallbackUser);
      if (onStatusUpdated) onStatusUpdated();
      setCancelSubConfirm(false);
      setCancelSubMessage('Your subscription has been cancelled and your account has returned to the Free Tier.');
    } finally {
      setCancelSubLoading(false);
    }
  };

  const handleOpenStripePortal = async () => {
    if (!currentUser?.uid) return;
    setIsOpeningPortal(true);
    setCancelSubMessage(null);
    try {
      const portalUrl = await createStripeCustomerPortalSession(
        currentUser.uid,
        currentUser.email || undefined,
        currentUser.username || undefined,
        currentUser.stripeSubscriptionId || undefined,
        typeof window !== 'undefined' ? window.location.origin : 'https://www.aifinity-rpg.com',
        currentUser.stripeCustomerId || undefined
      );
      if (portalUrl) {
        window.location.href = portalUrl;
      } else {
        throw new Error('Stripe did not return a valid customer portal link.');
      }
    } catch (err: any) {
      setCancelSubMessage(
        err.message || 'Stripe Customer Portal could not be opened. You can click "Cancel Subscription" below to reset your plan to Free.'
      );
      // Automatically prompt cancel confirmation for instant convenience
      setCancelSubConfirm(true);
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleGrantActions = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setFeedbackMessage(null);

    const res = await grantActionsToUser(currentUser, selectedUser.uid, actionsToGrant);
    if (!res.success) {
      setFeedbackMessage({ text: res.error || 'Failed to grant actions.', type: 'error' });
    } else {
      const newCredits = res.newCredits !== undefined ? res.newCredits : (selectedUser.actionCredits || 0) + actionsToGrant;
      const updatedUserObj: UserProfile = {
        ...selectedUser,
        actionCredits: newCredits
      };
      setSelectedUser(updatedUserObj);
      updateCachedProfile(selectedUser.uid, { actionCredits: newCredits });
      if (selectedUser.uid === currentUser.uid) {
        onProfileUpdated({
          ...currentUser,
          actionCredits: newCredits
        });
      }
      setFeedbackMessage({
        text: `Successfully granted ${actionsToGrant} actions to ${selectedUser.username}! (Total credits: ${newCredits})`,
        type: 'success'
      });
      await loadUsers(userQuery);
    }
    setActionLoading(false);
  };

  const handleSetInfinite = async (enable: boolean) => {
    if (!selectedUser) return;
    setActionLoading(true);
    setFeedbackMessage(null);

    const res = await setInfiniteActionsForUser(currentUser, selectedUser.uid, enable);
    if (!res.success) {
      setFeedbackMessage({ text: res.error || 'Failed to update infinite actions.', type: 'error' });
    } else {
      const updatedUserObj: UserProfile = {
        ...selectedUser,
        hasInfiniteActions: enable
      };
      setSelectedUser(updatedUserObj);
      updateCachedProfile(selectedUser.uid, { hasInfiniteActions: enable });
      if (selectedUser.uid === currentUser.uid) {
        onProfileUpdated({
          ...currentUser,
          hasInfiniteActions: enable
        });
      }
      setFeedbackMessage({
        text: enable
          ? `Infinite actions granted to ${selectedUser.username}!`
          : `Infinite actions revoked for ${selectedUser.username}.`,
        type: 'success'
      });
      await loadUsers(userQuery);
    }
    setActionLoading(false);
  };

  const handleResetActions = async () => {
    if (!selectedUser) return;
    if (!confirmResetOpen) {
      setConfirmResetOpen(true);
      return;
    }

    setActionLoading(true);
    setFeedbackMessage(null);
    setConfirmResetOpen(false);

    const res = await resetUserActions(currentUser, selectedUser.uid);
    if (!res.success) {
      setFeedbackMessage({ text: res.error || 'Failed to reset actions.', type: 'error' });
    } else {
      const updatedUserObj: UserProfile = {
        ...selectedUser,
        actionCredits: 0,
        hasInfiniteActions: false
      };
      setSelectedUser(updatedUserObj);
      updateCachedProfile(selectedUser.uid, { actionCredits: 0, hasInfiniteActions: false });
      if (selectedUser.uid === currentUser.uid) {
        onProfileUpdated({
          ...currentUser,
          actionCredits: 0,
          hasInfiniteActions: false
        });
      }
      setFeedbackMessage({
        text: `Actions for ${selectedUser.username} have been reset to 0 and infinite status revoked.`,
        type: 'success'
      });
      await loadUsers(userQuery);
    }
    setActionLoading(false);
  };

  const handleSetRole = async (newRole: 'user' | 'mod' | 'admin') => {
    if (!selectedUser) return;
    setActionLoading(true);
    setFeedbackMessage(null);

    const res = await setUserRole(currentUser, selectedUser.uid, newRole);
    if (!res.success) {
      setFeedbackMessage({ text: res.error || 'Failed to update user role.', type: 'error' });
    } else {
      const updatedUserObj: UserProfile = {
        ...selectedUser,
        role: newRole,
        hasInfiniteActions: newRole === 'admin' ? true : selectedUser.hasInfiniteActions,
        canSaveMultipleAdventures: (newRole === 'admin' || newRole === 'mod') ? true : selectedUser.canSaveMultipleAdventures,
        canPostCommunityAdventures: (newRole === 'admin' || newRole === 'mod') ? true : selectedUser.canPostCommunityAdventures
      };
      setSelectedUser(updatedUserObj);
      updateCachedProfile(selectedUser.uid, {
        role: newRole,
        ...(newRole === 'admin' ? { hasInfiniteActions: true, canSaveMultipleAdventures: true, canPostCommunityAdventures: true } : {}),
        ...(newRole === 'mod' ? { canSaveMultipleAdventures: true, canPostCommunityAdventures: true } : {})
      });
      if (selectedUser.uid === currentUser.uid) {
        onProfileUpdated({
          ...currentUser,
          ...updatedUserObj
        });
      }
      const roleLabel = newRole === 'admin' ? 'Administrator (Admin)' : newRole === 'mod' ? 'Moderator (Mod)' : 'Standard User';
      setFeedbackMessage({
        text: `Success! ${selectedUser.username} is now ${roleLabel}.`,
        type: 'success'
      });
      await loadUsers(userQuery);
    }
    setActionLoading(false);
  };

  const handleToggleAdventurePermission = async (key: 'canSaveMultipleAdventures' | 'canPostCommunityAdventures', currentVal?: boolean) => {
    if (!selectedUser) return;
    setActionLoading(true);
    setFeedbackMessage(null);

    const nextVal = !currentVal;
    const res = await grantAdventurePermissions(currentUser, selectedUser.uid, {
      [key]: nextVal
    });

    if (!res.success) {
      setFeedbackMessage({ text: res.error || 'Failed to update permissions.', type: 'error' });
    } else {
      const updatedUserObj: UserProfile = {
        ...selectedUser,
        [key]: nextVal
      };
      setSelectedUser(updatedUserObj);
      updateCachedProfile(selectedUser.uid, { [key]: nextVal });
      if (selectedUser.uid === currentUser.uid) {
        onProfileUpdated({
          ...currentUser,
          [key]: nextVal
        });
      }
      setFeedbackMessage({
        text: `Updated permission for ${selectedUser.username}!`,
        type: 'success'
      });
      await loadUsers(userQuery);
    }
    setActionLoading(false);
  };

  return (
    <div id="account-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 font-mono">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
        {/* Modal Top Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
              isAdmin
                ? 'bg-sky-950 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                : isMod
                ? 'bg-amber-950 border border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                : 'bg-neutral-800 border border-neutral-700 text-white'
            }`}>
              {isAdmin ? <Sparkles size={16} /> : isMod ? <Shield size={16} /> : <User size={16} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white tracking-wider flex items-center gap-2 flex-wrap">
                <span>ACCOUNT DASHBOARD</span>
                {isAdmin && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/80 text-cyan-300 font-extrabold uppercase shadow-[0_0_8px_rgba(56,189,248,0.4)]">
                    CELESTIAL ADMIN
                  </span>
                )}
                {isMod && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-400/80 text-amber-300 font-extrabold uppercase shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                    MODERATOR
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-neutral-400 truncate">Manage profile settings, permissions, and staff tools</p>
            </div>
          </div>

          <button
            id="close-account-modal-btn"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shrink-0 ml-2"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-950 px-4 sm:px-6 shrink-0 gap-1 overflow-x-auto">
          <button
            id="account-tab-profile"
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-3 text-xs font-semibold tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <User size={14} />
            <span>MY PROFILE</span>
          </button>
          <button
            id="account-tab-billing"
            type="button"
            onClick={() => setActiveTab('billing')}
            className={`py-3 px-3 text-xs font-semibold tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'billing'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Receipt size={14} />
            <span>BILLING & RECEIPTS</span>
          </button>
          {isStaff && (
            <button
              id="account-tab-staff"
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`py-3 px-3 text-xs font-semibold tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'staff'
                  ? isAdmin
                    ? 'border-cyan-400 text-cyan-300 shadow-cyan-400/20'
                    : 'border-amber-400 text-amber-300 shadow-amber-400/20'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {isAdmin ? <Sparkles size={14} /> : <Shield size={14} />}
              <span>{isAdmin ? 'ADMIN CONSOLE' : 'MODERATOR TOOLS'}</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-5 flex-1">
          {activeTab === 'profile' ? (
            <>
              {/* Status message after cancellation */}
              {cancelSubMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 shadow-sm ${
                    cancelSubMessage.toLowerCase().includes('cancel') && !cancelSubMessage.toLowerCase().includes('not') && !cancelSubMessage.toLowerCase().includes('could not')
                      ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                      : 'bg-amber-950/70 border border-amber-700/80 text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>{cancelSubMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCancelSubMessage(null)}
                    className="text-xs opacity-70 hover:opacity-100 hover:text-white cursor-pointer px-1 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Profile Card */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1">Signed in as</div>
                  <div className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <GoldenName
                      name={currentUser.username}
                      role={currentUser.role}
                      tier={currentUser.tier}
                      showGlowingName={currentUser.showGlowingName}
                      isGolden={currentUser.tier === 'legendary'}
                    />
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5 truncate">{currentUser.email || 'No email attached'}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className={`px-2.5 py-1 rounded text-xs border ${
                    currentUser.tier === 'celestial'
                      ? 'bg-gradient-to-r from-sky-950 to-purple-950 border-cyan-400/60 text-cyan-200 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                      : currentUser.tier === 'legendary'
                      ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                      : currentUser.tier === 'adventurer'
                      ? 'bg-blue-950/70 border-blue-500/50 text-blue-300'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                  }`}>
                    Tier: <span className="font-bold uppercase">{currentUser.tier || 'Free'}</span>
                  </div>
                  {isAdmin && (
                    <div className="px-2.5 py-1 bg-cyan-950/70 border border-cyan-400/50 rounded text-xs text-cyan-300 font-bold flex items-center gap-1 shadow-[0_0_6px_rgba(56,189,248,0.3)]">
                      <Sparkles size={12} />
                      <span>Admin</span>
                    </div>
                  )}
                  {isMod && (
                    <div className="px-2.5 py-1 bg-amber-950/70 border border-amber-400/50 rounded text-xs text-amber-300 font-bold flex items-center gap-1 shadow-[0_0_6px_rgba(245,158,11,0.3)]">
                      <Shield size={12} />
                      <span>Moderator</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Monthly Membership Card if Subscribed */}
              {(currentUser.tier === 'adventurer' || currentUser.tier === 'legendary' || currentUser.tier === 'celestial') && (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentUser.tier === 'celestial'
                    ? 'bg-gradient-to-r from-sky-950/60 via-purple-950/50 to-indigo-950/60 border-cyan-400/60 shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                    : currentUser.tier === 'legendary'
                    ? 'bg-gradient-to-r from-amber-950/50 to-yellow-950/40 border-amber-500/60'
                    : 'bg-blue-950/40 border-blue-500/50'
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Crown size={16} className={
                        currentUser.tier === 'celestial' ? 'text-cyan-300' : currentUser.tier === 'legendary' ? 'text-amber-400' : 'text-blue-400'
                      } />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Active {currentUser.tier} Membership
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                      Auto-Active
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    {currentUser.tier === 'celestial'
                      ? 'You have unlocked the highest realm: 1,000 monthly bonus actions, unlimited adventure save slots, community adventure publishing, and celestial glowing name privileges.'
                      : currentUser.tier === 'legendary'
                      ? 'You receive 600 monthly bonus actions, unlimited adventure save slots, community adventure publishing, and golden glowing name privileges.'
                      : 'You receive 300 monthly bonus actions, unlimited adventure save slots, and community adventure publishing privileges.'}
                  </p>

                  {currentUser.subscriptionExpiresAt && (
                    <div className="text-[10px] text-neutral-400 font-mono pt-1 border-t border-neutral-800/80 flex items-center justify-between flex-wrap gap-1">
                      <span>Next renewal / expiry:</span>
                      <span className="text-neutral-200">{new Date(currentUser.subscriptionExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  )}

                  {/* Cancel Subscription & Portal Options */}
                  {cancelSubConfirm ? (
                    <div className="p-3 bg-red-950/80 border border-red-800 rounded-lg space-y-2">
                      <p className="text-xs text-red-200">
                        Are you sure you want to cancel your <strong>{currentUser.tier.toUpperCase()}</strong> membership? You will return to the Free Tier.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          id="confirm-cancel-sub-btn"
                          type="button"
                          disabled={cancelSubLoading}
                          onClick={handleCancelSubscription}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded text-xs cursor-pointer transition-colors"
                        >
                          {cancelSubLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelSubConfirm(false)}
                          className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs cursor-pointer"
                        >
                          Keep Membership
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleOpenStripePortal}
                        disabled={isOpeningPortal}
                        className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer font-semibold py-1 flex items-center gap-1 disabled:opacity-50"
                        title="Redirect to Stripe's Customer Portal to manage subscription and billing"
                      >
                        <span>{isOpeningPortal ? 'Opening Stripe...' : 'Manage on Stripe'}</span>
                      </button>
                      <button
                        id="cancel-subscription-btn"
                        type="button"
                        onClick={() => setCancelSubConfirm(true)}
                        className="text-xs text-red-400 hover:text-red-300 hover:underline cursor-pointer font-semibold py-1"
                      >
                        Cancel Subscription
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Action Limits & Infinite Actions Status */}
              <div className={`p-4 rounded-xl border ${
                isAdmin || actionStatus.hasInfiniteActions
                  ? 'bg-gradient-to-r from-sky-950/40 via-indigo-950/30 to-purple-950/40 border-cyan-500/40 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                  : 'bg-neutral-950 border-neutral-800'
              }`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                      <Zap size={14} />
                    </div>
                    <span className="text-xs font-bold text-white tracking-wider">ACTION PRIVILEGES</span>
                  </div>
                  {isAdmin || actionStatus.hasInfiniteActions ? (
                    <span className="text-xs font-extrabold text-cyan-300 flex items-center gap-1.5 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.4)]">
                      <Infinity size={15} className="animate-pulse" />
                      <span>INFINITE ACTIONS IN ADVANCE</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-neutral-300">
                      {actionStatus.totalAvailableActions} actions remaining
                    </span>
                  )}
                </div>

                {isAdmin ? (
                  <div className="p-3 bg-sky-950/60 border border-cyan-400/40 rounded-lg text-xs text-cyan-200 space-y-1">
                    <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                      <Sparkles size={14} />
                      <span>Celestial Admin Privilege Active</span>
                    </div>
                    <p className="text-[11px] text-cyan-200/90 leading-relaxed">
                      As an Administrator, you have permanent infinite actions automatically active in advance on your account. You will never run out of turns.
                    </p>
                  </div>
                ) : actionStatus.hasInfiniteActions ? (
                  <div className="p-3 bg-indigo-950/60 border border-indigo-400/40 rounded-lg text-xs text-indigo-200 space-y-1">
                    <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      <span>Infinite Actions Granted</span>
                    </div>
                    <p className="text-[11px] text-indigo-200/90 leading-relaxed">
                      An Administrator has granted your account infinite actions in advance! You can explore adventures without limits.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg">
                      <div className="text-neutral-400 text-[10px]">Free Actions (max 200)</div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">
                        {(actionStatus.freeStackedActions ?? actionStatus.dailyFreeRemaining ?? 0)} / 200
                      </div>
                      <div className="text-[9px] text-neutral-500 mt-0.5">+{actionStatus.dailyFreeTotal}/day refreshed</div>
                    </div>
                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg">
                      <div className="text-neutral-400 text-[10px]">Purchased Credits</div>
                      <div className="text-sm font-bold text-blue-400 mt-0.5" title="Purchased actions are never limited">
                        {actionStatus.purchasedCredits}
                      </div>
                      <div className="text-[9px] text-neutral-500 mt-0.5">Never capped</div>
                    </div>
                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg">
                      <div className="text-neutral-400 text-[10px]">Total Available</div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {actionStatus.totalAvailableActions}
                      </div>
                      <div className="text-[9px] text-neutral-500 mt-0.5">Ready to use</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Special Permissions (Multiple Adventures & Community) */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                <div className="text-xs font-bold text-white tracking-wider flex items-center gap-2">
                  <Award size={15} className="text-amber-400" />
                  <span>PERMANENT ADVENTURE PERMISSIONS</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bookmark size={15} className="text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-200 truncate">Save Multiple Adventures</div>
                        <div className="text-[10px] text-neutral-500 truncate">Store and load multiple story saves</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      actionStatus.canSaveMultipleAdventures
                        ? 'bg-emerald-950 border border-emerald-500/50 text-emerald-300'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}>
                      {actionStatus.canSaveMultipleAdventures ? 'ENABLED' : 'LOCKED'}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Share2 size={15} className="text-purple-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-200 truncate">Post Community Adventures</div>
                        <div className="text-[10px] text-neutral-500 truncate">Publish adventures for all players</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      actionStatus.canPostCommunityAdventures
                        ? 'bg-emerald-950 border border-emerald-500/50 text-emerald-300'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}>
                      {actionStatus.canPostCommunityAdventures ? 'ENABLED' : 'LOCKED'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Glowing Name Toggle (Staff Only) */}
              {isStaff && (
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        {isAdmin ? <Sparkles size={14} className="text-cyan-300" /> : <Shield size={14} className="text-amber-300" />}
                        <span>{isAdmin ? 'CELESTIAL GLOWING NAME' : 'GOLDEN GLOWING NAME'}</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                        Highlight your name with an atmospheric glow across multiplayer, lobbies, chat, and game pages. (Your {isAdmin ? 'ADMIN' : 'MOD'} tag remains visible).
                      </p>
                    </div>

                    <button
                      id="toggle-glowing-name-btn"
                      type="button"
                      onClick={handleToggleGlowing}
                      className="text-neutral-300 hover:text-white p-1 rounded transition-colors cursor-pointer shrink-0"
                      title={glowingEnabled ? 'Turn Off Glowing Name' : 'Turn On Glowing Name'}
                    >
                      {glowingEnabled ? (
                        <ToggleRight size={32} className={isAdmin ? 'text-cyan-400' : 'text-amber-400'} />
                      ) : (
                        <ToggleLeft size={32} className="text-neutral-600" />
                      )}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-neutral-900 flex items-center gap-3 text-xs">
                    <span className="text-neutral-500">Preview:</span>
                    <GoldenName
                      name={currentUser.username}
                      role={currentUser.role}
                      showGlowingName={glowingEnabled}
                    />
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'staff' ? (
            /* STAFF / ADMIN CONSOLE TAB */
            <div className="space-y-5">
              {/* Staff Overview Banner */}
              <div className={`p-3.5 rounded-xl border ${
                isAdmin
                  ? 'bg-sky-950/40 border-cyan-500/50 text-cyan-200'
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              } text-xs space-y-1`}>
                <div className="font-bold flex items-center gap-2">
                  {isAdmin ? <Sparkles size={15} /> : <Shield size={15} />}
                  <span>{isAdmin ? 'Administrator Powers Active' : 'Moderator Tools Active'}</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {isAdmin
                    ? 'Admins can grant any amount of permanent free actions, grant/revoke infinite actions, grant multiple adventures & community permissions, and assign users as mods/Admins.'
                    : 'Moderators can grant up to 500 permanent free added actions per receiving user per day, grant multiple adventures & community permissions, and reset/take away infinite actions.'}
                </p>
              </div>

              {/* Feedback alert */}
              {feedbackMessage && (
                <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  feedbackMessage.type === 'success'
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                    : 'bg-red-950/80 border-red-700 text-red-300'
                }`}>
                  {feedbackMessage.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                  <span className="min-w-0 break-words">{feedbackMessage.text}</span>
                </div>
              )}

              {/* User Search and Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-300">
                  Select User to Manage
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-neutral-500" size={14} />
                  <input
                    id="staff-user-search-input"
                    type="text"
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      loadUsers(e.target.value);
                    }}
                    placeholder="Search by username or email..."
                    className="w-full bg-black border border-neutral-700 pl-9 pr-4 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* User quick list */}
                <div className="max-h-44 overflow-y-auto border border-neutral-800 rounded-lg divide-y divide-neutral-850 bg-black/50">
                  {loadingUsers ? (
                    <div className="p-3 text-center text-xs text-neutral-500">Loading registered players...</div>
                  ) : userList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-neutral-500">No users found matching query.</div>
                  ) : (
                    userList.map((u) => (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setFeedbackMessage(null);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors cursor-pointer gap-2 ${
                          selectedUser?.uid === u.uid
                            ? 'bg-blue-950/60 border-l-2 border-blue-500'
                            : 'hover:bg-neutral-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <GoldenName name={u.username} role={u.role} showGlowingName={u.showGlowingName} />
                          <span className="text-[11px] text-neutral-500 truncate">({u.email || 'No email'})</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {u.hasInfiniteActions && (
                            <span className="text-[10px] text-cyan-300 flex items-center gap-0.5">
                              <Infinity size={11} />
                              <span>Inf</span>
                            </span>
                          )}
                          <span className="text-[10px] text-neutral-400">
                            {u.actionCredits || 0} credits
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Selected User Management Panel */}
              {selectedUser ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
                  <div className="border-b border-neutral-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-400">Selected Player:</div>
                      <div className="text-sm font-bold text-white flex items-center gap-2 mt-0.5 flex-wrap">
                        <GoldenName
                          name={selectedUser.username}
                          role={selectedUser.role}
                          showGlowingName={selectedUser.showGlowingName}
                        />
                        <span className="text-xs text-neutral-500 font-normal truncate">({selectedUser.email || selectedUser.uid})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-[10px] uppercase font-semibold text-neutral-300">
                        Role: {selectedUser.role || 'user'}
                      </span>
                      {selectedUser.hasInfiniteActions && (
                        <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/60 text-[10px] uppercase font-bold text-cyan-300 flex items-center gap-1">
                          <Infinity size={10} />
                          <span>Infinite</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 1. Grant Free Added Actions */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-neutral-300">
                      Grant Permanent Free Added Actions
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="actions-to-grant-input"
                        type="number"
                        min={1}
                        max={isAdmin ? 100000 : 500}
                        value={actionsToGrant}
                        onChange={(e) => setActionsToGrant(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 sm:w-28 bg-black border border-neutral-700 px-3 py-1.5 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none shrink-0"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActionsToGrant(50)}
                          className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 rounded text-[11px] text-neutral-300 cursor-pointer"
                        >
                          +50
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionsToGrant(100)}
                          className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 rounded text-[11px] text-neutral-300 cursor-pointer"
                        >
                          +100
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionsToGrant(250)}
                          className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 rounded text-[11px] text-neutral-300 cursor-pointer"
                        >
                          +250
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionsToGrant(500)}
                          className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 rounded text-[11px] text-neutral-300 cursor-pointer"
                        >
                          +500
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setActionsToGrant(2000)}
                            className="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 rounded text-[11px] text-cyan-300 cursor-pointer"
                          >
                            +2000
                          </button>
                        )}
                      </div>
                      <button
                        id="grant-actions-btn"
                        type="button"
                        disabled={actionLoading}
                        onClick={handleGrantActions}
                        className="w-full sm:w-auto sm:ml-auto px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs tracking-wider transition-colors cursor-pointer shadow"
                      >
                        {actionLoading ? 'GRANTING...' : 'GRANT ACTIONS'}
                      </button>
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      {isMod
                        ? 'Moderators may grant up to 500 actions per user per day.'
                        : 'Admins may grant any amount of permanent actions.'}
                    </p>
                  </div>

                  {/* 2. Infinite Actions Control */}
                  <div className="pt-3 border-t border-neutral-850 space-y-2">
                    <label className="block text-xs font-semibold text-neutral-300">
                      Infinite Actions Management
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <>
                          {!selectedUser.hasInfiniteActions ? (
                            <button
                              id="grant-infinite-actions-btn"
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleSetInfinite(true)}
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                            >
                              <Infinity size={14} />
                              <span>GRANT INFINITE ACTIONS (ADMIN)</span>
                            </button>
                          ) : (
                            <button
                              id="revoke-infinite-actions-btn"
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleSetInfinite(false)}
                              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Infinity size={14} />
                              <span>REVOKE INFINITE ACTIONS</span>
                            </button>
                          )}
                        </>
                      ) : (
                        // Mods can take away / reset infinite actions
                        selectedUser.hasInfiniteActions && (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleSetInfinite(false)}
                            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Infinity size={14} />
                            <span>REVOKE INFINITE ACTIONS (MOD)</span>
                          </button>
                        )
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          id="reset-user-actions-btn"
                          type="button"
                          disabled={actionLoading}
                          onClick={handleResetActions}
                          className={`px-3 py-1.5 border font-semibold rounded-lg text-xs transition-colors cursor-pointer ${
                            confirmResetOpen
                              ? 'bg-red-600 border-red-500 text-white animate-pulse'
                              : 'bg-red-950 hover:bg-red-900 border-red-800 text-red-300'
                          }`}
                          title="Reset user actions to 0 and remove infinite status"
                        >
                          {confirmResetOpen ? 'CLICK AGAIN TO CONFIRM RESET' : 'RESET / TAKE AWAY ACTIONS'}
                        </button>
                        {confirmResetOpen && (
                          <button
                            type="button"
                            onClick={() => setConfirmResetOpen(false)}
                            className="px-2 py-1.5 text-xs text-neutral-400 hover:text-white rounded bg-neutral-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. Adventure & Community Permissions */}
                  <div className="pt-3 border-t border-neutral-850 space-y-2">
                    <label className="block text-xs font-semibold text-neutral-300">
                      Permanent Adventure Permissions (Admins & Mods)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        id="toggle-multi-saves-btn"
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleToggleAdventurePermission('canSaveMultipleAdventures', selectedUser.canSaveMultipleAdventures)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          selectedUser.canSaveMultipleAdventures
                            ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                            : 'bg-neutral-900 border-neutral-750 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Bookmark size={13} />
                        <span>Multiple Saves: {selectedUser.canSaveMultipleAdventures ? 'GRANTED' : 'GRANT'}</span>
                      </button>

                      <button
                        id="toggle-community-post-btn"
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleToggleAdventurePermission('canPostCommunityAdventures', selectedUser.canPostCommunityAdventures)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          selectedUser.canPostCommunityAdventures
                            ? 'bg-purple-950/70 border-purple-600 text-purple-300'
                            : 'bg-neutral-900 border-neutral-750 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Share2 size={13} />
                        <span>Community Posting: {selectedUser.canPostCommunityAdventures ? 'GRANTED' : 'GRANT'}</span>
                      </button>
                    </div>
                  </div>

                  {/* 4. Staff Role Assignment (Only Admins) */}
                  <div className="pt-3 border-t border-neutral-850 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-300">
                        Role Assignment (Only Admins)
                      </label>
                      {!isAdmin && (
                        <span className="text-[10px] text-neutral-500">Restricted to Admins only</span>
                      )}
                    </div>

                    {isAdmin ? (
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const currentRole = selectedUser.role || 'user';
                          return (
                            <>
                              <button
                                id="assign-role-user-btn"
                                type="button"
                                disabled={actionLoading || currentRole === 'user'}
                                onClick={() => handleSetRole('user')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  currentRole === 'user'
                                    ? 'bg-neutral-800 border-neutral-600 text-white cursor-default'
                                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 cursor-pointer'
                                }`}
                              >
                                Standard User
                              </button>
                              <button
                                id="assign-role-mod-btn"
                                type="button"
                                disabled={actionLoading || currentRole === 'mod'}
                                onClick={() => handleSetRole('mod')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                                  currentRole === 'mod'
                                    ? 'bg-amber-950 border-amber-500 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)] cursor-default'
                                    : 'bg-neutral-950 border-neutral-800 text-amber-400/80 hover:text-amber-300 hover:border-amber-600/60 cursor-pointer'
                                }`}
                              >
                                <Shield size={13} />
                                <span>Promote to Moderator (Mod)</span>
                              </button>
                              <button
                                id="assign-role-admin-btn"
                                type="button"
                                disabled={actionLoading || currentRole === 'admin'}
                                onClick={() => handleSetRole('admin')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                                  currentRole === 'admin'
                                    ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)] cursor-default'
                                    : 'bg-neutral-950 border-neutral-800 text-cyan-400/80 hover:text-cyan-300 hover:border-cyan-500/60 cursor-pointer'
                                }`}
                              >
                                <Sparkles size={13} />
                                <span>Promote to Administrator (Admin)</span>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-[11px] text-neutral-400">
                        Moderators cannot grant or promote other users as mods or Admins.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 border border-dashed border-neutral-800 rounded-xl text-center text-xs text-neutral-500">
                  Select a user from the list above to manage their actions, infinite access, and permissions.
                </div>
              )}
            </div>
          ) : activeTab === 'billing' ? (
            <div className="space-y-4">
              <ReceiptsList
                currentUser={currentUser}
                onViewReceipt={(tx) => setSelectedReceiptForInvoice(tx)}
                onProfileUpdated={onProfileUpdated}
                onStatusUpdated={onStatusUpdated}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Invoice / Receipt Modal */}
      <ReceiptModal
        isOpen={!!selectedReceiptForInvoice}
        onClose={() => setSelectedReceiptForInvoice(null)}
        transaction={selectedReceiptForInvoice}
        currentUser={currentUser}
      />
    </div>
  );
};

export default AccountModal;
