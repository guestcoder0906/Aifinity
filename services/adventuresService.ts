import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { UserProfile, UserTier, isDefaultAdmin } from './authService';
import { NarrativeEntry } from '../types';
import { safeStorage } from './safeStorage';

export interface SavedAdventure {
  id: string;
  userId: string;
  title: string;
  authorName: string;
  startingPrompt: string;
  initialAiGeneration: string;
  narrative: NarrativeEntry[];
  files: Record<string, string>;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CommunityShareType = 'full' | 'prompt_only' | 'initial_generation';

export interface CommunityComment {
  id: string;
  authorId: string;
  authorName: string;
  authorTier?: UserTier;
  text: string;
  createdAt: string;
}

export interface CommunityAdventure {
  id: string;
  authorId: string;
  authorName: string;
  authorTier: UserTier;
  title: string;
  shareType: CommunityShareType;
  startingPrompt: string;
  initialAiGeneration: string;
  narrative?: NarrativeEntry[];
  files?: Record<string, string>;
  likesCount: number;
  likedBy?: string[];
  comments?: CommunityComment[];
  createdAt: string;
}

const LOCAL_SAVED_ADVENTURES_KEY = 'aifinity_saved_adventures';

export class AdventuresService {
  /**
   * Get list of saved adventures for user
   */
  public static async getSavedAdventures(user: UserProfile | null, guestId: string): Promise<SavedAdventure[]> {
    const targetUid = auth.currentUser?.uid || user?.uid;
    if (targetUid) {
      try {
        const userAdventuresRef = collection(db, 'users', targetUid, 'adventures');
        const snap = await getDocs(userAdventuresRef);
        const adventures: SavedAdventure[] = [];
        snap.forEach((d) => {
          const data = d.data() as SavedAdventure;
          adventures.push({
            ...data,
            id: data.id || d.id
          });
        });
        // Sort newest first
        adventures.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return adventures;
      } catch (err) {
        console.error('Error fetching user adventures from Firestore, falling back to local:', err);
      }
    }

    // SafeStorage fallback for guests or offline
    try {
      const raw = safeStorage.getItem(LOCAL_SAVED_ADVENTURES_KEY);
      if (raw) {
        const parsed: SavedAdventure[] = JSON.parse(raw);
        return parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch (e) {}

    return [];
  }

  /**
   * Saves an adventure.
   * Free users are locked to 1 saved adventure slot!
   */
  public static async saveAdventure(
    user: UserProfile | null,
    guestId: string,
    adventure: {
      id?: string;
      title: string;
      startingPrompt: string;
      initialAiGeneration: string;
      narrative: NarrativeEntry[];
      files: Record<string, string>;
    }
  ): Promise<{ success: boolean; adventure?: SavedAdventure; reason?: 'tier_limit' | 'error'; message?: string }> {
    const isSubscriber = user?.tier === 'adventurer' || user?.tier === 'legendary' || user?.tier === 'celestial' || Boolean(user?.canSaveMultipleAdventures) || user?.role === 'admin' || user?.role === 'mod';
    const existingAdventures = await this.getSavedAdventures(user, guestId);

    // Free users can only have 1 saved adventure unless upgraded or granted permission
    const isUpdate = adventure.id && existingAdventures.some(a => a.id === adventure.id);
    if (!isSubscriber && existingAdventures.length >= 1 && !isUpdate) {
      return {
        success: false,
        reason: 'tier_limit',
        message: 'Saving multiple adventures is locked for Free users. Upgrade to Adventurer tier ($4.99/mo) in the Market to save unlimited adventures!'
      };
    }

    const id = adventure.id || 'adv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const authorName = user?.username || safeStorage.getItem('aifinity_guest_name') || 'Player (Guest)';
    const now = new Date().toISOString();

    const record: SavedAdventure = {
      id,
      userId: user?.uid || guestId,
      title: adventure.title.trim() || 'Untitled Adventure',
      authorName,
      startingPrompt: adventure.startingPrompt || '',
      initialAiGeneration: adventure.initialAiGeneration || '',
      narrative: adventure.narrative || [],
      files: adventure.files || {},
      turnCount: (adventure.narrative || []).filter(n => n.type === 'user').length,
      createdAt: now,
      updatedAt: now
    };

    // Save to Firestore if user is authenticated
    if (user?.uid) {
      try {
        const docRef = doc(db, 'users', user.uid, 'adventures', id);
        await setDoc(docRef, record);
      } catch (err) {
        console.error('Failed to save adventure to Firestore:', err);
      }
    }

    // Always update local cache
    try {
      const raw = safeStorage.getItem(LOCAL_SAVED_ADVENTURES_KEY);
      let list: SavedAdventure[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx] = record;
      } else {
        list.unshift(record);
      }
      safeStorage.setItem(LOCAL_SAVED_ADVENTURES_KEY, JSON.stringify(list));
    } catch (e) {}

    return { success: true, adventure: record };
  }

  /**
   * Delete a saved adventure
   */
  public static async deleteAdventure(
    user: UserProfile | null,
    guestId: string,
    adventureId: string
  ): Promise<boolean> {
    const targetUid = auth.currentUser?.uid || user?.uid;
    if (targetUid) {
      try {
        await deleteDoc(doc(db, 'users', targetUid, 'adventures', adventureId));
      } catch (err) {
        console.error('Error deleting from firestore by doc id:', err);
      }

      // Also query by id field in case document id in Firestore was generated differently
      try {
        const userAdventuresRef = collection(db, 'users', targetUid, 'adventures');
        const q = query(userAdventuresRef, where('id', '==', adventureId));
        const snap = await getDocs(q);
        for (const docMatch of snap.docs) {
          if (docMatch.id !== adventureId) {
            await deleteDoc(docMatch.ref);
          }
        }
      } catch (qErr) {
        console.warn('Error querying matching adventure doc for deletion:', qErr);
      }
    }

    try {
      const raw = safeStorage.getItem(LOCAL_SAVED_ADVENTURES_KEY);
      if (raw) {
        const list: SavedAdventure[] = JSON.parse(raw);
        const filtered = list.filter(a => a.id !== adventureId && (a as any)._id !== adventureId);
        safeStorage.setItem(LOCAL_SAVED_ADVENTURES_KEY, JSON.stringify(filtered));
      }
    } catch (e) {}

    return true;
  }

  /**
   * Post adventure to Community Adventures
   * Free tier can post at least 1 community adventure slot.
   * Paid tiers ($4.99/mo+), granted users, admins, and mods get multiple/unlimited posts.
   */
  public static async postToCommunity(
    user: UserProfile | null,
    postData: {
      title: string;
      shareType: CommunityShareType;
      startingPrompt: string;
      initialAiGeneration: string;
      narrative?: NarrativeEntry[];
      files?: Record<string, string>;
    }
  ): Promise<{ success: boolean; reason?: 'tier_limit' | 'not_logged_in' | 'error'; message?: string }> {
    if (!user) {
      return {
        success: false,
        reason: 'not_logged_in',
        message: 'You must be logged into an account to post to Community Adventures.'
      };
    }

    const tier = user.tier || 'free';
    const hasUnlimitedPosts =
      tier === 'adventurer' ||
      tier === 'legendary' ||
      tier === 'celestial' ||
      Boolean(user.canPostCommunityAdventures) ||
      user.role === 'admin' ||
      user.role === 'mod';

    // If free tier, enforce max 1 posted adventure
    if (!hasUnlimitedPosts) {
      try {
        const allPosts = await this.getCommunityAdventures();
        const userPosts = allPosts.filter(p => p.authorId === user.uid || p.authorName.toLowerCase() === user.username.toLowerCase());
        if (userPosts.length >= 1) {
          return {
            success: false,
            reason: 'tier_limit',
            message: 'Free tier adventurers can have a maximum of 1 active posted adventure in Community Adventures. Delete your existing post or upgrade to an Adventurer subscription for unlimited community posts!'
          };
        }
      } catch (e) {
        console.warn('Could not check existing community posts count:', e);
      }
    }

    try {
      const id = 'comm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const communityDoc: CommunityAdventure = {
        id,
        authorId: user.uid,
        authorName: user.username,
        authorTier: tier,
        title: postData.title.trim(),
        shareType: postData.shareType,
        startingPrompt: postData.startingPrompt,
        initialAiGeneration: postData.initialAiGeneration,
        narrative: postData.shareType === 'full' ? postData.narrative : undefined,
        files: postData.shareType === 'full' ? postData.files : undefined,
        likesCount: 0,
        likedBy: [],
        comments: [],
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'community_adventures', id), communityDoc);
      return { success: true };
    } catch (err: any) {
      console.error('Error posting to community:', err);
      return { success: false, reason: 'error', message: err.message || 'Failed to post adventure.' };
    }
  }

