import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AutoSaveOptions {
  onSave?: () => void;
  debounceMs?: number;
  showToast?: boolean;
}

export function useAutoSave<T>(
  endpoint: string,
  data: T,
  options: AutoSaveOptions = {}
) {
  const { debounceMs = 1000, showToast = true, onSave } = options;
  const [saving, setSaving] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<T>(data);
  const { toast } = useToast();

  const save = useCallback(
    async (dataToSave: T) => {
      if (JSON.stringify(dataToSave) === JSON.stringify(lastSavedData)) {
        return;
      }

      setSaving(true);
      try {
        await apiRequest("PATCH", endpoint, dataToSave);
        setLastSavedData(dataToSave);
        if (showToast) {
          toast({
            description: "Changes saved automatically",
            duration: 2000,
          });
        }
        onSave?.();
      } catch (error) {
        console.error("Auto-save failed:", error);
        if (showToast) {
          toast({
            title: "Failed to save changes",
            description: "Your changes could not be saved automatically",
            variant: "destructive",
          });
        }
      } finally {
        setSaving(false);
      }
    },
    [endpoint, lastSavedData, onSave, showToast, toast]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      save(data);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [data, debounceMs, save]);

  return {
    saving,
    lastSavedAt: lastSavedData ? new Date() : null,
  };
}
