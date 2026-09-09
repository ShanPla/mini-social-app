import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { usePresence } from '../../context/PresenceContext';
import { WidgetAvatar } from '../SidebarWidget/SidebarWidget';
import { displayName } from '../../lib/names';
import './ProfileCard.css';

type Props = {
  userId: string;
};

type Counts = { posts: number; followers: number; following: number };

/* Mini profile card for the feed's left column */
export default function ProfileCard({ userId }: Props) {
  const { isOnline } = usePresence();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, posts, followers, following] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      ]);
      if (cancelled) return;
      if (data) setProfile(data as Profile);
      setCounts({
        posts: posts.count || 0,
        followers: followers.count || 0,
        following: following.count || 0,
      });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!profile) {
    return (
      <div className="profile-card profile-card--loading">
        <div className="profile-card-skeleton-avatar" />
        <div className="profile-card-skeleton-line" />
        <div className="profile-card-skeleton-line profile-card-skeleton-line--short" />
      </div>
    );
  }

  return (
    <div className="profile-card">
      <Link to={`/profile/${profile.id}`} className="profile-card-top">
        <WidgetAvatar username={profile.username} avatarUrl={profile.avatar_url} size={56} online={isOnline(profile.id)} />
        <span className="profile-card-name">{displayName(profile)}</span>
        {profile.display_name && <span className="profile-card-handle">@{profile.username}</span>}
      </Link>
      {profile.bio && <p className="profile-card-bio">{profile.bio}</p>}

      {/* Stats */}
      <div className="profile-card-stats">
        <Link to={`/profile/${profile.id}`} className="profile-card-stat">
          <strong>{counts?.posts ?? '–'}</strong><span>Posts</span>
        </Link>
        <Link to={`/profile/${profile.id}`} className="profile-card-stat">
          <strong>{counts?.followers ?? '–'}</strong><span>Followers</span>
        </Link>
        <Link to={`/profile/${profile.id}`} className="profile-card-stat">
          <strong>{counts?.following ?? '–'}</strong><span>Following</span>
        </Link>
      </div>

      <Link to={`/profile/${profile.id}`} className="profile-card-link">View profile →</Link>
    </div>
  );
}