  /**
   * Fetch public community adventures
   */
  public static async getCommunityAdventures(): Promise<CommunityAdventure[]> {
    try {
      const commRef = collection(db, 'community_adventures');
      const q = query(commRef, orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      const list: CommunityAdventure[] = [];
      snap.forEach((d) => {
        const data = d.data() as CommunityAdventure;
        list.push({
          ...data,
          likesCount: Array.isArray(data.likedBy) ? data.likedBy.length : (data.likesCount || 0),
          likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
          comments: Array.isArray(data.comments) ? data.comments : []
        });
      });
      return list;
    } catch (err) {
      console.error('Failed to load community adventures from Firestore:', err);
      return [];
    }
  }

  /**
   * Toggle Like on a Community Adventure
   * Rules: Users cannot like their own adventures!
   */
  public static async toggleLikeCommunityAdventure(
    adventureId: string,
    user: UserProfile | null
  ): Promise<{ success: boolean; isLiked?: boolean; likesCount?: number; message?: string }> {
    if (!user) {
      return { success: false, message: 'Please log in to like community adventures.' };
    }

    try {
      const postRef = doc(db, 'community_adventures', adventureId);
      const snap = await getDoc(postRef);
      if (!snap.exists()) {
        return { success: false, message: 'Adventure not found.' };
      }

      const data = snap.data() as CommunityAdventure;
      const myId = user.uid;
      const myUsername = user.username.trim().toLowerCase();
      const isAuthor = (data.authorId === myId) || (data.authorName && data.authorName.trim().toLowerCase() === myUsername);

      if (isAuthor) {
        return { success: false, message: 'You cannot like your own community adventure!' };
      }

      let currentLikedBy: string[] = Array.isArray(data.likedBy) ? [...data.likedBy] : [];
      const alreadyLiked = currentLikedBy.includes(myId);

      if (alreadyLiked) {
        currentLikedBy = currentLikedBy.filter(id => id !== myId);
      } else {
        currentLikedBy.push(myId);
      }

      const newLikesCount = currentLikedBy.length;
      await setDoc(postRef, { likedBy: currentLikedBy, likesCount: newLikesCount }, { merge: true });

      return {
        success: true,
        isLiked: !alreadyLiked,
        likesCount: newLikesCount
      };
    } catch (err: any) {
      console.error('Error toggling like:', err);
      return { success: false, message: err?.message || 'Failed to update like.' };
    }
  }

  /**
   * Add a Comment to a Community Adventure
   */
  public static async addCommunityComment(
    adventureId: string,
    user: UserProfile | null,
    text: string
  ): Promise<{ success: boolean; comment?: CommunityComment; message?: string }> {
    if (!user) {
      return { success: false, message: 'Please log in to comment on community adventures.' };
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return { success: false, message: 'Comment cannot be empty.' };
    }

    try {
      const postRef = doc(db, 'community_adventures', adventureId);
      const snap = await getDoc(postRef);
      if (!snap.exists()) {
        return { success: false, message: 'Adventure not found.' };
      }

      const data = snap.data() as CommunityAdventure;
      const currentComments: CommunityComment[] = Array.isArray(data.comments) ? [...data.comments] : [];

      const newComment: CommunityComment = {
        id: 'comm_msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        authorId: user.uid,
        authorName: user.username,
        authorTier: user.tier || 'free',
        text: trimmed,
        createdAt: new Date().toISOString()
      };

      currentComments.push(newComment);
      await setDoc(postRef, { comments: currentComments }, { merge: true });

      return { success: true, comment: newComment };
    } catch (err: any) {
      console.error('Error adding community comment:', err);
      return { success: false, message: err?.message || 'Failed to add comment.' };
    }
  }

  /**
   * Delete a Comment from a Community Adventure
   * Rules: Only comment author, mod, or admin can delete
   */
  public static async deleteCommunityComment(
    adventureId: string,
    commentId: string,
    user: UserProfile | null
  ): Promise<{ success: boolean; message?: string }> {
    if (!user) {
      return { success: false, message: 'Authentication required.' };
    }

    try {
      const postRef = doc(db, 'community_adventures', adventureId);
      const snap = await getDoc(postRef);
      if (!snap.exists()) {
        return { success: false, message: 'Adventure not found.' };
      }

      const data = snap.data() as CommunityAdventure;
      const currentComments: CommunityComment[] = Array.isArray(data.comments) ? [...data.comments] : [];
      const targetComment = currentComments.find(c => c.id === commentId);

      if (!targetComment) {
        return { success: false, message: 'Comment not found.' };
      }

      const isAuthor = targetComment.authorId === user.uid;
      const isStaff = user.role === 'admin' || user.role === 'mod';

      if (!isAuthor && !isStaff) {
        return { success: false, message: 'You do not have permission to delete this comment.' };
      }

      const filtered = currentComments.filter(c => c.id !== commentId);
      await setDoc(postRef, { comments: filtered }, { merge: true });

      return { success: true };
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      return { success: false, message: err?.message || 'Failed to delete comment.' };
    }
  }

  /**
   * Delete a post from community adventures (Admins, Mods, or original author)
   */
  public static async deleteCommunityAdventure(
    adventureId: string,
    user: UserProfile | null
  ): Promise<{ success: boolean; message?: string }> {
    if (!user) {
      return { success: false, message: 'Authentication required.' };
    }
    const isAdmin = user.role === 'admin' || isDefaultAdmin(user.email, user.username);
    const isMod = user.role === 'mod';

    try {
      const postRef = doc(db, 'community_adventures', adventureId);
      const snap = await getDoc(postRef);
      if (!snap.exists()) {
        return { success: false, message: 'Adventure not found.' };
      }
      const data = snap.data() as CommunityAdventure;
      const isAuthor = data.authorId === user.uid;

      if (!isAdmin && !isMod && !isAuthor) {
        return { success: false, message: 'You do not have permission to delete this community adventure.' };
      }

      await deleteDoc(postRef);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to delete community adventure:', err);
      return { success: false, message: err.message || 'Failed to delete community adventure.' };
    }
  }
}
