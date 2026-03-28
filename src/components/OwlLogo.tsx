import owlLogo from "@/assets/owl-logo.png";

interface OwlLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-20 w-20",
};

const OwlLogo = ({ size = "md", className = "" }: OwlLogoProps) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src={owlLogo}
        alt="Foto Owl"
        className={`${sizes[size]} object-contain`}
      />
      <span className="font-display font-bold text-foreground tracking-tight">
        FOTO <span className="text-gradient-gold">OWL</span>
      </span>
    </div>
  );
};

export default OwlLogo;
