'use strict';

var util = require('util');
var path = require('path');
var Bot = require('slackbots');
var io = require('socket.io').listen(8000);

var configChannel = 'foosball';
var timerStarted = false;
var betsOpen = false;
var players = [];
var currentGame = {};
var currentBets = [];
var currentUser;
    
var betMoney = new Map();
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
            console.log('Received lobby confirmation: ', message);
            self._onGameMessage(message);
		});
        
        socket.on('game', function(data) {
            var blueOdds = Math.round((1 / data.blueWin) * 100) / 100;
            var yellowOdds = Math.round((1 / data.yellowWin) * 100) / 100;

            data.blueOdds = blueOdds;
            data.yellowOdds = yellowOdds;
            currentGame = data;

            // Put current money into Map
            for(var key in data.betMoney){
                betMoney.set(key, data.betMoney[key]);
            }

            self.postMessageToChannel(configChannel, '*Blue Team* ' + currentGame.players[0] + ' Attack, ' + currentGame.players[1] + ' Defense (Odds: ' + blueOdds + ':1)', {as_user: true});
            self.postMessageToChannel(configChannel, '*Yellow Team* ' + currentGame.players[2] + ' Attack, ' + currentGame.players[3] + ' Defense (Odds: ' + yellowOdds + ':1)', {as_user: true});
            
            betsOpen = true;
            setTimeout( function() {
                betsOpen = false;
                }, 60000
            );
        });

        socket.on('result', function(data) {
            self.postMessageToChannel(configChannel, '*Blue Team* ' + data.blueScore, {as_user: true});
            self.postMessageToChannel(configChannel, '*Yellow Team* ' + data.yellowScore, {as_user: true});

            var winner = (parseInt(data.blueScore) > parseInt(data.yellowScore)) ? 'Blue' : 'Yellow';
            var attackWinner = (winner == 'Blue') ? currentGame.players[0] : currentGame.players[2];
            var defenseWinner = (winner == 'Blue') ? currentGame.players[1] : currentGame.players[3];

            setTimeout ( function() {
                self.postMessageToChannel(configChannel, 'Congratulations ' + attackWinner + ' and ' + defenseWinner + ' on a Team ' + winner + ' victory!', {as_user: true});
            }, 1000);

            setTimeout ( function() {
                self._payBetWinners(winner);
            }, 5000);

            currentGame = {};
        });
    });

    console.log('Bot started.');
    self.postMessageToChannel(configChannel, 'Hey, I am Foosbot. If you mention foosball I will start a game up.', {as_user: true});
    self._loadBotUser();   
};

FoosBot.prototype._payBetWinners = function(winner) {
    var self = this;

    for (var i = currentBets.length - 1; i >= 0; i--) {
        if (currentBets[i].team.toLowerCase() != winner.toLowerCase()) {
            currentBets[i].stakes = currentBets[i].amount - (currentBets[i].amount * 2);
            self.postMessageToChannel(configChannel, currentBets[i].user + ' bet $' + currentBets[i].amount + ' on ' + currentBets[i].team + ' and walks away with nothing.', {as_user: true});
        }
        else if (currentBets[i].team.toLowerCase() == winner.toLowerCase()) {
            self.postMessageToChannel(configChannel, currentBets[i].user + ' bet $' + currentBets[i].amount + ' on ' + currentBets[i].team + ' and walks away with $' + currentBets[i].stakes, {as_user: true});
        }
    }

    io.emit('bets', currentBets);
    
    currentBets = [];
}

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
            if (this._isBetMessage(message)) {
                this._processBet(message);
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
                        self.postMessageToChannel(configChannel, '30 seconds left!', {as_user: true});
                    }, 30000 );
        setTimeout( function() {
                        self.postMessageToChannel(configChannel, '10 seconds left!', {as_user: true});
                    }, 50000 );
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

FoosBot.prototype._processBet = function(message) {
    var self = this;

    var betMessage = message.text.split(" ");
    var userName = userMap.get(message.user);
    var userMoney = betMoney.get(userName);

    var bet = { "user" : userName, "team" : null, "stakes" : null }

    if (betsOpen == false) {
        self.postMessageToChannel(configChannel, 'Sorry, ' + userName + ' - betting is not open right now.', {as_user: true});
    } 
    else if (betMessage[2] == null || betMessage[2] == "" || parseInt(betMessage[2]) == "NaN") {
        self.postMessageToChannel(configChannel, 'Sorry, ' + userName + ' - I don\'t understand your bet request. The bet amount should be numbers only.', {as_user: true});
    }
    else if (betMessage[2] > parseInt(userMoney)) {
        self.postMessageToChannel(configChannel, 'You don\'t have that much money to bet, ' + userName + '!', {as_user: true});
    }
    else {
        var amount = parseInt(betMessage[2]);

        if(betMessage[1].toLowerCase() == 'blue') {
            bet.team = 'Blue';
            bet.amount = amount;
            bet.stakes = amount * currentGame.blueOdds;
            betMoney.set(userName, userMoney - amount);
        }
        else if(betMessage[1].toLowerCase() == 'yellow') {
            bet.team = 'Yellow';
            bet.amount = amount;
            bet.stakes = amount * currentGame.yellowOdds;
            betMoney.set(userName, userMoney - amount);
        }
        else {
            self.postMessageToChannel(configChannel, 'Sorry, ' + userName + 'I don\'t understand your bet request. The bet amount should be numbers only.', {as_user: true});
        }
    }

    if (bet.stakes != null) {
        currentBets.push(bet);
        self.postMessageToChannel(configChannel, 'Bet recorded for ' + userName, {as_user: true});
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
        io.emit('message', 'RELOAD');
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

FoosBot.prototype._isBetMessage = function (message) {
    var isBetMessage = message.text.startsWith('bet');
    return isBetMessage;
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