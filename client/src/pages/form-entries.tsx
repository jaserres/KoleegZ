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
import { ArrowLeft, Plus, FileText, Wand2, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Download, Upload, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2 } from "lucide-react";

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
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [currentEntryId, setCurrentEntryId] = useState<number | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  
    const user = {
    isPremium: true,
  };

  const { saving } = useAutoSave(
    currentEntryId ? `/api/forms/${id}/entries/${currentEntryId}` : null,
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

  const { data: entries } = useQuery({
    queryKey: [`/api/forms/${id}/entries`],
    enabled: !!id,
  });

  const { data: documents = [] } = useQuery({
    queryKey: [`/api/forms/${id}/documents`],
    enabled: !!id,
  });

  const { trigger: triggerConfetti } = useConfetti();

  const createEntryMutation = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/forms/${id}/entries`, {
        values,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/entries`] });
      setCurrentEntryId(data.id);
      setFormValues({}); // Clear form after successful creation
      toast({
        title: "Success",
        description: "Entry added successfully",
      });
      // Trigger confetti celebration
      triggerConfetti();
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/forms/${id}/documents`, {
        name: documentName,
        template: documentTemplate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/documents`] });
      setDocumentName("");
      setDocumentTemplate("");
      toast({
        title: "Success",
        description: "Document template created successfully",
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({
      documentId,
      entryId,
    }: {
      documentId: number;
      entryId: number;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/forms/${id}/documents/${documentId}/merge`,
        { entryId }
      );
      return res.json();
    },
    onSuccess: (data, { documentId }) => {
      setMergedResult(data.result);
      const template = documents?.find((doc: any) => doc.id === documentId);
      setSelectedTemplate(template);
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
          // Read file as text
          const text = await file.text();

          // Sanitize text: remove null bytes and invalid UTF-8
          const sanitizedText = text
            .replace(/\0/g, '') // Remove null bytes
            .replace(/[^\x20-\x7E\x0A\x0D]/g, ''); // Keep only printable ASCII, newlines and carriage returns

          setDocumentTemplate(sanitizedText);

          // Extract variables from template
          const variables = extractVariables(sanitizedText);
          setDetectedVariables(variables);

          // Use filename as template name if not already set
          if (!documentName) {
            setDocumentName(file.name.split('.')[0]);
          }
        } catch (error) {
          toast({
            title: "Error al cargar archivo",
            description: "El archivo debe ser un documento de texto válido",
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
      setCurrentEntryId(entry.id);
      setSelectedRowId(entry.id);
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const values: Record<string, any> = {};

    form?.variables?.forEach((variable: any) => {
      const value = formData.get(variable.name);
      values[variable.name] = variable.type === "number"
        ? Number(value)
        : value;
    });

    // Create a new entry
    createEntryMutation.mutate(values);
    // Reset selected states
    setSelectedRowId(null);
    setCurrentEntryId(null);
    setFormValues({});
  };
  
  const handleCreateFormFromTemplate = () => {
    if (detectedVariables.length === 0) {
      toast({
        title: "Error",
        description: "No se detectaron variables en la plantilla",
        variant: "destructive"
      });
      return;
    }

    // Check if number of variables exceeds limit
    const variableLimit = user?.isPremium ? 50 : 10;
    if (detectedVariables.length > variableLimit) {
      toast({
        title: "Límite de variables excedido",
        description: `Los usuarios ${user?.isPremium ? 'premium' : 'gratuitos'} pueden crear hasta ${variableLimit} variables por formulario. Actualiza a premium para aumentar este límite.`,
        variant: "destructive"
      });
      return;
    }

    // Store template data in sessionStorage
    sessionStorage.setItem("selectedTemplate", JSON.stringify({
      name: documentName,
      variables: detectedVariables,
      template: documentTemplate
    }));

    // Redirect to form creation page
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


  return (
    <div className="container mx-auto py-8">
      <Button variant="ghost" className="mb-8" onClick={() => setLocation("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Forms
      </Button>

      <div className="grid gap-8">
        <Card>
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
                      required
                      className="w-full"
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={createEntryMutation.isPending || saving}>
                  {createEntryMutation.isPending ? (
                    <Spinner variant="dots" size="sm" className="mr-2" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {selectedRowId ? "Guardar como nueva entrada" : "Agregar entrada"}
                </Button>
                  {selectedRowId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedRowId(null);
                        setCurrentEntryId(null);
                        setFormValues({});
                      }}
                    >
                      Cancelar edición
                    </Button>
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <FileText className="mr-2 h-4 w-4" />
                      Nueva Plantilla
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                      <DialogTitle>Crear Nueva Plantilla</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                       {detectedVariables.length > variableLimit && (
                        <Alert>
                          <AlertDescription className="flex items-center justify-between">
                            <span>
                              Su plantilla tiene {detectedVariables.length} variables, pero su plan {user?.isPremium ? 'premium' : 'gratuito'} permite hasta {variableLimit}.
                              Necesita eliminar {detectedVariables.length - variableLimit} variable(s).
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
                        <Label>Nombre de la Plantilla</Label>
                        <Input
                          value={documentName}
                          onChange={(e) => setDocumentName(e.target.value)}
                          placeholder="Ej: Carta de Presentación"
                          required
                        />
                      </div>
                      <div>
                        <Label>Contenido de la Plantilla</Label>
                         <div className="text-sm text-muted-foreground mb-2">
                          Usa {'{'}{'{'}<span className="font-mono">nombre_variable</span>{'}'}{'}'}  para insertar variables
                        </div>
                        <div className="space-y-4">
                          <Textarea
                            value={documentTemplate}
                            onChange={(e) => setDocumentTemplate(e.target.value)}
                            className="h-40"
                            placeholder="Ej: Estimado {{nombre}}, ..."
                            required
                          />
                          <div className="flex items-center space-x-2">
                            <Label htmlFor="file-upload" className="sr-only">
                              Subir documento
                            </Label>
                            <Input
                              id="file-upload"
                              type="file"
                              accept=".txt"
                              className="max-w-xs"
                              onChange={handleFileUpload}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                const fileInput = document.getElementById('file-upload') as HTMLInputElement;
                                fileInput?.click();
                              }}
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <Button 
                        onClick={handleCreateDocument}
                        disabled={createDocumentMutation.isPending}
                      >
                        {createDocumentMutation.isPending ? "Creando..." : "Crear Plantilla"}
                      </Button>
                    {detectedVariables.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label>Variables Detectadas</Label>
                          <Button
                            variant="outline"
                            onClick={handleCreateFormFromTemplate}
                          >
                            <Wand2 className="mr-2 h-4 w-4" />
                            Crear Formulario
                          </Button>
                        </div>
                        <div className="bg-muted p-4 rounded-md">
                          <ul className="list-disc list-inside space-y-1">
                            {detectedVariables.map((variable, index) => (
                              <li key={index} className="text-sm">
                                {variable.label} ({variable.name})
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    </div>
                  </DialogContent>
                </Dialog>
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
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(entry.createdAt), "PPp")}
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
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Mail Merge</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid gap-4 grid-cols-2">
                                  {documents?.map((doc: any) => (
                                    <Card key={doc.id}>
                                      <CardHeader>
                                        <CardTitle>{doc.name}</CardTitle>
                                      </CardHeader>
                                      <CardContent>
                                        <Button
                                          onClick={() => {
                                            mergeMutation.mutate({
                                              documentId: doc.id,
                                              entryId: selectedEntry!,
                                            });
                                          }}
                                          disabled={mergeMutation.isPending}
                                        >
                                          {mergeMutation.isPending ? (
                                            <Spinner variant="bounce" size="sm" className="mr-2" />
                                          ) : null}
                                          Merge with this template
                                        </Button>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                                {mergedResult && (
                                  <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                      <Label>Preview</Label>
                                      {selectedTemplate && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            if (selectedTemplate && selectedEntry) {
                                              // Primero realizar el merge para asegurarnos que todo está correcto
                                              mergeMutation.mutate(
                                                {
                                                  documentId: selectedTemplate.id,
                                                  entryId: selectedEntry,
                                                },
                                                {
                                                  onSuccess: async () => {
                                                    try {
                                                      // Realizar la descarga usando fetch
                                                      const response = await fetch(
                                                        `api/forms/${id}/documents/${selectedTemplate.id}/merge`,
                                                        {
                                                          method: 'POST',
                                                          headers: {
                                                            'Content-Type': 'application/json',
                                                          },
                                                          body: JSON.stringify({
                                                            entryId: selectedEntry,
                                                            download: true
                                                          })
                                                        }
                                                      );
                                                      if (!response.ok) {
                                                        throw new Error('Error al descargar el documento');
                                                      }

                                                      const blob = await response.blob();
                                                      const url = window.URL.createObjectURL(blob);
                                                      const a = document.createElement('a');
                                                      a.href = url;
                                                      // Mantener la extensión original del archivo
                                                      const extension = selectedTemplate.name.split('.').pop() || 'txt';
                                                      a.download = `${selectedTemplate.name.split('.')[0]}.${extension}`;
                                                      document.body.appendChild(a);
                                                      a.click();
                                                      window.URL.revokeObjectURL(url);
                                                      document.body.removeChild(a);
                                                    } catch (error) {
                                                      toast({
                                                        title: "Error",
                                                        description: "No se pudo descargar el documento",
                                                        variant: "destructive"
                                                      });
                                                    }
                                                  },
                                                }
                                              );
                                            }
                                          }}
                                        >
                                          <FileDown className="mr-2 h-4 w-4" />
                                          Download
                                        </Button>
                                      )}
                                    </div>
                                    <Textarea
                                      value={mergedResult}
                                      readOnly
                                      className="h-40"
                                    />
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="outline"
                            className="text-red-500 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
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
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Plantillas Disponibles</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {documents.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">
                      No hay plantillas disponibles. Crea una nueva plantilla para comenzar.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                 documents.map((doc) => (
                   <Card key={doc.id}>
                     <CardHeader>
                       <div className="flex justify-between items-center">
                         <CardTitle>{doc.name}</CardTitle>
                         <Button
                           variant="outline"
                           size="icon"
                           className="text-red-500 hover:text-red-700"
                           onClick={() => {
                             if (window.confirm("¿Estás seguro de que quieres eliminar esta plantilla?")) {
                               deleteDocumentMutation.mutate(doc.id);
                             }
                           }}
                           disabled={deleteDocumentMutation.isPending}
                         >
                           {deleteDocumentMutation.isPending ? (
                             <Spinner variant="pulse" size="sm" />
                           ) : (
                             <Trash2 className="h-4 w-4" />
                           )}
                         </Button>
                       </div>
                     </CardHeader>
                     <CardContent>
                       <div className="space-y-4">
                         <div className="bg-muted p-4 rounded-md">
                           <pre className="text-xs font-mono whitespace-pre-wrap line-clamp-3">
                             {doc.preview || doc.template.slice(0, 200)}
                           </pre>
                         </div>
                         <div className="text-sm text-muted-foreground">
                           Creada el {format(new Date(doc.createdAt), "PPp")}
                         </div>
                         <Button
                           variant="outline"
                           onClick={() => {
                             setSelectedTemplate(doc);
                             setShowTemplateDialog(true);
                           }}
                         >
                           Ver Plantilla
                         </Button>
                       </div>
                     </CardContent>
                   </Card>
                 ))
              )}
            </div>
          </div>
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