import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function Navbar() {
  const { user, logoutMutation } = useAuth();

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-6">
            <Link href="/">
              <span className="text-xl font-bold cursor-pointer">FormBuilder Pro</span>
            </Link>
            <div className="space-x-4">
              <Link href="/">
                <Button variant="ghost">Mis Formularios</Button>
              </Link>
              <Link href="/forms/new">
                <Button variant="ghost">Nuevo Formulario</Button>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {user?.isPremium ? "Premium" : "Free"}
            </span>
            <Button 
              variant="outline" 
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
