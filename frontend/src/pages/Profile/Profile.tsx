import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ImagePlus, Link2, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import Lightbox from '../../components/Lightbox/Lightbox';
import type { Profile } from '../../lib/supabaseClient';
import { usePostList } from '../../lib/usePostList';
import LoadMore from '../../components/LoadMore/LoadMore';
import PostCard from '../../components/PostCard/PostCard';
import ComposePost from '../../components/ComposePost/ComposePost';
import EmptyState from '../../components/EmptyState/EmptyState';
import FollowersModal from '../../components/FollowersModal/FollowersModal';
import { usePageTitle } from '../../lib/usePageTitle';
import { displayName } from '../../lib/names';
import { pruneFolder } from '../../lib/storage';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import './Profile.css';

type ProfilePageProps = {
  currentUserId: string | null;
  isAdmin: boolean;
};

export default function ProfilePage({ currentUserId, isAdmin }: ProfilePageProps) {
  const { userId } = useParams<{ userId: string }>();
  const { startDm } = useChat();
  const toast = useToast();
  const [messageLoading, setMessageLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);

  /* Avatar state */
  const [avatarMode, setAvatarMode] = useState<'file' | 'url'>('file');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = currentUserId === userId;
  /* Paged through fetch_posts; the stat below is a real count, not the page length */
  const { posts, loading: postsLoading, loadingMore, hasMore, loadMore, prepend, remove } = usePostList({ author: userId }, 0, !!userId);

  usePageTitle(profile ? `@${profile.username}` : 'Profile');

  /* App remounts this page per path, so state starts fresh for every profile.
     The cancelled flag covers the remaining case: a response landing after
     StrictMode's double-invoke or a userId swap. */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (cancelled) return;
      if (data) {
        setProfile(data);
        setEditBio(data.bio || '');
        setEditUsername(data.username);
        setEditDisplayName(data.display_name || '');
      }
      setLoading(false);
    })();

    (async () => {
      const { count } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId);
      if (cancelled) return;
      setPostCount(count ?? 0);
    })();

    (async () => {
      const [{ count: frs }, { count: fng }] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      ]);
      if (cancelled) return;
      setFollowersCount(frs || 0);
      setFollowingCount(fng || 0);

      if (currentUserId && currentUserId !== userId) {
        const { data } = await supabase
          .from('follows').select('id')
          .eq('follower_id', currentUserId)
          .eq('following_id', userId)
          .maybeSingle();
        if (cancelled) return;
        setIsFollowing(!!data);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, currentUserId]);

  const handleFollow = async () => {
    if (!currentUserId || !userId || followLoading) return;
    setFollowLoading(true);

    if (isFollowing) {
      const { error } = await supabase.from('follows').delete()
        .eq('follower_id', currentUserId).eq('following_id', userId);
      if (error) {
        toast.error(describeError(error, 'Could not unfollow. Please try again.'));
      } else {
        setIsFollowing(false);
        setFollowersCount((c) => c - 1);
      }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId });
      /* The bell notification is raised server-side by trg_notify_follow */
      if (error) {
        toast.error(describeError(error, 'Could not follow. Please try again.'));
      } else {
        setIsFollowing(true);
        setFollowersCount((c) => c + 1);
      }
    }
    setFollowLoading(false);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarUrl(e.target.value);
    setAvatarPreview(e.target.value || null);
  };

  const handleAvatarSave = async () => {
    if (!currentUserId || avatarUploading) return;
    setAvatarUploading(true);

    let finalUrl: string | null = null;
    /* The file just uploaded, so the cleanup below spares it */
    let uploadedName: string | undefined;

    if (avatarMode === 'file' && avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      uploadedName = `avatar.${ext}`;
      const path = `${currentUserId}/${uploadedName}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(path, avatarFile, { upsert: true });
      if (uploadError) {
        toast.error(describeError(uploadError, 'Could not upload the photo. Images only, up to 5 MB.'));
        setAvatarUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      finalUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    } else if (avatarMode === 'url' && avatarUrl.trim()) {
      /* Only http(s) may land in an img src */
      if (!/^https?:\/\//i.test(avatarUrl.trim())) {
        toast.error('Enter a full image link starting with https://');
        setAvatarUploading(false);
        return;
      }
      finalUrl = avatarUrl.trim();
    }

    if (finalUrl) {
      const { error } = await supabase.from('profiles')
        .update({ avatar_url: finalUrl }).eq('id', currentUserId);
      if (error) {
        toast.error(describeError(error, 'Could not save your photo. Please try again.'));
      } else {
        setProfile((p) => p ? { ...p, avatar_url: finalUrl } : p);
        setAvatarFile(null);
        setAvatarUrl('');
        setAvatarPreview(null);
        toast.success('Profile photo updated');
        /* upsert only overwrites the same extension; older uploads with other
           extensions, or all of them once a link replaces the upload, go now */
        void pruneFolder('avatars', currentUserId, uploadedName);
      }
    }
    setAvatarUploading(false);
  };

  const handleSaveProfile = async () => {
    if (!currentUserId) return;
    const username = editUsername.trim().toLowerCase();
    /* Same rule as Register and the DB CHECK: 3-30 chars, a-z 0-9 _ */
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setSaveError('Username must be 3 to 30 characters: letters, numbers and underscores only.');
      return;
    }
    setSaveError('');
    setSaveLoading(true);
    const display_name = editDisplayName.trim() || null;
    const { error } = await supabase.from('profiles')
      .update({ bio: editBio, username, display_name }).eq('id', currentUserId);
    if (error) {
      setSaveError(error.code === '23505' ? 'That username is already taken.' : 'Could not save your profile. Please try again.');
    } else {
      setProfile((p) => p ? { ...p, bio: editBio, username, display_name } : p);
      setEditing(false);
      toast.success('Profile saved');
    }
    setSaveLoading(false);
  };

  const handleDelete = (postId: string) => {
    remove(postId);
    setPostCount((c) => (c === null ? c : Math.max(0, c - 1)));
  };

  /* Open (or create) a DM with this user */
  const handleMessage = async () => {
    if (!userId || messageLoading) return;
    setMessageLoading(true);
    const id = await startDm(userId);
    if (!id) toast.error('Could not open a chat with this user.');
    setMessageLoading(false);
  };

  /* Skeleton loading state */
  if (loading) return (
    <div className="profile-page">
      <div className="profile-inner">
        <div className="profile-skeleton">
          <div className="skeleton-avatar" />
          <div className="skeleton-info">
            <div className="skeleton-line wide" />
            <div className="skeleton-line medium" />
            <div className="skeleton-stats">
              <div className="skeleton-line short" />
              <div className="skeleton-line short" />
              <div className="skeleton-line short" />
            </div>
          </div>
        </div>
        <hr className="divider" />
        <div className="skeleton-posts">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-post-card">
              <div className="skeleton-line short" />
              <div className="skeleton-line wide" />
              <div className="skeleton-line medium" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="profile-page">
      <div className="profile-inner">
        <EmptyState icon="search" title="User not found" subtitle="This profile doesn't exist or may have been removed." />
      </div>
    </div>
  );

  return (
    <div className="profile-page">
      {/* Avatar lightbox */}
      {showAvatarLightbox && profile.avatar_url && (
        <Lightbox images={[profile.avatar_url]} onClose={() => setShowAvatarLightbox(false)} />
      )}

      <div className="profile-inner">
        <header className="profile-header">
          <div className="profile-avatar-section">
            {/* Clickable avatar */}
            <div
              className={`profile-avatar-lg ${profile.avatar_url ? 'profile-avatar-lg--clickable' : ''}`}
              onClick={() => profile.avatar_url && setShowAvatarLightbox(true)}
            >
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt={profile.username} loading="lazy" />
                : <span>{(profile.username[0] || '?').toUpperCase()}</span>
              }
            </div>

            {/* Avatar edit — own profile only */}
            {isOwnProfile && editing && (
              <div className="avatar-edit">
                <div className="avatar-mode-tabs">
                  <button
                    type="button"
                    className={`avatar-mode-tab ${avatarMode === 'file' ? 'active' : ''}`}
                    onClick={() => setAvatarMode('file')}
                  >
                    <ImagePlus size={13} /> Upload
                  </button>
                  <button
                    type="button"
                    className={`avatar-mode-tab ${avatarMode === 'url' ? 'active' : ''}`}
                    onClick={() => setAvatarMode('url')}
                  >
                    <Link2 size={13} /> URL
                  </button>
                </div>

                {avatarMode === 'file' ? (
                  <div className="avatar-file-area" onClick={() => avatarInputRef.current?.click()}>
                    <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarFileChange} style={{ display: 'none' }} />
                    <span>{avatarFile ? avatarFile.name : 'Choose photo…'}</span>
                  </div>
                ) : (
                  <input
                    type="url"
                    className="avatar-url-input"
                    placeholder="Paste image URL…"
                    value={avatarUrl}
                    onChange={handleAvatarUrlChange}
                  />
                )}

                {avatarPreview && (
                  <div className="avatar-preview">
                    <img src={avatarPreview} alt="Preview" onError={() => setAvatarPreview(null)} />
                  </div>
                )}

                {(avatarFile || avatarUrl) && (
                  <button className="btn-primary avatar-save-btn" onClick={handleAvatarSave} disabled={avatarUploading}>
                    {avatarUploading ? 'Saving…' : 'Save Photo'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="profile-info">
            {editing ? (
              <div className="profile-edit-form">
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Display name (optional)"
                  maxLength={40}
                  className="edit-input"
                />
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="Username"
                  maxLength={30}
                  className="edit-input"
                />
                <span className="edit-hint">Your handle: lowercase letters, numbers and underscores, 3 to 30 characters.</span>
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Write a short bio…" maxLength={200} className="edit-bio" rows={3} />
                <div className="edit-actions">
                  <button className="btn-primary" onClick={handleSaveProfile} disabled={saveLoading}>
                    {saveLoading ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn-ghost" onClick={() => { setEditing(false); setSaveError(''); }}>Cancel</button>
                </div>
                {saveError && <p className="edit-error">{saveError}</p>}
              </div>
            ) : (
              <>
                <h1 className="profile-username">{displayName(profile)}</h1>
                {profile.display_name && <p className="profile-handle">@{profile.username}</p>}
                <p className="profile-bio">{profile.bio || <em>No bio yet.</em>}</p>
              </>
            )}

            <div className="profile-stats">
              <div className="stat">
                <span className="stat-count">{postCount ?? posts.length}</span>
                <span className="stat-label">Posts</span>
              </div>
              <button
                className="stat stat--clickable"
                onClick={() => setFollowModal('followers')}
              >
                <span className="stat-count">{followersCount}</span>
                <span className="stat-label">Followers</span>
              </button>
              <button
                className="stat stat--clickable"
                onClick={() => setFollowModal('following')}
              >
                <span className="stat-count">{followingCount}</span>
                <span className="stat-label">Following</span>
              </button>
            </div>

            <div className="profile-actions">
              {isOwnProfile && !editing && (
                <button className="btn-ghost" onClick={() => setEditing(true)}>Edit Profile</button>
              )}
              {!isOwnProfile && currentUserId && (
                <button
                  className={isFollowing ? 'btn-ghost' : 'btn-primary'}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? '…' : isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              )}
              {/* Message button — other people's profiles only */}
              {!isOwnProfile && currentUserId && (
                <button className="btn-ghost profile-message-btn" onClick={handleMessage} disabled={messageLoading}>
                  <MessageCircle size={14} /> {messageLoading ? 'Opening…' : 'Message'}
                </button>
              )}
            </div>
          </div>
        </header>

        <hr className="divider" />

        <section className="profile-posts">
          {/* Your own profile doubles as a place to publish from */}
          {isOwnProfile && currentUserId && (
            <ComposePost userId={currentUserId} onPosted={(post) => { prepend(post); setPostCount((c) => (c === null ? c : c + 1)); }} />
          )}
          <h2 className="profile-posts-title">Posts</h2>
          {postsLoading ? (
            <div className="skeleton-posts">
              {[1, 2].map((i) => (
                <div key={i} className="skeleton-post-card">
                  <div className="skeleton-line short" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line medium" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon="pen"
              title="No posts yet"
              subtitle={isOwnProfile ? "Share something with the world." : "This user hasn't posted anything yet."}
            />
          ) : (
            <>
              <div className="posts-list">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} currentUserId={currentUserId} isAdmin={isAdmin} onDelete={handleDelete} />
                ))}
              </div>
              <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} endLabel="No more posts" />
            </>
          )}
        </section>
        {followModal && userId && (
          <FollowersModal
            userId={userId}
            type={followModal}
            onClose={() => setFollowModal(null)}
          />
        )}
      </div>
    </div>
  );
}
