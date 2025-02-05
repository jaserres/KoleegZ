import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { PremiumToggle } from "./premium-toggle";
import { Spinner } from "@/components/ui/spinner";

export function Navbar() {
  const { user, logoutMutation } = useAuth();

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-6">
            <Link href="/">
              <span className="text-xl cursor-pointer">
                <i>K</i><strong>oleeg</strong><i>Z</i>
              </span>
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
            <span className="text-sm font-medium mr-2">@{user?.username}</span>
            <PremiumToggle />
            <Button 
              variant="outline" 
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <Spinner variant="dots" size="sm" className="mr-2" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}