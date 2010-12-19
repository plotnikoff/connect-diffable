/*jslint nomen:false, regexp:false*/

/*global module, require, __dirname, process*/

var fs = require('fs'),
    Path = require('path'),
    parseUrl = require('url').parse,
    queryString = require('querystring'), that;
/**
 * Function sends response with aggresive caching
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

function sendConditional(res) {
    res.writeHead(304, {
        "Content-Type": 'text/javascript',
        "Last-Modified": new Date(2000, 1, 1).toUTCString(),
        "Expires": new Date().toUTCString(),
        "Cache-Control": "public, max-age=63072000"
    });
    res.end();
}

/**
 * @param {Object} options
 * @cfg {String} resourceDir
 * @cfg {FileResourceManager} frm
 * @cfg {String} diffableRoot
 */
module.exports = function requestHandler(config) {
    var root = config.resourceDir,
        frm = config.frm,
        diffableRoot = config.diffableRoot,
        log = config.logger ? config.logger : function () {},
        suffix = process.env.NODE_ENV === 'production' ? '.min' : '',
        bootScript = fs.readFileSync(__dirname +
            '/resources/DJSBootstrap' + suffix + '.js', 'utf8'),
        deltaScript = fs.readFileSync(__dirname +
            '/resources/DeltaBootstrap' + suffix + '.js', 'utf8'),
        versionScript = fs.readFileSync(__dirname +
            '/resources/JsDictionaryBootstrap' + suffix + '.js', 'utf8');
    
    return function (req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
        }

        var filename, url = parseUrl(req.url), hashes, resHash, dictVerHash,
            targetVerHash;

        //Delta request handler
        function onDiffRead(err, diffData) {
            if (err) {
                return next();
            }
            var script = deltaScript;
            script = script.replace('{{DJS_RESOURCE_IDENTIFIER}}', 
                resHash);
            script = script.replace('{{DJS_DIFF_CONTENT}}', diffData.toString());
            log({
                'type' : 'delta',
                'resource' : resHash,
                'deltaFile' : dictVerHash + '_' + targetVerHash + '.diff'
            });
            sendForCaching(res, script);
        }

        //Version request handler
        function onJsRead(err, versionData) {
            if (err) {
                return next();
            }
            var script = versionScript;
            script = script.replace('{{DJS_RESOURCE_IDENTIFIER}}', resHash);
            script = script.replace('{{DJS_CODE}}', 
                JSON.stringify(versionData.toString()));
            script = script.replace('{{DJS_BOOTSTRAP_VERSION}}', dictVerHash);
            script = script.replace('{{DJS_DIFF_URL}}', 
                '/diffable/' + resHash + '/');
            log({
                'type' : 'version',
                'resource' : resHash,
                'versionFile' : dictVerHash + '.version'
            });
            sendForCaching(res, script);
        }

        //HTML request handler
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
                        
                        if (counter === 0) {
                            script += "<script>" + bootScript + "</script>";
                        }
                        
                        script += '<script type="text/javascript">' +
                            "if(!window['deltajs']) { window['deltajs'] = {};}" +
                            "window['deltajs']['" + resHash + "']={};" +
                            "window['deltajs']['" + resHash + "']['cv'] = '" + 
                            verHash + "';" +
                            "DJSBootstrap.checkStorage('" + resHash + "','" + verHash + "');" +
                            "</script>";
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
                            log({
                                'type' : 'html',
                                'resource' : resHash
                            });
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
            //request for delta data
            if (!req.headers['if-modified-since']) {
                hashes = filename.split('/').reverse()[0].split('_');
                resHash = hashes[0];
                dictVerHash = hashes[1];
                targetVerHash = hashes[2].split('.')[0];
                fs.readFile(diffableRoot + '/' + resHash + '/' +
                    dictVerHash + '_' + targetVerHash + '.diff', onDiffRead);
            } else {
                sendConditional(res);
            }
        } else if (filename.match(/\/diffable\/(.)/gi)) {
            //request for versioned file
            if (!req.headers['if-modified-since']) {
                resHash = filename.split('/').reverse()[0];
                dictVerHash = frm.getVersionHash(resHash);
                if (dictVerHash) {
                    fs.readFile(diffableRoot + '/' + resHash +
                    '/' +
                    dictVerHash +
                    '.version', onJsRead);
                }
                else {
                    return next();
                }
            } else {
                sendConditional(res);
            }
        } else if (filename.match(/(.)*\.html/gi)) {
            //request for html page
            fs.readFile(filename, onHtmlRead);
        } else {
            //pass through to next middleware
            return next();
        }
        
    };
};
