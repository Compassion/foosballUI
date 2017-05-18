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

var timerStarted = false;
var betsOpen = false;
var players = [];
var currentGame = {};
var currentBets = [];
var currentUser;

var attackRatings = new Map();
var defenseRatings = new Map();
var averageRatings = new Map();

var defenseWins = new Map();
var defenseLosses = new Map();
var attackWins = new Map();
var attackLosses = new Map();
var totalWins = new Map();
var totalLosses = new Map();

var betMoney = new Map();
var userMap = new Map();

var stats;

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
                attackRatings.set(key, parseInt(data.attackRatings[key]));
            }

            for(var key in data.defenseRatings){
                defenseRatings.set(key, parseInt(data.defenseRatings[key]));

                //Calculate and store average ratings
                var averageRating = Math.round(( parseInt(data.defenseRatings[key]) + parseInt(attackRatings.get(key)) ) / 2);
                averageRatings.set(key, averageRating);
            }

            for(var key in data.defenseWins){
                defenseWins.set(key, parseInt(data.defenseWins[key]));
            }
            for(var key in data.defenseLosses){
                defenseLosses.set(key, parseInt(data.defenseLosses[key]));
            }
            for(var key in data.attackWins){
                attackWins.set(key, parseInt(data.attackWins[key]));
                totalWins.set(key, parseInt(data.attackWins[key]) + parseInt(defenseWins.get(key)));
            }
            for(var key in data.attackLosses){
                attackLosses.set(key, parseInt(data.attackLosses[key]));
                totalLosses.set(key, parseInt(data.attackLosses[key]) + parseInt(defenseLosses.get(key)));
            }

            for(var key in data.slackUsers){
                // This mapping is intentionally reversed
                userMap.set(data.slackUsers[key], key);
            }

            for(var key in data.betMoney){
                betMoney.set(key, parseInt(data.betMoney[key]));
            }

            self._calculateStats();
        });

        socket.on('game', function(data) {
            var blueOdds = Math.round((1 / data.blueWin) * 100) / 100;
            var yellowOdds = Math.round((1 / data.yellowWin) * 100) / 100;

            data.blueOdds = blueOdds;
            data.yellowOdds = yellowOdds;
            currentGame = data;

            self.postMessageToChannel(config.channelName, ':blue:  *Blue Team*\n' + currentGame.players[0] + ' Attack\n' + currentGame.players[1] + ' Defense\n(Odds: ' + blueOdds + ':1)\n\n' +
                                                     ':yellow:  *Yellow Team*\n' + currentGame.players[2] + ' Attack\n' + currentGame.players[3] + ' Defense\n(Odds: ' + yellowOdds + ':1)', {as_user: true});
            
            betsOpen = true;

            setTimeout( function() {
                self.postMessageToChannel(config.channelName, ':clock6: 30 seconds until bets close!', {as_user: true});
            }, 30000 );
            setTimeout( function() {
                self.postMessageToChannel(config.channelName, ':clock10: 10 seconds until bets close!', {as_user: true});
            }, 50000 );
            setTimeout( function() {
                betsOpen = false;
            }, 60000 );
        });

        socket.on('result', function(data) {
            self.postMessageToChannel(config.channelName, ':blue: *Blue Team* ' + data.BlueScore + '\n' +
                                                     ':yellow: *Yellow Team* ' + data.YellowScore, {as_user: true});

            var attackWinner = (data.Winner == 'Blue') ? data.BlueAttack : data.YellowAttack;
            var defenseWinner = (data.Winner == 'Blue') ? data.BlueDefense : data.YellowDefense;

            setTimeout ( function() {
                self.postMessageToChannel(config.channelName, ':tada: Congratulations ' + attackWinner + ' and ' + defenseWinner + ' on a Team ' + data.Winner + ' victory!', {as_user: true});
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
    self.postMessageToChannel(config.channelName, 'Hey, I am Foosbot. If you mention _foosball_ I will start a game up. :grin::soccer:', {as_user: true});
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
        if (currentBets[i].Team.toLowerCase() != winner.toLowerCase()) {
            self.postMessageToChannel(config.channelName, ':heavy_minus_sign::heavy_dollar_sign: ' + currentBets[i].Player + ' bet $' + Math.abs(currentBets[i].Amount) + ' on ' + currentBets[i].Team + ' and walks away with nothing. :worried:', {as_user: true});
            
        }
        else if (currentBets[i].Team.toLowerCase() == winner.toLowerCase()) {
            self.postMessageToChannel(config.channelName, ':heavy_plus_sign::heavy_dollar_sign: ' + currentBets[i].Player + ' bet $' + Math.abs(currentBets[i].Amount) + ' on ' + currentBets[i].Team + ' and walks away with $' + Math.round(currentBets[i].Winnings) + ' :money_mouth_face:', {as_user: true});
        
            var betRow = JSON.parse(JSON.stringify(currentBets[i]));

            delete betRow.Winnings;
            betRow.Action = "Bet winnings";
            betRow.Amount = Math.round(currentBets[i].Winnings);

            self._newRow(betRow, betsSheet);
        }
    }
    
    currentBets = [];
}

FoosBot.prototype._onMessage = function(message) {
    if (this._isChatMessage(message) && this._isChannelConversation(message) && !this._isFromFoosBot(message) && this._isFoosballChannel(message.channel)) {
        console.log('Checking message: ', message.text);
        this._foosbotResponses(message);
            
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
	        this.postMessageToChannel(config.channelName, '_Also, I\'m not sure who you are. Make sure your Slack ID (' + message.user + ') is stored in the spreadsheet_', {as_user: true});
	    }
    }

};

FoosBot.prototype._onGameMessage = function(message) {
    var self = this;

    if (message == 'SUCCESS') {
        console.log('Game starting...');
        timerStarted = true;
        io.emit('message', 'COUNTDOWN');

        self.postMessageToChannel(config.channelName, ':bell: It\'s time to foos! Send \'!\' in the next minute to join the game. :bell:', {as_user: true});
        self._addToGame(currentUser);

        setTimeout( function() {
                        self.postMessageToChannel(config.channelName, ':clock6: 30 seconds left!', {as_user: true});
                    }, 30000 );
        setTimeout( function() {
                        self.postMessageToChannel(config.channelName, ':clock10: 10 seconds left!', {as_user: true});
                    }, 50000 );
        setTimeout( function() {
                        self._newGame();
                    }, 60000 );
    } 
    else if (message == 'ERROR') {
        console.log('Game already started.');
        self.postMessageToChannel(config.channelName, ':x: Foosball UI needs to be refreshed first. Please refresh and try again.', {as_user: true});
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
        self.postMessageToChannel(config.channelName, ':x: Sorry, ' + userName + ' - betting is not open right now.', {as_user: true});
    }     
    else if (parseInt(betMessage[2]) == NaN || parseInt(betMessage[2]) < 0) {
        self.postMessageToChannel(config.channelName, ':rage: ' + userName + ' is fined $100 for trying to confuse me.', {as_user: true});
        self._newRow({ "Player" : userName, "Action" : "Fined by Foosbot", "Team" : "", "Amount" : "-100" }, betsSheet);
    }
    else if (betMessage[2] == null || betMessage[2] == "") {
        self.postMessageToChannel(config.channelName, ':thinking_face: Sorry, ' + userName + ' - I don\'t understand your bet request.\nThe bet amount should be numbers only - for example, _bet blue 100_', {as_user: true});
    }
    else if (betMessage[2] > parseInt(userMoney) || parseInt(userMoney) == undefined) {
        self.postMessageToChannel(config.channelName, ':sweat_smile: You don\'t have that much money to throw around, ' + userName + '!', {as_user: true});
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
            self.postMessageToChannel(config.channelName, ':thinking_face: Not sure why you want to bet for ' + betMessage[1] + ', ' + userName + '.', {as_user: true});
        }
    }

    if (bet.Winnings != null) {
        currentBets.push(bet);
        self.postMessageToChannel(config.channelName, ':heavy_dollar_sign: Bet recorded for ' + userName + ' for $' + bet.Amount + ' | _Potential win of $' + bet.Winnings + '_', {as_user: true});

        var betRow = JSON.parse(JSON.stringify(bet));
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
    var recipient = tipMessage[1].toLowerCase().capitalize();
    var recipientMoney = betMoney.get(userName);

    var tipOut = { "Player" : userName, "Action" : "Gives tip", "Team" : "", "Amount" : null };
    var tipIn = { "Player" : null, "Action" : "Receives tip", "Team" : "", "Amount" : null };

    if (parseInt(tipMessage[2]) == NaN || parseInt(tipMessage[2]) < 0 || betMoney.get(recipient) == undefined) {
        self.postMessageToChannel(config.channelName, ':rage: ' + userName + ' is fined $100 for trying to confuse me.', {as_user: true});
        self._newRow(
            { "Player" : userName, "Action" : "Fined by Foosbot", "Team" : "", "Amount" : "-100" }, betsSheet
        );
    }
    else if (tipMessage[2] == null || tipMessage[2] == "") {
        self.postMessageToChannel(config.channelName, ':thinking_face: Sorry, ' + userName + ' - I don\'t understand your tip request.\nThe tip amount should be numbers only - for example, _tip <player> 100_', {as_user: true});
    }
    else if (tipMessage[2] > parseInt(userMoney) || parseInt(userMoney) == undefined) {
        self.postMessageToChannel(config.channelName, ':sweat_smile: You don\'t have that much money to tip with, ' + userName + '!', {as_user: true});
    }
    else {
        var amount = parseInt(tipMessage[2]);
        var recipientMoney = betMoney.get(recipient);

        tipOut.Amount = amount - (amount * 2);

        tipIn.Amount = amount;
        tipIn.Player = recipient;

        betMoney.set(userName, userMoney - amount);
        betMoney.set(recipient, recipientMoney + amount);
    }

    if (tipOut.Amount != null) {
        self.postMessageToChannel(config.channelName, ':money_with_wings: ' + tipOut.Player + ' tips ' + tipIn.Player + ' $' + tipIn.Amount, {as_user: true});

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
        self.postMessageToChannel(config.channelName, ':thinking_face: Sorry, ' + userName + ' - I don\'t understand your request.\nUse \'rating <player>\' to check a player\'s rating.', {as_user: true});
    }
    else if (attackRating == undefined || defenseRating == undefined) {
        self.postMessageToChannel(config.channelName, ':thinking_face: Hmm, I don\'t have ratings stored for ' + player, {as_user: true});
    }
    else if (ratingCheck[1] == 'defense' || ratingCheck[2] == 'defence') {
        self.postMessageToChannel(config.channelName, player + ' has an defense rating of ' + defenseRating, {as_user: true});
    }
    else if (ratingCheck[1] == 'attack') {
        self.postMessageToChannel(config.channelName, player + ' has an attack rating of ' + attackRating, {as_user: true});
    }
    else {
        self.postMessageToChannel(config.channelName, player + ' has an attack rating of ' + attackRating + '\n' + player + ' has an defense rating of ' + defenseRating, {as_user: true});
    }
};

FoosBot.prototype._checkBalance = function(message) {
    var self = this;

    var balanceCheck = message.text.split(" ");
    var userName = userMap.get(message.user);
	
	if (balanceCheck[1] != undefined)
    	var player = balanceCheck[1].toLowerCase().capitalize();

    if (player == null || player == undefined || player == "") {
        if (betMoney.get(userName) == undefined) {
            self.postMessageToChannel(config.channelName, 'I don\'t have a balance for ' + userName, {as_user: true});
        } else {
            var money = betMoney.get(userName);
            self.postMessageToChannel(config.channelName, userName + ', your current balance is $' + betMoney.get(userName), {as_user: true});
        }
    }
    else {
        if (betMoney.get(player) == undefined) {
            self.postMessageToChannel(config.channelName, 'I don\'t have a balance for ' + player, {as_user: true});
        } else {
            var money = betMoney.get(player);
            self.postMessageToChannel(config.channelName, player + '\'s current balance is $' + betMoney.get(player), {as_user: true});
        }
    } 
};

FoosBot.prototype._foosbotResponses = function(message) {
    var self = this;

    var userName = userMap.get(message.user);
    var highKeywords = ['highest', 'high', 'best', 'top', 'most'];
    var lowKeywords = ['lowest', 'low', 'worst', 'bottom', 'least'];

    if (self._checkContainsAllAndAny( message, ['attack', 'rating'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestAttackRating.player + ' has the highest attack rating on ' + stats.highestAttackRating.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['defense', 'rating'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestDefenseRating.player + ' has the highest defense rating on ' + stats.highestDefenseRating.value, {as_user: true});
    }    
    else if (self._checkContainsAllAndAny( message, ['rating'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestAverageRating.player + ' has the highest average rating on ' + stats.highestAverageRating.value, {as_user: true});
    }

    if (self._checkContainsAllAndAny( message, ['attack', 'rating'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestAttackRating.player + ' has the lowest attack rating on ' + stats.lowestAttackRating.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['defense', 'rating'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestDefenseRating.player + ' has the lowest defense rating on ' + stats.lowestDefenseRating.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['rating'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestAverageRating.player + ' has the lowest average rating on ' + stats.lowestAverageRating.value, {as_user: true});
    }

    if (self._checkContainsAllAndAny( message, ['balance'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestBalance.player + ' has the highest balance on $' + stats.highestBalance.value, {as_user: true});
    }
    if (self._checkContainsAllAndAny( message, ['balance'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestBalance.player + ' has the lowest balance on $' + stats.lowestBalance.value, {as_user: true});
    }

    if (self._checkContainsAllAndAny( message, ['wins'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestTotalWins.player + ' has the highest total wins on ' + stats.highestTotalWins.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['attack', 'wins'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestAttackWins.player + ' has the highest attack wins on ' + stats.highestAttackWins.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['defense', 'wins'], highKeywords )) {
        self.postMessageToChannel(config.channelName, stats.highestDefenseWins.player + ' has the highest defense wins on ' + stats.highestDefenseWins.value, {as_user: true});
    }

    if (self._checkContainsAllAndAny( message, ['wins'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestTotalWins.player + ' has the lowest total wins on ' + stats.lowestTotalWins.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['attack', 'wins'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestAttackWins.player + ' has the lowest attack wins on ' + stats.lowestAttackWins.value, {as_user: true});
    }
    else if (self._checkContainsAllAndAny( message, ['defense', 'wins'], lowKeywords )) {
        self.postMessageToChannel(config.channelName, stats.lowestDefenseWins.player + ' has the lowest defense wins on ' + stats.lowestDefenseWins.value, {as_user: true});
    }

    // If not one of the other commands
    if (!self._checkContainsAny( message, highKeywords ) || !self._checkContainsAny( message, lowKeywords ) ) {
        if (self._checkContainsAll( message, ['foosbot', 'joke'] )) {
            self.postMessageToChannel(config.channelName, 'You want a joke, ' + userName + '? Hmm, let me think... :thinking_face:', {as_user: true});
            setTimeout( function() { self.postMessageToChannel(config.channelName, '*Jon\'s defense rating!* :joy:', {as_user: true}); }, 2000);
        }
        if (self._checkContainsAllAndAny( message, ['foosbot'], ['dumb', 'stupid', 'broken'] )) {
            self.postMessageToChannel(config.channelName, ':rage: How dare you besmirch my good name, ' + userName + '! Fined $100.', {as_user: true});
            self._newRow({ "Player" : userName, "Action" : "Fined by Foosbot", "Team" : "", "Amount" : "-100" }, betsSheet);
        }
    }
};

FoosBot.prototype._addToGame = function(user) {
    var self = this;

    var userName = userMap.get(user);

    if (timerStarted) {
        if (players.includes(userName)) {
            self.postMessageToChannel(config.channelName, ':upside_down_face: You\'re already playing, ' + userName + '.', {as_user: true});
        } 
        else if (!players.includes(userName)) {
            players.push(userName);
            self.postMessageToChannel(config.channelName, ':soccer: ' + userName + ' joins the game.', {as_user: true});
            io.emit('newplayer', userName);
        }
    }
    if (!timerStarted) {
        self.postMessageToChannel(config.channelName, ':weary: There\'s no game to join ' + userName, {as_user: true});
    }
}

FoosBot.prototype._newGame = function() {
    var self = this;

    if (players.length < 4) {
        self.postMessageToChannel(config.channelName, ':sob: Not enough interested players for a full game.', {as_user: true});
        io.emit('message', 'RELOAD');
    } else {
        self.postMessageToChannel(config.channelName, ':game_die: Starting game with ' + players.join(', ') + '. Good luck! :+1:', {as_user: true});
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
    return isChat;
};

FoosBot.prototype._isChannelConversation = function (message) {
    var isChannelConversation = typeof message.channel === 'string' && message.channel[0] === 'C';
    return isChannelConversation;
};

FoosBot.prototype._isFromFoosBot = function (message) {
    var isFromBot = message.user === this.user.id;
    return isFromBot;
};

FoosBot.prototype._isMentioningFoosball = function (message) {
    var isMentioningFoosball = message.text.toLowerCase().indexOf('foosball') > -1;
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

FoosBot.prototype._checkContainsAny = function (message, containsOneOrMore) {
    var checkContainsOneOrMore;

    for (var i = containsOneOrMore.length - 1; i >= 0; i--) {
        // Break if there is ever a true value (that is, at least one keyword in message)
        checkContainsOneOrMore = message.text.toLowerCase().indexOf(containsOneOrMore[i].toLowerCase()) > -1;
        if (checkContainsOneOrMore == true) break;
    }

    if (checkContainsOneOrMore == true) {
        return true;
    } else {
        return false;
    }
};
FoosBot.prototype._checkContainsAll = function (message, containsAll) {
    var checkContainsAll;

    for (var i = containsAll.length - 1; i >= 0; i--) {
        // Break if there is ever a false value (that is, not all keywords in message)
        checkContainsAll = message.text.toLowerCase().indexOf(containsAll[i].toLowerCase()) > -1;
        if (checkContainsAll == false) break;
    }

    if (checkContainsAll == true) {
        return true;
    } else {
        return false;
    }
};

FoosBot.prototype._checkContainsAllAndAny = function (message, containsAll, containsOneOrMore) {
    var checkContainsAll;
    var checkContainsOneOrMore;

    for (var i = containsAll.length - 1; i >= 0; i--) {
        // Break if there is ever a false value (that is, not all keywords in message)
        checkContainsAll = message.text.toLowerCase().indexOf(containsAll[i].toLowerCase()) > -1;
        if (checkContainsAll == false) break;
    }

    for (var i = containsOneOrMore.length - 1; i >= 0; i--) {
        // Break if there is ever a true value (that is, at least one keyword in message)
        checkContainsOneOrMore = message.text.toLowerCase().indexOf(containsOneOrMore[i].toLowerCase()) > -1;
        if (checkContainsOneOrMore == true) break;
    }

    if ((checkContainsOneOrMore == true || checkContainsOneOrMore == undefined) && checkContainsAll == true) {
        return true;
    } else {
        return false;
    }
};

FoosBot.prototype._isFoosballChannel = function (channel) {
    var isFoosballChannel = this._getChannelById(channel) == config.channelName;
    // console.log(this._getChannelById(channel), 'Is foosball channel?', isFoosballChannel);
    return isFoosballChannel;
};

FoosBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0].name;
};

FoosBot.prototype._calculateStats = function(rowData, sheet) {

    stats = {
        highestAttackRating : { "player" : "", "value" : 0 },
        highestDefenseRating : { "player" : "", "value" : 0 },
        highestAverageRating : { "player" : "", "value" : 0 },

        highestAttackWins : { "player" : "", "value" : 0 },
        highestDefenseWins : { "player" : "", "value" : 0 },
        highestTotalWins : { "player" : "", "value" : 0 },

        lowestAttackRating : { "player" : "", "value" : 99999 },
        lowestDefenseRating : { "player" : "", "value" : 99999 },
        lowestAverageRating : { "player" : "", "value" : 99999 },

        lowestAttackWins : { "player" : "", "value" : 99999 },
        lowestDefenseWins : { "player" : "", "value" : 99999 },
        lowestTotalWins : { "player" : "", "value" : 99999 },

        highestBalance : { "player" : "", "value" : 0 },
        lowestBalance : { "player" : "", "value" : 0 }
    }

    for (let [key, value] of defenseWins) {
        if (value > stats.highestDefenseWins.value) {
            stats.highestDefenseWins.value = value;
            stats.highestDefenseWins.player = key;
        }
        if (value < stats.lowestDefenseWins.value) {
            stats.lowestDefenseWins.value = value;
            stats.lowestDefenseWins.player = key;
        }
    }
    for (let [key, value] of attackWins) {
        if (value > stats.highestAttackWins.value) {
            stats.highestAttackWins.value = value;
            stats.highestAttackWins.player = key;
        }
        if (value < stats.lowestAttackWins.value) {
            stats.lowestAttackWins.value = value;
            stats.lowestAttackWins.player = key;
        }
    }
    for (let [key, value] of totalWins) {
        if (value > stats.highestTotalWins.value) {
            stats.highestTotalWins.value = value;
            stats.highestTotalWins.player = key;
        }
        if (value < stats.lowestTotalWins.value) {
            stats.lowestTotalWins.value = value;
            stats.lowestTotalWins.player = key;
        }
    }
    for (let [key, value] of averageRatings) {
        if (value > stats.highestAverageRating.value) {
            stats.highestAverageRating.value = value;
            stats.highestAverageRating.player = key;
        }
        if (value < stats.lowestAverageRating.value) {
            stats.lowestAverageRating.value = value;
            stats.lowestAverageRating.player = key;
        }
    }
    for (let [key, value] of attackRatings) {
        if (value > stats.highestAttackRating.value) {
            stats.highestAttackRating.value = value;
            stats.highestAttackRating.player = key;
        }
        if (value < stats.lowestAttackRating.value) {
            stats.lowestAttackRating.value = value;
            stats.lowestAttackRating.player = key;
        }
    }
    for (let [key, value] of defenseRatings) {
        if (value > stats.highestDefenseRating.value) {
            stats.highestDefenseRating.value = value;
            stats.highestDefenseRating.player = key;
        }
        if (value < stats.lowestDefenseRating.value) {
            stats.lowestDefenseRating.value = value;
            stats.lowestDefenseRating.player = key;
        }
    }
    for (let [key, value] of betMoney) {
        var money = parseInt(value);

        if (money > stats.highestBalance.value) {
            stats.highestBalance.value = money;
            stats.highestBalance.player = key;
        }
        if (money < stats.lowestBalance.value) {
            stats.lowestBalance.value = money;
            stats.lowestBalance.player = key;
        }
        if(stats.lowestBalance.value == 0) {
            stats.lowestBalance.value = money;
        }
    }
}

module.exports = FoosBot;