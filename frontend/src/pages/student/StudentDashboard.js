import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, FilePlus2, BookOpen } from "lucide-react";

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/student/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const win = data?.window;

  return (
    <Layout title="Dashboard">
      {data && (
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-semibold">Welcome, {data.name}</h2>
            <p className="text-muted-foreground mt-1">PGPID: <span className="font-medium text-foreground">{data.pgpid}</span></p>
          </div>

          {/* Window banner */}
          <div
            data-testid="window-banner"
            className={`rounded-lg border p-4 flex items-center gap-3 ${
              win?.is_open ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            {win?.is_open ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            <div>
              <p className="font-medium">{win?.message}</p>
              {win?.is_open && (
                <Button
                  size="sm"
                  data-testid="dashboard-submit-cta"
                  className="mt-2 bg-primary hover:bg-primary/90"
                  onClick={() => navigate("/submit")}
                >
                  <FilePlus2 className="h-4 w-4 mr-2" /> Submit a Course Request
                </Button>
              )}
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">Your Current Courses</CardTitle>
            </CardHeader>
            <CardContent>
              {data.courses.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6 text-center">
                  No enrollments found for your account yet. Please contact the administrator.
                </p>
              ) : (
                <Table data-testid="current-courses-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Section</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.courses.map((c) => (
                      <TableRow key={c.course_id} data-testid={`course-row-${c.course_code}`}>
                        <TableCell className="font-medium">{c.course_name}</TableCell>
                        <TableCell>{c.section_name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
