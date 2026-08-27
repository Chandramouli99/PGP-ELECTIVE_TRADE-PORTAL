import { Badge } from "@/components/ui/badge";

export const REQUEST_TYPE_LABELS = {
  ADD: "Add Course",
  DROP: "Drop Course",
  ADD_DROP: "Add + Drop",
  COURSE_SWAP: "Course Swap",
  SECTION_SWAP: "Section Swap",
  CLASH_RESOLUTION: "Clash Resolution",
};

export const STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED_PENDING_EXECUTION: "Approved — Pending Execution",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  EXECUTED: "Executed",
  AWAITING_PARTNER_CONFIRMATION: "Awaiting Partner Confirmation",
  PARTNER_REJECTED: "Partner Rejected",
  BOTH_CONFIRMED: "Both Confirmed — Awaiting Admin",
};

const STYLES = {
  SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200",
  UNDER_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED_PENDING_EXECUTION: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
  EXECUTED: "bg-primary/10 text-primary border-primary/20",
  AWAITING_PARTNER_CONFIRMATION: "bg-purple-50 text-purple-700 border-purple-200",
  PARTNER_REJECTED: "bg-red-50 text-red-700 border-red-200",
  BOTH_CONFIRMED: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

export function StatusBadge({ status }) {
  return (
    <Badge
      variant="outline"
      data-testid={`status-badge-${status}`}
      className={`font-medium ${STYLES[status] || "bg-slate-100 text-slate-600"}`}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}
