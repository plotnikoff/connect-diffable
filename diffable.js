/*global module, require */

var fs = require('fs'),
    crypto = require('crypto'),
    requestHandler = require('./requestHandler'),
    FileResourceManager = require('./fileResourceManager');

module.exports = (function () {
    var that = null, 
    frm = new FileResourceManager(),
    
    /**
     * @param {Object} config
     */
    diffable = function (config) {
        this.dir = fs.realpathSync(config.diffableDir);
        this.resourceDir = config.resourceDir;
        this.provider = requestHandler({
            'root': config.resourceDir,
            'frm': frm,
            'diffableRoot': this.dir
        });
        that = this;
    };
    
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
    
    diffable.prototype.serve = function (req, res, next) {
        that.provider(req, res, next);
    };
    
    return diffable;
    
}());
