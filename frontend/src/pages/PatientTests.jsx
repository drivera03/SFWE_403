import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPatient } from '../services/api';
import { getPatientTests, createLabTest } from '../services/tests';

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function PatientTests() {
  const params = useParams();
  const patientId = params.patientId || params.id;

  const [patient, setPatient] = useState(null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Create Test Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTestName, setNewTestName] = useState('');
  const [newTestStatus, setNewTestStatus] = useState('pending');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        setError(null);
        const [patientData, testsData] = await Promise.all([
          getPatient(patientId),
          getPatientTests(patientId),
        ]);
        if (!ignore) {
          setPatient(patientData);
          setTests(testsData);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.response?.data?.detail || err.message || 'Failed to load test data.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [patientId, reloadKey]);

  const handleCreateTest = async (e) => {
    e.preventDefault();
    if (!newTestName.trim()) {
      setModalError('Test name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      const created = await createLabTest(patientId, {
        test_name: newTestName.trim(),
        status: newTestStatus,
      });

      setTests((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewTestName('');
      setNewTestStatus('pending');
      setSuccessBanner(`Test "${created.test_name}" ordered successfully.`);
      setTimeout(() => setSuccessBanner(''), 4000);
    } catch (err) {
      setModalError(err.response?.data?.detail || err.message || 'Failed to order lab test.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter tests based on search and status
  const filteredTests = tests.filter((test) => {
    const matchesName = test.test_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      selectedStatus === 'all' ||
      test.status.toLowerCase() === selectedStatus.toLowerCase();
    return matchesName && matchesStatus;
  });

  const getStatusClass = (status) => {
    const s = (status || '').toLowerCase().replace('-', '_');
    if (s === 'completed') return 'status-completed';
    if (s === 'in_progress') return 'status-in_progress';
    if (s === 'pending') return 'status-pending';
    return 'status-pending';
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-card">
          <div className="spinner-large" />
          <p className="loading-text">Loading patient tests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="error-card">
          <h2 className="error-title">Unable to Load Tests</h2>
          <p className="error-desc">{error}</p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
            >
              Retry Connection
            </button>
            <Link to={`/patients/${patientId}`} className="btn btn-primary">
              ← Return to Patient
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const patientDisplayName = patient?.name || `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || `Patient #${patientId}`;

  return (
    <div className="page-container">
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb-bar">
        <Link to="/patients" className="breadcrumb-link">
          Patients
        </Link>
        <span className="breadcrumb-separator">/</span>
        <Link to={`/patients/${patientId}`} className="breadcrumb-link">
          {patientDisplayName}
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Tests</span>
      </div>

      {successBanner && (
        <div className="alert alert-success" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="alert-icon">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successBanner}</span>
        </div>
      )}

      {/* Header Card */}
      <div className="detail-header-card">
        <div className="header-meta">
          <div className="patient-avatar-large">
            {patientDisplayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="header-text-block">
            <div className="header-title-row">
              <h1 className="patient-full-name">Lab Tests</h1>
              <span className="badge badge-id">Patient #{patientId}</span>
              <span className="badge badge-neutral">{tests.length} Total Test{tests.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="patient-sub-meta">
              Patient: <strong>{patientDisplayName}</strong> • Scoped test management & history
            </p>
          </div>
        </div>

        <div className="header-actions-group">
          <Link
            to={`/patients/${patientId}/tests/new`}
            className="btn btn-primary btn-icon-gap"
            id="test-intake-form-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            + Test Intake Form
          </Link>
          <button
            type="button"
            className="btn btn-secondary btn-icon-gap"
            onClick={() => {
              setModalError('');
              setShowCreateModal(true);
            }}
            id="order-test-btn"
          >
            Quick Order
          </button>
          <Link to={`/patients/${patientId}`} className="btn btn-secondary">
            ← Patient Record
          </Link>
        </div>
      </div>

      {/* Search and Filter Toolbar */}
      <div className="search-filter-bar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="search-input-wrap" style={{ flex: '1', minWidth: '260px', maxWidth: '420px' }}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search test name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="status-filter" style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Status:
          </label>
          <select
            id="status-filter"
            className="form-input"
            style={{ width: 'auto', padding: '0.5rem 0.8rem', fontSize: '0.88rem' }}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tests Table */}
      {tests.length === 0 ? (
        <div className="not-found-card" style={{ marginTop: '1rem' }}>
          <div className="not-found-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="not-found-svg">
              <path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
              <path d="M5.52 16h12.96" />
            </svg>
          </div>
          <h2 className="not-found-title">No Lab Tests Found</h2>
          <p className="not-found-desc">
            No laboratory tests have been ordered for <strong>{patientDisplayName}</strong> yet.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setModalError('');
              setShowCreateModal(true);
            }}
          >
            + Order First Lab Test
          </button>
        </div>
      ) : filteredTests.length === 0 ? (
        <div className="not-found-card" style={{ marginTop: '1rem' }}>
          <h2 className="not-found-title">No Matching Tests</h2>
          <p className="not-found-desc">
            No tests match the current filter criteria.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearchTerm('');
              setSelectedStatus('all');
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="table-card">
          <table className="tests-table">
            <thead>
              <tr>
                <th>Test ID</th>
                <th>Test Name</th>
                <th>Status</th>
                <th>Date Ordered</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((test) => (
                <tr key={test.id}>
                  <td>
                    <span className="badge badge-id">#{test.id}</span>
                  </td>
                  <td>
                    <Link
                      to={`/patients/${patientId}/tests/${test.id}`}
                      className="patient-name-link font-semibold"
                    >
                      {test.test_name}
                    </Link>
                  </td>
                  <td>
                    <span className={`status-pill ${getStatusClass(test.status)}`}>
                      {test.status}
                    </span>
                  </td>
                  <td>
                    {test.created_at
                      ? new Date(test.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      to={`/patients/${patientId}/tests/${test.id}`}
                      className="btn btn-secondary btn-sm"
                      id={`view-test-${test.id}-btn`}
                    >
                      View Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Test Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ textAlign: 'left', maxWidth: '520px' }}>
            <h3 className="modal-title" style={{ textAlign: 'left' }}>Order Lab Test</h3>
            <p className="modal-description" style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
              Create a new laboratory test order for <strong>{patientDisplayName}</strong>.
            </p>

            {modalError && (
              <div className="modal-error-banner" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTest}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="new-test-name">
                  Test Name *
                </label>
                <input
                  id="new-test-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Complete Blood Count (CBC), Lipid Panel"
                  value={newTestName}
                  onChange={(e) => setNewTestName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="new-test-status">
                  Initial Status
                </label>
                <select
                  id="new-test-status"
                  className="form-input"
                  value={newTestStatus}
                  onChange={(e) => setNewTestStatus(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  id="submit-order-test-btn"
                >
                  {isSubmitting ? (
                    <span className="btn-spinner-content">
                      <span className="spinner-sm" /> Ordering...
                    </span>
                  ) : (
                    'Order Test'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
