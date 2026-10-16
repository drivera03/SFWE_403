import { AlertIcon } from "./Icons";

const specimens = [
  { id: "A-20416", test: "Lipid panel", status: "Approved", tone: "green" },
  { id: "A-20417", test: "Metabolic panel", status: "Awaiting pathologist", tone: "amber" },
  { id: "A-20418", test: "Complete blood count", status: "Running", tone: "blue" },
  { id: "A-20419", test: "Urinalysis", status: "Collected", tone: "gray" },
];

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="badge">Built for clinical laboratories</span>
          <h1>The management system for your clinical lab.</h1>
          <p className="lede">
            Track every specimen from intake to approved result. Manage patients,
            reagents, billing, and reports in one place.
          </p>
          <div className="hero-cta">
            <a href="/login" className="btn btn-blue btn-lg">Sign in to CLMS</a>
            <a href="#how" className="btn btn-light btn-lg">See how it works</a>
          </div>
        </div>

        <div className="mock-wrap">
          <div className="mock">
            <div className="mock-bar">
              <span className="dots"><i /><i /><i /></span>
              <span className="mock-title">Specimens</span>
            </div>
            <div className="mock-body">
              {specimens.map((s) => (
                <div className="mock-row" key={s.id}>
                  <span>
                    <strong>{s.id}</strong> <span className="muted">{s.test}</span>
                  </span>
                  <span className={`pill pill-${s.tone}`}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="float-card">
            <span className="float-icon">
              <AlertIcon size={20} />
            </span>
            <div>
              <strong>Critical result flagged</strong>
              <div className="muted small">Sent for immediate review</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}