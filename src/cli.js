#!/usr/bin/env node

const path = require('path');
const { createSymlink } = require('@lerna/create-symlink');
const { lsDir, isDir, readFileAsJson, ensureDirectoryExistence, convertPathForWin, deleteThenWrite} = require('./utils');

const [,, ...argv] = process.argv;
const arguments = argvToObject(argv);

const isWindows = process.platform === 'win32';
const useSymlinks = arguments.hasOwnProperty('useLink') && typeof arguments.useLink === 'boolean'
    ? arguments.useLink
    : !isWindows;
const createCommands = arguments.hasOwnProperty('createCmd') && typeof arguments.createCmd === 'boolean'
    ? arguments.createCmd
    : isWindows;
const newLine = isWindows ? '\r\n' : '\n';

function normalizeValue($value) {
    if (/^(true|false)$/.test($value)) {
        return $value === 'true';
    }
    if (/^[1-9]\d*$/.test($value)) {
        return parseInt($value);
    }
    return $value;
}

function normalizeArgumentName($name) {
    return $name
        .replace(/^--/, '')
        .replace(/-(\w)/g, function ($match, $letter) {
            return $letter.toUpperCase();
        })
}

/**
 * @param { Array<string> }$argv
 * @return {{[string]: string}}
 */
function argvToObject($argv) {
    let rtn = {};
    for(let i = 0, l = $argv.length; i < l; i++) {
        if (/^--\w/.test($argv[i])) {
            if (i + 1 < l && !/^--/.test($argv[i + 1])) {
                rtn = {
                    ...rtn,
                    [normalizeArgumentName($argv[i])]: normalizeValue($argv[i + 1]),
                }
                i++;
            } else {
                rtn = {
                    ...rtn,
                    [normalizeArgumentName($argv[i])]: true,
                }

            }
        }
    }
    return rtn;
}

/**
 * @param {string} $path
 * @return {string}
 */
function generateWinCmdFor($path) {
    return '' +
        '@ECHO off' + newLine +
        'SETLOCAL' + newLine +
        'CALL :find_dp0' + newLine +
        'IF EXIST "%dp0%\\node.exe" (' + newLine +
        '  SET "_prog=%dp0%\\node.exe"' + newLine +
        ') ELSE (' + newLine +
        '  SET "_prog=node"' + newLine +
        '  SET PATHEXT=%PATHEXT:;.JS;=;%' + newLine +
        ')' + newLine +
        '"%_prog%"  "%dp0%\\' + convertPathForWin($path) + '" %*' + newLine +
        'ENDLOCAL' + newLine +
        'EXIT /b %errorlevel%' + newLine +
        ':find_dp0' + newLine +
        'SET dp0=%~dp0' + newLine +
        'EXIT /b`' + newLine;
}

/**
 * @param {string} $path
 * @return {string}
 */
function generateUnixScriptFor($path) {
    return '' +
        '#!/bin/sh' + newLine +
        'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")' + newLine +
        'case `uname` in' + newLine +
        '    *CYGWIN*|*MINGW*|*MSYS*) basedir=`cygpath -w "$basedir"`;;' + newLine +
        'esac' + newLine +
        'if [ -x "$basedir/node" ]; then' + newLine +
        '  "$basedir/node"  "$basedir/' + $path + '" "$@"' + newLine +
        '  ret=$?' + newLine +
        'else' + newLine +
        '  node  "$basedir/' + $path + '" "$@"' + newLine +
        '  ret=$?' + newLine +
        'fi' + newLine +
        'exit $ret' + newLine;
}

lsDir('./')
    .then($items => {
        return Promise
            .all(
                $items.map($item => {
                    const item = path.resolve('./', $item);
                    return isDir(item)
                        .then($ => $ ? item : null)
                })
            )
            .then($dirs => $dirs.filter($ => $ !== null));
    })
    .then($dirs => {
        return Promise
            .all(
                $dirs.map($dir => lsDir($dir).then($ => $.indexOf('package.json') > -1 ? $dir : null))
            )
            .then($dirsWithPackage => $dirsWithPackage.filter($ => $ !== null));
    })
    .then($projects => {
        console.log('Child projects found: ' + $projects.map($ => path.relative(__dirname, $)).join(', '));
        readFileAsJson('./package.json')
            .then($projectPackage => {
                const dependencies = {
                    ...$projectPackage.dependencies,
                    ...$projectPackage.devDependencies,
                    ...$projectPackage.localDependencies,
                }

                return Promise
                    .all(
                        Object
                            .keys(dependencies)
                            .map($dependencyName => {
                                const packageRoot = path.resolve(__dirname, `./node_modules/${$dependencyName}`);
                                return readFileAsJson(`${packageRoot}/package.json`)
                                    .then($dependencyPackage => {
                                        if ('bin' in $dependencyPackage) {
                                            if (typeof $dependencyPackage.bin === 'string') {
                                                return [ {
                                                    name: $dependencyPackage.name,
                                                    target: path.join(packageRoot, $dependencyPackage.bin),
                                                } ];
                                            } else if (typeof $dependencyPackage.bin === 'object') {
                                                const bins = Object.keys($dependencyPackage.bin);
                                                if (bins.length > 0) {
                                                    return bins.map($ => ({
                                                        name: $,
                                                        target: path.join(packageRoot, $dependencyPackage.bin[$]),
                                                    }))
                                                }
                                            }
                                        }
                                        return null;
                                    })
                                    .catch(() => null);
                            })
                    )
                    .then($bins => {
                        return $bins.filter($ => $ !== null);
                    })
                    .then($bins => {
                        return $bins.reduce(($acc, $current) => $acc.concat($current), [])
                    })
                    .then($bins => {
                        return Promise.all(
                            $projects.map($project => {
                                const projectBinPath = path.join($project, 'node_modules/.bin');
                                return ensureDirectoryExistence(projectBinPath)
                                    .then(() => {
                                        return Promise.all($bins.map($bin => {
                                            const linkPath = path.join(projectBinPath, $bin.name);
                                            if (!useSymlinks) {
                                                const realBinRelativeToFake = path.relative(path.dirname(linkPath), $bin.target);
                                                // Make shell executable
                                                const shellCmdPromise = deleteThenWrite(linkPath, generateUnixScriptFor(realBinRelativeToFake), {mode: 0o755});
                                                if (createCommands) {
                                                    // Make cmd for WIN platform.
                                                    return shellCmdPromise.then(() => {
                                                        return deleteThenWrite(linkPath + '.cmd', generateWinCmdFor(realBinRelativeToFake), {mode: 0o755});
                                                    })
                                                }
                                                return shellCmdPromise;
                                            }

                                            // create link for project
                                            return createSymlink($bin.target, linkPath);
                                        }));
                                    })
                            })
                        );
                    });
            })

    })
    .catch($ => {
        console.error($);
        process.exit(1);
    });
