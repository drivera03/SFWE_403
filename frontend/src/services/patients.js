const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Helper to make authorized GET/POST requests to the backend.
 */
async function apiRequest(path, { method = "GET", body = null, signal = null } = {}) {
  const headers = {};
  const token = localStorage.getItem("token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    signal,
  });

  if (res.status === 401) {
    const err = new Error("unauthorized");
    err.status = 401;
    throw err;
  }

  if (res.status === 403) {
    const err = new Error("forbidden");
    err.status = 403;
    throw err;
  }

  if (!res.ok) {
    const err = new Error("failed");
    err.status = res.status;
    throw err;
  }

  return res.status === 204 ? null : res.json();
}

/**
 * Fetch lean list of patients with search query and abort controller support.
 * @param {string} query - search term (name or patient ID)
 * @param {AbortSignal} [signal] - optional abort signal for debouncing
 */
export async function getPatients(query = "", signal = null) {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set("q", query.trim());
  }
  const queryString = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/patients${queryString}`, { signal });
}

/**
 * Register a new patient (for roles with create permission).
 */
export async function createPatient(patientData) {
  return apiRequest("/patients", {
    method: "POST",
    body: patientData,
  });
}

export function deletePatient(id) {
  return apiRequest(`/patients/${id}`, { method: "DELETE" });
}
