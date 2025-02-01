import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, FileText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { user } = useAuth();
  const { data: forms } = useQuery({ 
    queryKey: ["/api/forms"]
  });

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Your Forms</h1>
          <p className="text-muted-foreground">
            {user?.isPremium ? "Premium account" : "Free account"}
          </p>
        </div>
        <Link href="/forms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Form
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {forms?.map((form) => (
          <Card key={form.id}>
            <CardHeader>
              <CardTitle>{form.name}</CardTitle>
              <CardDescription>
                {form.variables?.length} variables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Link href={`/forms/${form.id}`}>
                  <Button variant="outline">
                    Edit Form
                  </Button>
                </Link>
                <Link href={`/forms/${form.id}/entries`}>
                  <Button variant="outline">
                    <FileText className="mr-2 h-4 w-4" />
                    View Entries
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
