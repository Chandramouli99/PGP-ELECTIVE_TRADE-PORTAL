import { Phone, Mail } from "lucide-react";

// Edit these to change the support contact shown on login + across the portal.
export const SUPPORT = {
  name: "Chandramouli",
  role: "Academic Secretary",
  phone: "9490848306",
  email: "pgp41473@iiml.ac.in",
};

export function SupportContact({ className = "" }) {
  return (
    <p
      data-testid="support-contact"
      className={`text-xs text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${className}`}
    >
      <span>
        For any issues, please reach out to{" "}
        <span className="font-medium text-foreground/80">{SUPPORT.name}</span>
        <span className="text-muted-foreground/70"> · {SUPPORT.role}</span>
      </span>
      <a href={`tel:${SUPPORT.phone}`} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        <Phone className="h-3 w-3" /> {SUPPORT.phone}
      </a>
      <a href={`mailto:${SUPPORT.email}`} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        <Mail className="h-3 w-3" /> {SUPPORT.email}
      </a>
    </p>
  );
}
