// This is the stuff that listens to the FoosBot Node app
var socket;
var betsPlaced = 0;

function connectToNode() {
    socket = io('http://localhost:8000');

    socket.on('connect', function() {
        console.log('Sending connection message');
    });

    socket.on('message', function(data) {
        
        if(data == 'CHECK') {            
            if (gamePlayed){
                socket.send('ERROR');
            }
            else {
                gamePlayed = true;
                console.log('Start game lobby...');
                socket.send('SUCCESS');
            }
        }

        if(data == 'COUNTDOWN') {
            _initiateLobby();
        }

        if(data == 'START') {
            play('slack');
        }

        if(data == 'RELOAD') {
            location.reload();
        }
    });

    socket.on('newplayer', function(data){
        console.log('New player: ' + data);
        document.getElementById(data).checked = true;
        $('#countdown-players').append('<label class="btn active players btn-outline-primary"><span class="glyphicon glyphicon-ok"></span><input type="checkbox" checked>'+ data +'</label>');
    });

    socket.on('bets', function(data){
        _submitBets(data);
    });
};

function _submitBets(data) {        
    var formSubmissions = [];
    console.log(data);
    for (var i = 0; i < data.length; i++) {
        var q1ID = "entry.1590908018";  // Player
        var q2ID = "entry.362528015";   // Amount
        var q3ID = "entry.2132436961";  // Team
        var q4ID = "entry.782513485";   // Outcome

        var value1 = encodeURIComponent(data[i].user);
        var value2 = encodeURIComponent(data[i].amount);
        var value3 = encodeURIComponent(data[i].team);
        var value4 = encodeURIComponent(data[i].stakes);

        var baseURL = 'https://docs.google.com/forms/d/e/1FAIpQLSfv1pA24MZN2ZecNj90LrrgF7TVewkuS-gpGn4BtK5ExZNN2w/formResponse?';
        var submitRef = 'submit=-2456150375496982456';
        var submitURL = (baseURL + q1ID + "=" + value1 + "&" + 
                                  q2ID + "=" + value2 + "&" + 
                                  q3ID + "=" + value3 + "&" + 
                                  q4ID + "=" + value4 + "&" + submitRef);

        formSubmissions.push(submitURL);
    }

    var num = 0;

    function loopBet (num) {
       setTimeout(function () {
            document.getElementById('bet-frame').src = formSubmissions[num];
            num++; 

            if (num < data.length) {
                loopBet();
            }
       }, 3000)
    }

    loopBet();
}

function _initiateLobby() {
    renderCountChart('#countdown-chart', '#333', 60000);
    renderCountdown(60);

    $('#preGame').fadeOut(500);
    $('#countdown').delay(500).fadeIn(500, playSound('gamestart'));
};

function _gameStarted(game) {
    socket.emit('game', game);
};

function _gameFinished(result) {
    socket.emit('result', result);
};

function renderCountChart(container, colour, time) {
  var bar = new ProgressBar.Circle(container, {
    easing: 'linear',
    duration: time,
    strokeWidth: 6,
    trailWidth: 6,
    color: colour
  });
  
  bar.set(1);
  bar.animate(0);
};

function renderCountdown(value) {
    new CountUp('countdown-value', value, 0, 0, 60, { useEasing : false, useGrouping : true }).start();
};