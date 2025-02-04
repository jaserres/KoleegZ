import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";

export default function FormBuilder() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Test query to verify data loading
  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.TEST],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Implementation here
      toast({
        title: "Success",
        description: "Form saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save form",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Form Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Form Title</Label>
              <Input id="title" placeholder="Enter form title" />
            </div>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Form
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
