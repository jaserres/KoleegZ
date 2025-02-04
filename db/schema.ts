import { text, boolean } from '@prisma/client';

const schema = {
  variables: {
    name: text("name").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    useRandomInitial: boolean("use_random_initial").default(false),
    minValue: text("min_value"),
    maxValue: text("max_value"),
  }
};

export default schema;