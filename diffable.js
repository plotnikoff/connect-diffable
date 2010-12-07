/*global module:true, require */

var fs = require('fs'),
    crypto = require('crypto'),
    vcdiff = require('./vcdiff.js/vcdiff'),
    provider = require('./staticProvider'),
    FileResourceManager;

FileResourceManager = function () {
    this.resources = {};
    this.versions = {};
    this.currentVersion = null;
};

FileResourceManager.prototype = {
    
    getResourceHash : function (path) {
        return this.resources[path];
    },
    
    getVersionHash : function (resourceHash) {
        return this.versions[resourceHash];
    },
    
    putResource : function (resolvedPath, resourceDir) {
        var that = this;
        
        //read resource file
        fs.readFile(resolvedPath, function (err, data) {
            if (err) {
                throw err;
            }
            
            //generate md5 hash from resource's data
            var hash = crypto.createHash('md5').update(data),
                resourceName = hash.digest('hex') + '.version',
                resourceHash = resourceDir.split('/').reverse()[0];

            that.resources[resolvedPath] = resourceHash;
            console.log(that.resources)
            
            //create version file
            fs.writeFile(resourceDir + '/' + resourceName, data, function (err) {
                if (err) {
                    throw err;
                }
                that.currentVersion = resourceName;
                that.versions[resourceHash] = resourceName.split('.')[0];
                
                console.log(that.versions);
                
                //read resource directory to fetch older versions of resource
                fs.readdir(resourceDir, function (err, files) {
                    if (err) {
                        throw err;
                    }
                    var i, len = files.length, vcd = new vcdiff.Vcdiff();
                    
                    //loop over older versions to create diffs
                    for (i = 0;i < len; i += 1) {
                        
                        //check that this is not current version and isn't a diff file
                        if (files[i] !== that.currentVersion && files[i].split('.')[1] !== 'diff') {
                            (function (fileName) {
                            
                            //read older file with older version and generate diff file
                            fs.readFile(resourceDir + '/' + fileName, 'utf8', 
                                function (err, dictData) {
                                    var diff = vcd.encode(dictData.toString(), 
                                        data.toString()),
                                    diffName = fileName.split('.')[0] + '_' + 
                                        that.currentVersion.split('.')[0] + '.diff';
                                    fs.writeFile(resourceDir + '/' + diffName, 
                                        JSON.stringify(diff), function (err) {
                                            if (err) {
                                                throw err;
                                            }
                                        })
                                }
                            );
                            }(files[i]));
                        }
                    }
                })
            });
        });
    }
    
};

module.exports = (function () {
    var that = null, 
    frm = new FileResourceManager(),
    
    diffable = function (config) {
        this.dir = fs.realpathSync(config.diffableDir);
        this.resourceDir = config.resourceDir;
        this.provider = provider({
            'root': config.resourceDir,
            'frm': frm,
            'diffableRoot': this.dir
        })
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
                
                //add first version of resource
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
