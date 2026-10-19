import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Features from "../components/Features";
import Benefits from "../components/Benefits";
import Roles from "../components/Roles";
import CTA from "../components/CTA";
import Footer from "../components/Footer";
import "../styles/landing.css";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Benefits />
        <Roles />
        <CTA />
      </main>
      <Footer />
    </>
  );
}