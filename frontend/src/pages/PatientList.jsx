import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPatients } from '../services/api';

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPatients();
      setPatients(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.insurance_provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(p.id).includes(searchTerm)
  );

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <h1 className="page-heading">Patient Directory</h1>
          <p className="page-subheading">Manage patient records, demographics, and clinical laboratory history.</p>
        </div>

        <div className="header-actions">
          <Link to="/patients/999" className="btn btn-outline" id="test-not-found-link">
            Test Invalid ID (#999)
          </Link>
        </div>
      </div>

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

      {loading ? (
        <div className="loading-card">
          <div className="spinner-large" />
          <p className="loading-text">Loading live patient records from database...</p>
        </div>
      ) : error ? (
        <div className="error-card">
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={fetchPatients}>
            Retry
          </button>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="not-found-card">
          <p className="not-found-desc">No patient records found matching your search.</p>
        </div>
      ) : (
        <div className="table-card">
          <table className="patients-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Patient Name</th>
                <th>DOB</th>
                <th>Phone</th>
                <th>Insurance Provider</th>
                <th>Policy Number</th>
                <th>Tests Linked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((p) => {
                const testCount = p.tests ? p.tests.length : 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="badge badge-id">#{p.id}</span>
                    </td>
                    <td>
                      <Link to={`/patients/${p.id}`} className="patient-name-link font-semibold">
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.dob}</td>
                    <td>{p.phone}</td>
                    <td>{p.insurance_provider}</td>
                    <td>
                      <span className="policy-code">{p.policy_number}</span>
                    </td>
                    <td>
                      {testCount > 0 ? (
                        <span className="badge badge-warning" title="Deletion protected: has linked tests">
                          {testCount} Test(s)
                        </span>
                      ) : (
                        <span className="badge badge-neutral" title="Safe to delete">
                          0 (Deletable)
                        </span>
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/patients/${p.id}`}
                        className="btn btn-sm btn-secondary"
                        id={`view-patient-${p.id}-btn`}
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
