import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Input } from "./ui/input";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemePreview } from "./theme-preview";

const presetColors = [
  { name: "Slate", value: "#64748b" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

const variants = [
  { name: "Default", value: "default" },
  { name: "Tint", value: "tint" },
  { name: "Gradient", value: "gradient" },
] as const;

interface ThemeSelectorProps {
  onThemeChange: (theme: { primary: string; variant: string }) => void;
  defaultColor?: string;
  defaultVariant?: string;
}

export function ThemeSelector({
  onThemeChange,
  defaultColor = presetColors[0].value,
  defaultVariant = "default",
}: ThemeSelectorProps) {
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [customColor, setCustomColor] = useState("");
  const [variant, setVariant] = useState<string>(defaultVariant);

  useEffect(() => {
    onThemeChange({ primary: selectedColor, variant });
  }, [selectedColor, variant, onThemeChange]);

  return (
    <div className="space-y-6">
      <div>
        <Label>Primary Color</Label>
        <div className="grid grid-cols-7 gap-2 mt-2">
          {presetColors.map((color) => (
            <Button
              key={color.value}
              variant="outline"
              className={cn(
                "w-full h-10 p-0 aspect-square relative overflow-hidden transition-all duration-300",
                selectedColor === color.value && "ring-2 ring-primary"
              )}
              style={{ backgroundColor: color.value }}
              onClick={() => setSelectedColor(color.value)}
            >
              {selectedColor === color.value && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
              <span className="sr-only">Select {color.name}</span>
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label>Custom Color</Label>
        <div className="flex gap-2 mt-2">
          <Input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-10 h-10 p-1"
          />
          <Input
            type="text"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            placeholder="#000000"
            className="flex-1"
          />
          <Button
            variant="secondary"
            onClick={() => setSelectedColor(customColor)}
            disabled={!customColor}
          >
            Apply
          </Button>
        </div>
      </div>

      <div>
        <Label>Variant</Label>
        <RadioGroup
          value={variant}
          onValueChange={setVariant}
          className="grid grid-cols-3 gap-4 mt-2"
        >
          {variants.map((v) => (
            <Label
              key={v.value}
              className={cn(
                "flex items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-300",
                variant === v.value
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-primary/50"
              )}
            >
              <RadioGroupItem value={v.value} className="sr-only" />
              {v.name}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="pt-4">
        <ThemePreview primary={selectedColor} variant={variant} />
      </div>
    </div>
  );
}