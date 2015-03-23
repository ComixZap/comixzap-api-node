'use strict';

var fs = require('fs');
var http = require('http')
var path = require('path');
var url = require('url');
var zlib = require('zlib');

var config = require('config');
var express = require('express');
var extend = require('extend');
var sevenZip = require('sevenzip-promise');

var promiseWhile = require('./lib/promise-while.js');

var app = express();

var OK = 0;
var ERR = 1;

var EOCD_SIZE = 22;
var CD_SIZE = 46;
var FH_SIZE = 30;

var COMPRESSION_UNCOMPRESSED = 0
var COMPRESSION_DEFLATE = 8;

app.use(handleOrigin);

app.use(express.static(__dirname + '/public'))

app.get('/file-list', function (req, res, next) {
    var directory = req.query.directory || '';
    var dirPath = path.join(config.comics_root, directory);

    return new Promise(function (resolve, reject) {
        fs.readdir(dirPath, function (err, files) {
            if (err) reject(err);
            resolve(files)
        })
    }).then(function (files) {
        return Promise.all(files.map(mkPromise));

        function mkPromise (filename) {
            return new Promise(function (resolve, reject) {
                fs.stat(path.join(dirPath, filename), function (err, stat) {
                    if (err) {
                        return resolve();
                    }
                    resolve({
                        directory: stat.isDirectory(),
                        filename: filename,
                        size: stat.size
                    });
                });
            });
        }
    }).then(function (fileInfo) {
        var data = fileInfo.filter(function (info) {
            return info && !info.filename.match(/^\./) && (info.directory || info.filename.match(/(cbz|cbr)$/i))
        }).sort(function (a, b) {
            if (a.directory != b.directory) {
                return a.directory ? -1 : 1;
            }
            return a.filename.toLowerCase().localeCompare(b.filename.toLowerCase());
        });

        respond(res, data, OK, {directory: directory});
    }).catch(function (e) {
       next(e); 
    });
});

app.get('/comic/list', function (req, res, next) {
    var file = req.query.file || '';
    var filePath = path.join(config.comics_root, file);

    sevenZip.getFilesAsync(filePath)
        .then(function (entries) {
            var data = entries
                .map(function (item, index) {
                    item.fileOffset = index;
                    return item;
                })
                .filter(function (item) {
                    return item.filename.match(/\.(gif|png|jpg|bmp)$/);
                })
                .sort(function (a, b) {
                    var af = a.filename.toLowerCase();
                    var bf = b.filename.toLowerCase();

                    return af.localeCompare(bf);
                });

            respond(res, data, OK);
        }).catch(function (e) {
            if (e.stdout) {
                e.message = e.stdout;
            }
            next(e);
        });
});

app.get('/comic/image', function (req, res, next) {

    var file = req.query.file || '';
    var offset = +(req.query.offset || 0);
    var filePath = path.join(config.comics_root, file);

    return sevenZip.getFilesAsync(filePath)
        .then(function (entries){
            var entry = entries[offset];
            if (!entry) {
                throw new Error('Invalid Offset');
            }
            return sevenZip.getSingleFileAsync(filePath, entry.filename);
        }).then(function (tmpFilename) {
            fs.createReadStream(tmpFilename).pipe(res);
        }).catch (function (e) {
            next(e);
        });
});

// Error Handling
app.use(function (err, req, res, next) {
    console.log(err.stack);
    respond(res, {}, ERR, {message: err.message}, 500);
});

function respond (res, data, code, meta, statusCode) {
    data = data || {};
    code = code || OK;
    meta = meta || {};
    statusCode = statusCode || 200;
    res.status(statusCode).json(extend(
        {status: code},
        meta,
        {data: data}
    )); 
}

function getMimeType (filename) {
    var extension = filename.toLowerCase().match(/[^\.]+$/);

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

function acceptsEncoding (req, encoding) {
    var acceptedEncodingsValue = req.header('accept-encoding');
    if (!acceptedEncodingsValue) {
        return false;
    }
    var acceptedEncodings = acceptedEncodingsValue.split(/\s*,\s*/g);
    return acceptedEncodings.indexOf(encoding) > -1;
}

function handleOrigin (req, res, next) {
    var origin = req.header('origin');

    if (!origin) {
        return next();
    }

    if (!origin.match(/^https?\:\/\//)) {
        var originParsed = {
            protocol: 'http:',
            host: origin
        };
    } else {
        var originParsed = url.parse(origin);
    }

    var allowedOrigins = config.allowed_origins || [];

    var originOk = allowedOrigins.some(function (allowed) {
        if (allowed === '*') {
            return true;
        }
        if (!allowed.match(/^https?\:\/\//)) {
            var allowedParsed = {
                protocol: originParsed.protocol,
                host: allowed
            };
        } else {
            var allowedParsed = url.parse(allowed);
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
}

if (require.main == module) {
    var server = http.createServer(app)
    server.listen(8080, '0.0.0.0', function () {
        console.log('Listening on ' + server.address().port);
    })
} else if (GLOBAL.PhusionPassenger) {
    app.listen(0);
}
