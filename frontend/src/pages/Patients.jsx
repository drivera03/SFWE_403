import { useState, useEffect } from "react";
import PatientList from "../components/PatientList";
import { Link, useNavigate } from "react-router-dom";
import { BeakerIcon } from "../components/Icons";
import { createPatient } from "../services/patients";
import { getCurrentUser } from "../services/auth";
import "../styles/landing.css";
import "../styles/patients.css";

// Roles allowed to create patients per MVP 1 matrix
const CREATE_ROLES = ["lab_manager", "manager", "specimen_collector", "lab_technician", "technician", "cashier"];

export default function Patients() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [registerError, setRegisterError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newPatient, setNewPatient] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      getCurrentUser(token)
        .then((user) => setCurrentUser(user))
        .catch(() => {});
    }
  }, []);

  const userRole = (currentUser?.role || "").toLowerCase();
  const canCreate = !currentUser || CREATE_ROLES.includes(userRole);

  const handleOpenRecord = (patientId) => {
    setSelectedPatientId(patientId);
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
        phone: newPatient.phone.trim() || null,
        email: newPatient.email.trim() || null,
      });
      setIsRegisterOpen(false);
      setNewPatient({ first_name: "", last_name: "", date_of_birth: "", phone: "", email: "" });
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
                localStorage.removeItem("token");
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
      {selectedPatientId && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Patient Record #{selectedPatientId}</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedPatientId(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--mute)", fontSize: "0.9rem" }}>
                Under requirement 6.1.4 (Minimum Necessary Access), detailed notes, insurance data, and lab results are restricted to full record access.
              </p>
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", fontSize: "0.85rem" }}>
                <strong>Record ID:</strong> {selectedPatientId} <br />
                <strong>Access Audit:</strong> View logged for audit requirement.
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedPatientId(null)}
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
