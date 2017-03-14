// This is the stuff that listens to the FoosBot Node app

//var socket = io.connect('http://localhost:8000');

socket.on('message', function(data){
    if(data = 'COUNTDOWN') {
        renderCountChart('#countdown-chart', '#333', 60000);
        renderCount(60);

        $('#preGame').fadeOut(500);
        $('#countdown').delay(500).fadeIn(500);

        playSound('attack');
    }
    if(data = 'START') {
        play();
    }
});

socket.on('newplayer', function(data){
    document.getElementById(data).checked = true;
    $('#countdown-players').append('<label class="btn active players btn-outline-primary"><span class="glyphicon glyphicon-ok"></span><input type="checkbox" checked>'+ data +'</label>');
});


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
}

function renderCount(value) {
    new CountUp('countdown-value', value, 0, 0, 60, { useEasing : false, useGrouping : true }).start();
}