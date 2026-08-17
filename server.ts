import { startServer } from './src/server/bootstrap';
const port = Number(process.env.PORT) || 3000;
startServer(port)
  .then(() => console.log(`> Ready on http://localhost:${port}`))
  .catch((err) => { console.error(err); process.exit(1); });
