import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { register } from "../services/auth";

// Match these values to the roles your backend accepts.
const ROLES = [
  { value: "lab_manager", label: "Lab Manager" },
  { value: "specimen_collector", label: "Specimen Collector" },
  { value: "lab_technician", label: "Lab Technician" },
  { value: "pathologist", label: "Pathologist" },
  { value: "billing", label: "Billing" },
  { value: "physician", label: "Physician" },
];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", role: "lab_technician", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");

    setLoading(true);
    try {
      await register(form.email, form.password, form.role);
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Set up a new CLMS user."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          value={form.email} onChange={update} placeholder="name@example.com" />

        <label htmlFor="role">Role</label>
        <select id="role" name="role" value={form.role} onChange={update}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required
          value={form.password} onChange={update} />

        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required
          value={form.confirm} onChange={update} />

        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}