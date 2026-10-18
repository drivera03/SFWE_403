import { useEffect, useState } from "react";
import { getPatients } from "../services/patients";
import "../styles/patients.css";

// Fallback mock patients for frontend preview before backend wiring
const MOCK_PATIENTS = [
  { id: 101, patient_number: "PAT-00101", first_name: "John", last_name: "Doe", date_of_birth: "1985-05-12" },
  { id: 102, patient_number: "PAT-00102", first_name: "Jane", last_name: "Smith", date_of_birth: "1992-09-24" },
  { id: 103, patient_number: "PAT-00103", first_name: "Carlos", last_name: "Rodriguez", date_of_birth: "1978-11-03" },
  { id: 104, patient_number: "PAT-00104", first_name: "Elena", last_name: "Vasquez", date_of_birth: "2001-03-19" },
  { id: 105, patient_number: "PAT-00105", first_name: "Michael", last_name: "Chang", date_of_birth: "1964-08-30" },
];

/**
 * Lean View: only what's needed to identify a patient (MVP 1).
 * Insurance, results, notes and contact details remain on the detail page behind their own permission checks.
 */
export default function PatientList({
  canCreate = false,
  onOpen,
  onCreate,
  useMockFallback = true,
}) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error | forbidden

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const data = await getPatients(query, controller.signal);
        // Normalize fields if backend returns 'id' without 'patient_number'
        const normalized = (data || []).map((p) => ({
          ...p,
          patient_number: p.patient_number || `PAT-${String(p.id).padStart(5, "0")}`,
        }));
        setPatients(normalized);
        setStatus("ready");
      } catch (err) {
        if (err.name === "AbortError") return;

        if (err.message === "forbidden" || err.status === 403) {
          setStatus("forbidden");
        } else if (useMockFallback) {
          // Graceful fallback for offline / mock frontend development
          const q = query.trim().toLowerCase();
          const filtered = MOCK_PATIENTS.filter(
            (p) =>
              p.first_name.toLowerCase().includes(q) ||
              p.last_name.toLowerCase().includes(q) ||
              p.patient_number.toLowerCase().includes(q)
          );
          setPatients(filtered);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      }
    }, 250); // debounce search at 250 ms

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, useMockFallback]);

  return (
    <section className="patient-container" aria-labelledby="patient-list-heading">
      <header className="patient-header">
        <div className="patient-header-title">
          <h1 id="patient-list-heading">Patients</h1>
          <p>Lean View (MVP 1) &bull; Minimum necessary identification</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="btn-register"
            id="register-patient-btn"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Register patient</span>
          </button>
        )}
      </header>

      {/* Search Input with 250ms debounce */}
      <div className="patient-search-bar">
        <label htmlFor="patient-search-input" className="sr-only">
          Search patients by name or patient ID
        </label>
        <span className="search-icon-svg" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
        <input
          id="patient-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or patient ID"
          className="patient-search-input"
          autoComplete="off"
        />
      </div>

      {/* Patients Data Table Card */}
      <div className="patient-table-card">
        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Patient ID</th>
                <th scope="col">Date of birth</th>
                <th scope="col">Sex</th>
                <th scope="col">Address</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  <span>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {status === "ready" &&
                patients.map((p) => (
                  <tr key={p.id}>
                    <td className="patient-name-cell">
                      {p.last_name}, {p.first_name}
                    </td>
                    <td>
                      <span className="patient-id-badge">{p.patient_number}</span>
                    </td>
                    <td>{p.date_of_birth}</td>
                    <td>{p.sex || "—"}</td>
                    <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.address || "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => onOpen?.(p)}
                        className="btn-open-record"
                        aria-label={`Open record for ${p.first_name} ${p.last_name}`}
                      >
                        Open record &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* State representations */}
        {status === "loading" && (
          <div className="state-message state-loading">
            <div className="spinner" />
            <span>Loading patients…</span>
          </div>
        )}

        {status === "error" && (
          <div className="state-error" role="alert">
            Couldn’t load patients. Check your connection and try again.
          </div>
        )}

        {status === "forbidden" && (
          <div className="state-forbidden" role="alert">
            <strong>Access Denied (403)</strong>
            <p>Your role doesn’t have access to the patient list. Ask a Lab Manager if you need it.</p>
          </div>
        )}

        {status === "ready" && patients.length === 0 && (
          <div className="state-empty">
            <div className="empty-icon">&#128100;</div>
            <p>
              {query
                ? "No patients match that search."
                : "No patients yet. Register the first one to get started."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
