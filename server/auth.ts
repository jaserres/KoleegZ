import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function getUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username)).limit(1);
}

export function setupAuth(app: Express) {
  const store = new PostgresSessionStore({ pool, createTableIfMissing: true });
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      // Check if input is email or username
      const isEmail = username.includes('@');
      const [user] = isEmail 
        ? await db.select().from(users).where(eq(users.email, username)).limit(1)
        : await getUserByUsername(username);

      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt:', {
        ...req.body,
        password: '[REDACTED]'
      });
      
      // Validar todos los campos requeridos
      if (!req.body.username || !req.body.password || !req.body.firstName || !req.body.lastName || !req.body.email) {
        console.error('Missing required fields:', {
          hasUsername: !!req.body.username,
          hasPassword: !!req.body.password,
          hasFirstName: !!req.body.firstName,
          hasLastName: !!req.body.lastName,
          hasEmail: !!req.body.email
        });
        return res.status(400).json({ error: "Todos los campos son requeridos" });
      }

      // Validar formato de username
      if (!/^[a-zA-Z0-9]+$/.test(req.body.username)) {
        return res.status(400).json({ error: "El username solo puede contener letras y números" });
      }

      // Validar longitud de contraseña
      if (req.body.password.length < 8) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
      }

      // Validar formato de email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
        return res.status(400).json({ error: "Email inválido" });
      }

      // Verificar email duplicado
      const [existingEmail] = await db.select()
        .from(users)
        .where(eq(users.email, req.body.email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "El email ya está registrado" });
      }

      // Si todas las validaciones pasan, continuar con el registro
      const userData = {
        username: req.body.username,
        password: req.body.password,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email
      };

      const [existingUser] = await getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const [user] = await db
        .insert(users)
        .values({
          username: userData.username,
          password: await hashPassword(userData.password),
          first_name: userData.firstName,
          last_name: userData.lastName,
          email: userData.email,
          is_premium: false
        })
        .returning();

      req.login(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return res.status(500).json({ error: "Error during login after registration" });
        }
        res.status(201).json(user);
      });
    } catch (error: any) {
      console.error('Registration error:', {
        error: error.message,
        stack: error.stack,
        body: {
          ...req.body,
          password: '[REDACTED]'
        }
      });

      // Handle specific database errors
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ 
          error: "El usuario o email ya existe en la base de datos"
        });
      }
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({ 
          error: error.message 
        });
      }

      // Handle other errors
      res.status(500).json({ 
        error: "Error durante el registro. Por favor, intente nuevamente."
      });
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}