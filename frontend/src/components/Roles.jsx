const roles = ["Lab Manager", "Specimen Collector", "Lab Technician", "Pathologist", "Billing", "Physician"];

export default function Roles() {
  return (
    <section className="section section-white" id="roles">
      <div className="container narrow center">
        <h2>The right access for each person.</h2>
        <p className="lede-dark">
          Permissions follow the role. A Lab Manager creates every account, and
          accounts lock after five failed sign-ins.
        </p>
        <div className="tags">
          {roles.map((r) => (
            <span className="tag" key={r}>{r}</span>
          ))}
        </div>
      </div>
    </section>
  );
}