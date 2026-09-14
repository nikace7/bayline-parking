import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";

const run = (command) => execSync(command, { stdio: "inherit" });
const secret = () => randomBytes(32).toString("hex");
// Typed by hand when signing in to the demo, so shorter than the server secrets.
const demoPassword = () => randomBytes(12).toString("base64url");

if (!existsSync(".env")) {
	const env = readFileSync(".env.example", "utf8")
		.replace("DJANGO_SECRET_KEY=change-me", `DJANGO_SECRET_KEY=${secret()}`)
		.replace(
			"DEMO_PASSWORD=generate-demo-password",
			`DEMO_PASSWORD=${demoPassword()}`,
		)
		// One value on purpose: POSTGRES_PASSWORD and both database URLs must match.
		.replaceAll("change-me", secret());
	writeFileSync(".env", env);
	console.log("Created .env with generated secrets");
} else if (!/^DEMO_PASSWORD=/m.test(readFileSync(".env", "utf8"))) {
	appendFileSync(".env", `\nDEMO_PASSWORD=${demoPassword()}\n`);
	console.log("Added a generated DEMO_PASSWORD to the existing .env");
} else {
	console.log("Keeping existing .env");
}

run("pnpm install");
run("uv sync --directory backend");
run("pnpm db:up");
run("pnpm db:migrate");
