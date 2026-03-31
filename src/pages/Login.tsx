import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import OwlLogo from "@/components/OwlLogo";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "login" | "register";

const Login = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, role } = useAuth();

  useEffect(() => {
    if (user && role) {
      navigate(role === "admin" ? "/admin" : "/", { replace: true });
    }
  }, [user, role, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast({ title: "Error", description: String(result.error), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      toast({ title: "Error", description: "Email and password are required", variant: "destructive" });
      return;
    }
    setLoading(true);

    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name || email },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "We sent you a confirmation link" });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Welcome back!" });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-24 pb-16 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="flex justify-center mb-8">
            <OwlLogo size="lg" />
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card">
            <div className="flex bg-secondary rounded-xl p-1 mb-6">
              {(["login", "register"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  className={`flex-1 text-xs font-display font-medium py-2 rounded-lg transition-all ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode(m)}
                >
                  {m === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            {/* Google Sign-In */}
            <Button
              variant="glass"
              size="lg"
              className="w-full mb-4"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground font-display">or</span></div>
            </div>

            <div className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Full Name</label>
                  <Input placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border text-foreground h-11" />
                </div>
              )}
              <div>
                <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Email</label>
                <Input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary border-border text-foreground h-11" />
              </div>
              <div>
                <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary border-border text-foreground h-11 pr-10"
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button variant="hero" size="lg" className="w-full" onClick={handleSubmit} disabled={loading}>
                <LogIn className="w-4 h-4" />
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
