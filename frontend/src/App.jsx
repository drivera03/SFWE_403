import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChangePassword from './pages/ChangePassword';
import ProtectedRoute from './components/ProtectedRoute';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import PatientEdit from './pages/PatientEdit';
import PatientTests from './pages/PatientTests';
import TestDetail from './pages/TestDetail';
import TestIntake from './pages/TestIntake';
import UnlockUser from './pages/UnlockUser';
import NotFound from './pages/NotFound';
import './index.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="patient-page">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/patients" element={<Patients />} />
              <Route
                path="/patients/:id"
                element={
                  <>
                    <Navbar />
                    <PatientDetail />
                  </>
                }
              />
              <Route
                path="/patients/:id/edit"
                element={
                  <>
                    <Navbar />
                    <PatientEdit />
                  </>
                }
              />
              <Route
                path="/patients/:id/tests"
                element={
                  <>
                    <Navbar />
                    <PatientTests />
                  </>
                }
              />
              <Route
                path="/patients/:id/tests/:testId"
                element={
                  <>
                    <Navbar />
                    <TestDetail />
                  </>
                }
              />
              <Route path="/patients/:id/tests/new" element={<TestIntake />} />
              <Route path="/patients/:id/intake" element={<TestIntake />} />
              <Route path="/tests/intake" element={<TestIntake />} />
              <Route path="/test/intake" element={<TestIntake />} />
              <Route path="/tests/new" element={<TestIntake />} />
              <Route
                path="/change-password"
                element={
                  <>
                    <Navbar />
                    <ChangePassword />
                  </>
                }
              />
              <Route
                path="/unlock-accounts"
                element={
                  <>
                    <Navbar />
                    <UnlockUser />
                  </>
                }
              />
            </Route>
            <Route
              path="*"
              element={
                <>
                  <Navbar />
                  <NotFound />
                </>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
