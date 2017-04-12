var attackRatings;
var defenseRatings;
var betMoney;
var stats;

var players = [];
var count = {
    useEasing : true,
    useGrouping : true
};

var bAnimate = {right: '0'};
var yAnimate = {left: '0'};
var gamePlayed = false;

$( document ).ready(function() {
  
  Tabletop.init( { key: 'https://docs.google.com/spreadsheets/d/18Z8ngS2h9iYyk80lxLyiN5tiih__RUL5KKhal-Z6fsw/pubhtml?gid=1440610671&single=true',
                  callback: showPlayerOptions,
                  simpleSheet: true } )
});

function showPlayerOptions(data, tabletop) {
  connectToNode();

  attackRatings = data[1];
  defenseRatings = data[2];
  betMoney = data[3];
  
  delete attackRatings['Metric'];
  delete attackRatings['Submetric'];
  delete attackRatings['Side of Champions'];
  delete defenseRatings['Metric'];
  delete defenseRatings['Submetric'];
  delete defenseRatings['Side of Champions'];

  stats = {
    "betMoney" : betMoney,
    "attackRatings" : attackRatings,
    "defenseRatings" : defenseRatings
  }

  _sendStats(stats);

  for(key in attackRatings){
    $('#selector').append('<label class="btn players btn-outline-primary"><span class="glyphicon glyphicon-ok"></span><input type="checkbox" id="'+ key +'" value="'+ key +'">'+ key +'</label>');
    $('#preGame').fadeIn(800);
  }
}

function play(source)
{
    // Get checked options
    var checked = [];
    $('.players.active').each(function() 
    {
      checked.push($(this).text());
    });

    // Check enough players selected
    if (checked == null || checked.length < 4)
    {
      $('.container').prepend('<div class="alert alert-warning alert-dismissible" role="alert" id="messages">Select at least four players.<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button></div>');
    }
    else 
    {
      $('.alert').remove();
      // Set players and positions
      checked = shuffle(checked);
      checked = shuffle(checked);
      checked = shuffle(checked);
      players = pickPlayers(checked);

      if(source == 'main')
        $('#preGame').fadeOut('slow', renderGame);

      if(source == 'slack') 
        $('#countdown').fadeOut('slow', renderGame);
    }
}

function pickPlayers(checked) 
{
  // Make a copy of the array
  var temp = checked.slice(checked);
  var chosenPlayers = [];
  
  // Pick four player and shuffle positions
  for (var i = 0; i < 4; i++) 
  {
    var index = Math.floor(Math.random() * temp.length);
    var removed = temp.splice(index, 1);
    chosenPlayers.push(removed[0]);
  }

  return chosenPlayers;  
}

function shuffle(array) {
  var i = array.length;
  var temp; 
  var random;

  while (0 !== i) {
    random = Math.floor(Math.random() * i);
    i -= 1;
    temp = array[i];
    array[i] = array[random];
    array[random] = temp;
  }

  return array;
}

function renderGame()
{
    gamePlayed = true;

    var bAttack = players[0];
    var bDefense = players[1];
    var yAttack = players[2];
    var yDefense = players[3];

    var bRating = Math.round(( parseInt(attackRatings[bAttack]) + parseInt(defenseRatings[bDefense]) ) / 2);
    var yRating = Math.round(( parseInt(attackRatings[yAttack]) + parseInt(defenseRatings[yDefense]) ) / 2);
    
    // Setup element content
    $('#blue-attack-rating').html(attackRatings[bAttack]);
    $('#blue-defense-rating').html(defenseRatings[bDefense]);
    $('#blue-attack').html("<h3>" + bAttack + "</h3>");
    $('#blue-defense').html("<h3>" + bDefense + "</h3>");
    $('#yellow-attack-rating').html(attackRatings[yAttack]);
    $('#yellow-defense-rating').html(defenseRatings[yDefense]);
    $('#yellow-attack').html("<h3>" + yAttack + "</h3>");
    $('#yellow-defense').html("<h3>" + yDefense + "</h3>");

    // Animation sequence
    $('#blue-team').delay(1000).animate(bAnimate, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound('blue-team') } } );
    $('.blue-attack').delay(3000).animate(bAnimate, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound(players[0]+'-attack') } } );
    $('.blue-defense').delay(5000).animate(bAnimate, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound(players[1]+'-defense') } } );
    $('#versus').delay(6000).animate({top: '38%'}, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound('versus') } } );
    $('#yellow-team').delay(7000).animate(yAnimate, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound('yellow-team') } } );
    $('.yellow-attack').delay(9000).animate(yAnimate, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound(players[2]+'-attack') } } );
    $('.yellow-defense').delay(11000).animate(yAnimate, { duration: 'fast', easing: 'easeInOutCirc', complete: function() { playSound(players[3]+'-defense') } } );

    $('#game').show();

    setTimeout(
      function(){
        calculateStakes(bRating, yRating)
      }, 12000);
}

