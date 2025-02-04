import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { MergeDialog } from "./merge-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface Entry {
  id: string
  title: string
  content: string
  created_at: string
}

export function FormEntries() {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [isMergeOpen, setIsMergeOpen] = useState(false)

  const { data: entries, isLoading, error } = useQuery<Entry[]>({
    queryKey: ['/api/entries']
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load entries. Please try again later.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <ScrollArea className="h-[600px] rounded-md border p-4">
        {entries?.map((entry) => (
          <Card key={entry.id} className="p-4 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">{entry.title}</h3>
                <p className="text-sm text-gray-500">
                  Created: {new Date(entry.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button 
                onClick={() => {
                  setSelectedEntryId(entry.id)
                  setIsMergeOpen(true)
                }}
              >
                Merge
              </Button>
            </div>
            <p className="mt-2">{entry.content}</p>
          </Card>
        ))}
      </ScrollArea>

      <MergeDialog
        open={isMergeOpen}
        onOpenChange={setIsMergeOpen}
        entryId={selectedEntryId}
      />
    </div>
  )
}
