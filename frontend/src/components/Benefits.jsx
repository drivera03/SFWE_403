import { CheckIcon } from "./Icons";

const reagents = [
  { lot: "Lot 4471", note: "Expires in 142 days", label: "Available", tone: "green" },
  { lot: "Lot 3902", note: "Expires in 12 days", label: "Expiring soon", tone: "amber" },
  { lot: "Lot 3310", note: "Expired", label: "Blocked", tone: "red" },
];

const approvalSteps = [
  { text: "Result received from analyzer", state: "done", mark: <CheckIcon size={14} /> },
  { text: "Technician approved", state: "done", mark: <CheckIcon size={14} /> },
  { text: "Waiting for pathologist", state: "now", mark: "2" },
  { text: "Released to physician and patient", state: "later", mark: "3" },
];

export default function Benefits() {
  return (
    <section className="section" id="how">
      <div className="container">
        <div className="row">
          <div className="row-text">
            <h2>Stop bad reagents before they reach a test.</h2>
            <p>
              CLMS checks reagent availability when a test is created. Expired or
              unavailable lots are blocked, and each specimen barcode can only be
              printed once.
            </p>
            <ul className="checks">
              <li>Low-stock and expiring-soon alerts</li>
              <li>One-time barcode printing for specimen collectors</li>
              <li>Every inventory change recorded in the activity log</li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-title">Reagent check</div>
            {reagents.map((r) => (
              <div className={`panel-row row-${r.tone}`} key={r.lot}>
                <span>{r.lot} <span className="muted">{r.note}</span></span>
                <span className={`status status-${r.tone}`}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="row row-reverse">
          <div className="row-text">
            <h2>Two sign-offs before any result is released.</h2>
            <p>
              A technician and a pathologist both approve each result. Until then
              it stays hidden from the patient and physician, and critical values
              are flagged right away.
            </p>
          </div>
          <div className="panel">
            <div className="panel-title">Specimen A-20418</div>
            <ol className="steps">
              {approvalSteps.map((s) => (
                <li className={`step step-${s.state}`} key={s.text}>
                  <span className="step-dot">{s.mark}</span> {s.text}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}