import { motion } from "framer-motion";
import { QrCode, Camera, Images, ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import StepCard from "@/components/StepCard";
import heroImage from "@/assets/hero-event.jpg";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Event" className="w-full h-full object-cover opacity-20" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
        <div className="relative container flex flex-col items-center text-center py-24 md:py-36 gap-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-display font-medium px-4 py-1.5 rounded-full mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered Photo Recognition
            </span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="font-display font-bold text-4xl md:text-6xl lg:text-7xl max-w-4xl leading-tight">
            Find Your Event Photos with{" "}
            <span className="text-gradient-gold">AI Face Recognition</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="text-muted-foreground text-lg md:text-xl max-w-2xl">
            Upload a selfie. Our AI finds every photo of you from the event. It's that simple.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }} className="flex flex-col sm:flex-row gap-4">
            <Button variant="hero" size="xl" onClick={() => navigate("/join")}>
              Find My Photos
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="glass" size="xl" onClick={() => navigate(user ? "/admin" : "/login")}>
              I am Event Management
            </Button>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="container py-20 md:py-28">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-16">
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-4">Three Simple Steps</h2>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">From scanning a QR code to downloading your photos in seconds</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          <StepCard step={1} title="Join the Event" description="Scan the QR code at the venue or enter the event code to join instantly." icon={QrCode} delay={0} />
          <StepCard step={2} title="Upload a Selfie" description="Take a quick selfie. Our AI will use it to find you in all event photos." icon={Camera} delay={0.15} />
          <StepCard step={3} title="Get Your Photos" description="Browse, download, and share every photo you appear in. It's magical." icon={Images} delay={0.3} />
        </div>
      </section>

      {/* Features */}
      <section className="container py-20 border-t border-border">
        <div className="grid md:grid-cols-3 gap-12">
          {[
            { icon: Sparkles, title: "AI-Powered", desc: "Advanced face recognition finds you in thousands of photos" },
            { icon: Shield, title: "Private & Secure", desc: "Your photos and face data are encrypted and private" },
            { icon: Zap, title: "Lightning Fast", desc: "Results in seconds, even with 1000+ event photos" },
          ].map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="container text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} Foto Owl Clone. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Index;
