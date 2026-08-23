import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BG = "https://images.pexels.com/photos/37423357/pexels-photo-37423357.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.error) toast.error(location.state.error);
  }, [location.state]);

  useEffect(() => {
    if (!loading && user) navigate(user.role === "admin" ? "/admin" : "/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6">
      <img src={BG} alt="Academic library" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-slate-900/80" />
      <div className="relative w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg border p-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center">
              <ArrowLeftRight className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="font-serif-display text-2xl font-semibold leading-none">PGP Portal</p>
              <p className="tiny-label mt-1">Course Change Requests</p>
            </div>
          </div>
          <h2 className="text-3xl font-semibold mb-2">Welcome back</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Sign in with your institutional account to submit and track course change requests.
          </p>
          <Button
            data-testid="google-login-button"
            onClick={handleLogin}
            className="w-full h-12 text-base bg-primary hover:bg-primary/90"
          >
            <ShieldCheck className="h-5 w-5 mr-2" /> Sign in with Google
          </Button>
          <p className="text-xs text-muted-foreground mt-6 text-center">
            Only <span className="font-medium">@iim.ac.in</span> / <span className="font-medium">@iiml.ac.in</span> accounts are permitted.
          </p>
        </div>
      </div>
    </div>
  );
}
