import { Link, NavLink } from "react-router-dom";

const links = [
  ["/", "Home"],
  ["/create", "Create Project"],
  ["/dashboard", "Dashboard"],
  ["/submit", "Submit Website"],
  ["/report", "Verification Report"],
  ["/extensions", "Extension Requests"],
];

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="7" fill="var(--accent)" />
      <path d="M7 13.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Navigation() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <Mark />
          ProofWork
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="mode-pill" title="Projects are stored in this browser until the contract is connected">
          Demo mode
        </span>
      </div>
    </header>
  );
}
