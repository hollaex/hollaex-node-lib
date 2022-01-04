'use strict';

const Kit = require('./kit');

// To maintain backwards compatibility for `const { Kit } = require("hollaex-node-lib")`
class BackwardsCompatibleKit extends Kit {
    static get Kit() {
        return Kit;
    }
}

module.exports = BackwardsCompatibleKit;