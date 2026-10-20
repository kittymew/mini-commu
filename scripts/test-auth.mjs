import { runWithProfile } from './run-with-profile.mjs'
process.exitCode = await runWithProfile(['exec','playwright','test','--config','playwright.auth.config.ts',...process.argv.slice(2)])
