import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface ThemePreviewProps {
  primary: string;
  variant: string;
}

export function ThemePreview({ primary, variant }: ThemePreviewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {mounted && (
        <motion.div
          key={`${primary}-${variant}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className="relative"
          style={{
            '--primary': primary,
            '--primary-foreground': '#ffffff',
          } as React.CSSProperties}
        >
          <Card className="overflow-hidden border-2 transition-colors duration-300" 
                style={{ borderColor: variant === 'tint' ? primary + '20' : undefined }}>
            <CardHeader className={cn(
              "border-b transition-colors duration-300",
              variant === 'tint' && "bg-[var(--primary)]/5"
            )}>
              <CardTitle className="flex items-center gap-2">
                <span className={cn(
                  "transition-colors duration-300",
                  variant === 'gradient' && "bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/60 bg-clip-text text-transparent"
                )}>
                  Preview
                </span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs transition-colors duration-300",
                    variant === 'tint' && "border-[var(--primary)]/20 bg-[var(--primary)]/5"
                  )}
                >
                  {variant}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <motion.h3 
                  className={cn(
                    "text-2xl font-bold transition-colors duration-300",
                    variant === "gradient" && "bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/60 bg-clip-text text-transparent"
                  )}
                  animate={{ 
                    color: variant === 'tint' ? primary : undefined 
                  }}
                >
                  Sample Heading
                </motion.h3>
                <p className="text-muted-foreground">
                  This is how your form elements will look.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Button 
                  style={{ 
                    backgroundColor: variant === 'tint' ? `${primary}10` : primary,
                    borderColor: variant === 'tint' ? primary : undefined,
                    color: variant === 'tint' ? primary : '#fff'
                  }}
                  className="transition-colors duration-300"
                >
                  Primary Button
                </Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
              </div>

              <Card className="w-full">
                <CardHeader className={cn(
                  "transition-colors duration-300",
                  variant === 'tint' ? "bg-[var(--primary)]/5" : "bg-[var(--primary)]/10"
                )}>
                  <CardTitle className="text-sm">Card Example</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <motion.div 
                    className="h-20 rounded-lg"
                    animate={{ 
                      backgroundColor: variant === 'tint' ? `${primary}10` : `${primary}20`
                    }}
                    transition={{ duration: 0.5 }}
                  />
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}