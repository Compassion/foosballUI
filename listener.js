// This is the stuff that listens to the FoosBot Node app

function connectToNode() {
    var socket = io('http://localhost:8000');

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
};

function _initiateLobby() {
    renderCountChart('#countdown-chart', '#333', 60000);
    renderCountdown(60);

    $('#preGame').fadeOut(500);
    $('#countdown').delay(500).fadeIn(500, playSound('attack'));
};

function _gameStarted(game) {
    socket.emit('GAME', game);
};

function _gameFinished(result) {
    socket.emit('RESULT', result);
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