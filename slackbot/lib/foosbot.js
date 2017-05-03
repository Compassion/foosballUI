'use strict';

var config = require('./foosbot_config.js');
var creds = require('./Foosbot-aed787c23f63.json');

var util = require('util');
var path = require('path');
var Bot = require('slackbots');
var io = require('socket.io').listen(8000);

var GoogleSpreadsheet = require('google-spreadsheet');
var async = require('async');

var doc = new GoogleSpreadsheet(config.spreadsheetId);
var resultsSheet, betsSheet;

var configChannel = 'foosball';
var timerStarted = false;
var betsOpen = false;
var players = [];
var currentGame = {};
var currentBets = [];
var currentUser;

var attackRatings = new Map();
var defenseRatings = new Map();
var betMoney = new Map();
var userMap = new Map();

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
        
        socket.on('stats', function(data) {
            for(var key in data.attackRatings){
                attackRatings.set(key, data.attackRatings[key]);
            }

            for(var key in data.defenseRatings){
                defenseRatings.set(key, data.defenseRatings[key]);
            }

            for(var key in data.slackUsers){
                // This mapping is intentionally reversed
                userMap.set(data.slackUsers[key], key);
            }

            for(var key in data.betMoney){
                betMoney.set(key, data.betMoney[key]);
            }
        });

        socket.on('game', function(data) {
            var blueOdds = Math.round((1 / data.blueWin) * 100) / 100;
            var yellowOdds = Math.round((1 / data.yellowWin) * 100) / 100;

            data.blueOdds = blueOdds;
            data.yellowOdds = yellowOdds;
            currentGame = data;

            self.postMessageToChannel(configChannel, ':blue:  *Blue Team*\n' + currentGame.players[0] + ' Attack\n' + currentGame.players[1] + ' Defense\n(Odds: ' + blueOdds + ':1)\n\n' +
                                                     ':yellow:  *Yellow Team*\n' + currentGame.players[2] + ' Attack\n' + currentGame.players[3] + ' Defense\n(Odds: ' + yellowOdds + ':1)', {as_user: true});
            
            betsOpen = true;

            setTimeout( function() {
                self.postMessageToChannel(configChannel, ':clock6: 30 seconds until bets close!', {as_user: true});
            }, 30000 );
            setTimeout( function() {
                self.postMessageToChannel(configChannel, ':clock10: 10 seconds until bets close!', {as_user: true});
            }, 50000 );
            setTimeout( function() {
                betsOpen = false;
            }, 60000 );
        });

        socket.on('result', function(data) {
            self.postMessageToChannel(configChannel, ':blue: *Blue Team* ' + data.BlueScore + '\n' +
                                                     ':yellow: *Yellow Team* ' + data.YellowScore, {as_user: true});

            var attackWinner = (data.Winner == 'Blue') ? data.BlueAttack : data.YellowAttack;
            var defenseWinner = (data.Winner == 'Blue') ? data.BlueDefense : data.YellowDefense;

            setTimeout ( function() {
                self.postMessageToChannel(configChannel, ':tada: Congratulations ' + attackWinner + ' and ' + defenseWinner + ' on a Team ' + data.Winner + ' victory!', {as_user: true});
            }, 1000);

            setTimeout ( function() {
                self._payBetWinners(data.Winner);
            }, 5000);

            self._newRow(data, resultsSheet);

            currentGame = {};
        });
    });

    self._setupSpreadsheet();
    console.log('Bot started.');
    self.postMessageToChannel(configChannel, 'Hey, I am Foosbot. If you mention _foosball_ I will start a game up. :grin::soccer:', {as_user: true});
    self._loadBotUser();   
};

FoosBot.prototype._setupSpreadsheet = function() {
    console.log('Setting up Spreadsheet authentication...');
    async.series([
        function setAuth(step) {
            doc.useServiceAccountAuth(creds, step);
        },
        function getInfoAndWorksheets(step) {
            doc.getInfo(function(err, info) {
                console.log('Loaded ' + info.title);
                resultsSheet = info.worksheets[0];
                betsSheet = info.worksheets[1];
                console.log('Loaded ' + resultsSheet.title);
                console.log('Loaded ' + betsSheet.title);
                console.log('Spreadsheet is setup.');
            });
        }
    ]);
}

