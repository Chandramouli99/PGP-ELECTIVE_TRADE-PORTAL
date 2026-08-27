import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthCallback from "@/components/AuthCallback";
import { Loader2 } from "lucide-react";

import Login from "@/pages/Login";
import StudentDashboard from "@/pages/student/StudentDashboard";
import SubmitRequest from "@/pages/student/SubmitRequest";
import MyRequests from "@/pages/student/MyRequests";
import RequestDetail from "@/pages/student/RequestDetail";
import Notifications from "@/pages/student/Notifications";
import Profile from "@/pages/student/Profile";
import StudentTimetable from "@/pages/student/StudentTimetable";
import FullTimetable from "@/pages/student/FullTimetable";
import TradingBoard from "@/pages/student/TradingBoard";
import ResolveClash from "@/pages/student/ResolveClash";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminRequests from "@/pages/admin/AdminRequests";
import AdminClashes from "@/pages/admin/AdminClashes";
import AdminSwaps from "@/pages/admin/AdminSwaps";
import AdminTrading from "@/pages/admin/AdminTrading";
import AdminCapacity from "@/pages/admin/AdminCapacity";
import AdminFeasibility from "@/pages/admin/AdminFeasibility";
import AdminStudents from "@/pages/admin/AdminStudents";
import AdminCourses from "@/pages/admin/AdminCourses";
import AdminSections from "@/pages/admin/AdminSections";
import AdminImport from "@/pages/admin/AdminImport";
import AdminWindow from "@/pages/admin/AdminWindow";
import AdminAudit from "@/pages/admin/AdminAudit";

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
  }
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* Student */}
      <Route path="/dashboard" element={<Protected role="student"><StudentDashboard /></Protected>} />
      <Route path="/timetable" element={<Protected role="student"><StudentTimetable /></Protected>} />
      <Route path="/timetable/all" element={<Protected role="student"><FullTimetable /></Protected>} />
      <Route path="/resolve-clash" element={<Protected role="student"><ResolveClash /></Protected>} />
      <Route path="/submit" element={<Protected role="student"><SubmitRequest /></Protected>} />
      <Route path="/trading" element={<Protected role="student"><TradingBoard /></Protected>} />
      <Route path="/requests" element={<Protected role="student"><MyRequests /></Protected>} />
      <Route path="/requests/:id" element={<Protected role="student"><RequestDetail /></Protected>} />
      <Route path="/notifications" element={<Protected role="student"><Notifications /></Protected>} />
      <Route path="/profile" element={<Protected role="student"><Profile /></Protected>} />

      {/* Admin */}
      <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
      <Route path="/admin/requests" element={<Protected role="admin"><AdminRequests /></Protected>} />
      <Route path="/admin/clashes" element={<Protected role="admin"><AdminClashes /></Protected>} />
      <Route path="/admin/swaps" element={<Protected role="admin"><AdminSwaps /></Protected>} />
      <Route path="/admin/trading" element={<Protected role="admin"><AdminTrading /></Protected>} />
      <Route path="/admin/capacity" element={<Protected role="admin"><AdminCapacity /></Protected>} />
      <Route path="/admin/feasibility" element={<Protected role="admin"><AdminFeasibility /></Protected>} />
      <Route path="/admin/students" element={<Protected role="admin"><AdminStudents /></Protected>} />
      <Route path="/admin/courses" element={<Protected role="admin"><AdminCourses /></Protected>} />
      <Route path="/admin/sections" element={<Protected role="admin"><AdminSections /></Protected>} />
      <Route path="/admin/import" element={<Protected role="admin"><AdminImport /></Protected>} />
      <Route path="/admin/window" element={<Protected role="admin"><AdminWindow /></Protected>} />
      <Route path="/admin/audit" element={<Protected role="admin"><AdminAudit /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
