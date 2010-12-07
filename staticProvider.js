var fs = require('fs'),
    Path = require('path'),
    Buffer = require('buffer').Buffer,
    parseUrl = require('url').parse,
    queryString = require('querystring');

module.exports = function staticProvider(options){
    var maxAge, root;

        root = options.root;
        frm = options.frm;
        diffableRoot = options.diffableRoot;

    return function staticProvider(req, res, next) {
        if (req.method != 'GET' && req.method != 'HEAD') return next();

        var head = req.method == 'HEAD',
            filename, url = parseUrl(req.url);

        // Absolute path
        filename = Path.join(root, queryString.unescape(url.pathname));

        // Index.html support
        if (filename[filename.length - 1] === '/') {
            filename += "index.html";
        }
            
            fs.stat(filename, function (err, stat) {

                // Pass through for missing files, thow error for other problems
                if (err) {
                    if (filename.match(/\/diffable\/(.)*\.diff/gi)) {
                        var diffHash = filename.split('/').reverse()[0];
                        diffHash = diffHash.split('_');
                        fs.readFile(diffableRoot + '/' + diffHash[0] + '/' +
                            diffHash[1] + '_' + diffHash[2], onDiffRead)
                    } else if(filename.match(/\/diffable\/(.)*/gi)) {
                        var resHash = filename.split('/').reverse()[0],
                            verHash = frm.getVersionHash(resHash);
                        if (verHash) {
                            fs.readFile(diffableRoot + '/' + resHash + '/' + verHash + '.version', onJsRead);
                        } else {
                            return next();
                        }
                    } else {
                        return err.errno === process.ENOENT ? next() : next(err);
                    }
                } else if (stat.isDirectory()) {
                    return next();
                }
                
                function onDiffRead(err, diffData) {
                    if (err) {
                        return next();
                    }
                    fs.readFile(diffableRoot + '/DeltaBootstrap.js', function (err, data) {
                        if (err) {
                            throw err;
                        }
                        var script = data.toString();
                        script = script.replace('{{DJS_RESOURCE_IDENTIFIER}}', diffHash[0]);
                        script = script.replace('{{DJS_DIFF_CONTENT}}', diffData.toString());
                        
                        var headers = {
                            "Content-Type": 'text/javascript',
                            "Content-Length": script.length,
                            "Cache-Control": "public, max-age=63072000",
                            "Last-Modified": new Date(2000, 01, 01).toUTCString(),
                            "Expires": new Date().toUTCString()
                        };

                        res.writeHead(200, headers);
                        res.end(head ? undefined : script);
                    });
                }
                
                
                function onJsRead(err, versiondata) {
                    if (err) {
                        return next();
                    }
                    fs.readFile(diffableRoot + '/JsDictionaryBootstrap.js', function (err, data) {
                        if (err) {
                            throw err;
                        }
                        
                        var script = data.toString();
                        script = script.replace('{{DJS_RESOURCE_IDENTIFIER}}', resHash);
                        script = script.replace('{{DJS_CODE}}', JSON.stringify(versiondata.toString()));
                        script = script.replace('{{DJS_BOOTSTRAP_VERSION}}', verHash);
                        script = script.replace('{{DJS_DIFF_URL}}', '/diffable/' + resHash + '/');
                        var headers = {
                            "Content-Type": 'text/javascript',
                            "Content-Length": script.length,
                            "Cache-Control": "public, max-age=63072000",
                            "Last-Modified": new Date(2000, 01, 01).toUTCString(),
                            "Expires": new Date().toUTCString()
                        };

                        res.writeHead(200, headers);
                        res.end(head ? undefined : script);
                    });
                }
                
                
                function onHtmlRead (err, data) {
                    if (err) {
                        return next(err);
                    }
                    var strData = data.toString(), 
                        matches = strData.match(/\{\{DIFFABLE(.)*\}\}/gi), 
                        i, len, resource, script = "", counter = 0;
                        
                    if (matches === null) {
                        return next();
                    }

                    for (i = 0, len = matches.length; i < len; i += 1) {
                        resource = matches[i].split('"')[1];
                        
                        (function (counter) {fs.realpath(root + resource, function (err, resolvedPath) {
                            var resHash = frm.getResourceHash(resolvedPath)
                            verHash = frm.getVersionHash(resHash)
                            
                            script += '<script type="text/javascript">' +
                                "if(!window['deltajs']) { window['deltajs'] = {};}" +
                                "window['deltajs']['" + resHash + "']={};" +
                                "window['deltajs']['" + resHash + "']['cv'] = '" + verHash + "';" +
                                '</script>' +
                                '<script type="text/javascript" src="/diffable/' + resHash + '"></script>'
                            strData = strData.replace(matches[counter], script);
                            script = '';
                            counter += 1
                            if (counter === len) {
                                var headers = {
                                    "Content-Type": 'text/html',
                                    "Content-Length": strData.length,
                                    "Cache-Control": "private, max-age=0",
                                    "Expires": "-1"
                                };

                                res.writeHead(200, headers);
                                res.end(head ? undefined : strData);
                            }
                            
                        });
                        }(i))
                    }
                }
                
                fs.realpath(filename, function (err, resolvedPath) {
                    if (err) {
                        return next();
                    }
                    var file = filename.split('/').reverse()[0];
                    if (file.match(/(.)*\.html/gi)) {
                        fs.readFile(filename, onHtmlRead);
                    } else {
                        return next();
                    }
                })
            });
    };
};

