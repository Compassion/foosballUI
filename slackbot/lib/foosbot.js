'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var Bot = require('slackbots');
var http = require('http');
var io = require('socket.io');

var server = http.createServer();
    server.listen(8000);
var socket = io.listen(server);
var configChannel = 'foosball';

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
    console.log('Bot started.');
    this._loadBotUser();
    this._welcomeMessage();
};

FoosBot.prototype._onMessage = function (message) {
    console.log('Checking message: ', message.text);
    if (this._isChatMessage(message)) {
        if (this._isChannelConversation(message) &&
            !this._isFromFoosBot(message) &&
            this._isMentioningFoosball(message) &&
            this._isFoosballChannel(message.channel)) 
        {
        console.log('Message valid.');
        this._announceGame(message);
        }
    } 
        
};

FoosBot.prototype._announceGame = function (originalMessage) {
    var self = this;
    self.postMessageToChannel(configChannel, 'It\'s time to foos!', {as_user: true});
    socket.emit('message', 'NEWGAME');
};

FoosBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name.toLowerCase();
    })[0];
};

FoosBot.prototype._welcomeMessage = function () {
    this.postMessageToChannel(configChannel, 'Hey, I am Foosbot. If you mention foosball I will start a game up.',
        {as_user: true});
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