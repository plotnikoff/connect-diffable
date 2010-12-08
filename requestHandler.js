/*jslint nomen:false, regexp:false*/

/*global module, require, __dirname*/

var fs = require('fs'),
    Path = require('path'),
    parseUrl = require('url').parse,
    queryString = require('querystring'), that;

/**
 * 
 * @param {Object} res
 * @param {Object} string
 */
function sendForCaching(res, str) {
    var headers = {
        "Content-Type": 'text/javascript',
        "Content-Length": str.length,
        "Cache-Control": "public, max-age=63072000",
        "Last-Modified": new Date(2000, 1, 1).toUTCString(),
        "Expires": new Date().toUTCString()
    };

    res.writeHead(200, headers);
    res.end(str);
}

module.exports = function requestHandler(options) {
    var root = options.root,
        frm = options.frm,
        diffableRoot = options.diffableRoot;

    return function staticProvider(req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
        }

        var filename, url = parseUrl(req.url), hashes, resHash, dicrVerHash,
            targetVerHash;


        function onDiffRead(err, diffData) {
            if (err) {
                return next();
            }
            fs.readFile(__dirname + '/resources/DeltaBootstrap.js', 
                function (err, data) {
                    if (err) {
                        throw err;
                    }
                    var script = data.toString();
                    script = script.replace('{{DJS_RESOURCE_IDENTIFIER}}', 
                        resHash);
                    script = script.replace('{{DJS_DIFF_CONTENT}}', 
                        diffData.toString());

                    sendForCaching(res, script);
                }
            );
        }

        function onJsRead(err, versionData) {
            if (err) {
                return next();
            }
            fs.readFile(__dirname + '/resources/JsDictionaryBootstrap.js', 
                function (err, data) {
                    if (err) {
                        throw err;
                    }
                    var script = data.toString();
                    script = script.replace('{{DJS_RESOURCE_IDENTIFIER}}', 
                        resHash);
                    script = script.replace('{{DJS_CODE}}', 
                        JSON.stringify(versionData.toString()));
                    script = script.replace('{{DJS_BOOTSTRAP_VERSION}}', 
                        dicrVerHash);
                    script = script.replace('{{DJS_DIFF_URL}}', 
                        '/diffable/' + resHash + '/');
                    sendForCaching(res, script);
                }
            );
        }

        function onHtmlRead(err, data) {
            if (err) {
                return next(err);
            }
            var strData = data.toString(), 
                matches = strData.match(/\{\{DIFFABLE(.)*\}\}/gi), 
                i, len, resource, script = "", counter = 0;

            //file doesn't contain diffable template. Pass through to 
            //next middleware
            if (matches === null) {
                return next();
            }

            for (i = 0, len = matches.length; i < len; i += 1) {
                resource = matches[i].split('"')[1];
                (function (counter) {
                    fs.realpath(root + resource, function (err, resolvedPath) {
                        var resHash = frm.getResourceHash(resolvedPath),
                            verHash = frm.getVersionHash(resHash), headers;
                            
                        script += '<script type="text/javascript">' +
                            "if(!window['deltajs']) { window['deltajs'] = {};}" +
                            "window['deltajs']['" + resHash + "']={};" +
                            "window['deltajs']['" + resHash + "']['cv'] = '" + 
                            verHash + "';" + '</script>' +
                            '<script type="text/javascript" src="/diffable/' +
                            resHash + '"></script>';
                        strData = strData.replace(matches[counter], script);
                        script = '';
                        counter += 1;
                        if (counter === len) {
                            headers = {
                                "Content-Type": 'text/html',
                                "Content-Length": strData.length,
                                "Cache-Control": "private, max-age=0",
                                "Expires": "-1"
                            };

                            res.writeHead(200, headers);
                            res.end(strData);
                        }

                    });
                }(i));
            }
        }
        
        
        filename = Path.join(root, queryString.unescape(url.pathname));

        if (filename[filename.length - 1] === '/') {
            filename += "index.html";
        }

        if (filename.match(/\/diffable\/(.)*\.diff/gi)) {
            //was it request for delta data
            hashes = filename.split('/').reverse()[0].diffHash.split('_');
            resHash = hashes[0];
            dicrVerHash = hashes[1];
            targetVerHash = hashes[2].split('.');
            fs.readFile(diffableRoot + '/' + resHash + '/' +
                dicrVerHash + '_' + targetVerHash + '.diff', onDiffRead);
        } else if (filename.match(/\/diffable\/(.)/gi)) {
            //was it request for versioned file
            resHash = filename.split('/').reverse()[0];
            dicrVerHash = frm.getVersionHash(resHash);
            if (dicrVerHash) {
                fs.readFile(diffableRoot + '/' + resHash +
                    '/' + dicrVerHash + '.version', onJsRead);
            } else {
                return next();
            }
        } else if (filename.match(/(.)*\.html/gi)) {
            fs.readFile(filename, onHtmlRead);
        } else {
            return next();
        }
        
    };
};