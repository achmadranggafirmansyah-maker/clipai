const { createServer } = require('http');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  // Default Node cuma kasih 5 menit buat 1 request selesai — kepotong kalau
  // upload video gede/koneksi lambat. Dinaikkan jadi 30 menit di sini.
  server.requestTimeout = 30 * 60 * 1000;
  server.headersTimeout = 30 * 60 * 1000 + 5000;

  server.listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });
});
