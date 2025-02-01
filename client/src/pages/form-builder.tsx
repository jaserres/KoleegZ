import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Save, ArrowLeft, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formTemplates } from "@/lib/form-templates";
import type { SelectVariable } from "@db/schema";
import { ThemeSelector } from "@/components/theme-selector";

export default function FormBuilder() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showEditor, setShowEditor] = useState(false);
  const [templateContent, setTemplateContent] = useState("");
  const [formTheme, setFormTheme] = useState<{ primary: string; variant: string }>({
    primary: "#64748b",
    variant: "default",
  });

  const { data: form } = useQuery({
    queryKey: [`/api/forms/${id}`],
    enabled: !!id,
  });

  const [formName, setFormName] = useState("");
  const [variables, setVariables] = useState<Array<Partial<SelectVariable>>>([]);

  // Efecto para cargar datos del formulario cuando se obtienen
  useEffect(() => {
    if (form) {
      setFormName(form.name);
      setVariables(form.variables || []);
    }
  }, [form]);

  // Efecto para cargar plantilla seleccionada
  useEffect(() => {
    const templateData = sessionStorage.getItem("selectedTemplate");
    if (templateData && !id) {
      try {
        const template = JSON.parse(templateData);
        setFormName(template.name);
        setVariables(template.variables);
        setTemplateContent(template.template || "");
        setShowEditor(true);
        sessionStorage.removeItem("selectedTemplate");
      } catch (error) {
        console.error("Error parsing template data:", error);
      }
    }
  }, [id]);

  const createFormMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/forms", { 
        name: formName,
        theme: formTheme
      });
      const form = await res.json();

      // Create variables
      for (const variable of variables) {
        await apiRequest("POST", `/api/forms/${form.id}/variables`, variable);
      }

      return form;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({
        title: "Éxito",
        description: "Formulario creado exitosamente",
      });
      setLocation("/");
    },
  });

  const updateFormMutation = useMutation({
    mutationFn: async () => {
      if (!id) return;

      // Update form name and theme
      await apiRequest("PATCH", `/api/forms/${id}`, { 
        name: formName,
        theme: formTheme 
      });

      // Update variables
      for (const variable of variables) {
        if (variable.id) {
          await apiRequest("PATCH", `/api/forms/${id}/variables/${variable.id}`, variable);
        } else {
          await apiRequest("POST", `/api/forms/${id}/variables`, variable);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}`] });
      toast({
        title: "Éxito",
        description: "Formulario actualizado exitosamente",
      });
      setLocation("/");
    },
  });

  const extractVariables = (template: string) => {
    const variableRegex = /{{([^}]+)}}/g;
    const matches = template.match(variableRegex) || [];
    const uniqueVariables = new Set(matches.map(match => match.slice(2, -2)));

    return Array.from(uniqueVariables).map(varName => ({
      name: varName,
      label: varName.split(/(?=[A-Z])/).join(' '), // Convert camelCase to spaces
      type: 'text' // Default type
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Verificar que sea un archivo .txt
      if (!file.name.toLowerCase().endsWith('.txt')) {
        toast({
          title: "Error al cargar archivo",
          description: "Solo se permiten archivos .txt",
          variant: "destructive"
        });
        return;
      }

      try {
        const text = await file.text();
        const sanitizedText = text
          .replace(/\0/g, '')
          .replace(/[^\x20-\x7E\x0A\x0D]/g, '');

        setTemplateContent(sanitizedText);
        const detectedVariables = extractVariables(sanitizedText);

        if (detectedVariables.length === 0) {
          toast({
            title: "No se encontraron variables",
            description: "La plantilla no contiene variables en formato {{nombreVariable}}",
            variant: "destructive"
          });
          return;
        }

        setFormName(file.name.split('.')[0]);
        setVariables(detectedVariables);
        setShowEditor(true);

        toast({
          title: "Plantilla cargada",
          description: `Se detectaron ${detectedVariables.length} variables en la plantilla`,
        });
      } catch (error) {
        toast({
          title: "Error al cargar archivo",
          description: "El archivo debe ser un documento de texto válido",
          variant: "destructive"
        });
      }
    }
  };

  const renderFormEditor = () => (
    <Card>
      <CardHeader>
        <CardTitle>Configurar Formulario</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <Label htmlFor="formName">Nombre del Formulario</Label>
          <Input
            id="formName"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="max-w-md"
            placeholder="Ingrese el nombre del formulario"
            required
          />
        </div>
        <div className="space-y-4">
          <Label>Tema del Formulario</Label>
          <Card>
            <CardContent className="pt-6">
              <ThemeSelector
                onThemeChange={setFormTheme}
                defaultColor={form?.theme?.primary}
                defaultVariant={form?.theme?.variant}
              />
            </CardContent>
          </Card>
        </div>
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Variables</h2>
            <Button
              onClick={() =>
                setVariables([
                  ...variables,
                  { name: "", label: "", type: "text" },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar Variable
            </Button>
          </div>

          <div className="space-y-4">
            {variables.map((variable, index) => (
              <Card key={variable.id || index}>
                <CardContent className="pt-6 grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Nombre Interno (camelCase)</Label>
                    <Input
                      value={variable.name}
                      onChange={(e) =>
                        setVariables(
                          variables.map((v, i) =>
                            i === index
                              ? { ...v, name: e.target.value }
                              : v
                          )
                        )
                      }
                      placeholder="nombreVariable"
                      required
                    />
                  </div>
                  <div>
                    <Label>Etiqueta</Label>
                    <Input
                      value={variable.label}
                      onChange={(e) =>
                        setVariables(
                          variables.map((v, i) =>
                            i === index
                              ? { ...v, label: e.target.value }
                              : v
                          )
                        )
                      }
                      placeholder="Nombre de la Variable"
                      required
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={variable.type}
                      onValueChange={(value) =>
                        setVariables(
                          variables.map((v, i) =>
                            i === index
                              ? { ...v, type: value }
                              : v
                          )
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto</SelectItem>
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="date">Fecha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Button
          size="lg"
          onClick={() => id ? updateFormMutation.mutate() : createFormMutation.mutate()}
          disabled={createFormMutation.isPending || updateFormMutation.isPending || !formName}
        >
          <Save className="mr-2 h-4 w-4" />
          {id ? "Actualizar Formulario" : "Guardar Formulario"}
        </Button>
      </CardContent>
    </Card>
  );

  if (!id) {
    return (
      <div className="container mx-auto py-8">
        <Button
          variant="ghost"
          className="mb-8"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a Formularios
        </Button>

        <div className="space-y-8">
          {!showEditor ? (
            <>
              <h1 className="text-3xl font-bold">Crear Nuevo Formulario</h1>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {formTemplates.map((template) => (
                  <Card 
                    key={template.name} 
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      setFormName(template.name);
                      setVariables(template.variables);
                      setShowEditor(true);
                    }}
                  >
                    <CardHeader>
                      <CardTitle>{template.name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {template.variables.length} variables predefinidas
                      </p>
                    </CardContent>
                  </Card>
                ))}
                <Card 
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => {
                    setFormName("");
                    setVariables([]);
                    setShowEditor(true);
                  }}
                >
                  <CardHeader>
                    <CardTitle>Formulario en Blanco</CardTitle>
                    <CardDescription>Crear un formulario desde cero</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Plus className="h-8 w-8 text-muted-foreground" />
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:bg-accent transition-colors">
                  <CardHeader>
                    <CardTitle>Cargar Plantilla</CardTitle>
                    <CardDescription>Crear formulario desde una plantilla de texto</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Input
                        type="file"
                        accept=".txt"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="template-upload"
                      />
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => document.getElementById('template-upload')?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Subir Plantilla (.txt)
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">
                  {formName || "Nuevo Formulario"}
                </h1>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowEditor(false);
                    setFormName("");
                    setVariables([]);
                    setTemplateContent("");
                  }}
                >
                  Cambiar Plantilla
                </Button>
              </div>
              {renderFormEditor()}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Button
        variant="ghost"
        className="mb-8"
        onClick={() => setLocation("/")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a Formularios
      </Button>

      <div className="space-y-8">
        {renderFormEditor()}
      </div>
    </div>
  );
}