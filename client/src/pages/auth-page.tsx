import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePasswordStrength } from "@/hooks/use-password-strength";
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
                      <Label htmlFor="username">Username or Email</Label>
                      <Input
                        id="username"
                        name="username"
                        required
                        placeholder="Enter username or email"
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
                        const username = formData.get("username") as string;
                        const firstName = formData.get("firstName") as string;
                        const lastName = formData.get("lastName") as string;
                        const email = formData.get("email") as string;
                        
                        if (!username || !firstName || !lastName || !email || !password) {
                          toast({
                            variant: "destructive",
                            title: "Error",
                            description: "Todos los campos son requeridos"
                          });
                          return;
                        }
                        
                        await registerMutation.mutateAsync({
                          username,
                          password,
                          firstName,
                          lastName,
                          email
                        });
                        setLocation("/");
                      } catch (error: any) {
                        toast({
                          variant: "destructive",
                          title: "Error",
                          description: error.message || "Error durante el registro"
                        });
                      }
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        name="username"
                        required
                        pattern="^[a-zA-Z0-9]+$"
                        placeholder="Username (letters and numbers only)"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        required
                        placeholder="Enter your first name"
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        required
                        placeholder="Enter your last name"
                        autoComplete="family-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        placeholder="Enter your email"
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        placeholder="Choose a strong password"
                        autoComplete="new-password"
                        onChange={(e) => {
                          let score = 0;
                          const password = e.target.value;
                          
                          if (password.length >= 8) score++;
                          if (/[A-Z]/.test(password)) score++;
                          if (/[a-z]/.test(password)) score++;
                          if (/[0-9]/.test(password)) score++;
                          if (/[^A-Za-z0-9]/.test(password)) score++;

                          const messages = [
                            'Muy débil',
                            'Débil',
                            'Medio',
                            'Fuerte',
                            'Muy fuerte'
                          ];

                          const meter = document.getElementById('password-strength');
                          if (meter) {
                            meter.style.width = `${(score / 5) * 100}%`;
                            meter.className = `h-1 transition-all duration-300 ${
                              score < 2 ? 'bg-red-500' : 
                              score < 4 ? 'bg-yellow-500' : 
                              'bg-green-500'
                            }`;
                          }
                          const label = document.getElementById('strength-label');
                          if (label) {
                            label.textContent = messages[score - 1] || 'Muy débil';
                          }
                        }}
                      />
                      <div className="h-1 w-full bg-gray-200 rounded-full mt-1">
                        <div id="password-strength" className="h-1 bg-red-500" style={{width: '0%'}}></div>
                      </div>
                      <span id="strength-label" className="text-xs text-gray-500">Fortaleza de la contraseña</span>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        placeholder="Confirm your password"
                        autoComplete="new-password"
                        onChange={(e) => {
                          const password = (document.getElementById('password') as HTMLInputElement)?.value;
                          const confirmLabel = document.getElementById('confirm-label');
                          if (confirmLabel) {
                            if (e.target.value === password) {
                              confirmLabel.textContent = 'Las contraseñas coinciden';
                              confirmLabel.className = 'text-xs text-green-500';
                            } else {
                              confirmLabel.textContent = 'Las contraseñas no coinciden';
                              confirmLabel.className = 'text-xs text-red-500';
                            }
                          }
                        }}
                      />
                      <span id="confirm-label" className="text-xs text-gray-500"></span>
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
