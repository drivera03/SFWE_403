import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getPatient, updatePatient } from '../services/api';

export default function PatientEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    address: '',
    phone: '',
    email: '',
    insurance_provider: '',
    policy_number: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadPatient() {
      setLoading(true);
      try {
        const data = await getPatient(id);
        if (!ignore) {
          setFormData({
            name: data.name || '',
            dob: data.dob || '',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            insurance_provider: data.insurance_provider || '',
            policy_number: data.policy_number || '',
          });
        }
      } catch (err) {
        if (!ignore) {
          setError(err.response?.data?.detail || err.message || 'Failed to load patient');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadPatient();
    return () => {
      ignore = true;
    };
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updatePatient(id, formData);
      setSuccess('Patient details updated successfully!');
      setTimeout(() => {
        navigate(`/patients/${id}`);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to update patient');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-card">
          <div className="spinner-large" />
          <p className="loading-text">Loading patient edit form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="breadcrumb-bar">
        <Link to="/patients" className="breadcrumb-link">Patients</Link>
        <span className="breadcrumb-separator">/</span>
        <Link to={`/patients/${id}`} className="breadcrumb-link">{formData.name || `Patient #${id}`}</Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Edit Form</span>
      </div>

      <div className="form-card">
        <div className="card-header">
          <h1 className="card-title">Edit Patient Record #{id}</h1>
          <p className="form-subtitle">Update demographics, contact info, and insurance policy coverage.</p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit} className="patient-form">
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="name" className="form-label">Full Name</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="form-input"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="dob" className="form-label">Date of Birth (YYYY-MM-DD)</label>
              <input
                id="dob"
                name="dob"
                type="date"
                required
                className="form-input"
                value={formData.dob}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="form-label">Phone Number</label>
              <input
                id="phone"
                name="phone"
                type="text"
                required
                className="form-input"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="email" className="form-label">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="form-input"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="address" className="form-label">Residential Address</label>
              <input
                id="address"
                name="address"
                type="text"
                required
                className="form-input"
                value={formData.address}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="insurance_provider" className="form-label">Insurance Provider</label>
              <input
                id="insurance_provider"
                name="insurance_provider"
                type="text"
                required
                className="form-input"
                value={formData.insurance_provider}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="policy_number" className="form-label">Policy Number</label>
              <input
                id="policy_number"
                name="policy_number"
                type="text"
                required
                className="form-input"
                value={formData.policy_number}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-actions">
            <Link to={`/patients/${id}`} className="btn btn-secondary">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
