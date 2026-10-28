import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getPatient, deletePatient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, canDeletePatient } = useAuth();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // Modal and deletion states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    fetchPatientData();
  }, [id]);

  const fetchPatientData = async () => {
    setLoading(true);
    setFetchError(null);
    setIsNotFound(false);
    try {
      const data = await getPatient(id);
      setPatient(data);
    } catch (err) {
      if (err.response?.status === 404) {
        setIsNotFound(true);
      } else {
        setFetchError(err.response?.data?.detail || err.message || 'Failed to load patient record.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deletePatient(id);
      setShowDeleteModal(false);
      setActionSuccess('Patient record deleted successfully. Redirecting to patient list...');
      setTimeout(() => {
        navigate('/patients');
      }, 1200);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.message ||
        'Failed to delete patient. Ensure all linked tests are resolved.';
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-card">
          <div className="spinner-large" />
          <p className="loading-text">Loading live patient record #{id}...</p>
        </div>
      </div>
    );
  }

  // Not Found State
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
          <h2 className="not-found-title">Patient Record Not Found</h2>
          <p className="not-found-desc">
            No patient record exists with ID <strong>#{id}</strong>. The record may have been deleted or the identifier is invalid.
          </p>
          <div className="not-found-actions">
            <Link to="/patients" className="btn btn-primary" id="return-patient-list-btn">
              ← Return to Patient List
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // General Fetch Error State
  if (fetchError) {
    return (
      <div className="page-container">
        <div className="error-card">
          <h2 className="error-title">Unable to Load Patient</h2>
          <p className="error-desc">{fetchError}</p>
          <button type="button" className="btn btn-secondary" onClick={fetchPatientData}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const hasLinkedTests = patient.tests && patient.tests.length > 0;
  const patientName = patient.name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || `Patient #${patient.id}`;

  return (
    <div className="page-container">
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb-bar">
        <Link to="/patients" className="breadcrumb-link">
          Patients
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{patientName}</span>
      </div>

      {actionSuccess && (
        <div className="alert alert-success" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="alert-icon">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Detail Header */}
      <div className="detail-header-card">
        <div className="header-meta">
          <div className="patient-avatar-large">
            {patientName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="header-text-block">
            <div className="header-title-row">
              <h1 className="patient-full-name">{patientName}</h1>
              <span className="badge badge-id">ID: #{patient.id}</span>
              {hasLinkedTests ? (
                <span className="badge badge-warning" title="Patient has linked laboratory tests">
                  {patient.tests.length} Linked Test(s)
                </span>
              ) : (
                <span className="badge badge-neutral">No Tests Linked</span>
              )}
            </div>
            <p className="patient-sub-meta">
              Registered Record • Last Updated: {new Date(patient.updated_at || patient.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Action Buttons: Edit Link & Conditional Delete */}
        <div className="header-actions-group">
          {/* Link to patient edit form (Task 2 criteria) */}
          <Link
            to={`/patients/${patient.id}/edit`}
            className="btn btn-secondary btn-icon-gap"
            id="edit-patient-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Record
          </Link>

          {/* Conditional Delete Button: Task 5 criteria */}
          {canDeletePatient() ? (
            <button
              type="button"
              className="btn btn-danger btn-icon-gap"
              id="delete-patient-btn"
              onClick={() => {
                setDeleteError('');
                setShowDeleteModal(true);
              }}
              title="Delete patient record (Lab Manager only)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Delete Patient
            </button>
          ) : (
            <span className="delete-restricted-hint" title="Delete restricted to Lab Manager">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="lock-icon">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Delete Restricted (Lab Manager Only)
            </span>
          )}
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="details-grid-layout">
        {/* Personal & Contact Information Card */}
        <section className="detail-card">
          <div className="card-header">
            <span className="card-icon-tag">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <h2 className="card-title">Demographics & Contact Details</h2>
          </div>

          <div className="info-fields-list">
            <div className="info-item">
              <span className="info-label">Full Legal Name</span>
              <span className="info-value text-highlight" id="patient-name-val">{patient.name}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Date of Birth (DOB)</span>
              <span className="info-value" id="patient-dob-val">
                {patient.dob}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Residential Address</span>
              <span className="info-value" id="patient-address-val">{patient.address}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Phone Number</span>
              <span className="info-value" id="patient-phone-val">{patient.phone}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Email Address</span>
              <span className="info-value" id="patient-email-val">
                <a href={`mailto:${patient.email}`} className="email-link">
                  {patient.email}
                </a>
              </span>
            </div>
          </div>
        </section>

        {/* Insurance Details Card (Task 2 criteria) */}
        <section className="detail-card">
          <div className="card-header">
            <span className="card-icon-tag tag-blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </span>
            <h2 className="card-title">Insurance Coverage</h2>
          </div>

          <div className="info-fields-list">
            <div className="info-item">
              <span className="info-label">Insurance Provider</span>
              <span className="info-value text-bold" id="patient-insurance-val">
                {patient.insurance_provider}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Policy / Member ID Number</span>
              <span className="info-value policy-code" id="patient-policy-val">
                {patient.policy_number}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Coverage Status</span>
              <span className="badge badge-success">Verified Active</span>
            </div>
          </div>
        </section>
      </div>

      {/* Linked Lab Tests Section */}
      <section className="detail-card section-tests">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="card-icon-tag tag-purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0" />
                <path d="M5.52 16h12.96" />
              </svg>
            </span>
            <h2 className="card-title">Linked Laboratory Tests ({patient.tests ? patient.tests.length : 0})</h2>
          </div>
          <Link to={`/patients/${patient.id}/tests`} className="btn btn-secondary btn-sm" id="view-all-tests-btn">
            Manage Tests →
          </Link>
        </div>

        {patient.tests && patient.tests.length > 0 ? (
          <div className="tests-table-wrapper">
            <table className="tests-table">
              <thead>
                <tr>
                  <th>Test ID</th>
                  <th>Test Name</th>
                  <th>Status</th>
                  <th>Order Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patient.tests.map((test) => (
                  <tr key={test.id}>
                    <td>#{test.id}</td>
                    <td className="font-semibold">
                      <Link to={`/patients/${patient.id}/tests/${test.id}`} className="patient-name-link">
                        {test.test_name}
                      </Link>
                    </td>
                    <td>
                      <span className={`status-pill status-${test.status.toLowerCase().replace('-', '_')}`}>
                        {test.status}
                      </span>
                    </td>
                    <td>{new Date(test.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/patients/${patient.id}/tests/${test.id}`} className="btn btn-secondary btn-sm">
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-tests-note">
            <p>No tests currently linked to this patient. Record is eligible for safe deletion.</p>
            <div style={{ marginTop: '0.85rem' }}>
              <Link to={`/patients/${patient.id}/tests`} className="btn btn-primary btn-sm">
                + Order First Test
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        patientName={patient.name}
        patientId={patient.id}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteModal(false);
          setDeleteError('');
        }}
      />
    </div>
  );
}
