import * as fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

////////////////////////////////////////////////////////////////////////////

export const Architect = fs.readFileSync(`${__dirname}/architect.md`, "utf-8");
export const EngineeringManager = fs.readFileSync(`${__dirname}/engineering_manager.md`, "utf-8");
export const Engineer = fs.readFileSync(`${__dirname}/engineer.md`, "utf-8");
