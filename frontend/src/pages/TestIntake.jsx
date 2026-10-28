import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { getPatients, getPatient } from '../services/api';
import {
  createTestIntake,
  getPhysicians,
  getInstruments,
  createPhysician,
} from '../services/tests';
import Navbar from '../components/Navbar';
import '../styles/landing.css';
import '../styles/patients.css';

// Standard common test presets with pre-configured units and reference ranges
const TEST_PRESETS = [
  {
    name: 'Complete Blood Count (CBC)',
    sampleType: 'blood',
    units: 'x10^3/uL',
    refLow: 4.5,
    refHigh: 11.0,
    refText: '4.5 - 11.0 x10^3/uL',
  },
  {
    name: 'Lipid Panel',
    sampleType: 'blood',
    units: 'mg/dL',
    refLow: 0,
    refHigh: 200,
    refText: '< 200 mg/dL (Desirable)',
  },
  {
    name: 'Comprehensive Metabolic Panel (CMP)',
    sampleType: 'blood',
    units: 'mg/dL',
    refLow: 70,
    refHigh: 99,
    refText: '70 - 99 mg/dL (Fasting Glucose)',
  },
  {
    name: 'Hemoglobin A1c',
    sampleType: 'blood',
    units: '%',
    refLow: 4.0,
    refHigh: 5.6,
    refText: '4.0 - 5.6 % (Normal)',
  },
  {
    name: 'Urinalysis Complete',
    sampleType: 'urine',
    units: '',
    refLow: null,
    refHigh: null,
    refText: 'Negative / Clear',
  },
  {
    name: 'Thyroid Stimulating Hormone (TSH)',
    sampleType: 'blood',
    units: 'uIU/mL',
    refLow: 0.4,
    refHigh: 4.0,
    refText: '0.4 - 4.0 uIU/mL',
  },
  {
    name: 'Tissue Biopsy Pathological Exam',
    sampleType: 'tissue',
    units: '',
    refLow: null,
    refHigh: null,
    refText: 'Benign histology',
  },
];

const SAMPLE_TYPES = [
  { id: 'blood', label: 'Blood', icon: '🩸', desc: 'Whole blood, serum, plasma' },
  { id: 'urine', label: 'Urine', icon: '🧪', desc: 'Random or 24-hr clean catch' },
  { id: 'tissue', label: 'Tissue', icon: '🔬', desc: 'Biopsy or surgical specimen' },
  { id: 'other', label: 'Other', icon: '📦', desc: 'Swab, CSF, fluid, or sputum' },
];

