const fs = require('fs');
const path = require('path');

/**
 * @param {string} $path
 * @return {string}
 */
function convertPathForWin($path) {
    return $path.replace(/\//g, '\\');
}

/**
 * @param {string} $path
 * @return {Promise<boolean>}
 */
function fileExists($path) {
    return new Promise(($resolve, $reject) => {
        fs.stat($path, ($err, $stats) => {
            if ($err) {
                $resolve(false);
            } else {
                $resolve(true);
            }
        })
    });
}

/**
 * @param {string} $path
 * @param {{[encoding]: string, [flag]: string}} [$options]
 * @return {Promise<string | Buffer>}
 */
function getFileContent($path, $options) {
    return new Promise(($resolve, $reject) => {
        const handler = ($err, $data) => {
            if ($err) {
                $reject($err);
            } else {
                $resolve($data);
            }
        };
        if ($options) {
            fs.readFile($path, $options, handler);
        }
        fs.readFile($path, handler);
    });
}

/**
 * @param {string} $path
 * @return {Promise<*>}
 */
function readFileAsJson($path) {
    return getFileContent($path, { encoding: 'utf-8', })
        .then(JSON.parse);
}

/**
 * @param {string} $filePath
 * @param {string | Buffer} $data
 * @param {{[encoding]: string | null, [mode]: number, [flag]: string, [signal]: string, } | null} [$options]
 * @returns {Promise<unknown>}
 */
function writeFile($filePath, $data, $options) {
    return new Promise(($resolve, $reject) => {
        function cb($err) {
            if ($err) {
                $reject($err);
            } else {
                $resolve();
            }
        }
        if (typeof $options === 'object' && $options !== null) {
            fs.writeFile($filePath, $data, $options, cb);
        } else {
            fs.writeFile($filePath, $data, cb);
        }
    });
}

/**
 * @param {string} $path
 * @return {Promise<void>}
 */
function deleteFile($path) {
    return new Promise(($resolve, $reject) => {
        console.log('Deleting file ' + $path);
        fs.unlink($path, $err => {
            if ($err) {
                $reject($err);
            } else {
                $resolve();
            }
        })
    });
}

/**
 * @param {string} $path
 * @param {string|Buffer} $content
 * @param {{[encoding]:string, [mode]:number, [flag]:string} | null} [$options]
 * @return {Promise<void>}
 */
function deleteThenWrite($path, $content, $options) {
    return fileExists($path)
        .then($exists => {
            if ($exists) {
                return deleteFile($path);
            }
        })
        .then(() => writeFile($path, $content, $options));
}

/**
 * @param { string } $dir
 * @return { Promise.<string[]> }
 *
 */
function lsDir($dir) {
    return new Promise(($resolve, $reject) => {
        fs.readdir($dir, ($err, $files) => {
            if ($err) {
                $reject($err);
            } else {
                $resolve($files);
            }
        });
    });
}

/**
 * @param $item
 * @return { Promise<boolean> }
 */
function isDir($item) {
    return new Promise(($resolve, $reject) => {
        fs.stat($item, ($err, $stats) => {
            if ($err) {
                $reject($err);
            } else {
                $resolve($stats.isDirectory());
            }
        })
    });
}

/**
 * @param {string} $dirPath
 * @return {Promise<void>}
 */
function makeDir($dirPath) {
    return new Promise(($resolve, $reject) => {
        fs.mkdir($dirPath, $err => {
            if ($err) {
                $reject($err);
            } else {
                $resolve($dirPath);
            }
        })
    });
}

/**
 * @param {string} $dirPath
 * @return {Promise.<string>}
 */
function ensureDirectoryExistence($dirPath) {
    return new Promise(($resolve, ignore) => {
        fs.stat($dirPath, ($err, ignore) => {
            if ($err) {
                // Do not exist
                makeDir($dirPath)
                    .then($resolve)
                    .catch($err => {
                        // Try to create directory recursively
                        const parentDir = path.dirname($dirPath);
                        if (!!parentDir || parentDir === '/' || /\w:\\/.test(parentDir)) {
                            return ensureDirectoryExistence(parentDir)
                                .then(() => makeDir($dirPath));
                        }
                        throw $err;
                    });
            } else {
                $resolve($dirPath);
            }
        });
    });
}

module.exports = {
    convertPathForWin,
    fileExists,
    getFileContent,
    readFileAsJson,
    writeFile,
    deleteFile,
    deleteThenWrite,
    lsDir,
    isDir,
    makeDir,
    ensureDirectoryExistence,
};
