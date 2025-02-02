import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, FileText, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: forms, refetch } = useQuery({ 
    queryKey: ["/api/forms"]
  });

  const deleteFormMutation = useMutation({
    mutationFn: async (formId: number) => {
      const response = await apiRequest("DELETE", `/api/forms/${formId}`);
      if (!response.ok) {
        throw new Error("Error al eliminar el formulario");
      }
      return formId;
    },
    onSuccess: (formId) => {
      // Invalidar la caché y volver a obtener los formularios
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      refetch();

      toast({
        title: "Éxito",
        description: "Formulario eliminado correctamente",
      });
    },
    onError: (error) => {
      console.error("Error al eliminar formulario:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el formulario",
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
        {forms?.map((form: any) => (
          <Card key={form.id}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{form.name}</CardTitle>
                  <CardDescription>
                    {form.variables?.length} variables
                  </CardDescription>
                </div>
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
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Link href={`/forms/${form.id}`}>
                  <Button variant="outline">
                    Editar Formulario
                  </Button>
                </Link>
                <Link href={`/forms/${form.id}/entries`}>
                  <Button variant="outline">
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Entradas
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