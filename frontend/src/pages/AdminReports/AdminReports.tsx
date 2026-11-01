import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { timeAgo, fullDate, parseDbDate } from '../../lib/timeAgo';
import { displayName } from '../../lib/names';
import EmptyState from '../../components/EmptyState/EmptyState';
import LoadMore from '../../components/LoadMore/LoadMore';
import './AdminReports.css';

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: 'post' | 'comment' | 'user' | 'message';
  target_id: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type Report = ReportRow & {
  reporter: { id: string; username: string; display_name: string | null } | null;
  /* For a comment report: the post it sits on, when it could be looked up */
  post_id: string | null;
};

type Status = 'open' | 'resolved';

type Props = {
  userId: string;
};

const PAGE_SIZE = 20;
const COLUMNS = 'id, reporter_id, target_type, target_id, reason, created_at, resolved_at, resolved_by';

/* Newest first, by (created_at, id); the next page starts after the last row seen */
async function fetchReports(status: Status, before?: Report): Promise<{ rows: Report[]; hasMore: boolean; error: boolean }> {
  let q = supabase
    .from('reports')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);
  q = status === 'open' ? q.is('resolved_at', null) : q.not('resolved_at', 'is', null);
  if (before) {
    q = q.or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`);
  }
  const { data, error } = await q;
  if (error || !data) return { rows: [], hasMore: false, error: true };
  const all = data as ReportRow[];
  const page = all.slice(0, PAGE_SIZE);

  /* Names and comment-to-post links in two small lookups; a miss just shows less */
  const reporterIds = Array.from(new Set(page.map((r) => r.reporter_id)));
  const commentIds = page.filter((r) => r.target_type === 'comment').map((r) => r.target_id);
  const [reporters, comments] = await Promise.all([
    reporterIds.length
      ? supabase.from('profiles').select('id, username, display_name').in('id', reporterIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null }[] }),
    commentIds.length
      ? supabase.from('comments').select('id, post_id').in('id', commentIds)
      : Promise.resolve({ data: [] as { id: string; post_id: string }[] }),
  ]);
  const byUser = new Map((reporters.data || []).map((p) => [p.id, p]));
  const postOf = new Map((comments.data || []).map((c) => [c.id, c.post_id]));

  return {
    rows: page.map((r) => ({
      ...r,
      reporter: byUser.get(r.reporter_id) ?? null,
      post_id: r.target_type === 'comment' ? postOf.get(r.target_id) ?? null : null,
    })),
    hasMore: all.length > PAGE_SIZE,
    error: false,
  };
}

const TYPE_LABEL: Record<Report['target_type'], string> = {
  post: 'Post',
  comment: 'Comment',
  user: 'User',
  message: 'Message',
};

/* Where the report points, as a link when the app has a page for it */
function TargetLink({ report }: { report: Report }) {
  if (report.target_type === 'post') return <Link to={`/post/${report.target_id}`}>Open post</Link>;
  if (report.target_type === 'user') return <Link to={`/profile/${report.target_id}`}>Open profile</Link>;
  if (report.target_type === 'comment' && report.post_id) return <Link to={`/post/${report.post_id}`}>Open post with the comment</Link>;
  return <span className="admin-report-id">{report.target_type} id {report.target_id}</span>;
}

/* /admin/reports. App only renders this for admins; the database enforces it too. */
export default function AdminReports({ userId }: Props) {
  const [status, setStatus] = useState<Status>('open');
  const [reports, setReports] = useState<Report[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const key = `${status}:${version}`;
  const keyRef = useRef(key);
  const loading = loadedKey !== key;
  const tabsId = useId();
  const toast = useToast();

  usePageTitle('Reports');

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await fetchReports(status);
      if (cancelled) return;
      setReports(page.rows);
      setHasMore(page.hasMore);
      setMoreFailed(false);
      setLoadFailed(page.error);
      setLoadedKey(key);
    })();
    return () => { cancelled = true; };
  }, [status, key]);

  const loadMore = useCallback(async () => {
    const last = reports[reports.length - 1];
    if (!last || loadingMore || !hasMore) return;
    const startedFor = key;
    setLoadingMore(true);
    setMoreFailed(false);
    const page = await fetchReports(status, last);
    if (keyRef.current !== startedFor) { setLoadingMore(false); return; }
    if (page.error) { setMoreFailed(true); setLoadingMore(false); return; }
    setReports((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
    });
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }, [reports, loadingMore, hasMore, key, status]);

  const resolve = async (report: Report) => {
    if (resolving) return;
    setResolving(report.id);
    /* RLS refuses with no error and no rows for a non-admin, so count the rows back */
    const { data, error } = await supabase
      .from('reports')
      .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq('id', report.id)
      .select('id');
    if (error || !data || data.length === 0) {
      toast.error(describeError(error, 'Could not mark the report as resolved.'));
    } else {
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      toast.success('Report resolved');
    }
    setResolving(null);
  };

  const tabs: { id: Status; label: string }[] = [{ id: 'open', label: 'Open' }, { id: 'resolved', label: 'Resolved' }];

  return (
    <div className="admin-reports-page">
      <div className="admin-reports-inner">
        <header className="admin-reports-header">
          <Link to="/settings" className="admin-reports-back">← Back to settings</Link>
          <h1>Reports</h1>
          <p>What people flagged, newest first.</p>
        </header>

        <div className="admin-reports-tabs" role="group" aria-label="Report status">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`${tabsId}-${t.id}`}
              className={`admin-reports-tab ${status === t.id ? 'admin-reports-tab--on' : ''}`}
              aria-pressed={status === t.id}
              onClick={() => setStatus(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="admin-reports-note" role="status">Loading…</p>
        ) : loadFailed ? (
          <EmptyState
            icon="alert"
            title="Could not load the reports"
            subtitle="Check your connection and try again."
            action={<button type="button" className="btn-ghost" onClick={() => setVersion((v) => v + 1)}>Retry</button>}
          />
        ) : reports.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title={status === 'open' ? 'No open reports' : 'Nothing resolved yet'}
            subtitle={status === 'open' ? 'Everything that was flagged has been dealt with.' : 'Resolved reports show up here.'}
          />
        ) : (
          <>
            <ul className="admin-report-list">
              {reports.map((r) => (
                <li key={r.id} className="admin-report">
                  <div className="admin-report-top">
                    <span className="admin-report-type">{TYPE_LABEL[r.target_type]}</span>
                    <time
                      className="admin-report-time"
                      dateTime={parseDbDate(r.created_at).toISOString()}
                      title={fullDate(r.created_at)}
                    >{timeAgo(r.created_at)}</time>
                  </div>
                  <p className="admin-report-reason">{r.reason}</p>
                  <div className="admin-report-meta">
                    <span>
                      Reported by{' '}
                      {r.reporter
                        ? <Link to={`/profile/${r.reporter.id}`}>{displayName(r.reporter)}</Link>
                        : <em>a deleted account</em>}
                    </span>
                    <TargetLink report={r} />
                  </div>
                  {status === 'open' && (
                    <div className="admin-report-actions">
                      <button type="button" className="btn-ghost" onClick={() => resolve(r)} disabled={resolving === r.id}>
                        {resolving === r.id ? 'Saving…' : 'Mark resolved'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} failed={moreFailed} endLabel="No more reports" />
          </>
        )}
      </div>
    </div>
  );
}
