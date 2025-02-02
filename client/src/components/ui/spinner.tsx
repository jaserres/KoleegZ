import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "dots" | "pulse" | "bounce" | "default";
  size?: "sm" | "md" | "lg";
}

export function Spinner({ 
  variant = "default", 
  size = "md",
  className,
  ...props 
}: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };

  if (variant === "dots") {
    return (
      <div className={cn("flex space-x-1", className)} {...props}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "animate-bounce rounded-full bg-foreground",
              sizeClasses[size],
              i === 1 && "animation-delay-200",
              i === 2 && "animation-delay-400"
            )}
            style={{
              animationDuration: "0.6s"
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div 
        className={cn(
          "relative flex items-center justify-center",
          sizeClasses[size],
          className
        )} 
        {...props}
      >
        <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-75" />
        <div className="rounded-full bg-primary p-2" />
      </div>
    );
  }

  if (variant === "bounce") {
    return (
      <div 
        className={cn(
          "flex items-center justify-center space-x-1",
          className
        )} 
        {...props}
      >
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 w-2 animate-bounce rounded-full bg-primary",
              i === 1 && "animation-delay-100",
              i === 2 && "animation-delay-200",
              i === 3 && "animation-delay-300",
              i === 4 && "animation-delay-400"
            )}
            style={{
              animationDuration: "0.8s"
            }}
          />
        ))}
      </div>
    );
  }

  // Default spinner (rotating border)
  return (
    <div 
      className={cn(
        "animate-spin rounded-full border-4 border-primary border-t-transparent",
        sizeClasses[size],
        className
      )} 
      {...props}
    />
  );
}
