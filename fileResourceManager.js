var fs = require('fs'),
    crypto = require('crypto'),
    vcdiff = require('./vcdiff.js/vcdiff');

/**
 * 
 */
var FileResourceManager = function () {
    this.resources = {};
    this.versions = {};
    this.currentVersion = null;
};

FileResourceManager.prototype = {
    
    /**
     * 
     * @param {Object} path
     */
    getResourceHash : function (path) {
        return this.resources[path];
    },
    
    /**
     * 
     * @param {Object} resourceHash
     */
    getVersionHash : function (resourceHash) {
        return this.versions[resourceHash];
    },
    
    /**
     * 
     * @param {Object} resolvedPath
     * @param {Object} resourceDir
     */
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

module.exports = FileResourceManager;