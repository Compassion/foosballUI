var FoosBot = require('./lib/foosbot.js');
var config = require('./lib/foosbot_config.js');

var iFoosbot = new FoosBot({
    token: config.token,
    name: 'FoosBot'
});

iFoosbot.run();