export default function TestIntake() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Resolve target patient ID from route params (/patients/:id/tests/new) or query (?patient_id=1)
  const initialPatientId = params.id || params.patientId || searchParams.get('patient_id') || '';

  // Data sources
  const [patientsList, setPatientsList] = useState([]);
  const [physiciansList, setPhysiciansList] = useState([]);
  const [instrumentsList, setInstrumentsList] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Loading states
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [successData, setSuccessData] = useState(null);

  // New physician modal
  const [showAddPhysicianModal, setShowAddPhysicianModal] = useState(false);
  const [newPhysicianName, setNewPhysicianName] = useState('');
  const [addingPhysician, setAddingPhysician] = useState(false);
  const [physicianModalError, setPhysicianModalError] = useState('');

  // Form Fields
  const [formData, setFormData] = useState(() => ({
    patient_id: initialPatientId,
    report_id: `RPT-${Math.floor(100000 + Math.random() * 900000)}`,
    sample_id: `SMP-${Math.floor(100000 + Math.random() * 900000)}`,
    sample_type: 'blood',
    collection_datetime: new Date().toISOString().slice(0, 16),
    test_name: '',
    physician_id: '',
    instrument_id: '',
    units: '',
    reference_range_low: '',
    reference_range_high: '',
    reference_range_text: '',
    insurance_provider: '',
    insurance_policy_number: '',
    notes: '',
  }));

  const [fieldErrors, setFieldErrors] = useState({});

  // Load initial dropdown data and patient details
  useEffect(() => {
    let ignore = false;

    async function loadData() {
      setLoadingInitial(true);
      setErrorBanner('');

      try {
        const [patients, physicians, instruments] = await Promise.all([
          getPatients().catch((err) => {
            console.error('Failed to load patients', err);
            return [];
          }),
          getPhysicians(),
          getInstruments(),
        ]);

        if (ignore) return;

        setPatientsList(patients || []);
        setPhysiciansList(physicians || []);
        setInstrumentsList(instruments || []);

        // Default physician if available
        if (physicians && physicians.length > 0) {
          setFormData((prev) => ({
            ...prev,
            physician_id: prev.physician_id || String(physicians[0].id),
          }));
        }

        // If an initial patient ID is provided, fetch their details to pre-populate
        if (initialPatientId) {
          try {
            const p = await getPatient(initialPatientId);
            if (!ignore && p) {
              setSelectedPatient(p);
              setFormData((prev) => ({
                ...prev,
                patient_id: String(p.id),
                insurance_provider: p.insurance_provider || prev.insurance_provider,
                insurance_policy_number: p.policy_number || prev.insurance_policy_number,
              }));
            }
          } catch (pErr) {
            console.warn('Could not load target patient demographics', pErr);
          }
        }
      } catch (err) {
        if (!ignore) {
          setErrorBanner(err.message || 'Failed to initialize intake form data');
        }
      } finally {
        if (!ignore) setLoadingInitial(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [initialPatientId]);

  // Handle changing the selected patient
  const handlePatientChange = async (e) => {
    const pId = e.target.value;
    setFormData((prev) => ({ ...prev, patient_id: pId }));
    setFieldErrors((prev) => ({ ...prev, patient_id: '' }));

    if (!pId) {
      setSelectedPatient(null);
      return;
    }

    try {
      const patient = await getPatient(pId);
      setSelectedPatient(patient);
      if (patient) {
        setFormData((prev) => ({
          ...prev,
          insurance_provider: patient.insurance_provider || prev.insurance_provider,
          insurance_policy_number: patient.policy_number || prev.insurance_policy_number,
        }));
      }
    } catch {
      // Fallback to list search if single patient fetch fails
      const found = patientsList.find((p) => String(p.id) === String(pId));
      setSelectedPatient(found || null);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Preset quick-select handler
  const handleApplyPreset = (preset) => {
    setFormData((prev) => ({
      ...prev,
      test_name: preset.name,
      sample_type: preset.sampleType,
      units: preset.units,
      reference_range_low: preset.refLow !== null ? String(preset.refLow) : '',
      reference_range_high: preset.refHigh !== null ? String(preset.refHigh) : '',
      reference_range_text: preset.refText || '',
    }));
    setFieldErrors((prev) => ({ ...prev, test_name: '' }));
  };

  // Quick ID generator helpers
  const regenerateSampleId = () => {
    const code = `SMP-${Math.floor(100000 + Math.random() * 900000)}`;
    setFormData((prev) => ({ ...prev, sample_id: code }));
  };

  const regenerateReportId = () => {
    const code = `RPT-${Math.floor(100000 + Math.random() * 900000)}`;
    setFormData((prev) => ({ ...prev, report_id: code }));
  };

  // Add Physician modal submission
  const handleAddPhysician = async (e) => {
    e.preventDefault();
    if (!newPhysicianName.trim()) return;

    setAddingPhysician(true);
    setPhysicianModalError('');

    try {
      const created = await createPhysician({ name: newPhysicianName.trim() });
      setPhysiciansList((prev) => [...prev, created]);
      setFormData((prev) => ({ ...prev, physician_id: String(created.id) }));
      setNewPhysicianName('');
      setShowAddPhysicianModal(false);
    } catch (err) {
      setPhysicianModalError(err.message || 'Failed to add physician');
    } finally {
      setAddingPhysician(false);
    }
  };

  // Validate form before submission
  const validate = () => {
    const errors = {};
    if (!formData.patient_id) errors.patient_id = 'Patient selection is required.';
    if (!formData.sample_id.trim()) errors.sample_id = 'Sample Barcode / Specimen ID is required.';
    if (!formData.test_name.trim()) errors.test_name = 'Test or Panel Name is required.';
    if (!formData.collection_datetime) errors.collection_datetime = 'Collection timestamp is required.';

    if (formData.reference_range_low && isNaN(Number(formData.reference_range_low))) {
      errors.reference_range_low = 'Must be a valid number';
    }
    if (formData.reference_range_high && isNaN(Number(formData.reference_range_high))) {
      errors.reference_range_high = 'Must be a valid number';
    }
    if (
      formData.reference_range_low &&
      formData.reference_range_high &&
      Number(formData.reference_range_low) > Number(formData.reference_range_high)
    ) {
      errors.reference_range_high = 'High bound must be greater than low bound';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');

    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        patient_id: parseInt(formData.patient_id, 10),
        report_id: formData.report_id.trim() || undefined,
        sample_id: formData.sample_id.trim(),
        sample_type: formData.sample_type,
        collection_datetime: new Date(formData.collection_datetime).toISOString(),
        test_name: formData.test_name.trim(),
        physician_id: formData.physician_id ? parseInt(formData.physician_id, 10) : undefined,
        instrument_id: formData.instrument_id ? parseInt(formData.instrument_id, 10) : undefined,
        units: formData.units.trim() || undefined,
        reference_range_low: formData.reference_range_low !== '' ? parseFloat(formData.reference_range_low) : undefined,
        reference_range_high: formData.reference_range_high !== '' ? parseFloat(formData.reference_range_high) : undefined,
        reference_range_text: formData.reference_range_text.trim() || undefined,
        insurance_provider: formData.insurance_provider.trim() || undefined,
        insurance_policy_number: formData.insurance_policy_number.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      };

      const result = await createTestIntake(payload);
      setSuccessData(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorBanner(err.message || 'Failed to complete test intake order. Please verify input fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="patient-page">
      <Navbar />

      {/* Main Container */}
      <main className="patient-container" aria-labelledby="test-intake-heading">
        {/* Page Header */}
        <header className="patient-header">
          <div className="patient-header-title">
            <h1 id="test-intake-heading">Test Intake &amp; Accessioning</h1>
            <p>Register new specimen orders, assign tests, barcode identifiers, and methodology.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link
              to={selectedPatient ? `/patients/${selectedPatient.id}` : '/patients'}
              className="btn-secondary"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              &larr; Back to {selectedPatient ? 'Patient' : 'Patients'}
            </Link>
          </div>
        </header>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="state-error" role="alert" style={{ borderRadius: '8px', marginBottom: '20px' }}>
            <strong>Error Processing Intake:</strong> {errorBanner}
          </div>
        )}

        {/* Loading Initial Data Spinner */}
        {loadingInitial && (
          <div className="state-message state-loading" style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div className="spinner" />
            <span>Loading lab accessioning directories and patient records…</span>
          </div>
        )}

        {/* Success Confirmation Card */}
        {!loadingInitial && successData && (
          <div className="intake-success-card">
            <div className="intake-success-badge-icon">&#10003;</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              Test Intake Order Created Successfully!
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
              The laboratory test has been accessioned and queued for analytical processing.
            </p>

            <table className="intake-summary-table">
              <tbody>
                <tr>
                  <td>Accession ID:</td>
                  <td><strong>#{successData.id}</strong></td>
                </tr>
                <tr>
                  <td>Patient:</td>
                  <td>
                    {selectedPatient
                      ? `${selectedPatient.name || selectedPatient.first_name + ' ' + selectedPatient.last_name} (ID: #${selectedPatient.id})`
                      : `Patient #${successData.patient_id}`}
                  </td>
                </tr>
                <tr>
                  <td>Test Name:</td>
                  <td><span className="patient-id-badge">{successData.test_name}</span></td>
                </tr>
                <tr>
                  <td>Sample Type / Barcode:</td>
                  <td>{successData.sample_type ? successData.sample_type.toUpperCase() : 'BLOOD'} &bull; <code>{successData.sample_id}</code></td>
                </tr>
                <tr>
                  <td>Report Tracking ID:</td>
                  <td><code>{successData.report_id || '—'}</code></td>
                </tr>
                <tr>
                  <td>Status:</td>
                  <td>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}>
                      {successData.status ? successData.status.toUpperCase() : 'PENDING'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
              <button
                type="button"
                className="btn-register"
                onClick={() => {
                  setSuccessData(null);
                  setFormData((prev) => ({
                    ...prev,
                    report_id: `RPT-${Math.floor(100000 + Math.random() * 900000)}`,
                    sample_id: `SMP-${Math.floor(100000 + Math.random() * 900000)}`,
                    test_name: '',
                  }));
                }}
              >
                + Intake Another Specimen
              </button>
              <Link
                to={selectedPatient ? `/patients/${selectedPatient.id}` : '/patients'}
                className="btn-secondary"
                style={{ textDecoration: 'none' }}
              >
                View Patient Details &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Main Intake Form */}
        {!loadingInitial && !successData && (
          <form onSubmit={handleSubmit}>
            {/* Section 1: Patient Context */}
            <div className="intake-section-box">
              <div className="intake-section-header">
                <div className="intake-section-title-wrap">
                  <span className="intake-step-pill">1</span>
                  <div>
                    <h2 className="intake-section-title">Patient Identification</h2>
                    <p className="intake-section-desc">Assign this accession order to a registered patient.</p>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="patient_id" style={{ display: 'block', marginBottom: '6px' }}>
                  Select Registered Patient *
                </label>
                <select
                  id="patient_id"
                  name="patient_id"
                  value={formData.patient_id}
                  onChange={handlePatientChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: fieldErrors.patient_id ? '1px solid #ef4444' : '1px solid #e2e8f0',
                    fontSize: '0.95rem',
                  }}
                  required
                >
                  <option value="">-- Choose Patient from Directory --</option>
                  {patientsList.map((p) => {
                    const pName = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Patient #${p.id}`;
                    return (
                      <option key={p.id} value={p.id}>
                        #{p.id} — {pName} {p.dob || p.date_of_birth ? `(DOB: ${p.dob || p.date_of_birth})` : ''}
                      </option>
                    );
                  })}
                </select>
                {fieldErrors.patient_id && (
                  <span style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.patient_id}
                  </span>
                )}
              </div>

              {/* Patient Demographics Preview Box */}
              {selectedPatient && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    fontSize: '0.85rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Full Name</span>
                    <strong style={{ color: '#0f172a' }}>
                      {selectedPatient.name || `${selectedPatient.first_name || ''} ${selectedPatient.last_name || ''}`.trim()}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>DOB &amp; Age</span>
                    <strong style={{ color: '#0f172a' }}>
                      {selectedPatient.dob || selectedPatient.date_of_birth || 'N/A'}{' '}
                      {selectedPatient.age ? `(${selectedPatient.age} yrs)` : ''}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Insurance Carrier</span>
                    <strong style={{ color: '#0f172a' }}>{selectedPatient.insurance_provider || 'Self-pay'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Policy / Member ID</span>
                    <strong style={{ color: '#0f172a' }}>{selectedPatient.policy_number || 'N/A'}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Specimen & Barcodes */}
            <div className="intake-section-box">
              <div className="intake-section-header">
                <div className="intake-section-title-wrap">
                  <span className="intake-step-pill">2</span>
                  <div>
                    <h2 className="intake-section-title">Specimen &amp; Accession Identifiers</h2>
                    <p className="intake-section-desc">Sample barcodes, specimen type, and collection time.</p>
                  </div>
                </div>
              </div>

              {/* Sample Type Cards */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
                  Specimen Biofluid / Sample Matrix *
                </label>
                <div className="sample-type-cards-grid">
                  {SAMPLE_TYPES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      className={`sample-card ${formData.sample_type === st.id ? 'active' : ''}`}
                      onClick={() => setFormData((prev) => ({ ...prev, sample_type: st.id }))}
                    >
                      <span className="sample-card-icon">{st.icon}</span>
                      <div className="sample-card-info">
                        <span className="sample-card-title">{st.label}</span>
                        <span className="sample-card-subtitle">{st.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="sample_id">Specimen Barcode / Sample ID *</label>
                  <div className="input-with-auto-btn">
                    <input
                      id="sample_id"
                      name="sample_id"
                      type="text"
                      placeholder="e.g. SMP-481902"
                      value={formData.sample_id}
                      onChange={handleInputChange}
                      required
                    />
                    <button
                      type="button"
                      className="btn-auto-id"
                      onClick={regenerateSampleId}
                      title="Generate unique sample ID"
                    >
                      &#x21bb; Auto
                    </button>
                  </div>
                  {fieldErrors.sample_id && (
                    <span style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '4px' }}>
                      {fieldErrors.sample_id}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="report_id">Report Accession Tracking ID</label>
                  <div className="input-with-auto-btn">
                    <input
                      id="report_id"
                      name="report_id"
                      type="text"
                      placeholder="e.g. RPT-948123"
                      value={formData.report_id}
                      onChange={handleInputChange}
                    />
                    <button
                      type="button"
                      className="btn-auto-id"
                      onClick={regenerateReportId}
                      title="Generate unique report accession ID"
                    >
                      &#x21bb; Auto
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="collection_datetime">Specimen Collection Date &amp; Time *</label>
                <input
                  id="collection_datetime"
                  name="collection_datetime"
                  type="datetime-local"
                  value={formData.collection_datetime}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            {/* Section 3: Test Name & Presets */}
            <div className="intake-section-box">
              <div className="intake-section-header">
                <div className="intake-section-title-wrap">
                  <span className="intake-step-pill">3</span>
                  <div>
                    <h2 className="intake-section-title">Test Name &amp; Clinical Panel Presets</h2>
                    <p className="intake-section-desc">Pick a common lab panel or type a custom test order.</p>
                  </div>
                </div>
              </div>

              {/* Quick preset chips */}
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                  Quick Preset Clinical Panels:
                </span>
                <div className="preset-chips-wrap">
                  {TEST_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className={`preset-chip ${formData.test_name === preset.name ? 'active' : ''}`}
                      onClick={() => handleApplyPreset(preset)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="test_name">Clinical Test or Order Name *</label>
                <input
                  id="test_name"
                  name="test_name"
                  type="text"
                  placeholder="e.g. Complete Blood Count (CBC)"
                  value={formData.test_name}
                  onChange={handleInputChange}
                  required
                />
                {fieldErrors.test_name && (
                  <span style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '4px' }}>
                    {fieldErrors.test_name}
                  </span>
                )}
              </div>
            </div>

            {/* Section 4: Physician, Methodology & Ranges */}
            <div className="intake-section-box">
              <div className="intake-section-header">
                <div className="intake-section-title-wrap">
                  <span className="intake-step-pill">4</span>
                  <div>
                    <h2 className="intake-section-title">Physician, Instrument &amp; Ranges</h2>
                    <p className="intake-section-desc">Order provider, target analyzer instrument, and reference limits.</p>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="physician_id">Ordering Physician</label>
                    <button
                      type="button"
                      onClick={() => setShowAddPhysicianModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      + Add New Doctor
                    </button>
                  </div>
                  <select
                    id="physician_id"
                    name="physician_id"
                    value={formData.physician_id}
                    onChange={handleInputChange}
                  >
                    <option value="">-- No specific doctor assigned --</option>
                    {physiciansList.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="instrument_id">Target Lab Analyzer Instrument</label>
                  <select
                    id="instrument_id"
                    name="instrument_id"
                    value={formData.instrument_id}
                    onChange={handleInputChange}
                  >
                    <option value="">-- General Bench / Manual --</option>
                    {instrumentsList.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} {inst.model ? `(${inst.model})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label htmlFor="units">Measurement Units</label>
                  <input
                    id="units"
                    name="units"
                    type="text"
                    placeholder="e.g. mg/dL, x10^3/uL, %"
                    value={formData.units}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reference_range_text">Expected Reference Text</label>
                  <input
                    id="reference_range_text"
                    name="reference_range_text"
                    type="text"
                    placeholder="e.g. Normal fasting range"
                    value={formData.reference_range_text}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label htmlFor="reference_range_low">Reference Range Low Limit</label>
                  <input
                    id="reference_range_low"
                    name="reference_range_low"
                    type="number"
                    step="any"
                    placeholder="e.g. 70"
                    value={formData.reference_range_low}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reference_range_high">Reference Range High Limit</label>
                  <input
                    id="reference_range_high"
                    name="reference_range_high"
                    type="number"
                    step="any"
                    placeholder="e.g. 99"
                    value={formData.reference_range_high}
                    onChange={handleInputChange}
                  />
                  {fieldErrors.reference_range_high && (
                    <span style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '4px' }}>
                      {fieldErrors.reference_range_high}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Section 5: Insurance & Notes */}
            <div className="intake-section-box">
              <div className="intake-section-header">
                <div className="intake-section-title-wrap">
                  <span className="intake-step-pill">5</span>
                  <div>
                    <h2 className="intake-section-title">Billing &amp; Clinical Accession Notes</h2>
                    <p className="intake-section-desc">Payer details and collection technician notes.</p>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="insurance_provider">Insurance Carrier / Payer</label>
                  <input
                    id="insurance_provider"
                    name="insurance_provider"
                    type="text"
                    placeholder="e.g. Blue Cross Blue Shield"
                    value={formData.insurance_provider}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="insurance_policy_number">Policy / Group / Member ID</label>
                  <input
                    id="insurance_policy_number"
                    name="insurance_policy_number"
                    type="text"
                    placeholder="e.g. BCBS-9481028"
                    value={formData.insurance_policy_number}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="notes">Clinical Accession Notes</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="e.g. Patient fasting for 12 hours. Specimen collected via venipuncture, no hemolysis observed."
                  value={formData.notes}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    color: '#0f172a',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '40px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (selectedPatient) {
                    navigate(`/patients/${selectedPatient.id}`);
                  } else {
                    navigate('/patients');
                  }
                }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-register"
                disabled={submitting}
                id="submit-test-intake-btn"
                style={{ padding: '10px 24px', fontSize: '0.95rem' }}
              >
                {submitting ? 'Submitting Order…' : 'Submit Test Intake Order'}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Quick Add Physician Modal */}
      {showAddPhysicianModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Add Ordering Physician</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddPhysicianModal(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddPhysician}>
              <div className="modal-body">
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  Register a new ordering physician to assign to this test intake order.
                </p>

                {physicianModalError && (
                  <div style={{ color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>
                    {physicianModalError}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="new-physician-name">Physician Full Name *</label>
                  <input
                    id="new-physician-name"
                    type="text"
                    placeholder="e.g. Dr. Meredith Grey, MD"
                    value={newPhysicianName}
                    onChange={(e) => setNewPhysicianName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowAddPhysicianModal(false)}
                    disabled={addingPhysician}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-register"
                    disabled={addingPhysician}
                  >
                    {addingPhysician ? 'Saving...' : 'Add Physician'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
