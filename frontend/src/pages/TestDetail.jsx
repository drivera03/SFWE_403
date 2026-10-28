import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getPatient } from '../services/api';
import { getLabTest, updateLabTest, deleteLabTest } from '../services/tests';

export default function TestDetail() {
  const params = useParams();
  const patientId = params.patientId || params.id;
  const testId = params.testId;
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Status update state
  const [currentStatus, setCurrentStatus] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState('');
  const [updateError, setUpdateError] = useState('');

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadTest() {
      try {
        setFetchError(null);
        setIsNotFound(false);

        const [patientData, testData] = await Promise.all([
          getPatient(patientId),
          getLabTest(patientId, testId),
        ]);

        if (!ignore) {
          setPatient(patientData);
          setTest(testData);
          setCurrentStatus(testData.status);
        }
      } catch (err) {
        if (!ignore) {
          if (err.response?.status === 404) {
            setIsNotFound(true);
          } else {
            setFetchError(err.response?.data?.detail || err.message || 'Failed to load lab test.');
          }
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadTest();
    return () => {
      ignore = true;
    };
  }, [patientId, testId, reloadKey]);

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (currentStatus === test?.status) return;

    try {
      setIsUpdating(true);
      setUpdateError('');
      const updated = await updateLabTest(patientId, testId, {
        status: currentStatus,
      });
      setTest(updated);
      setStatusSuccess(`Status successfully changed to "${updated.status}".`);
      setTimeout(() => setStatusSuccess(''), 4000);
    } catch (err) {
      setUpdateError(err.response?.data?.detail || err.message || 'Failed to update test status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setIsDeleting(true);
      setDeleteError('');
      await deleteLabTest(patientId, testId);
      setShowDeleteModal(false);
      navigate(`/patients/${patientId}/tests`);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Failed to delete lab test.');
    } finally {
      setIsDeleting(false);
    }
  };

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
          <p className="loading-text">Loading test details #{testId}...</p>
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="page-container">
        <div className="not-found-card">
          <div className="not-found-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="not-found-svg">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="not-found-title">Lab Test Not Found</h2>
          <p className="not-found-desc">
            No lab test exists with ID <strong>#{testId}</strong> for patient #{patientId}.
          </p>
          <div className="not-found-actions">
            <Link to={`/patients/${patientId}/tests`} className="btn btn-primary">
              ← Return to Patient Tests
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="page-container">
        <div className="error-card">
          <h2 className="error-title">Unable to Load Lab Test</h2>
          <p className="error-desc">{fetchError}</p>
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
            <Link to={`/patients/${patientId}/tests`} className="btn btn-primary">
              ← Return to Tests
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const patientDisplayName =
    patient?.name || `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || `Patient #${patientId}`;

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
        <Link to={`/patients/${patientId}/tests`} className="breadcrumb-link">
          Tests
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{test.test_name}</span>
      </div>

      {statusSuccess && (
        <div className="alert alert-success" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="alert-icon">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{statusSuccess}</span>
        </div>
      )}

      {/* Header Card */}
      <div className="detail-header-card">
        <div className="header-meta">
          <div
            className="patient-avatar-large"
            style={{
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.25)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '30px', height: '30px', color: '#fff' }}>
              <path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
              <path d="M5.52 16h12.96" />
            </svg>
          </div>
          <div className="header-text-block">
            <div className="header-title-row">
              <h1 className="patient-full-name">{test.test_name}</h1>
              <span className="badge badge-id">Test #{test.id}</span>
              <span className={`status-pill ${getStatusClass(test.status)}`}>
                {test.status}
              </span>
            </div>
            <p className="patient-sub-meta">
              Patient: <Link to={`/patients/${patientId}`} style={{ color: 'var(--primary)', fontWeight: '600' }}>{patientDisplayName}</Link> • Ordered: {new Date(test.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="header-actions-group">
          <button
            type="button"
            className="btn btn-danger btn-icon-gap"
            onClick={() => {
              setDeleteError('');
              setShowDeleteModal(true);
            }}
            id="delete-test-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            Delete Test
          </button>
          <Link to={`/patients/${patientId}/tests`} className="btn btn-secondary">
            ← All Tests
          </Link>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="details-grid-layout">
        {/* Test Information Card */}
        <section className="detail-card">
          <div className="card-header">
            <span className="card-icon-tag tag-purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
                <path d="M5.52 16h12.96" />
              </svg>
            </span>
            <h2 className="card-title">Test Details</h2>
          </div>

          <div className="info-fields-list">
            <div className="info-item">
              <span className="info-label">Test Identification</span>
              <span className="info-value text-highlight">{test.test_name}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Internal Test ID</span>
              <span className="info-value">
                <code className="policy-code">TEST-#{test.id}</code>
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Current Status</span>
              <div>
                <span className={`status-pill ${getStatusClass(test.status)}`} style={{ fontSize: '0.82rem', padding: '0.25rem 0.65rem' }}>
                  {test.status}
                </span>
              </div>
            </div>

            <div className="info-item">
              <span className="info-label">Date & Time Ordered</span>
              <span className="info-value">
                {new Date(test.created_at).toLocaleString('en-US', {
                  dateStyle: 'full',
                  timeStyle: 'medium',
                })}
              </span>
            </div>
          </div>
        </section>

        {/* Scoped Patient Card */}
        <section className="detail-card">
          <div className="card-header">
            <span className="card-icon-tag">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <h2 className="card-title">Patient Context</h2>
          </div>

          <div className="info-fields-list">
            <div className="info-item">
              <span className="info-label">Patient Name</span>
              <span className="info-value text-bold">
                <Link to={`/patients/${patientId}`} style={{ color: 'var(--primary)' }}>
                  {patientDisplayName} →
                </Link>
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Patient Record ID</span>
              <span className="info-value">
                <code className="policy-code">PATIENT-#{patientId}</code>
              </span>
            </div>

            {patient?.dob && (
              <div className="info-item">
                <span className="info-label">Date of Birth</span>
                <span className="info-value">{patient.dob}</span>
              </div>
            )}

            {patient?.phone && (
              <div className="info-item">
                <span className="info-label">Contact Phone</span>
                <span className="info-value">{patient.phone}</span>
              </div>
            )}

            {patient?.email && (
              <div className="info-item">
                <span className="info-label">Email Address</span>
                <span className="info-value">{patient.email}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Update Test Status Section */}
      <section className="detail-card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <span className="card-icon-tag tag-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </span>
          <h2 className="card-title">Manage Test Status</h2>
        </div>

        {updateError && (
          <div className="modal-error-banner" role="alert" style={{ marginBottom: '1.25rem' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{updateError}</span>
          </div>
        )}

        <form onSubmit={handleStatusUpdate} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '220px', maxWidth: '360px' }}>
            <label className="form-label" htmlFor="update-status-select">
              Update Status Workflow
            </label>
            <select
              id="update-status-select"
              className="form-input"
              value={currentStatus}
              onChange={(e) => setCurrentStatus(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isUpdating || currentStatus === test.status}
            id="save-status-btn"
          >
            {isUpdating ? (
              <span className="btn-spinner-content">
                <span className="spinner-sm" /> Saving...
              </span>
            ) : (
              'Save Status'
            )}
          </button>
        </form>
      </section>

      {/* Delete Test Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon-wrapper danger-pulse">
              <svg
                className="modal-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <h3 className="modal-title">Delete Lab Test</h3>
            <p className="modal-description">
              Are you sure you want to delete <strong>"{test.test_name}"</strong> (ID: #{test.id}) for {patientDisplayName}?
            </p>

            <div className="modal-warning-box">
              <svg className="warning-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>This action is permanent and will remove this lab test order from the system.</span>
            </div>

            {deleteError && (
              <div className="modal-error-banner" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{deleteError}</span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                id="confirm-delete-test-btn"
              >
                {isDeleting ? (
                  <span className="btn-spinner-content">
                    <span className="spinner-sm" /> Deleting...
                  </span>
                ) : (
                  'Confirm Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