FoosBot.prototype._newRow = function(rowData, sheet) {
    sheet.addRow(rowData,
        function callback(err) {
            if (err != null) console.log(err);
        }
    );
}

FoosBot.prototype._payBetWinners = function(winner) {
    var self = this;

    for (var i = currentBets.length - 1; i >= 0; i--) {
        console.log(currentBets[i]);

        if (currentBets[i].Team.toLowerCase() != winner.toLowerCase()) {
            self.postMessageToChannel(configChannel, ':heavy_minus_sign::heavy_dollar_sign: ' + currentBets[i].Player + ' bet $' + Math.abs(currentBets[i].Amount) + ' on ' + currentBets[i].Team + ' and walks away with nothing. :worried:', {as_user: true});
            
        }
        else if (currentBets[i].Team.toLowerCase() == winner.toLowerCase()) {
            self.postMessageToChannel(configChannel, ':heavy_plus_sign::heavy_dollar_sign: ' + currentBets[i].Player + ' bet $' + Math.abs(currentBets[i].Amount) + ' on ' + currentBets[i].Team + ' and walks away with $' + currentBets[i].Winnings + ' :money_mouth_face:', {as_user: true});
        
            var betRow = JSON.parse(JSON.stringify(currentBets[i]);

            delete betRow.Winnings;
            betRow.Action = "Bet winnings";
            betRow.Amount = currentBets[i].Winnings;

            self._newRow(betRow, betsSheet);
        }
    }
    
    currentBets = [];
}

FoosBot.prototype._onMessage = function(message) {
    if (this._isChatMessage(message) && this._isChannelConversation(message) && !this._isFromFoosBot(message) && this._isFoosballChannel(message.channel)) {
    console.log('Checking message: ', message.text);
            
        if (this._isMentioningFoosball(message)){
            this._initiateGame(message.user);
        }
        if (this._isJoinGameMessage(message)){
            this._addToGame(message.user);
        }
        if (this._checkMessage(message, 'bet')) {
            this._processBet(message);
        }
        if (this._checkMessage(message, 'rating')) {
            this._checkRating(message);
        }
        if (this._checkMessage(message, 'balance')) {
            this._checkBalance(message);
        }
        if (this._checkMessage(message, 'tip')) {
            this._processTip(message);
        }
	    if (userMap.get(message.user) == undefined) {
	        this.postMessageToChannel(configChannel, '_Also, I\'m not sure who you are. Make sure your Slack ID (' + message.user + ') is stored in the spreadsheet_', {as_user: true});
	    }
    }

};

FoosBot.prototype._onGameMessage = function(message) {
    var self = this;

    if (message == 'SUCCESS') {
        console.log('Game starting...');
        timerStarted = true;
        io.emit('message', 'COUNTDOWN');

        self.postMessageToChannel(configChannel, ':bell: It\'s time to foos! Send \'!\' in the next minute to join the game. :bell:', {as_user: true});
        self._addToGame(currentUser);

        setTimeout( function() {
                        self.postMessageToChannel(configChannel, ':clock6: 30 seconds left!', {as_user: true});
                    }, 30000 );
        setTimeout( function() {
                        self.postMessageToChannel(configChannel, ':clock10: 10 seconds left!', {as_user: true});
                    }, 50000 );
        setTimeout( function() {
                        self._newGame();
                    }, 60000 );
    } 
    else if (message == 'ERROR') {
        console.log('Game already started.');
        self.postMessageToChannel(configChannel, ':x: Foosball UI needs to be refreshed first. Please refresh and try again.', {as_user: true});
    }
        
};

FoosBot.prototype._initiateGame = function(user) {
    var self = this;
    currentUser = user;
    
    if (timerStarted == false) {
    console.log('Sending CHECK');
        io.emit('message', 'CHECK');
    }
    else if (timerStarted == true) {
        self._addToGame(user);
    }
};

FoosBot.prototype._processBet = function(message) {
    var self = this;

    var betMessage = message.text.split(" ");
    var userName = userMap.get(message.user);
    var userMoney = betMoney.get(userName);

    var bet = { "Player" : userName, "Action" : "Placed bet", "Team" : null, "Amount" : null, "Winnings" : null }

    if (betsOpen == false) {
        self.postMessageToChannel(configChannel, ':x: Sorry, ' + userName + ' - betting is not open right now.', {as_user: true});
    }     
    else if (parseInt(betMessage[2]) == NaN || parseInt(betMessage[2]) < 0) {
        self.postMessageToChannel(configChannel, ':rage: ' + userName + ' is fined $100 for trying to confuse me.', {as_user: true});
        self._newRow({ "Player" : userName, "Action" : "Fined by Foosbot", "Team" : "", "Amount" : "100" }, betsSheet);
    }
    else if (betMessage[2] == null || betMessage[2] == "") {
        self.postMessageToChannel(configChannel, ':thinking_face: Sorry, ' + userName + ' - I don\'t understand your bet request.\nThe bet amount should be numbers only - for example, _bet blue 100_', {as_user: true});
    }
    else if (betMessage[2] > parseInt(userMoney) || parseInt(userMoney) == undefined) {
        self.postMessageToChannel(configChannel, ':sweat_smile: You don\'t have that much money to throw around, ' + userName + '!', {as_user: true});
    }
    else {
        var amount = parseInt(betMessage[2]);

        if(betMessage[1].toLowerCase() == 'blue') {
            bet.Team = 'Blue';
            bet.Amount = amount;
            bet.Winnings = amount * currentGame.blueOdds;
            betMoney.set(userName, userMoney - amount);
        }
        else if(betMessage[1].toLowerCase() == 'yellow') {
            bet.Team = 'Yellow';
            bet.Amount = amount;
            bet.Winnings = amount * currentGame.yellowOdds;
            betMoney.set(userName, userMoney - amount);
        }
        else {
            self.postMessageToChannel(configChannel, ':thinking_face: Not sure why you want to bet for ' + betMessage[1] + ', ' + userName + '.', {as_user: true});
        }
    }

    if (bet.Winnings != null) {
        currentBets.push(bet);
        self.postMessageToChannel(configChannel, ':heavy_dollar_sign: Bet recorded for ' + userName + ' for $' + bet.Amount + ' | _Potential win of $' + bet.Winnings + '_', {as_user: true});

        var betRow = JSON.parse(JSON.stringify(bet);
        betRow.Amount = betRow.Amount - (betRow.Amount * 2);
        delete betRow.Winnings;

        self._newRow(betRow, betsSheet);
    }
};


FoosBot.prototype._processTip = function(message) {
    var self = this;

    var tipMessage = message.text.split(" ");
    var userName = userMap.get(message.user);
    var userMoney = betMoney.get(userName);

    var tipOut = { "Player" : userName, "Action" : "Gives tip", "Team" : "", "Amount" : null };
    var tipIn = { "Player" : null, "Action" : "Receives tip", "Team" : "", "Amount" : null };

    if (parseInt(tipMessage[2]) == NaN || parseInt(tipMessage[2]) < 0) {
        self.postMessageToChannel(configChannel, ':rage: ' + userName + ' is fined $100 for trying to confuse me.', {as_user: true});
        self._newRow(
            { "Player" : userName, "Action" : "Fined by Foosbot", "Team" : "", "Amount" : "100" }, 
            betsSheet
        );
    }
    else if (tipMessage[2] == null || tipMessage[2] == "") {
        self.postMessageToChannel(configChannel, ':thinking_face: Sorry, ' + userName + ' - I don\'t understand your tip request.\nThe tip amount should be numbers only - for example, _tip <player> 100_', {as_user: true});
    }
    else if (tipMessage[2] > parseInt(userMoney) || parseInt(userMoney) == undefined) {
        self.postMessageToChannel(configChannel, ':sweat_smile: You don\'t have that much money to tip with, ' + userName + '!', {as_user: true});
    }
    else {
        var recipient = tipMessage[1];
        var amount = parseInt(tipMessage[2]);

        tipOut.Amount = amount - (amount * 2);

        tipIn.Amount = amount;
        tipIn.Player = recipient;

        betMoney.set(userName, userMoney - amount);
        betMoney.set(recipient, userMoney + amount);
    }

    if (tipOut.Amount != null) {
        self.postMessageToChannel(configChannel, ':money_with_wings: ' + tipOut.Player + ' tips ' + tipIn.Player + ' $' + tipIn.Amount, {as_user: true});

        self._newRow(tipOut, betsSheet);
        self._newRow(tipIn, betsSheet);
    }
};

FoosBot.prototype._checkRating = function(message) {
    var self = this;

    var ratingCheck = message.text.split(" ");
    var userName = userMap.get(message.user);

    var player;

    if (ratingCheck[1] == null || ratingCheck[1] == ""){
        player = userName;
    }
    else if (ratingCheck[2] == null || ratingCheck[2] == ""){
        player = ratingCheck[1];
    }
    else {
        player = ratingCheck[2];
    }

    var attackRating = attackRatings.get(player);
    var defenseRating = defenseRatings.get(player);

    if (player == null || player == undefined || player == "") {
        self.postMessageToChannel(configChannel, ':thinking_face: Sorry, ' + userName + ' - I don\'t understand your request.\nUse \'rating <player>\' to check a player\'s rating.', {as_user: true});
    }
    else if (attackRating == undefined || defenseRating == undefined) {
        self.postMessageToChannel(configChannel, ':thinking_face: Hmm, I don\'t have ratings stored for ' + player, {as_user: true});
    }
    else if (ratingCheck[1] == 'defense' || ratingCheck[2] == 'defence') {
        self.postMessageToChannel(configChannel, player + ' has an defense rating of ' + defenseRating, {as_user: true});
    }
    else if (ratingCheck[1] == 'attack') {
        self.postMessageToChannel(configChannel, player + ' has an attack rating of ' + attackRating, {as_user: true});
    }
    else {
        self.postMessageToChannel(configChannel, player + ' has an attack rating of ' + attackRating + '\n' + player + ' has an defense rating of ' + defenseRating, {as_user: true});
    }
};

FoosBot.prototype._checkBalance = function(message) {
    var self = this;

    var balanceCheck = message.text.split(" ");
    var userName = userMap.get(message.user);

    var player = balanceCheck[1];
    if (player == null || player == undefined || player == "") {
        if (betMoney.get(userName) == undefined) {
            self.postMessageToChannel(configChannel, 'I don\'t have a balance for ' + userName, {as_user: true});
        } else {
            var money = betMoney.get(userName);
            self.postMessageToChannel(configChannel, userName + ', your current balance is ' + betMoney.get(userName), {as_user: true});
        }
    }
    else {
        if (betMoney.get(player) == undefined) {
            self.postMessageToChannel(configChannel, 'I don\'t have a balance for ' + player, {as_user: true});
        } else {
            var money = betMoney.get(player);
            self.postMessageToChannel(configChannel, player + '\'s current balance is ' + betMoney.get(userName), {as_user: true});
        }
    } 
};

FoosBot.prototype._addToGame = function(user) {
    var self = this;

    var userName = userMap.get(user);

    if (timerStarted) {
        if (players.includes(userName)) {
            self.postMessageToChannel(configChannel, ':upside_down_face: You\'re already playing, ' + userName + '.', {as_user: true});
        } 
        else if (!players.includes(userName)) {
            players.push(userName);
            self.postMessageToChannel(configChannel, ':soccer: ' + userName + ' joins the game.', {as_user: true});
            io.emit('newplayer', userName);
        }
    }
    if (!timerStarted) {
        self.postMessageToChannel(configChannel, ':weary: There\'s no game to join ' + userName, {as_user: true});
    }
}

FoosBot.prototype._newGame = function() {
    var self = this;

    if (players.length < 4) {
        self.postMessageToChannel(configChannel, ':sob: Not enough interested players for a full game.', {as_user: true});
        io.emit('message', 'RELOAD');
    } else {
        self.postMessageToChannel(configChannel, ':game_die: Starting game with ' + players.join(', ') + '. Good luck! :+1:', {as_user: true});
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
    var isMentioningFoosball = message.text.toLowerCase().indexOf('foosball') > -1;
    // console.log('Is mentioning foosball or FoosBot?', isMentioningFoosball);
    return isMentioningFoosball;
};

FoosBot.prototype._isJoinGameMessage = function (message) {
    var isJoinGameMessage = message.text.indexOf('!') > -1 && message.text.length == 1;
    return isJoinGameMessage;
};

FoosBot.prototype._checkMessage = function (message, check) {
    var checkMessage = message.text.toLowerCase().startsWith(check.toLowerCase());
    return checkMessage;
};

FoosBot.prototype._checkContains = function (message, contains) {
    var checkMessage = message.text.toLowerCase().indexOf(contains.toLowerCase()) > -1;
    return checkMessage;
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