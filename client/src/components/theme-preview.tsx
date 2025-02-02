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
            '--theme-primary': primary,
          } as React.CSSProperties}
        >
          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                Preview
                <Badge variant="outline" className="text-xs">
                  {variant}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <h3 className={cn(
                  "text-2xl font-bold",
                  variant === "gradient" && "bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60"
                )}>
                  Sample Heading
                </h3>
                <p className="text-muted-foreground">
                  This is how your form elements will look.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Button>Primary Button</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
              </div>

              <Card className="w-full">
                <CardHeader className="bg-primary/5">
                  <CardTitle className="text-sm">Card Example</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="h-20 rounded-lg bg-primary/10 animate-pulse" />
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
