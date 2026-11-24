// Manage tester accounts. Run with Node 24 or newer, which strips the types:
//   node scripts/create-user.ts <name> [--admin]
//   node scripts/create-user.ts --reset <name>
//   node scripts/create-user.ts --list
import { getDatabase } from "../app/server/db/database.ts";
import {
  createUser,
  listUsers,
  resetAccessCode,
} from "../app/server/db/users-repository.ts";

const args = process.argv.slice(2);
const db = getDatabase();

if (args[0] === "--list") {
  for (const user of listUsers(db)) {
    console.log(
      `${user.id}\t${user.name}\t${user.collection}${user.isAdmin ? "\tadmin" : ""}`,
    );
  }
} else if (args[0] === "--reset" && args[1]) {
  console.log(
    `New access code for ${args[1]}: ${resetAccessCode(db, args[1])}`,
  );
} else if (args[0] && !args[0].startsWith("--")) {
  const { user, accessCode } = createUser(
    db,
    args[0],
    args.includes("--admin"),
  );
  console.log(
    `Created ${user.name} (collection ${user.collection}${user.isAdmin ? ", admin" : ""}).`,
  );
  console.log(`Access code: ${accessCode}`);
  console.log("It is shown only once. Use --reset to issue a new one.");
} else {
  console.error(
    "Usage: node scripts/create-user.ts <name> [--admin] | --reset <name> | --list",
  );
  process.exit(1);
}
