export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div className="footer-logo">CLMS</div>
          <p>Clinical Laboratory Management System. A course project.</p>
        </div>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#roles">Roles</a>
          <a href="/login">Sign in</a>
        </div>
      </div>
    </footer>
  );
}