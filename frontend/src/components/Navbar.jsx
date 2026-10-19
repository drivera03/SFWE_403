import { BeakerIcon } from "./Icons";

export default function Navbar() {
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
          <a href="/patients" className="nav-link">Patients</a>
          <a href="/login" className="btn btn-red">Sign in</a>
        </div>
      </div>
    </nav>
  );
}
