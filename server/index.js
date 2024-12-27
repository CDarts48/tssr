import express from 'express';
import compression from 'compression';
import { renderPage } from 'vike/server';
import path from 'path';

const root = path.resolve(); // Ensure this points to the correct directory
const isProduction = process.env.NODE_ENV === 'production';

startServer();

async function startServer() {
  const app = express();

  app.use(compression());

  // Vite integration
  if (isProduction) {
    // In production, we need to serve our static assets ourselves.
    // (In dev, Vite's middleware serves our static assets.)
    const sirv = (await import('sirv')).default;
    app.use(sirv(`${root}/dist/client`)); // Adjust the path to match your build output directory
  } else {
    // We instantiate Vite's development server and integrate its middleware to our server.
    // ⚠️ We instantiate it only in development. (It isn't needed in production and it
    // would unnecessarily bloat our production server.)
    const vite = await import('vite');
    const viteDevMiddleware = (
      await vite.createServer({
        root,
        server: { middlewareMode: true }
      })
    ).middlewares;
    app.use(viteDevMiddleware);
  }

  // Other middlewares (e.g. some RPC middleware such as Telefunc)
  // ...

  // Vike middleware. It should always be our last middleware (because it's a
  // catch-all middleware superseding any middleware placed after it).
  app.get('*', async (req, res) => {
    const pageContextInit = {
      urlOriginal: req.originalUrl,
      headersOriginal: req.headers
    };
    try {
      const pageContext = await renderPage(pageContextInit);
      if (pageContext.errorWhileRendering) {
        // Install error tracking here, see https://vike.dev/error-tracking
      }
      const { httpResponse } = pageContext;
      if (res.writeEarlyHints) res.writeEarlyHints({ link: httpResponse.earlyHints.map((e) => e.earlyHintLink) });
      httpResponse.headers.forEach(([name, value]) => res.setHeader(name, value));
      res.status(httpResponse.statusCode);
      // For HTTP streams use pageContext.httpResponse.pipe() instead, see https://vike.dev/streaming
      res.send(httpResponse.body);
    } catch (error) {
      console.error('Error rendering page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}