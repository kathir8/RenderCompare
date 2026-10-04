import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { ɵsetAngularAppEngineManifest, ɵsetAngularAppManifest } from '@angular/ssr';
import express from 'express';
import { join } from 'node:path';

const angularApp = Promise.all([
  import(new URL('./angular-app-manifest.mjs', import.meta.url).href),
  import(new URL('./angular-app-engine-manifest.mjs', import.meta.url).href),
]).then(([appManifestModule, appEngineManifestModule]) => {
  ɵsetAngularAppManifest(appManifestModule.default);
  ɵsetAngularAppEngineManifest(appEngineManifestModule.default);
  const port = process.env['PORT'] || '4000';
  const configuredHosts = process.env['SSR_ALLOWED_HOSTS']?.split(',').map((host) => host.trim()).filter(Boolean) ?? [];
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'render-compare.vercel.app',
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    process.env['VERCEL_URL'],
    process.env['VERCEL_PROJECT_PRODUCTION_URL'],
    ...configuredHosts,
  ].filter((host): host is string => Boolean(host));

  return new AngularNodeAppEngine({ allowedHosts });
});

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  const renderStartedAt = performance.now();
  angularApp
    .then((engine) => engine.handle(req))
    .then(async (response) => {
      if (!response) {
        next();
        return;
      }

      if (req.path === '/ssr') {
        const headers = new Headers(response.headers);
        const renderDurationMs = performance.now() - renderStartedAt;
        const html = await response.text();
        const htmlWithRenderDuration = html.replaceAll('SSR_RENDER_DURATION_PLACEHOLDER', renderDurationMs.toFixed(1));
        headers.set('Server-Timing', `ssr;dur=${renderDurationMs.toFixed(1)}`);
        headers.delete('content-length');
        const responseWithTiming = new Response(htmlWithRenderDuration, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        writeResponseToNodeResponse(responseWithTiming, res);
        return;
      }

      writeResponseToNodeResponse(response, res);
    })
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
