import { createServer } from 'node:http';
import { reqHandler } from './dist/ssr/server/server.mjs';

const server = createServer((request, response) => {
  void reqHandler(request, response, (error) => {
    if (error) {
      console.error(error);
      if (!response.headersSent) {
        response.statusCode = 500;
      }
      if (!response.writableEnded) {
        response.end('Internal Server Error');
      }
      return;
    }

    if (!response.writableEnded) {
      response.statusCode = 404;
      response.end('Not Found');
    }
  });
});

server.listen(Number(process.env['PORT'] || 3000));