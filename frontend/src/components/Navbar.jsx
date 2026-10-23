import { Link } from "react-router-dom";
import { BeakerIcon } from "./Icons";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <a href="#top" className="logo">
          <span className="logo-icon">
            <BeakerIcon size={22} />
          </span>
          <span className="logo-text">CLMS</span>
        </a>
        <div className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#how" className="nav-link">How it works</a>
          <a href="#roles" className="nav-link">Roles</a>
          <Link to="/patients" className="nav-link">Patients</Link>

          {isAuthenticated ? (
            <>
              <span className="nav-user">
                <span className="nav-user-email">{user.email}</span>
                <span className="nav-user-role">{user.role}</span>
              </span>
              <Link to="/change-password" className="nav-link nav-account-link">Change password</Link>
              <button type="button" className="btn btn-signout" onClick={logout}>Sign out</button>
            </>
          ) : (
            <Link to="/login" className="btn btn-red">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}