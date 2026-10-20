import { runWithProfile } from './run-with-profile.mjs'
process.exitCode = await runWithProfile(['dev','--port','5173','--strictPort'])
