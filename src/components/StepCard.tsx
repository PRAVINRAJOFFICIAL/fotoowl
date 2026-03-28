import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StepCardProps {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  delay?: number;
}

const StepCard = ({ step, title, description, icon: Icon, delay = 0 }: StepCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
      className="relative bg-gradient-card border border-border rounded-2xl p-8 shadow-card group hover:border-primary/30 transition-colors duration-300"
    >
      <div className="absolute -top-4 left-8 bg-gradient-hero text-primary-foreground font-display font-bold text-sm w-8 h-8 rounded-full flex items-center justify-center">
        {step}
      </div>
      <div className="mb-4 mt-2">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="w-7 h-7 text-primary" />
        </div>
      </div>
      <h3 className="font-display font-semibold text-lg text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </motion.div>
  );
};

export default StepCard;
