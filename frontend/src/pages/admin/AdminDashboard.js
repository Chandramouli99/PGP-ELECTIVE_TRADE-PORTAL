import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Users, GraduationCap, Layers, Inbox, Clock, GitCompareArrows } from "lucide-react";

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <Card className="shadow-sm" data-testid={`stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="tiny-label">{label}</p>
          <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-primary/50"}`} />
        </div>
        <p className="text-3xl font-semibold mt-2">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/dashboard").then((r) => setD(r.data)); }, []);
  if (!d) return <Layout title="Dashboard"><div /></Layout>;

  const chart = [
    { name: "Add", value: d.add_requests },
    { name: "Drop", value: d.drop_requests },
    { name: "Add+Drop", value: d.add_drop_requests },
    { name: "Course Swap", value: d.course_swaps },
    { name: "Section Swap", value: d.section_swaps },
  ];

  return (
    <Layout title="Admin Dashboard">
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Total Students" value={d.total_students} icon={Users} />
          <Stat label="Total Courses" value={d.total_courses} icon={GraduationCap} />
          <Stat label="Total Sections" value={d.total_sections} icon={Layers} />
          <Stat label="Total Requests" value={d.total_requests} icon={Inbox} />
          <Stat label="Awaiting Admin Review" value={d.awaiting_admin_review} icon={Clock} accent />
          <Stat label="Pending Swap Confirmations" value={d.pending_swap_confirmations} icon={GitCompareArrows} accent />
          <Stat label="Course Swaps" value={d.course_swaps} icon={GitCompareArrows} />
          <Stat label="Section Swaps" value={d.section_swaps} icon={GitCompareArrows} />
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <p className="tiny-label mb-4">Requests by Type</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0A192F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
