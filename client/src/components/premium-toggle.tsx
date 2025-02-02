import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { useMutation } from "@tanstack/react-query"
import { apiRequest, queryClient } from "@/lib/queryClient"
import { useToast } from "@/hooks/use-toast"

export function PremiumToggle() {
  const { user } = useAuth()
  const { toast } = useToast()

  const togglePremiumMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/toggle-premium")
      if (!res.ok) {
        throw new Error("Error al cambiar el modo premium")
      }
      return res.json()
    },
    onSuccess: () => {
      // Invalidate both user and forms queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/user"] })
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] })

      toast({
        title: "Éxito",
        description: `Modo ${user?.isPremium ? 'gratuito' : 'premium'} activado`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  return (
    <Button
      variant={user?.isPremium ? "default" : "outline"}
      onClick={() => togglePremiumMutation.mutate()}
      disabled={togglePremiumMutation.isPending}
      className="ml-auto"
    >
      {togglePremiumMutation.isPending ? (
        "Cambiando..."
      ) : user?.isPremium ? (
        "Modo Pro"
      ) : (
        "Modo Gratuito"
      )}
    </Button>
  )
}