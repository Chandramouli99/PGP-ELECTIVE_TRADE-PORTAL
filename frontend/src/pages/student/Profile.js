import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Profile() {
  const { user } = useAuth();
  return (
    <Layout title="Profile">
      <Card className="shadow-sm max-w-xl">
        <CardHeader><CardTitle>Your Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[["Name", user?.name], ["PGPID", user?.pgpid], ["Email", user?.email], ["Role", user?.role]].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b pb-3">
              <span className="tiny-label">{k}</span>
              <span className="text-sm font-medium">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </Layout>
  );
}
