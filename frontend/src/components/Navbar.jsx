import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BeakerIcon } from './Icons';

export default function Navbar() {
  const { currentUser, isAuthenticated, switchRole, logout } = useAuth() || {};
  const location = useLocation();

  // Render public landing navigation on home page ("/")
  if (location.pathname === '/') {
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
            <Link to="/login" className="btn btn-red">Sign in</Link>
          </div>
        </div>
      </nav>
    );
  }

  // Render CLMS application navbar on internal routes
  const roles = [
    { id: 'lab_manager', label: 'Lab Manager', badgeClass: 'badge-manager', canDelete: true },
    { id: 'specimen_collector', label: 'Specimen Collector', badgeClass: 'badge-collector', canDelete: false },
    { id: 'technician', label: 'Technician', badgeClass: 'badge-tech', canDelete: false },
    { id: 'pathologist', label: 'Pathologist', badgeClass: 'badge-pathologist', canDelete: false },
  ];

  const currentRoleObj = roles.find((r) => r.id === currentUser?.role) || {
    label: currentUser?.role || 'Guest',
    badgeClass: 'badge-default',
    canDelete: false,
  };

  return (
    <header className="clms-navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/" className="brand-logo">
            <span className="logo-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="logo-svg">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </span>
            <div className="brand-text">
              <span className="brand-title">CLMS</span>
              <span className="brand-subtitle">Clinical Lab Core</span>
            </div>
          </Link>

          <nav className="nav-links">
            <Link
              to="/patients"
              className={`nav-link ${location.pathname.startsWith('/patients') ? 'active' : ''}`}
            >
              Patients
            </Link>
            <Link to="/" className="nav-link">
              Home
            </Link>
          </nav>
        </div>

        <div className="navbar-right">
          {isAuthenticated ? (
            <>
              {/* Active Role Selector Tool for verifying role-based behavior */}
              <div className="role-switcher-container">
                <span className="role-switcher-label">Active Role:</span>
                <div className="role-buttons">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      id={`role-switch-${r.id}`}
                      className={`role-chip ${currentUser?.role === r.id ? 'active ' + r.badgeClass : ''}`}
                      onClick={() => switchRole?.(r.id)}
                      title={`Switch active test persona to ${r.label}`}
                    >
                      {r.label}
                      {r.canDelete && <span className="delete-perm-star" title="Has delete permissions">★</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="user-profile-badge">
                <div className="avatar-circle">
                  {currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : currentUser?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="user-details">
                  <span className="user-name">{currentUser?.username || currentUser?.email || 'User'}</span>
                  <span className={`user-role-tag ${currentRoleObj.badgeClass}`}>
                    {currentRoleObj.label}
                  </span>
                </div>
              </div>

              <Link to="/change-password" className="nav-link nav-account-link">Change password</Link>
              <button type="button" className="btn btn-sm btn-secondary" onClick={logout}>Sign out</button>
            </>
          ) : (
            <Link to="/login" className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
