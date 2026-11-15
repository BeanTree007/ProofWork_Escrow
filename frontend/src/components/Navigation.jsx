import { NavLink } from "react-router-dom";

const links = [
  ["/", "Home"],
  ["/create", "Create Project"],
  ["/dashboard", "Dashboard"],
  ["/submit", "Submit Website"],
  ["/report", "Verification Report"],
  ["/extensions", "Extension Requests"],
];

export default function Navigation() {
  return (
    <header>
      <nav aria-label="Main navigation">
        <strong>ProofWork</strong>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
