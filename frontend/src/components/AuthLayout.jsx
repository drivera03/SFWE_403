import { Link } from "react-router-dom";
import { BeakerIcon } from "./Icons";
import "../styles/auth.css";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" className="auth-logo">
          <span className="auth-logo-icon">
            <BeakerIcon size={24} />
          </span>
          <span>CLMS</span>
        </Link>
        <div>
          <h2>Every specimen tracked, from intake to approved result.</h2>
          <p>Clinical Laboratory Management System</p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          <p className="auth-footer">{footer}</p>
        </div>
      </main>
    </div>
  );
}