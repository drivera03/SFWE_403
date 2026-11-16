import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getActivityLogs, getActivityLogActions, getActivityLogUsers } from '../services/activityLogs';
import { apiErrorMessage } from '../services/tests';

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;

const labelStyle = {
  fontSize: '0.82rem',
  color: 'var(--text-dim)',
  fontWeight: 600,
  textTransform: 'uppercase',
};
const controlStyle = { width: 'auto', padding: '0.5rem 0.8rem', fontSize: '0.88rem' };

// "patient_created" -> "Patient created"
const formatAction = (action) => {
  const words = action.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const formatUser = (user) => user.username || user.email || `User #${user.id}`;

const formatDetails = (details) => {
  if (details === null || details === undefined || details === '') return '—';
  if (typeof details !== 'object') return String(details);
  return Object.entries(details)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${Array.isArray(value) ? value.join(', ') : value ?? '—'}`)
    .join(' • ');
};

const formatTimestamp = (timestamp) =>
  new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

export default function ActivityLogs() {
  const { currentUser } = useAuth();
  const isLabManager = currentUser?.role === 'lab_manager';

  // Filter controls
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);

  // Dropdown options
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);

  // Results. `key` records which request produced them, so while the current
  // filters' request is in flight the page is "loading" and shows the old rows dimmed.
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, logs: [], hasMore: false, error: '' });

  const rangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);
  const hasFilters = Boolean(search || action || userId || fromDate || toDate);

  const requestKey = JSON.stringify([debouncedSearch, action, userId, fromDate, toDate, page, reloadKey]);
  const loading = result.key !== requestKey;
  const { logs, hasMore } = result;
  const error = loading ? '' : result.error;

  // Wait for the user to stop typing before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Load dropdown options once.
  useEffect(() => {
    if (!isLabManager) return;
    let ignore = false;
    Promise.all([getActivityLogActions(), getActivityLogUsers()])
      .then(([actionList, userList]) => {
        if (!ignore) {
          setActions(actionList);
          setUsers(userList);
        }
      })
      .catch(() => {
        // The dropdowns just stay empty; the main list shows any real error.
      });
    return () => {
      ignore = true;
    };
  }, [isLabManager]);

  // Load log entries whenever a filter or the page changes.
  useEffect(() => {
    if (!isLabManager || rangeInvalid) return;
    const controller = new AbortController();

    // Ask for one extra row to know whether a next page exists.
    getActivityLogs(
      {
        search: debouncedSearch,
        action,
        user_id: userId,
        start_date: fromDate,
        end_date: toDate,
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      },
      controller.signal
    )
      .then((data) => {
        setResult({
          key: requestKey,
          logs: data.slice(0, PAGE_SIZE),
          hasMore: data.length > PAGE_SIZE,
          error: '',
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          logs: [],
          hasMore: false,
          error:
            err.response?.status === 403
              ? 'Only lab managers can view activity logs.'
              : apiErrorMessage(err, 'Failed to load activity logs.'),
        });
      });

    return () => controller.abort();
  }, [isLabManager, rangeInvalid, requestKey, debouncedSearch, action, userId, fromDate, toDate, page]);

  // Any filter change starts back at the first page.
  const updateFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(0);
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setAction('');
    setUserId('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  if (!isLabManager) {
    return (
      <div className="page-container">
        <div className="error-card">
          <h2 className="error-title">Access Restricted</h2>
          <p className="error-desc">Only lab managers can view activity logs.</p>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/patients" className="btn btn-primary">
              ← Back to Patients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="breadcrumb-bar">
        <Link to="/patients" className="breadcrumb-link">
          Patients
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Activity Logs</span>
      </div>

      {/* Header */}
      <div className="detail-header-card">
        <div className="header-meta">
          <div className="header-text-block">
            <div className="header-title-row">
              <h1 className="patient-full-name">Activity Logs</h1>
            </div>
            <p className="patient-sub-meta">
              Audit trail of user actions across the lab: patients, tests, inventory, and accounts.
            </p>
          </div>
        </div>
      </div>

      {/* Search and filters */}
      <div
        className="search-filter-bar"
        style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <div className="search-input-wrap" style={{ flex: '1', minWidth: '260px', maxWidth: '420px' }}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            id="activity-log-search"
            type="search"
            className="search-input"
            placeholder="Search actions, users, details..."
            aria-label="Search activity logs"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <label htmlFor="activity-log-action" style={labelStyle}>Action</label>
          <select
            id="activity-log-action"
            className="form-input"
            style={controlStyle}
            value={action}
            onChange={updateFilter(setAction)}
          >
            <option value="">All actions</option>
            {actions.map((name) => (
              <option key={name} value={name}>
                {formatAction(name)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <label htmlFor="activity-log-user" style={labelStyle}>User</label>
          <select
            id="activity-log-user"
            className="form-input"
            style={controlStyle}
            value={userId}
            onChange={updateFilter(setUserId)}
          >
            <option value="">All users</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {formatUser(user)} ({user.role})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <label htmlFor="activity-log-from" style={labelStyle}>From</label>
          <input
            id="activity-log-from"
            type="date"
            className="form-input"
            style={controlStyle}
            value={fromDate}
            max={toDate || undefined}
            onChange={updateFilter(setFromDate)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <label htmlFor="activity-log-to" style={labelStyle}>To</label>
          <input
            id="activity-log-to"
            type="date"
            className="form-input"
            style={controlStyle}
            value={toDate}
            min={fromDate || undefined}
            onChange={updateFilter(setToDate)}
          />
        </div>

        {hasFilters && (
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {rangeInvalid && (
        <p className="state-error" role="alert">
          The "From" date must be on or before the "To" date.
        </p>
      )}

      {/* Results */}
      {error ? (
        <div className="error-card">
          <h2 className="error-title">Unable to Load Activity Logs</h2>
          <p className="error-desc">{error}</p>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        </div>
      ) : !rangeInvalid && !loading && logs.length === 0 ? (
        <div className="not-found-card" style={{ marginTop: '1rem' }}>
          <h2 className="not-found-title">{hasFilters ? 'No Matching Entries' : 'No Activity Yet'}</h2>
          <p className="not-found-desc">
            {hasFilters
              ? 'No log entries match the current search and filters.'
              : 'Actions such as creating patients or tests will appear here.'}
          </p>
          {hasFilters && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : !rangeInvalid && (
        <>
          <div className="table-card tests-table-wrapper" aria-busy={loading}>
            <table className="tests-table" style={{ opacity: loading ? 0.6 : 1 }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                      Loading activity logs...
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatTimestamp(log.timestamp)}</td>
                      <td>
                        {log.user_id === null ? (
                          <span style={{ color: 'var(--text-dim)' }}>System</span>
                        ) : (
                          formatUser({ id: log.user_id, username: log.username, email: log.email })
                        )}
                      </td>
                      <td>
                        <span className="badge badge-neutral">{formatAction(log.action)}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {log.resource_type ? `${log.resource_type} #${log.resource_id ?? '—'}` : '—'}
                      </td>
                      <td style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        {formatDetails(log.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1rem',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
              {logs.length > 0 &&
                `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + logs.length}`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
