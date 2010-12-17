/*global module, require */

var fs = require('fs'),
    crypto = require('crypto'),
    requestHandler = require('./requestHandler'),
    FileResourceManager = require('./fileResourceManager');

module.exports = (function () {
    var that = null, 
    frm = new FileResourceManager(),
    
    /**
     * Instantiates diffable object
     * @class
     * @constructs
     * @param {Object} config configuration object
     * <code>
     * <pre>
     *     {
     *         "diffableDir" : '/path/to/directory'
     *         "resourceDir" : '/path/to/directory'
     *     }
     * </pre>
     * </code>
     * <code>diffableDir</code> - directory where delta and version files will 
     * be stored<br />
     * <code>resourceDir</code> - directory where diffable can find static files.
     */
    diffable = function (config) {
        this.dir = fs.realpathSync(config.diffableDir);
        this.resourceDir = config.resourceDir;
        this.provider = requestHandler({
            'resourceDir': config.resourceDir,
            'frm': frm,
            'diffableRoot': this.dir,
            'logger' : config.logger
        });
        that = this;
    };
    
    /**
     * Method adds resources that should be served with diffable.
     * @private
     * @param {String} path Path to resource that should be served by diffable.
     * Path is relative to <code>resourceDir</code>.
     */
    diffable.prototype.watch = function (path) {
        //resolving absolute path to resource being tracked
        fs.realpath(this.resourceDir + path, function (err, resolvedPath) {
            if (err) {
                throw err;
            }
            
            var hash = crypto.createHash('md5').update(resolvedPath), 
                resourceDir = that.dir + '/' + hash.digest('hex');
            
            //Create resource directory (if doesn't exist) name of directory is
            // md5 hash of resource's absolute path
            fs.mkdir(resourceDir, 0755, function (err) {
                
                //create first version of resource
                frm.putResource(resolvedPath, resourceDir);
                
                //add callback to track file changes
                fs.watchFile(resolvedPath, function (curr, prev) {
                    
                    //if changes were made add new version of resource
                    frm.putResource(resolvedPath, resourceDir);
                });
            });
        });
    };
    
    /**
     * Method adds files to diffable control, and returns Connect middleware.
     * Returns connect stack interface, if request contains data that is 
     * relevant to diffable this middleware will serve appropriate version 
     * and/or delta files.
     * @public
     * @param {String} filename... varargs names of the files to look for. Paths
     * are relative to <code>resourceDir</code> in configuration object
     * @returns {Function}
     */
    diffable.prototype.serve = function () {
        var i = 0, len = arguments.length
        if (len >= 1) {
            for (; i < len; i += 1) {
                that.watch(arguments[i]);
            }
            return that.provider;
        } else {
            console.log('Diffable: There are no files under control')
            return function (req, res, next) {
                next();
            }
        }
    }
    
    return diffable;
    
}());
