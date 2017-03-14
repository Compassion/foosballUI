var FoosBot = require('./lib/foosbot');
var config = require('foosbot_config.js');

var iFoosbot = new FoosBot({
    token: config.token,
    name: 'FoosBot'
});

iFoosbot.run();