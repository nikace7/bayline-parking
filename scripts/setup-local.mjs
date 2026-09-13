import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const run = (command) => execSync(command, { stdio: "inherit" });
const secret = () => randomBytes(32).toString("hex");

if (existsSync(".env")) {
	console.log("Keeping existing .env");
} else {
	const env = readFileSync(".env.example", "utf8")
		.replace("DJANGO_SECRET_KEY=change-me", `DJANGO_SECRET_KEY=${secret()}`)
		.replaceAll("change-me", secret());
	writeFileSync(".env", env);
	console.log("Created .env with generated secrets");
}

run("pnpm install");
run("uv sync --directory backend");
run("pnpm db:up");
run("pnpm db:migrate");
