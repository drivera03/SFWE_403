import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deletePatient, getCurrentUser, getPatients } from "../services/patients";
import "../styles/patients.css";

export default function Patients() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canDelete = user?.role?.toLowerCase() === "lab_manager";

  useEffect(() => {
    let active = true;
    Promise.all([getCurrentUser(), getPatients()])
      .then(([profile, records]) => {
        if (active) {
          setUser(profile);
          setPatients(records);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate("/login", { replace: true });
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [navigate]);

  async function handleDelete(patient) {
    if (!canDelete || deletingId !== null) return;
    if (!window.confirm(`Permanently delete the patient record for ${patient.first_name} ${patient.last_name}?`)) return;
    setDeletingId(patient.id);
    setError("");
    setMessage("");
    try {
      await deletePatient(patient.id);
      setPatients((records) => records.filter((record) => record.id !== patient.id));
      setMessage("Patient record deleted.");
    } catch (err) {
      if (err.status === 401) navigate("/login", { replace: true });
      if (err.status === 403) setUser(null);
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="patients-page">
      <header className="patients-header">
        <div><Link to="/">CLMS</Link><h1>Patients</h1></div>
        <Link to="/change-password">Change password</Link>
      </header>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loading ? <p role="status">Loading patients...</p> : !error && patients.length === 0 ? <p>No patient records found.</p> : patients.length > 0 && (
        <div className="patients-table-wrap">
          <table>
            <caption>Patient records</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Date of birth</th><th scope="col">Phone</th>{canDelete && <th scope="col">Actions</th>}</tr></thead>
            <tbody>{patients.map((patient) => (
              <tr key={patient.id}>
                <td>{patient.first_name} {patient.last_name}</td>
                <td>{patient.date_of_birth}</td>
                <td>{patient.phone || "—"}</td>
                {canDelete && <td><button type="button" className="patient-delete" disabled={deletingId !== null} onClick={() => handleDelete(patient)} aria-label={`Delete patient ${patient.first_name} ${patient.last_name}`}>
                  {deletingId === patient.id ? "Deleting..." : "Delete"}
                </button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
