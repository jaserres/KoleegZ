import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Save, ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function FormBuilder() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: form } = useQuery({
    queryKey: [`/api/forms/${id}`],
    enabled: !!id,
  });

  const [formName, setFormName] = useState(form?.name || "");
  const [variables, setVariables] = useState<Array<{
    name: string;
    label: string;
    type: string;
  }>>(form?.variables || []);

  const createFormMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/forms", { name: formName });
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
        title: "Success",
        description: "Form created successfully",
      });
      setLocation("/");
    },
  });

  return (
    <div className="container mx-auto py-8">
      <Button
        variant="ghost"
        className="mb-8"
        onClick={() => setLocation("/")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Forms
      </Button>

      <div className="space-y-8">
        <div>
          <Label htmlFor="formName">Form Name</Label>
          <Input
            id="formName"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="max-w-md"
          />
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
              Add Variable
            </Button>
          </div>

          <div className="space-y-4">
            {variables.map((variable, index) => (
              <Card key={index}>
                <CardContent className="pt-6 grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Internal Name (camelCase)</Label>
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
                    />
                  </div>
                  <div>
                    <Label>Display Label</Label>
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
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
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
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
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
          onClick={() => createFormMutation.mutate()}
          disabled={createFormMutation.isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          Save Form
        </Button>
      </div>
    </div>
  );
}
