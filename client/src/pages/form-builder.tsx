import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Save, ArrowLeft, Upload, Download } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formTemplates } from "@/lib/form-templates";
import type { SelectVariable } from "@db/schema";
import { ThemeSelector } from "@/components/theme-selector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function FormBuilder() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [templateContent, setTemplateContent] = useState("");
  const [originalFile, setOriginalFile] = useState<string | null>(null);
  const [originalMimeType, setOriginalMimeType] = useState<string | null>(null);
  const [formTheme, setFormTheme] = useState<{ primary: string; variant: string }>({
    primary: "#64748b",
    variant: "default",
  });
  const [previewContent, setPreviewContent] = useState<{
    name: string;
    template: string;
    preview: string;
    originalFile?: string;
    originalMimeType?: string;
    variables: Array<Partial<SelectVariable>>;
  } | null>(null);

  const variableLimit = user?.isPremium ? 50 : 10;

  const { data: form } = useQuery({
    queryKey: [`/api/forms/${id}`],
    enabled: !!id,
  });

  const [formName, setFormName] = useState("");
  const [variables, setVariables] = useState<Array<Partial<SelectVariable>>>([]);

  // Effect to load form data when obtained
  useEffect(() => {
    if (form) {
      setFormName(form.name);
      setVariables(form.variables || []);
    }
  }, [form]);

  // Effect to load selected template
  useEffect(() => {
    const templateData = sessionStorage.getItem("selectedTemplate");
    if (templateData && !id) {
      try {
        const template = JSON.parse(templateData);
        // Check variable limit before loading template
        if (template.variables.length > variableLimit) {
          toast({
            title: "Límite de variables excedido",
            description: `Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario. Actualiza a premium para aumentar este límite.`,
            variant: "destructive"
          });
          return;
        }
        setFormName(template.name);
        setVariables(template.variables);
        setTemplateContent(template.template || "");
        setOriginalFile(template.originalFile || null);
        setOriginalMimeType(template.originalMimeType || null);
        setShowEditor(true);
        sessionStorage.removeItem("selectedTemplate");
      } catch (error) {
        console.error("Error parsing template data:", error);
      }
    }
  }, [id, variableLimit, user?.isPremium]);

  const createFormMutation = useMutation({
    mutationFn: async () => {
      // Check variable limit before creating form
      if (variables.length > variableLimit) {
        throw new Error(`Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario.`);
      }

      // Validar que todas las variables tengan nombre y etiqueta
      const invalidVariables = variables.filter(v => !v.name || !v.label);
      if (invalidVariables.length > 0) {
        throw new Error('Todas las variables deben tener nombre y etiqueta');
      }

      const formData = {
        name: formName,
        theme: formTheme,
        variables: variables.map(v => ({
          name: v.name,
          label: v.label,
          type: v.type || 'text'
        }))
      };

      const res = await apiRequest("POST", "/api/forms", formData);

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Error al crear el formulario");
      }

      const form = await res.json();

      // Si hay una plantilla cargada, crear el documento
      if (templateContent) {
        console.log('Creating document with template:', {
          name: formName,
          templateLength: templateContent.length,
          hasOriginalFile: !!originalFile
        });

        const docRes = await apiRequest("POST", `/api/forms/${form.id}/documents`, {
          name: formName,
          template: templateContent,
          originalFile: originalFile,
          originalMimeType: originalMimeType
        });

        if (!docRes.ok) {
          // Si falla la creación del documento, eliminar el formulario
          await apiRequest("DELETE", `/api/forms/${form.id}`);
          const error = await docRes.text();
          throw new Error(error || "Error al crear el documento");
        }
      }

      return form;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({
        title: "Éxito",
        description: templateContent
          ? "Formulario y plantilla creados exitosamente"
          : "Formulario creado exitosamente",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error al crear el formulario",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const updateFormMutation = useMutation({
    mutationFn: async () => {
      if (!id) return;

      // Check variable limit before updating
      if (variables.length > variableLimit) {
        throw new Error(`Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario.`);
      }

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
    onError: (error: Error) => {
      toast({
        title: "Error al actualizar el formulario",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const extractVariables = (template: string) => {
    const variableRegex = /{{([^}]+)}}/g;
    const matches = template.match(variableRegex) || [];
    const validVariableRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;  // Permitir guiones bajos
    const invalidVariables: string[] = [];
    const validVariables = new Set<string>();

    matches.forEach(match => {
      const varName = match.slice(2, -2).trim();
      // Convertir espacios y guiones a guiones bajos
      const normalizedName = varName
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '');

      if (normalizedName && validVariableRegex.test(normalizedName)) {
        validVariables.add(normalizedName);
      } else {
        invalidVariables.push(varName);
      }
    });

    if (invalidVariables.length > 0) {
      toast({
        title: "Variables no válidas detectadas",
        description: `Las siguientes variables no pudieron ser normalizadas: ${invalidVariables.join(", ")}. Las variables deben comenzar con una letra y pueden contener letras, números y guiones bajos.`,
        variant: "destructive"
      });
      return [];
    }

    const variables = Array.from(validVariables).map(varName => ({
      name: varName,
      label: varName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '), // Convert snake_case to Title Case
      type: 'text' // Default type
    }));

    return variables;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = [
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Error al cargar archivo",
          description: "Solo se permiten archivos .txt, .doc y .docx",
          variant: "destructive"
        });
        return;
      }

      try {
        let text;
        if (file.type === 'text/plain') {
          const fileText = await file.text();
          text = fileText
            .replace(/\0/g, '')
            .replace(/[^\x20-\x7E\x0A\x0D]/g, '');

          const detectedVariables = extractVariables(text);
          setPreviewContent({
            name: file.name.split('.')[0],
            template: text,
            preview: generatePreview(text),
            variables: detectedVariables
          });
        } else {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch(`/api/forms/${id || 'temp'}/documents/upload`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(await response.text());
          }

          const result = await response.json();
          const detectedVariables = extractVariables(result.template);
          setPreviewContent({
            name: result.name,
            template: result.template,
            preview: result.preview,
            originalFile: result.originalFile,
            originalMimeType: result.mimeType,
            variables: detectedVariables
          });
        }
      } catch (error) {
        console.error('Error al cargar archivo:', error);
        toast({
          title: "Error al cargar archivo",
          description: error.message || "Error al procesar el archivo",
          variant: "destructive"
        });
      }
    }
  };

  const generatePreview = (template: string) => {
    const variableRegex = /{{([^}]+)}}/g;
    return template.replace(variableRegex, (match, variable) => {
      return `<span class='bg-yellow-100 px-1 rounded'>${match}</span>`;
    });
  };


  const removeExcessVariables = () => {
    const excess = variables.length - variableLimit;
    if (excess > 0) {
      setVariables(variables.slice(0, variableLimit));
      toast({
        title: "Variables eliminadas",
        description: `Se han eliminado ${excess} variables para cumplir con el límite del plan.`,
      });
    }
  };

  const renderFormEditor = () => (
    <Card>
      <CardHeader>
        <CardTitle>Configurar Formulario</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {variables.length > variableLimit && (
          <Alert>
            <AlertDescription className="flex items-center justify-between">
              <span>
                Su formulario tiene {variables.length} variables, pero su plan {user?.isPremium ? 'premium' : 'gratuito'} permite hasta {variableLimit}.
                Necesita eliminar {variables.length - variableLimit} variable(s).
              </span>
              <Button
                variant="outline"
                onClick={removeExcessVariables}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar variables excedentes
              </Button>
            </AlertDescription>
          </Alert>
        )}
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
                <CardContent className="pt-6 grid gap-4 md:grid-cols-4">
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
                        <SelectItem value="time">Hora</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 hover:bg-red-100"
                      onClick={() => {
                        setVariables(variables.filter((_, i) => i !== index));
                        toast({
                          title: "Variable eliminada",
                          description: "La variable ha sido eliminada correctamente",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

  const PreviewDialog = () => {
    if (!previewContent) return null;

    const handleDownload = async () => {
      try {
        const baseUrl = window.location.origin;
        const endpoint = `api/forms/${id || 'temp'}/documents/preview/download`;
        const params = new URLSearchParams({
          template: previewContent.template,
          filename: previewContent.name
        });

        const url = `${baseUrl}/${endpoint}?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('Error al descargar el documento');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${previewContent.name}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        console.error('Error downloading document:', error);
        toast({
          title: "Error",
          description: "No se pudo descargar el documento",
          variant: "destructive"
        });
      }
    };

    return (
      <Dialog open={!!previewContent} onOpenChange={() => setPreviewContent(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Vista Previa del Documento</DialogTitle>
            <DialogDescription>
              Revise el contenido y las variables detectadas antes de crear el formulario
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">Contenido del Documento</h3>
                    <Button variant="outline" size="sm" onClick={handleDownload}>
                      <Download className="mr-2 h-4 w-4" />
                      Descargar Documento
                    </Button>
                  </div>
                  <div className="bg-muted rounded-md p-4">
                    <pre className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: previewContent.preview }} />
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Variables Detectadas ({previewContent.variables.length})</h3>
                  <div className="bg-muted rounded-md p-4">
                    <div className="grid gap-2">
                      {previewContent.variables.map((variable, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <code className="bg-background px-2 py-1 rounded">{'{{' + variable.name + '}}'}</code>
                          <span className="text-muted-foreground">{variable.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-background">
            <Button variant="outline" onClick={() => setPreviewContent(null)}>
              Cancelar
            </Button>
            <Button onClick={() => {
              setFormName(previewContent.name);
              setVariables(previewContent.variables);
              setTemplateContent(previewContent.template);
              setOriginalFile(previewContent.originalFile || null);
              setOriginalMimeType(previewContent.originalMimeType || null);
              setShowEditor(true);
              setPreviewContent(null);
              toast({
                title: "Plantilla cargada",
                description: `Se detectaron ${previewContent.variables.length} variables válidas en la plantilla`,
              });
            }}>
              Crear Formulario
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

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
        {!id && (
          <>
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
                          accept=".txt,.doc,.docx"
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
                          Subir Plantilla (.txt, .doc, .docx)
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
                      setPreviewContent(null);
                      setOriginalFile(null);
                      setOriginalMimeType(null);
                    }}
                  >
                    Cambiar Plantilla
                  </Button>
                </div>
                {renderFormEditor()}
              </>
            )}
          </>
        )}

        {id && renderFormEditor()}
        <PreviewDialog />
      </div>
    </div>
  );
}