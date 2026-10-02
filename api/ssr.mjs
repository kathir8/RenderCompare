import { reqHandler } from '../dist/ssr/server/server.mjs';

export default function handler(request, response) {
  const requestUrl = request.url ?? '/';
  const queryIndex = requestUrl.indexOf('?');
  request.url = `/ssr${queryIndex >= 0 ? requestUrl.slice(queryIndex) : ''}`;

  return reqHandler(request, response, (error) => {
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
}