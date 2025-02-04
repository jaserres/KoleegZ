
import { pgTable, text, boolean } from "drizzle-orm/pg-core";

export const variables = pgTable("variables", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  useRandomInitial: boolean("use_random_initial").default(false),
  minValue: text("min_value"),
  maxValue: text("max_value"),
});
