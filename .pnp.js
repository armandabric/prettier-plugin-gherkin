#!/usr/bin/env node

/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, null, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const ignorePattern = null ? new RegExp(null) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = [];
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}\//;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![a-zA-Z]:[\\\/]|\\\\|\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`,
      ].join(` `)
    );
  }

  return locator;
}

let packageInformationStores = new Map([
  ["gherkin", new Map([
    ["6.0.17", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-gherkin-6.0.17-d1218a221f288c100fcbc5a47697f6bedc7242c9/node_modules/gherkin/"),
      packageDependencies: new Map([
        ["c21e", "1.1.9"],
        ["cucumber-messages", "2.1.2"],
        ["gherkin", "6.0.17"],
      ]),
    }],
  ])],
  ["c21e", new Map([
    ["1.1.9", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-c21e-1.1.9-3741470b2c1aff87944dc1a226cfa30722f01966/node_modules/c21e/"),
      packageDependencies: new Map([
        ["c21e", "1.1.9"],
      ]),
    }],
  ])],
  ["cucumber-messages", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cucumber-messages-2.1.2-b938a17680fda86af2e6590bfd3a94870f9aa350/node_modules/cucumber-messages/"),
      packageDependencies: new Map([
        ["protobufjs", "6.8.8"],
        ["cucumber-messages", "2.1.2"],
      ]),
    }],
  ])],
  ["protobufjs", new Map([
    ["6.8.8", {
      packageLocation: path.resolve(__dirname, "./.pnp/unplugged/npm-protobufjs-6.8.8-c8b4f1282fd7a90e6f5b109ed11c84af82908e7c/node_modules/protobufjs/"),
      packageDependencies: new Map([
        ["@protobufjs/aspromise", "1.1.2"],
        ["@protobufjs/base64", "1.1.2"],
        ["@protobufjs/codegen", "2.0.4"],
        ["@protobufjs/eventemitter", "1.1.0"],
        ["@protobufjs/fetch", "1.1.0"],
        ["@protobufjs/float", "1.0.2"],
        ["@protobufjs/inquire", "1.1.0"],
        ["@protobufjs/path", "1.1.2"],
        ["@protobufjs/pool", "1.1.0"],
        ["@protobufjs/utf8", "1.1.0"],
        ["@types/long", "4.0.0"],
        ["@types/node", "10.12.27"],
        ["long", "4.0.0"],
        ["protobufjs", "6.8.8"],
      ]),
    }],
  ])],
  ["@protobufjs/aspromise", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-aspromise-1.1.2-9b8b0cc663d669a7d8f6f5d0893a14d348f30fbf/node_modules/@protobufjs/aspromise/"),
      packageDependencies: new Map([
        ["@protobufjs/aspromise", "1.1.2"],
      ]),
    }],
  ])],
  ["@protobufjs/base64", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-base64-1.1.2-4c85730e59b9a1f1f349047dbf24296034bb2735/node_modules/@protobufjs/base64/"),
      packageDependencies: new Map([
        ["@protobufjs/base64", "1.1.2"],
      ]),
    }],
  ])],
  ["@protobufjs/codegen", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-codegen-2.0.4-7ef37f0d010fb028ad1ad59722e506d9262815cb/node_modules/@protobufjs/codegen/"),
      packageDependencies: new Map([
        ["@protobufjs/codegen", "2.0.4"],
      ]),
    }],
  ])],
  ["@protobufjs/eventemitter", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-eventemitter-1.1.0-355cbc98bafad5978f9ed095f397621f1d066b70/node_modules/@protobufjs/eventemitter/"),
      packageDependencies: new Map([
        ["@protobufjs/eventemitter", "1.1.0"],
      ]),
    }],
  ])],
  ["@protobufjs/fetch", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-fetch-1.1.0-ba99fb598614af65700c1619ff06d454b0d84c45/node_modules/@protobufjs/fetch/"),
      packageDependencies: new Map([
        ["@protobufjs/aspromise", "1.1.2"],
        ["@protobufjs/inquire", "1.1.0"],
        ["@protobufjs/fetch", "1.1.0"],
      ]),
    }],
  ])],
  ["@protobufjs/inquire", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-inquire-1.1.0-ff200e3e7cf2429e2dcafc1140828e8cc638f089/node_modules/@protobufjs/inquire/"),
      packageDependencies: new Map([
        ["@protobufjs/inquire", "1.1.0"],
      ]),
    }],
  ])],
  ["@protobufjs/float", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-float-1.0.2-5e9e1abdcb73fc0a7cb8b291df78c8cbd97b87d1/node_modules/@protobufjs/float/"),
      packageDependencies: new Map([
        ["@protobufjs/float", "1.0.2"],
      ]),
    }],
  ])],
  ["@protobufjs/path", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-path-1.1.2-6cc2b20c5c9ad6ad0dccfd21ca7673d8d7fbf68d/node_modules/@protobufjs/path/"),
      packageDependencies: new Map([
        ["@protobufjs/path", "1.1.2"],
      ]),
    }],
  ])],
  ["@protobufjs/pool", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-pool-1.1.0-09fd15f2d6d3abfa9b65bc366506d6ad7846ff54/node_modules/@protobufjs/pool/"),
      packageDependencies: new Map([
        ["@protobufjs/pool", "1.1.0"],
      ]),
    }],
  ])],
  ["@protobufjs/utf8", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@protobufjs-utf8-1.1.0-a777360b5b39a1a2e5106f8e858f2fd2d060c570/node_modules/@protobufjs/utf8/"),
      packageDependencies: new Map([
        ["@protobufjs/utf8", "1.1.0"],
      ]),
    }],
  ])],
  ["@types/long", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-long-4.0.0-719551d2352d301ac8b81db732acb6bdc28dbdef/node_modules/@types/long/"),
      packageDependencies: new Map([
        ["@types/long", "4.0.0"],
      ]),
    }],
  ])],
  ["@types/node", new Map([
    ["10.12.27", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-node-10.12.27-eb3843f15d0ba0986cc7e4d734d2ee8b50709ef8/node_modules/@types/node/"),
      packageDependencies: new Map([
        ["@types/node", "10.12.27"],
      ]),
    }],
  ])],
  ["long", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-long-4.0.0-9a7b71cfb7d361a194ea555241c92f7468d5bf28/node_modules/long/"),
      packageDependencies: new Map([
        ["long", "4.0.0"],
      ]),
    }],
  ])],
  ["npm-run-path", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-npm-run-path-3.1.0-7f91be317f6a466efed3c9f2980ad8a4ee8b0fa5/node_modules/npm-run-path/"),
      packageDependencies: new Map([
        ["path-key", "3.1.0"],
        ["npm-run-path", "3.1.0"],
      ]),
    }],
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/"),
      packageDependencies: new Map([
        ["path-key", "2.0.1"],
        ["npm-run-path", "2.0.2"],
      ]),
    }],
  ])],
  ["path-key", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-key-3.1.0-99a10d870a803bdd5ee6f0470e58dfcd2f9a54d3/node_modules/path-key/"),
      packageDependencies: new Map([
        ["path-key", "3.1.0"],
      ]),
    }],
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/"),
      packageDependencies: new Map([
        ["path-key", "2.0.1"],
      ]),
    }],
  ])],
  ["prettier", new Map([
    ["1.17.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-prettier-1.17.1-ed64b4e93e370cb8a25b9ef7fef3e4fd1c0995db/node_modules/prettier/"),
      packageDependencies: new Map([
        ["prettier", "1.17.1"],
      ]),
    }],
  ])],
  ["read-json-lines-sync", new Map([
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-read-json-lines-sync-2.0.2-2f9925b4bad13b6c178ac8fd5889bd09abce412b/node_modules/read-json-lines-sync/"),
      packageDependencies: new Map([
        ["read-json-lines-sync", "2.0.2"],
      ]),
    }],
  ])],
  ["@types/prettier", new Map([
    ["1.16.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-prettier-1.16.4-5e5e97702cb68498aaba7349b941648daaf2385c/node_modules/@types/prettier/"),
      packageDependencies: new Map([
        ["@types/prettier", "1.16.4"],
      ]),
    }],
  ])],
  ["eslint", new Map([
    ["5.16.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-eslint-5.16.0-a1e3ac1aae4a3fbd8296fcf8f7ab7314cbb6abea/node_modules/eslint/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["ajv", "6.9.2"],
        ["chalk", "2.4.2"],
        ["cross-spawn", "6.0.5"],
        ["debug", "4.1.1"],
        ["doctrine", "3.0.0"],
        ["eslint-scope", "4.0.3"],
        ["eslint-utils", "1.3.1"],
        ["eslint-visitor-keys", "1.0.0"],
        ["espree", "5.0.1"],
        ["esquery", "1.0.1"],
        ["esutils", "2.0.2"],
        ["file-entry-cache", "5.0.1"],
        ["functional-red-black-tree", "1.0.1"],
        ["glob", "7.1.3"],
        ["globals", "11.11.0"],
        ["ignore", "4.0.6"],
        ["import-fresh", "3.0.0"],
        ["imurmurhash", "0.1.4"],
        ["inquirer", "6.2.2"],
        ["js-yaml", "3.13.0"],
        ["json-stable-stringify-without-jsonify", "1.0.1"],
        ["levn", "0.3.0"],
        ["lodash", "4.17.11"],
        ["minimatch", "3.0.4"],
        ["mkdirp", "0.5.1"],
        ["natural-compare", "1.4.0"],
        ["optionator", "0.8.2"],
        ["path-is-inside", "1.0.2"],
        ["progress", "2.0.3"],
        ["regexpp", "2.0.1"],
        ["semver", "5.6.0"],
        ["strip-ansi", "4.0.0"],
        ["strip-json-comments", "2.0.1"],
        ["table", "5.2.3"],
        ["text-table", "0.2.0"],
        ["eslint", "5.16.0"],
      ]),
    }],
  ])],
  ["@babel/code-frame", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-code-frame-7.0.0-06e2ab19bdb535385559aabb5ba59729482800f8/node_modules/@babel/code-frame/"),
      packageDependencies: new Map([
        ["@babel/highlight", "7.0.0"],
        ["@babel/code-frame", "7.0.0"],
      ]),
    }],
  ])],
  ["@babel/highlight", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-highlight-7.0.0-f710c38c8d458e6dd9a201afb637fcb781ce99e4/node_modules/@babel/highlight/"),
      packageDependencies: new Map([
        ["chalk", "2.4.2"],
        ["esutils", "2.0.2"],
        ["js-tokens", "4.0.0"],
        ["@babel/highlight", "7.0.0"],
      ]),
    }],
  ])],
  ["chalk", new Map([
    ["2.4.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424/node_modules/chalk/"),
      packageDependencies: new Map([
        ["ansi-styles", "3.2.1"],
        ["escape-string-regexp", "1.0.5"],
        ["supports-color", "5.5.0"],
        ["chalk", "2.4.2"],
      ]),
    }],
  ])],
  ["ansi-styles", new Map([
    ["3.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/"),
      packageDependencies: new Map([
        ["color-convert", "1.9.3"],
        ["ansi-styles", "3.2.1"],
      ]),
    }],
  ])],
  ["color-convert", new Map([
    ["1.9.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/"),
      packageDependencies: new Map([
        ["color-name", "1.1.3"],
        ["color-convert", "1.9.3"],
      ]),
    }],
  ])],
  ["color-name", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/"),
      packageDependencies: new Map([
        ["color-name", "1.1.3"],
      ]),
    }],
  ])],
  ["escape-string-regexp", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/"),
      packageDependencies: new Map([
        ["escape-string-regexp", "1.0.5"],
      ]),
    }],
  ])],
  ["supports-color", new Map([
    ["5.5.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
        ["supports-color", "5.5.0"],
      ]),
    }],
    ["6.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-supports-color-6.1.0-0764abc69c63d5ac842dd4867e8d025e880df8f3/node_modules/supports-color/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
        ["supports-color", "6.1.0"],
      ]),
    }],
  ])],
  ["has-flag", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
      ]),
    }],
  ])],
  ["esutils", new Map([
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-esutils-2.0.2-0abf4f1caa5bcb1f7a9d8acc6dea4faaa04bac9b/node_modules/esutils/"),
      packageDependencies: new Map([
        ["esutils", "2.0.2"],
      ]),
    }],
  ])],
  ["js-tokens", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/"),
      packageDependencies: new Map([
        ["js-tokens", "4.0.0"],
      ]),
    }],
  ])],
  ["ajv", new Map([
    ["6.9.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ajv-6.9.2-4927adb83e7f48e5a32b45729744c71ec39c9c7b/node_modules/ajv/"),
      packageDependencies: new Map([
        ["fast-deep-equal", "2.0.1"],
        ["fast-json-stable-stringify", "2.0.0"],
        ["json-schema-traverse", "0.4.1"],
        ["uri-js", "4.2.2"],
        ["ajv", "6.9.2"],
      ]),
    }],
  ])],
  ["fast-deep-equal", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/"),
      packageDependencies: new Map([
        ["fast-deep-equal", "2.0.1"],
      ]),
    }],
  ])],
  ["fast-json-stable-stringify", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/"),
      packageDependencies: new Map([
        ["fast-json-stable-stringify", "2.0.0"],
      ]),
    }],
  ])],
  ["json-schema-traverse", new Map([
    ["0.4.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/"),
      packageDependencies: new Map([
        ["json-schema-traverse", "0.4.1"],
      ]),
    }],
  ])],
  ["uri-js", new Map([
    ["4.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
        ["uri-js", "4.2.2"],
      ]),
    }],
  ])],
  ["punycode", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
      ]),
    }],
    ["1.4.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-punycode-1.4.1-c0d5a63b2718800ad8e1eb0fa5269c84dd41845e/node_modules/punycode/"),
      packageDependencies: new Map([
        ["punycode", "1.4.1"],
      ]),
    }],
  ])],
  ["cross-spawn", new Map([
    ["6.0.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/"),
      packageDependencies: new Map([
        ["nice-try", "1.0.5"],
        ["path-key", "2.0.1"],
        ["semver", "5.6.0"],
        ["shebang-command", "1.2.0"],
        ["which", "1.3.1"],
        ["cross-spawn", "6.0.5"],
      ]),
    }],
  ])],
  ["nice-try", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/"),
      packageDependencies: new Map([
        ["nice-try", "1.0.5"],
      ]),
    }],
  ])],
  ["semver", new Map([
    ["5.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-semver-5.6.0-7e74256fbaa49c75aa7c7a205cc22799cac80004/node_modules/semver/"),
      packageDependencies: new Map([
        ["semver", "5.6.0"],
      ]),
    }],
    ["5.7.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-semver-5.7.0-790a7cf6fea5459bac96110b29b60412dc8ff96b/node_modules/semver/"),
      packageDependencies: new Map([
        ["semver", "5.7.0"],
      ]),
    }],
  ])],
  ["shebang-command", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/"),
      packageDependencies: new Map([
        ["shebang-regex", "1.0.0"],
        ["shebang-command", "1.2.0"],
      ]),
    }],
  ])],
  ["shebang-regex", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/"),
      packageDependencies: new Map([
        ["shebang-regex", "1.0.0"],
      ]),
    }],
  ])],
  ["which", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/"),
      packageDependencies: new Map([
        ["isexe", "2.0.0"],
        ["which", "1.3.1"],
      ]),
    }],
  ])],
  ["isexe", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/"),
      packageDependencies: new Map([
        ["isexe", "2.0.0"],
      ]),
    }],
  ])],
  ["debug", new Map([
    ["4.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.1.1"],
        ["debug", "4.1.1"],
      ]),
    }],
    ["2.6.9", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.0.0"],
        ["debug", "2.6.9"],
      ]),
    }],
  ])],
  ["ms", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ms-2.1.1-30a5864eb3ebb0a66f2ebe6d727af06a09d86e0a/node_modules/ms/"),
      packageDependencies: new Map([
        ["ms", "2.1.1"],
      ]),
    }],
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/"),
      packageDependencies: new Map([
        ["ms", "2.0.0"],
      ]),
    }],
  ])],
  ["doctrine", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-doctrine-3.0.0-addebead72a6574db783639dc87a121773973961/node_modules/doctrine/"),
      packageDependencies: new Map([
        ["esutils", "2.0.2"],
        ["doctrine", "3.0.0"],
      ]),
    }],
  ])],
  ["eslint-scope", new Map([
    ["4.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-eslint-scope-4.0.3-ca03833310f6889a3264781aa82e63eb9cfe7848/node_modules/eslint-scope/"),
      packageDependencies: new Map([
        ["esrecurse", "4.2.1"],
        ["estraverse", "4.2.0"],
        ["eslint-scope", "4.0.3"],
      ]),
    }],
  ])],
  ["esrecurse", new Map([
    ["4.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf/node_modules/esrecurse/"),
      packageDependencies: new Map([
        ["estraverse", "4.2.0"],
        ["esrecurse", "4.2.1"],
      ]),
    }],
  ])],
  ["estraverse", new Map([
    ["4.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-estraverse-4.2.0-0dee3fed31fcd469618ce7342099fc1afa0bdb13/node_modules/estraverse/"),
      packageDependencies: new Map([
        ["estraverse", "4.2.0"],
      ]),
    }],
  ])],
  ["eslint-utils", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-eslint-utils-1.3.1-9a851ba89ee7c460346f97cf8939c7298827e512/node_modules/eslint-utils/"),
      packageDependencies: new Map([
        ["eslint-utils", "1.3.1"],
      ]),
    }],
  ])],
  ["eslint-visitor-keys", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-eslint-visitor-keys-1.0.0-3f3180fb2e291017716acb4c9d6d5b5c34a6a81d/node_modules/eslint-visitor-keys/"),
      packageDependencies: new Map([
        ["eslint-visitor-keys", "1.0.0"],
      ]),
    }],
  ])],
  ["espree", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-espree-5.0.1-5d6526fa4fc7f0788a5cf75b15f30323e2f81f7a/node_modules/espree/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
        ["acorn-jsx", "5.0.1"],
        ["eslint-visitor-keys", "1.0.0"],
        ["espree", "5.0.1"],
      ]),
    }],
  ])],
  ["acorn", new Map([
    ["6.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-acorn-6.1.1-7d25ae05bb8ad1f9b699108e1094ecd7884adc1f/node_modules/acorn/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
      ]),
    }],
    ["5.7.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-acorn-5.7.3-67aa231bf8812974b85235a96771eb6bd07ea279/node_modules/acorn/"),
      packageDependencies: new Map([
        ["acorn", "5.7.3"],
      ]),
    }],
  ])],
  ["acorn-jsx", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-acorn-jsx-5.0.1-32a064fd925429216a09b141102bfdd185fae40e/node_modules/acorn-jsx/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
        ["acorn-jsx", "5.0.1"],
      ]),
    }],
  ])],
  ["esquery", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-esquery-1.0.1-406c51658b1f5991a5f9b62b1dc25b00e3e5c708/node_modules/esquery/"),
      packageDependencies: new Map([
        ["estraverse", "4.2.0"],
        ["esquery", "1.0.1"],
      ]),
    }],
  ])],
  ["file-entry-cache", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-file-entry-cache-5.0.1-ca0f6efa6dd3d561333fb14515065c2fafdf439c/node_modules/file-entry-cache/"),
      packageDependencies: new Map([
        ["flat-cache", "2.0.1"],
        ["file-entry-cache", "5.0.1"],
      ]),
    }],
  ])],
  ["flat-cache", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-flat-cache-2.0.1-5d296d6f04bda44a4630a301413bdbc2ec085ec0/node_modules/flat-cache/"),
      packageDependencies: new Map([
        ["flatted", "2.0.0"],
        ["rimraf", "2.6.3"],
        ["write", "1.0.3"],
        ["flat-cache", "2.0.1"],
      ]),
    }],
  ])],
  ["flatted", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-flatted-2.0.0-55122b6536ea496b4b44893ee2608141d10d9916/node_modules/flatted/"),
      packageDependencies: new Map([
        ["flatted", "2.0.0"],
      ]),
    }],
  ])],
  ["rimraf", new Map([
    ["2.6.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-rimraf-2.6.3-b2d104fe0d8fb27cf9e0a1cda8262dd3833c6cab/node_modules/rimraf/"),
      packageDependencies: new Map([
        ["glob", "7.1.3"],
        ["rimraf", "2.6.3"],
      ]),
    }],
  ])],
  ["glob", new Map([
    ["7.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-glob-7.1.3-3960832d3f1574108342dafd3a67b332c0969df1/node_modules/glob/"),
      packageDependencies: new Map([
        ["fs.realpath", "1.0.0"],
        ["inflight", "1.0.6"],
        ["inherits", "2.0.3"],
        ["minimatch", "3.0.4"],
        ["once", "1.4.0"],
        ["path-is-absolute", "1.0.1"],
        ["glob", "7.1.3"],
      ]),
    }],
  ])],
  ["fs.realpath", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/"),
      packageDependencies: new Map([
        ["fs.realpath", "1.0.0"],
      ]),
    }],
  ])],
  ["inflight", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/"),
      packageDependencies: new Map([
        ["once", "1.4.0"],
        ["wrappy", "1.0.2"],
        ["inflight", "1.0.6"],
      ]),
    }],
  ])],
  ["once", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/"),
      packageDependencies: new Map([
        ["wrappy", "1.0.2"],
        ["once", "1.4.0"],
      ]),
    }],
  ])],
  ["wrappy", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/"),
      packageDependencies: new Map([
        ["wrappy", "1.0.2"],
      ]),
    }],
  ])],
  ["inherits", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/"),
      packageDependencies: new Map([
        ["inherits", "2.0.3"],
      ]),
    }],
  ])],
  ["minimatch", new Map([
    ["3.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/"),
      packageDependencies: new Map([
        ["brace-expansion", "1.1.11"],
        ["minimatch", "3.0.4"],
      ]),
    }],
  ])],
  ["brace-expansion", new Map([
    ["1.1.11", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/"),
      packageDependencies: new Map([
        ["balanced-match", "1.0.0"],
        ["concat-map", "0.0.1"],
        ["brace-expansion", "1.1.11"],
      ]),
    }],
  ])],
  ["balanced-match", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/"),
      packageDependencies: new Map([
        ["balanced-match", "1.0.0"],
      ]),
    }],
  ])],
  ["concat-map", new Map([
    ["0.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/"),
      packageDependencies: new Map([
        ["concat-map", "0.0.1"],
      ]),
    }],
  ])],
  ["path-is-absolute", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/"),
      packageDependencies: new Map([
        ["path-is-absolute", "1.0.1"],
      ]),
    }],
  ])],
  ["write", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-write-1.0.3-0800e14523b923a387e415123c865616aae0f5c3/node_modules/write/"),
      packageDependencies: new Map([
        ["mkdirp", "0.5.1"],
        ["write", "1.0.3"],
      ]),
    }],
  ])],
  ["mkdirp", new Map([
    ["0.5.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/"),
      packageDependencies: new Map([
        ["minimist", "0.0.8"],
        ["mkdirp", "0.5.1"],
      ]),
    }],
  ])],
  ["minimist", new Map([
    ["0.0.8", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "0.0.8"],
      ]),
    }],
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "1.2.0"],
      ]),
    }],
    ["0.0.10", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-minimist-0.0.10-de3f98543dbf96082be48ad1a0c7cda836301dcf/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "0.0.10"],
      ]),
    }],
  ])],
  ["functional-red-black-tree", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-functional-red-black-tree-1.0.1-1b0ab3bd553b2a0d6399d29c0e3ea0b252078327/node_modules/functional-red-black-tree/"),
      packageDependencies: new Map([
        ["functional-red-black-tree", "1.0.1"],
      ]),
    }],
  ])],
  ["globals", new Map([
    ["11.11.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-globals-11.11.0-dcf93757fa2de5486fbeed7118538adf789e9c2e/node_modules/globals/"),
      packageDependencies: new Map([
        ["globals", "11.11.0"],
      ]),
    }],
  ])],
  ["ignore", new Map([
    ["4.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ignore-4.0.6-750e3db5862087b4737ebac8207ffd1ef27b25fc/node_modules/ignore/"),
      packageDependencies: new Map([
        ["ignore", "4.0.6"],
      ]),
    }],
  ])],
  ["import-fresh", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-import-fresh-3.0.0-a3d897f420cab0e671236897f75bc14b4885c390/node_modules/import-fresh/"),
      packageDependencies: new Map([
        ["parent-module", "1.0.0"],
        ["resolve-from", "4.0.0"],
        ["import-fresh", "3.0.0"],
      ]),
    }],
  ])],
  ["parent-module", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-parent-module-1.0.0-df250bdc5391f4a085fb589dad761f5ad6b865b5/node_modules/parent-module/"),
      packageDependencies: new Map([
        ["callsites", "3.0.0"],
        ["parent-module", "1.0.0"],
      ]),
    }],
  ])],
  ["callsites", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-callsites-3.0.0-fb7eb569b72ad7a45812f93fd9430a3e410b3dd3/node_modules/callsites/"),
      packageDependencies: new Map([
        ["callsites", "3.0.0"],
      ]),
    }],
  ])],
  ["resolve-from", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-resolve-from-4.0.0-4abcd852ad32dd7baabfe9b40e00a36db5f392e6/node_modules/resolve-from/"),
      packageDependencies: new Map([
        ["resolve-from", "4.0.0"],
      ]),
    }],
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-resolve-from-3.0.0-b22c7af7d9d6881bc8b6e653335eebcb0a188748/node_modules/resolve-from/"),
      packageDependencies: new Map([
        ["resolve-from", "3.0.0"],
      ]),
    }],
  ])],
  ["imurmurhash", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/"),
      packageDependencies: new Map([
        ["imurmurhash", "0.1.4"],
      ]),
    }],
  ])],
  ["inquirer", new Map([
    ["6.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-inquirer-6.2.2-46941176f65c9eb20804627149b743a218f25406/node_modules/inquirer/"),
      packageDependencies: new Map([
        ["ansi-escapes", "3.2.0"],
        ["chalk", "2.4.2"],
        ["cli-cursor", "2.1.0"],
        ["cli-width", "2.2.0"],
        ["external-editor", "3.0.3"],
        ["figures", "2.0.0"],
        ["lodash", "4.17.11"],
        ["mute-stream", "0.0.7"],
        ["run-async", "2.3.0"],
        ["rxjs", "6.4.0"],
        ["string-width", "2.1.1"],
        ["strip-ansi", "5.0.0"],
        ["through", "2.3.8"],
        ["inquirer", "6.2.2"],
      ]),
    }],
  ])],
  ["ansi-escapes", new Map([
    ["3.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ansi-escapes-3.2.0-8780b98ff9dbf5638152d1f1fe5c1d7b4442976b/node_modules/ansi-escapes/"),
      packageDependencies: new Map([
        ["ansi-escapes", "3.2.0"],
      ]),
    }],
  ])],
  ["cli-cursor", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cli-cursor-2.1.0-b35dac376479facc3e94747d41d0d0f5238ffcb5/node_modules/cli-cursor/"),
      packageDependencies: new Map([
        ["restore-cursor", "2.0.0"],
        ["cli-cursor", "2.1.0"],
      ]),
    }],
  ])],
  ["restore-cursor", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-restore-cursor-2.0.0-9f7ee287f82fd326d4fd162923d62129eee0dfaf/node_modules/restore-cursor/"),
      packageDependencies: new Map([
        ["onetime", "2.0.1"],
        ["signal-exit", "3.0.2"],
        ["restore-cursor", "2.0.0"],
      ]),
    }],
  ])],
  ["onetime", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-onetime-2.0.1-067428230fd67443b2794b22bba528b6867962d4/node_modules/onetime/"),
      packageDependencies: new Map([
        ["mimic-fn", "1.2.0"],
        ["onetime", "2.0.1"],
      ]),
    }],
  ])],
  ["mimic-fn", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mimic-fn-1.2.0-820c86a39334640e99516928bd03fca88057d022/node_modules/mimic-fn/"),
      packageDependencies: new Map([
        ["mimic-fn", "1.2.0"],
      ]),
    }],
  ])],
  ["signal-exit", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/"),
      packageDependencies: new Map([
        ["signal-exit", "3.0.2"],
      ]),
    }],
  ])],
  ["cli-width", new Map([
    ["2.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cli-width-2.2.0-ff19ede8a9a5e579324147b0c11f0fbcbabed639/node_modules/cli-width/"),
      packageDependencies: new Map([
        ["cli-width", "2.2.0"],
      ]),
    }],
  ])],
  ["external-editor", new Map([
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-external-editor-3.0.3-5866db29a97826dbe4bf3afd24070ead9ea43a27/node_modules/external-editor/"),
      packageDependencies: new Map([
        ["chardet", "0.7.0"],
        ["iconv-lite", "0.4.24"],
        ["tmp", "0.0.33"],
        ["external-editor", "3.0.3"],
      ]),
    }],
  ])],
  ["chardet", new Map([
    ["0.7.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-chardet-0.7.0-90094849f0937f2eedc2425d0d28a9e5f0cbad9e/node_modules/chardet/"),
      packageDependencies: new Map([
        ["chardet", "0.7.0"],
      ]),
    }],
  ])],
  ["iconv-lite", new Map([
    ["0.4.24", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
        ["iconv-lite", "0.4.24"],
      ]),
    }],
  ])],
  ["safer-buffer", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
      ]),
    }],
  ])],
  ["tmp", new Map([
    ["0.0.33", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tmp-0.0.33-6d34335889768d21b2bcda0aa277ced3b1bfadf9/node_modules/tmp/"),
      packageDependencies: new Map([
        ["os-tmpdir", "1.0.2"],
        ["tmp", "0.0.33"],
      ]),
    }],
  ])],
  ["os-tmpdir", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/"),
      packageDependencies: new Map([
        ["os-tmpdir", "1.0.2"],
      ]),
    }],
  ])],
  ["figures", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-figures-2.0.0-3ab1a2d2a62c8bfb431a0c94cb797a2fce27c962/node_modules/figures/"),
      packageDependencies: new Map([
        ["escape-string-regexp", "1.0.5"],
        ["figures", "2.0.0"],
      ]),
    }],
  ])],
  ["lodash", new Map([
    ["4.17.11", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/"),
      packageDependencies: new Map([
        ["lodash", "4.17.11"],
      ]),
    }],
  ])],
  ["mute-stream", new Map([
    ["0.0.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mute-stream-0.0.7-3075ce93bc21b8fab43e1bc4da7e8115ed1e7bab/node_modules/mute-stream/"),
      packageDependencies: new Map([
        ["mute-stream", "0.0.7"],
      ]),
    }],
  ])],
  ["run-async", new Map([
    ["2.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-run-async-2.3.0-0371ab4ae0bdd720d4166d7dfda64ff7a445a6c0/node_modules/run-async/"),
      packageDependencies: new Map([
        ["is-promise", "2.1.0"],
        ["run-async", "2.3.0"],
      ]),
    }],
  ])],
  ["is-promise", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-promise-2.1.0-79a2a9ece7f096e80f36d2b2f3bc16c1ff4bf3fa/node_modules/is-promise/"),
      packageDependencies: new Map([
        ["is-promise", "2.1.0"],
      ]),
    }],
  ])],
  ["rxjs", new Map([
    ["6.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-rxjs-6.4.0-f3bb0fe7bda7fb69deac0c16f17b50b0b8790504/node_modules/rxjs/"),
      packageDependencies: new Map([
        ["tslib", "1.9.3"],
        ["rxjs", "6.4.0"],
      ]),
    }],
  ])],
  ["tslib", new Map([
    ["1.9.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tslib-1.9.3-d7e4dd79245d85428c4d7e4822a79917954ca286/node_modules/tslib/"),
      packageDependencies: new Map([
        ["tslib", "1.9.3"],
      ]),
    }],
  ])],
  ["string-width", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/"),
      packageDependencies: new Map([
        ["is-fullwidth-code-point", "2.0.0"],
        ["strip-ansi", "4.0.0"],
        ["string-width", "2.1.1"],
      ]),
    }],
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-string-width-3.0.0-5a1690a57cc78211fffd9bf24bbe24d090604eb1/node_modules/string-width/"),
      packageDependencies: new Map([
        ["emoji-regex", "7.0.3"],
        ["is-fullwidth-code-point", "2.0.0"],
        ["strip-ansi", "5.0.0"],
        ["string-width", "3.0.0"],
      ]),
    }],
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/"),
      packageDependencies: new Map([
        ["code-point-at", "1.1.0"],
        ["is-fullwidth-code-point", "1.0.0"],
        ["strip-ansi", "3.0.1"],
        ["string-width", "1.0.2"],
      ]),
    }],
  ])],
  ["is-fullwidth-code-point", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/"),
      packageDependencies: new Map([
        ["is-fullwidth-code-point", "2.0.0"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/"),
      packageDependencies: new Map([
        ["number-is-nan", "1.0.1"],
        ["is-fullwidth-code-point", "1.0.0"],
      ]),
    }],
  ])],
  ["strip-ansi", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "3.0.0"],
        ["strip-ansi", "4.0.0"],
      ]),
    }],
    ["5.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-strip-ansi-5.0.0-f78f68b5d0866c20b2c9b8c61b5298508dc8756f/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "4.0.0"],
        ["strip-ansi", "5.0.0"],
      ]),
    }],
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "2.1.1"],
        ["strip-ansi", "3.0.1"],
      ]),
    }],
  ])],
  ["ansi-regex", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "3.0.0"],
      ]),
    }],
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ansi-regex-4.0.0-70de791edf021404c3fd615aa89118ae0432e5a9/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "4.0.0"],
      ]),
    }],
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "2.1.1"],
      ]),
    }],
  ])],
  ["through", new Map([
    ["2.3.8", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-through-2.3.8-0dd4c9ffaabc357960b1b724115d7e0e86a2e1f5/node_modules/through/"),
      packageDependencies: new Map([
        ["through", "2.3.8"],
      ]),
    }],
  ])],
  ["js-yaml", new Map([
    ["3.13.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-js-yaml-3.13.0-38ee7178ac0eea2c97ff6d96fff4b18c7d8cf98e/node_modules/js-yaml/"),
      packageDependencies: new Map([
        ["argparse", "1.0.10"],
        ["esprima", "4.0.1"],
        ["js-yaml", "3.13.0"],
      ]),
    }],
  ])],
  ["argparse", new Map([
    ["1.0.10", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911/node_modules/argparse/"),
      packageDependencies: new Map([
        ["sprintf-js", "1.0.3"],
        ["argparse", "1.0.10"],
      ]),
    }],
  ])],
  ["sprintf-js", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c/node_modules/sprintf-js/"),
      packageDependencies: new Map([
        ["sprintf-js", "1.0.3"],
      ]),
    }],
  ])],
  ["esprima", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71/node_modules/esprima/"),
      packageDependencies: new Map([
        ["esprima", "4.0.1"],
      ]),
    }],
    ["3.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-esprima-3.1.3-fdca51cee6133895e3c88d535ce49dbff62a4633/node_modules/esprima/"),
      packageDependencies: new Map([
        ["esprima", "3.1.3"],
      ]),
    }],
  ])],
  ["json-stable-stringify-without-jsonify", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-json-stable-stringify-without-jsonify-1.0.1-9db7b59496ad3f3cfef30a75142d2d930ad72651/node_modules/json-stable-stringify-without-jsonify/"),
      packageDependencies: new Map([
        ["json-stable-stringify-without-jsonify", "1.0.1"],
      ]),
    }],
  ])],
  ["levn", new Map([
    ["0.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee/node_modules/levn/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
        ["levn", "0.3.0"],
      ]),
    }],
  ])],
  ["prelude-ls", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54/node_modules/prelude-ls/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
      ]),
    }],
  ])],
  ["type-check", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72/node_modules/type-check/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
      ]),
    }],
  ])],
  ["natural-compare", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7/node_modules/natural-compare/"),
      packageDependencies: new Map([
        ["natural-compare", "1.4.0"],
      ]),
    }],
  ])],
  ["optionator", new Map([
    ["0.8.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-optionator-0.8.2-364c5e409d3f4d6301d6c0b4c05bba50180aeb64/node_modules/optionator/"),
      packageDependencies: new Map([
        ["deep-is", "0.1.3"],
        ["fast-levenshtein", "2.0.6"],
        ["levn", "0.3.0"],
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
        ["wordwrap", "1.0.0"],
        ["optionator", "0.8.2"],
      ]),
    }],
  ])],
  ["deep-is", new Map([
    ["0.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/"),
      packageDependencies: new Map([
        ["deep-is", "0.1.3"],
      ]),
    }],
  ])],
  ["fast-levenshtein", new Map([
    ["2.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917/node_modules/fast-levenshtein/"),
      packageDependencies: new Map([
        ["fast-levenshtein", "2.0.6"],
      ]),
    }],
  ])],
  ["wordwrap", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-wordwrap-1.0.0-27584810891456a4171c8d0226441ade90cbcaeb/node_modules/wordwrap/"),
      packageDependencies: new Map([
        ["wordwrap", "1.0.0"],
      ]),
    }],
    ["0.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-wordwrap-0.0.3-a3d5da6cd5c0bc0008d37234bbaf1bed63059107/node_modules/wordwrap/"),
      packageDependencies: new Map([
        ["wordwrap", "0.0.3"],
      ]),
    }],
  ])],
  ["path-is-inside", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-is-inside-1.0.2-365417dede44430d1c11af61027facf074bdfc53/node_modules/path-is-inside/"),
      packageDependencies: new Map([
        ["path-is-inside", "1.0.2"],
      ]),
    }],
  ])],
  ["progress", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-progress-2.0.3-7e8cf8d8f5b8f239c1bc68beb4eb78567d572ef8/node_modules/progress/"),
      packageDependencies: new Map([
        ["progress", "2.0.3"],
      ]),
    }],
  ])],
  ["regexpp", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-regexpp-2.0.1-8d19d31cf632482b589049f8281f93dbcba4d07f/node_modules/regexpp/"),
      packageDependencies: new Map([
        ["regexpp", "2.0.1"],
      ]),
    }],
  ])],
  ["strip-json-comments", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-strip-json-comments-2.0.1-3c531942e908c2697c0ec344858c286c7ca0a60a/node_modules/strip-json-comments/"),
      packageDependencies: new Map([
        ["strip-json-comments", "2.0.1"],
      ]),
    }],
  ])],
  ["table", new Map([
    ["5.2.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-table-5.2.3-cde0cc6eb06751c009efab27e8c820ca5b67b7f2/node_modules/table/"),
      packageDependencies: new Map([
        ["ajv", "6.9.2"],
        ["lodash", "4.17.11"],
        ["slice-ansi", "2.1.0"],
        ["string-width", "3.0.0"],
        ["table", "5.2.3"],
      ]),
    }],
  ])],
  ["slice-ansi", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-slice-ansi-2.1.0-cacd7693461a637a5788d92a7dd4fba068e81636/node_modules/slice-ansi/"),
      packageDependencies: new Map([
        ["ansi-styles", "3.2.1"],
        ["astral-regex", "1.0.0"],
        ["is-fullwidth-code-point", "2.0.0"],
        ["slice-ansi", "2.1.0"],
      ]),
    }],
  ])],
  ["astral-regex", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9/node_modules/astral-regex/"),
      packageDependencies: new Map([
        ["astral-regex", "1.0.0"],
      ]),
    }],
  ])],
  ["emoji-regex", new Map([
    ["7.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156/node_modules/emoji-regex/"),
      packageDependencies: new Map([
        ["emoji-regex", "7.0.3"],
      ]),
    }],
  ])],
  ["text-table", new Map([
    ["0.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-text-table-0.2.0-7f5ee823ae805207c00af2df4a84ec3fcfa570b4/node_modules/text-table/"),
      packageDependencies: new Map([
        ["text-table", "0.2.0"],
      ]),
    }],
  ])],
  ["eslint-plugin-jest", new Map([
    ["22.5.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-eslint-plugin-jest-22.5.1-a31dfe9f9513c6af7c17ece4c65535a1370f060b/node_modules/eslint-plugin-jest/"),
      packageDependencies: new Map([
        ["eslint", "5.16.0"],
        ["eslint-plugin-jest", "22.5.1"],
      ]),
    }],
  ])],
  ["jest", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-24.8.0-d5dff1984d0d1002196e9b7f12f75af1b2809081/node_modules/jest/"),
      packageDependencies: new Map([
        ["import-local", "2.0.0"],
        ["jest-cli", "24.8.0"],
        ["jest", "24.8.0"],
      ]),
    }],
  ])],
  ["import-local", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-import-local-2.0.0-55070be38a5993cf18ef6db7e961f5bee5c5a09d/node_modules/import-local/"),
      packageDependencies: new Map([
        ["pkg-dir", "3.0.0"],
        ["resolve-cwd", "2.0.0"],
        ["import-local", "2.0.0"],
      ]),
    }],
  ])],
  ["pkg-dir", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pkg-dir-3.0.0-2749020f239ed990881b1f71210d51eb6523bea3/node_modules/pkg-dir/"),
      packageDependencies: new Map([
        ["find-up", "3.0.0"],
        ["pkg-dir", "3.0.0"],
      ]),
    }],
  ])],
  ["find-up", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-find-up-3.0.0-49169f1d7993430646da61ecc5ae355c21c97b73/node_modules/find-up/"),
      packageDependencies: new Map([
        ["locate-path", "3.0.0"],
        ["find-up", "3.0.0"],
      ]),
    }],
  ])],
  ["locate-path", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-locate-path-3.0.0-dbec3b3ab759758071b58fe59fc41871af21400e/node_modules/locate-path/"),
      packageDependencies: new Map([
        ["p-locate", "3.0.0"],
        ["path-exists", "3.0.0"],
        ["locate-path", "3.0.0"],
      ]),
    }],
  ])],
  ["p-locate", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-locate-3.0.0-322d69a05c0264b25997d9f40cd8a891ab0064a4/node_modules/p-locate/"),
      packageDependencies: new Map([
        ["p-limit", "2.1.0"],
        ["p-locate", "3.0.0"],
      ]),
    }],
  ])],
  ["p-limit", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-limit-2.1.0-1d5a0d20fb12707c758a655f6bbc4386b5930d68/node_modules/p-limit/"),
      packageDependencies: new Map([
        ["p-try", "2.0.0"],
        ["p-limit", "2.1.0"],
      ]),
    }],
  ])],
  ["p-try", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-try-2.0.0-85080bb87c64688fa47996fe8f7dfbe8211760b1/node_modules/p-try/"),
      packageDependencies: new Map([
        ["p-try", "2.0.0"],
      ]),
    }],
  ])],
  ["path-exists", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/"),
      packageDependencies: new Map([
        ["path-exists", "3.0.0"],
      ]),
    }],
  ])],
  ["resolve-cwd", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-resolve-cwd-2.0.0-00a9f7387556e27038eae232caa372a6a59b665a/node_modules/resolve-cwd/"),
      packageDependencies: new Map([
        ["resolve-from", "3.0.0"],
        ["resolve-cwd", "2.0.0"],
      ]),
    }],
  ])],
  ["jest-cli", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-cli-24.8.0-b075ac914492ed114fa338ade7362a301693e989/node_modules/jest-cli/"),
      packageDependencies: new Map([
        ["@jest/core", "24.8.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["chalk", "2.4.2"],
        ["exit", "0.1.2"],
        ["import-local", "2.0.0"],
        ["is-ci", "2.0.0"],
        ["jest-config", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-validate", "24.8.0"],
        ["prompts", "2.0.3"],
        ["realpath-native", "1.1.0"],
        ["yargs", "12.0.5"],
        ["jest-cli", "24.8.0"],
      ]),
    }],
  ])],
  ["@jest/core", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-core-24.8.0-fbbdcd42a41d0d39cddbc9f520c8bab0c33eed5b/node_modules/@jest/core/"),
      packageDependencies: new Map([
        ["@jest/console", "24.7.1"],
        ["@jest/reporters", "24.8.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/transform", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["ansi-escapes", "3.2.0"],
        ["chalk", "2.4.2"],
        ["exit", "0.1.2"],
        ["graceful-fs", "4.1.15"],
        ["jest-changed-files", "24.8.0"],
        ["jest-config", "24.8.0"],
        ["jest-haste-map", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-regex-util", "24.3.0"],
        ["jest-resolve-dependencies", "24.8.0"],
        ["jest-runner", "24.8.0"],
        ["jest-runtime", "24.8.0"],
        ["jest-snapshot", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-validate", "24.8.0"],
        ["jest-watcher", "24.8.0"],
        ["micromatch", "3.1.10"],
        ["p-each-series", "1.0.0"],
        ["pirates", "4.0.1"],
        ["realpath-native", "1.1.0"],
        ["rimraf", "2.6.3"],
        ["strip-ansi", "5.0.0"],
        ["@jest/core", "24.8.0"],
      ]),
    }],
  ])],
  ["@jest/console", new Map([
    ["24.7.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-console-24.7.1-32a9e42535a97aedfe037e725bd67e954b459545/node_modules/@jest/console/"),
      packageDependencies: new Map([
        ["@jest/source-map", "24.3.0"],
        ["chalk", "2.4.2"],
        ["slash", "2.0.0"],
        ["@jest/console", "24.7.1"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-console-24.6.0-63225e6889f3865ab5b7a0d8797e8aed417c4e0b/node_modules/@jest/console/"),
      packageDependencies: new Map([
        ["@jest/source-map", "24.3.0"],
        ["chalk", "2.4.2"],
        ["slash", "2.0.0"],
        ["@jest/console", "24.6.0"],
      ]),
    }],
  ])],
  ["@jest/source-map", new Map([
    ["24.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-source-map-24.3.0-563be3aa4d224caf65ff77edc95cd1ca4da67f28/node_modules/@jest/source-map/"),
      packageDependencies: new Map([
        ["callsites", "3.0.0"],
        ["graceful-fs", "4.1.15"],
        ["source-map", "0.6.1"],
        ["@jest/source-map", "24.3.0"],
      ]),
    }],
  ])],
  ["graceful-fs", new Map([
    ["4.1.15", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-graceful-fs-4.1.15-ffb703e1066e8a0eeaa4c8b80ba9253eeefbfb00/node_modules/graceful-fs/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
      ]),
    }],
  ])],
  ["source-map", new Map([
    ["0.6.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-source-map-0.6.1-74722af32e9614e9c287a8d0bbde48b5e2f1a263/node_modules/source-map/"),
      packageDependencies: new Map([
        ["source-map", "0.6.1"],
      ]),
    }],
    ["0.5.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/"),
      packageDependencies: new Map([
        ["source-map", "0.5.7"],
      ]),
    }],
  ])],
  ["slash", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-slash-2.0.0-de552851a1759df3a8f206535442f5ec4ddeab44/node_modules/slash/"),
      packageDependencies: new Map([
        ["slash", "2.0.0"],
      ]),
    }],
  ])],
  ["@jest/reporters", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-reporters-24.8.0-075169cd029bddec54b8f2c0fc489fd0b9e05729/node_modules/@jest/reporters/"),
      packageDependencies: new Map([
        ["@jest/environment", "24.8.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/transform", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["chalk", "2.4.2"],
        ["exit", "0.1.2"],
        ["glob", "7.1.3"],
        ["istanbul-lib-coverage", "2.0.3"],
        ["istanbul-lib-instrument", "3.1.0"],
        ["istanbul-lib-report", "2.0.4"],
        ["istanbul-lib-source-maps", "3.0.2"],
        ["istanbul-reports", "2.1.1"],
        ["jest-haste-map", "24.8.0"],
        ["jest-resolve", "24.8.0"],
        ["jest-runtime", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-worker", "24.6.0"],
        ["node-notifier", "5.4.0"],
        ["slash", "2.0.0"],
        ["source-map", "0.6.1"],
        ["string-length", "2.0.0"],
        ["@jest/reporters", "24.8.0"],
      ]),
    }],
  ])],
  ["@jest/environment", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-environment-24.8.0-0342261383c776bdd652168f68065ef144af0eac/node_modules/@jest/environment/"),
      packageDependencies: new Map([
        ["@jest/fake-timers", "24.8.0"],
        ["@jest/transform", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["jest-mock", "24.8.0"],
        ["@jest/environment", "24.8.0"],
      ]),
    }],
  ])],
  ["@jest/fake-timers", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-fake-timers-24.8.0-2e5b80a4f78f284bcb4bd5714b8e10dd36a8d3d1/node_modules/@jest/fake-timers/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-mock", "24.8.0"],
        ["@jest/fake-timers", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-fake-timers-24.6.0-4eb0b47539883742e9f969e983770230f5a57d7b/node_modules/@jest/fake-timers/"),
      packageDependencies: new Map([
        ["@jest/types", "24.6.0"],
        ["jest-message-util", "24.6.0"],
        ["jest-mock", "24.6.0"],
        ["@jest/fake-timers", "24.6.0"],
      ]),
    }],
  ])],
  ["@jest/types", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-types-24.8.0-f31e25948c58f0abd8c845ae26fcea1491dea7ad/node_modules/@jest/types/"),
      packageDependencies: new Map([
        ["@types/istanbul-lib-coverage", "2.0.0"],
        ["@types/istanbul-reports", "1.1.1"],
        ["@types/yargs", "12.0.9"],
        ["@jest/types", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-types-24.6.0-cf018e56f3ef45e81119fd613fc20a9819f4eddd/node_modules/@jest/types/"),
      packageDependencies: new Map([
        ["@types/istanbul-lib-coverage", "2.0.0"],
        ["@types/yargs", "12.0.9"],
        ["@jest/types", "24.6.0"],
      ]),
    }],
  ])],
  ["@types/istanbul-lib-coverage", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-istanbul-lib-coverage-2.0.0-1eb8c033e98cf4e1a4cedcaf8bcafe8cb7591e85/node_modules/@types/istanbul-lib-coverage/"),
      packageDependencies: new Map([
        ["@types/istanbul-lib-coverage", "2.0.0"],
      ]),
    }],
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-istanbul-lib-coverage-2.0.1-42995b446db9a48a11a07ec083499a860e9138ff/node_modules/@types/istanbul-lib-coverage/"),
      packageDependencies: new Map([
        ["@types/istanbul-lib-coverage", "2.0.1"],
      ]),
    }],
  ])],
  ["@types/istanbul-reports", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-istanbul-reports-1.1.1-7a8cbf6a406f36c8add871625b278eaf0b0d255a/node_modules/@types/istanbul-reports/"),
      packageDependencies: new Map([
        ["@types/istanbul-lib-coverage", "2.0.1"],
        ["@types/istanbul-lib-report", "1.1.1"],
        ["@types/istanbul-reports", "1.1.1"],
      ]),
    }],
  ])],
  ["@types/istanbul-lib-report", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-istanbul-lib-report-1.1.1-e5471e7fa33c61358dd38426189c037a58433b8c/node_modules/@types/istanbul-lib-report/"),
      packageDependencies: new Map([
        ["@types/istanbul-lib-coverage", "2.0.1"],
        ["@types/istanbul-lib-report", "1.1.1"],
      ]),
    }],
  ])],
  ["@types/yargs", new Map([
    ["12.0.9", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-yargs-12.0.9-693e76a52f61a2f1e7fb48c0eef167b95ea4ffd0/node_modules/@types/yargs/"),
      packageDependencies: new Map([
        ["@types/yargs", "12.0.9"],
      ]),
    }],
  ])],
  ["jest-message-util", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-message-util-24.8.0-0d6891e72a4beacc0292b638685df42e28d6218b/node_modules/jest-message-util/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["@types/stack-utils", "1.0.1"],
        ["chalk", "2.4.2"],
        ["micromatch", "3.1.10"],
        ["slash", "2.0.0"],
        ["stack-utils", "1.0.2"],
        ["jest-message-util", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-message-util-24.6.0-585b8dd65c34a9d0e6f68b3feeb46918ee40b976/node_modules/jest-message-util/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["@jest/test-result", "24.6.0"],
        ["@jest/types", "24.6.0"],
        ["@types/stack-utils", "1.0.1"],
        ["chalk", "2.4.2"],
        ["micromatch", "3.1.10"],
        ["slash", "2.0.0"],
        ["stack-utils", "1.0.2"],
        ["jest-message-util", "24.6.0"],
      ]),
    }],
  ])],
  ["@jest/test-result", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-test-result-24.8.0-7675d0aaf9d2484caa65e048d9b467d160f8e9d3/node_modules/@jest/test-result/"),
      packageDependencies: new Map([
        ["@jest/console", "24.7.1"],
        ["@jest/types", "24.8.0"],
        ["@types/istanbul-lib-coverage", "2.0.0"],
        ["@jest/test-result", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-test-result-24.6.0-fd56c12b031601c282eede8a5ec1317ebe63bd11/node_modules/@jest/test-result/"),
      packageDependencies: new Map([
        ["@jest/console", "24.6.0"],
        ["@jest/types", "24.6.0"],
        ["@types/istanbul-lib-coverage", "2.0.0"],
        ["@jest/test-result", "24.6.0"],
      ]),
    }],
  ])],
  ["@types/stack-utils", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-stack-utils-1.0.1-0a851d3bd96498fa25c33ab7278ed3bd65f06c3e/node_modules/@types/stack-utils/"),
      packageDependencies: new Map([
        ["@types/stack-utils", "1.0.1"],
      ]),
    }],
  ])],
  ["micromatch", new Map([
    ["3.1.10", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/"),
      packageDependencies: new Map([
        ["arr-diff", "4.0.0"],
        ["array-unique", "0.3.2"],
        ["braces", "2.3.2"],
        ["define-property", "2.0.2"],
        ["extend-shallow", "3.0.2"],
        ["extglob", "2.0.4"],
        ["fragment-cache", "0.2.1"],
        ["kind-of", "6.0.2"],
        ["nanomatch", "1.2.13"],
        ["object.pick", "1.3.0"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["micromatch", "3.1.10"],
      ]),
    }],
  ])],
  ["arr-diff", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/"),
      packageDependencies: new Map([
        ["arr-diff", "4.0.0"],
      ]),
    }],
  ])],
  ["array-unique", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/"),
      packageDependencies: new Map([
        ["array-unique", "0.3.2"],
      ]),
    }],
  ])],
  ["braces", new Map([
    ["2.3.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/"),
      packageDependencies: new Map([
        ["arr-flatten", "1.1.0"],
        ["array-unique", "0.3.2"],
        ["extend-shallow", "2.0.1"],
        ["fill-range", "4.0.0"],
        ["isobject", "3.0.1"],
        ["repeat-element", "1.1.3"],
        ["snapdragon", "0.8.2"],
        ["snapdragon-node", "2.1.1"],
        ["split-string", "3.1.0"],
        ["to-regex", "3.0.2"],
        ["braces", "2.3.2"],
      ]),
    }],
  ])],
  ["arr-flatten", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/"),
      packageDependencies: new Map([
        ["arr-flatten", "1.1.0"],
      ]),
    }],
  ])],
  ["extend-shallow", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/"),
      packageDependencies: new Map([
        ["is-extendable", "0.1.1"],
        ["extend-shallow", "2.0.1"],
      ]),
    }],
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/"),
      packageDependencies: new Map([
        ["assign-symbols", "1.0.0"],
        ["is-extendable", "1.0.1"],
        ["extend-shallow", "3.0.2"],
      ]),
    }],
  ])],
  ["is-extendable", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/"),
      packageDependencies: new Map([
        ["is-extendable", "0.1.1"],
      ]),
    }],
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/"),
      packageDependencies: new Map([
        ["is-plain-object", "2.0.4"],
        ["is-extendable", "1.0.1"],
      ]),
    }],
  ])],
  ["fill-range", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/"),
      packageDependencies: new Map([
        ["extend-shallow", "2.0.1"],
        ["is-number", "3.0.0"],
        ["repeat-string", "1.6.1"],
        ["to-regex-range", "2.1.1"],
        ["fill-range", "4.0.0"],
      ]),
    }],
  ])],
  ["is-number", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["is-number", "3.0.0"],
      ]),
    }],
  ])],
  ["kind-of", new Map([
    ["3.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["is-buffer", "1.1.6"],
        ["kind-of", "3.2.2"],
      ]),
    }],
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["is-buffer", "1.1.6"],
        ["kind-of", "4.0.0"],
      ]),
    }],
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["kind-of", "5.1.0"],
      ]),
    }],
    ["6.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["kind-of", "6.0.2"],
      ]),
    }],
  ])],
  ["is-buffer", new Map([
    ["1.1.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/"),
      packageDependencies: new Map([
        ["is-buffer", "1.1.6"],
      ]),
    }],
  ])],
  ["repeat-string", new Map([
    ["1.6.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/"),
      packageDependencies: new Map([
        ["repeat-string", "1.6.1"],
      ]),
    }],
  ])],
  ["to-regex-range", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/"),
      packageDependencies: new Map([
        ["is-number", "3.0.0"],
        ["repeat-string", "1.6.1"],
        ["to-regex-range", "2.1.1"],
      ]),
    }],
  ])],
  ["isobject", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
      ]),
    }],
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/"),
      packageDependencies: new Map([
        ["isarray", "1.0.0"],
        ["isobject", "2.1.0"],
      ]),
    }],
  ])],
  ["repeat-element", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/"),
      packageDependencies: new Map([
        ["repeat-element", "1.1.3"],
      ]),
    }],
  ])],
  ["snapdragon", new Map([
    ["0.8.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/"),
      packageDependencies: new Map([
        ["base", "0.11.2"],
        ["debug", "2.6.9"],
        ["define-property", "0.2.5"],
        ["extend-shallow", "2.0.1"],
        ["map-cache", "0.2.2"],
        ["source-map", "0.5.7"],
        ["source-map-resolve", "0.5.2"],
        ["use", "3.1.1"],
        ["snapdragon", "0.8.2"],
      ]),
    }],
  ])],
  ["base", new Map([
    ["0.11.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/"),
      packageDependencies: new Map([
        ["cache-base", "1.0.1"],
        ["class-utils", "0.3.6"],
        ["component-emitter", "1.2.1"],
        ["define-property", "1.0.0"],
        ["isobject", "3.0.1"],
        ["mixin-deep", "1.3.1"],
        ["pascalcase", "0.1.1"],
        ["base", "0.11.2"],
      ]),
    }],
  ])],
  ["cache-base", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/"),
      packageDependencies: new Map([
        ["collection-visit", "1.0.0"],
        ["component-emitter", "1.2.1"],
        ["get-value", "2.0.6"],
        ["has-value", "1.0.0"],
        ["isobject", "3.0.1"],
        ["set-value", "2.0.0"],
        ["to-object-path", "0.3.0"],
        ["union-value", "1.0.0"],
        ["unset-value", "1.0.0"],
        ["cache-base", "1.0.1"],
      ]),
    }],
  ])],
  ["collection-visit", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/"),
      packageDependencies: new Map([
        ["map-visit", "1.0.0"],
        ["object-visit", "1.0.1"],
        ["collection-visit", "1.0.0"],
      ]),
    }],
  ])],
  ["map-visit", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/"),
      packageDependencies: new Map([
        ["object-visit", "1.0.1"],
        ["map-visit", "1.0.0"],
      ]),
    }],
  ])],
  ["object-visit", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
        ["object-visit", "1.0.1"],
      ]),
    }],
  ])],
  ["component-emitter", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-component-emitter-1.2.1-137918d6d78283f7df7a6b7c5a63e140e69425e6/node_modules/component-emitter/"),
      packageDependencies: new Map([
        ["component-emitter", "1.2.1"],
      ]),
    }],
  ])],
  ["get-value", new Map([
    ["2.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/"),
      packageDependencies: new Map([
        ["get-value", "2.0.6"],
      ]),
    }],
  ])],
  ["has-value", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/"),
      packageDependencies: new Map([
        ["get-value", "2.0.6"],
        ["has-values", "1.0.0"],
        ["isobject", "3.0.1"],
        ["has-value", "1.0.0"],
      ]),
    }],
    ["0.3.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/"),
      packageDependencies: new Map([
        ["get-value", "2.0.6"],
        ["has-values", "0.1.4"],
        ["isobject", "2.1.0"],
        ["has-value", "0.3.1"],
      ]),
    }],
  ])],
  ["has-values", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/"),
      packageDependencies: new Map([
        ["is-number", "3.0.0"],
        ["kind-of", "4.0.0"],
        ["has-values", "1.0.0"],
      ]),
    }],
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/"),
      packageDependencies: new Map([
        ["has-values", "0.1.4"],
      ]),
    }],
  ])],
  ["set-value", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-set-value-2.0.0-71ae4a88f0feefbbf52d1ea604f3fb315ebb6274/node_modules/set-value/"),
      packageDependencies: new Map([
        ["extend-shallow", "2.0.1"],
        ["is-extendable", "0.1.1"],
        ["is-plain-object", "2.0.4"],
        ["split-string", "3.1.0"],
        ["set-value", "2.0.0"],
      ]),
    }],
    ["0.4.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-set-value-0.4.3-7db08f9d3d22dc7f78e53af3c3bf4666ecdfccf1/node_modules/set-value/"),
      packageDependencies: new Map([
        ["extend-shallow", "2.0.1"],
        ["is-extendable", "0.1.1"],
        ["is-plain-object", "2.0.4"],
        ["to-object-path", "0.3.0"],
        ["set-value", "0.4.3"],
      ]),
    }],
  ])],
  ["is-plain-object", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
        ["is-plain-object", "2.0.4"],
      ]),
    }],
  ])],
  ["split-string", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/"),
      packageDependencies: new Map([
        ["extend-shallow", "3.0.2"],
        ["split-string", "3.1.0"],
      ]),
    }],
  ])],
  ["assign-symbols", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/"),
      packageDependencies: new Map([
        ["assign-symbols", "1.0.0"],
      ]),
    }],
  ])],
  ["to-object-path", new Map([
    ["0.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["to-object-path", "0.3.0"],
      ]),
    }],
  ])],
  ["union-value", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-union-value-1.0.0-5c71c34cb5bad5dcebe3ea0cd08207ba5aa1aea4/node_modules/union-value/"),
      packageDependencies: new Map([
        ["arr-union", "3.1.0"],
        ["get-value", "2.0.6"],
        ["is-extendable", "0.1.1"],
        ["set-value", "0.4.3"],
        ["union-value", "1.0.0"],
      ]),
    }],
  ])],
  ["arr-union", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/"),
      packageDependencies: new Map([
        ["arr-union", "3.1.0"],
      ]),
    }],
  ])],
  ["unset-value", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/"),
      packageDependencies: new Map([
        ["has-value", "0.3.1"],
        ["isobject", "3.0.1"],
        ["unset-value", "1.0.0"],
      ]),
    }],
  ])],
  ["isarray", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/"),
      packageDependencies: new Map([
        ["isarray", "1.0.0"],
      ]),
    }],
  ])],
  ["class-utils", new Map([
    ["0.3.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/"),
      packageDependencies: new Map([
        ["arr-union", "3.1.0"],
        ["define-property", "0.2.5"],
        ["isobject", "3.0.1"],
        ["static-extend", "0.1.2"],
        ["class-utils", "0.3.6"],
      ]),
    }],
  ])],
  ["define-property", new Map([
    ["0.2.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/"),
      packageDependencies: new Map([
        ["is-descriptor", "0.1.6"],
        ["define-property", "0.2.5"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/"),
      packageDependencies: new Map([
        ["is-descriptor", "1.0.2"],
        ["define-property", "1.0.0"],
      ]),
    }],
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/"),
      packageDependencies: new Map([
        ["is-descriptor", "1.0.2"],
        ["isobject", "3.0.1"],
        ["define-property", "2.0.2"],
      ]),
    }],
  ])],
  ["is-descriptor", new Map([
    ["0.1.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/"),
      packageDependencies: new Map([
        ["is-accessor-descriptor", "0.1.6"],
        ["is-data-descriptor", "0.1.4"],
        ["kind-of", "5.1.0"],
        ["is-descriptor", "0.1.6"],
      ]),
    }],
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/"),
      packageDependencies: new Map([
        ["is-accessor-descriptor", "1.0.0"],
        ["is-data-descriptor", "1.0.0"],
        ["kind-of", "6.0.2"],
        ["is-descriptor", "1.0.2"],
      ]),
    }],
  ])],
  ["is-accessor-descriptor", new Map([
    ["0.1.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["is-accessor-descriptor", "0.1.6"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "6.0.2"],
        ["is-accessor-descriptor", "1.0.0"],
      ]),
    }],
  ])],
  ["is-data-descriptor", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["is-data-descriptor", "0.1.4"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "6.0.2"],
        ["is-data-descriptor", "1.0.0"],
      ]),
    }],
  ])],
  ["static-extend", new Map([
    ["0.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/"),
      packageDependencies: new Map([
        ["define-property", "0.2.5"],
        ["object-copy", "0.1.0"],
        ["static-extend", "0.1.2"],
      ]),
    }],
  ])],
  ["object-copy", new Map([
    ["0.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/"),
      packageDependencies: new Map([
        ["copy-descriptor", "0.1.1"],
        ["define-property", "0.2.5"],
        ["kind-of", "3.2.2"],
        ["object-copy", "0.1.0"],
      ]),
    }],
  ])],
  ["copy-descriptor", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/"),
      packageDependencies: new Map([
        ["copy-descriptor", "0.1.1"],
      ]),
    }],
  ])],
  ["mixin-deep", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mixin-deep-1.3.1-a49e7268dce1a0d9698e45326c5626df3543d0fe/node_modules/mixin-deep/"),
      packageDependencies: new Map([
        ["for-in", "1.0.2"],
        ["is-extendable", "1.0.1"],
        ["mixin-deep", "1.3.1"],
      ]),
    }],
  ])],
  ["for-in", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/"),
      packageDependencies: new Map([
        ["for-in", "1.0.2"],
      ]),
    }],
  ])],
  ["pascalcase", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/"),
      packageDependencies: new Map([
        ["pascalcase", "0.1.1"],
      ]),
    }],
  ])],
  ["map-cache", new Map([
    ["0.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/"),
      packageDependencies: new Map([
        ["map-cache", "0.2.2"],
      ]),
    }],
  ])],
  ["source-map-resolve", new Map([
    ["0.5.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/"),
      packageDependencies: new Map([
        ["atob", "2.1.2"],
        ["decode-uri-component", "0.2.0"],
        ["resolve-url", "0.2.1"],
        ["source-map-url", "0.4.0"],
        ["urix", "0.1.0"],
        ["source-map-resolve", "0.5.2"],
      ]),
    }],
  ])],
  ["atob", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/"),
      packageDependencies: new Map([
        ["atob", "2.1.2"],
      ]),
    }],
  ])],
  ["decode-uri-component", new Map([
    ["0.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/"),
      packageDependencies: new Map([
        ["decode-uri-component", "0.2.0"],
      ]),
    }],
  ])],
  ["resolve-url", new Map([
    ["0.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/"),
      packageDependencies: new Map([
        ["resolve-url", "0.2.1"],
      ]),
    }],
  ])],
  ["source-map-url", new Map([
    ["0.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/"),
      packageDependencies: new Map([
        ["source-map-url", "0.4.0"],
      ]),
    }],
  ])],
  ["urix", new Map([
    ["0.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/"),
      packageDependencies: new Map([
        ["urix", "0.1.0"],
      ]),
    }],
  ])],
  ["use", new Map([
    ["3.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/"),
      packageDependencies: new Map([
        ["use", "3.1.1"],
      ]),
    }],
  ])],
  ["snapdragon-node", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/"),
      packageDependencies: new Map([
        ["define-property", "1.0.0"],
        ["isobject", "3.0.1"],
        ["snapdragon-util", "3.0.1"],
        ["snapdragon-node", "2.1.1"],
      ]),
    }],
  ])],
  ["snapdragon-util", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["snapdragon-util", "3.0.1"],
      ]),
    }],
  ])],
  ["to-regex", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/"),
      packageDependencies: new Map([
        ["define-property", "2.0.2"],
        ["extend-shallow", "3.0.2"],
        ["regex-not", "1.0.2"],
        ["safe-regex", "1.1.0"],
        ["to-regex", "3.0.2"],
      ]),
    }],
  ])],
  ["regex-not", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/"),
      packageDependencies: new Map([
        ["extend-shallow", "3.0.2"],
        ["safe-regex", "1.1.0"],
        ["regex-not", "1.0.2"],
      ]),
    }],
  ])],
  ["safe-regex", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/"),
      packageDependencies: new Map([
        ["ret", "0.1.15"],
        ["safe-regex", "1.1.0"],
      ]),
    }],
  ])],
  ["ret", new Map([
    ["0.1.15", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/"),
      packageDependencies: new Map([
        ["ret", "0.1.15"],
      ]),
    }],
  ])],
  ["extglob", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/"),
      packageDependencies: new Map([
        ["array-unique", "0.3.2"],
        ["define-property", "1.0.0"],
        ["expand-brackets", "2.1.4"],
        ["extend-shallow", "2.0.1"],
        ["fragment-cache", "0.2.1"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["extglob", "2.0.4"],
      ]),
    }],
  ])],
  ["expand-brackets", new Map([
    ["2.1.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/"),
      packageDependencies: new Map([
        ["debug", "2.6.9"],
        ["define-property", "0.2.5"],
        ["extend-shallow", "2.0.1"],
        ["posix-character-classes", "0.1.1"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["expand-brackets", "2.1.4"],
      ]),
    }],
  ])],
  ["posix-character-classes", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/"),
      packageDependencies: new Map([
        ["posix-character-classes", "0.1.1"],
      ]),
    }],
  ])],
  ["fragment-cache", new Map([
    ["0.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/"),
      packageDependencies: new Map([
        ["map-cache", "0.2.2"],
        ["fragment-cache", "0.2.1"],
      ]),
    }],
  ])],
  ["nanomatch", new Map([
    ["1.2.13", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/"),
      packageDependencies: new Map([
        ["arr-diff", "4.0.0"],
        ["array-unique", "0.3.2"],
        ["define-property", "2.0.2"],
        ["extend-shallow", "3.0.2"],
        ["fragment-cache", "0.2.1"],
        ["is-windows", "1.0.2"],
        ["kind-of", "6.0.2"],
        ["object.pick", "1.3.0"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["nanomatch", "1.2.13"],
      ]),
    }],
  ])],
  ["is-windows", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/"),
      packageDependencies: new Map([
        ["is-windows", "1.0.2"],
      ]),
    }],
  ])],
  ["object.pick", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
        ["object.pick", "1.3.0"],
      ]),
    }],
  ])],
  ["stack-utils", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-stack-utils-1.0.2-33eba3897788558bebfc2db059dc158ec36cebb8/node_modules/stack-utils/"),
      packageDependencies: new Map([
        ["stack-utils", "1.0.2"],
      ]),
    }],
  ])],
  ["jest-mock", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-mock-24.8.0-2f9d14d37699e863f1febf4e4d5a33b7fdbbde56/node_modules/jest-mock/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["jest-mock", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-mock-24.6.0-fd21d9f0c4b77d6b1cbd320223a56c5ae294b86b/node_modules/jest-mock/"),
      packageDependencies: new Map([
        ["@jest/types", "24.6.0"],
        ["jest-mock", "24.6.0"],
      ]),
    }],
  ])],
  ["@jest/transform", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-transform-24.8.0-628fb99dce4f9d254c6fd9341e3eea262e06fef5/node_modules/@jest/transform/"),
      packageDependencies: new Map([
        ["@babel/core", "7.3.4"],
        ["@jest/types", "24.8.0"],
        ["babel-plugin-istanbul", "5.1.1"],
        ["chalk", "2.4.2"],
        ["convert-source-map", "1.6.0"],
        ["fast-json-stable-stringify", "2.0.0"],
        ["graceful-fs", "4.1.15"],
        ["jest-haste-map", "24.8.0"],
        ["jest-regex-util", "24.3.0"],
        ["jest-util", "24.8.0"],
        ["micromatch", "3.1.10"],
        ["realpath-native", "1.1.0"],
        ["slash", "2.0.0"],
        ["source-map", "0.6.1"],
        ["write-file-atomic", "2.4.1"],
        ["@jest/transform", "24.8.0"],
      ]),
    }],
  ])],
  ["@babel/core", new Map([
    ["7.3.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-core-7.3.4-921a5a13746c21e32445bf0798680e9d11a6530b/node_modules/@babel/core/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["@babel/generator", "7.3.4"],
        ["@babel/helpers", "7.3.1"],
        ["@babel/parser", "7.3.4"],
        ["@babel/template", "7.2.2"],
        ["@babel/traverse", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["convert-source-map", "1.6.0"],
        ["debug", "4.1.1"],
        ["json5", "2.1.0"],
        ["lodash", "4.17.11"],
        ["resolve", "1.10.0"],
        ["semver", "5.6.0"],
        ["source-map", "0.5.7"],
        ["@babel/core", "7.3.4"],
      ]),
    }],
  ])],
  ["@babel/generator", new Map([
    ["7.3.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-generator-7.3.4-9aa48c1989257877a9d971296e5b73bfe72e446e/node_modules/@babel/generator/"),
      packageDependencies: new Map([
        ["@babel/types", "7.3.4"],
        ["jsesc", "2.5.2"],
        ["lodash", "4.17.11"],
        ["source-map", "0.5.7"],
        ["trim-right", "1.0.1"],
        ["@babel/generator", "7.3.4"],
      ]),
    }],
  ])],
  ["@babel/types", new Map([
    ["7.3.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-types-7.3.4-bf482eaeaffb367a28abbf9357a94963235d90ed/node_modules/@babel/types/"),
      packageDependencies: new Map([
        ["esutils", "2.0.2"],
        ["lodash", "4.17.11"],
        ["to-fast-properties", "2.0.0"],
        ["@babel/types", "7.3.4"],
      ]),
    }],
  ])],
  ["to-fast-properties", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-to-fast-properties-2.0.0-dc5e698cbd079265bc73e0377681a4e4e83f616e/node_modules/to-fast-properties/"),
      packageDependencies: new Map([
        ["to-fast-properties", "2.0.0"],
      ]),
    }],
  ])],
  ["jsesc", new Map([
    ["2.5.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jsesc-2.5.2-80564d2e483dacf6e8ef209650a67df3f0c283a4/node_modules/jsesc/"),
      packageDependencies: new Map([
        ["jsesc", "2.5.2"],
      ]),
    }],
  ])],
  ["trim-right", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-trim-right-1.0.1-cb2e1203067e0c8de1f614094b9fe45704ea6003/node_modules/trim-right/"),
      packageDependencies: new Map([
        ["trim-right", "1.0.1"],
      ]),
    }],
  ])],
  ["@babel/helpers", new Map([
    ["7.3.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-helpers-7.3.1-949eec9ea4b45d3210feb7dc1c22db664c9e44b9/node_modules/@babel/helpers/"),
      packageDependencies: new Map([
        ["@babel/template", "7.2.2"],
        ["@babel/traverse", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["@babel/helpers", "7.3.1"],
      ]),
    }],
  ])],
  ["@babel/template", new Map([
    ["7.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-template-7.2.2-005b3fdf0ed96e88041330379e0da9a708eb2907/node_modules/@babel/template/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["@babel/parser", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["@babel/template", "7.2.2"],
      ]),
    }],
  ])],
  ["@babel/parser", new Map([
    ["7.3.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-parser-7.3.4-a43357e4bbf4b92a437fb9e465c192848287f27c/node_modules/@babel/parser/"),
      packageDependencies: new Map([
        ["@babel/parser", "7.3.4"],
      ]),
    }],
  ])],
  ["@babel/traverse", new Map([
    ["7.3.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-traverse-7.3.4-1330aab72234f8dea091b08c4f8b9d05c7119e06/node_modules/@babel/traverse/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["@babel/generator", "7.3.4"],
        ["@babel/helper-function-name", "7.1.0"],
        ["@babel/helper-split-export-declaration", "7.0.0"],
        ["@babel/parser", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["debug", "4.1.1"],
        ["globals", "11.11.0"],
        ["lodash", "4.17.11"],
        ["@babel/traverse", "7.3.4"],
      ]),
    }],
  ])],
  ["@babel/helper-function-name", new Map([
    ["7.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-helper-function-name-7.1.0-a0ceb01685f73355d4360c1247f582bfafc8ff53/node_modules/@babel/helper-function-name/"),
      packageDependencies: new Map([
        ["@babel/helper-get-function-arity", "7.0.0"],
        ["@babel/template", "7.2.2"],
        ["@babel/types", "7.3.4"],
        ["@babel/helper-function-name", "7.1.0"],
      ]),
    }],
  ])],
  ["@babel/helper-get-function-arity", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-helper-get-function-arity-7.0.0-83572d4320e2a4657263734113c42868b64e49c3/node_modules/@babel/helper-get-function-arity/"),
      packageDependencies: new Map([
        ["@babel/types", "7.3.4"],
        ["@babel/helper-get-function-arity", "7.0.0"],
      ]),
    }],
  ])],
  ["@babel/helper-split-export-declaration", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-helper-split-export-declaration-7.0.0-3aae285c0311c2ab095d997b8c9a94cad547d813/node_modules/@babel/helper-split-export-declaration/"),
      packageDependencies: new Map([
        ["@babel/types", "7.3.4"],
        ["@babel/helper-split-export-declaration", "7.0.0"],
      ]),
    }],
  ])],
  ["convert-source-map", new Map([
    ["1.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-convert-source-map-1.6.0-51b537a8c43e0f04dec1993bffcdd504e758ac20/node_modules/convert-source-map/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["convert-source-map", "1.6.0"],
      ]),
    }],
  ])],
  ["safe-buffer", new Map([
    ["5.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
      ]),
    }],
  ])],
  ["json5", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-json5-2.1.0-e7a0c62c48285c628d20a10b85c89bb807c32850/node_modules/json5/"),
      packageDependencies: new Map([
        ["minimist", "1.2.0"],
        ["json5", "2.1.0"],
      ]),
    }],
  ])],
  ["resolve", new Map([
    ["1.10.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-resolve-1.10.0-3bdaaeaf45cc07f375656dfd2e54ed0810b101ba/node_modules/resolve/"),
      packageDependencies: new Map([
        ["path-parse", "1.0.6"],
        ["resolve", "1.10.0"],
      ]),
    }],
    ["1.1.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-resolve-1.1.7-203114d82ad2c5ed9e8e0411b3932875e889e97b/node_modules/resolve/"),
      packageDependencies: new Map([
        ["resolve", "1.1.7"],
      ]),
    }],
  ])],
  ["path-parse", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/"),
      packageDependencies: new Map([
        ["path-parse", "1.0.6"],
      ]),
    }],
  ])],
  ["babel-plugin-istanbul", new Map([
    ["5.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-babel-plugin-istanbul-5.1.1-7981590f1956d75d67630ba46f0c22493588c893/node_modules/babel-plugin-istanbul/"),
      packageDependencies: new Map([
        ["find-up", "3.0.0"],
        ["istanbul-lib-instrument", "3.1.0"],
        ["test-exclude", "5.1.0"],
        ["babel-plugin-istanbul", "5.1.1"],
      ]),
    }],
  ])],
  ["istanbul-lib-instrument", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-istanbul-lib-instrument-3.1.0-a2b5484a7d445f1f311e93190813fa56dfb62971/node_modules/istanbul-lib-instrument/"),
      packageDependencies: new Map([
        ["@babel/generator", "7.3.4"],
        ["@babel/parser", "7.3.4"],
        ["@babel/template", "7.2.2"],
        ["@babel/traverse", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["istanbul-lib-coverage", "2.0.3"],
        ["semver", "5.6.0"],
        ["istanbul-lib-instrument", "3.1.0"],
      ]),
    }],
  ])],
  ["istanbul-lib-coverage", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-istanbul-lib-coverage-2.0.3-0b891e5ad42312c2b9488554f603795f9a2211ba/node_modules/istanbul-lib-coverage/"),
      packageDependencies: new Map([
        ["istanbul-lib-coverage", "2.0.3"],
      ]),
    }],
  ])],
  ["test-exclude", new Map([
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-test-exclude-5.1.0-6ba6b25179d2d38724824661323b73e03c0c1de1/node_modules/test-exclude/"),
      packageDependencies: new Map([
        ["arrify", "1.0.1"],
        ["minimatch", "3.0.4"],
        ["read-pkg-up", "4.0.0"],
        ["require-main-filename", "1.0.1"],
        ["test-exclude", "5.1.0"],
      ]),
    }],
  ])],
  ["arrify", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-arrify-1.0.1-898508da2226f380df904728456849c1501a4b0d/node_modules/arrify/"),
      packageDependencies: new Map([
        ["arrify", "1.0.1"],
      ]),
    }],
  ])],
  ["read-pkg-up", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-read-pkg-up-4.0.0-1b221c6088ba7799601c808f91161c66e58f8978/node_modules/read-pkg-up/"),
      packageDependencies: new Map([
        ["find-up", "3.0.0"],
        ["read-pkg", "3.0.0"],
        ["read-pkg-up", "4.0.0"],
      ]),
    }],
  ])],
  ["read-pkg", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-read-pkg-3.0.0-9cbc686978fee65d16c00e2b19c237fcf6e38389/node_modules/read-pkg/"),
      packageDependencies: new Map([
        ["load-json-file", "4.0.0"],
        ["normalize-package-data", "2.5.0"],
        ["path-type", "3.0.0"],
        ["read-pkg", "3.0.0"],
      ]),
    }],
  ])],
  ["load-json-file", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-load-json-file-4.0.0-2f5f45ab91e33216234fd53adab668eb4ec0993b/node_modules/load-json-file/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
        ["parse-json", "4.0.0"],
        ["pify", "3.0.0"],
        ["strip-bom", "3.0.0"],
        ["load-json-file", "4.0.0"],
      ]),
    }],
  ])],
  ["parse-json", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-parse-json-4.0.0-be35f5425be1f7f6c747184f98a788cb99477ee0/node_modules/parse-json/"),
      packageDependencies: new Map([
        ["error-ex", "1.3.2"],
        ["json-parse-better-errors", "1.0.2"],
        ["parse-json", "4.0.0"],
      ]),
    }],
  ])],
  ["error-ex", new Map([
    ["1.3.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-error-ex-1.3.2-b4ac40648107fdcdcfae242f428bea8a14d4f1bf/node_modules/error-ex/"),
      packageDependencies: new Map([
        ["is-arrayish", "0.2.1"],
        ["error-ex", "1.3.2"],
      ]),
    }],
  ])],
  ["is-arrayish", new Map([
    ["0.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-arrayish-0.2.1-77c99840527aa8ecb1a8ba697b80645a7a926a9d/node_modules/is-arrayish/"),
      packageDependencies: new Map([
        ["is-arrayish", "0.2.1"],
      ]),
    }],
  ])],
  ["json-parse-better-errors", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-json-parse-better-errors-1.0.2-bb867cfb3450e69107c131d1c514bab3dc8bcaa9/node_modules/json-parse-better-errors/"),
      packageDependencies: new Map([
        ["json-parse-better-errors", "1.0.2"],
      ]),
    }],
  ])],
  ["pify", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pify-3.0.0-e5a4acd2c101fdf3d9a4d07f0dbc4db49dd28176/node_modules/pify/"),
      packageDependencies: new Map([
        ["pify", "3.0.0"],
      ]),
    }],
  ])],
  ["strip-bom", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-strip-bom-3.0.0-2334c18e9c759f7bdd56fdef7e9ae3d588e68ed3/node_modules/strip-bom/"),
      packageDependencies: new Map([
        ["strip-bom", "3.0.0"],
      ]),
    }],
  ])],
  ["normalize-package-data", new Map([
    ["2.5.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-normalize-package-data-2.5.0-e66db1838b200c1dfc233225d12cb36520e234a8/node_modules/normalize-package-data/"),
      packageDependencies: new Map([
        ["hosted-git-info", "2.7.1"],
        ["resolve", "1.10.0"],
        ["semver", "5.6.0"],
        ["validate-npm-package-license", "3.0.4"],
        ["normalize-package-data", "2.5.0"],
      ]),
    }],
  ])],
  ["hosted-git-info", new Map([
    ["2.7.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-hosted-git-info-2.7.1-97f236977bd6e125408930ff6de3eec6281ec047/node_modules/hosted-git-info/"),
      packageDependencies: new Map([
        ["hosted-git-info", "2.7.1"],
      ]),
    }],
  ])],
  ["validate-npm-package-license", new Map([
    ["3.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-validate-npm-package-license-3.0.4-fc91f6b9c7ba15c857f4cb2c5defeec39d4f410a/node_modules/validate-npm-package-license/"),
      packageDependencies: new Map([
        ["spdx-correct", "3.1.0"],
        ["spdx-expression-parse", "3.0.0"],
        ["validate-npm-package-license", "3.0.4"],
      ]),
    }],
  ])],
  ["spdx-correct", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-spdx-correct-3.1.0-fb83e504445268f154b074e218c87c003cd31df4/node_modules/spdx-correct/"),
      packageDependencies: new Map([
        ["spdx-expression-parse", "3.0.0"],
        ["spdx-license-ids", "3.0.3"],
        ["spdx-correct", "3.1.0"],
      ]),
    }],
  ])],
  ["spdx-expression-parse", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-spdx-expression-parse-3.0.0-99e119b7a5da00e05491c9fa338b7904823b41d0/node_modules/spdx-expression-parse/"),
      packageDependencies: new Map([
        ["spdx-exceptions", "2.2.0"],
        ["spdx-license-ids", "3.0.3"],
        ["spdx-expression-parse", "3.0.0"],
      ]),
    }],
  ])],
  ["spdx-exceptions", new Map([
    ["2.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-spdx-exceptions-2.2.0-2ea450aee74f2a89bfb94519c07fcd6f41322977/node_modules/spdx-exceptions/"),
      packageDependencies: new Map([
        ["spdx-exceptions", "2.2.0"],
      ]),
    }],
  ])],
  ["spdx-license-ids", new Map([
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-spdx-license-ids-3.0.3-81c0ce8f21474756148bbb5f3bfc0f36bf15d76e/node_modules/spdx-license-ids/"),
      packageDependencies: new Map([
        ["spdx-license-ids", "3.0.3"],
      ]),
    }],
  ])],
  ["path-type", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-path-type-3.0.0-cef31dc8e0a1a3bb0d105c0cd97cf3bf47f4e36f/node_modules/path-type/"),
      packageDependencies: new Map([
        ["pify", "3.0.0"],
        ["path-type", "3.0.0"],
      ]),
    }],
  ])],
  ["require-main-filename", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-require-main-filename-1.0.1-97f717b69d48784f5f526a6c5aa8ffdda055a4d1/node_modules/require-main-filename/"),
      packageDependencies: new Map([
        ["require-main-filename", "1.0.1"],
      ]),
    }],
  ])],
  ["jest-haste-map", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-haste-map-24.8.0-51794182d877b3ddfd6e6d23920e3fe72f305800/node_modules/jest-haste-map/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["anymatch", "2.0.0"],
        ["fb-watchman", "2.0.0"],
        ["graceful-fs", "4.1.15"],
        ["invariant", "2.2.4"],
        ["jest-serializer", "24.4.0"],
        ["jest-util", "24.8.0"],
        ["jest-worker", "24.6.0"],
        ["micromatch", "3.1.10"],
        ["sane", "4.0.3"],
        ["walker", "1.0.7"],
        ["fsevents", "1.2.7"],
        ["jest-haste-map", "24.8.0"],
      ]),
    }],
  ])],
  ["anymatch", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/"),
      packageDependencies: new Map([
        ["micromatch", "3.1.10"],
        ["normalize-path", "2.1.1"],
        ["anymatch", "2.0.0"],
      ]),
    }],
  ])],
  ["normalize-path", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/"),
      packageDependencies: new Map([
        ["remove-trailing-separator", "1.1.0"],
        ["normalize-path", "2.1.1"],
      ]),
    }],
  ])],
  ["remove-trailing-separator", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/"),
      packageDependencies: new Map([
        ["remove-trailing-separator", "1.1.0"],
      ]),
    }],
  ])],
  ["fb-watchman", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fb-watchman-2.0.0-54e9abf7dfa2f26cd9b1636c588c1afc05de5d58/node_modules/fb-watchman/"),
      packageDependencies: new Map([
        ["bser", "2.0.0"],
        ["fb-watchman", "2.0.0"],
      ]),
    }],
  ])],
  ["bser", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-bser-2.0.0-9ac78d3ed5d915804fd87acb158bc797147a1719/node_modules/bser/"),
      packageDependencies: new Map([
        ["node-int64", "0.4.0"],
        ["bser", "2.0.0"],
      ]),
    }],
  ])],
  ["node-int64", new Map([
    ["0.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-node-int64-0.4.0-87a9065cdb355d3182d8f94ce11188b825c68a3b/node_modules/node-int64/"),
      packageDependencies: new Map([
        ["node-int64", "0.4.0"],
      ]),
    }],
  ])],
  ["invariant", new Map([
    ["2.2.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-invariant-2.2.4-610f3c92c9359ce1db616e538008d23ff35158e6/node_modules/invariant/"),
      packageDependencies: new Map([
        ["loose-envify", "1.4.0"],
        ["invariant", "2.2.4"],
      ]),
    }],
  ])],
  ["loose-envify", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-loose-envify-1.4.0-71ee51fa7be4caec1a63839f7e682d8132d30caf/node_modules/loose-envify/"),
      packageDependencies: new Map([
        ["js-tokens", "4.0.0"],
        ["loose-envify", "1.4.0"],
      ]),
    }],
  ])],
  ["jest-serializer", new Map([
    ["24.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-serializer-24.4.0-f70c5918c8ea9235ccb1276d232e459080588db3/node_modules/jest-serializer/"),
      packageDependencies: new Map([
        ["jest-serializer", "24.4.0"],
      ]),
    }],
  ])],
  ["jest-util", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-util-24.8.0-41f0e945da11df44cc76d64ffb915d0716f46cd1/node_modules/jest-util/"),
      packageDependencies: new Map([
        ["@jest/console", "24.7.1"],
        ["@jest/fake-timers", "24.8.0"],
        ["@jest/source-map", "24.3.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["callsites", "3.0.0"],
        ["chalk", "2.4.2"],
        ["graceful-fs", "4.1.15"],
        ["is-ci", "2.0.0"],
        ["mkdirp", "0.5.1"],
        ["slash", "2.0.0"],
        ["source-map", "0.6.1"],
        ["jest-util", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-util-24.6.0-725a380e8f21fcdf53bd5bd5829ee78903ffc756/node_modules/jest-util/"),
      packageDependencies: new Map([
        ["@jest/console", "24.6.0"],
        ["@jest/fake-timers", "24.6.0"],
        ["@jest/source-map", "24.3.0"],
        ["@jest/test-result", "24.6.0"],
        ["@jest/types", "24.6.0"],
        ["callsites", "3.0.0"],
        ["chalk", "2.4.2"],
        ["graceful-fs", "4.1.15"],
        ["is-ci", "2.0.0"],
        ["mkdirp", "0.5.1"],
        ["slash", "2.0.0"],
        ["source-map", "0.6.1"],
        ["jest-util", "24.6.0"],
      ]),
    }],
  ])],
  ["is-ci", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-ci-2.0.0-6bc6334181810e04b5c22b3d589fdca55026404c/node_modules/is-ci/"),
      packageDependencies: new Map([
        ["ci-info", "2.0.0"],
        ["is-ci", "2.0.0"],
      ]),
    }],
  ])],
  ["ci-info", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ci-info-2.0.0-67a9e964be31a51e15e5010d58e6f12834002f46/node_modules/ci-info/"),
      packageDependencies: new Map([
        ["ci-info", "2.0.0"],
      ]),
    }],
  ])],
  ["jest-worker", new Map([
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-worker-24.6.0-7f81ceae34b7cde0c9827a6980c35b7cdc0161b3/node_modules/jest-worker/"),
      packageDependencies: new Map([
        ["merge-stream", "1.0.1"],
        ["supports-color", "6.1.0"],
        ["jest-worker", "24.6.0"],
      ]),
    }],
  ])],
  ["merge-stream", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-merge-stream-1.0.1-4041202d508a342ba00174008df0c251b8c135e1/node_modules/merge-stream/"),
      packageDependencies: new Map([
        ["readable-stream", "2.3.6"],
        ["merge-stream", "1.0.1"],
      ]),
    }],
  ])],
  ["readable-stream", new Map([
    ["2.3.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/"),
      packageDependencies: new Map([
        ["core-util-is", "1.0.2"],
        ["inherits", "2.0.3"],
        ["isarray", "1.0.0"],
        ["process-nextick-args", "2.0.0"],
        ["safe-buffer", "5.1.2"],
        ["string_decoder", "1.1.1"],
        ["util-deprecate", "1.0.2"],
        ["readable-stream", "2.3.6"],
      ]),
    }],
  ])],
  ["core-util-is", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/"),
      packageDependencies: new Map([
        ["core-util-is", "1.0.2"],
      ]),
    }],
  ])],
  ["process-nextick-args", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-process-nextick-args-2.0.0-a37d732f4271b4ab1ad070d35508e8290788ffaa/node_modules/process-nextick-args/"),
      packageDependencies: new Map([
        ["process-nextick-args", "2.0.0"],
      ]),
    }],
  ])],
  ["string_decoder", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["string_decoder", "1.1.1"],
      ]),
    }],
  ])],
  ["util-deprecate", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/"),
      packageDependencies: new Map([
        ["util-deprecate", "1.0.2"],
      ]),
    }],
  ])],
  ["sane", new Map([
    ["4.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-sane-4.0.3-e878c3f19e25cc57fbb734602f48f8a97818b181/node_modules/sane/"),
      packageDependencies: new Map([
        ["@cnakazawa/watch", "1.0.3"],
        ["anymatch", "2.0.0"],
        ["capture-exit", "1.2.0"],
        ["exec-sh", "0.3.2"],
        ["execa", "1.0.0"],
        ["fb-watchman", "2.0.0"],
        ["micromatch", "3.1.10"],
        ["minimist", "1.2.0"],
        ["walker", "1.0.7"],
        ["sane", "4.0.3"],
      ]),
    }],
  ])],
  ["@cnakazawa/watch", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@cnakazawa-watch-1.0.3-099139eaec7ebf07a27c1786a3ff64f39464d2ef/node_modules/@cnakazawa/watch/"),
      packageDependencies: new Map([
        ["exec-sh", "0.3.2"],
        ["minimist", "1.2.0"],
        ["@cnakazawa/watch", "1.0.3"],
      ]),
    }],
  ])],
  ["exec-sh", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-exec-sh-0.3.2-6738de2eb7c8e671d0366aea0b0db8c6f7d7391b/node_modules/exec-sh/"),
      packageDependencies: new Map([
        ["exec-sh", "0.3.2"],
      ]),
    }],
  ])],
  ["capture-exit", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-capture-exit-1.2.0-1c5fcc489fd0ab00d4f1ac7ae1072e3173fbab6f/node_modules/capture-exit/"),
      packageDependencies: new Map([
        ["rsvp", "3.6.2"],
        ["capture-exit", "1.2.0"],
      ]),
    }],
  ])],
  ["rsvp", new Map([
    ["3.6.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-rsvp-3.6.2-2e96491599a96cde1b515d5674a8f7a91452926a/node_modules/rsvp/"),
      packageDependencies: new Map([
        ["rsvp", "3.6.2"],
      ]),
    }],
  ])],
  ["execa", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-execa-1.0.0-c6236a5bb4df6d6f15e88e7f017798216749ddd8/node_modules/execa/"),
      packageDependencies: new Map([
        ["cross-spawn", "6.0.5"],
        ["get-stream", "4.1.0"],
        ["is-stream", "1.1.0"],
        ["npm-run-path", "2.0.2"],
        ["p-finally", "1.0.0"],
        ["signal-exit", "3.0.2"],
        ["strip-eof", "1.0.0"],
        ["execa", "1.0.0"],
      ]),
    }],
  ])],
  ["get-stream", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-get-stream-4.1.0-c1b255575f3dc21d59bfc79cd3d2b46b1c3a54b5/node_modules/get-stream/"),
      packageDependencies: new Map([
        ["pump", "3.0.0"],
        ["get-stream", "4.1.0"],
      ]),
    }],
  ])],
  ["pump", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pump-3.0.0-b4a2116815bde2f4e1ea602354e8c75565107a64/node_modules/pump/"),
      packageDependencies: new Map([
        ["end-of-stream", "1.4.1"],
        ["once", "1.4.0"],
        ["pump", "3.0.0"],
      ]),
    }],
  ])],
  ["end-of-stream", new Map([
    ["1.4.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-end-of-stream-1.4.1-ed29634d19baba463b6ce6b80a37213eab71ec43/node_modules/end-of-stream/"),
      packageDependencies: new Map([
        ["once", "1.4.0"],
        ["end-of-stream", "1.4.1"],
      ]),
    }],
  ])],
  ["is-stream", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/"),
      packageDependencies: new Map([
        ["is-stream", "1.1.0"],
      ]),
    }],
  ])],
  ["p-finally", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/"),
      packageDependencies: new Map([
        ["p-finally", "1.0.0"],
      ]),
    }],
  ])],
  ["strip-eof", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/"),
      packageDependencies: new Map([
        ["strip-eof", "1.0.0"],
      ]),
    }],
  ])],
  ["walker", new Map([
    ["1.0.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-walker-1.0.7-2f7f9b8fd10d677262b18a884e28d19618e028fb/node_modules/walker/"),
      packageDependencies: new Map([
        ["makeerror", "1.0.11"],
        ["walker", "1.0.7"],
      ]),
    }],
  ])],
  ["makeerror", new Map([
    ["1.0.11", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-makeerror-1.0.11-e01a5c9109f2af79660e4e8b9587790184f5a96c/node_modules/makeerror/"),
      packageDependencies: new Map([
        ["tmpl", "1.0.4"],
        ["makeerror", "1.0.11"],
      ]),
    }],
  ])],
  ["tmpl", new Map([
    ["1.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tmpl-1.0.4-23640dd7b42d00433911140820e5cf440e521dd1/node_modules/tmpl/"),
      packageDependencies: new Map([
        ["tmpl", "1.0.4"],
      ]),
    }],
  ])],
  ["fsevents", new Map([
    ["1.2.7", {
      packageLocation: path.resolve(__dirname, "./.pnp/unplugged/npm-fsevents-1.2.7-4851b664a3783e52003b3c66eb0eee1074933aa4/node_modules/fsevents/"),
      packageDependencies: new Map([
        ["nan", "2.13.2"],
        ["node-pre-gyp", "0.10.3"],
        ["fsevents", "1.2.7"],
      ]),
    }],
  ])],
  ["nan", new Map([
    ["2.13.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-nan-2.13.2-f51dc7ae66ba7d5d55e1e6d4d8092e802c9aefe7/node_modules/nan/"),
      packageDependencies: new Map([
        ["nan", "2.13.2"],
      ]),
    }],
  ])],
  ["node-pre-gyp", new Map([
    ["0.10.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-node-pre-gyp-0.10.3-3070040716afdc778747b61b6887bf78880b80fc/node_modules/node-pre-gyp/"),
      packageDependencies: new Map([
        ["detect-libc", "1.0.3"],
        ["mkdirp", "0.5.1"],
        ["needle", "2.2.4"],
        ["nopt", "4.0.1"],
        ["npm-packlist", "1.4.1"],
        ["npmlog", "4.1.2"],
        ["rc", "1.2.8"],
        ["rimraf", "2.6.3"],
        ["semver", "5.7.0"],
        ["tar", "4.4.8"],
        ["node-pre-gyp", "0.10.3"],
      ]),
    }],
  ])],
  ["detect-libc", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-detect-libc-1.0.3-fa137c4bd698edf55cd5cd02ac559f91a4c4ba9b/node_modules/detect-libc/"),
      packageDependencies: new Map([
        ["detect-libc", "1.0.3"],
      ]),
    }],
  ])],
  ["needle", new Map([
    ["2.2.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-needle-2.2.4-51931bff82533b1928b7d1d69e01f1b00ffd2a4e/node_modules/needle/"),
      packageDependencies: new Map([
        ["debug", "2.6.9"],
        ["iconv-lite", "0.4.24"],
        ["sax", "1.2.4"],
        ["needle", "2.2.4"],
      ]),
    }],
  ])],
  ["sax", new Map([
    ["1.2.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/"),
      packageDependencies: new Map([
        ["sax", "1.2.4"],
      ]),
    }],
  ])],
  ["nopt", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-nopt-4.0.1-d0d4685afd5415193c8c7505602d0d17cd64474d/node_modules/nopt/"),
      packageDependencies: new Map([
        ["abbrev", "1.1.1"],
        ["osenv", "0.1.5"],
        ["nopt", "4.0.1"],
      ]),
    }],
  ])],
  ["abbrev", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-abbrev-1.1.1-f8f2c887ad10bf67f634f005b6987fed3179aac8/node_modules/abbrev/"),
      packageDependencies: new Map([
        ["abbrev", "1.1.1"],
      ]),
    }],
  ])],
  ["osenv", new Map([
    ["0.1.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-osenv-0.1.5-85cdfafaeb28e8677f416e287592b5f3f49ea410/node_modules/osenv/"),
      packageDependencies: new Map([
        ["os-homedir", "1.0.2"],
        ["os-tmpdir", "1.0.2"],
        ["osenv", "0.1.5"],
      ]),
    }],
  ])],
  ["os-homedir", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/"),
      packageDependencies: new Map([
        ["os-homedir", "1.0.2"],
      ]),
    }],
  ])],
  ["npm-packlist", new Map([
    ["1.4.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-npm-packlist-1.4.1-19064cdf988da80ea3cee45533879d90192bbfbc/node_modules/npm-packlist/"),
      packageDependencies: new Map([
        ["ignore-walk", "3.0.1"],
        ["npm-bundled", "1.0.6"],
        ["npm-packlist", "1.4.1"],
      ]),
    }],
  ])],
  ["ignore-walk", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ignore-walk-3.0.1-a83e62e7d272ac0e3b551aaa82831a19b69f82f8/node_modules/ignore-walk/"),
      packageDependencies: new Map([
        ["minimatch", "3.0.4"],
        ["ignore-walk", "3.0.1"],
      ]),
    }],
  ])],
  ["npm-bundled", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-npm-bundled-1.0.6-e7ba9aadcef962bb61248f91721cd932b3fe6bdd/node_modules/npm-bundled/"),
      packageDependencies: new Map([
        ["npm-bundled", "1.0.6"],
      ]),
    }],
  ])],
  ["npmlog", new Map([
    ["4.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-npmlog-4.1.2-08a7f2a8bf734604779a9efa4ad5cc717abb954b/node_modules/npmlog/"),
      packageDependencies: new Map([
        ["are-we-there-yet", "1.1.5"],
        ["console-control-strings", "1.1.0"],
        ["gauge", "2.7.4"],
        ["set-blocking", "2.0.0"],
        ["npmlog", "4.1.2"],
      ]),
    }],
  ])],
  ["are-we-there-yet", new Map([
    ["1.1.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-are-we-there-yet-1.1.5-4b35c2944f062a8bfcda66410760350fe9ddfc21/node_modules/are-we-there-yet/"),
      packageDependencies: new Map([
        ["delegates", "1.0.0"],
        ["readable-stream", "2.3.6"],
        ["are-we-there-yet", "1.1.5"],
      ]),
    }],
  ])],
  ["delegates", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-delegates-1.0.0-84c6e159b81904fdca59a0ef44cd870d31250f9a/node_modules/delegates/"),
      packageDependencies: new Map([
        ["delegates", "1.0.0"],
      ]),
    }],
  ])],
  ["console-control-strings", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-console-control-strings-1.1.0-3d7cf4464db6446ea644bf4b39507f9851008e8e/node_modules/console-control-strings/"),
      packageDependencies: new Map([
        ["console-control-strings", "1.1.0"],
      ]),
    }],
  ])],
  ["gauge", new Map([
    ["2.7.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-gauge-2.7.4-2c03405c7538c39d7eb37b317022e325fb018bf7/node_modules/gauge/"),
      packageDependencies: new Map([
        ["aproba", "1.2.0"],
        ["console-control-strings", "1.1.0"],
        ["has-unicode", "2.0.1"],
        ["object-assign", "4.1.1"],
        ["signal-exit", "3.0.2"],
        ["string-width", "1.0.2"],
        ["strip-ansi", "3.0.1"],
        ["wide-align", "1.1.3"],
        ["gauge", "2.7.4"],
      ]),
    }],
  ])],
  ["aproba", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-aproba-1.2.0-6802e6264efd18c790a1b0d517f0f2627bf2c94a/node_modules/aproba/"),
      packageDependencies: new Map([
        ["aproba", "1.2.0"],
      ]),
    }],
  ])],
  ["has-unicode", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-unicode-2.0.1-e0e6fe6a28cf51138855e086d1691e771de2a8b9/node_modules/has-unicode/"),
      packageDependencies: new Map([
        ["has-unicode", "2.0.1"],
      ]),
    }],
  ])],
  ["object-assign", new Map([
    ["4.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/"),
      packageDependencies: new Map([
        ["object-assign", "4.1.1"],
      ]),
    }],
  ])],
  ["code-point-at", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/"),
      packageDependencies: new Map([
        ["code-point-at", "1.1.0"],
      ]),
    }],
  ])],
  ["number-is-nan", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/"),
      packageDependencies: new Map([
        ["number-is-nan", "1.0.1"],
      ]),
    }],
  ])],
  ["wide-align", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-wide-align-1.1.3-ae074e6bdc0c14a431e804e624549c633b000457/node_modules/wide-align/"),
      packageDependencies: new Map([
        ["string-width", "2.1.1"],
        ["wide-align", "1.1.3"],
      ]),
    }],
  ])],
  ["set-blocking", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/"),
      packageDependencies: new Map([
        ["set-blocking", "2.0.0"],
      ]),
    }],
  ])],
  ["rc", new Map([
    ["1.2.8", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-rc-1.2.8-cd924bf5200a075b83c188cd6b9e211b7fc0d3ed/node_modules/rc/"),
      packageDependencies: new Map([
        ["deep-extend", "0.6.0"],
        ["ini", "1.3.5"],
        ["minimist", "1.2.0"],
        ["strip-json-comments", "2.0.1"],
        ["rc", "1.2.8"],
      ]),
    }],
  ])],
  ["deep-extend", new Map([
    ["0.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-deep-extend-0.6.0-c4fa7c95404a17a9c3e8ca7e1537312b736330ac/node_modules/deep-extend/"),
      packageDependencies: new Map([
        ["deep-extend", "0.6.0"],
      ]),
    }],
  ])],
  ["ini", new Map([
    ["1.3.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ini-1.3.5-eee25f56db1c9ec6085e0c22778083f596abf927/node_modules/ini/"),
      packageDependencies: new Map([
        ["ini", "1.3.5"],
      ]),
    }],
  ])],
  ["tar", new Map([
    ["4.4.8", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tar-4.4.8-b19eec3fde2a96e64666df9fdb40c5ca1bc3747d/node_modules/tar/"),
      packageDependencies: new Map([
        ["chownr", "1.1.1"],
        ["fs-minipass", "1.2.5"],
        ["minipass", "2.3.5"],
        ["minizlib", "1.2.1"],
        ["mkdirp", "0.5.1"],
        ["safe-buffer", "5.1.2"],
        ["yallist", "3.0.3"],
        ["tar", "4.4.8"],
      ]),
    }],
  ])],
  ["chownr", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-chownr-1.1.1-54726b8b8fff4df053c42187e801fb4412df1494/node_modules/chownr/"),
      packageDependencies: new Map([
        ["chownr", "1.1.1"],
      ]),
    }],
  ])],
  ["fs-minipass", new Map([
    ["1.2.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-fs-minipass-1.2.5-06c277218454ec288df77ada54a03b8702aacb9d/node_modules/fs-minipass/"),
      packageDependencies: new Map([
        ["minipass", "2.3.5"],
        ["fs-minipass", "1.2.5"],
      ]),
    }],
  ])],
  ["minipass", new Map([
    ["2.3.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-minipass-2.3.5-cacebe492022497f656b0f0f51e2682a9ed2d848/node_modules/minipass/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["yallist", "3.0.3"],
        ["minipass", "2.3.5"],
      ]),
    }],
  ])],
  ["yallist", new Map([
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-yallist-3.0.3-b4b049e314be545e3ce802236d6cd22cd91c3de9/node_modules/yallist/"),
      packageDependencies: new Map([
        ["yallist", "3.0.3"],
      ]),
    }],
  ])],
  ["minizlib", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-minizlib-1.2.1-dd27ea6136243c7c880684e8672bb3a45fd9b614/node_modules/minizlib/"),
      packageDependencies: new Map([
        ["minipass", "2.3.5"],
        ["minizlib", "1.2.1"],
      ]),
    }],
  ])],
  ["jest-regex-util", new Map([
    ["24.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-regex-util-24.3.0-d5a65f60be1ae3e310d5214a0307581995227b36/node_modules/jest-regex-util/"),
      packageDependencies: new Map([
        ["jest-regex-util", "24.3.0"],
      ]),
    }],
  ])],
  ["realpath-native", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-realpath-native-1.1.0-2003294fea23fb0672f2476ebe22fcf498a2d65c/node_modules/realpath-native/"),
      packageDependencies: new Map([
        ["util.promisify", "1.0.0"],
        ["realpath-native", "1.1.0"],
      ]),
    }],
  ])],
  ["util.promisify", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-util-promisify-1.0.0-440f7165a459c9a16dc145eb8e72f35687097030/node_modules/util.promisify/"),
      packageDependencies: new Map([
        ["define-properties", "1.1.3"],
        ["object.getownpropertydescriptors", "2.0.3"],
        ["util.promisify", "1.0.0"],
      ]),
    }],
  ])],
  ["define-properties", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/"),
      packageDependencies: new Map([
        ["object-keys", "1.1.0"],
        ["define-properties", "1.1.3"],
      ]),
    }],
  ])],
  ["object-keys", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-object-keys-1.1.0-11bd22348dd2e096a045ab06f6c85bcc340fa032/node_modules/object-keys/"),
      packageDependencies: new Map([
        ["object-keys", "1.1.0"],
      ]),
    }],
  ])],
  ["object.getownpropertydescriptors", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-object-getownpropertydescriptors-2.0.3-8758c846f5b407adab0f236e0986f14b051caa16/node_modules/object.getownpropertydescriptors/"),
      packageDependencies: new Map([
        ["define-properties", "1.1.3"],
        ["es-abstract", "1.13.0"],
        ["object.getownpropertydescriptors", "2.0.3"],
      ]),
    }],
  ])],
  ["es-abstract", new Map([
    ["1.13.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-es-abstract-1.13.0-ac86145fdd5099d8dd49558ccba2eaf9b88e24e9/node_modules/es-abstract/"),
      packageDependencies: new Map([
        ["es-to-primitive", "1.2.0"],
        ["function-bind", "1.1.1"],
        ["has", "1.0.3"],
        ["is-callable", "1.1.4"],
        ["is-regex", "1.0.4"],
        ["object-keys", "1.1.0"],
        ["es-abstract", "1.13.0"],
      ]),
    }],
  ])],
  ["es-to-primitive", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-es-to-primitive-1.2.0-edf72478033456e8dda8ef09e00ad9650707f377/node_modules/es-to-primitive/"),
      packageDependencies: new Map([
        ["is-callable", "1.1.4"],
        ["is-date-object", "1.0.1"],
        ["is-symbol", "1.0.2"],
        ["es-to-primitive", "1.2.0"],
      ]),
    }],
  ])],
  ["is-callable", new Map([
    ["1.1.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/"),
      packageDependencies: new Map([
        ["is-callable", "1.1.4"],
      ]),
    }],
  ])],
  ["is-date-object", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/"),
      packageDependencies: new Map([
        ["is-date-object", "1.0.1"],
      ]),
    }],
  ])],
  ["is-symbol", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-symbol-1.0.2-a055f6ae57192caee329e7a860118b497a950f38/node_modules/is-symbol/"),
      packageDependencies: new Map([
        ["has-symbols", "1.0.0"],
        ["is-symbol", "1.0.2"],
      ]),
    }],
  ])],
  ["has-symbols", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-symbols-1.0.0-ba1a8f1af2a0fc39650f5c850367704122063b44/node_modules/has-symbols/"),
      packageDependencies: new Map([
        ["has-symbols", "1.0.0"],
      ]),
    }],
  ])],
  ["function-bind", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/"),
      packageDependencies: new Map([
        ["function-bind", "1.1.1"],
      ]),
    }],
  ])],
  ["has", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/"),
      packageDependencies: new Map([
        ["function-bind", "1.1.1"],
        ["has", "1.0.3"],
      ]),
    }],
  ])],
  ["is-regex", new Map([
    ["1.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/"),
      packageDependencies: new Map([
        ["has", "1.0.3"],
        ["is-regex", "1.0.4"],
      ]),
    }],
  ])],
  ["write-file-atomic", new Map([
    ["2.4.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-write-file-atomic-2.4.1-d0b05463c188ae804396fd5ab2a370062af87529/node_modules/write-file-atomic/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
        ["imurmurhash", "0.1.4"],
        ["signal-exit", "3.0.2"],
        ["write-file-atomic", "2.4.1"],
      ]),
    }],
  ])],
  ["exit", new Map([
    ["0.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-exit-0.1.2-0632638f8d877cc82107d30a0fff1a17cba1cd0c/node_modules/exit/"),
      packageDependencies: new Map([
        ["exit", "0.1.2"],
      ]),
    }],
  ])],
  ["istanbul-lib-report", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-istanbul-lib-report-2.0.4-bfd324ee0c04f59119cb4f07dab157d09f24d7e4/node_modules/istanbul-lib-report/"),
      packageDependencies: new Map([
        ["istanbul-lib-coverage", "2.0.3"],
        ["make-dir", "1.3.0"],
        ["supports-color", "6.1.0"],
        ["istanbul-lib-report", "2.0.4"],
      ]),
    }],
  ])],
  ["make-dir", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-make-dir-1.3.0-79c1033b80515bd6d24ec9933e860ca75ee27f0c/node_modules/make-dir/"),
      packageDependencies: new Map([
        ["pify", "3.0.0"],
        ["make-dir", "1.3.0"],
      ]),
    }],
  ])],
  ["istanbul-lib-source-maps", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-istanbul-lib-source-maps-3.0.2-f1e817229a9146e8424a28e5d69ba220fda34156/node_modules/istanbul-lib-source-maps/"),
      packageDependencies: new Map([
        ["debug", "4.1.1"],
        ["istanbul-lib-coverage", "2.0.3"],
        ["make-dir", "1.3.0"],
        ["rimraf", "2.6.3"],
        ["source-map", "0.6.1"],
        ["istanbul-lib-source-maps", "3.0.2"],
      ]),
    }],
  ])],
  ["istanbul-reports", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-istanbul-reports-2.1.1-72ef16b4ecb9a4a7bd0e2001e00f95d1eec8afa9/node_modules/istanbul-reports/"),
      packageDependencies: new Map([
        ["handlebars", "4.1.0"],
        ["istanbul-reports", "2.1.1"],
      ]),
    }],
  ])],
  ["handlebars", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-handlebars-4.1.0-0d6a6f34ff1f63cecec8423aa4169827bf787c3a/node_modules/handlebars/"),
      packageDependencies: new Map([
        ["async", "2.6.2"],
        ["optimist", "0.6.1"],
        ["source-map", "0.6.1"],
        ["uglify-js", "3.4.9"],
        ["handlebars", "4.1.0"],
      ]),
    }],
  ])],
  ["async", new Map([
    ["2.6.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-async-2.6.2-18330ea7e6e313887f5d2f2a904bac6fe4dd5381/node_modules/async/"),
      packageDependencies: new Map([
        ["lodash", "4.17.11"],
        ["async", "2.6.2"],
      ]),
    }],
  ])],
  ["optimist", new Map([
    ["0.6.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-optimist-0.6.1-da3ea74686fa21a19a111c326e90eb15a0196686/node_modules/optimist/"),
      packageDependencies: new Map([
        ["minimist", "0.0.10"],
        ["wordwrap", "0.0.3"],
        ["optimist", "0.6.1"],
      ]),
    }],
  ])],
  ["uglify-js", new Map([
    ["3.4.9", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-uglify-js-3.4.9-af02f180c1207d76432e473ed24a28f4a782bae3/node_modules/uglify-js/"),
      packageDependencies: new Map([
        ["commander", "2.17.1"],
        ["source-map", "0.6.1"],
        ["uglify-js", "3.4.9"],
      ]),
    }],
  ])],
  ["commander", new Map([
    ["2.17.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-commander-2.17.1-bd77ab7de6de94205ceacc72f1716d29f20a77bf/node_modules/commander/"),
      packageDependencies: new Map([
        ["commander", "2.17.1"],
      ]),
    }],
  ])],
  ["jest-resolve", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-resolve-24.8.0-84b8e5408c1f6a11539793e2b5feb1b6e722439f/node_modules/jest-resolve/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["browser-resolve", "1.11.3"],
        ["chalk", "2.4.2"],
        ["jest-pnp-resolver", "1.2.1"],
        ["realpath-native", "1.1.0"],
        ["jest-resolve", "24.8.0"],
      ]),
    }],
  ])],
  ["browser-resolve", new Map([
    ["1.11.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-browser-resolve-1.11.3-9b7cbb3d0f510e4cb86bdbd796124d28b5890af6/node_modules/browser-resolve/"),
      packageDependencies: new Map([
        ["resolve", "1.1.7"],
        ["browser-resolve", "1.11.3"],
      ]),
    }],
  ])],
  ["jest-pnp-resolver", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-pnp-resolver-1.2.1-ecdae604c077a7fbc70defb6d517c3c1c898923a/node_modules/jest-pnp-resolver/"),
      packageDependencies: new Map([
        ["jest-pnp-resolver", "1.2.1"],
      ]),
    }],
  ])],
  ["jest-runtime", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-runtime-24.8.0-05f94d5b05c21f6dc54e427cd2e4980923350620/node_modules/jest-runtime/"),
      packageDependencies: new Map([
        ["@jest/console", "24.7.1"],
        ["@jest/environment", "24.8.0"],
        ["@jest/source-map", "24.3.0"],
        ["@jest/transform", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["@types/yargs", "12.0.9"],
        ["chalk", "2.4.2"],
        ["exit", "0.1.2"],
        ["glob", "7.1.3"],
        ["graceful-fs", "4.1.15"],
        ["jest-config", "24.8.0"],
        ["jest-haste-map", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-mock", "24.8.0"],
        ["jest-regex-util", "24.3.0"],
        ["jest-resolve", "24.8.0"],
        ["jest-snapshot", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-validate", "24.8.0"],
        ["realpath-native", "1.1.0"],
        ["slash", "2.0.0"],
        ["strip-bom", "3.0.0"],
        ["yargs", "12.0.5"],
        ["jest-runtime", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-config", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-config-24.8.0-77db3d265a6f726294687cbbccc36f8a76ee0f4f/node_modules/jest-config/"),
      packageDependencies: new Map([
        ["@babel/core", "7.3.4"],
        ["@jest/test-sequencer", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["babel-jest", "24.8.0"],
        ["chalk", "2.4.2"],
        ["glob", "7.1.3"],
        ["jest-environment-jsdom", "24.8.0"],
        ["jest-environment-node", "24.8.0"],
        ["jest-get-type", "24.8.0"],
        ["jest-jasmine2", "24.8.0"],
        ["jest-regex-util", "24.3.0"],
        ["jest-resolve", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-validate", "24.8.0"],
        ["micromatch", "3.1.10"],
        ["pretty-format", "24.8.0"],
        ["realpath-native", "1.1.0"],
        ["jest-config", "24.8.0"],
      ]),
    }],
  ])],
  ["@jest/test-sequencer", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@jest-test-sequencer-24.8.0-2f993bcf6ef5eb4e65e8233a95a3320248cf994b/node_modules/@jest/test-sequencer/"),
      packageDependencies: new Map([
        ["@jest/test-result", "24.8.0"],
        ["jest-haste-map", "24.8.0"],
        ["jest-runner", "24.8.0"],
        ["jest-runtime", "24.8.0"],
        ["@jest/test-sequencer", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-runner", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-runner-24.8.0-4f9ae07b767db27b740d7deffad0cf67ccb4c5bb/node_modules/jest-runner/"),
      packageDependencies: new Map([
        ["@jest/console", "24.7.1"],
        ["@jest/environment", "24.8.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["chalk", "2.4.2"],
        ["exit", "0.1.2"],
        ["graceful-fs", "4.1.15"],
        ["jest-config", "24.8.0"],
        ["jest-docblock", "24.3.0"],
        ["jest-haste-map", "24.8.0"],
        ["jest-jasmine2", "24.8.0"],
        ["jest-leak-detector", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-resolve", "24.8.0"],
        ["jest-runtime", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-worker", "24.6.0"],
        ["source-map-support", "0.5.10"],
        ["throat", "4.1.0"],
        ["jest-runner", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-docblock", new Map([
    ["24.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-docblock-24.3.0-b9c32dac70f72e4464520d2ba4aec02ab14db5dd/node_modules/jest-docblock/"),
      packageDependencies: new Map([
        ["detect-newline", "2.1.0"],
        ["jest-docblock", "24.3.0"],
      ]),
    }],
  ])],
  ["detect-newline", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-detect-newline-2.1.0-f41f1c10be4b00e87b5f13da680759f2c5bfd3e2/node_modules/detect-newline/"),
      packageDependencies: new Map([
        ["detect-newline", "2.1.0"],
      ]),
    }],
  ])],
  ["jest-jasmine2", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-jasmine2-24.8.0-a9c7e14c83dd77d8b15e820549ce8987cc8cd898/node_modules/jest-jasmine2/"),
      packageDependencies: new Map([
        ["@babel/traverse", "7.3.4"],
        ["@jest/environment", "24.8.0"],
        ["@jest/test-result", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["chalk", "2.4.2"],
        ["co", "4.6.0"],
        ["expect", "24.8.0"],
        ["is-generator-fn", "2.0.0"],
        ["jest-each", "24.8.0"],
        ["jest-matcher-utils", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-runtime", "24.8.0"],
        ["jest-snapshot", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["pretty-format", "24.8.0"],
        ["throat", "4.1.0"],
        ["jest-jasmine2", "24.8.0"],
      ]),
    }],
  ])],
  ["co", new Map([
    ["4.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-co-4.6.0-6ea6bdf3d853ae54ccb8e47bfa0bf3f9031fb184/node_modules/co/"),
      packageDependencies: new Map([
        ["co", "4.6.0"],
      ]),
    }],
  ])],
  ["expect", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-expect-24.8.0-471f8ec256b7b6129ca2524b2a62f030df38718d/node_modules/expect/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["ansi-styles", "3.2.1"],
        ["jest-get-type", "24.8.0"],
        ["jest-matcher-utils", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-regex-util", "24.3.0"],
        ["expect", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-get-type", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-get-type-24.8.0-a7440de30b651f5a70ea3ed7ff073a32dfe646fc/node_modules/jest-get-type/"),
      packageDependencies: new Map([
        ["jest-get-type", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-matcher-utils", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-matcher-utils-24.8.0-2bce42204c9af12bde46f83dc839efe8be832495/node_modules/jest-matcher-utils/"),
      packageDependencies: new Map([
        ["chalk", "2.4.2"],
        ["jest-diff", "24.8.0"],
        ["jest-get-type", "24.8.0"],
        ["pretty-format", "24.8.0"],
        ["jest-matcher-utils", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-diff", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-diff-24.8.0-146435e7d1e3ffdf293d53ff97e193f1d1546172/node_modules/jest-diff/"),
      packageDependencies: new Map([
        ["chalk", "2.4.2"],
        ["diff-sequences", "24.3.0"],
        ["jest-get-type", "24.8.0"],
        ["pretty-format", "24.8.0"],
        ["jest-diff", "24.8.0"],
      ]),
    }],
  ])],
  ["diff-sequences", new Map([
    ["24.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-diff-sequences-24.3.0-0f20e8a1df1abddaf4d9c226680952e64118b975/node_modules/diff-sequences/"),
      packageDependencies: new Map([
        ["diff-sequences", "24.3.0"],
      ]),
    }],
  ])],
  ["pretty-format", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pretty-format-24.8.0-8dae7044f58db7cb8be245383b565a963e3c27f2/node_modules/pretty-format/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["ansi-regex", "4.0.0"],
        ["ansi-styles", "3.2.1"],
        ["react-is", "16.8.4"],
        ["pretty-format", "24.8.0"],
      ]),
    }],
  ])],
  ["react-is", new Map([
    ["16.8.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-react-is-16.8.4-90f336a68c3a29a096a3d648ab80e87ec61482a2/node_modules/react-is/"),
      packageDependencies: new Map([
        ["react-is", "16.8.4"],
      ]),
    }],
  ])],
  ["is-generator-fn", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-generator-fn-2.0.0-038c31b774709641bda678b1f06a4e3227c10b3e/node_modules/is-generator-fn/"),
      packageDependencies: new Map([
        ["is-generator-fn", "2.0.0"],
      ]),
    }],
  ])],
  ["jest-each", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-each-24.8.0-a05fd2bf94ddc0b1da66c6d13ec2457f35e52775/node_modules/jest-each/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["chalk", "2.4.2"],
        ["jest-get-type", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["pretty-format", "24.8.0"],
        ["jest-each", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-snapshot", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-snapshot-24.8.0-3bec6a59da2ff7bc7d097a853fb67f9d415cb7c6/node_modules/jest-snapshot/"),
      packageDependencies: new Map([
        ["@babel/types", "7.3.4"],
        ["@jest/types", "24.8.0"],
        ["chalk", "2.4.2"],
        ["expect", "24.8.0"],
        ["jest-diff", "24.8.0"],
        ["jest-matcher-utils", "24.8.0"],
        ["jest-message-util", "24.8.0"],
        ["jest-resolve", "24.8.0"],
        ["mkdirp", "0.5.1"],
        ["natural-compare", "1.4.0"],
        ["pretty-format", "24.8.0"],
        ["semver", "5.6.0"],
        ["jest-snapshot", "24.8.0"],
      ]),
    }],
  ])],
  ["throat", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-throat-4.1.0-89037cbc92c56ab18926e6ba4cbb200e15672a6a/node_modules/throat/"),
      packageDependencies: new Map([
        ["throat", "4.1.0"],
      ]),
    }],
  ])],
  ["jest-leak-detector", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-leak-detector-24.8.0-c0086384e1f650c2d8348095df769f29b48e6980/node_modules/jest-leak-detector/"),
      packageDependencies: new Map([
        ["pretty-format", "24.8.0"],
        ["jest-leak-detector", "24.8.0"],
      ]),
    }],
  ])],
  ["source-map-support", new Map([
    ["0.5.10", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-source-map-support-0.5.10-2214080bc9d51832511ee2bab96e3c2f9353120c/node_modules/source-map-support/"),
      packageDependencies: new Map([
        ["buffer-from", "1.1.1"],
        ["source-map", "0.6.1"],
        ["source-map-support", "0.5.10"],
      ]),
    }],
  ])],
  ["buffer-from", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-buffer-from-1.1.1-32713bc028f75c02fdb710d7c7bcec1f2c6070ef/node_modules/buffer-from/"),
      packageDependencies: new Map([
        ["buffer-from", "1.1.1"],
      ]),
    }],
  ])],
  ["babel-jest", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-babel-jest-24.8.0-5c15ff2b28e20b0f45df43fe6b7f2aae93dba589/node_modules/babel-jest/"),
      packageDependencies: new Map([
        ["@babel/core", "7.3.4"],
        ["@jest/transform", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["@types/babel__core", "7.1.0"],
        ["babel-plugin-istanbul", "5.1.1"],
        ["babel-preset-jest", "24.6.0"],
        ["chalk", "2.4.2"],
        ["slash", "2.0.0"],
        ["babel-jest", "24.8.0"],
      ]),
    }],
  ])],
  ["@types/babel__core", new Map([
    ["7.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-babel-core-7.1.0-710f2487dda4dcfd010ca6abb2b4dc7394365c51/node_modules/@types/babel__core/"),
      packageDependencies: new Map([
        ["@babel/parser", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["@types/babel__generator", "7.0.2"],
        ["@types/babel__template", "7.0.2"],
        ["@types/babel__traverse", "7.0.6"],
        ["@types/babel__core", "7.1.0"],
      ]),
    }],
  ])],
  ["@types/babel__generator", new Map([
    ["7.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-babel-generator-7.0.2-d2112a6b21fad600d7674274293c85dce0cb47fc/node_modules/@types/babel__generator/"),
      packageDependencies: new Map([
        ["@babel/types", "7.3.4"],
        ["@types/babel__generator", "7.0.2"],
      ]),
    }],
  ])],
  ["@types/babel__template", new Map([
    ["7.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-babel-template-7.0.2-4ff63d6b52eddac1de7b975a5223ed32ecea9307/node_modules/@types/babel__template/"),
      packageDependencies: new Map([
        ["@babel/parser", "7.3.4"],
        ["@babel/types", "7.3.4"],
        ["@types/babel__template", "7.0.2"],
      ]),
    }],
  ])],
  ["@types/babel__traverse", new Map([
    ["7.0.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@types-babel-traverse-7.0.6-328dd1a8fc4cfe3c8458be9477b219ea158fd7b2/node_modules/@types/babel__traverse/"),
      packageDependencies: new Map([
        ["@babel/types", "7.3.4"],
        ["@types/babel__traverse", "7.0.6"],
      ]),
    }],
  ])],
  ["babel-preset-jest", new Map([
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-babel-preset-jest-24.6.0-66f06136eefce87797539c0d63f1769cc3915984/node_modules/babel-preset-jest/"),
      packageDependencies: new Map([
        ["@babel/core", "7.3.4"],
        ["@babel/plugin-syntax-object-rest-spread", "7.2.0"],
        ["babel-plugin-jest-hoist", "24.6.0"],
        ["babel-preset-jest", "24.6.0"],
      ]),
    }],
  ])],
  ["@babel/plugin-syntax-object-rest-spread", new Map([
    ["7.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-plugin-syntax-object-rest-spread-7.2.0-3b7a3e733510c57e820b9142a6579ac8b0dfad2e/node_modules/@babel/plugin-syntax-object-rest-spread/"),
      packageDependencies: new Map([
        ["@babel/core", "7.3.4"],
        ["@babel/helper-plugin-utils", "7.0.0"],
        ["@babel/plugin-syntax-object-rest-spread", "7.2.0"],
      ]),
    }],
  ])],
  ["@babel/helper-plugin-utils", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-@babel-helper-plugin-utils-7.0.0-bbb3fbee98661c569034237cc03967ba99b4f250/node_modules/@babel/helper-plugin-utils/"),
      packageDependencies: new Map([
        ["@babel/helper-plugin-utils", "7.0.0"],
      ]),
    }],
  ])],
  ["babel-plugin-jest-hoist", new Map([
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-babel-plugin-jest-hoist-24.6.0-f7f7f7ad150ee96d7a5e8e2c5da8319579e78019/node_modules/babel-plugin-jest-hoist/"),
      packageDependencies: new Map([
        ["@types/babel__traverse", "7.0.6"],
        ["babel-plugin-jest-hoist", "24.6.0"],
      ]),
    }],
  ])],
  ["jest-environment-jsdom", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-environment-jsdom-24.8.0-300f6949a146cabe1c9357ad9e9ecf9f43f38857/node_modules/jest-environment-jsdom/"),
      packageDependencies: new Map([
        ["@jest/environment", "24.8.0"],
        ["@jest/fake-timers", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["jest-mock", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jsdom", "11.12.0"],
        ["jest-environment-jsdom", "24.8.0"],
      ]),
    }],
  ])],
  ["jsdom", new Map([
    ["11.12.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jsdom-11.12.0-1a80d40ddd378a1de59656e9e6dc5a3ba8657bc8/node_modules/jsdom/"),
      packageDependencies: new Map([
        ["abab", "2.0.0"],
        ["acorn", "5.7.3"],
        ["acorn-globals", "4.3.0"],
        ["array-equal", "1.0.0"],
        ["cssom", "0.3.6"],
        ["cssstyle", "1.2.1"],
        ["data-urls", "1.1.0"],
        ["domexception", "1.0.1"],
        ["escodegen", "1.11.1"],
        ["html-encoding-sniffer", "1.0.2"],
        ["left-pad", "1.3.0"],
        ["nwsapi", "2.1.1"],
        ["parse5", "4.0.0"],
        ["pn", "1.1.0"],
        ["request", "2.88.0"],
        ["request-promise-native", "1.0.7"],
        ["sax", "1.2.4"],
        ["symbol-tree", "3.2.2"],
        ["tough-cookie", "2.5.0"],
        ["w3c-hr-time", "1.0.1"],
        ["webidl-conversions", "4.0.2"],
        ["whatwg-encoding", "1.0.5"],
        ["whatwg-mimetype", "2.3.0"],
        ["whatwg-url", "6.5.0"],
        ["ws", "5.2.2"],
        ["xml-name-validator", "3.0.0"],
        ["jsdom", "11.12.0"],
      ]),
    }],
  ])],
  ["abab", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-abab-2.0.0-aba0ab4c5eee2d4c79d3487d85450fb2376ebb0f/node_modules/abab/"),
      packageDependencies: new Map([
        ["abab", "2.0.0"],
      ]),
    }],
  ])],
  ["acorn-globals", new Map([
    ["4.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-acorn-globals-4.3.0-e3b6f8da3c1552a95ae627571f7dd6923bb54103/node_modules/acorn-globals/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
        ["acorn-walk", "6.1.1"],
        ["acorn-globals", "4.3.0"],
      ]),
    }],
  ])],
  ["acorn-walk", new Map([
    ["6.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-acorn-walk-6.1.1-d363b66f5fac5f018ff9c3a1e7b6f8e310cc3913/node_modules/acorn-walk/"),
      packageDependencies: new Map([
        ["acorn-walk", "6.1.1"],
      ]),
    }],
  ])],
  ["array-equal", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-array-equal-1.0.0-8c2a5ef2472fd9ea742b04c77a75093ba2757c93/node_modules/array-equal/"),
      packageDependencies: new Map([
        ["array-equal", "1.0.0"],
      ]),
    }],
  ])],
  ["cssom", new Map([
    ["0.3.6", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cssom-0.3.6-f85206cee04efa841f3c5982a74ba96ab20d65ad/node_modules/cssom/"),
      packageDependencies: new Map([
        ["cssom", "0.3.6"],
      ]),
    }],
  ])],
  ["cssstyle", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cssstyle-1.2.1-3aceb2759eaf514ac1a21628d723d6043a819495/node_modules/cssstyle/"),
      packageDependencies: new Map([
        ["cssom", "0.3.6"],
        ["cssstyle", "1.2.1"],
      ]),
    }],
  ])],
  ["data-urls", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-data-urls-1.1.0-15ee0582baa5e22bb59c77140da8f9c76963bbfe/node_modules/data-urls/"),
      packageDependencies: new Map([
        ["abab", "2.0.0"],
        ["whatwg-mimetype", "2.3.0"],
        ["whatwg-url", "7.0.0"],
        ["data-urls", "1.1.0"],
      ]),
    }],
  ])],
  ["whatwg-mimetype", new Map([
    ["2.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-whatwg-mimetype-2.3.0-3d4b1e0312d2079879f826aff18dbeeca5960fbf/node_modules/whatwg-mimetype/"),
      packageDependencies: new Map([
        ["whatwg-mimetype", "2.3.0"],
      ]),
    }],
  ])],
  ["whatwg-url", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-whatwg-url-7.0.0-fde926fa54a599f3adf82dff25a9f7be02dc6edd/node_modules/whatwg-url/"),
      packageDependencies: new Map([
        ["lodash.sortby", "4.7.0"],
        ["tr46", "1.0.1"],
        ["webidl-conversions", "4.0.2"],
        ["whatwg-url", "7.0.0"],
      ]),
    }],
    ["6.5.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-whatwg-url-6.5.0-f2df02bff176fd65070df74ad5ccbb5a199965a8/node_modules/whatwg-url/"),
      packageDependencies: new Map([
        ["lodash.sortby", "4.7.0"],
        ["tr46", "1.0.1"],
        ["webidl-conversions", "4.0.2"],
        ["whatwg-url", "6.5.0"],
      ]),
    }],
  ])],
  ["lodash.sortby", new Map([
    ["4.7.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-lodash-sortby-4.7.0-edd14c824e2cc9c1e0b0a1b42bb5210516a42438/node_modules/lodash.sortby/"),
      packageDependencies: new Map([
        ["lodash.sortby", "4.7.0"],
      ]),
    }],
  ])],
  ["tr46", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tr46-1.0.1-a8b13fd6bfd2489519674ccde55ba3693b706d09/node_modules/tr46/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
        ["tr46", "1.0.1"],
      ]),
    }],
  ])],
  ["webidl-conversions", new Map([
    ["4.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-webidl-conversions-4.0.2-a855980b1f0b6b359ba1d5d9fb39ae941faa63ad/node_modules/webidl-conversions/"),
      packageDependencies: new Map([
        ["webidl-conversions", "4.0.2"],
      ]),
    }],
  ])],
  ["domexception", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-domexception-1.0.1-937442644ca6a31261ef36e3ec677fe805582c90/node_modules/domexception/"),
      packageDependencies: new Map([
        ["webidl-conversions", "4.0.2"],
        ["domexception", "1.0.1"],
      ]),
    }],
  ])],
  ["escodegen", new Map([
    ["1.11.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-escodegen-1.11.1-c485ff8d6b4cdb89e27f4a856e91f118401ca510/node_modules/escodegen/"),
      packageDependencies: new Map([
        ["esprima", "3.1.3"],
        ["estraverse", "4.2.0"],
        ["esutils", "2.0.2"],
        ["optionator", "0.8.2"],
        ["source-map", "0.6.1"],
        ["escodegen", "1.11.1"],
      ]),
    }],
  ])],
  ["html-encoding-sniffer", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-html-encoding-sniffer-1.0.2-e70d84b94da53aa375e11fe3a351be6642ca46f8/node_modules/html-encoding-sniffer/"),
      packageDependencies: new Map([
        ["whatwg-encoding", "1.0.5"],
        ["html-encoding-sniffer", "1.0.2"],
      ]),
    }],
  ])],
  ["whatwg-encoding", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-whatwg-encoding-1.0.5-5abacf777c32166a51d085d6b4f3e7d27113ddb0/node_modules/whatwg-encoding/"),
      packageDependencies: new Map([
        ["iconv-lite", "0.4.24"],
        ["whatwg-encoding", "1.0.5"],
      ]),
    }],
  ])],
  ["left-pad", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-left-pad-1.3.0-5b8a3a7765dfe001261dde915589e782f8c94d1e/node_modules/left-pad/"),
      packageDependencies: new Map([
        ["left-pad", "1.3.0"],
      ]),
    }],
  ])],
  ["nwsapi", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-nwsapi-2.1.1-08d6d75e69fd791bdea31507ffafe8c843b67e9c/node_modules/nwsapi/"),
      packageDependencies: new Map([
        ["nwsapi", "2.1.1"],
      ]),
    }],
  ])],
  ["parse5", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-parse5-4.0.0-6d78656e3da8d78b4ec0b906f7c08ef1dfe3f608/node_modules/parse5/"),
      packageDependencies: new Map([
        ["parse5", "4.0.0"],
      ]),
    }],
  ])],
  ["pn", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pn-1.1.0-e2f4cef0e219f463c179ab37463e4e1ecdccbafb/node_modules/pn/"),
      packageDependencies: new Map([
        ["pn", "1.1.0"],
      ]),
    }],
  ])],
  ["request", new Map([
    ["2.88.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-request-2.88.0-9c2fca4f7d35b592efe57c7f0a55e81052124fef/node_modules/request/"),
      packageDependencies: new Map([
        ["aws-sign2", "0.7.0"],
        ["aws4", "1.8.0"],
        ["caseless", "0.12.0"],
        ["combined-stream", "1.0.7"],
        ["extend", "3.0.2"],
        ["forever-agent", "0.6.1"],
        ["form-data", "2.3.3"],
        ["har-validator", "5.1.3"],
        ["http-signature", "1.2.0"],
        ["is-typedarray", "1.0.0"],
        ["isstream", "0.1.2"],
        ["json-stringify-safe", "5.0.1"],
        ["mime-types", "2.1.22"],
        ["oauth-sign", "0.9.0"],
        ["performance-now", "2.1.0"],
        ["qs", "6.5.2"],
        ["safe-buffer", "5.1.2"],
        ["tough-cookie", "2.4.3"],
        ["tunnel-agent", "0.6.0"],
        ["uuid", "3.3.2"],
        ["request", "2.88.0"],
      ]),
    }],
  ])],
  ["aws-sign2", new Map([
    ["0.7.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-aws-sign2-0.7.0-b46e890934a9591f2d2f6f86d7e6a9f1b3fe76a8/node_modules/aws-sign2/"),
      packageDependencies: new Map([
        ["aws-sign2", "0.7.0"],
      ]),
    }],
  ])],
  ["aws4", new Map([
    ["1.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-aws4-1.8.0-f0e003d9ca9e7f59c7a508945d7b2ef9a04a542f/node_modules/aws4/"),
      packageDependencies: new Map([
        ["aws4", "1.8.0"],
      ]),
    }],
  ])],
  ["caseless", new Map([
    ["0.12.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-caseless-0.12.0-1b681c21ff84033c826543090689420d187151dc/node_modules/caseless/"),
      packageDependencies: new Map([
        ["caseless", "0.12.0"],
      ]),
    }],
  ])],
  ["combined-stream", new Map([
    ["1.0.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-combined-stream-1.0.7-2d1d24317afb8abe95d6d2c0b07b57813539d828/node_modules/combined-stream/"),
      packageDependencies: new Map([
        ["delayed-stream", "1.0.0"],
        ["combined-stream", "1.0.7"],
      ]),
    }],
  ])],
  ["delayed-stream", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-delayed-stream-1.0.0-df3ae199acadfb7d440aaae0b29e2272b24ec619/node_modules/delayed-stream/"),
      packageDependencies: new Map([
        ["delayed-stream", "1.0.0"],
      ]),
    }],
  ])],
  ["extend", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-extend-3.0.2-f8b1136b4071fbd8eb140aff858b1019ec2915fa/node_modules/extend/"),
      packageDependencies: new Map([
        ["extend", "3.0.2"],
      ]),
    }],
  ])],
  ["forever-agent", new Map([
    ["0.6.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-forever-agent-0.6.1-fbc71f0c41adeb37f96c577ad1ed42d8fdacca91/node_modules/forever-agent/"),
      packageDependencies: new Map([
        ["forever-agent", "0.6.1"],
      ]),
    }],
  ])],
  ["form-data", new Map([
    ["2.3.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-form-data-2.3.3-dcce52c05f644f298c6a7ab936bd724ceffbf3a6/node_modules/form-data/"),
      packageDependencies: new Map([
        ["asynckit", "0.4.0"],
        ["combined-stream", "1.0.7"],
        ["mime-types", "2.1.22"],
        ["form-data", "2.3.3"],
      ]),
    }],
  ])],
  ["asynckit", new Map([
    ["0.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-asynckit-0.4.0-c79ed97f7f34cb8f2ba1bc9790bcc366474b4b79/node_modules/asynckit/"),
      packageDependencies: new Map([
        ["asynckit", "0.4.0"],
      ]),
    }],
  ])],
  ["mime-types", new Map([
    ["2.1.22", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mime-types-2.1.22-fe6b355a190926ab7698c9a0556a11199b2199bd/node_modules/mime-types/"),
      packageDependencies: new Map([
        ["mime-db", "1.38.0"],
        ["mime-types", "2.1.22"],
      ]),
    }],
  ])],
  ["mime-db", new Map([
    ["1.38.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mime-db-1.38.0-1a2aab16da9eb167b49c6e4df2d9c68d63d8e2ad/node_modules/mime-db/"),
      packageDependencies: new Map([
        ["mime-db", "1.38.0"],
      ]),
    }],
  ])],
  ["har-validator", new Map([
    ["5.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-har-validator-5.1.3-1ef89ebd3e4996557675eed9893110dc350fa080/node_modules/har-validator/"),
      packageDependencies: new Map([
        ["ajv", "6.9.2"],
        ["har-schema", "2.0.0"],
        ["har-validator", "5.1.3"],
      ]),
    }],
  ])],
  ["har-schema", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-har-schema-2.0.0-a94c2224ebcac04782a0d9035521f24735b7ec92/node_modules/har-schema/"),
      packageDependencies: new Map([
        ["har-schema", "2.0.0"],
      ]),
    }],
  ])],
  ["http-signature", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-http-signature-1.2.0-9aecd925114772f3d95b65a60abb8f7c18fbace1/node_modules/http-signature/"),
      packageDependencies: new Map([
        ["assert-plus", "1.0.0"],
        ["jsprim", "1.4.1"],
        ["sshpk", "1.16.1"],
        ["http-signature", "1.2.0"],
      ]),
    }],
  ])],
  ["assert-plus", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-assert-plus-1.0.0-f12e0f3c5d77b0b1cdd9146942e4e96c1e4dd525/node_modules/assert-plus/"),
      packageDependencies: new Map([
        ["assert-plus", "1.0.0"],
      ]),
    }],
  ])],
  ["jsprim", new Map([
    ["1.4.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jsprim-1.4.1-313e66bc1e5cc06e438bc1b7499c2e5c56acb6a2/node_modules/jsprim/"),
      packageDependencies: new Map([
        ["assert-plus", "1.0.0"],
        ["extsprintf", "1.3.0"],
        ["json-schema", "0.2.3"],
        ["verror", "1.10.0"],
        ["jsprim", "1.4.1"],
      ]),
    }],
  ])],
  ["extsprintf", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-extsprintf-1.3.0-96918440e3041a7a414f8c52e3c574eb3c3e1e05/node_modules/extsprintf/"),
      packageDependencies: new Map([
        ["extsprintf", "1.3.0"],
      ]),
    }],
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-extsprintf-1.4.0-e2689f8f356fad62cca65a3a91c5df5f9551692f/node_modules/extsprintf/"),
      packageDependencies: new Map([
        ["extsprintf", "1.4.0"],
      ]),
    }],
  ])],
  ["json-schema", new Map([
    ["0.2.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-json-schema-0.2.3-b480c892e59a2f05954ce727bd3f2a4e882f9e13/node_modules/json-schema/"),
      packageDependencies: new Map([
        ["json-schema", "0.2.3"],
      ]),
    }],
  ])],
  ["verror", new Map([
    ["1.10.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-verror-1.10.0-3a105ca17053af55d6e270c1f8288682e18da400/node_modules/verror/"),
      packageDependencies: new Map([
        ["assert-plus", "1.0.0"],
        ["core-util-is", "1.0.2"],
        ["extsprintf", "1.4.0"],
        ["verror", "1.10.0"],
      ]),
    }],
  ])],
  ["sshpk", new Map([
    ["1.16.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-sshpk-1.16.1-fb661c0bef29b39db40769ee39fa70093d6f6877/node_modules/sshpk/"),
      packageDependencies: new Map([
        ["asn1", "0.2.4"],
        ["assert-plus", "1.0.0"],
        ["bcrypt-pbkdf", "1.0.2"],
        ["dashdash", "1.14.1"],
        ["ecc-jsbn", "0.1.2"],
        ["getpass", "0.1.7"],
        ["jsbn", "0.1.1"],
        ["safer-buffer", "2.1.2"],
        ["tweetnacl", "0.14.5"],
        ["sshpk", "1.16.1"],
      ]),
    }],
  ])],
  ["asn1", new Map([
    ["0.2.4", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-asn1-0.2.4-8d2475dfab553bb33e77b54e59e880bb8ce23136/node_modules/asn1/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
        ["asn1", "0.2.4"],
      ]),
    }],
  ])],
  ["bcrypt-pbkdf", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-bcrypt-pbkdf-1.0.2-a4301d389b6a43f9b67ff3ca11a3f6637e360e9e/node_modules/bcrypt-pbkdf/"),
      packageDependencies: new Map([
        ["tweetnacl", "0.14.5"],
        ["bcrypt-pbkdf", "1.0.2"],
      ]),
    }],
  ])],
  ["tweetnacl", new Map([
    ["0.14.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tweetnacl-0.14.5-5ae68177f192d4456269d108afa93ff8743f4f64/node_modules/tweetnacl/"),
      packageDependencies: new Map([
        ["tweetnacl", "0.14.5"],
      ]),
    }],
  ])],
  ["dashdash", new Map([
    ["1.14.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-dashdash-1.14.1-853cfa0f7cbe2fed5de20326b8dd581035f6e2f0/node_modules/dashdash/"),
      packageDependencies: new Map([
        ["assert-plus", "1.0.0"],
        ["dashdash", "1.14.1"],
      ]),
    }],
  ])],
  ["ecc-jsbn", new Map([
    ["0.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ecc-jsbn-0.1.2-3a83a904e54353287874c564b7549386849a98c9/node_modules/ecc-jsbn/"),
      packageDependencies: new Map([
        ["jsbn", "0.1.1"],
        ["safer-buffer", "2.1.2"],
        ["ecc-jsbn", "0.1.2"],
      ]),
    }],
  ])],
  ["jsbn", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jsbn-0.1.1-a5e654c2e5a2deb5f201d96cefbca80c0ef2f513/node_modules/jsbn/"),
      packageDependencies: new Map([
        ["jsbn", "0.1.1"],
      ]),
    }],
  ])],
  ["getpass", new Map([
    ["0.1.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-getpass-0.1.7-5eff8e3e684d569ae4cb2b1282604e8ba62149fa/node_modules/getpass/"),
      packageDependencies: new Map([
        ["assert-plus", "1.0.0"],
        ["getpass", "0.1.7"],
      ]),
    }],
  ])],
  ["is-typedarray", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-typedarray-1.0.0-e479c80858df0c1b11ddda6940f96011fcda4a9a/node_modules/is-typedarray/"),
      packageDependencies: new Map([
        ["is-typedarray", "1.0.0"],
      ]),
    }],
  ])],
  ["isstream", new Map([
    ["0.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-isstream-0.1.2-47e63f7af55afa6f92e1500e690eb8b8529c099a/node_modules/isstream/"),
      packageDependencies: new Map([
        ["isstream", "0.1.2"],
      ]),
    }],
  ])],
  ["json-stringify-safe", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-json-stringify-safe-5.0.1-1296a2d58fd45f19a0f6ce01d65701e2c735b6eb/node_modules/json-stringify-safe/"),
      packageDependencies: new Map([
        ["json-stringify-safe", "5.0.1"],
      ]),
    }],
  ])],
  ["oauth-sign", new Map([
    ["0.9.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-oauth-sign-0.9.0-47a7b016baa68b5fa0ecf3dee08a85c679ac6455/node_modules/oauth-sign/"),
      packageDependencies: new Map([
        ["oauth-sign", "0.9.0"],
      ]),
    }],
  ])],
  ["performance-now", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-performance-now-2.1.0-6309f4e0e5fa913ec1c69307ae364b4b377c9e7b/node_modules/performance-now/"),
      packageDependencies: new Map([
        ["performance-now", "2.1.0"],
      ]),
    }],
  ])],
  ["qs", new Map([
    ["6.5.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-qs-6.5.2-cb3ae806e8740444584ef154ce8ee98d403f3e36/node_modules/qs/"),
      packageDependencies: new Map([
        ["qs", "6.5.2"],
      ]),
    }],
  ])],
  ["tough-cookie", new Map([
    ["2.4.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tough-cookie-2.4.3-53f36da3f47783b0925afa06ff9f3b165280f781/node_modules/tough-cookie/"),
      packageDependencies: new Map([
        ["psl", "1.1.31"],
        ["punycode", "1.4.1"],
        ["tough-cookie", "2.4.3"],
      ]),
    }],
    ["2.5.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tough-cookie-2.5.0-cd9fb2a0aa1d5a12b473bd9fb96fa3dcff65ade2/node_modules/tough-cookie/"),
      packageDependencies: new Map([
        ["psl", "1.1.31"],
        ["punycode", "2.1.1"],
        ["tough-cookie", "2.5.0"],
      ]),
    }],
  ])],
  ["psl", new Map([
    ["1.1.31", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-psl-1.1.31-e9aa86d0101b5b105cbe93ac6b784cd547276184/node_modules/psl/"),
      packageDependencies: new Map([
        ["psl", "1.1.31"],
      ]),
    }],
  ])],
  ["tunnel-agent", new Map([
    ["0.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-tunnel-agent-0.6.0-27a5dea06b36b04a0a9966774b290868f0fc40fd/node_modules/tunnel-agent/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["tunnel-agent", "0.6.0"],
      ]),
    }],
  ])],
  ["uuid", new Map([
    ["3.3.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-uuid-3.3.2-1b4af4955eb3077c501c23872fc6513811587131/node_modules/uuid/"),
      packageDependencies: new Map([
        ["uuid", "3.3.2"],
      ]),
    }],
  ])],
  ["request-promise-native", new Map([
    ["1.0.7", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-request-promise-native-1.0.7-a49868a624bdea5069f1251d0a836e0d89aa2c59/node_modules/request-promise-native/"),
      packageDependencies: new Map([
        ["request", "2.88.0"],
        ["request-promise-core", "1.1.2"],
        ["stealthy-require", "1.1.1"],
        ["tough-cookie", "2.5.0"],
        ["request-promise-native", "1.0.7"],
      ]),
    }],
  ])],
  ["request-promise-core", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-request-promise-core-1.1.2-339f6aababcafdb31c799ff158700336301d3346/node_modules/request-promise-core/"),
      packageDependencies: new Map([
        ["request", "2.88.0"],
        ["lodash", "4.17.11"],
        ["request-promise-core", "1.1.2"],
      ]),
    }],
  ])],
  ["stealthy-require", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-stealthy-require-1.1.1-35b09875b4ff49f26a777e509b3090a3226bf24b/node_modules/stealthy-require/"),
      packageDependencies: new Map([
        ["stealthy-require", "1.1.1"],
      ]),
    }],
  ])],
  ["symbol-tree", new Map([
    ["3.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-symbol-tree-3.2.2-ae27db38f660a7ae2e1c3b7d1bc290819b8519e6/node_modules/symbol-tree/"),
      packageDependencies: new Map([
        ["symbol-tree", "3.2.2"],
      ]),
    }],
  ])],
  ["w3c-hr-time", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-w3c-hr-time-1.0.1-82ac2bff63d950ea9e3189a58a65625fedf19045/node_modules/w3c-hr-time/"),
      packageDependencies: new Map([
        ["browser-process-hrtime", "0.1.3"],
        ["w3c-hr-time", "1.0.1"],
      ]),
    }],
  ])],
  ["browser-process-hrtime", new Map([
    ["0.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-browser-process-hrtime-0.1.3-616f00faef1df7ec1b5bf9cfe2bdc3170f26c7b4/node_modules/browser-process-hrtime/"),
      packageDependencies: new Map([
        ["browser-process-hrtime", "0.1.3"],
      ]),
    }],
  ])],
  ["ws", new Map([
    ["5.2.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-ws-5.2.2-dffef14866b8e8dc9133582514d1befaf96e980f/node_modules/ws/"),
      packageDependencies: new Map([
        ["async-limiter", "1.0.0"],
        ["ws", "5.2.2"],
      ]),
    }],
  ])],
  ["async-limiter", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-async-limiter-1.0.0-78faed8c3d074ab81f22b4e985d79e8738f720f8/node_modules/async-limiter/"),
      packageDependencies: new Map([
        ["async-limiter", "1.0.0"],
      ]),
    }],
  ])],
  ["xml-name-validator", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-xml-name-validator-3.0.0-6ae73e06de4d8c6e47f9fb181f78d648ad457c6a/node_modules/xml-name-validator/"),
      packageDependencies: new Map([
        ["xml-name-validator", "3.0.0"],
      ]),
    }],
  ])],
  ["jest-environment-node", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-environment-node-24.8.0-d3f726ba8bc53087a60e7a84ca08883a4c892231/node_modules/jest-environment-node/"),
      packageDependencies: new Map([
        ["@jest/environment", "24.8.0"],
        ["@jest/fake-timers", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["jest-mock", "24.8.0"],
        ["jest-util", "24.8.0"],
        ["jest-environment-node", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-validate", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-validate-24.8.0-624c41533e6dfe356ffadc6e2423a35c2d3b4849/node_modules/jest-validate/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["camelcase", "5.0.0"],
        ["chalk", "2.4.2"],
        ["jest-get-type", "24.8.0"],
        ["leven", "2.1.0"],
        ["pretty-format", "24.8.0"],
        ["jest-validate", "24.8.0"],
      ]),
    }],
  ])],
  ["camelcase", new Map([
    ["5.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-camelcase-5.0.0-03295527d58bd3cd4aa75363f35b2e8d97be2f42/node_modules/camelcase/"),
      packageDependencies: new Map([
        ["camelcase", "5.0.0"],
      ]),
    }],
  ])],
  ["leven", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-leven-2.1.0-c2e7a9f772094dee9d34202ae8acce4687875580/node_modules/leven/"),
      packageDependencies: new Map([
        ["leven", "2.1.0"],
      ]),
    }],
  ])],
  ["yargs", new Map([
    ["12.0.5", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-yargs-12.0.5-05f5997b609647b64f66b81e3b4b10a368e7ad13/node_modules/yargs/"),
      packageDependencies: new Map([
        ["cliui", "4.1.0"],
        ["decamelize", "1.2.0"],
        ["find-up", "3.0.0"],
        ["get-caller-file", "1.0.3"],
        ["os-locale", "3.1.0"],
        ["require-directory", "2.1.1"],
        ["require-main-filename", "1.0.1"],
        ["set-blocking", "2.0.0"],
        ["string-width", "2.1.1"],
        ["which-module", "2.0.0"],
        ["y18n", "4.0.0"],
        ["yargs-parser", "11.1.1"],
        ["yargs", "12.0.5"],
      ]),
    }],
  ])],
  ["cliui", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-cliui-4.1.0-348422dbe82d800b3022eef4f6ac10bf2e4d1b49/node_modules/cliui/"),
      packageDependencies: new Map([
        ["string-width", "2.1.1"],
        ["strip-ansi", "4.0.0"],
        ["wrap-ansi", "2.1.0"],
        ["cliui", "4.1.0"],
      ]),
    }],
  ])],
  ["wrap-ansi", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-wrap-ansi-2.1.0-d8fc3d284dd05794fe84973caecdd1cf824fdd85/node_modules/wrap-ansi/"),
      packageDependencies: new Map([
        ["string-width", "1.0.2"],
        ["strip-ansi", "3.0.1"],
        ["wrap-ansi", "2.1.0"],
      ]),
    }],
  ])],
  ["decamelize", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-decamelize-1.2.0-f6534d15148269b20352e7bee26f501f9a191290/node_modules/decamelize/"),
      packageDependencies: new Map([
        ["decamelize", "1.2.0"],
      ]),
    }],
  ])],
  ["get-caller-file", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-get-caller-file-1.0.3-f978fa4c90d1dfe7ff2d6beda2a515e713bdcf4a/node_modules/get-caller-file/"),
      packageDependencies: new Map([
        ["get-caller-file", "1.0.3"],
      ]),
    }],
  ])],
  ["os-locale", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-os-locale-3.1.0-a802a6ee17f24c10483ab9935719cef4ed16bf1a/node_modules/os-locale/"),
      packageDependencies: new Map([
        ["execa", "1.0.0"],
        ["lcid", "2.0.0"],
        ["mem", "4.1.0"],
        ["os-locale", "3.1.0"],
      ]),
    }],
  ])],
  ["lcid", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-lcid-2.0.0-6ef5d2df60e52f82eb228a4c373e8d1f397253cf/node_modules/lcid/"),
      packageDependencies: new Map([
        ["invert-kv", "2.0.0"],
        ["lcid", "2.0.0"],
      ]),
    }],
  ])],
  ["invert-kv", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-invert-kv-2.0.0-7393f5afa59ec9ff5f67a27620d11c226e3eec02/node_modules/invert-kv/"),
      packageDependencies: new Map([
        ["invert-kv", "2.0.0"],
      ]),
    }],
  ])],
  ["mem", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-mem-4.1.0-aeb9be2d21f47e78af29e4ac5978e8afa2ca5b8a/node_modules/mem/"),
      packageDependencies: new Map([
        ["map-age-cleaner", "0.1.3"],
        ["mimic-fn", "1.2.0"],
        ["p-is-promise", "2.0.0"],
        ["mem", "4.1.0"],
      ]),
    }],
  ])],
  ["map-age-cleaner", new Map([
    ["0.1.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-map-age-cleaner-0.1.3-7d583a7306434c055fe474b0f45078e6e1b4b92a/node_modules/map-age-cleaner/"),
      packageDependencies: new Map([
        ["p-defer", "1.0.0"],
        ["map-age-cleaner", "0.1.3"],
      ]),
    }],
  ])],
  ["p-defer", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-defer-1.0.0-9f6eb182f6c9aa8cd743004a7d4f96b196b0fb0c/node_modules/p-defer/"),
      packageDependencies: new Map([
        ["p-defer", "1.0.0"],
      ]),
    }],
  ])],
  ["p-is-promise", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-is-promise-2.0.0-7554e3d572109a87e1f3f53f6a7d85d1b194f4c5/node_modules/p-is-promise/"),
      packageDependencies: new Map([
        ["p-is-promise", "2.0.0"],
      ]),
    }],
  ])],
  ["require-directory", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-require-directory-2.1.1-8c64ad5fd30dab1c976e2344ffe7f792a6a6df42/node_modules/require-directory/"),
      packageDependencies: new Map([
        ["require-directory", "2.1.1"],
      ]),
    }],
  ])],
  ["which-module", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-which-module-2.0.0-d9ef07dce77b9902b8a3a8fa4b31c3e3f7e6e87a/node_modules/which-module/"),
      packageDependencies: new Map([
        ["which-module", "2.0.0"],
      ]),
    }],
  ])],
  ["y18n", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-y18n-4.0.0-95ef94f85ecc81d007c264e190a120f0a3c8566b/node_modules/y18n/"),
      packageDependencies: new Map([
        ["y18n", "4.0.0"],
      ]),
    }],
  ])],
  ["yargs-parser", new Map([
    ["11.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-yargs-parser-11.1.1-879a0865973bca9f6bab5cbdf3b1c67ec7d3bcf4/node_modules/yargs-parser/"),
      packageDependencies: new Map([
        ["camelcase", "5.0.0"],
        ["decamelize", "1.2.0"],
        ["yargs-parser", "11.1.1"],
      ]),
    }],
  ])],
  ["node-notifier", new Map([
    ["5.4.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-node-notifier-5.4.0-7b455fdce9f7de0c63538297354f3db468426e6a/node_modules/node-notifier/"),
      packageDependencies: new Map([
        ["growly", "1.3.0"],
        ["is-wsl", "1.1.0"],
        ["semver", "5.6.0"],
        ["shellwords", "0.1.1"],
        ["which", "1.3.1"],
        ["node-notifier", "5.4.0"],
      ]),
    }],
  ])],
  ["growly", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-growly-1.3.0-f10748cbe76af964b7c96c93c6bcc28af120c081/node_modules/growly/"),
      packageDependencies: new Map([
        ["growly", "1.3.0"],
      ]),
    }],
  ])],
  ["is-wsl", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-is-wsl-1.1.0-1f16e4aa22b04d1336b66188a66af3c600c3a66d/node_modules/is-wsl/"),
      packageDependencies: new Map([
        ["is-wsl", "1.1.0"],
      ]),
    }],
  ])],
  ["shellwords", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-shellwords-0.1.1-d6b9181c1a48d397324c84871efbcfc73fc0654b/node_modules/shellwords/"),
      packageDependencies: new Map([
        ["shellwords", "0.1.1"],
      ]),
    }],
  ])],
  ["string-length", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-string-length-2.0.0-d40dbb686a3ace960c1cffca562bf2c45f8363ed/node_modules/string-length/"),
      packageDependencies: new Map([
        ["astral-regex", "1.0.0"],
        ["strip-ansi", "4.0.0"],
        ["string-length", "2.0.0"],
      ]),
    }],
  ])],
  ["jest-changed-files", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-changed-files-24.8.0-7e7eb21cf687587a85e50f3d249d1327e15b157b/node_modules/jest-changed-files/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["execa", "1.0.0"],
        ["throat", "4.1.0"],
        ["jest-changed-files", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-resolve-dependencies", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-resolve-dependencies-24.8.0-19eec3241f2045d3f990dba331d0d7526acff8e0/node_modules/jest-resolve-dependencies/"),
      packageDependencies: new Map([
        ["@jest/types", "24.8.0"],
        ["jest-regex-util", "24.3.0"],
        ["jest-snapshot", "24.8.0"],
        ["jest-resolve-dependencies", "24.8.0"],
      ]),
    }],
  ])],
  ["jest-watcher", new Map([
    ["24.8.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-watcher-24.8.0-58d49915ceddd2de85e238f6213cef1c93715de4/node_modules/jest-watcher/"),
      packageDependencies: new Map([
        ["@jest/test-result", "24.8.0"],
        ["@jest/types", "24.8.0"],
        ["@types/yargs", "12.0.9"],
        ["ansi-escapes", "3.2.0"],
        ["chalk", "2.4.2"],
        ["jest-util", "24.8.0"],
        ["string-length", "2.0.0"],
        ["jest-watcher", "24.8.0"],
      ]),
    }],
    ["24.6.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-watcher-24.6.0-f66a49a4c89f60626730121d74e36dc006c53c2f/node_modules/jest-watcher/"),
      packageDependencies: new Map([
        ["@jest/test-result", "24.6.0"],
        ["@jest/types", "24.6.0"],
        ["@types/yargs", "12.0.9"],
        ["ansi-escapes", "3.2.0"],
        ["chalk", "2.4.2"],
        ["jest-util", "24.6.0"],
        ["string-length", "2.0.0"],
        ["jest-watcher", "24.6.0"],
      ]),
    }],
  ])],
  ["p-each-series", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-each-series-1.0.0-930f3d12dd1f50e7434457a22cd6f04ac6ad7f71/node_modules/p-each-series/"),
      packageDependencies: new Map([
        ["p-reduce", "1.0.0"],
        ["p-each-series", "1.0.0"],
      ]),
    }],
  ])],
  ["p-reduce", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-p-reduce-1.0.0-18c2b0dd936a4690a529f8231f58a0fdb6a47dfa/node_modules/p-reduce/"),
      packageDependencies: new Map([
        ["p-reduce", "1.0.0"],
      ]),
    }],
  ])],
  ["pirates", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-pirates-4.0.1-643a92caf894566f91b2b986d2c66950a8e2fb87/node_modules/pirates/"),
      packageDependencies: new Map([
        ["node-modules-regexp", "1.0.0"],
        ["pirates", "4.0.1"],
      ]),
    }],
  ])],
  ["node-modules-regexp", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-node-modules-regexp-1.0.0-8d9dbe28964a4ac5712e9131642107c71e90ec40/node_modules/node-modules-regexp/"),
      packageDependencies: new Map([
        ["node-modules-regexp", "1.0.0"],
      ]),
    }],
  ])],
  ["prompts", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-prompts-2.0.3-c5ccb324010b2e8f74752aadceeb57134c1d2522/node_modules/prompts/"),
      packageDependencies: new Map([
        ["kleur", "3.0.2"],
        ["sisteransi", "1.0.0"],
        ["prompts", "2.0.3"],
      ]),
    }],
  ])],
  ["kleur", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-kleur-3.0.2-83c7ec858a41098b613d5998a7b653962b504f68/node_modules/kleur/"),
      packageDependencies: new Map([
        ["kleur", "3.0.2"],
      ]),
    }],
  ])],
  ["sisteransi", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-sisteransi-1.0.0-77d9622ff909080f1c19e5f4a1df0c1b0a27b88c/node_modules/sisteransi/"),
      packageDependencies: new Map([
        ["sisteransi", "1.0.0"],
      ]),
    }],
  ])],
  ["jest-watch-typeahead", new Map([
    ["0.3.1", {
      packageLocation: path.resolve(__dirname, "../../Library/Caches/Yarn/v4/npm-jest-watch-typeahead-0.3.1-47701024b64b444aa325d801b4b3a6d61ed70701/node_modules/jest-watch-typeahead/"),
      packageDependencies: new Map([
        ["ansi-escapes", "3.2.0"],
        ["chalk", "2.4.2"],
        ["jest-watcher", "24.6.0"],
        ["slash", "2.0.0"],
        ["string-length", "2.0.0"],
        ["strip-ansi", "5.0.0"],
        ["jest-watch-typeahead", "0.3.1"],
      ]),
    }],
  ])],
  [null, new Map([
    [null, {
      packageLocation: path.resolve(__dirname, "./"),
      packageDependencies: new Map([
        ["gherkin", "6.0.17"],
        ["npm-run-path", "3.1.0"],
        ["prettier", "1.17.1"],
        ["read-json-lines-sync", "2.0.2"],
        ["@types/prettier", "1.16.4"],
        ["eslint", "5.16.0"],
        ["eslint-plugin-jest", "22.5.1"],
        ["jest", "24.8.0"],
        ["jest-watch-typeahead", "0.3.1"],
      ]),
    }],
  ])],
]);

