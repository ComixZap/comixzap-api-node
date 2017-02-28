const http = require('http');
const app = require('./lib/webapp.js');

if (require.main === module) {
  const server = http.createServer(app);
  server.listen(process.env.PORT, '0.0.0.0');
} else if (GLOBAL.PhusionPassenger) {
  app.listen(process.env.PORT || 0);
}
