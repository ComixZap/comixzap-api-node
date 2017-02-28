const fs = require('fs-promise');
const path = require('path');
const url = require('url');

const config = require('config');
const express = require('express');
const sevenZip = require('sevenzip-promise');
const handleOrigin = require('./handleOrigin.js');

const app = express();

const OK = 0;
const ERR = 1;

app.use(handleOrigin);

app.use(express.static(`${__dirname}/public`));

app.get('/file-list', async (req, res, next) => {
  const directory = req.query.directory || '';
  const dirPath = path.join(config.comics_root, directory);

  const files = await fs.readdir(dirPath);
  const fileInfo = await Promise.all(
    files.map(async (filename) => {
      const fileStat = fs.stat(path.join(dirPath, filename));
      return {
        directory: fileStat.isDirectory(),
        filename,
        size: fileStat.size,
      };
    })
  );

  const data = fileInfo.filter(info => info && !info.filename.match(/^\./) && (info.directory || info.filename.match(/(cbz|cbr)$/i))).sort((a, b) => {
    if (a.directory !== b.directory) {
      return a.directory ? -1 : 1;
    }
    return a.filename.toLowerCase().localeCompare(b.filename.toLowerCase());
  });

  respond(res, data, OK, { directory });
});

app.get('/comic/list', async (req, res, next) => {
  const file = req.query.file || '';
  const filePath = path.join(config.comics_root, file);

  const entries = await sevenZip.getFilesAsync(filePath);
  const data = entries.map((item, index) => {
    item.fileOffset = index;
    return item;
  }).filter(item => item.filename.match(/\.(gif|png|jpg|bmp)$/)).sort((a, b) => {
    const af = a.filename.toLowerCase();
    const bf = b.filename.toLowerCase();

    return af.localeCompare(bf);
  });

  respond(res, data, OK);
});

app.get('/comic/image', async (req, res, next) => {
  const file = req.query.file || '';
  const offset = +(req.query.offset || 0);
  const filePath = path.join(config.comics_root, file);

  const entries = await sevenZip.getFilesAsync(filePath);
  const entry = entries[offset];
  const tmpFilename = sevenZip.getSingleFileAsync(filePath, entry.filename);
  fs.createReadStream(tmpFilename).pipe(res);
});

// Error Handling
app.use((err, req, res, next) => {
  respond(res, {}, ERR, { message: err.message }, 500);
});

function respond(res, data, code, meta, statusCode) {
  data = data || {};
  code = code || OK;
  meta = meta || {};
  statusCode = statusCode || 200;
  res.status(statusCode).json(Object.assign(
    { status: code },
    meta,
    { data }
  ));
}

function getMimeType(filename) {
  const extension = filename.toLowerCase().match(/[^\.]+$/);

  if (!extension) {
    return 'application/octet-stream';
  }

  switch (extension[0]) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'bmp':
      return 'image/bmp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function acceptsEncoding(req, encoding) {
  const acceptedEncodingsValue = req.header('accept-encoding');
  if (!acceptedEncodingsValue) {
    return false;
  }
  const acceptedEncodings = acceptedEncodingsValue.split(/\s*,\s*/g);
  return acceptedEncodings.indexOf(encoding) > -1;
}


module.exports = app;
