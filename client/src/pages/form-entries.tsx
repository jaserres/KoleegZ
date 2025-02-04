import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useConfetti } from "@/hooks/use-confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, FileText, Wand2, Save, FileDown, Upload, Download, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FormEntries() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentTemplate, setDocumentTemplate] = useState("");
  const [mergedResult, setMergedResult] = useState("");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [detectedVariables, setDetectedVariables] = useState<Array<{name: string, label: string, type: string}>>([]);
  const [allVariables, setAllVariables] = useState<Array<{name: string, label: string, type: string}>>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [currentEntryId, setCurrentEntryId] = useState<number | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [previewContent, setPreviewContent] = useState<any>(null);

  const user = {
    isPremium: true,
  };

  const { saving } = useAutoSave(
    currentEntryId && !selectedRowId ? `/api/forms/${id}/entries/${currentEntryId}` : null,
    formValues,
    {
      debounceMs: 1000,
      showToast: false,
      onSave: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/entries`] });
      },
    }
  );

  const { data: form } = useQuery({
    queryKey: [`/api/forms/${id}`],
    enabled: !!id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: [`/api/forms/${id}/entries`],
    enabled: !!id,
  });

  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery<Array<{
    id: number;
    name: string;
    filePath: string;
    thumbnailPath?: string;
  }>>({
    queryKey: [`/api/forms/${id}/documents`],
    enabled: !!id
  });

  useEffect(() => {
    if (documents) {
      console.log('Documents loaded:', documents);
      if (documents.length === 0) {
        console.log('No documents found for form:', id);
      }
    }
  }, [documents, id]);


  const { trigger: triggerConfetti } = useConfetti();

  const createEntryMutation = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/forms/${id}/entries`, {
        values,
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Error al crear la entrada");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/entries`] });
      setCurrentEntryId(data.id);
      toast({
        title: "Éxito",
        description: "Entrada agregada correctamente",
      });
      triggerConfetti();
      setTimeout(() => {
        setFormValues({});
        setSelectedRowId(null);
        setCurrentEntryId(null);
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la entrada",
        variant: "destructive",
      });
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async () => {
      console.log('Creating document with:', {
        name: documentName,
        template: documentTemplate,
        originalTemplate: previewContent?.originalTemplate
      });

      const res = await apiRequest("POST", `/api/forms/${id}/documents`, {
        name: documentName,
        template: documentTemplate,
        originalTemplate: previewContent?.originalTemplate || documentTemplate,
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Error al crear el documento");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/documents`] });
      toast({
        title: "Éxito",
        description: "Plantilla creada exitosamente"
      });
      setDocumentName("");
      setDocumentTemplate("");
      setShowTemplateDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la plantilla",
        variant: "destructive"
      });
    }
  });

  const mergeMutation = useMutation({
    mutationFn: async ({
      documentId,
      entryId,
      useOriginalTemplate = true
    }: {
      documentId: number;
      entryId: number;
      useOriginalTemplate?: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/forms/${id}/documents/${documentId}/merge`,
        { 
          entryId,
          useOriginalTemplate: true,
          download: true
        }
      );

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Error al realizar el merge");
      }

      return res.json();
    },
    onSuccess: (data) => {
      if (data.downloadUrl) {
        window.location.href = data.downloadUrl;
      }

      toast({
        title: "Éxito",
        description: "Documento generado y descargado correctamente"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo realizar el merge del documento",
        variant: "destructive"
      });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: number) => {
      await apiRequest("DELETE", `/api/forms/${id}/entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/entries`] });
      toast({
        title: "Éxito",
        description: "Entrada eliminada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la entrada",
        variant: "destructive",
      });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/forms/${id}/entries/${selectedRowId}`, values);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Error al actualizar la entrada");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/entries`] });
      toast({
        title: "Éxito",
        description: "Entrada actualizada correctamente",
      });
      setFormValues({});
      setSelectedRowId(null);
      setCurrentEntryId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la entrada",
        variant: "destructive",
      });
    },
  });  

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      await apiRequest("DELETE", `/api/forms/${id}/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/documents`] });
      toast({
        title: "Éxito",
        description: "Plantilla eliminada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la plantilla",
        variant: "destructive",
      });
    },
  });

  const extractVariables = (template: string) => {
    const variableRegex = /{{([^}]+)}}/g;
    const matches = template.match(variableRegex) || [];
    const validVariableRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    const invalidVariables: string[] = [];
    const validVariables = new Set<string>();

    matches.forEach(match => {
      const varName = match.slice(2, -2).trim();
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
        .join(' '),
      type: 'text'
    }));

    return variables;
  };

  const unifyVariables = (initial: Array<{name: string, label: string, type: string}>, ocr: Array<{name: string, label: string, type: string}> = []) => {
    const combined = [...initial, ...ocr];
    return Array.from(new Map(combined.map(v => [v.name, v])).values());
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
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/forms/${id}/documents/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const doc = await response.json();

        const templateVariables = extractVariables(doc.template);
        const ocrVariables = doc.extractedVariables ? doc.extractedVariables.map((varName: string) => ({
          name: varName,
          label: varName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
          type: 'text'
        })) : [];

        const combinedVariables = [...templateVariables, ...ocrVariables];
        const uniqueVariables = Array.from(
          new Map(combinedVariables.map(v => [v.name, v])).values()
        );

        setAllVariables(uniqueVariables);
        setPreviewContent({
          ...doc,
          variables: uniqueVariables,
          extractedVariables: uniqueVariables.map(v => v.name),
          originalTemplate: doc.template 
        });

        setDocumentTemplate(doc.template);
        setDocumentName(documentName || file.name.split('.')[0]);

      } catch (error) {
        console.error('Error al cargar archivo:', error);
        toast({
          title: "Error al cargar archivo",
          description: error instanceof Error ? error.message : "Error al procesar el archivo",
          variant: "destructive"
        });
      }
    }
  };

  const handleCreateDocument = async () => {
    if (!documentName || !documentTemplate) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos",
        variant: "destructive"
      });
      return;
    }

    await createDocumentMutation.mutateAsync();
  };  

  const handleFieldChange = (name: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRowClick = (entry: any) => {
    setFormValues(entry.values);
    setCurrentEntryId(null); 
    setSelectedRowId(entry.id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const values: Record<string, any> = {};

    form?.variables?.forEach((variable: any) => {
      const value = formData.get(variable.name);
      if (value) {
        values[variable.name] = variable.type === "number"
          ? Number(value)
          : value;
      }
    });

    createEntryMutation.mutate(values);
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
        const newOCRVariables = result.extractedVariables.map((varName: string) => ({
          name: varName,
          label: varName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
          type: 'text'
        }));

        const combinedVariables = [...allVariables, ...newOCRVariables];
        const uniqueVariables = Array.from(
          new Map(combinedVariables.map(v => [v.name, v])).values()
        );

        setAllVariables(uniqueVariables);
        setPreviewContent({
          ...previewContent,
          variables: uniqueVariables,
          extractedVariables: uniqueVariables.map(v => v.name)
        });

        toast({
          title: "Variables Detectadas",
          description: `Se encontraron ${result.extractedVariables.length} nuevas variables.`
        });
      } else {
        toast({
          title: "OCR Completado",
          description: "No se detectaron nuevas variables en el documento.",
          variant: "default"
        });
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

  const handleCreateFormFromTemplate = () => {
    if (allVariables.length === 0) {
      toast({
        title: "Error",
        description: "No se detectaron variables en la plantilla",
        variant: "destructive"
      });
      return;
    }

    if (allVariables.length > variableLimit) {
      toast({
        title: "Límite de variables excedido",
        description: `Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario.`,
        variant: "destructive"
      });
      return;
    }

    const templateData = {
      name: documentName,
      variables: allVariables,
      template: documentTemplate,
      preview: documentTemplate,
      filePath: previewContent?.filePath || null,
      thumbnailPath: previewContent?.thumbnailPath || null,
      extractedVariables: allVariables.map(v => v.name)
    };

    sessionStorage.setItem("selectedTemplate", JSON.stringify(templateData));
    setLocation("/forms/new");
  };  


  const variableLimit = user?.isPremium ? 50 : 10;  

  const removeExcessVariables = () => {
    const excess = detectedVariables.length - variableLimit;
    if (excess > 0) {
      setDetectedVariables(detectedVariables.slice(0, variableLimit));
      toast({
        title: "Variables eliminadas",
        description: `Se han eliminado ${excess} variables para cumplir con el límite del plan.`,
      });
    }
  };  

  const handleDownloadMerge = async (templateId: number, entryId: number) => {
    try {
      const response = await fetch(`/api/forms/${id}/documents/${templateId}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entryId,
          useOriginalTemplate: true,
          download: true
        })
      });

      if (!response.ok) {
        throw new Error('Error al descargar el documento');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = selectedTemplate?.name.replace(/\.docx$/i, '') || 'document';
      link.download = `${fileName}-merged.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Éxito",
        description: "Documento generado y descargado correctamente"
      });
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
    <div className="container mx-auto py-8" style={form?.theme ? {
      '--primary': form.theme.primary,
      '--primary-foreground': '#ffffff',
    } as React.CSSProperties : undefined}>
      <Button variant="ghost" className="mb-8" onClick={() => setLocation("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Forms
      </Button>

      <div className="grid gap-8">
        <Card className="transition-colors" style={form?.theme ? {
          borderColor: `${form.theme.primary}20`
        } : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedRowId ? "Editar entrada" : "Nueva entrada"} para {form?.name}
              </CardTitle>
              {saving && (
                <div className="flex items-center text-muted-foreground text-sm">
                  <Spinner variant="dots" size="sm" className="mr-2" />
                  Guardando...
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {form?.variables?.map((variable: any) => (
                <div key={variable.id} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <div className="w-full">
                    <Label htmlFor={variable.name}>{variable.label}</Label>
                    <Input
                      id={variable.name}
                      name={variable.name}
                      type={variable.type === "date" ? "date" :
                            variable.type === "number" ? "number" : "text"}
                      value={formValues[variable.name] || ""}
                      onChange={(e) => handleFieldChange(variable.name, e.target.value)}
                      className="w-full"
                      style={form?.theme ? {
                        '--primary': form.theme.primary,
                        borderColor: `${form.theme.primary}20`
                      } as React.CSSProperties : undefined}
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button 
                  type="submit" 
                  disabled={createEntryMutation.isPending}
                  style={form?.theme ? {
                    '--primary': form.theme.primary,
                  } as React.CSSProperties : undefined}
                >
                  {createEntryMutation.isPending ? (
                    <Spinner variant="dots" size="sm" className="mr-2" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {selectedRowId ? "Guardar como nueva entrada" : "Agregar entrada"}
                </Button>

                {selectedRowId && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={updateEntryMutation.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        if (window.confirm("¿Estás seguro de que quieres sobrescribir los datos actuales?")) {
                          updateEntryMutation.mutate(formValues);
                        }
                      }}
                      style={form?.theme ? {
                        '--primary': form.theme.primary,
                      } as React.CSSProperties : undefined}
                    >
                      {updateEntryMutation.isPending ? (
                        <Spinner variant="dots" size="sm" className="mr-2" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Sobrescribir datos actuales
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedRowId(null);
                        setCurrentEntryId(null);
                        setFormValues({});
                      }}
                      style={form?.theme ? {
                        '--primary': form.theme.primary,
                        borderColor: `${form.theme.primary}20`
                      } as React.CSSProperties : undefined}
                    >
                      Cancelar edición
                    </Button>
                  </>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Entradas y Documentos</CardTitle>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Exportar Datos
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => window.location.href = `/api/forms/${id}/entries/export?format=csv`}>
                      Exportar como CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.href = `/api/forms/${id}/entries/export?format=excel`}>
                      Exportar como Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.href = `/api/forms/${id}/entries/export?format=json`}>
                      Exportar como JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {form?.variables?.map((variable: any) => (
                      <TableHead key={variable.id} className="whitespace-nowrap">{variable.label}</TableHead>
                    ))}
                    <TableHead className="whitespace-nowrap">Created</TableHead>
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries?.map((entry: any) => (
                    <TableRow 
                      key={entry.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        selectedRowId === entry.id && "bg-muted"
                      )}
                      onClick={() => handleRowClick(entry)}
                    >
                      {form?.variables?.map((variable: any) => (
                        <TableCell key={variable.id} className="whitespace-nowrap">
                          {entry.values[variable.name]}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">{format(new Date(entry.createdAt), "PPp")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                onClick={() => setSelectedEntry(entry.id)}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Merge
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl"><DialogHeader>
                                <DialogTitle>Seleccionar Plantilla</DialogTitle>
                                <DialogDescription>
                                  Seleccione una plantilla para generar el documento
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid gap-4 grid-cols-2">
                                  {isLoadingDocuments ? (
                                    <div className="flex items-center justify-center p-8">
                                      <Spinner />
                                    </div>
                                  ) : documents && documents.length > 0 ? (
                                    documents.map((doc) => (
                                      <Card key={doc.id} className="overflow-hidden">
                                        <CardHeader>
                                          <CardTitle>
                                            <div className="flex items-center justify-between">
                                              <span>{doc.name}</span>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (window.confirm("¿Estás seguro de eliminar esta plantilla?")) {
                                                    deleteDocumentMutation.mutate(doc.id);
                                                  }
                                                }}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                          {doc.thumbnailPath && (
                                            <div className="relative aspect-[3/4] w-full max-h-32 mb-4">
                                              <img
                                                src={`/thumbnails/${doc.thumbnailPath}`}
                                                alt={`Vista previa de ${doc.name}`}
                                                className="absolute inset-0 w-full h-full object-cover rounded-md"
                                              />
                                            </div>
                                          )}
                                          <div className="flex justify-end mt-4">
                                            <Button
                                              variant="secondary"
                                              onClick={() => {
                                                setSelectedTemplate(doc);
                                                handleDownloadMerge(doc.id, selectedEntry!);
                                              }}
                                              disabled={!selectedEntry}
                                            >
                                              <FileDown className="mr-2 h-4 w-4" />
                                              Generar Documento
                                            </Button>
                                          </div>
                                        </CardContent>
                                      </Card>
                                    ))
                                  ) : (
                                    <div className="text-center p-8 text-muted-foreground">
                                      No hay plantillas disponibles
                                    </div>
                                  )}
                                </div>
                              </div>
                              {mergedResult && (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                    <Label>Vista Previa</Label>
                                    {selectedTemplate && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDownloadMerge(selectedTemplate.id, selectedEntry)}
                                      >
                                        <FileDown className="mr-2 h-4 w-4" />
                                        Descargar
                                      </Button>
                                    )}
                                  </div>
                                  <div 
                                    className="p-4 border rounded-md bg-white"
                                    style={{ 
                                      minHeight:"200px",
                                      maxHeight: "400px",
                                      overflowY: "auto",
                                      whiteSpace: "pre-wrap"
                                    }}
                                    dangerouslySetInnerHTML={{ __html: mergedResult }}
                                  />
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700 hover:bg-red-100"
                            onClick={() => {
                              if (window.confirm("¿Estás seguro de que quieres eliminar esta entrada?")) {
                                deleteEntryMutation.mutate(entry.id);
                              }
                            }}
                            disabled={deleteEntryMutation.isPending}
                          >
                            {deleteEntryMutation.isPending ? (
                              <Spinner variant="pulse" size="sm" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Contenido de la Plantilla</Label>
                <Textarea
                  value={selectedTemplate?.template || ""}
                  readOnly
                  className="h-40 font-mono"
                />
              </div>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                Cerrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}