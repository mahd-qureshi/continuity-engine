//
//  validate-scenario.js — run the boundary checks from the command line.
//
//  Wired into `npm run verify`, so a scenario that has drifted into dead
//  content fails the build rather than shipping quietly.
//

import { formatDiagnostics, validateScenario } from "../src/validate.js";
import { orbitalRelay } from "../src/scenario.js";

const result = validateScenario(orbitalRelay);

console.log(`Scenario "${orbitalRelay.id}": ${result.errors.length} errors, ${result.warnings.length} warnings`);
console.log(formatDiagnostics(result));

if (!result.ok) process.exit(1);
