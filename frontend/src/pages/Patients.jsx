import { useState } from "react";
import PatientList from "../components/PatientList";
import { Link, useNavigate } from "react-router-dom";
import { BeakerIcon } from "../components/Icons";
import { createPatient } from "../services/patients";
import { useAuth } from "../hooks/useAuth";
import "../styles/landing.css";
import "../styles/patients.css";

// Roles allowed to create patients per MVP 1 matrix
const CREATE_ROLES = ["lab_manager", "manager", "specimen_collector", "lab_technician", "technician", "cashier"];
// Roles allowed to delete patients (must match require_role on DELETE /patients/{id})
const DELETE_ROLES = ["lab_manager", "specimen_collector"];

export default function Patients() {
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [registerError, setRegisterError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newPatient, setNewPatient] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    sex: "",
    phone: "",
    email: "",
    address: "",
  });

  const userRole = (currentUser?.role || "").toLowerCase();
  const canCreate = CREATE_ROLES.includes(userRole);
  const canDelete = DELETE_ROLES.includes(userRole);

  const handleOpenRecord = (patient) => {
    setSelectedPatient(patient);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setRegisterError("");
    setIsSubmitting(true);
    try {
      await createPatient({
        first_name: newPatient.first_name.trim(),
        last_name: newPatient.last_name.trim(),
        date_of_birth: newPatient.date_of_birth,
        sex: newPatient.sex.trim() || null,
        phone: newPatient.phone.trim() || null,
        email: newPatient.email.trim() || null,
        address: newPatient.address.trim() || null,
      });
      setIsRegisterOpen(false);
      setNewPatient({
        first_name: "",
        last_name: "",
        date_of_birth: "",
        sex: "",
        phone: "",
        email: "",
        address: "",
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setRegisterError(err.message || "Failed to register patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="patient-page">
      {/* Top Navbar matching Landing Page */}
      <nav className="nav" style={{ position: "sticky" }}>
        <div className="container nav-inner">
          <Link to="/" className="logo">
            <span className="logo-icon">
              <BeakerIcon size={22} />
            </span>
            <span className="logo-text">CLMS</span>
          </Link>

          <div className="nav-links">
            <Link to="/#features" className="nav-link">Features</Link>
            <Link to="/#how" className="nav-link">How it works</Link>
            <Link to="/#roles" className="nav-link">Roles</Link>
            <Link to="/patients" className="nav-link" style={{ color: "#fff", fontWeight: 700 }}>
              Patients
            </Link>

            {/* Current user & role display */}
            {currentUser && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "12px", fontSize: "0.85rem", color: "rgba(255,255,255,0.85)" }}>
                <span>{currentUser.email}</span>
                <span className="role-tag" style={{ background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", textTransform: "capitalize" }}>
                  {currentUser.role}
                </span>
              </div>
            )}

            <button
              type="button"
              className="btn btn-red"
              style={{ border: "none", cursor: "pointer", fontSize: "0.875rem" }}
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main>
        <PatientList
          key={refreshKey}
          canCreate={canCreate}
          canDelete={canDelete}
          onOpen={handleOpenRecord}
          onCreate={() => setIsRegisterOpen(true)}
          useMockFallback={false}
        />
      </main>

      {/* Register Patient Modal */}
      {isRegisterOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="register-modal-title">Register New Patient</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsRegisterOpen(false)}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="patient-first-name">First Name</label>
                    <input
                      id="patient-first-name"
                      type="text"
                      required
                      placeholder="Jane"
                      value={newPatient.first_name}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, first_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="patient-last-name">Last Name</label>
                    <input
                      id="patient-last-name"
                      type="text"
                      required
                      placeholder="Doe"
                      value={newPatient.last_name}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, last_name: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="patient-dob">Date of Birth</label>
                    <input
                      id="patient-dob"
                      type="date"
                      required
                      value={newPatient.date_of_birth}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, date_of_birth: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="patient-sex">Sex</label>
                    <select
                      id="patient-sex"
                      value={newPatient.sex}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, sex: e.target.value })
                      }
                    >
                      <option value="">Select Sex</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="patient-address">Address</label>
                  <input
                    id="patient-address"
                    type="text"
                    placeholder="1234 Main St, City, State ZIP"
                    value={newPatient.address}
                    onChange={(e) =>
                      setNewPatient({ ...newPatient, address: e.target.value })
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="patient-phone">Phone (Optional)</label>
                    <input
                      id="patient-phone"
                      type="tel"
                      placeholder="555-0100"
                      value={newPatient.phone}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="patient-email">Email (Optional)</label>
                    <input
                      id="patient-email"
                      type="email"
                      placeholder="patient@example.com"
                      value={newPatient.email}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, email: e.target.value })
                      }
                    />
                  </div>
                </div>

                {registerError && (
                  <div style={{ color: "#b91c1c", fontSize: "0.85rem", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px" }}>
                    {registerError}
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsRegisterOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-register" disabled={isSubmitting}>
                    {isSubmitting ? "Registering..." : "Submit Registration"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Preview Drawer / Modal */}
      {selectedPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Patient Record #{selectedPatient.id}</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedPatient(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "16px", borderRadius: "8px", fontSize: "0.9rem" }}>
                <div><strong>Name:</strong> {selectedPatient.last_name}, {selectedPatient.first_name}</div>
                <div><strong>Patient ID:</strong> {selectedPatient.patient_number}</div>
                <div><strong>DOB:</strong> {selectedPatient.date_of_birth}</div>
                <div><strong>Sex:</strong> {selectedPatient.sex || "Not specified"}</div>
                <div style={{ gridColumn: "span 2" }}><strong>Address:</strong> {selectedPatient.address || "None on file"}</div>
                {selectedPatient.phone && <div><strong>Phone:</strong> {selectedPatient.phone}</div>}
                {selectedPatient.email && <div><strong>Email:</strong> {selectedPatient.email}</div>}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedPatient(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
