import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "postgres://setupiq:setupiq@localhost:5432/setupiq";

const client = postgres(connectionString);
export const db = drizzle(client);
