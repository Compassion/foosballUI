'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var Bot = require('slackbots');
var http = require('http');
var io = require('socket.io');
var fs = require('fs');

var server = http.createServer();
    server.listen(8000);
var socket = io.listen(server);
var configChannel = 'foosball';

var timerStarted = false;
var players = [];
var currentUser;

var userMap = new Map();
  map.set("U02DXHA8Q","Alecia");
  map.set("U02DWKVSD","Brentan");
  map.set("U02DXGZKJ","Chris");
  map.set("U2MP4P3C1","Danny");
  map.set("U02G7G6EQ","Erik");
  map.set("U3R4W0VAR","Joel");
  map.set("U02D31X9V","Josh");
  map.set("U02D3247T","Jon");
  map.set("U02EE639P","Lucas");
  map.set("U02D3291H","Matt");
  map.set("U1HBGH8P9","Mark");
  map.set("U1Z1H4GMR","Russell");
  map.set("U02DWU1V7","Simon");

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
    this.on('game', this._onGameMessage);
};

FoosBot.prototype._onStart = function () {
    console.log('Bot started.');
    this._loadBotUser();
    this._welcomeMessage();
};

FoosBot.prototype._onMessage = function(message) {
    console.log('Checking message: ', message.text);
    if (this._isChatMessage(message)) {
        if (this._isChannelConversation(message) &&
            !this._isFromFoosBot(message) &&
            this._isFoosballChannel(message.channel)) 
        {
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
    console.log('Checking message: ', message.text);
    if (message == 'SUCCESS') {
        timerStarted = true;
        setTimeout( _newGame, 60000 );
        self.postMessageToChannel(configChannel, 'It\'s time to foos! Send \'!\' in the next minute to join the potential players...', {as_user: true});
        self._addToGame(currentUser);
    } else if (message == 'ERROR') {
        self.postMessageToChannel(configChannel, 'Foosball UI needs to be refreshed first. Try again shortly.', {as_user: true});
    }
        
};
FoosBot.prototype._initiateGame = function(user) {
    var self = this;
    currentUser = user;
    
    if (!timerStarted) {
        socket.emit('message', 'COUNTDOWN');
    }
};

FoosBot.prototype._addToGame = function(user) {
    var userName = userMap.get(user);
    if (timerStarted) {
        if (!players.includes(userName)) {
            players.push(userName);
            self.postMessageToChannel(configChannel, userName + ' wants to play.', {as_user: true});
            socket.emit('newplayer', userName);
        }
    }
    if (!timerStarted) {
        self.postMessageToChannel(configChannel, 'There\'s no game to join ' + userName + ' :(', {as_user: true});
    }
}

FoosBot.prototype._newGame = function() {

    if (players.length < 4) {
        self.postMessageToChannel(configChannel, 'Not enough interested players for a full game. :(', {as_user: true});
    } else {
        self.postMessageToChannel(configChannel, 'Starting game with ' + players.join(', ') + '. Good luck!', {as_user: true});
        socket.emit('message', 'START');
    }

    timerStarted = false;
}

FoosBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name.toLowerCase();
    })[0];
};

FoosBot.prototype._welcomeMessage = function () {
    //this.postMessageToChannel(configChannel, 'Hey, I am Foosbot. If you mention foosball I will start a game up.', {as_user: true});   
};

FoosBot.prototype._isChatMessage = function (message) {
    var isChat = message.type === 'message' && Boolean(message.text);
    //console.log('Is chat message?', isChat);
    return isChat;
};

FoosBot.prototype._isChannelConversation = function (message) {
    var isChannelConversation = typeof message.channel === 'string' && message.channel[0] === 'C';
    //console.log('Is channel conversation?', isChannelConversation);
    return isChannelConversation;
};

FoosBot.prototype._isFromFoosBot = function (message) {
    var isFromBot = message.user === this.user.id;
    //console.log('Is from FoosBot?', isFromBot);
    return isFromBot;
};

FoosBot.prototype._isMentioningFoosball = function (message) {
    var isMentioningFoosball = message.text.toLowerCase().indexOf('foosball') > -1 || message.text.toLowerCase().indexOf(this.name.toLowerCase()) > -1;
    //console.log('Is mentioning foosball or FoosBot?', isMentioningFoosball);
    return isMentioningFoosball;
};

FoosBot.prototype._isJoinGameMessage = function (message) {
    var isJoinGameMessage = message.text.toLowerCase().indexOf('!') > -1 || message.text.length() == 1;
    return isJoinGameMessage;
};

FoosBot.prototype._isFoosballChannel = function (channel) {
    var isFoosballChannel = this._getChannelById(channel) == configChannel;

    //console.log(this._getChannelById(channel), 'Is foosball channel?', isFoosballChannel);
    return isFoosballChannel;
};

FoosBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0].name;
};

module.exports = FoosBot;