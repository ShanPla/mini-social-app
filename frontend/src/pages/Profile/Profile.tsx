import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile, Post } from '../../lib/supabaseClient';
import PostCard from '../../components/PostCard';
import './Profile.css';

type ProfilePageProps = {
  currentUserId: string | null;
};

export default function ProfilePage({ currentUserId }: ProfilePageProps) {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editUsername, setEditUsername] = useState('');

  // Avatar state
  const [avatarMode, setAvatarMode] = useState<'file' | 'url'>('file');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = currentUserId === userId;

  useEffect(() => {
    if (userId) {
      fetchProfile();
      fetchPosts();
      fetchFollowData();
    }
  }, [userId, currentUserId]);

  const fetchProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      setEditBio(data.bio || '');
      setEditUsername(data.username);
    }
    setLoading(false);
  };

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setPosts((data as Post[]) || []);
  };

  const fetchFollowData = async () => {
    const [{ count: frs }, { count: fng }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
    ]);
    setFollowersCount(frs || 0);
    setFollowingCount(fng || 0);

    if (currentUserId && currentUserId !== userId) {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', userId)
        .maybeSingle();
      setIsFollowing(!!data);
    }
  };

  const handleFollow = async () => {
    if (!currentUserId || !userId) return;
    if (isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', userId);
      setIsFollowing(false);
      setFollowersCount((c) => c - 1);
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId });
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);

      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: currentUserId,
        type: 'follow',
        post_id: null,
      });
    }
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

    if (avatarMode === 'file' && avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${currentUserId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(path);
        // Cache bust so the new image shows immediately
        finalUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      }
    } else if (avatarMode === 'url' && avatarUrl.trim()) {
      finalUrl = avatarUrl.trim();
    }

    if (finalUrl) {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: finalUrl })
        .eq('id', currentUserId);

      if (!error) {
        setProfile((p) => p ? { ...p, avatar_url: finalUrl } : p);
        setAvatarFile(null);
        setAvatarUrl('');
        setAvatarPreview(null);
      }
    }

    setAvatarUploading(false);
  };

  const handleSaveProfile = async () => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ bio: editBio, username: editUsername })
      .eq('id', currentUserId);
    if (!error) {
      setProfile((p) => p ? { ...p, bio: editBio, username: editUsername } : p);
      setEditing(false);
    }
  };

  const handleDelete = (postId: string) => setPosts(posts.filter((p) => p.id !== postId));

  if (loading) return (
    <div className="profile-loading">
      <div className="loading-spinner">✦</div>
    </div>
  );

  if (!profile) return <div className="profile-not-found">User not found.</div>;

  return (
    <div className="profile-page">
      <div className="profile-inner">
        <header className="profile-header">

          {/* Avatar */}
          <div className="profile-avatar-section">
            <div className="profile-avatar-lg">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} />
              ) : (
                <span>{profile.username[0].toUpperCase()}</span>
              )}
            </div>

            {/* Avatar edit — only own profile */}
            {isOwnProfile && editing && (
              <div className="avatar-edit">
                <div className="avatar-mode-tabs">
                  <button
                    type="button"
                    className={`avatar-mode-tab ${avatarMode === 'file' ? 'active' : ''}`}
                    onClick={() => setAvatarMode('file')}
                  >
                    📁 Upload
                  </button>
                  <button
                    type="button"
                    className={`avatar-mode-tab ${avatarMode === 'url' ? 'active' : ''}`}
                    onClick={() => setAvatarMode('url')}
                  >
                    🔗 URL
                  </button>
                </div>

                {avatarMode === 'file' ? (
                  <div
                    className="avatar-file-area"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      style={{ display: 'none' }}
                    />
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
                  <button
                    className="btn-primary avatar-save-btn"
                    onClick={handleAvatarSave}
                    disabled={avatarUploading}
                  >
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
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Username"
                  className="edit-input"
                />
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Write a short bio…"
                  maxLength={200}
                  className="edit-bio"
                  rows={3}
                />
                <div className="edit-actions">
                  <button className="btn-primary" onClick={handleSaveProfile}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="profile-username">@{profile.username}</h1>
                <p className="profile-bio">{profile.bio || <em>No bio yet.</em>}</p>
              </>
            )}

            <div className="profile-stats">
              <div className="stat">
                <span className="stat-count">{posts.length}</span>
                <span className="stat-label">Posts</span>
              </div>
              <div className="stat">
                <span className="stat-count">{followersCount}</span>
                <span className="stat-label">Followers</span>
              </div>
              <div className="stat">
                <span className="stat-count">{followingCount}</span>
                <span className="stat-label">Following</span>
              </div>
            </div>

            <div className="profile-actions">
              {isOwnProfile && !editing && (
                <button className="btn-ghost" onClick={() => setEditing(true)}>Edit Profile</button>
              )}
              {!isOwnProfile && currentUserId && (
                <button
                  className={isFollowing ? 'btn-ghost' : 'btn-primary'}
                  onClick={handleFollow}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              )}
            </div>
          </div>
        </header>

        <hr className="divider" />

        <section className="profile-posts">
          <h2 className="profile-posts-title">Posts</h2>
          {posts.length === 0 ? (
            <p className="no-posts">No posts yet.</p>
          ) : (
            <div className="posts-list">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={currentUserId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
