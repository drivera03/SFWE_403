import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ChangePassword from "./pages/ChangePassword";
import Patients from "./pages/Patients";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/patients" element={<Patients />} />
        <Route path= "/change-password" element={<ChangePassword />} />
      </Routes>
    </BrowserRouter>
  );
}