function calculateStakes(bRating, yRating)
{
  var K = 100;
  var bDiff = yRating - bRating;
  var yDiff = bRating - yRating;
  var bPercentage = 1 / ( 1 + Math.pow( 10, bDiff / 500 ) );
  var yPercentage = 1 / ( 1 + Math.pow( 10, yDiff / 500 ) );

  var bWin = Math.round( K * ( 1 - bPercentage ) );
  var bLoss = Math.round( K * ( 0 - bPercentage ) );
  var yWin = Math.round( K * ( 1 - yPercentage ) );
  var yLoss = Math.round( K * ( 0 - yPercentage ) );

  $('.stats').css('visibility','visible');
  $('.cover').fadeOut();

  newChart('#blue-win-percent-chart', '#3498db', 5000).animate(bPercentage);
  renderCount('blue-win-percent-value', Math.round( bPercentage * 100 ));
  newChart('#yellow-win-percent-chart', '#f1c40f', 5000).animate(yPercentage);
  renderCount('yellow-win-percent-value', Math.round( yPercentage * 100 ));

  renderCount('blue-win-stake-value', bWin);
  renderCount('yellow-win-stake-value', yWin);
  
  renderCount('blue-loss-stake', bLoss);
  renderCount('yellow-loss-stake', yLoss);
  
  renderCount('blue-team-rating', bRating);
  renderCount('yellow-team-rating', yRating);
  
  $('#reset-submit').delay(5000).animate({bottom: '0'}, { duration: 'slow', easing: 'easeInOutCirc' });
  $('#form-submit').delay(5000).animate({bottom: '0'}, { duration: 'slow', easing: 'easeInOutCirc' });
  $('#notes').delay(6000).animate({bottom: '6%'}, { duration: 'slow', easing: 'easeInOutCirc' });
  
  $('#blue-score').delay(7000).animate({left: '0.5%'}, { duration: 'slow', easing: 'easeInOutCirc' });
  $('#yellow-score').delay(7000).animate({right: '0.5%'}, { duration: 'slow', easing: 'easeInOutCirc' });

  setTimeout( 
    function() {
      var game = {
        "players" : players,
        "blueWin" : bPercentage,
        "yellowWin" : yPercentage
      }
      console.log(game);
      _gameStarted(game);
    }, 5000
  );
}

function playSound(soundName)
{
  var a = new Audio('audio/' + soundName.toLowerCase() + '.mp3');

  a.onerror = function() {
    if (soundName.indexOf('attack') > -1)
      playSound('attack');

    if (soundName.indexOf('defense') > -1)
      playSound('defense');
  };
  a.onloadeddata = function() {
    a.play();
  };
}

function renderCount(field, newValue) {
  if (document.getElementById(field) != null)
    new CountUp(field, 0, newValue, 0, 5, count).start();
}

function newChart(container, colour, time) {
  var bar = new ProgressBar.Circle(container, {
    easing: 'easeInOut',
    duration: time,
    strokeWidth: 6,
    trailWidth: 6,
    color: colour
  });
  return bar;
}

function submitData()
{
  var blueScore = parseInt($('#blue-score').val());
  var yellowScore = parseInt($('#yellow-score').val());
  var winner = (blueScore > yellowScore) ? 'Blue' : 'Yella';

  var result =  {
                  "blueScore" : blueScore,
                  "yellowScore" : yellowScore
                };

  _gameFinished(result);

  var q1ID = "entry.247460283";   // Winner
  var q2ID = "entry.449488357";   // Yellow Score
  var q3ID = "entry.1023685467";  // Blue Score
  var q4ID = "entry.569780061";   // Yellow Attack
  var q5ID = "entry.417127845";   // Yellow Defense
  var q6ID = "entry.855683837";   // Blue Attack
  var q7ID = "entry.1044104149";  // Blue Defense
  var q8ID = "entry.131725794";   // Notes

  var value1 = encodeURIComponent(winner);
  var value2 = encodeURIComponent(yellowScore);
  var value3 = encodeURIComponent(blueScore);
  var value4 = encodeURIComponent(players[2]);
  var value5 = encodeURIComponent(players[3]);
  var value6 = encodeURIComponent(players[0]);
  var value7 = encodeURIComponent(players[1]);
  var value8 = encodeURIComponent($('#notes').val());

  var baseURL = 'https://docs.google.com/forms/d/e/1FAIpQLScY-Gg9_PbdVVIkMYqMpJJwzoy1FVBZhAFdgoIBOmsNh4wdbQ/formResponse?';
  var submitRef = 'submit=-2582568362400525186';
  var submitURL = (baseURL + q1ID + "=" + value1 + "&" + 
                              q2ID + "=" + value2 + "&" + 
                              q3ID + "=" + value3 + "&" + 
                              q4ID + "=" + value4 + "&" + 
                              q5ID + "=" + value5 + "&" + 
                              q6ID + "=" + value6 + "&" + 
                              q7ID + "=" + value7 + "&" +
                              q8ID + "=" + value8 + "&" + submitRef);
  console.log(submitURL);
  document.getElementById('no-target').src = submitURL;
}