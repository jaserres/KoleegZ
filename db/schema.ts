import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  isPremium: boolean("is_premium").default(false).notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  role: text("role").default("user").notNull(),
});

export const forms = pgTable("forms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  theme: jsonb("theme").default({ primary: "#64748b", variant: "default" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const variables = pgTable("variables", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => forms.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
});

export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => forms.id, { onDelete: "cascade" }).notNull(),
  values: jsonb("values").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => forms.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  template: text("template").notNull(),
  preview: text("preview"),
  filePath: text("file_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  forms: many(forms),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
  user: one(users, { fields: [forms.userId], references: [users.id] }),
  variables: many(variables),
  entries: many(entries),
  documents: many(documents),
}));

export const variablesRelations = relations(variables, ({ one }) => ({
  form: one(forms, { fields: [variables.formId], references: [forms.id] }),
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  form: one(forms, { fields: [entries.formId], references: [forms.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  form: one(forms, { fields: [documents.formId], references: [forms.id] }),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const insertFormSchema = createInsertSchema(forms);
export const selectFormSchema = createSelectSchema(forms);
export type InsertForm = typeof forms.$inferInsert;
export type SelectForm = typeof forms.$inferSelect;

export const insertVariableSchema = createInsertSchema(variables);
export const selectVariableSchema = createSelectSchema(variables);
export type InsertVariable = typeof variables.$inferInsert;
export type SelectVariable = typeof variables.$inferSelect;

export const insertEntrySchema = createInsertSchema(entries);
export const selectEntrySchema = createSelectSchema(entries);
export type InsertEntry = typeof entries.$inferInsert;
export type SelectEntry = typeof entries.$inferSelect;

export const insertDocumentSchema = createInsertSchema(documents);
export const selectDocumentSchema = createSelectSchema(documents);
export type InsertDocument = typeof documents.$inferInsert;
export type SelectDocument = typeof documents.$inferSelect;

export const formShares = pgTable("form_shares", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  canEdit: boolean("can_edit").default(false).notNull(),
  canMerge: boolean("can_merge").default(false).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  canShare: boolean("can_share").default(false).notNull(),
  canViewEntries: boolean("can_view_entries").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SelectFormShare = typeof formShares.$inferSelect;
export type InsertFormShare = typeof formShares.$inferInsert;