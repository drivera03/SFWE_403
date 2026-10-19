const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function authenticatedRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof data?.detail === "string" ? data.detail : "Unable to complete the request. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export const getCurrentUser = () => authenticatedRequest("/auth/me");
export const getPatients = () => authenticatedRequest("/patients");
export const deletePatient = (id) => authenticatedRequest(`/patients/${id}`, { method: "DELETE" });
