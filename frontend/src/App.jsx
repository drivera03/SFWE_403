import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChangePassword from './pages/ChangePassword';
import ProtectedRoute from './components/ProtectedRoute';
import PatientList from './pages/PatientList';
import PatientDetail from './pages/PatientDetail';
import PatientEdit from './pages/PatientEdit';
import NotFound from './pages/NotFound';
import './index.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/patients"
                element={
                  <>
                    <Navbar />
                    <main className="main-content">
                      <PatientList />
                    </main>
                  </>
                }
              />
              <Route
                path="/patients/:id"
                element={
                  <>
                    <Navbar />
                    <main className="main-content">
                      <PatientDetail />
                    </main>
                  </>
                }
              />
              <Route
                path="/patients/:id/edit"
                element={
                  <>
                    <Navbar />
                    <main className="main-content">
                      <PatientEdit />
                    </main>
                  </>
                }
              />
              <Route
                path="/change-password"
                element={
                  <>
                    <Navbar />
                    <main className="main-content">
                      <ChangePassword />
                    </main>
                  </>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
