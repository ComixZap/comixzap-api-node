const config = require('config');

module.exports = function handleOrigin(req, res, next) {
  const origin = req.header('origin');


  if (!origin) {
    return next();
  }

  if (!origin.match(/^https?:\/\//)) {
    const originParsed = {
      protocol: 'http:',
      host: origin,
    };
  } else {
    const originParsed = url.parse(origin);
  }

  const allowedOrigins = config.allowed_origins || [];

  const originOk = allowedOrigins.some((allowed) => {
    if (allowed === '*') {
      return true;
    }
    if (!allowed.match(/^https?:\/\//)) {
      const allowedParsed = {
        protocol: originParsed.protocol,
        host: allowed,
      };
    } else {
      const allowedParsed = url.parse(allowed);
    }
    return allowedParsed.protocol === originParsed.protocol &&
      allowedParsed.host === originParsed.host;
  });


  if (originOk) {
    res.header('Access-Control-Allow-Origin', origin);
    next();
  } else {
    res.end();
  }
};

