'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var Bot = require('slackbots');
var io = require('socket.io').listen(8000);
var fs = require('fs');

var configChannel = 'foosball';
var timerStarted = false;
var players = [];
var currentUser;
    
var userMap = new Map();
  userMap.set("U02DXHA8Q","Alecia");
  userMap.set("U02DWKVSD","Brentan");
  userMap.set("U02DXGZKJ","Chris");
  userMap.set("U2MP4P3C1","Danny");
  userMap.set("U02G7G6EQ","Erik");
  userMap.set("U3R4W0VAR","Joel");
  userMap.set("U02D31X9V","Josh");
  userMap.set("U02D3247T","Jon");
  userMap.set("U02EE639P","Lucas");
  userMap.set("U02D3291H","Matt");
  userMap.set("U1HBGH8P9","Mark");
  userMap.set("U1Z1H4GMR","Russell");
  userMap.set("U02DWU1V7","Simon");

var FoosBot = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'foosbot';
    
    this.user = null;
};

util.inherits(FoosBot, Bot);

FoosBot.prototype.run = function () {
    FoosBot.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

FoosBot.prototype._onStart = function () {
    var self = this;

    io.sockets.on('connect', function (socket) {
        console.log('Connection established.');

        socket.on('message', function(message) {
            console.log('Received game confirmation: ', message);
            self._onGameMessage(message);
        });
    });

    console.log('Bot started.');
    self.postMessageToChannel(configChannel, 'Hey, I am Foosbot. If you mention foosball I will start a game up.', {as_user: true});
    self._loadBotUser();   
};

FoosBot.prototype._onMessage = function(message) {
    if (this._isChatMessage(message)) {
    console.log('Checking message: ', message.text);
        if (this._isChannelConversation(message) && !this._isFromFoosBot(message) && this._isFoosballChannel(message.channel)) {
            if (this._isMentioningFoosball(message)){
                this._initiateGame(message.user);
            }
            if (this._isJoinGameMessage(message)){
                this._addToGame(message.user);
            }
        }
    } 
        
};

FoosBot.prototype._onGameMessage = function(message) {
    var self = this;

    if (message == 'SUCCESS') {
        console.log('Game starting...');
        timerStarted = true;
        io.emit('message', 'COUNTDOWN');

        self.postMessageToChannel(configChannel, 'It\'s time to foos! Send \'!\' in the next minute to join the game.', {as_user: true});
        self._addToGame(currentUser);

        setTimeout( function() {
                        self._newGame();
                    }, 60000 );
    } 
    else if (message == 'ERROR') {
        console.log('Game already started.');
        self.postMessageToChannel(configChannel, 'Foosball UI needs to be refreshed first. Please refresh and try again.', {as_user: true});
    }
        
};

FoosBot.prototype._initiateGame = function(user) {
    console.log(user + ' started game. Game already started: ', timerStarted);
    currentUser = user;
    
    if (timerStarted == false) {
    console.log('Sending CHECK');
        io.emit('message', 'CHECK');
    }
};

FoosBot.prototype._addToGame = function(user) {
    var self = this;

    var userName = userMap.get(user);

    if (timerStarted) {
        if (players.includes(userName)) {
            self.postMessageToChannel(configChannel, 'You\'re already playing, ' + userName + '.', {as_user: true});
        } 
        else if (!players.includes(userName)) {
            players.push(userName);
            self.postMessageToChannel(configChannel, userName + ' joins the game.', {as_user: true});
            io.emit('newplayer', userName);
        }
    }
    if (!timerStarted) {
        self.postMessageToChannel(configChannel, 'There\'s no game to join ' + userName + ' :(', {as_user: true});
    }
}

FoosBot.prototype._newGame = function() {
    var self = this;

    if (players.length < 4) {
        self.postMessageToChannel(configChannel, 'Not enough interested players for a full game. :(', {as_user: true});
        socket.emit('message', 'RELOAD');
    } else {
        self.postMessageToChannel(configChannel, 'Starting game with: ' + players.join(', ') + '. Good luck!', {as_user: true});
        io.emit('message', 'START');
    }

    players = [];
    timerStarted = false;
}

FoosBot.prototype._loadBotUser = function () {
    var self = this;

    this.user = this.users.filter(function (user) {
        return user.name === self.name.toLowerCase();
    })[0];
};

FoosBot.prototype._isChatMessage = function (message) {
    var isChat = message.type === 'message' && Boolean(message.text);
    // console.log('Is chat message?', isChat);
    return isChat;
};

FoosBot.prototype._isChannelConversation = function (message) {
    var isChannelConversation = typeof message.channel === 'string' && message.channel[0] === 'C';
    // console.log('Is channel conversation?', isChannelConversation);
    return isChannelConversation;
};

FoosBot.prototype._isFromFoosBot = function (message) {
    var isFromBot = message.user === this.user.id;
    // console.log('Is from FoosBot?', isFromBot);
    return isFromBot;
};

FoosBot.prototype._isMentioningFoosball = function (message) {
    var isMentioningFoosball = message.text.toLowerCase().indexOf('foosball') > -1 || message.text.toLowerCase().indexOf(this.name.toLowerCase()) > -1;
    // console.log('Is mentioning foosball or FoosBot?', isMentioningFoosball);
    return isMentioningFoosball;
};

FoosBot.prototype._isJoinGameMessage = function (message) {
    var isJoinGameMessage = message.text.indexOf('!') > -1 && message.text.length == 1;
    return isJoinGameMessage;
};

FoosBot.prototype._isFoosballChannel = function (channel) {
    var isFoosballChannel = this._getChannelById(channel) == configChannel;
    // console.log(this._getChannelById(channel), 'Is foosball channel?', isFoosballChannel);
    return isFoosballChannel;
};

FoosBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0].name;
};

module.exports = FoosBot;