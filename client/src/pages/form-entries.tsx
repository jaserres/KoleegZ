import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";

export default function FormEntries() {
  const { toast } = useToast();

  // Test query to verify data loading
  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.ENTRIES],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Form Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            No entries found
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
