import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserPlus, Check, Crown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

interface User {
  id: number;
  username: string;
  isPremium: boolean;
  isFollowing?: boolean;
}

export default function KoleegZ() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);

  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/users"],
    retry: 3
  });

  useEffect(() => {
    const filtered = users.filter(
      (user) =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const handleFollow = async (userId: number) => {
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Error al seguir al usuario");
      }

      toast({
        title: "¡Éxito!",
        description: "Ahora sigues a este usuario",
      });

      const updatedUsers = users.map((user) =>
        user.id === userId ? { ...user, isFollowing: true } : user
      );
      setFilteredUsers(updatedUsers);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo seguir al usuario",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Otros KoleegZ</CardTitle>
          <CardDescription>
            Encuentra y conecta con otros usuarios para compartir formularios y colaborar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuarios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <ScrollArea className="h-[600px]">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : error ? (
            <p className="text-center col-span-full text-red-500">Error al cargar usuarios</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center col-span-full">No se encontraron usuarios</p>
          ) : (
            filteredUsers.map((user) => (
              <Card key={user.id} className={`flex flex-col ${user.isPremium ? 'border-primary/50' : ''}`}>
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarFallback>
                        {user.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold">{user.username}</h4>
                        {user.isPremium && (
                          <Badge variant="premium" className="gap-1">
                            <Crown className="h-3 w-3" />
                            Premium
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex justify-end space-x-2 mt-auto">
                  <Button
                    variant={user.isPremium ? "premium" : "outline"}
                    size="sm"
                    onClick={() => handleFollow(user.id)}
                    disabled={user.isFollowing}
                  >
                    {user.isFollowing ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Siguiendo
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Seguir
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}