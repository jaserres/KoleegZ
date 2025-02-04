import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useQuery, useMutation } from "@tanstack/react-query"
import { apiRequest } from "@/lib/queryClient"
import { useToast } from "@/hooks/use-toast"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface Template {
  id: string
  name: string
  content: string
}

interface MergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entryId: string | null
}

export function MergeDialog({ open, onOpenChange, entryId }: MergeDialogProps) {
  const { toast } = useToast()

  const { data: templates, isLoading, error } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
    enabled: open
  })

  const mergeMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest(`/api/entries/${entryId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ templateId })
      })
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Entry merged successfully",
      })
      onOpenChange(false)
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to merge entry with template",
      })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Select Template</DialogTitle>
          <DialogDescription>
            Choose a template to merge with your entry
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load templates. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {templates && (
            <ScrollArea className="h-[300px] rounded-md border p-4">
              {templates.map((template) => (
                <Card key={template.id} className="p-4 mb-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">{template.name}</h3>
                    <Button
                      onClick={() => mergeMutation.mutate(template.id)}
                      disabled={mergeMutation.isPending}
                    >
                      Select
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {template.content}
                  </p>
                </Card>
              ))}
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
