CREATE TABLE IF NOT EXISTS "variables" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"use_random_initial" boolean DEFAULT false,
	"min_value" text,
	"max_value" text
);
