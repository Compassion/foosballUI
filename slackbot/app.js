var FoosBot = require('./lib/foosbot');
var token = 'xoxb-151251381220-YTB4ZIyCP3ZTZEHO4kWuSxQT';

var iFoosbot = new FoosBot({
    token: token,
    name: 'FoosBot'
});

iFoosbot.run();