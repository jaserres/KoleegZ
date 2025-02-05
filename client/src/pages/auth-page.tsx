import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [strengthLevel, setStrengthLevel] = React.useState(0);

  if (user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2 h-6 w-6"
          >
            <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
          </svg>
          FormBuilder Pro
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              Create forms, collect data, and generate documents with mail merge
              functionality. Perfect for businesses and professionals.
            </p>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Login</CardTitle>
                  <CardDescription>
                    Welcome back! Login to access your forms.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      try {
                        await loginMutation.mutateAsync({
                          username: formData.get("username") as string,
                          password: formData.get("password") as string,
                        });
                        setLocation("/");
                      } catch {}
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        name="username"
                        required
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full mt-4"
                      disabled={loginMutation.isPending}
                    >
                      Login
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Register</CardTitle>
                  <CardDescription>
                    Create an account to start building forms.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const password = formData.get("password") as string;
                      const confirmPassword = formData.get("confirmPassword") as string;
                      
                      if (password !== confirmPassword) {
                        toast({
                          variant: "destructive",
                          title: "Error",
                          description: "Las contraseñas no coinciden"
                        });
                        return;
                      }

                      try {
                        await registerMutation.mutateAsync({
                          username: formData.get("username") as string,
                          password: password,
                          firstName: formData.get("firstName") as string,
                          lastName: formData.get("lastName") as string,
                          email: formData.get("email") as string,
                        });
                        setLocation("/");
                      } catch {}
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        name="username"
                        required
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        autoComplete="new-password"
                        onChange={(e) => {
                          const password = e.target.value;
                          const strength = {
                            length: password.length >= 8,
                            hasNumber: /\d/.test(password),
                            hasLower: /[a-z]/.test(password),
                            hasUpper: /[A-Z]/.test(password),
                            hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password)
                          };
                          const level = Object.values(strength).filter(Boolean).length;
                          setStrengthLevel(level);
                          e.target.setCustomValidity(level < 3 ? "La contraseña debe contener al menos 8 caracteres, incluir mayúsculas, minúsculas, números o caracteres especiales" : "");
                        }}
                      />
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-gray-200 rounded-full">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              {
                                "w-1/5 bg-red-500": strengthLevel === 1,
                                "w-2/5 bg-orange-500": strengthLevel === 2,
                                "w-3/5 bg-yellow-500": strengthLevel === 3,
                                "w-4/5 bg-lime-500": strengthLevel === 4,
                                "w-full bg-green-500": strengthLevel === 5,
                              }
                            )}
                          />
                        </div>
                        <div className="text-xs text-gray-500">
                          La contraseña debe tener al menos 8 caracteres y combinar mayúsculas, minúsculas, números o caracteres especiales
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Password</Label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        autoComplete="new-password"
                        onChange={(e) => {
                          const password = (document.getElementById('password') as HTMLInputElement).value;
                          e.target.setCustomValidity(e.target.value !== password ? "Las contraseñas no coinciden" : "");
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full mt-4"
                      disabled={registerMutation.isPending}
                    >
                      Register
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
