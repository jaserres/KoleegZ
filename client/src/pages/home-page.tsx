import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Plus, FileText, Trash2, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

interface FormPermissions {
  canEdit: boolean;
  canMerge: boolean;
  canDelete: boolean;
  canShare: boolean;
  canViewEntries: boolean;
}

interface Form {
  id: number;
  name: string;
  variables: any[];
  isShared?: boolean;
  permissions?: FormPermissions;
}

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: forms = [], isLoading } = useQuery<Form[]>({ 
    queryKey: ["/api/forms"]
  });

  const deleteFormMutation = useMutation({
    mutationFn: async (formId: number) => {
      try {
        const response = await apiRequest("DELETE", `/api/forms/${formId}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Error al eliminar el formulario");
        }
        return formId;
      } catch (error) {
        console.error("Error en deleteFormMutation:", error);
        throw error;
      }
    },
    onSuccess: (formId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({
        title: "Éxito",
        description: "Formulario eliminado correctamente",
      });
    },
    onError: (error: Error) => {
      console.error("Error al eliminar formulario:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el formulario",
        variant: "destructive",
      });
    },
  });

  const handleDeleteForm = async (formId: number) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este formulario?")) {
      try {
        await deleteFormMutation.mutateAsync(formId);
      } catch (error) {
        console.error("Error en handleDeleteForm:", error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Tus Formularios</h1>
          <p className="text-muted-foreground">
            {user?.isPremium ? "Cuenta premium" : "Cuenta gratuita"}
          </p>
        </div>
        <Link href="/forms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Formulario
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {forms.map((form: Form) => (
          <Card key={form.id} className={form.isShared ? "border-primary/50" : ""}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{form.name}</CardTitle>
                    {form.isShared && (
                      <Badge variant="outline" className="gap-1">
                        <Share2 className="h-3 w-3" />
                        Compartido
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    {form.variables?.length} variables
                  </CardDescription>
                </div>
                {(!form.isShared || form.permissions?.canDelete) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-100"
                    onClick={() => handleDeleteForm(form.id)}
                    disabled={deleteFormMutation.isPending}
                  >
                    {deleteFormMutation.isPending ? (
                      <Spinner variant="pulse" size="sm" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {(!form.isShared || form.permissions?.canEdit) && (
                  <Link href={`/forms/${form.id}`}>
                    <Button variant="outline">
                      Editar Formulario
                    </Button>
                  </Link>
                )}
                {(!form.isShared || form.permissions?.canViewEntries) && (
                  <Link href={`/forms/${form.id}/entries`}>
                    <Button variant="outline">
                      <FileText className="mr-2 h-4 w-4" />
                      Ver Entradas
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}