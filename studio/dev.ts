// bun run dev: API-сервер (4321) + Vite (5173) с прокси на него.
const procs = [
  Bun.spawn(['bun', '--watch', 'server.ts'], { stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bunx', 'vite'], { stdout: 'inherit', stderr: 'inherit' }),
];
const stopAll = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
await Promise.race(procs.map(p => p.exited));
stopAll();
export {};
