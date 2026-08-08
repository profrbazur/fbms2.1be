import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log("MongoDB connection established successfully.");
  } catch (error) {
    console.error("MongoDB connection failed.");
    console.error(error);
    process.exit(1);
  }
}
