import { UsersIcon, PackageIcon, CheckCircleIcon, ChartIcon } from "./Icons";

const features = [
  { icon: <UsersIcon size={26} />, tone: "blue", title: "Patients and tests", text: "Keep patient records, insurance details, and full test history together." },
  { icon: <PackageIcon size={26} />, tone: "purple", title: "Inventory and reagents", text: "Get alerts for low stock and expiring reagents. Expired lots can't be used on a test." },
  { icon: <CheckCircleIcon size={26} />, tone: "amber", title: "Results and approvals", text: "Match analyzer output by barcode, then route it through technician and pathologist sign-off." },
  { icon: <ChartIcon size={26} />, tone: "green", title: "Billing and reports", text: "Check out patients, track insurance claims, and run financial and compliance reports." },
];

export default function Features() {
  return (
    <section className="section section-white" id="features">
      <div className="container">
        <div className="section-head">
          <h2>Everything your lab runs on.</h2>
          <p>Replace separate spreadsheets and paperwork with one connected system.</p>
        </div>
        <div className="feature-grid">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className={`feature-icon tone-${f.tone}`}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}