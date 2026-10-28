import { useEffect, useState, useTransition } from 'react';
import { Link } from 'react-router-dom';
import { getPatients, createPatient } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Roles permitted to create patients per CLMS MVP matrix
const CREATE_ROLES = [
  'lab_manager',
  'manager',
  'specimen_collector',
  'lab_technician',
  'technician',
  'cashier',
];

export default function PatientList() {
  const { currentUser } = useAuth() || {};
  const [, startTransition] = useTransition();

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Register Patient Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    sex: '',
    address: '',
    phone: '',
    email: '',
    insurance_provider: '',
    policy_number: '',
  });

  const userRole = (currentUser?.role || '').toLowerCase();
  // If role is set, check permissions; otherwise allow in test/demo mode
  const canCreate = !currentUser || CREATE_ROLES.includes(userRole);

  useEffect(() => {
    let ignore = false;
    async function loadPatients() {
      try {
        setError(null);
        const data = await getPatients();
        if (!ignore) {
          setPatients(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.response?.data?.detail || err.message || 'Failed to load patients');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadPatients();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setNewPatient((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegisterError('');

    if (!newPatient.first_name.trim() || !newPatient.last_name.trim() || !newPatient.date_of_birth) {
      setRegisterError('First name, last name, and date of birth are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        first_name: newPatient.first_name.trim(),
        last_name: newPatient.last_name.trim(),
        name: `${newPatient.first_name.trim()} ${newPatient.last_name.trim()}`,
        date_of_birth: newPatient.date_of_birth,
        dob: newPatient.date_of_birth,
        sex: newPatient.sex.trim() || null,
        address: newPatient.address.trim() || null,
        phone: newPatient.phone.trim() || null,
        email: newPatient.email.trim() || null,
        insurance_provider: newPatient.insurance_provider.trim() || null,
        policy_number: newPatient.policy_number.trim() || null,
      };

      const created = await createPatient(payload);

      setIsRegisterOpen(false);
      setNewPatient({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        sex: '',
        address: '',
        phone: '',
        email: '',
        insurance_provider: '',
        policy_number: '',
      });

      const registeredName =
        created.name || `${created.first_name || ''} ${created.last_name || ''}`.trim() || 'Patient';
      setSuccessBanner(`Patient "${registeredName}" registered successfully!`);
      setTimeout(() => setSuccessBanner(''), 5000);

      // Refresh patients list
      startTransition(() => {
        setReloadKey((k) => k + 1);
      });
    } catch (err) {
      setRegisterError(err.response?.data?.detail || err.message || 'Failed to register patient.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPatients = (patients || []).filter((p) => {
    const term = (searchTerm || '').toLowerCase();
    const name = (p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || '').toLowerCase();
    const provider = (p.insurance_provider || '').toLowerCase();
    const idStr = String(p.id ?? '');
    return name.includes(term) || provider.includes(term) || idStr.includes(term);
  });

  return (
    <div className="page-container">
      {/* Title & Action Row */}
      <div className="page-title-row">
        <div>
          <h1 className="page-heading">Patient Directory</h1>
          <p className="page-subheading">
            Manage patient records, demographics, and clinical laboratory orders.
          </p>
        </div>

        <div className="header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {canCreate && (
            <button
              type="button"
              className="btn btn-primary btn-icon-gap"
              id="open-register-patient-btn"
              onClick={() => {
                setRegisterError('');
                setIsRegisterOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-icon">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              + Register Patient
            </button>
          )}

          <Link to="/patients/999" className="btn btn-outline" id="test-not-found-link">
            Test Invalid ID (#999)
          </Link>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="alert alert-success" role="alert" style={{ marginBottom: '1.25rem' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="alert-icon">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successBanner}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="search-filter-bar">
        <div className="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by patient name, ID, or insurance provider..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table / Loading / Error Views */}
      {loading ? (
        <div className="loading-card">
          <div className="spinner-large" />
          <p className="loading-text">Loading live patient records from database...</p>
        </div>
      ) : error ? (
        <div className="error-card">
          <h2>Connection Error</h2>
          <p>{error}</p>
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
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="not-found-card">
          <p className="not-found-desc">No patient records found matching your search.</p>
          {canCreate && (
            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setRegisterError('');
                  setIsRegisterOpen(true);
                }}
              >
                + Register First Patient
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-card">
          <table className="patients-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Patient Name</th>
                <th>DOB</th>
                <th>Sex</th>
                <th>Contact</th>
                <th>Insurance / Policy</th>
                <th>Tests Linked</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((p) => {
                const testCount = p.tests ? p.tests.length : 0;
                const displayName =
                  p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Patient #${p.id}`;

                return (
                  <tr key={p.id}>
                    <td>
                      <span className="badge badge-id">#{p.id}</span>
                    </td>
                    <td>
                      <Link to={`/patients/${p.id}`} className="patient-name-link font-semibold">
                        {displayName}
                      </Link>
                    </td>
                    <td>{p.dob || (p.date_of_birth ? String(p.date_of_birth) : 'N/A')}</td>
                    <td>
                      {p.sex ? (
                        <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                          {p.sex}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        {p.phone && <div>{p.phone}</div>}
                        {p.email && <div style={{ color: 'var(--text-muted)' }}>{p.email}</div>}
                        {!p.phone && !p.email && <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </div>
                    </td>
                    <td>
                      {p.insurance_provider ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.insurance_provider}</div>
                          {p.policy_number && (
                            <code className="policy-code" style={{ fontSize: '0.75rem' }}>
                              {p.policy_number}
                            </code>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>None</span>
                      )}
                    </td>
                    <td>
                      {testCount > 0 ? (
                        <span className="badge badge-warning" title="Deletion protected: has linked tests">
                          {testCount} Test{testCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="badge badge-neutral" title="Safe to delete">
                          0 (Deletable)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <Link
                          to={`/patients/${p.id}`}
                          className="btn btn-sm btn-secondary"
                          title="View complete patient record"
                        >
                          Record
                        </Link>
                        <Link
                          to={`/patients/${p.id}/tests/new`}
                          className="btn btn-sm btn-primary"
                          title="Create test intake for this patient"
                        >
                          + Intake
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Patient Modal (Merged from Patients.jsx) */}
      {isRegisterOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
          <div className="modal-card" style={{ maxWidth: '600px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 id="register-modal-title" className="modal-title" style={{ textAlign: 'left', margin: 0 }}>
                  Register New Patient
                </h2>
                <p className="modal-description" style={{ textAlign: 'left', margin: '0.25rem 0 0' }}>
                  Create demographic profile and insurance coverage for clinical accessioning.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsRegisterOpen(false)}
                aria-label="Close dialog"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {registerError && (
              <div className="modal-error-banner" role="alert" style={{ marginBottom: '1.25rem' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{registerError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit}>
              <div className="form-grid" style={{ marginTop: 0 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="patient-first-name">
                    First Name *
                  </label>
                  <input
                    id="patient-first-name"
                    name="first_name"
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. Jane"
                    value={newPatient.first_name}
                    onChange={handleRegisterChange}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-last-name">
                    Last Name *
                  </label>
                  <input
                    id="patient-last-name"
                    name="last_name"
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. Doe"
                    value={newPatient.last_name}
                    onChange={handleRegisterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-dob">
                    Date of Birth *
                  </label>
                  <input
                    id="patient-dob"
                    name="date_of_birth"
                    type="date"
                    className="form-input"
                    required
                    value={newPatient.date_of_birth}
                    onChange={handleRegisterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-sex">
                    Sex
                  </label>
                  <select
                    id="patient-sex"
                    name="sex"
                    className="form-input"
                    value={newPatient.sex}
                    onChange={handleRegisterChange}
                  >
                    <option value="">Select Sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group full-width">
                  <label className="form-label" htmlFor="patient-address">
                    Residential Address
                  </label>
                  <input
                    id="patient-address"
                    name="address"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 742 Evergreen Terrace, Springfield, OR"
                    value={newPatient.address}
                    onChange={handleRegisterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-phone">
                    Contact Phone
                  </label>
                  <input
                    id="patient-phone"
                    name="phone"
                    type="tel"
                    className="form-input"
                    placeholder="e.g. (555) 382-9104"
                    value={newPatient.phone}
                    onChange={handleRegisterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-email">
                    Email Address
                  </label>
                  <input
                    id="patient-email"
                    name="email"
                    type="email"
                    className="form-input"
                    placeholder="e.g. jane.doe@example.com"
                    value={newPatient.email}
                    onChange={handleRegisterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-insurance">
                    Insurance Provider
                  </label>
                  <input
                    id="patient-insurance"
                    name="insurance_provider"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Blue Cross Blue Shield"
                    value={newPatient.insurance_provider}
                    onChange={handleRegisterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="patient-policy">
                    Policy / Group #
                  </label>
                  <input
                    id="patient-policy"
                    name="policy_number"
                    type="text"
                    className="form-input"
                    placeholder="e.g. BCBS-9482104"
                    value={newPatient.policy_number}
                    onChange={handleRegisterChange}
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsRegisterOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  id="submit-register-patient-btn"
                >
                  {isSubmitting ? (
                    <span className="btn-spinner-content">
                      <span className="spinner-sm" /> Registering...
                    </span>
                  ) : (
                    'Submit Registration'
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
