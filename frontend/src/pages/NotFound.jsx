import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page-container">
      <div className="not-found-card">
        <h1 className="not-found-title">404 - Page Not Found</h1>
        <p className="not-found-desc">The requested page or resource could not be found.</p>
        <Link to="/patients" className="btn btn-primary">
          Go to Patients
        </Link>
      </div>
    </div>
  );
}
