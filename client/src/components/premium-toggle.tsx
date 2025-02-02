import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function PremiumToggle() {
  const { user } = useAuth();

  const togglePremiumMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/toggle-premium");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  return (
    <Button
      variant={user?.isPremium ? "default" : "outline"}
      onClick={() => togglePremiumMutation.mutate()}
      disabled={togglePremiumMutation.isPending}
      className="ml-auto"
    >
      {user?.isPremium ? "Modo Pro" : "Modo Gratuito"}
    </Button>
  );
}
