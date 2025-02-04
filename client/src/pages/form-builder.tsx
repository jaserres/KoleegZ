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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, Save, ArrowLeft, Upload, Download, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SelectVariable } from "@db/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function FormBuilder() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [previewContent, setPreviewContent] = useState<{
    name: string;
    template?: string;
    originalTemplate?: string;
    filePath: string;
    thumbnailPath?: string;
    extractedVariables?: string[];
  } | null>(null);

  const [formName, setFormName] = useState("");
  const [variables, setVariables] = useState<Array<Partial<SelectVariable>>>([]);
  const [allVariables, setAllVariables] = useState<Array<Partial<SelectVariable>>>([]);

  const variableLimit = user?.isPremium ? 50 : 10;

  const { data: form } = useQuery({
    queryKey: [`/api/forms/${id}`],
    enabled: !!id,
  });

  useEffect(() => {
    if (form) {
      setFormName(form.name);
      setVariables(form.variables || []);
    }
  }, [form]);

  useEffect(() => {
    const templateData = sessionStorage.getItem("selectedTemplate");
    if (templateData && !id) {
      try {
        const template = JSON.parse(templateData);
        if (template.variables.length > variableLimit) {
          toast({
            title: "Límite de variables excedido",
            description: `Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario.`,
            variant: "destructive"
          });
          return;
        }
        setFormName(template.name);
        setVariables(template.variables);
        setPreviewContent(template);
        setShowEditor(true);
        sessionStorage.removeItem("selectedTemplate");
      } catch (error) {
        console.error("Error parsing template data:", error);
      }
    }
  }, [id, variableLimit, user?.isPremium]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Error al cargar archivo",
        description: "Solo se permiten archivos .docx",
        variant: "destructive"
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('preserveOriginal', 'true');

      const uploadUrl = id ? 
        `/api/forms/${id}/documents/upload` : 
        `/api/forms/temp/documents/upload`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const doc = await response.json();

      // Process detected variables
      const variables = doc.extractedVariables ? doc.extractedVariables.map((varName: string) => ({
        name: varName,
        label: varName
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        type: 'text'
      })) : [];

      setAllVariables(variables);
      setVariables(variables);
      setPreviewContent({
        name: file.name.split('.')[0],
        template: doc.template,
        originalTemplate: doc.originalTemplate || doc.template,
        filePath: doc.filePath,
        thumbnailPath: doc.thumbnailPath,
        extractedVariables: doc.extractedVariables
      });

      setShowEditor(true);

    } catch (error) {
      console.error('Error al cargar archivo:', error);
      toast({
        title: "Error al cargar archivo",
        description: error instanceof Error ? error.message : "Error al procesar el archivo",
        variant: "destructive"
      });
    }
  };

  const handleOCRExtraction = async () => {
    if (!previewContent?.thumbnailPath) return;

    try {
      const response = await fetch(`/api/forms/${id || 'temp'}/documents/extract-ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          thumbnailPath: previewContent.thumbnailPath
        }),
      });

      if (!response.ok) {
        throw new Error('Error al procesar OCR');
      }

      const result = await response.json();

      if (result.extractedVariables && result.extractedVariables.length > 0) {
        const newVariables = result.extractedVariables
          .filter((varName: string) => !variables.some(v => v.name === varName))
          .map((varName: string) => ({
            name: varName,
            label: varName
              .split('_')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' '),
            type: 'text'
          }));

        if (newVariables.length > 0) {
          const updatedVariables = [...variables, ...newVariables];
          setVariables(updatedVariables);

          toast({
            title: "Variables Detectadas",
            description: `Se encontraron ${newVariables.length} nuevas variables.`
          });
        } else {
          toast({
            title: "OCR Completado",
            description: "No se detectaron nuevas variables en el documento.",
            variant: "default"
          });
        }
      }
    } catch (error) {
      console.error('Error en OCR:', error);
      toast({
        title: "Error",
        description: "No se pudo completar el proceso de OCR",
        variant: "destructive"
      });
    }
  };

  const createFormMutation = useMutation({
    mutationFn: async () => {
      if (variables.length > variableLimit) {
        throw new Error(`Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario.`);
      }

      // Create form with complete document info
      const formRes = await apiRequest("POST", "/api/forms", {
        name: formName,
        document: previewContent ? {
          name: previewContent.name,
          template: previewContent.template,
          originalTemplate: previewContent.originalTemplate,
          filePath: previewContent.filePath,
          thumbnailPath: previewContent.thumbnailPath
        } : undefined
      });

      if (!formRes.ok) {
        const error = await formRes.text();
        throw new Error(error || "Error al crear el formulario");
      }

      const form = await formRes.json();

      try {
        // Create variables
        for (const variable of variables) {
          const variableRes = await apiRequest("POST", `/api/forms/${form.id}/variables`, variable);
          if (!variableRes.ok) {
            throw new Error("Error al crear las variables");
          }
        }

        return form;
      } catch (error) {
        // If something fails, delete the form to maintain consistency
        await apiRequest("DELETE", `/api/forms/${form.id}`);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({
        title: "Éxito",
        description: "Formulario creado exitosamente"
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

      if (variables.length > variableLimit) {
        throw new Error(`Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario.`);
      }

      await apiRequest("PATCH", `/api/forms/${id}`, {
        name: formName,
        document: previewContent ? {
          template: previewContent.template,
          originalTemplate: previewContent.originalTemplate,
          filePath: previewContent.filePath,
          thumbnailPath: previewContent.thumbnailPath
        } : undefined
      });

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

  return (
    <div className="container mx-auto py-8">
      <Button variant="ghost" className="mb-8" onClick={() => setLocation("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a Formularios
      </Button>

      <div className="space-y-8">
        {!id && !showEditor ? (
          <>
            <h1 className="text-3xl font-bold">Crear Nuevo Formulario</h1>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card className="cursor-pointer hover:bg-accent transition-colors">
                <CardHeader>
                  <CardTitle>Cargar Documento</CardTitle>
                  <CardDescription>Crear formulario desde un documento existente</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Input
                      type="file"
                      accept=".docx"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="document-upload"
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => document.getElementById('document-upload')?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Subir Documento (.docx)
                    </Button>
                  </div>
                </CardContent>
              </Card>

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
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold">
                {id ? `Editar ${formName || "Formulario"}` : formName || "Nuevo Formulario"}
              </h1>
              {!id && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditor(false);
                    setFormName("");
                    setVariables([]);
                    setPreviewContent(null);
                  }}
                >
                  Cambiar Documento
                </Button>
              )}
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {previewContent?.thumbnailPath && (
                <div className="lg:sticky lg:top-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Documento de Referencia</CardTitle>
                      <CardDescription>
                        Use esta vista previa como guía para identificar las variables
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-auto max-h-[calc(100vh-16rem)] space-y-4">
                        <img
                          src={`/thumbnails/${previewContent.thumbnailPath}`}
                          alt="Vista previa del documento"
                          className="w-full rounded-lg shadow-lg"
                        />
                        <Button
                          variant="secondary"
                          onClick={handleOCRExtraction}
                          className="w-full"
                        >
                          <Wand2 className="mr-2 h-4 w-4" />
                          Detectar Variables con OCR
                        </Button>

                        <div className="mt-4">
                          {variables.length > 0 ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                              <p className="text-green-700 font-medium mb-2">Variables Detectadas:</p>
                              <div className="grid gap-2">
                                {variables.map((variable, index) => (
                                  <div key={index} className="flex items-center gap-2 text-sm">
                                    <code className="bg-green-100 px-2 py-1 rounded text-green-800">
                                      {`{{${variable.name}}}`}
                                    </code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                              <p className="text-yellow-800 font-medium">No se detectaron variables</p>
                              <p className="text-sm text-yellow-600 mt-1">
                                Por favor, agregue las variables manualmente basándose en el documento original.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Configuración del Formulario</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  {variables.length > variableLimit && (
                    <Alert>
                      <AlertDescription className="flex items-center justify-between">
                        <span>
                          Su formulario tiene {variables.length} variables, pero su plan permite hasta {variableLimit}.
                          Necesita eliminar {variables.length - variableLimit} variable(s).
                        </span>
                        <Button
                          variant="outline"
                          onClick={() => setVariables(variables.slice(0, variableLimit))}
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
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Variables del Formulario</h3>
                      <Button
                        onClick={() => setVariables([...variables, { name: "", label: "", type: "text" }])}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar Variable
                      </Button>
                    </div>

                    {variables.map((variable, index) => (
                      <Card key={index}>
                        <CardContent className="pt-6 space-y-4">
                          <div className="grid gap-4">
                            <div>
                              <Label>Nombre Interno</Label>
                              <Input
                                value={variable.name}
                                onChange={(e) =>
                                  setVariables(
                                    variables.map((v, i) =>
                                      i === index ? { ...v, name: e.target.value } : v
                                    )
                                  )
                                }
                                placeholder="nombreVariable"
                              />
                            </div>
                            <div>
                              <Label>Etiqueta</Label>
                              <Input
                                value={variable.label}
                                onChange={(e) =>
                                  setVariables(
                                    variables.map((v, i) =>
                                      i === index ? { ...v, label: e.target.value } : v
                                    )
                                  )
                                }
                                placeholder="Nombre de la Variable"
                              />
                            </div>
                            <div>
                              <Label>Tipo</Label>
                              <Select
                                value={variable.type}
                                onValueChange={(value) =>
                                  setVariables(
                                    variables.map((v, i) =>
                                      i === index ? { ...v, type: value } : v
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
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700 hover:bg-red-100"
                            onClick={() => setVariables(variables.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="pt-6">
                    <Button
                      className="w-full"
                      onClick={() => id ? updateFormMutation.mutate() : createFormMutation.mutate()}
                      disabled={createFormMutation.isPending || updateFormMutation.isPending || !formName || variables.length === 0}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {id ? (
                        updateFormMutation.isPending ? "Actualizando..." : "Actualizar Formulario"
                      ) : (
                        createFormMutation.isPending ? "Guardando..." : "Guardar Formulario"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}