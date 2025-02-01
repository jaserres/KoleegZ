import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, FileText } from "lucide-react";
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
import { Download } from "lucide-react";

export default function FormEntries() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentTemplate, setDocumentTemplate] = useState("");
  const [mergedResult, setMergedResult] = useState("");

  const { data: form } = useQuery({
    queryKey: [`/api/forms/${id}`],
    enabled: !!id,
  });

  const { data: entries } = useQuery({
    queryKey: [`/api/forms/${id}/entries`],
    enabled: !!id,
  });

  const { data: documents } = useQuery({
    queryKey: [`/api/forms/${id}/documents`],
    enabled: !!id,
  });

  const createEntryMutation = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/forms/${id}/entries`, {
        values,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forms/${id}/entries`] });
      toast({
        title: "Success",
        description: "Entry added successfully",
      });
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
    onSuccess: (data) => {
      setMergedResult(data.result);
    },
  });

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

    createEntryMutation.mutate(values);
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
            <CardTitle>New Entry for {form?.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {form?.variables?.map((variable: any) => (
                <div key={variable.id}>
                  <Label htmlFor={variable.name}>{variable.label}</Label>
                  <Input
                    id={variable.name}
                    name={variable.name}
                    type={variable.type === "date" ? "date" :
                          variable.type === "number" ? "number" : "text"}
                    required
                  />
                </div>
              ))}
              <Button type="submit" disabled={createEntryMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Add Entry
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Entries</CardTitle>
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
                      New Document Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Document Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Template Name</Label>
                        <Input
                          value={documentName}
                          onChange={(e) => setDocumentName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Template Content (use "{'{'}{'{'}variable_name{'}'}{'}'}" for variables)</Label>
                        <Textarea
                          value={documentTemplate}
                          onChange={(e) => setDocumentTemplate(e.target.value)}
                          className="h-40"
                        />
                      </div>
                      <Button onClick={() => createDocumentMutation.mutate()}>
                        Create Template
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {form?.variables?.map((variable: any) => (
                    <TableHead key={variable.id}>{variable.label}</TableHead>
                  ))}
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries?.map((entry: any) => (
                  <TableRow key={entry.id}>
                    {form?.variables?.map((variable: any) => (
                      <TableCell key={variable.id}>
                        {entry.values[variable.name]}
                      </TableCell>
                    ))}
                    <TableCell>
                      {format(new Date(entry.createdAt), "PPp")}
                    </TableCell>
                    <TableCell>
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
                                      onClick={() =>
                                        mergeMutation.mutate({
                                          documentId: doc.id,
                                          entryId: selectedEntry!,
                                        })
                                      }
                                    >
                                      Merge with this template
                                    </Button>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                            {mergedResult && (
                              <div>
                                <Label>Result</Label>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}