let locatorsByLocations = new Map([
  ["../../Library/Caches/Yarn/v4/npm-gherkin-6.0.17-d1218a221f288c100fcbc5a47697f6bedc7242c9/node_modules/gherkin/", {"name":"gherkin","reference":"6.0.17"}],
  ["../../Library/Caches/Yarn/v4/npm-c21e-1.1.9-3741470b2c1aff87944dc1a226cfa30722f01966/node_modules/c21e/", {"name":"c21e","reference":"1.1.9"}],
  ["../../Library/Caches/Yarn/v4/npm-cucumber-messages-2.1.2-b938a17680fda86af2e6590bfd3a94870f9aa350/node_modules/cucumber-messages/", {"name":"cucumber-messages","reference":"2.1.2"}],
  ["./.pnp/unplugged/npm-protobufjs-6.8.8-c8b4f1282fd7a90e6f5b109ed11c84af82908e7c/node_modules/protobufjs/", {"name":"protobufjs","reference":"6.8.8"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-aspromise-1.1.2-9b8b0cc663d669a7d8f6f5d0893a14d348f30fbf/node_modules/@protobufjs/aspromise/", {"name":"@protobufjs/aspromise","reference":"1.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-base64-1.1.2-4c85730e59b9a1f1f349047dbf24296034bb2735/node_modules/@protobufjs/base64/", {"name":"@protobufjs/base64","reference":"1.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-codegen-2.0.4-7ef37f0d010fb028ad1ad59722e506d9262815cb/node_modules/@protobufjs/codegen/", {"name":"@protobufjs/codegen","reference":"2.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-eventemitter-1.1.0-355cbc98bafad5978f9ed095f397621f1d066b70/node_modules/@protobufjs/eventemitter/", {"name":"@protobufjs/eventemitter","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-fetch-1.1.0-ba99fb598614af65700c1619ff06d454b0d84c45/node_modules/@protobufjs/fetch/", {"name":"@protobufjs/fetch","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-inquire-1.1.0-ff200e3e7cf2429e2dcafc1140828e8cc638f089/node_modules/@protobufjs/inquire/", {"name":"@protobufjs/inquire","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-float-1.0.2-5e9e1abdcb73fc0a7cb8b291df78c8cbd97b87d1/node_modules/@protobufjs/float/", {"name":"@protobufjs/float","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-path-1.1.2-6cc2b20c5c9ad6ad0dccfd21ca7673d8d7fbf68d/node_modules/@protobufjs/path/", {"name":"@protobufjs/path","reference":"1.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-pool-1.1.0-09fd15f2d6d3abfa9b65bc366506d6ad7846ff54/node_modules/@protobufjs/pool/", {"name":"@protobufjs/pool","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@protobufjs-utf8-1.1.0-a777360b5b39a1a2e5106f8e858f2fd2d060c570/node_modules/@protobufjs/utf8/", {"name":"@protobufjs/utf8","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-long-4.0.0-719551d2352d301ac8b81db732acb6bdc28dbdef/node_modules/@types/long/", {"name":"@types/long","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-node-10.12.27-eb3843f15d0ba0986cc7e4d734d2ee8b50709ef8/node_modules/@types/node/", {"name":"@types/node","reference":"10.12.27"}],
  ["../../Library/Caches/Yarn/v4/npm-long-4.0.0-9a7b71cfb7d361a194ea555241c92f7468d5bf28/node_modules/long/", {"name":"long","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-npm-run-path-3.1.0-7f91be317f6a466efed3c9f2980ad8a4ee8b0fa5/node_modules/npm-run-path/", {"name":"npm-run-path","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/", {"name":"npm-run-path","reference":"2.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-path-key-3.1.0-99a10d870a803bdd5ee6f0470e58dfcd2f9a54d3/node_modules/path-key/", {"name":"path-key","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/", {"name":"path-key","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-prettier-1.17.1-ed64b4e93e370cb8a25b9ef7fef3e4fd1c0995db/node_modules/prettier/", {"name":"prettier","reference":"1.17.1"}],
  ["../../Library/Caches/Yarn/v4/npm-read-json-lines-sync-2.0.2-2f9925b4bad13b6c178ac8fd5889bd09abce412b/node_modules/read-json-lines-sync/", {"name":"read-json-lines-sync","reference":"2.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-prettier-1.16.4-5e5e97702cb68498aaba7349b941648daaf2385c/node_modules/@types/prettier/", {"name":"@types/prettier","reference":"1.16.4"}],
  ["../../Library/Caches/Yarn/v4/npm-eslint-5.16.0-a1e3ac1aae4a3fbd8296fcf8f7ab7314cbb6abea/node_modules/eslint/", {"name":"eslint","reference":"5.16.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-code-frame-7.0.0-06e2ab19bdb535385559aabb5ba59729482800f8/node_modules/@babel/code-frame/", {"name":"@babel/code-frame","reference":"7.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-highlight-7.0.0-f710c38c8d458e6dd9a201afb637fcb781ce99e4/node_modules/@babel/highlight/", {"name":"@babel/highlight","reference":"7.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424/node_modules/chalk/", {"name":"chalk","reference":"2.4.2"}],
  ["../../Library/Caches/Yarn/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/", {"name":"ansi-styles","reference":"3.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/", {"name":"color-convert","reference":"1.9.3"}],
  ["../../Library/Caches/Yarn/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/", {"name":"color-name","reference":"1.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/", {"name":"escape-string-regexp","reference":"1.0.5"}],
  ["../../Library/Caches/Yarn/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/", {"name":"supports-color","reference":"5.5.0"}],
  ["../../Library/Caches/Yarn/v4/npm-supports-color-6.1.0-0764abc69c63d5ac842dd4867e8d025e880df8f3/node_modules/supports-color/", {"name":"supports-color","reference":"6.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/", {"name":"has-flag","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-esutils-2.0.2-0abf4f1caa5bcb1f7a9d8acc6dea4faaa04bac9b/node_modules/esutils/", {"name":"esutils","reference":"2.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/", {"name":"js-tokens","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ajv-6.9.2-4927adb83e7f48e5a32b45729744c71ec39c9c7b/node_modules/ajv/", {"name":"ajv","reference":"6.9.2"}],
  ["../../Library/Caches/Yarn/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/", {"name":"fast-deep-equal","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/", {"name":"fast-json-stable-stringify","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/", {"name":"json-schema-traverse","reference":"0.4.1"}],
  ["../../Library/Caches/Yarn/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/", {"name":"uri-js","reference":"4.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/", {"name":"punycode","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-punycode-1.4.1-c0d5a63b2718800ad8e1eb0fa5269c84dd41845e/node_modules/punycode/", {"name":"punycode","reference":"1.4.1"}],
  ["../../Library/Caches/Yarn/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/", {"name":"cross-spawn","reference":"6.0.5"}],
  ["../../Library/Caches/Yarn/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/", {"name":"nice-try","reference":"1.0.5"}],
  ["../../Library/Caches/Yarn/v4/npm-semver-5.6.0-7e74256fbaa49c75aa7c7a205cc22799cac80004/node_modules/semver/", {"name":"semver","reference":"5.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-semver-5.7.0-790a7cf6fea5459bac96110b29b60412dc8ff96b/node_modules/semver/", {"name":"semver","reference":"5.7.0"}],
  ["../../Library/Caches/Yarn/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/", {"name":"shebang-command","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/", {"name":"shebang-regex","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/", {"name":"which","reference":"1.3.1"}],
  ["../../Library/Caches/Yarn/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/", {"name":"isexe","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791/node_modules/debug/", {"name":"debug","reference":"4.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/", {"name":"debug","reference":"2.6.9"}],
  ["../../Library/Caches/Yarn/v4/npm-ms-2.1.1-30a5864eb3ebb0a66f2ebe6d727af06a09d86e0a/node_modules/ms/", {"name":"ms","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/", {"name":"ms","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-doctrine-3.0.0-addebead72a6574db783639dc87a121773973961/node_modules/doctrine/", {"name":"doctrine","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-eslint-scope-4.0.3-ca03833310f6889a3264781aa82e63eb9cfe7848/node_modules/eslint-scope/", {"name":"eslint-scope","reference":"4.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf/node_modules/esrecurse/", {"name":"esrecurse","reference":"4.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-estraverse-4.2.0-0dee3fed31fcd469618ce7342099fc1afa0bdb13/node_modules/estraverse/", {"name":"estraverse","reference":"4.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-eslint-utils-1.3.1-9a851ba89ee7c460346f97cf8939c7298827e512/node_modules/eslint-utils/", {"name":"eslint-utils","reference":"1.3.1"}],
  ["../../Library/Caches/Yarn/v4/npm-eslint-visitor-keys-1.0.0-3f3180fb2e291017716acb4c9d6d5b5c34a6a81d/node_modules/eslint-visitor-keys/", {"name":"eslint-visitor-keys","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-espree-5.0.1-5d6526fa4fc7f0788a5cf75b15f30323e2f81f7a/node_modules/espree/", {"name":"espree","reference":"5.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-acorn-6.1.1-7d25ae05bb8ad1f9b699108e1094ecd7884adc1f/node_modules/acorn/", {"name":"acorn","reference":"6.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-acorn-5.7.3-67aa231bf8812974b85235a96771eb6bd07ea279/node_modules/acorn/", {"name":"acorn","reference":"5.7.3"}],
  ["../../Library/Caches/Yarn/v4/npm-acorn-jsx-5.0.1-32a064fd925429216a09b141102bfdd185fae40e/node_modules/acorn-jsx/", {"name":"acorn-jsx","reference":"5.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-esquery-1.0.1-406c51658b1f5991a5f9b62b1dc25b00e3e5c708/node_modules/esquery/", {"name":"esquery","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-file-entry-cache-5.0.1-ca0f6efa6dd3d561333fb14515065c2fafdf439c/node_modules/file-entry-cache/", {"name":"file-entry-cache","reference":"5.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-flat-cache-2.0.1-5d296d6f04bda44a4630a301413bdbc2ec085ec0/node_modules/flat-cache/", {"name":"flat-cache","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-flatted-2.0.0-55122b6536ea496b4b44893ee2608141d10d9916/node_modules/flatted/", {"name":"flatted","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-rimraf-2.6.3-b2d104fe0d8fb27cf9e0a1cda8262dd3833c6cab/node_modules/rimraf/", {"name":"rimraf","reference":"2.6.3"}],
  ["../../Library/Caches/Yarn/v4/npm-glob-7.1.3-3960832d3f1574108342dafd3a67b332c0969df1/node_modules/glob/", {"name":"glob","reference":"7.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/", {"name":"fs.realpath","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/", {"name":"inflight","reference":"1.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/", {"name":"once","reference":"1.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/", {"name":"wrappy","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/", {"name":"inherits","reference":"2.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/", {"name":"minimatch","reference":"3.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/", {"name":"brace-expansion","reference":"1.1.11"}],
  ["../../Library/Caches/Yarn/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/", {"name":"balanced-match","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/", {"name":"concat-map","reference":"0.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/", {"name":"path-is-absolute","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-write-1.0.3-0800e14523b923a387e415123c865616aae0f5c3/node_modules/write/", {"name":"write","reference":"1.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/", {"name":"mkdirp","reference":"0.5.1"}],
  ["../../Library/Caches/Yarn/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/", {"name":"minimist","reference":"0.0.8"}],
  ["../../Library/Caches/Yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/", {"name":"minimist","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-minimist-0.0.10-de3f98543dbf96082be48ad1a0c7cda836301dcf/node_modules/minimist/", {"name":"minimist","reference":"0.0.10"}],
  ["../../Library/Caches/Yarn/v4/npm-functional-red-black-tree-1.0.1-1b0ab3bd553b2a0d6399d29c0e3ea0b252078327/node_modules/functional-red-black-tree/", {"name":"functional-red-black-tree","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-globals-11.11.0-dcf93757fa2de5486fbeed7118538adf789e9c2e/node_modules/globals/", {"name":"globals","reference":"11.11.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ignore-4.0.6-750e3db5862087b4737ebac8207ffd1ef27b25fc/node_modules/ignore/", {"name":"ignore","reference":"4.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-import-fresh-3.0.0-a3d897f420cab0e671236897f75bc14b4885c390/node_modules/import-fresh/", {"name":"import-fresh","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-parent-module-1.0.0-df250bdc5391f4a085fb589dad761f5ad6b865b5/node_modules/parent-module/", {"name":"parent-module","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-callsites-3.0.0-fb7eb569b72ad7a45812f93fd9430a3e410b3dd3/node_modules/callsites/", {"name":"callsites","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-resolve-from-4.0.0-4abcd852ad32dd7baabfe9b40e00a36db5f392e6/node_modules/resolve-from/", {"name":"resolve-from","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-resolve-from-3.0.0-b22c7af7d9d6881bc8b6e653335eebcb0a188748/node_modules/resolve-from/", {"name":"resolve-from","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/", {"name":"imurmurhash","reference":"0.1.4"}],
  ["../../Library/Caches/Yarn/v4/npm-inquirer-6.2.2-46941176f65c9eb20804627149b743a218f25406/node_modules/inquirer/", {"name":"inquirer","reference":"6.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-ansi-escapes-3.2.0-8780b98ff9dbf5638152d1f1fe5c1d7b4442976b/node_modules/ansi-escapes/", {"name":"ansi-escapes","reference":"3.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-cli-cursor-2.1.0-b35dac376479facc3e94747d41d0d0f5238ffcb5/node_modules/cli-cursor/", {"name":"cli-cursor","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-restore-cursor-2.0.0-9f7ee287f82fd326d4fd162923d62129eee0dfaf/node_modules/restore-cursor/", {"name":"restore-cursor","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-onetime-2.0.1-067428230fd67443b2794b22bba528b6867962d4/node_modules/onetime/", {"name":"onetime","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-mimic-fn-1.2.0-820c86a39334640e99516928bd03fca88057d022/node_modules/mimic-fn/", {"name":"mimic-fn","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/", {"name":"signal-exit","reference":"3.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-cli-width-2.2.0-ff19ede8a9a5e579324147b0c11f0fbcbabed639/node_modules/cli-width/", {"name":"cli-width","reference":"2.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-external-editor-3.0.3-5866db29a97826dbe4bf3afd24070ead9ea43a27/node_modules/external-editor/", {"name":"external-editor","reference":"3.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-chardet-0.7.0-90094849f0937f2eedc2425d0d28a9e5f0cbad9e/node_modules/chardet/", {"name":"chardet","reference":"0.7.0"}],
  ["../../Library/Caches/Yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/", {"name":"iconv-lite","reference":"0.4.24"}],
  ["../../Library/Caches/Yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/", {"name":"safer-buffer","reference":"2.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-tmp-0.0.33-6d34335889768d21b2bcda0aa277ced3b1bfadf9/node_modules/tmp/", {"name":"tmp","reference":"0.0.33"}],
  ["../../Library/Caches/Yarn/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/", {"name":"os-tmpdir","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-figures-2.0.0-3ab1a2d2a62c8bfb431a0c94cb797a2fce27c962/node_modules/figures/", {"name":"figures","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/", {"name":"lodash","reference":"4.17.11"}],
  ["../../Library/Caches/Yarn/v4/npm-mute-stream-0.0.7-3075ce93bc21b8fab43e1bc4da7e8115ed1e7bab/node_modules/mute-stream/", {"name":"mute-stream","reference":"0.0.7"}],
  ["../../Library/Caches/Yarn/v4/npm-run-async-2.3.0-0371ab4ae0bdd720d4166d7dfda64ff7a445a6c0/node_modules/run-async/", {"name":"run-async","reference":"2.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-promise-2.1.0-79a2a9ece7f096e80f36d2b2f3bc16c1ff4bf3fa/node_modules/is-promise/", {"name":"is-promise","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-rxjs-6.4.0-f3bb0fe7bda7fb69deac0c16f17b50b0b8790504/node_modules/rxjs/", {"name":"rxjs","reference":"6.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-tslib-1.9.3-d7e4dd79245d85428c4d7e4822a79917954ca286/node_modules/tslib/", {"name":"tslib","reference":"1.9.3"}],
  ["../../Library/Caches/Yarn/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/", {"name":"string-width","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-string-width-3.0.0-5a1690a57cc78211fffd9bf24bbe24d090604eb1/node_modules/string-width/", {"name":"string-width","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/", {"name":"string-width","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/", {"name":"is-fullwidth-code-point","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/", {"name":"is-fullwidth-code-point","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-strip-ansi-5.0.0-f78f68b5d0866c20b2c9b8c61b5298508dc8756f/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"5.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"3.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ansi-regex-4.0.0-70de791edf021404c3fd615aa89118ae0432e5a9/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-through-2.3.8-0dd4c9ffaabc357960b1b724115d7e0e86a2e1f5/node_modules/through/", {"name":"through","reference":"2.3.8"}],
  ["../../Library/Caches/Yarn/v4/npm-js-yaml-3.13.0-38ee7178ac0eea2c97ff6d96fff4b18c7d8cf98e/node_modules/js-yaml/", {"name":"js-yaml","reference":"3.13.0"}],
  ["../../Library/Caches/Yarn/v4/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911/node_modules/argparse/", {"name":"argparse","reference":"1.0.10"}],
  ["../../Library/Caches/Yarn/v4/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c/node_modules/sprintf-js/", {"name":"sprintf-js","reference":"1.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71/node_modules/esprima/", {"name":"esprima","reference":"4.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-esprima-3.1.3-fdca51cee6133895e3c88d535ce49dbff62a4633/node_modules/esprima/", {"name":"esprima","reference":"3.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-json-stable-stringify-without-jsonify-1.0.1-9db7b59496ad3f3cfef30a75142d2d930ad72651/node_modules/json-stable-stringify-without-jsonify/", {"name":"json-stable-stringify-without-jsonify","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee/node_modules/levn/", {"name":"levn","reference":"0.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54/node_modules/prelude-ls/", {"name":"prelude-ls","reference":"1.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72/node_modules/type-check/", {"name":"type-check","reference":"0.3.2"}],
  ["../../Library/Caches/Yarn/v4/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7/node_modules/natural-compare/", {"name":"natural-compare","reference":"1.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-optionator-0.8.2-364c5e409d3f4d6301d6c0b4c05bba50180aeb64/node_modules/optionator/", {"name":"optionator","reference":"0.8.2"}],
  ["../../Library/Caches/Yarn/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/", {"name":"deep-is","reference":"0.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917/node_modules/fast-levenshtein/", {"name":"fast-levenshtein","reference":"2.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-wordwrap-1.0.0-27584810891456a4171c8d0226441ade90cbcaeb/node_modules/wordwrap/", {"name":"wordwrap","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-wordwrap-0.0.3-a3d5da6cd5c0bc0008d37234bbaf1bed63059107/node_modules/wordwrap/", {"name":"wordwrap","reference":"0.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-path-is-inside-1.0.2-365417dede44430d1c11af61027facf074bdfc53/node_modules/path-is-inside/", {"name":"path-is-inside","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-progress-2.0.3-7e8cf8d8f5b8f239c1bc68beb4eb78567d572ef8/node_modules/progress/", {"name":"progress","reference":"2.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-regexpp-2.0.1-8d19d31cf632482b589049f8281f93dbcba4d07f/node_modules/regexpp/", {"name":"regexpp","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-strip-json-comments-2.0.1-3c531942e908c2697c0ec344858c286c7ca0a60a/node_modules/strip-json-comments/", {"name":"strip-json-comments","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-table-5.2.3-cde0cc6eb06751c009efab27e8c820ca5b67b7f2/node_modules/table/", {"name":"table","reference":"5.2.3"}],
  ["../../Library/Caches/Yarn/v4/npm-slice-ansi-2.1.0-cacd7693461a637a5788d92a7dd4fba068e81636/node_modules/slice-ansi/", {"name":"slice-ansi","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9/node_modules/astral-regex/", {"name":"astral-regex","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156/node_modules/emoji-regex/", {"name":"emoji-regex","reference":"7.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-text-table-0.2.0-7f5ee823ae805207c00af2df4a84ec3fcfa570b4/node_modules/text-table/", {"name":"text-table","reference":"0.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-eslint-plugin-jest-22.5.1-a31dfe9f9513c6af7c17ece4c65535a1370f060b/node_modules/eslint-plugin-jest/", {"name":"eslint-plugin-jest","reference":"22.5.1"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-24.8.0-d5dff1984d0d1002196e9b7f12f75af1b2809081/node_modules/jest/", {"name":"jest","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-import-local-2.0.0-55070be38a5993cf18ef6db7e961f5bee5c5a09d/node_modules/import-local/", {"name":"import-local","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-pkg-dir-3.0.0-2749020f239ed990881b1f71210d51eb6523bea3/node_modules/pkg-dir/", {"name":"pkg-dir","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-find-up-3.0.0-49169f1d7993430646da61ecc5ae355c21c97b73/node_modules/find-up/", {"name":"find-up","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-locate-path-3.0.0-dbec3b3ab759758071b58fe59fc41871af21400e/node_modules/locate-path/", {"name":"locate-path","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-locate-3.0.0-322d69a05c0264b25997d9f40cd8a891ab0064a4/node_modules/p-locate/", {"name":"p-locate","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-limit-2.1.0-1d5a0d20fb12707c758a655f6bbc4386b5930d68/node_modules/p-limit/", {"name":"p-limit","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-try-2.0.0-85080bb87c64688fa47996fe8f7dfbe8211760b1/node_modules/p-try/", {"name":"p-try","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/", {"name":"path-exists","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-resolve-cwd-2.0.0-00a9f7387556e27038eae232caa372a6a59b665a/node_modules/resolve-cwd/", {"name":"resolve-cwd","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-cli-24.8.0-b075ac914492ed114fa338ade7362a301693e989/node_modules/jest-cli/", {"name":"jest-cli","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-core-24.8.0-fbbdcd42a41d0d39cddbc9f520c8bab0c33eed5b/node_modules/@jest/core/", {"name":"@jest/core","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-console-24.7.1-32a9e42535a97aedfe037e725bd67e954b459545/node_modules/@jest/console/", {"name":"@jest/console","reference":"24.7.1"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-console-24.6.0-63225e6889f3865ab5b7a0d8797e8aed417c4e0b/node_modules/@jest/console/", {"name":"@jest/console","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-source-map-24.3.0-563be3aa4d224caf65ff77edc95cd1ca4da67f28/node_modules/@jest/source-map/", {"name":"@jest/source-map","reference":"24.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-graceful-fs-4.1.15-ffb703e1066e8a0eeaa4c8b80ba9253eeefbfb00/node_modules/graceful-fs/", {"name":"graceful-fs","reference":"4.1.15"}],
  ["../../Library/Caches/Yarn/v4/npm-source-map-0.6.1-74722af32e9614e9c287a8d0bbde48b5e2f1a263/node_modules/source-map/", {"name":"source-map","reference":"0.6.1"}],
  ["../../Library/Caches/Yarn/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/", {"name":"source-map","reference":"0.5.7"}],
  ["../../Library/Caches/Yarn/v4/npm-slash-2.0.0-de552851a1759df3a8f206535442f5ec4ddeab44/node_modules/slash/", {"name":"slash","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-reporters-24.8.0-075169cd029bddec54b8f2c0fc489fd0b9e05729/node_modules/@jest/reporters/", {"name":"@jest/reporters","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-environment-24.8.0-0342261383c776bdd652168f68065ef144af0eac/node_modules/@jest/environment/", {"name":"@jest/environment","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-fake-timers-24.8.0-2e5b80a4f78f284bcb4bd5714b8e10dd36a8d3d1/node_modules/@jest/fake-timers/", {"name":"@jest/fake-timers","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-fake-timers-24.6.0-4eb0b47539883742e9f969e983770230f5a57d7b/node_modules/@jest/fake-timers/", {"name":"@jest/fake-timers","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-types-24.8.0-f31e25948c58f0abd8c845ae26fcea1491dea7ad/node_modules/@jest/types/", {"name":"@jest/types","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-types-24.6.0-cf018e56f3ef45e81119fd613fc20a9819f4eddd/node_modules/@jest/types/", {"name":"@jest/types","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-istanbul-lib-coverage-2.0.0-1eb8c033e98cf4e1a4cedcaf8bcafe8cb7591e85/node_modules/@types/istanbul-lib-coverage/", {"name":"@types/istanbul-lib-coverage","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-istanbul-lib-coverage-2.0.1-42995b446db9a48a11a07ec083499a860e9138ff/node_modules/@types/istanbul-lib-coverage/", {"name":"@types/istanbul-lib-coverage","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-istanbul-reports-1.1.1-7a8cbf6a406f36c8add871625b278eaf0b0d255a/node_modules/@types/istanbul-reports/", {"name":"@types/istanbul-reports","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-istanbul-lib-report-1.1.1-e5471e7fa33c61358dd38426189c037a58433b8c/node_modules/@types/istanbul-lib-report/", {"name":"@types/istanbul-lib-report","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-yargs-12.0.9-693e76a52f61a2f1e7fb48c0eef167b95ea4ffd0/node_modules/@types/yargs/", {"name":"@types/yargs","reference":"12.0.9"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-message-util-24.8.0-0d6891e72a4beacc0292b638685df42e28d6218b/node_modules/jest-message-util/", {"name":"jest-message-util","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-message-util-24.6.0-585b8dd65c34a9d0e6f68b3feeb46918ee40b976/node_modules/jest-message-util/", {"name":"jest-message-util","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-test-result-24.8.0-7675d0aaf9d2484caa65e048d9b467d160f8e9d3/node_modules/@jest/test-result/", {"name":"@jest/test-result","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-test-result-24.6.0-fd56c12b031601c282eede8a5ec1317ebe63bd11/node_modules/@jest/test-result/", {"name":"@jest/test-result","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-stack-utils-1.0.1-0a851d3bd96498fa25c33ab7278ed3bd65f06c3e/node_modules/@types/stack-utils/", {"name":"@types/stack-utils","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/", {"name":"micromatch","reference":"3.1.10"}],
  ["../../Library/Caches/Yarn/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/", {"name":"arr-diff","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/", {"name":"array-unique","reference":"0.3.2"}],
  ["../../Library/Caches/Yarn/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/", {"name":"braces","reference":"2.3.2"}],
  ["../../Library/Caches/Yarn/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/", {"name":"arr-flatten","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/", {"name":"extend-shallow","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/", {"name":"extend-shallow","reference":"3.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/", {"name":"is-extendable","reference":"0.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/", {"name":"is-extendable","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/", {"name":"fill-range","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/", {"name":"is-number","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/", {"name":"kind-of","reference":"3.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/", {"name":"kind-of","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/", {"name":"kind-of","reference":"5.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/", {"name":"kind-of","reference":"6.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/", {"name":"is-buffer","reference":"1.1.6"}],
  ["../../Library/Caches/Yarn/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/", {"name":"repeat-string","reference":"1.6.1"}],
  ["../../Library/Caches/Yarn/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/", {"name":"to-regex-range","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/", {"name":"isobject","reference":"3.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/", {"name":"isobject","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/", {"name":"repeat-element","reference":"1.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/", {"name":"snapdragon","reference":"0.8.2"}],
  ["../../Library/Caches/Yarn/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/", {"name":"base","reference":"0.11.2"}],
  ["../../Library/Caches/Yarn/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/", {"name":"cache-base","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/", {"name":"collection-visit","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/", {"name":"map-visit","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/", {"name":"object-visit","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-component-emitter-1.2.1-137918d6d78283f7df7a6b7c5a63e140e69425e6/node_modules/component-emitter/", {"name":"component-emitter","reference":"1.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/", {"name":"get-value","reference":"2.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/", {"name":"has-value","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/", {"name":"has-value","reference":"0.3.1"}],
  ["../../Library/Caches/Yarn/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/", {"name":"has-values","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/", {"name":"has-values","reference":"0.1.4"}],
  ["../../Library/Caches/Yarn/v4/npm-set-value-2.0.0-71ae4a88f0feefbbf52d1ea604f3fb315ebb6274/node_modules/set-value/", {"name":"set-value","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-set-value-0.4.3-7db08f9d3d22dc7f78e53af3c3bf4666ecdfccf1/node_modules/set-value/", {"name":"set-value","reference":"0.4.3"}],
  ["../../Library/Caches/Yarn/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/", {"name":"is-plain-object","reference":"2.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/", {"name":"split-string","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/", {"name":"assign-symbols","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/", {"name":"to-object-path","reference":"0.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-union-value-1.0.0-5c71c34cb5bad5dcebe3ea0cd08207ba5aa1aea4/node_modules/union-value/", {"name":"union-value","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/", {"name":"arr-union","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/", {"name":"unset-value","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/", {"name":"isarray","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/", {"name":"class-utils","reference":"0.3.6"}],
  ["../../Library/Caches/Yarn/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/", {"name":"define-property","reference":"0.2.5"}],
  ["../../Library/Caches/Yarn/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/", {"name":"define-property","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/", {"name":"define-property","reference":"2.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/", {"name":"is-descriptor","reference":"0.1.6"}],
  ["../../Library/Caches/Yarn/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/", {"name":"is-descriptor","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/", {"name":"is-accessor-descriptor","reference":"0.1.6"}],
  ["../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/", {"name":"is-accessor-descriptor","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/", {"name":"is-data-descriptor","reference":"0.1.4"}],
  ["../../Library/Caches/Yarn/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/", {"name":"is-data-descriptor","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/", {"name":"static-extend","reference":"0.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/", {"name":"object-copy","reference":"0.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/", {"name":"copy-descriptor","reference":"0.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-mixin-deep-1.3.1-a49e7268dce1a0d9698e45326c5626df3543d0fe/node_modules/mixin-deep/", {"name":"mixin-deep","reference":"1.3.1"}],
  ["../../Library/Caches/Yarn/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/", {"name":"for-in","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/", {"name":"pascalcase","reference":"0.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/", {"name":"map-cache","reference":"0.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/", {"name":"source-map-resolve","reference":"0.5.2"}],
  ["../../Library/Caches/Yarn/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/", {"name":"atob","reference":"2.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/", {"name":"decode-uri-component","reference":"0.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/", {"name":"resolve-url","reference":"0.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/", {"name":"source-map-url","reference":"0.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/", {"name":"urix","reference":"0.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/", {"name":"use","reference":"3.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/", {"name":"snapdragon-node","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/", {"name":"snapdragon-util","reference":"3.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/", {"name":"to-regex","reference":"3.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/", {"name":"regex-not","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/", {"name":"safe-regex","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/", {"name":"ret","reference":"0.1.15"}],
  ["../../Library/Caches/Yarn/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/", {"name":"extglob","reference":"2.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/", {"name":"expand-brackets","reference":"2.1.4"}],
  ["../../Library/Caches/Yarn/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/", {"name":"posix-character-classes","reference":"0.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/", {"name":"fragment-cache","reference":"0.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/", {"name":"nanomatch","reference":"1.2.13"}],
  ["../../Library/Caches/Yarn/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/", {"name":"is-windows","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/", {"name":"object.pick","reference":"1.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-stack-utils-1.0.2-33eba3897788558bebfc2db059dc158ec36cebb8/node_modules/stack-utils/", {"name":"stack-utils","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-mock-24.8.0-2f9d14d37699e863f1febf4e4d5a33b7fdbbde56/node_modules/jest-mock/", {"name":"jest-mock","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-mock-24.6.0-fd21d9f0c4b77d6b1cbd320223a56c5ae294b86b/node_modules/jest-mock/", {"name":"jest-mock","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-transform-24.8.0-628fb99dce4f9d254c6fd9341e3eea262e06fef5/node_modules/@jest/transform/", {"name":"@jest/transform","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-core-7.3.4-921a5a13746c21e32445bf0798680e9d11a6530b/node_modules/@babel/core/", {"name":"@babel/core","reference":"7.3.4"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-generator-7.3.4-9aa48c1989257877a9d971296e5b73bfe72e446e/node_modules/@babel/generator/", {"name":"@babel/generator","reference":"7.3.4"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-types-7.3.4-bf482eaeaffb367a28abbf9357a94963235d90ed/node_modules/@babel/types/", {"name":"@babel/types","reference":"7.3.4"}],
  ["../../Library/Caches/Yarn/v4/npm-to-fast-properties-2.0.0-dc5e698cbd079265bc73e0377681a4e4e83f616e/node_modules/to-fast-properties/", {"name":"to-fast-properties","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jsesc-2.5.2-80564d2e483dacf6e8ef209650a67df3f0c283a4/node_modules/jsesc/", {"name":"jsesc","reference":"2.5.2"}],
  ["../../Library/Caches/Yarn/v4/npm-trim-right-1.0.1-cb2e1203067e0c8de1f614094b9fe45704ea6003/node_modules/trim-right/", {"name":"trim-right","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-helpers-7.3.1-949eec9ea4b45d3210feb7dc1c22db664c9e44b9/node_modules/@babel/helpers/", {"name":"@babel/helpers","reference":"7.3.1"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-template-7.2.2-005b3fdf0ed96e88041330379e0da9a708eb2907/node_modules/@babel/template/", {"name":"@babel/template","reference":"7.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-parser-7.3.4-a43357e4bbf4b92a437fb9e465c192848287f27c/node_modules/@babel/parser/", {"name":"@babel/parser","reference":"7.3.4"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-traverse-7.3.4-1330aab72234f8dea091b08c4f8b9d05c7119e06/node_modules/@babel/traverse/", {"name":"@babel/traverse","reference":"7.3.4"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-helper-function-name-7.1.0-a0ceb01685f73355d4360c1247f582bfafc8ff53/node_modules/@babel/helper-function-name/", {"name":"@babel/helper-function-name","reference":"7.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-helper-get-function-arity-7.0.0-83572d4320e2a4657263734113c42868b64e49c3/node_modules/@babel/helper-get-function-arity/", {"name":"@babel/helper-get-function-arity","reference":"7.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-helper-split-export-declaration-7.0.0-3aae285c0311c2ab095d997b8c9a94cad547d813/node_modules/@babel/helper-split-export-declaration/", {"name":"@babel/helper-split-export-declaration","reference":"7.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-convert-source-map-1.6.0-51b537a8c43e0f04dec1993bffcdd504e758ac20/node_modules/convert-source-map/", {"name":"convert-source-map","reference":"1.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/", {"name":"safe-buffer","reference":"5.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-json5-2.1.0-e7a0c62c48285c628d20a10b85c89bb807c32850/node_modules/json5/", {"name":"json5","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-resolve-1.10.0-3bdaaeaf45cc07f375656dfd2e54ed0810b101ba/node_modules/resolve/", {"name":"resolve","reference":"1.10.0"}],
  ["../../Library/Caches/Yarn/v4/npm-resolve-1.1.7-203114d82ad2c5ed9e8e0411b3932875e889e97b/node_modules/resolve/", {"name":"resolve","reference":"1.1.7"}],
  ["../../Library/Caches/Yarn/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/", {"name":"path-parse","reference":"1.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-babel-plugin-istanbul-5.1.1-7981590f1956d75d67630ba46f0c22493588c893/node_modules/babel-plugin-istanbul/", {"name":"babel-plugin-istanbul","reference":"5.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-istanbul-lib-instrument-3.1.0-a2b5484a7d445f1f311e93190813fa56dfb62971/node_modules/istanbul-lib-instrument/", {"name":"istanbul-lib-instrument","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-istanbul-lib-coverage-2.0.3-0b891e5ad42312c2b9488554f603795f9a2211ba/node_modules/istanbul-lib-coverage/", {"name":"istanbul-lib-coverage","reference":"2.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-test-exclude-5.1.0-6ba6b25179d2d38724824661323b73e03c0c1de1/node_modules/test-exclude/", {"name":"test-exclude","reference":"5.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-arrify-1.0.1-898508da2226f380df904728456849c1501a4b0d/node_modules/arrify/", {"name":"arrify","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-read-pkg-up-4.0.0-1b221c6088ba7799601c808f91161c66e58f8978/node_modules/read-pkg-up/", {"name":"read-pkg-up","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-read-pkg-3.0.0-9cbc686978fee65d16c00e2b19c237fcf6e38389/node_modules/read-pkg/", {"name":"read-pkg","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-load-json-file-4.0.0-2f5f45ab91e33216234fd53adab668eb4ec0993b/node_modules/load-json-file/", {"name":"load-json-file","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-parse-json-4.0.0-be35f5425be1f7f6c747184f98a788cb99477ee0/node_modules/parse-json/", {"name":"parse-json","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-error-ex-1.3.2-b4ac40648107fdcdcfae242f428bea8a14d4f1bf/node_modules/error-ex/", {"name":"error-ex","reference":"1.3.2"}],
  ["../../Library/Caches/Yarn/v4/npm-is-arrayish-0.2.1-77c99840527aa8ecb1a8ba697b80645a7a926a9d/node_modules/is-arrayish/", {"name":"is-arrayish","reference":"0.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-json-parse-better-errors-1.0.2-bb867cfb3450e69107c131d1c514bab3dc8bcaa9/node_modules/json-parse-better-errors/", {"name":"json-parse-better-errors","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-pify-3.0.0-e5a4acd2c101fdf3d9a4d07f0dbc4db49dd28176/node_modules/pify/", {"name":"pify","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-strip-bom-3.0.0-2334c18e9c759f7bdd56fdef7e9ae3d588e68ed3/node_modules/strip-bom/", {"name":"strip-bom","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-normalize-package-data-2.5.0-e66db1838b200c1dfc233225d12cb36520e234a8/node_modules/normalize-package-data/", {"name":"normalize-package-data","reference":"2.5.0"}],
  ["../../Library/Caches/Yarn/v4/npm-hosted-git-info-2.7.1-97f236977bd6e125408930ff6de3eec6281ec047/node_modules/hosted-git-info/", {"name":"hosted-git-info","reference":"2.7.1"}],
  ["../../Library/Caches/Yarn/v4/npm-validate-npm-package-license-3.0.4-fc91f6b9c7ba15c857f4cb2c5defeec39d4f410a/node_modules/validate-npm-package-license/", {"name":"validate-npm-package-license","reference":"3.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-spdx-correct-3.1.0-fb83e504445268f154b074e218c87c003cd31df4/node_modules/spdx-correct/", {"name":"spdx-correct","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-spdx-expression-parse-3.0.0-99e119b7a5da00e05491c9fa338b7904823b41d0/node_modules/spdx-expression-parse/", {"name":"spdx-expression-parse","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-spdx-exceptions-2.2.0-2ea450aee74f2a89bfb94519c07fcd6f41322977/node_modules/spdx-exceptions/", {"name":"spdx-exceptions","reference":"2.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-spdx-license-ids-3.0.3-81c0ce8f21474756148bbb5f3bfc0f36bf15d76e/node_modules/spdx-license-ids/", {"name":"spdx-license-ids","reference":"3.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-path-type-3.0.0-cef31dc8e0a1a3bb0d105c0cd97cf3bf47f4e36f/node_modules/path-type/", {"name":"path-type","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-require-main-filename-1.0.1-97f717b69d48784f5f526a6c5aa8ffdda055a4d1/node_modules/require-main-filename/", {"name":"require-main-filename","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-haste-map-24.8.0-51794182d877b3ddfd6e6d23920e3fe72f305800/node_modules/jest-haste-map/", {"name":"jest-haste-map","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/", {"name":"anymatch","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/", {"name":"normalize-path","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/", {"name":"remove-trailing-separator","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-fb-watchman-2.0.0-54e9abf7dfa2f26cd9b1636c588c1afc05de5d58/node_modules/fb-watchman/", {"name":"fb-watchman","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-bser-2.0.0-9ac78d3ed5d915804fd87acb158bc797147a1719/node_modules/bser/", {"name":"bser","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-node-int64-0.4.0-87a9065cdb355d3182d8f94ce11188b825c68a3b/node_modules/node-int64/", {"name":"node-int64","reference":"0.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-invariant-2.2.4-610f3c92c9359ce1db616e538008d23ff35158e6/node_modules/invariant/", {"name":"invariant","reference":"2.2.4"}],
  ["../../Library/Caches/Yarn/v4/npm-loose-envify-1.4.0-71ee51fa7be4caec1a63839f7e682d8132d30caf/node_modules/loose-envify/", {"name":"loose-envify","reference":"1.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-serializer-24.4.0-f70c5918c8ea9235ccb1276d232e459080588db3/node_modules/jest-serializer/", {"name":"jest-serializer","reference":"24.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-util-24.8.0-41f0e945da11df44cc76d64ffb915d0716f46cd1/node_modules/jest-util/", {"name":"jest-util","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-util-24.6.0-725a380e8f21fcdf53bd5bd5829ee78903ffc756/node_modules/jest-util/", {"name":"jest-util","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-ci-2.0.0-6bc6334181810e04b5c22b3d589fdca55026404c/node_modules/is-ci/", {"name":"is-ci","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ci-info-2.0.0-67a9e964be31a51e15e5010d58e6f12834002f46/node_modules/ci-info/", {"name":"ci-info","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-worker-24.6.0-7f81ceae34b7cde0c9827a6980c35b7cdc0161b3/node_modules/jest-worker/", {"name":"jest-worker","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-merge-stream-1.0.1-4041202d508a342ba00174008df0c251b8c135e1/node_modules/merge-stream/", {"name":"merge-stream","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/", {"name":"readable-stream","reference":"2.3.6"}],
  ["../../Library/Caches/Yarn/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/", {"name":"core-util-is","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-process-nextick-args-2.0.0-a37d732f4271b4ab1ad070d35508e8290788ffaa/node_modules/process-nextick-args/", {"name":"process-nextick-args","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/", {"name":"string_decoder","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/", {"name":"util-deprecate","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-sane-4.0.3-e878c3f19e25cc57fbb734602f48f8a97818b181/node_modules/sane/", {"name":"sane","reference":"4.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-@cnakazawa-watch-1.0.3-099139eaec7ebf07a27c1786a3ff64f39464d2ef/node_modules/@cnakazawa/watch/", {"name":"@cnakazawa/watch","reference":"1.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-exec-sh-0.3.2-6738de2eb7c8e671d0366aea0b0db8c6f7d7391b/node_modules/exec-sh/", {"name":"exec-sh","reference":"0.3.2"}],
  ["../../Library/Caches/Yarn/v4/npm-capture-exit-1.2.0-1c5fcc489fd0ab00d4f1ac7ae1072e3173fbab6f/node_modules/capture-exit/", {"name":"capture-exit","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-rsvp-3.6.2-2e96491599a96cde1b515d5674a8f7a91452926a/node_modules/rsvp/", {"name":"rsvp","reference":"3.6.2"}],
  ["../../Library/Caches/Yarn/v4/npm-execa-1.0.0-c6236a5bb4df6d6f15e88e7f017798216749ddd8/node_modules/execa/", {"name":"execa","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-get-stream-4.1.0-c1b255575f3dc21d59bfc79cd3d2b46b1c3a54b5/node_modules/get-stream/", {"name":"get-stream","reference":"4.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-pump-3.0.0-b4a2116815bde2f4e1ea602354e8c75565107a64/node_modules/pump/", {"name":"pump","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-end-of-stream-1.4.1-ed29634d19baba463b6ce6b80a37213eab71ec43/node_modules/end-of-stream/", {"name":"end-of-stream","reference":"1.4.1"}],
  ["../../Library/Caches/Yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/", {"name":"is-stream","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/", {"name":"p-finally","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/", {"name":"strip-eof","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-walker-1.0.7-2f7f9b8fd10d677262b18a884e28d19618e028fb/node_modules/walker/", {"name":"walker","reference":"1.0.7"}],
  ["../../Library/Caches/Yarn/v4/npm-makeerror-1.0.11-e01a5c9109f2af79660e4e8b9587790184f5a96c/node_modules/makeerror/", {"name":"makeerror","reference":"1.0.11"}],
  ["../../Library/Caches/Yarn/v4/npm-tmpl-1.0.4-23640dd7b42d00433911140820e5cf440e521dd1/node_modules/tmpl/", {"name":"tmpl","reference":"1.0.4"}],
  ["./.pnp/unplugged/npm-fsevents-1.2.7-4851b664a3783e52003b3c66eb0eee1074933aa4/node_modules/fsevents/", {"name":"fsevents","reference":"1.2.7"}],
  ["../../Library/Caches/Yarn/v4/npm-nan-2.13.2-f51dc7ae66ba7d5d55e1e6d4d8092e802c9aefe7/node_modules/nan/", {"name":"nan","reference":"2.13.2"}],
  ["../../Library/Caches/Yarn/v4/npm-node-pre-gyp-0.10.3-3070040716afdc778747b61b6887bf78880b80fc/node_modules/node-pre-gyp/", {"name":"node-pre-gyp","reference":"0.10.3"}],
  ["../../Library/Caches/Yarn/v4/npm-detect-libc-1.0.3-fa137c4bd698edf55cd5cd02ac559f91a4c4ba9b/node_modules/detect-libc/", {"name":"detect-libc","reference":"1.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-needle-2.2.4-51931bff82533b1928b7d1d69e01f1b00ffd2a4e/node_modules/needle/", {"name":"needle","reference":"2.2.4"}],
  ["../../Library/Caches/Yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/", {"name":"sax","reference":"1.2.4"}],
  ["../../Library/Caches/Yarn/v4/npm-nopt-4.0.1-d0d4685afd5415193c8c7505602d0d17cd64474d/node_modules/nopt/", {"name":"nopt","reference":"4.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-abbrev-1.1.1-f8f2c887ad10bf67f634f005b6987fed3179aac8/node_modules/abbrev/", {"name":"abbrev","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-osenv-0.1.5-85cdfafaeb28e8677f416e287592b5f3f49ea410/node_modules/osenv/", {"name":"osenv","reference":"0.1.5"}],
  ["../../Library/Caches/Yarn/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/", {"name":"os-homedir","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-npm-packlist-1.4.1-19064cdf988da80ea3cee45533879d90192bbfbc/node_modules/npm-packlist/", {"name":"npm-packlist","reference":"1.4.1"}],
  ["../../Library/Caches/Yarn/v4/npm-ignore-walk-3.0.1-a83e62e7d272ac0e3b551aaa82831a19b69f82f8/node_modules/ignore-walk/", {"name":"ignore-walk","reference":"3.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-npm-bundled-1.0.6-e7ba9aadcef962bb61248f91721cd932b3fe6bdd/node_modules/npm-bundled/", {"name":"npm-bundled","reference":"1.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-npmlog-4.1.2-08a7f2a8bf734604779a9efa4ad5cc717abb954b/node_modules/npmlog/", {"name":"npmlog","reference":"4.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-are-we-there-yet-1.1.5-4b35c2944f062a8bfcda66410760350fe9ddfc21/node_modules/are-we-there-yet/", {"name":"are-we-there-yet","reference":"1.1.5"}],
  ["../../Library/Caches/Yarn/v4/npm-delegates-1.0.0-84c6e159b81904fdca59a0ef44cd870d31250f9a/node_modules/delegates/", {"name":"delegates","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-console-control-strings-1.1.0-3d7cf4464db6446ea644bf4b39507f9851008e8e/node_modules/console-control-strings/", {"name":"console-control-strings","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-gauge-2.7.4-2c03405c7538c39d7eb37b317022e325fb018bf7/node_modules/gauge/", {"name":"gauge","reference":"2.7.4"}],
  ["../../Library/Caches/Yarn/v4/npm-aproba-1.2.0-6802e6264efd18c790a1b0d517f0f2627bf2c94a/node_modules/aproba/", {"name":"aproba","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-has-unicode-2.0.1-e0e6fe6a28cf51138855e086d1691e771de2a8b9/node_modules/has-unicode/", {"name":"has-unicode","reference":"2.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/", {"name":"object-assign","reference":"4.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/", {"name":"code-point-at","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/", {"name":"number-is-nan","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-wide-align-1.1.3-ae074e6bdc0c14a431e804e624549c633b000457/node_modules/wide-align/", {"name":"wide-align","reference":"1.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/", {"name":"set-blocking","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-rc-1.2.8-cd924bf5200a075b83c188cd6b9e211b7fc0d3ed/node_modules/rc/", {"name":"rc","reference":"1.2.8"}],
  ["../../Library/Caches/Yarn/v4/npm-deep-extend-0.6.0-c4fa7c95404a17a9c3e8ca7e1537312b736330ac/node_modules/deep-extend/", {"name":"deep-extend","reference":"0.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-ini-1.3.5-eee25f56db1c9ec6085e0c22778083f596abf927/node_modules/ini/", {"name":"ini","reference":"1.3.5"}],
  ["../../Library/Caches/Yarn/v4/npm-tar-4.4.8-b19eec3fde2a96e64666df9fdb40c5ca1bc3747d/node_modules/tar/", {"name":"tar","reference":"4.4.8"}],
  ["../../Library/Caches/Yarn/v4/npm-chownr-1.1.1-54726b8b8fff4df053c42187e801fb4412df1494/node_modules/chownr/", {"name":"chownr","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-fs-minipass-1.2.5-06c277218454ec288df77ada54a03b8702aacb9d/node_modules/fs-minipass/", {"name":"fs-minipass","reference":"1.2.5"}],
  ["../../Library/Caches/Yarn/v4/npm-minipass-2.3.5-cacebe492022497f656b0f0f51e2682a9ed2d848/node_modules/minipass/", {"name":"minipass","reference":"2.3.5"}],
  ["../../Library/Caches/Yarn/v4/npm-yallist-3.0.3-b4b049e314be545e3ce802236d6cd22cd91c3de9/node_modules/yallist/", {"name":"yallist","reference":"3.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-minizlib-1.2.1-dd27ea6136243c7c880684e8672bb3a45fd9b614/node_modules/minizlib/", {"name":"minizlib","reference":"1.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-regex-util-24.3.0-d5a65f60be1ae3e310d5214a0307581995227b36/node_modules/jest-regex-util/", {"name":"jest-regex-util","reference":"24.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-realpath-native-1.1.0-2003294fea23fb0672f2476ebe22fcf498a2d65c/node_modules/realpath-native/", {"name":"realpath-native","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-util-promisify-1.0.0-440f7165a459c9a16dc145eb8e72f35687097030/node_modules/util.promisify/", {"name":"util.promisify","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/", {"name":"define-properties","reference":"1.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-object-keys-1.1.0-11bd22348dd2e096a045ab06f6c85bcc340fa032/node_modules/object-keys/", {"name":"object-keys","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-object-getownpropertydescriptors-2.0.3-8758c846f5b407adab0f236e0986f14b051caa16/node_modules/object.getownpropertydescriptors/", {"name":"object.getownpropertydescriptors","reference":"2.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-es-abstract-1.13.0-ac86145fdd5099d8dd49558ccba2eaf9b88e24e9/node_modules/es-abstract/", {"name":"es-abstract","reference":"1.13.0"}],
  ["../../Library/Caches/Yarn/v4/npm-es-to-primitive-1.2.0-edf72478033456e8dda8ef09e00ad9650707f377/node_modules/es-to-primitive/", {"name":"es-to-primitive","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/", {"name":"is-callable","reference":"1.1.4"}],
  ["../../Library/Caches/Yarn/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/", {"name":"is-date-object","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-is-symbol-1.0.2-a055f6ae57192caee329e7a860118b497a950f38/node_modules/is-symbol/", {"name":"is-symbol","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-has-symbols-1.0.0-ba1a8f1af2a0fc39650f5c850367704122063b44/node_modules/has-symbols/", {"name":"has-symbols","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/", {"name":"function-bind","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/", {"name":"has","reference":"1.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/", {"name":"is-regex","reference":"1.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-write-file-atomic-2.4.1-d0b05463c188ae804396fd5ab2a370062af87529/node_modules/write-file-atomic/", {"name":"write-file-atomic","reference":"2.4.1"}],
  ["../../Library/Caches/Yarn/v4/npm-exit-0.1.2-0632638f8d877cc82107d30a0fff1a17cba1cd0c/node_modules/exit/", {"name":"exit","reference":"0.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-istanbul-lib-report-2.0.4-bfd324ee0c04f59119cb4f07dab157d09f24d7e4/node_modules/istanbul-lib-report/", {"name":"istanbul-lib-report","reference":"2.0.4"}],
  ["../../Library/Caches/Yarn/v4/npm-make-dir-1.3.0-79c1033b80515bd6d24ec9933e860ca75ee27f0c/node_modules/make-dir/", {"name":"make-dir","reference":"1.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-istanbul-lib-source-maps-3.0.2-f1e817229a9146e8424a28e5d69ba220fda34156/node_modules/istanbul-lib-source-maps/", {"name":"istanbul-lib-source-maps","reference":"3.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-istanbul-reports-2.1.1-72ef16b4ecb9a4a7bd0e2001e00f95d1eec8afa9/node_modules/istanbul-reports/", {"name":"istanbul-reports","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-handlebars-4.1.0-0d6a6f34ff1f63cecec8423aa4169827bf787c3a/node_modules/handlebars/", {"name":"handlebars","reference":"4.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-async-2.6.2-18330ea7e6e313887f5d2f2a904bac6fe4dd5381/node_modules/async/", {"name":"async","reference":"2.6.2"}],
  ["../../Library/Caches/Yarn/v4/npm-optimist-0.6.1-da3ea74686fa21a19a111c326e90eb15a0196686/node_modules/optimist/", {"name":"optimist","reference":"0.6.1"}],
  ["../../Library/Caches/Yarn/v4/npm-uglify-js-3.4.9-af02f180c1207d76432e473ed24a28f4a782bae3/node_modules/uglify-js/", {"name":"uglify-js","reference":"3.4.9"}],
  ["../../Library/Caches/Yarn/v4/npm-commander-2.17.1-bd77ab7de6de94205ceacc72f1716d29f20a77bf/node_modules/commander/", {"name":"commander","reference":"2.17.1"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-resolve-24.8.0-84b8e5408c1f6a11539793e2b5feb1b6e722439f/node_modules/jest-resolve/", {"name":"jest-resolve","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-browser-resolve-1.11.3-9b7cbb3d0f510e4cb86bdbd796124d28b5890af6/node_modules/browser-resolve/", {"name":"browser-resolve","reference":"1.11.3"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-pnp-resolver-1.2.1-ecdae604c077a7fbc70defb6d517c3c1c898923a/node_modules/jest-pnp-resolver/", {"name":"jest-pnp-resolver","reference":"1.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-runtime-24.8.0-05f94d5b05c21f6dc54e427cd2e4980923350620/node_modules/jest-runtime/", {"name":"jest-runtime","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-config-24.8.0-77db3d265a6f726294687cbbccc36f8a76ee0f4f/node_modules/jest-config/", {"name":"jest-config","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@jest-test-sequencer-24.8.0-2f993bcf6ef5eb4e65e8233a95a3320248cf994b/node_modules/@jest/test-sequencer/", {"name":"@jest/test-sequencer","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-runner-24.8.0-4f9ae07b767db27b740d7deffad0cf67ccb4c5bb/node_modules/jest-runner/", {"name":"jest-runner","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-docblock-24.3.0-b9c32dac70f72e4464520d2ba4aec02ab14db5dd/node_modules/jest-docblock/", {"name":"jest-docblock","reference":"24.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-detect-newline-2.1.0-f41f1c10be4b00e87b5f13da680759f2c5bfd3e2/node_modules/detect-newline/", {"name":"detect-newline","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-jasmine2-24.8.0-a9c7e14c83dd77d8b15e820549ce8987cc8cd898/node_modules/jest-jasmine2/", {"name":"jest-jasmine2","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-co-4.6.0-6ea6bdf3d853ae54ccb8e47bfa0bf3f9031fb184/node_modules/co/", {"name":"co","reference":"4.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-expect-24.8.0-471f8ec256b7b6129ca2524b2a62f030df38718d/node_modules/expect/", {"name":"expect","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-get-type-24.8.0-a7440de30b651f5a70ea3ed7ff073a32dfe646fc/node_modules/jest-get-type/", {"name":"jest-get-type","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-matcher-utils-24.8.0-2bce42204c9af12bde46f83dc839efe8be832495/node_modules/jest-matcher-utils/", {"name":"jest-matcher-utils","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-diff-24.8.0-146435e7d1e3ffdf293d53ff97e193f1d1546172/node_modules/jest-diff/", {"name":"jest-diff","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-diff-sequences-24.3.0-0f20e8a1df1abddaf4d9c226680952e64118b975/node_modules/diff-sequences/", {"name":"diff-sequences","reference":"24.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-pretty-format-24.8.0-8dae7044f58db7cb8be245383b565a963e3c27f2/node_modules/pretty-format/", {"name":"pretty-format","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-react-is-16.8.4-90f336a68c3a29a096a3d648ab80e87ec61482a2/node_modules/react-is/", {"name":"react-is","reference":"16.8.4"}],
  ["../../Library/Caches/Yarn/v4/npm-is-generator-fn-2.0.0-038c31b774709641bda678b1f06a4e3227c10b3e/node_modules/is-generator-fn/", {"name":"is-generator-fn","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-each-24.8.0-a05fd2bf94ddc0b1da66c6d13ec2457f35e52775/node_modules/jest-each/", {"name":"jest-each","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-snapshot-24.8.0-3bec6a59da2ff7bc7d097a853fb67f9d415cb7c6/node_modules/jest-snapshot/", {"name":"jest-snapshot","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-throat-4.1.0-89037cbc92c56ab18926e6ba4cbb200e15672a6a/node_modules/throat/", {"name":"throat","reference":"4.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-leak-detector-24.8.0-c0086384e1f650c2d8348095df769f29b48e6980/node_modules/jest-leak-detector/", {"name":"jest-leak-detector","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-source-map-support-0.5.10-2214080bc9d51832511ee2bab96e3c2f9353120c/node_modules/source-map-support/", {"name":"source-map-support","reference":"0.5.10"}],
  ["../../Library/Caches/Yarn/v4/npm-buffer-from-1.1.1-32713bc028f75c02fdb710d7c7bcec1f2c6070ef/node_modules/buffer-from/", {"name":"buffer-from","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-babel-jest-24.8.0-5c15ff2b28e20b0f45df43fe6b7f2aae93dba589/node_modules/babel-jest/", {"name":"babel-jest","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-babel-core-7.1.0-710f2487dda4dcfd010ca6abb2b4dc7394365c51/node_modules/@types/babel__core/", {"name":"@types/babel__core","reference":"7.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-babel-generator-7.0.2-d2112a6b21fad600d7674274293c85dce0cb47fc/node_modules/@types/babel__generator/", {"name":"@types/babel__generator","reference":"7.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-babel-template-7.0.2-4ff63d6b52eddac1de7b975a5223ed32ecea9307/node_modules/@types/babel__template/", {"name":"@types/babel__template","reference":"7.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-@types-babel-traverse-7.0.6-328dd1a8fc4cfe3c8458be9477b219ea158fd7b2/node_modules/@types/babel__traverse/", {"name":"@types/babel__traverse","reference":"7.0.6"}],
  ["../../Library/Caches/Yarn/v4/npm-babel-preset-jest-24.6.0-66f06136eefce87797539c0d63f1769cc3915984/node_modules/babel-preset-jest/", {"name":"babel-preset-jest","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-plugin-syntax-object-rest-spread-7.2.0-3b7a3e733510c57e820b9142a6579ac8b0dfad2e/node_modules/@babel/plugin-syntax-object-rest-spread/", {"name":"@babel/plugin-syntax-object-rest-spread","reference":"7.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-@babel-helper-plugin-utils-7.0.0-bbb3fbee98661c569034237cc03967ba99b4f250/node_modules/@babel/helper-plugin-utils/", {"name":"@babel/helper-plugin-utils","reference":"7.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-babel-plugin-jest-hoist-24.6.0-f7f7f7ad150ee96d7a5e8e2c5da8319579e78019/node_modules/babel-plugin-jest-hoist/", {"name":"babel-plugin-jest-hoist","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-environment-jsdom-24.8.0-300f6949a146cabe1c9357ad9e9ecf9f43f38857/node_modules/jest-environment-jsdom/", {"name":"jest-environment-jsdom","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jsdom-11.12.0-1a80d40ddd378a1de59656e9e6dc5a3ba8657bc8/node_modules/jsdom/", {"name":"jsdom","reference":"11.12.0"}],
  ["../../Library/Caches/Yarn/v4/npm-abab-2.0.0-aba0ab4c5eee2d4c79d3487d85450fb2376ebb0f/node_modules/abab/", {"name":"abab","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-acorn-globals-4.3.0-e3b6f8da3c1552a95ae627571f7dd6923bb54103/node_modules/acorn-globals/", {"name":"acorn-globals","reference":"4.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-acorn-walk-6.1.1-d363b66f5fac5f018ff9c3a1e7b6f8e310cc3913/node_modules/acorn-walk/", {"name":"acorn-walk","reference":"6.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-array-equal-1.0.0-8c2a5ef2472fd9ea742b04c77a75093ba2757c93/node_modules/array-equal/", {"name":"array-equal","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-cssom-0.3.6-f85206cee04efa841f3c5982a74ba96ab20d65ad/node_modules/cssom/", {"name":"cssom","reference":"0.3.6"}],
  ["../../Library/Caches/Yarn/v4/npm-cssstyle-1.2.1-3aceb2759eaf514ac1a21628d723d6043a819495/node_modules/cssstyle/", {"name":"cssstyle","reference":"1.2.1"}],
  ["../../Library/Caches/Yarn/v4/npm-data-urls-1.1.0-15ee0582baa5e22bb59c77140da8f9c76963bbfe/node_modules/data-urls/", {"name":"data-urls","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-whatwg-mimetype-2.3.0-3d4b1e0312d2079879f826aff18dbeeca5960fbf/node_modules/whatwg-mimetype/", {"name":"whatwg-mimetype","reference":"2.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-whatwg-url-7.0.0-fde926fa54a599f3adf82dff25a9f7be02dc6edd/node_modules/whatwg-url/", {"name":"whatwg-url","reference":"7.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-whatwg-url-6.5.0-f2df02bff176fd65070df74ad5ccbb5a199965a8/node_modules/whatwg-url/", {"name":"whatwg-url","reference":"6.5.0"}],
  ["../../Library/Caches/Yarn/v4/npm-lodash-sortby-4.7.0-edd14c824e2cc9c1e0b0a1b42bb5210516a42438/node_modules/lodash.sortby/", {"name":"lodash.sortby","reference":"4.7.0"}],
  ["../../Library/Caches/Yarn/v4/npm-tr46-1.0.1-a8b13fd6bfd2489519674ccde55ba3693b706d09/node_modules/tr46/", {"name":"tr46","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-webidl-conversions-4.0.2-a855980b1f0b6b359ba1d5d9fb39ae941faa63ad/node_modules/webidl-conversions/", {"name":"webidl-conversions","reference":"4.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-domexception-1.0.1-937442644ca6a31261ef36e3ec677fe805582c90/node_modules/domexception/", {"name":"domexception","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-escodegen-1.11.1-c485ff8d6b4cdb89e27f4a856e91f118401ca510/node_modules/escodegen/", {"name":"escodegen","reference":"1.11.1"}],
  ["../../Library/Caches/Yarn/v4/npm-html-encoding-sniffer-1.0.2-e70d84b94da53aa375e11fe3a351be6642ca46f8/node_modules/html-encoding-sniffer/", {"name":"html-encoding-sniffer","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-whatwg-encoding-1.0.5-5abacf777c32166a51d085d6b4f3e7d27113ddb0/node_modules/whatwg-encoding/", {"name":"whatwg-encoding","reference":"1.0.5"}],
  ["../../Library/Caches/Yarn/v4/npm-left-pad-1.3.0-5b8a3a7765dfe001261dde915589e782f8c94d1e/node_modules/left-pad/", {"name":"left-pad","reference":"1.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-nwsapi-2.1.1-08d6d75e69fd791bdea31507ffafe8c843b67e9c/node_modules/nwsapi/", {"name":"nwsapi","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-parse5-4.0.0-6d78656e3da8d78b4ec0b906f7c08ef1dfe3f608/node_modules/parse5/", {"name":"parse5","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-pn-1.1.0-e2f4cef0e219f463c179ab37463e4e1ecdccbafb/node_modules/pn/", {"name":"pn","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-request-2.88.0-9c2fca4f7d35b592efe57c7f0a55e81052124fef/node_modules/request/", {"name":"request","reference":"2.88.0"}],
  ["../../Library/Caches/Yarn/v4/npm-aws-sign2-0.7.0-b46e890934a9591f2d2f6f86d7e6a9f1b3fe76a8/node_modules/aws-sign2/", {"name":"aws-sign2","reference":"0.7.0"}],
  ["../../Library/Caches/Yarn/v4/npm-aws4-1.8.0-f0e003d9ca9e7f59c7a508945d7b2ef9a04a542f/node_modules/aws4/", {"name":"aws4","reference":"1.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-caseless-0.12.0-1b681c21ff84033c826543090689420d187151dc/node_modules/caseless/", {"name":"caseless","reference":"0.12.0"}],
  ["../../Library/Caches/Yarn/v4/npm-combined-stream-1.0.7-2d1d24317afb8abe95d6d2c0b07b57813539d828/node_modules/combined-stream/", {"name":"combined-stream","reference":"1.0.7"}],
  ["../../Library/Caches/Yarn/v4/npm-delayed-stream-1.0.0-df3ae199acadfb7d440aaae0b29e2272b24ec619/node_modules/delayed-stream/", {"name":"delayed-stream","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-extend-3.0.2-f8b1136b4071fbd8eb140aff858b1019ec2915fa/node_modules/extend/", {"name":"extend","reference":"3.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-forever-agent-0.6.1-fbc71f0c41adeb37f96c577ad1ed42d8fdacca91/node_modules/forever-agent/", {"name":"forever-agent","reference":"0.6.1"}],
  ["../../Library/Caches/Yarn/v4/npm-form-data-2.3.3-dcce52c05f644f298c6a7ab936bd724ceffbf3a6/node_modules/form-data/", {"name":"form-data","reference":"2.3.3"}],
  ["../../Library/Caches/Yarn/v4/npm-asynckit-0.4.0-c79ed97f7f34cb8f2ba1bc9790bcc366474b4b79/node_modules/asynckit/", {"name":"asynckit","reference":"0.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-mime-types-2.1.22-fe6b355a190926ab7698c9a0556a11199b2199bd/node_modules/mime-types/", {"name":"mime-types","reference":"2.1.22"}],
  ["../../Library/Caches/Yarn/v4/npm-mime-db-1.38.0-1a2aab16da9eb167b49c6e4df2d9c68d63d8e2ad/node_modules/mime-db/", {"name":"mime-db","reference":"1.38.0"}],
  ["../../Library/Caches/Yarn/v4/npm-har-validator-5.1.3-1ef89ebd3e4996557675eed9893110dc350fa080/node_modules/har-validator/", {"name":"har-validator","reference":"5.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-har-schema-2.0.0-a94c2224ebcac04782a0d9035521f24735b7ec92/node_modules/har-schema/", {"name":"har-schema","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-http-signature-1.2.0-9aecd925114772f3d95b65a60abb8f7c18fbace1/node_modules/http-signature/", {"name":"http-signature","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-assert-plus-1.0.0-f12e0f3c5d77b0b1cdd9146942e4e96c1e4dd525/node_modules/assert-plus/", {"name":"assert-plus","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jsprim-1.4.1-313e66bc1e5cc06e438bc1b7499c2e5c56acb6a2/node_modules/jsprim/", {"name":"jsprim","reference":"1.4.1"}],
  ["../../Library/Caches/Yarn/v4/npm-extsprintf-1.3.0-96918440e3041a7a414f8c52e3c574eb3c3e1e05/node_modules/extsprintf/", {"name":"extsprintf","reference":"1.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-extsprintf-1.4.0-e2689f8f356fad62cca65a3a91c5df5f9551692f/node_modules/extsprintf/", {"name":"extsprintf","reference":"1.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-json-schema-0.2.3-b480c892e59a2f05954ce727bd3f2a4e882f9e13/node_modules/json-schema/", {"name":"json-schema","reference":"0.2.3"}],
  ["../../Library/Caches/Yarn/v4/npm-verror-1.10.0-3a105ca17053af55d6e270c1f8288682e18da400/node_modules/verror/", {"name":"verror","reference":"1.10.0"}],
  ["../../Library/Caches/Yarn/v4/npm-sshpk-1.16.1-fb661c0bef29b39db40769ee39fa70093d6f6877/node_modules/sshpk/", {"name":"sshpk","reference":"1.16.1"}],
  ["../../Library/Caches/Yarn/v4/npm-asn1-0.2.4-8d2475dfab553bb33e77b54e59e880bb8ce23136/node_modules/asn1/", {"name":"asn1","reference":"0.2.4"}],
  ["../../Library/Caches/Yarn/v4/npm-bcrypt-pbkdf-1.0.2-a4301d389b6a43f9b67ff3ca11a3f6637e360e9e/node_modules/bcrypt-pbkdf/", {"name":"bcrypt-pbkdf","reference":"1.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-tweetnacl-0.14.5-5ae68177f192d4456269d108afa93ff8743f4f64/node_modules/tweetnacl/", {"name":"tweetnacl","reference":"0.14.5"}],
  ["../../Library/Caches/Yarn/v4/npm-dashdash-1.14.1-853cfa0f7cbe2fed5de20326b8dd581035f6e2f0/node_modules/dashdash/", {"name":"dashdash","reference":"1.14.1"}],
  ["../../Library/Caches/Yarn/v4/npm-ecc-jsbn-0.1.2-3a83a904e54353287874c564b7549386849a98c9/node_modules/ecc-jsbn/", {"name":"ecc-jsbn","reference":"0.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-jsbn-0.1.1-a5e654c2e5a2deb5f201d96cefbca80c0ef2f513/node_modules/jsbn/", {"name":"jsbn","reference":"0.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-getpass-0.1.7-5eff8e3e684d569ae4cb2b1282604e8ba62149fa/node_modules/getpass/", {"name":"getpass","reference":"0.1.7"}],
  ["../../Library/Caches/Yarn/v4/npm-is-typedarray-1.0.0-e479c80858df0c1b11ddda6940f96011fcda4a9a/node_modules/is-typedarray/", {"name":"is-typedarray","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-isstream-0.1.2-47e63f7af55afa6f92e1500e690eb8b8529c099a/node_modules/isstream/", {"name":"isstream","reference":"0.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-json-stringify-safe-5.0.1-1296a2d58fd45f19a0f6ce01d65701e2c735b6eb/node_modules/json-stringify-safe/", {"name":"json-stringify-safe","reference":"5.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-oauth-sign-0.9.0-47a7b016baa68b5fa0ecf3dee08a85c679ac6455/node_modules/oauth-sign/", {"name":"oauth-sign","reference":"0.9.0"}],
  ["../../Library/Caches/Yarn/v4/npm-performance-now-2.1.0-6309f4e0e5fa913ec1c69307ae364b4b377c9e7b/node_modules/performance-now/", {"name":"performance-now","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-qs-6.5.2-cb3ae806e8740444584ef154ce8ee98d403f3e36/node_modules/qs/", {"name":"qs","reference":"6.5.2"}],
  ["../../Library/Caches/Yarn/v4/npm-tough-cookie-2.4.3-53f36da3f47783b0925afa06ff9f3b165280f781/node_modules/tough-cookie/", {"name":"tough-cookie","reference":"2.4.3"}],
  ["../../Library/Caches/Yarn/v4/npm-tough-cookie-2.5.0-cd9fb2a0aa1d5a12b473bd9fb96fa3dcff65ade2/node_modules/tough-cookie/", {"name":"tough-cookie","reference":"2.5.0"}],
  ["../../Library/Caches/Yarn/v4/npm-psl-1.1.31-e9aa86d0101b5b105cbe93ac6b784cd547276184/node_modules/psl/", {"name":"psl","reference":"1.1.31"}],
  ["../../Library/Caches/Yarn/v4/npm-tunnel-agent-0.6.0-27a5dea06b36b04a0a9966774b290868f0fc40fd/node_modules/tunnel-agent/", {"name":"tunnel-agent","reference":"0.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-uuid-3.3.2-1b4af4955eb3077c501c23872fc6513811587131/node_modules/uuid/", {"name":"uuid","reference":"3.3.2"}],
  ["../../Library/Caches/Yarn/v4/npm-request-promise-native-1.0.7-a49868a624bdea5069f1251d0a836e0d89aa2c59/node_modules/request-promise-native/", {"name":"request-promise-native","reference":"1.0.7"}],
  ["../../Library/Caches/Yarn/v4/npm-request-promise-core-1.1.2-339f6aababcafdb31c799ff158700336301d3346/node_modules/request-promise-core/", {"name":"request-promise-core","reference":"1.1.2"}],
  ["../../Library/Caches/Yarn/v4/npm-stealthy-require-1.1.1-35b09875b4ff49f26a777e509b3090a3226bf24b/node_modules/stealthy-require/", {"name":"stealthy-require","reference":"1.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-symbol-tree-3.2.2-ae27db38f660a7ae2e1c3b7d1bc290819b8519e6/node_modules/symbol-tree/", {"name":"symbol-tree","reference":"3.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-w3c-hr-time-1.0.1-82ac2bff63d950ea9e3189a58a65625fedf19045/node_modules/w3c-hr-time/", {"name":"w3c-hr-time","reference":"1.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-browser-process-hrtime-0.1.3-616f00faef1df7ec1b5bf9cfe2bdc3170f26c7b4/node_modules/browser-process-hrtime/", {"name":"browser-process-hrtime","reference":"0.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-ws-5.2.2-dffef14866b8e8dc9133582514d1befaf96e980f/node_modules/ws/", {"name":"ws","reference":"5.2.2"}],
  ["../../Library/Caches/Yarn/v4/npm-async-limiter-1.0.0-78faed8c3d074ab81f22b4e985d79e8738f720f8/node_modules/async-limiter/", {"name":"async-limiter","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-xml-name-validator-3.0.0-6ae73e06de4d8c6e47f9fb181f78d648ad457c6a/node_modules/xml-name-validator/", {"name":"xml-name-validator","reference":"3.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-environment-node-24.8.0-d3f726ba8bc53087a60e7a84ca08883a4c892231/node_modules/jest-environment-node/", {"name":"jest-environment-node","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-validate-24.8.0-624c41533e6dfe356ffadc6e2423a35c2d3b4849/node_modules/jest-validate/", {"name":"jest-validate","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-camelcase-5.0.0-03295527d58bd3cd4aa75363f35b2e8d97be2f42/node_modules/camelcase/", {"name":"camelcase","reference":"5.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-leven-2.1.0-c2e7a9f772094dee9d34202ae8acce4687875580/node_modules/leven/", {"name":"leven","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-yargs-12.0.5-05f5997b609647b64f66b81e3b4b10a368e7ad13/node_modules/yargs/", {"name":"yargs","reference":"12.0.5"}],
  ["../../Library/Caches/Yarn/v4/npm-cliui-4.1.0-348422dbe82d800b3022eef4f6ac10bf2e4d1b49/node_modules/cliui/", {"name":"cliui","reference":"4.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-wrap-ansi-2.1.0-d8fc3d284dd05794fe84973caecdd1cf824fdd85/node_modules/wrap-ansi/", {"name":"wrap-ansi","reference":"2.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-decamelize-1.2.0-f6534d15148269b20352e7bee26f501f9a191290/node_modules/decamelize/", {"name":"decamelize","reference":"1.2.0"}],
  ["../../Library/Caches/Yarn/v4/npm-get-caller-file-1.0.3-f978fa4c90d1dfe7ff2d6beda2a515e713bdcf4a/node_modules/get-caller-file/", {"name":"get-caller-file","reference":"1.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-os-locale-3.1.0-a802a6ee17f24c10483ab9935719cef4ed16bf1a/node_modules/os-locale/", {"name":"os-locale","reference":"3.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-lcid-2.0.0-6ef5d2df60e52f82eb228a4c373e8d1f397253cf/node_modules/lcid/", {"name":"lcid","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-invert-kv-2.0.0-7393f5afa59ec9ff5f67a27620d11c226e3eec02/node_modules/invert-kv/", {"name":"invert-kv","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-mem-4.1.0-aeb9be2d21f47e78af29e4ac5978e8afa2ca5b8a/node_modules/mem/", {"name":"mem","reference":"4.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-map-age-cleaner-0.1.3-7d583a7306434c055fe474b0f45078e6e1b4b92a/node_modules/map-age-cleaner/", {"name":"map-age-cleaner","reference":"0.1.3"}],
  ["../../Library/Caches/Yarn/v4/npm-p-defer-1.0.0-9f6eb182f6c9aa8cd743004a7d4f96b196b0fb0c/node_modules/p-defer/", {"name":"p-defer","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-is-promise-2.0.0-7554e3d572109a87e1f3f53f6a7d85d1b194f4c5/node_modules/p-is-promise/", {"name":"p-is-promise","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-require-directory-2.1.1-8c64ad5fd30dab1c976e2344ffe7f792a6a6df42/node_modules/require-directory/", {"name":"require-directory","reference":"2.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-which-module-2.0.0-d9ef07dce77b9902b8a3a8fa4b31c3e3f7e6e87a/node_modules/which-module/", {"name":"which-module","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-y18n-4.0.0-95ef94f85ecc81d007c264e190a120f0a3c8566b/node_modules/y18n/", {"name":"y18n","reference":"4.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-yargs-parser-11.1.1-879a0865973bca9f6bab5cbdf3b1c67ec7d3bcf4/node_modules/yargs-parser/", {"name":"yargs-parser","reference":"11.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-node-notifier-5.4.0-7b455fdce9f7de0c63538297354f3db468426e6a/node_modules/node-notifier/", {"name":"node-notifier","reference":"5.4.0"}],
  ["../../Library/Caches/Yarn/v4/npm-growly-1.3.0-f10748cbe76af964b7c96c93c6bcc28af120c081/node_modules/growly/", {"name":"growly","reference":"1.3.0"}],
  ["../../Library/Caches/Yarn/v4/npm-is-wsl-1.1.0-1f16e4aa22b04d1336b66188a66af3c600c3a66d/node_modules/is-wsl/", {"name":"is-wsl","reference":"1.1.0"}],
  ["../../Library/Caches/Yarn/v4/npm-shellwords-0.1.1-d6b9181c1a48d397324c84871efbcfc73fc0654b/node_modules/shellwords/", {"name":"shellwords","reference":"0.1.1"}],
  ["../../Library/Caches/Yarn/v4/npm-string-length-2.0.0-d40dbb686a3ace960c1cffca562bf2c45f8363ed/node_modules/string-length/", {"name":"string-length","reference":"2.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-changed-files-24.8.0-7e7eb21cf687587a85e50f3d249d1327e15b157b/node_modules/jest-changed-files/", {"name":"jest-changed-files","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-resolve-dependencies-24.8.0-19eec3241f2045d3f990dba331d0d7526acff8e0/node_modules/jest-resolve-dependencies/", {"name":"jest-resolve-dependencies","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-watcher-24.8.0-58d49915ceddd2de85e238f6213cef1c93715de4/node_modules/jest-watcher/", {"name":"jest-watcher","reference":"24.8.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-watcher-24.6.0-f66a49a4c89f60626730121d74e36dc006c53c2f/node_modules/jest-watcher/", {"name":"jest-watcher","reference":"24.6.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-each-series-1.0.0-930f3d12dd1f50e7434457a22cd6f04ac6ad7f71/node_modules/p-each-series/", {"name":"p-each-series","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-p-reduce-1.0.0-18c2b0dd936a4690a529f8231f58a0fdb6a47dfa/node_modules/p-reduce/", {"name":"p-reduce","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-pirates-4.0.1-643a92caf894566f91b2b986d2c66950a8e2fb87/node_modules/pirates/", {"name":"pirates","reference":"4.0.1"}],
  ["../../Library/Caches/Yarn/v4/npm-node-modules-regexp-1.0.0-8d9dbe28964a4ac5712e9131642107c71e90ec40/node_modules/node-modules-regexp/", {"name":"node-modules-regexp","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-prompts-2.0.3-c5ccb324010b2e8f74752aadceeb57134c1d2522/node_modules/prompts/", {"name":"prompts","reference":"2.0.3"}],
  ["../../Library/Caches/Yarn/v4/npm-kleur-3.0.2-83c7ec858a41098b613d5998a7b653962b504f68/node_modules/kleur/", {"name":"kleur","reference":"3.0.2"}],
  ["../../Library/Caches/Yarn/v4/npm-sisteransi-1.0.0-77d9622ff909080f1c19e5f4a1df0c1b0a27b88c/node_modules/sisteransi/", {"name":"sisteransi","reference":"1.0.0"}],
  ["../../Library/Caches/Yarn/v4/npm-jest-watch-typeahead-0.3.1-47701024b64b444aa325d801b4b3a6d61ed70701/node_modules/jest-watch-typeahead/", {"name":"jest-watch-typeahead","reference":"0.3.1"}],
  ["./", topLevelLocator],
]);
exports.findPackageLocator = function findPackageLocator(location) {
  let relativeLocation = normalizePath(path.relative(__dirname, location));

  if (!relativeLocation.match(isStrictRegExp))
    relativeLocation = `./${relativeLocation}`;

  if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
    relativeLocation = `${relativeLocation}/`;

  let match;

  if (relativeLocation.length >= 173 && relativeLocation[172] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 173)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 171 && relativeLocation[170] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 171)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 169 && relativeLocation[168] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 169)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 159 && relativeLocation[158] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 159)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 151 && relativeLocation[150] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 151)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 149 && relativeLocation[148] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 149)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 147 && relativeLocation[146] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 147)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 146 && relativeLocation[145] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 146)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 145 && relativeLocation[144] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 145)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 143 && relativeLocation[142] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 143)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 142 && relativeLocation[141] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 142)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 141 && relativeLocation[140] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 141)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 140 && relativeLocation[139] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 140)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 139 && relativeLocation[138] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 139)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 138 && relativeLocation[137] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 138)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 137 && relativeLocation[136] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 137)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 136 && relativeLocation[135] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 136)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 135 && relativeLocation[134] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 135)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 133 && relativeLocation[132] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 133)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 132 && relativeLocation[131] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 132)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 131 && relativeLocation[130] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 131)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 130 && relativeLocation[129] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 130)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 129 && relativeLocation[128] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 129)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 128 && relativeLocation[127] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 128)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 127 && relativeLocation[126] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 127)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 126 && relativeLocation[125] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 126)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 125 && relativeLocation[124] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 125)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 124 && relativeLocation[123] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 124)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 123 && relativeLocation[122] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 123)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 122 && relativeLocation[121] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 122)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 121 && relativeLocation[120] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 121)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 120 && relativeLocation[119] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 120)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 119 && relativeLocation[118] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 119)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 118 && relativeLocation[117] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 118)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 117 && relativeLocation[116] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 117)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 116 && relativeLocation[115] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 116)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 115 && relativeLocation[114] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 115)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 114 && relativeLocation[113] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 114)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 113 && relativeLocation[112] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 113)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 112 && relativeLocation[111] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 112)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 111 && relativeLocation[110] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 111)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 110 && relativeLocation[109] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 110)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 109 && relativeLocation[108] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 109)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 108 && relativeLocation[107] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 108)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 107 && relativeLocation[106] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 107)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 106 && relativeLocation[105] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 106)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 105 && relativeLocation[104] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 105)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 104 && relativeLocation[103] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 104)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 103 && relativeLocation[102] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 103)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 102 && relativeLocation[101] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 102)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 101 && relativeLocation[100] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 101)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 99 && relativeLocation[98] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 99)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 2 && relativeLocation[1] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 2)))
      return blacklistCheck(match);

  return null;
};


/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        const resolution = applyNodeExtensionResolution(nextUnqualifiedPath, {extensions});

        if (resolution !== null) {
          return resolution;
        }
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

function normalizePath(fsPath) {
  fsPath = path.normalize(fsPath);

  if (process.platform === 'win32') {
    fsPath = fsPath.replace(backwardSlashRegExp, '/');
  }

  return fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
  // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

  if (request === `pnpapi`) {
    return pnpFile;
  }

  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(normalizePath(issuer))) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "null")`,
        {
          request,
          issuer,
        }
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer,
          }
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            {request, issuer, dependencyName}
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName}
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            {request, issuer, dependencyName}
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `
            )})`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates}
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = {name: dependencyName, reference: dependencyReference};
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)}
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  {extensions = Object.keys(Module._extensions)} = {}
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      {unqualifiedPath}
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, {considerBuiltins});
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer,
          }
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath, {extensions});
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, {request, issuer});
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    for (const [filter, patchFn] of patchedModules) {
      if (filter.test(request)) {
        module.exports = patchFn(exports.findPackageLocator(parent.filename), module.exports);
      }
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    let issuers;

    if (options) {
      const optionNames = new Set(Object.keys(options));
      optionNames.delete('paths');

      if (optionNames.size > 0) {
        throw makeError(
          `UNSUPPORTED`,
          `Some options passed to require() aren't supported by PnP yet (${Array.from(optionNames).join(', ')})`
        );
      }

      if (options.paths) {
        issuers = options.paths.map(entry => `${path.normalize(entry)}/`);
      }
    }

    if (!issuers) {
      const issuerModule = getIssuerModule(parent);
      const issuer = issuerModule ? issuerModule.filename : `${process.cwd()}/`;

      issuers = [issuer];
    }

    let firstError;

    for (const issuer of issuers) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, issuer);
      } catch (error) {
        firstError = firstError || error;
        continue;
      }

      return resolution !== null ? resolution : request;
    }

    throw firstError;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);
};

exports.setupCompatibilityLayer = () => {
  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({name, reference});
      }
    }
  }

  // Modern versions of `resolve` support a specific entry point that custom resolvers can use
  // to inject a specific resolution logic without having to patch the whole package.
  //
  // Cf: https://github.com/browserify/resolve/pull/174

  patchedModules.push([
    /^\.\/normalize-options\.js$/,
    (issuer, normalizeOptions) => {
      if (!issuer || issuer.name !== 'resolve') {
        return normalizeOptions;
      }

      return (request, opts) => {
        opts = opts || {};

        if (opts.forceNodeResolution) {
          return opts;
        }

        opts.preserveSymlinks = true;
        opts.paths = function(request, basedir, getNodeModulesDir, opts) {
          // Extract the name of the package being requested (1=full name, 2=scope name, 3=local name)
          const parts = request.match(/^((?:(@[^\/]+)\/)?([^\/]+))/);

          // make sure that basedir ends with a slash
          if (basedir.charAt(basedir.length - 1) !== '/') {
            basedir = path.join(basedir, '/');
          }
          // This is guaranteed to return the path to the "package.json" file from the given package
          const manifestPath = exports.resolveToUnqualified(`${parts[1]}/package.json`, basedir);

          // The first dirname strips the package.json, the second strips the local named folder
          let nodeModules = path.dirname(path.dirname(manifestPath));

          // Strips the scope named folder if needed
          if (parts[2]) {
            nodeModules = path.dirname(nodeModules);
          }

          return [nodeModules];
        };

        return opts;
      };
    },
  ]);
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
